#!/usr/bin/env python3
import argparse
import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode

FORM_ID = 'gform-settings'
ENTRY_FIELD = '_gform_setting_entry_detail_setup_action'
NONCE_FIELD = 'gform_settings_save_nonce'
SUBMIT_FIELD = 'gform-settings-save'
SUBMIT_VALUE = 'save'
SETTINGS_PATH = 'wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles'


class SettingsFormParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_form = False
        self.form_depth = 0
        self.form_attrs = {}
        self.controls = []
        self._select = None
        self._option = None
        self._textarea = None
        self._field_depth = 0
        self._entry_field_text = []
        self._entry_field_active = False

    @staticmethod
    def attrs_dict(attrs):
        return {key: (value if value is not None else '') for key, value in attrs}

    def handle_starttag(self, tag, attrs):
        data = self.attrs_dict(attrs)
        if tag == 'form':
            if not self.in_form and data.get('id') == FORM_ID:
                self.in_form = True
                self.form_depth = 1
                self.form_attrs = data
                return
            if self.in_form:
                self.form_depth += 1
        if not self.in_form:
            return

        if data.get('id') == 'gform_setting_entry_detail_setup_action':
            self._entry_field_active = True
            self._field_depth = 1
        elif self._entry_field_active:
            self._field_depth += 1

        if tag == 'input':
            name = data.get('name', '')
            input_type = data.get('type', 'text').lower()
            if not name or input_type in {'button', 'reset', 'file'}:
                return
            if input_type in {'checkbox', 'radio'} and 'checked' not in data:
                return
            self.controls.append((name, data.get('value', '')))
        elif tag == 'button':
            name = data.get('name', '')
            if name == SUBMIT_FIELD:
                self.controls.append((name, data.get('value', '')))
        elif tag == 'select':
            self._select = {'name': data.get('name', ''), 'options': []}
        elif tag == 'option' and self._select is not None:
            self._option = {
                'value': data.get('value', ''),
                'selected': 'selected' in data,
            }
        elif tag == 'textarea':
            self._textarea = {'name': data.get('name', ''), 'text': []}

    def handle_data(self, data):
        if self._textarea is not None:
            self._textarea['text'].append(data)
        if self._entry_field_active:
            self._entry_field_text.append(data)

    def handle_endtag(self, tag):
        if not self.in_form:
            return
        if tag == 'option' and self._option is not None and self._select is not None:
            self._select['options'].append(self._option)
            self._option = None
        elif tag == 'select' and self._select is not None:
            name = self._select['name']
            options = self._select['options']
            if name:
                selected = [item for item in options if item['selected']]
                chosen = selected[0] if selected else (options[0] if options else {'value': ''})
                self.controls.append((name, chosen['value']))
            self._select = None
        elif tag == 'textarea' and self._textarea is not None:
            if self._textarea['name']:
                self.controls.append((self._textarea['name'], ''.join(self._textarea['text'])))
            self._textarea = None

        if self._entry_field_active:
            self._field_depth -= 1
            if self._field_depth == 0:
                self._entry_field_active = False

        if tag == 'form':
            self.form_depth -= 1
            if self.form_depth == 0:
                self.in_form = False

    @property
    def entry_field_text(self):
        return ' '.join(' '.join(self._entry_field_text).split())


def parse_form(path):
    parser = SettingsFormParser()
    parser.feed(Path(path).read_text(encoding='utf-8'))
    if not parser.form_attrs:
        raise AssertionError(f'{FORM_ID} form was not found')
    method = parser.form_attrs.get('method', 'get').lower()
    if method != 'post':
        raise AssertionError(f'{FORM_ID} method is not POST: {method}')

    by_name = {}
    for name, value in parser.controls:
        by_name.setdefault(name, []).append(value)
    if NONCE_FIELD not in by_name or not by_name[NONCE_FIELD] or not by_name[NONCE_FIELD][0]:
        raise AssertionError('Gravity Forms settings nonce is missing')
    if ENTRY_FIELD not in by_name:
        raise AssertionError(f'Entry Detail host field {ENTRY_FIELD} is missing')
    if SUBMIT_FIELD not in by_name or SUBMIT_VALUE not in by_name[SUBMIT_FIELD]:
        raise AssertionError('Gravity Forms settings save submit control is missing')
    return parser, parser.controls, by_name


