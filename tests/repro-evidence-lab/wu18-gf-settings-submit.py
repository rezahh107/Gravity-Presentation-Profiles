#!/usr/bin/env python3
import argparse
import http.cookiejar
import json
import os
import pathlib
import subprocess
import urllib.parse
import urllib.request
from html.parser import HTMLParser

ENTRY_FIELD = '_gform_setting_entry_detail_setup_action'
SAVE_FIELD = 'gform-settings-save'
NONCE_FIELD = 'gform_settings_save_nonce'
REFERER_FIELD = '_wp_http_referer'
FORM_ID = 'gform-settings'
FAILURE_MESSAGE = 'No active EnvironmentBindingSet exists for the selected form.'
EXPECTED_PROFILE = 'srwf.operations.entry-detail.v1'


class SettingsFormParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_form = False
        self.form = None
        self.controls = []
        self.current_select = None
        self.current_textarea = None
        self.current_option = None

    @staticmethod
    def attrs_dict(attrs):
        return {key: (value if value is not None else '') for key, value in attrs}

    def handle_starttag(self, tag, attrs):
        attributes = self.attrs_dict(attrs)
        if tag == 'form':
            if not self.in_form and attributes.get('id') == FORM_ID:
                self.in_form = True
                self.form = {
                    'method': (attributes.get('method') or 'get').lower(),
                    'action': attributes.get('action') or '',
                }
            return
        if not self.in_form:
            return
        if tag == 'input':
            self.controls.append(('input', attributes, None))
        elif tag == 'button':
            self.controls.append(('button', attributes, None))
        elif tag == 'textarea':
            self.current_textarea = {'attrs': attributes, 'text': []}
        elif tag == 'select':
            self.current_select = {'attrs': attributes, 'options': []}
        elif tag == 'option' and self.current_select is not None:
            self.current_option = {'attrs': attributes, 'text': []}

    def handle_data(self, data):
        if self.current_option is not None:
            self.current_option['text'].append(data)
        elif self.current_textarea is not None:
            self.current_textarea['text'].append(data)

    def handle_endtag(self, tag):
        if not self.in_form:
            return
        if tag == 'option' and self.current_option is not None and self.current_select is not None:
            option = self.current_option
            option['text'] = ''.join(option['text'])
            self.current_select['options'].append(option)
            self.current_option = None
        elif tag == 'select' and self.current_select is not None:
            self.controls.append(('select', self.current_select['attrs'], self.current_select['options']))
            self.current_select = None
        elif tag == 'textarea' and self.current_textarea is not None:
            self.controls.append(('textarea', self.current_textarea['attrs'], ''.join(self.current_textarea['text'])))
            self.current_textarea = None
        elif tag == 'form':
            self.in_form = False


def parse_settings_form(html):
    parser = SettingsFormParser()
    parser.feed(html)
    if parser.form is None:
        raise RuntimeError(f'Authentic #{FORM_ID} form was not found.')
    if parser.form['method'] != 'post':
        raise RuntimeError(f'Authentic #{FORM_ID} form is not POST.')
    return parser.form, parser.controls


def selected_values(options):
    enabled = [option for option in options if 'disabled' not in option['attrs']]
    chosen = [option for option in enabled if 'selected' in option['attrs']]
    if not chosen and enabled:
        chosen = [enabled[0]]
    return [
        option['attrs'].get('value') if 'value' in option['attrs'] else option['text']
        for option in chosen
    ]


def successful_controls(controls, form_id):
    pairs = []
    seen = set()
    field_initial = None
    nonce_present = False
    referer_present = False
    save_button_present = False

    for kind, attrs, extra in controls:
        if 'disabled' in attrs:
            continue
        name = attrs.get('name')
        if not name:
            continue
        seen.add(name)
        nonce_present = nonce_present or name == NONCE_FIELD
        referer_present = referer_present or name == REFERER_FIELD

        if kind == 'input':
            input_type = (attrs.get('type') or 'text').lower()
            if input_type in {'submit', 'button', 'reset', 'image', 'file'}:
                continue
            if input_type in {'checkbox', 'radio'} and 'checked' not in attrs:
                continue
            pairs.append((name, attrs.get('value', '')))
        elif kind == 'textarea':
            pairs.append((name, extra or ''))
        elif kind == 'select':
            values = selected_values(extra or [])
            if name == ENTRY_FIELD:
                field_initial = values[0] if values else ''
                values = [f'form:{form_id}']
            for value in values:
                pairs.append((name, value))
        elif kind == 'button':
            button_type = (attrs.get('type') or 'submit').lower()
            if name == SAVE_FIELD and button_type == 'submit' and attrs.get('value') == 'save':
                save_button_present = True

    if ENTRY_FIELD not in seen:
        raise RuntimeError(f'Authentic Entry Detail field {ENTRY_FIELD} was not found.')
    if not nonce_present or not referer_present:
        raise RuntimeError('Authentic Gravity Forms settings nonce/referer fields are missing.')
    if not save_button_present:
        raise RuntimeError('Authentic Gravity Forms settings save button was not found.')

    pairs.append((SAVE_FIELD, 'save'))
    return pairs, field_initial