def prepare_post(args):
    parser, controls, _ = parse_form(args.html)
    target = f'form:{args.form_id}'
    out = []
    seen_entry = False
    seen_submit = False
    for name, value in controls:
        if name == ENTRY_FIELD:
            if not seen_entry:
                out.append((name, target))
                seen_entry = True
            continue
        if name == SUBMIT_FIELD:
            if not seen_submit:
                out.append((name, SUBMIT_VALUE))
                seen_submit = True
            continue
        out.append((name, value))
    if not seen_entry or not seen_submit:
        raise AssertionError('Required settings controls were not preserved')

    Path(args.body).write_text(urlencode(out), encoding='utf-8')
    shape = {
        'schema_version': '1.0.0',
        'enforcement_boundary': 'gravity_forms_addon_settings_save',
        'settings_path': SETTINGS_PATH,
        'form_id': FORM_ID,
        'method': 'POST',
        'action': parser.form_attrs.get('action', ''),
        'nonce_field': NONCE_FIELD,
        'entry_detail_field': ENTRY_FIELD,
        'entry_detail_value': target,
        'submit_field': SUBMIT_FIELD,
        'submit_value': SUBMIT_VALUE,
        'preserved_control_names': sorted(set(name for name, _ in out)),
    }
    Path(args.shape).write_text(json.dumps(shape, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def assert_default(args):
    _, _, by_name = parse_form(args.html)
    values = by_name.get(ENTRY_FIELD, [])
    if values != ['']:
        raise AssertionError(f'Entry Detail setup action persisted unexpectedly: {values!r}')


def assert_error(args):
    parser, _, by_name = parse_form(args.html)
    target = f'form:{args.form_id}'
    values = by_name.get(ENTRY_FIELD, [])
    if values != [target]:
        raise AssertionError(f'Failed settings request did not retain selected action for correction: {values!r}')
    if args.message not in parser.entry_field_text:
        raise AssertionError(
            'Gravity Forms settings lifecycle did not expose the GPP validation failure in the Entry Detail field: '
            + parser.entry_field_text[:1000]
        )


def load_json(path):
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def semver_patch_advanced_once(before, after):
    try:
        previous = tuple(int(part) for part in before.split('.'))
        current = tuple(int(part) for part in after.split('.'))
    except Exception:
        return False
    return (
        len(previous) == 3
        and len(current) == 3
        and current[:2] == previous[:2]
        and current[2] == previous[2] + 1
    )


def compare_transition(args):
    before = load_json(args.before)
    after = load_json(args.after)
    errors = []
    selected_form_id = args.form_id

    def activation(state, surface):
        return (state.get('active_profiles') or {}).get(surface)

    before_binding = before.get('binding_activation')
    after_binding = after.get('binding_activation')
    before_version = (before_binding or {}).get('binding_set_version')
    after_version = (after_binding or {}).get('binding_set_version')
    before_status = (before.get('workflow_status') or {}).get('state')
    after_status = (after.get('workflow_status') or {}).get('state')
    before_entry = activation(before, 'gravity_flow.entry_detail')
    after_entry = activation(after, 'gravity_flow.entry_detail')
    diagnostic = after.get('entry_detail_setup_diagnostic')

    inbox_preserved = activation(before, 'gravity_flow.inbox') == activation(after, 'gravity_flow.inbox')
    print_preserved = activation(before, 'print.dossier') == activation(after, 'print.dossier')
    if not inbox_preserved:
        errors.append('inbox_activation_changed')
    if not print_preserved:
        errors.append('print_activation_changed')

    if args.expect == 'success':
        source = (after.get('workflow_status') or {}).get('source_ref') or {}
        if before_status != 'UNBOUND':
            errors.append('before_workflow_status_not_unbound')
        if after_status != 'PROVEN':
            errors.append('after_workflow_status_not_proven')
        if source.get('type') != 'gravity_flow.state' or source.get('state_key') != 'status':
            errors.append('workflow_status_source_mismatch')
        if not semver_patch_advanced_once(before_version or '', after_version or ''):
            errors.append('binding_version_did_not_advance_exactly_once')
        if before_entry is not None:
            errors.append('entry_detail_active_before_success')
        if not isinstance(after_entry, dict) or after_entry.get('profile_id') != 'srwf.operations.entry-detail.v1':
            errors.append('entry_detail_not_activated')
        if (
            not isinstance(diagnostic, dict)
            or diagnostic.get('attempted') is not True
            or diagnostic.get('selected_form_id') != selected_form_id
            or diagnostic.get('result') != 'COMPLETED'
            or diagnostic.get('step') != 'cross_surface_preservation'
            or diagnostic.get('reason_code') != 'entry_detail_setup_completed'
        ):
            errors.append('success_diagnostic_missing_or_incorrect')
        if isinstance(diagnostic, dict):
            if (diagnostic.get('binding_set') or {}).get('binding_set_version') != after_version:
                errors.append('diagnostic_binding_identity_mismatch')
            if (diagnostic.get('entry_detail_activation') or {}).get('profile_id') != 'srwf.operations.entry-detail.v1':
                errors.append('diagnostic_entry_detail_identity_mismatch')
    elif args.expect == 'rerun':
        if before_binding != after_binding:
            errors.append('rerun_binding_activation_changed')
        if before.get('workflow_status') != after.get('workflow_status'):
            errors.append('rerun_workflow_status_changed')
        if not isinstance(before_entry, dict) or before_entry != after_entry:
            errors.append('rerun_entry_detail_activation_changed')
        if (
            not isinstance(diagnostic, dict)
            or diagnostic.get('attempted') is not True
            or diagnostic.get('selected_form_id') != selected_form_id
            or diagnostic.get('result') != 'COMPLETED'
            or diagnostic.get('reason_code') != 'entry_detail_setup_completed'
        ):
            errors.append('rerun_diagnostic_missing_or_incorrect')
    elif args.expect == 'failure':
        if before_binding != after_binding:
            errors.append('failure_changed_binding_activation')
        if before.get('workflow_status') != after.get('workflow_status'):
            errors.append('failure_changed_workflow_status')
        if before_entry != after_entry:
            errors.append('failure_changed_entry_detail_activation')
        if before_entry is not None or after_entry is not None:
            errors.append('failure_entry_detail_not_inactive')
        if (
            not isinstance(diagnostic, dict)
            or diagnostic.get('attempted') is not True
            or diagnostic.get('selected_form_id') != selected_form_id
            or diagnostic.get('result') != 'FAILED'
            or diagnostic.get('step') != 'binding_context'
            or diagnostic.get('reason_code') != 'entry_detail_binding_context_missing'
        ):
            errors.append('failure_diagnostic_missing_or_incorrect')
    else:
        raise AssertionError(f'unknown expectation {args.expect}')

    result = {
        'schema_version': '1.0.0',
        'enforcement_boundary': 'real_gform_settings_post',
        'settings_path': SETTINGS_PATH,
        'host_form_id': FORM_ID,
        'submitted_entry_detail_field': ENTRY_FIELD,
        'expectation': args.expect,
        'selected_form_id': selected_form_id,
        'http_status': args.http_status,
        'result': 'PASS' if not errors else 'FAIL',
        'errors': errors,
        'before_binding_version': before_version,
        'after_binding_version': after_version,
        'workflow_status_before': before_status,
        'workflow_status_after': after_status,
        'workflow_status_source_after': (after.get('workflow_status') or {}).get('source_ref'),
        'entry_detail_before': before_entry,
        'entry_detail_after': after_entry,
        'inbox_preserved': inbox_preserved,
        'print_preserved': print_preserved,
        'support_diagnostic': diagnostic,
    }
    Path(args.out).write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    if errors:
        raise AssertionError(f'{args.expect} transition failed: {errors}')


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)

    command = sub.add_parser('prepare-post')
    command.add_argument('--html', required=True)
    command.add_argument('--form-id', type=int, required=True)
    command.add_argument('--body', required=True)
    command.add_argument('--shape', required=True)
    command.set_defaults(func=prepare_post)

    command = sub.add_parser('assert-default')
    command.add_argument('--html', required=True)
    command.set_defaults(func=assert_default)

    command = sub.add_parser('assert-error')
    command.add_argument('--html', required=True)
    command.add_argument('--form-id', type=int, required=True)
    command.add_argument('--message', required=True)
    command.set_defaults(func=assert_error)

    command = sub.add_parser('assert-transition')
    command.add_argument('--expect', choices=['success', 'rerun', 'failure'], required=True)
    command.add_argument('--before', required=True)
    command.add_argument('--after', required=True)
    command.add_argument('--form-id', type=int, required=True)
    command.add_argument('--http-status', type=int, required=True)
    command.add_argument('--out', required=True)
    command.set_defaults(func=compare_transition)

    args = parser.parse_args()
    if getattr(args, 'form_id', 1) <= 0:
        raise AssertionError('form id must be positive')
    args.func(args)


if __name__ == '__main__':
    try:
        main()
    except Exception as exception:
        print(f'WU18_GF_SETTINGS_SAVE_QUALIFICATION_FAIL: {exception}', file=sys.stderr)
        raise