def selected_entry_value(html):
    _, controls = parse_settings_form(html)
    for kind, attrs, extra in controls:
        if kind == 'select' and attrs.get('name') == ENTRY_FIELD:
            values = selected_values(extra or [])
            return values[0] if values else ''
    raise RuntimeError(f'Entry Detail field {ENTRY_FIELD} disappeared after save.')


def opener_from_cookiejar(path):
    jar = http.cookiejar.MozillaCookieJar(path)
    jar.load(ignore_discard=True, ignore_expires=True)
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar


def request_text(opener, request):
    with opener.open(request, timeout=30) as response:
        return (
            response.status,
            response.geturl(),
            response.read().decode('utf-8', errors='replace'),
            dict(response.headers.items()),
        )


def capture_state(label, form_id, artifact_dir):
    wp_cli = os.environ.get('WU21_WP_CLI')
    wp_path = os.environ.get('WU21_WP_PATH')
    workspace = os.environ.get('GITHUB_WORKSPACE')
    if not wp_cli or not wp_path or not workspace:
        raise RuntimeError('WU18 state capture requires WU21_WP_CLI, WU21_WP_PATH and GITHUB_WORKSPACE.')

    env = os.environ.copy()
    env['WU18_SETUP_STATE_LABEL'] = label
    env['WU18_SETUP_FORM_ID_OVERRIDE'] = str(form_id)
    command = [
        'php',
        wp_cli,
        f'--path={wp_path}',
        'eval-file',
        str(pathlib.Path(workspace) / 'tests/repro-evidence-lab/wu18-entry-detail-setup-state.php'),
    ]
    process = subprocess.run(command, env=env, text=True, capture_output=True)
    if process.returncode != 0:
        raise RuntimeError(f'WU18 state capture failed: {process.stdout}\n{process.stderr}')

    state_file = pathlib.Path(artifact_dir) / f'wu18-entry-detail-setup-{label}.json'
    if not state_file.exists():
        raise RuntimeError(f'WU18 state artifact missing: {state_file}')
    return json.loads(state_file.read_text(encoding='utf-8'))


def profile(state, surface):
    return (state.get('active_profiles') or {}).get(surface)


def evaluate_transition(expect, form_id, before, after, request_meta):
    errors = []
    before_binding = before.get('binding_activation')
    after_binding = after.get('binding_activation')
    before_status = (before.get('workflow_status') or {}).get('state')
    after_status = (after.get('workflow_status') or {}).get('state')
    before_version = (before_binding or {}).get('binding_set_version')
    after_version = (after_binding or {}).get('binding_set_version')
    before_versions = before.get('binding_installed_versions') or []
    after_versions = after.get('binding_installed_versions') or []
    before_entry = profile(before, 'gravity_flow.entry_detail')
    after_entry = profile(after, 'gravity_flow.entry_detail')
    diagnostic = after.get('entry_detail_setup_diagnostic')

    for surface in ('gravity_flow.inbox', 'print.dossier'):
        if profile(before, surface) != profile(after, surface):
            errors.append(surface.replace('.', '_') + '_activation_changed')

    if request_meta.get('enforcement_boundary') != 'gravity_forms_addon_settings_save':
        errors.append('real_settings_save_boundary_not_exercised')
    if request_meta.get('submitted_entry_detail_field_name') != ENTRY_FIELD:
        errors.append('entry_detail_field_name_mismatch')
    if request_meta.get('submitted_entry_detail_value') != f'form:{form_id}':
        errors.append('entry_detail_submitted_value_mismatch')

    if expect == 'failure':
        if before_binding != after_binding:
            errors.append('failure_changed_binding_activation')
        if before.get('workflow_status') != after.get('workflow_status'):
            errors.append('failure_changed_workflow_status')
        if before_entry is not None or after_entry is not None:
            errors.append('failure_entry_detail_not_inactive')
        if before_versions != after_versions:
            errors.append('failure_changed_installed_binding_versions')
        if request_meta.get('post_http_status') != 200:
            errors.append('failure_settings_response_not_200')
        if not request_meta.get('host_validation_failure_visible'):
            errors.append('failure_not_exposed_by_host_settings_lifecycle')
        if (
            not isinstance(diagnostic, dict)
            or diagnostic.get('attempted') is not True
            or diagnostic.get('selected_form_id') != form_id
            or diagnostic.get('result') != 'FAILED'
            or diagnostic.get('step') != 'binding_context'
            or diagnostic.get('reason_code') != 'entry_detail_binding_context_missing'
        ):
            errors.append('failure_diagnostic_missing_or_incorrect')
    elif expect == 'success':
        source = (after.get('workflow_status') or {}).get('source_ref')
        if before_status != 'UNBOUND':
            errors.append('before_workflow_status_not_unbound')
        if after_status != 'PROVEN':
            errors.append('after_workflow_status_not_proven')
        if not isinstance(source, dict) or source.get('type') != 'gravity_flow.state' or source.get('state_key') != 'status':
            errors.append('workflow_status_source_mismatch')
        if not before_version or not after_version or before_version == after_version:
            errors.append('binding_version_did_not_advance')
        if len(after_versions) != len(before_versions) + 1:
            errors.append('binding_version_did_not_advance_exactly_once')
        if before_entry is not None:
            errors.append('entry_detail_was_active_before_setup')
        if not isinstance(after_entry, dict) or after_entry.get('profile_id') != EXPECTED_PROFILE:
            errors.append('entry_detail_not_activated')
        if not request_meta.get('transient_field_reset'):
            errors.append('entry_detail_setup_field_persisted')
        if (
            not isinstance(diagnostic, dict)
            or diagnostic.get('attempted') is not True
            or diagnostic.get('selected_form_id') != form_id
            or diagnostic.get('result') != 'COMPLETED'
            or diagnostic.get('step') != 'cross_surface_preservation'
            or diagnostic.get('reason_code') != 'entry_detail_setup_completed'
        ):
            errors.append('success_diagnostic_missing_or_incorrect')
        if isinstance(diagnostic, dict):
            if (diagnostic.get('binding_set') or {}).get('binding_set_version') != after_version:
                errors.append('diagnostic_binding_identity_mismatch')
            if (diagnostic.get('entry_detail_activation') or {}).get('profile_id') != EXPECTED_PROFILE:
                errors.append('diagnostic_activation_identity_mismatch')
    else:
        if before_status != 'PROVEN' or after_status != 'PROVEN':
            errors.append('rerun_workflow_status_not_proven')
        if before_binding != after_binding:
            errors.append('rerun_binding_activation_changed')
        if before.get('workflow_status') != after.get('workflow_status'):
            errors.append('rerun_workflow_status_changed')
        if before_versions != after_versions:
            errors.append('rerun_installed_binding_versions_changed')
        if not isinstance(before_entry, dict) or before_entry != after_entry:
            errors.append('rerun_entry_detail_activation_changed')
        if not request_meta.get('transient_field_reset'):
            errors.append('rerun_entry_detail_setup_field_persisted')
        if (
            not isinstance(diagnostic, dict)
            or diagnostic.get('attempted') is not True
            or diagnostic.get('selected_form_id') != form_id
            or diagnostic.get('result') != 'COMPLETED'
            or diagnostic.get('reason_code') != 'entry_detail_setup_completed'
        ):
            errors.append('rerun_diagnostic_missing_or_incorrect')

    return {
        'schema_version': '2.0.0',
        'expectation': expect,
        'selected_form_id': form_id,
        'enforcement_boundary': 'real_gform_settings_post',
        'request_path': 'wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles',
        'submitted_entry_detail_field_name': ENTRY_FIELD,
        'result': 'PASS' if not errors else 'FAIL',
        'errors': errors,
        'before_binding_version': before_version,
        'after_binding_version': after_version,
        'binding_installed_versions_before': before_versions,
        'binding_installed_versions_after': after_versions,
        'workflow_status_before': before_status,
        'workflow_status_after': after_status,
        'entry_detail_before': before_entry,
        'entry_detail_after': after_entry,
        'inbox_preserved': profile(before, 'gravity_flow.inbox') == profile(after, 'gravity_flow.inbox'),
        'print_preserved': profile(before, 'print.dossier') == profile(after, 'print.dossier'),
        'transient_field_reset': request_meta.get('transient_field_reset'),
        'host_validation_failure_visible': request_meta.get('host_validation_failure_visible'),
        'support_diagnostic': diagnostic,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--cookie-jar', required=True)
    parser.add_argument('--form-id', required=True, type=int)
    parser.add_argument('--expect', required=True, choices=['failure', 'success', 'rerun'])
    parser.add_argument('--artifact-dir', required=True)
    args = parser.parse_args()
    if args.form_id <= 0:
        raise SystemExit('form-id must be positive')

    artifact_dir = pathlib.Path(args.artifact_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    prefix = f'wu18-settings-save-{args.expect}'
    before = capture_state(f'settings-{args.expect}-before', args.form_id, artifact_dir)

    opener, jar = opener_from_cookiejar(args.cookie_jar)
    status_before, before_url, before_html, _ = request_text(
        opener,
        urllib.request.Request(args.url, headers={'User-Agent': 'GPP-WU18-settings-save-qualification/1.0'}),
    )
    if status_before != 200 or 'wp-login.php' in before_url:
        raise RuntimeError(f'Authenticated settings GET failed: status={status_before} url={before_url}')

    form, controls = parse_settings_form(before_html)
    pairs, initial_value = successful_controls(controls, args.form_id)
    post_url = urllib.parse.urljoin(args.url, form['action'] or args.url)
    body = urllib.parse.urlencode(pairs, doseq=True).encode('utf-8')
    post_status, post_final_url, response_html, response_headers = request_text(
        opener,
        urllib.request.Request(
            post_url,
            data=body,
            method='POST',
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': args.url,
                'User-Agent': 'GPP-WU18-settings-save-qualification/1.0',
            },
        ),
    )

    reload_status, reload_url, reload_html, _ = request_text(
        opener,
        urllib.request.Request(args.url, headers={'User-Agent': 'GPP-WU18-settings-save-qualification/1.0'}),
    )
    if reload_status != 200 or 'wp-login.php' in reload_url:
        raise RuntimeError(f'Authenticated settings reload failed: status={reload_status} url={reload_url}')
    reloaded_value = selected_entry_value(reload_html)

    (artifact_dir / f'{prefix}-before.html').write_text(before_html, encoding='utf-8')
    (artifact_dir / f'{prefix}-response.html').write_text(response_html, encoding='utf-8')
    (artifact_dir / f'{prefix}-reload.html').write_text(reload_html, encoding='utf-8')

    metadata = {
        'schema_version': '1.0.0',
        'expectation': args.expect,
        'enforcement_boundary': 'gravity_forms_addon_settings_save',
        'settings_url_path': urllib.parse.urlsplit(args.url).path,
        'settings_url_query': urllib.parse.urlsplit(args.url).query,
        'form_id_attribute': FORM_ID,
        'form_method': form['method'],
        'form_action': form['action'],
        'submitted_entry_detail_field_name': ENTRY_FIELD,
        'submitted_entry_detail_value': f'form:{args.form_id}',
        'host_nonce_field_present': True,
        'host_referer_field_present': True,
        'host_save_field': SAVE_FIELD,
        'initial_entry_detail_value': initial_value,
        'post_http_status': post_status,
        'post_final_url_path': urllib.parse.urlsplit(post_final_url).path,
        'post_final_url_query': urllib.parse.urlsplit(post_final_url).query,
        'reload_http_status': reload_status,
        'reloaded_entry_detail_value': reloaded_value,
        'transient_field_reset': reloaded_value == '',
        'host_validation_failure_visible': FAILURE_MESSAGE in response_html,
        'response_has_settings_form': f'id="{FORM_ID}"' in response_html or f"id='{FORM_ID}'" in response_html,
        'response_content_type': response_headers.get('Content-Type', ''),
        'cookie_count_used': len(list(jar)),
    }
    (artifact_dir / f'{prefix}-request.json').write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + '\n',
        encoding='utf-8',
    )

    after = capture_state(f'settings-{args.expect}-after', args.form_id, artifact_dir)
    transition = evaluate_transition(args.expect, args.form_id, before, after, metadata)
    (artifact_dir / f'{prefix}-transition.json').write_text(
        json.dumps(transition, indent=2, sort_keys=True) + '\n',
        encoding='utf-8',
    )
    print(json.dumps({'request': metadata, 'transition': transition}, sort_keys=True))
    if transition['result'] != 'PASS':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
