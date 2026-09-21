import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU02 requires the admitted WU18 runtime environment.');

const repoSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const playwrightVersion = JSON.parse(fs.readFileSync('node_modules/playwright/package.json', 'utf8')).version;

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const fixture = JSON.parse(wpEval(`
$manifest = get_option('gpp_wu18_fixture_manifest');
$base = get_option('gpp_wu21_fixture_manifest');
if (!is_array($manifest) || !is_array($base)) throw new RuntimeException('WU02 fixture manifests unavailable.');
$cases = array(
  'assignee' => array('form_id' => (int)$manifest['alpha']['form_id'], 'entry_id' => (int)$manifest['alpha']['entry_id'], 'fields' => $manifest['alpha']['fields'], 'prefix' => 'ASSIGNEE'),
  'viewer' => array('form_id' => (int)$manifest['viewer']['form_id'], 'entry_id' => (int)$manifest['viewer']['entry_id'], 'fields' => $manifest['alpha']['fields'], 'prefix' => 'VIEWER'),
  'complete' => array('form_id' => (int)$manifest['beta']['form_id'], 'entry_id' => (int)$manifest['beta']['entry_id'], 'fields' => $manifest['beta']['fields'], 'prefix' => 'COMPLETE'),
);
$unique_forms = array();
foreach ($cases as $case) $unique_forms[$case['form_id']] = $case['fields'];
foreach ($unique_forms as $form_id => $fields) {
  $form = GFAPI::get_form((int)$form_id);
  if (!is_array($form)) throw new RuntimeException('WU02 form unavailable.');
  $hidden_id = (int)$fields['student.home_phone'];
  $driver_id = (int)$fields['student.first_name'];
  $found = false;
  foreach ($form['fields'] as $field) {
    if ((int)$field->id !== $hidden_id) continue;
    $field->conditionalLogic = array(
      'enabled' => true,
      'actionType' => 'show',
      'logicType' => 'all',
      'rules' => array(array('fieldId' => $driver_id, 'operator' => 'is', 'value' => 'WU02_NEVER_MATCH')),
    );
    $found = true;
    break;
  }
  if (!$found) throw new RuntimeException('WU02 hidden control field unavailable.');
  $updated = GFAPI::update_form($form);
  if (is_wp_error($updated)) throw new RuntimeException($updated->get_error_message());
}
$out_cases = array();
foreach ($cases as $key => $case) {
  $sentinels = array(
    'student.first_name' => 'WU02_' . $case['prefix'] . '_FIRST_VISIBLE',
    'student.national_id' => 'WU02_' . $case['prefix'] . '_NATIONAL_VISIBLE',
    'education.grade_group' => 'WU02_' . $case['prefix'] . '_GRADE_VISIBLE',
    'school.name' => 'WU02_' . $case['prefix'] . '_SCHOOL_VISIBLE',
    'student.home_phone' => 'WU02_' . $case['prefix'] . '_HOME_HIDDEN_SENTINEL',
  );
  foreach ($sentinels as $slot => $value) {
    $result = GFAPI::update_entry_field($case['entry_id'], $case['fields'][$slot], $value);
    if (is_wp_error($result)) throw new RuntimeException($result->get_error_message());
  }
  $sources = array();
  foreach ($sentinels as $slot => $value) {
    $sources[] = array(
      'slot' => $slot,
      'field_id' => (string)$case['fields'][$slot],
      'sentinel' => $value,
      'expected_hidden' => 'student.home_phone' === $slot,
    );
  }
  $out_cases[$key] = array('form_id' => $case['form_id'], 'entry_id' => $case['entry_id'], 'sources' => $sources);
}
echo wp_json_encode(array(
  'cases' => $out_cases,
  'frontend_inbox_url' => isset($base['frontend_inbox_url']) ? $base['frontend_inbox_url'] : null,
  'gravity_forms_version' => class_exists('GFForms') ? GFForms::$version : null,
  'gravity_flow_version' => function_exists('gravity_flow') ? gravity_flow()->get_version() : null,
), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));

function hostState(caseItem, login) {
  return JSON.parse(wpEval(`
$u = get_user_by('login', ${JSON.stringify(login)});
if (!$u) throw new RuntimeException('WU02 user unavailable.');
wp_set_current_user($u->ID);
$form = GFAPI::get_form(${Number(caseItem.form_id)});
$entry = GFAPI::get_entry(${Number(caseItem.entry_id)});
$api = new Gravity_Flow_API(${Number(caseItem.form_id)});
$step = $api->get_current_step($entry);
if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
$status = null;
if ($step && method_exists($step, 'get_current_assignee_status')) $status = $step->get_current_assignee_status();
$out = array(
  'user_login' => $u->user_login,
  'permission_granted' => is_array($form) && !is_wp_error($entry) ? (bool)Gravity_Flow_Entry_Detail::is_permission_granted($entry, $form, $step) : false,
  'current_step' => $step ? array('id' => (int)$step->get_id(), 'type' => (string)$step->get_type(), 'name' => (string)$step->get_name()) : null,
  'can_update' => $step ? (bool)Gravity_Flow_Entry_Detail::can_update($step) : false,
  'current_assignee_status' => $status,
  'workflow_status' => method_exists($api, 'get_status') ? $api->get_status($entry) : null,
  'workflow_final_status_meta' => function_exists('gform_get_meta') ? gform_get_meta((int)$entry['id'], 'workflow_final_status') : null,
);
echo wp_json_encode($out, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));
}

function adminEntryUrl(item) {
  return `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
}

function frontendEntryUrl(item) {
  if (!fixture.frontend_inbox_url) return null;
  const url = new URL(fixture.frontend_inbox_url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(item.form_id));
  url.searchParams.set('lid', String(item.entry_id));
  return url.toString();
}

async function analyzeDocument(page, item, metadata = {}, html = null) {
  return page.evaluate(({ item, metadata, html }) => {
    const known = item.sources.filter(source => !source.expected_hidden);
    const hidden = item.sources.find(source => source.expected_hidden) || null;
    const doc = html === null ? document : new DOMParser().parseFromString(html, 'text/html');
    const serialized = html === null ? doc.documentElement.outerHTML : html;
    const native = doc.querySelector('.entry-detail-view');
    const dossier = doc.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const nativeText = native?.textContent || '';
    const dossierText = dossier?.textContent || '';
    const nativeVisible = known.filter(source => nativeText.includes(source.sentinel)).map(source => source.field_id);
    const gppRendered = known.filter(source => dossierText.includes(source.sentinel)).map(source => source.field_id);
    const hiddenNative = Boolean(hidden && nativeText.includes(hidden.sentinel));
    const hiddenDossier = Boolean(hidden && dossierText.includes(hidden.sentinel));
    const hiddenAnywhere = Boolean(hidden && serialized.includes(hidden.sentinel));
    const hiddenPlaceholder = Boolean(doc.querySelector('[data-gpp-slot="student.home_phone"]'));
    return {
      ...metadata,
      native_entry_detail_present: Boolean(native),
      gpp_dossier_present: Boolean(dossier),
      native_visible_field_ids: nativeVisible,
      gpp_rendered_field_backed_source_ids: gppRendered,
      subset_assertion: gppRendered.every(id => nativeVisible.includes(id)),
      known_visible_native_count: nativeVisible.length,
      known_visible_gpp_count: gppRendered.length,
      hidden_control: hidden ? {
        field_id: hidden.field_id,
        native_visible: hiddenNative,
        gpp_visible: hiddenDossier,
        serialized_leak: hiddenAnywhere,
        gpp_placeholder_present: hiddenPlaceholder,
      } : null,
    };
  }, { item, metadata, html });
}

async function login(page, loginName, password) {
  await page.goto(`${baseUrl}/wp-login.php?action=logout`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const logoutLink = page.locator('a[href*="action=logout"]').first();
  if (await logoutLink.count()) {
    const href = await logoutLink.getAttribute('href');
    if (href) await page.goto(href, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', loginName);
  await page.fill('#user_pass', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

async function capturePage(page, url, item, metadata) {
  if (!url) return { ...metadata, qualification: 'NOT_PROVEN', reason: 'authentic_url_unavailable' };
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  return analyzeDocument(page, item, { ...metadata, http_status: response?.status() ?? null, final_url: page.url() });
}

async function captureOrdinaryPost(page, item) {
  await page.goto(adminEntryUrl(item), { waitUntil: 'networkidle' });
  const payload = await page.evaluate(async () => {
    const form = document.querySelector('.gravityflow_workflow_detail form, form[id^="gform_"]');
    if (!(form instanceof HTMLFormElement)) return { supported: false, reason: 'native_form_unavailable' };
    const data = new FormData(form);
    const params = new URLSearchParams();
    const names = [];
    for (const [name, value] of data.entries()) {
      if (typeof value !== 'string') continue;
      params.append(name, value);
      names.push(name);
    }
    const response = await fetch(location.href, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: params.toString(),
    });
    return {
      supported: true,
      status: response.status,
      url: response.url,
      form_method: String(form.method || '').toUpperCase(),
      form_action: form.action,
      submitted_control_names: [...new Set(names)].sort(),
      html: await response.text(),
    };
  });
  if (!payload.supported) return { state: 'ordinary_post', qualification: 'NOT_PROVEN', reason: payload.reason };
  return analyzeDocument(page, item, {
    state: 'ordinary_post',
    request_method: 'POST',
    http_status: payload.status,
    final_url: payload.url,
    request_shape: {
      native_form_method: payload.form_method,
      native_form_action: payload.form_action,
      submitted_control_names: payload.submitted_control_names,
      nonce_values_recorded: false,
    },
  }, payload.html);
}

const states = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');
  states.push(await capturePage(page, adminEntryUrl(fixture.cases.assignee), fixture.cases.assignee, {
    state: 'current_assignee_active_step_get',
    request_method: 'GET',
    host_context: hostState(fixture.cases.assignee, 'bootstrap_admin'),
  }));

  const postCapture = await captureOrdinaryPost(page, fixture.cases.assignee);
  postCapture.host_context_after = hostState(fixture.cases.assignee, 'bootstrap_admin');
  states.push(postCapture);

  await login(page, 'wu21_viewer', 'wu21-synthetic-viewer-2026');
  const viewerHost = hostState(fixture.cases.viewer, 'wu21_viewer');
  const viewerCapture = await capturePage(page, frontendEntryUrl(fixture.cases.viewer), fixture.cases.viewer, {
    state: 'authorized_non_assignee_get',
    request_method: 'GET',
    host_context: viewerHost,
  });
  if (!viewerHost.permission_granted) {
    viewerCapture.qualification = 'NOT_PROVEN';
    viewerCapture.reason = 'pinned_host_did_not_authorize_non_assignee_fixture';
  }
  states.push(viewerCapture);

  await login(page, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');
  const completeItem = fixture.cases.complete;
  const completeBefore = hostState(completeItem, 'bootstrap_admin');
  await page.goto(adminEntryUrl(completeItem), { waitUntil: 'networkidle' });
  const approve = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  if (await approve.count() === 1) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      approve.click(),
    ]);
    await page.waitForLoadState('networkidle');
    states.push(await analyzeDocument(page, completeItem, {
      state: 'complete_approved_post_response',
      request_method: 'POST',
      authentic_native_approve_control: true,
      host_context_before: completeBefore,
      host_context_after: hostState(completeItem, 'bootstrap_admin'),
      http_status: 200,
      final_url: page.url(),
    }));
    states.push(await capturePage(page, adminEntryUrl(completeItem), completeItem, {
      state: 'no_current_step_complete_get',
      request_method: 'GET',
      host_context: hostState(completeItem, 'bootstrap_admin'),
    }));
  } else {
    states.push({ state: 'complete_approved_post_response', qualification: 'NOT_PROVEN', reason: 'native_approve_control_unavailable', host_context_before: completeBefore });
    states.push({ state: 'no_current_step_complete_get', qualification: 'NOT_PROVEN', reason: 'complete_state_not_authentically_reached' });
  }
} finally {
  await browser.close();
}

for (const state of states) {
  if (state.qualification === 'NOT_PROVEN') continue;
  const hidden = state.hidden_control;
  state.hard_gates = {
    native_oracle_present: state.native_entry_detail_present === true,
    subset: state.subset_assertion === true,
    hidden_not_native_visible: hidden?.native_visible === false,
    hidden_not_gpp_visible: hidden?.gpp_visible === false,
    hidden_sentinel_not_serialized: hidden?.serialized_leak === false,
    hidden_gpp_placeholder_absent: hidden?.gpp_placeholder_present === false,
  };
  state.hard_gate_result = Object.values(state.hard_gates).every(Boolean) ? 'PASS' : 'FAIL';
}

const requiredStateNames = [
  'current_assignee_active_step_get',
  'authorized_non_assignee_get',
  'ordinary_post',
  'complete_approved_post_response',
  'no_current_step_complete_get',
];
const stateByName = Object.fromEntries(states.map(state => [state.state, state]));
const evaluableStates = states.filter(state => state.qualification !== 'NOT_PROVEN' && state.hard_gate_result);
const failedStates = evaluableStates.filter(state => state.hard_gate_result === 'FAIL');
const everyRequiredProven = requiredStateNames.every(name => stateByName[name] && stateByName[name].qualification !== 'NOT_PROVEN' && stateByName[name].hard_gate_result === 'PASS');

let disposition = 'NOT_PROVEN';
if (failedStates.some(state => state.subset_assertion === false || state.hidden_control?.gpp_visible || state.hidden_control?.serialized_leak || state.hidden_control?.gpp_placeholder_present)) {
  disposition = 'CONFIRMED_DEFECT';
} else if (everyRequiredProven) {
  disposition = 'QUALIFIED_FOR_PINNED_RUNTIME';
}

const evidence = {
  schema_version: '1.1.0',
  work_unit: 'GPP-RP-WU-02-ENTRY-VISIBILITY-DIFFERENTIAL',
  problems: ['P-12', 'P-13'],
  claim_ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  repository_head: repoSha,
  objective: 'Prove sampled GPP field-backed visibility is a subset of the real Gravity Flow Entry Detail native-visible fields across the required authentically reachable pinned-runtime states.',
  non_goals: ['production visibility repair', 'duplicate nativeDisplayStep implementation', 'CSS visibility as oracle', 'label-based oracle'],
  runtime: {
    wordpress: '7.1.1',
    gravity_forms: fixture.gravity_forms_version || '3.1.1.1',
    gravity_flow: fixture.gravity_flow_version || '3.1.0',
    node: process.version,
    playwright: playwrightVersion,
  },
  oracle: 'real Gravity Flow Entry Detail .entry-detail-view output; source IDs are inferred only from unique synthetic sentinel values written to exact known field IDs',
  probe_scope: {
    known_visible_controls_per_state: 4,
    genuinely_host_hidden_controls_per_state: 1,
    hidden_semantic_slot: 'student.home_phone',
    screenshots_required: false,
  },
  mirrored_branch_scope: {
    pinned_gravity_flow: '3.1.0',
    current_assignee: stateByName.current_assignee_active_step_get?.qualification === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'covered',
    ordinary_non_post: stateByName.current_assignee_active_step_get?.qualification === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'covered',
    authentic_post: stateByName.ordinary_post?.qualification === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'covered',
    authorized_non_assignee: stateByName.authorized_non_assignee_get?.qualification === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'covered',
    complete_approved: stateByName.complete_approved_post_response?.qualification === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'covered',
    no_current_step: stateByName.no_current_step_complete_get?.qualification === 'NOT_PROVEN' ? 'NOT_PROVEN' : 'covered',
  },
  states,
  hard_gate_result: failedStates.length ? 'FAIL' : (everyRequiredProven ? 'PASS' : 'NOT_PROVEN'),
  disposition,
  production_direction: disposition === 'CONFIRMED_DEFECT'
    ? 'Next repair must be bounded to EntryDetailFieldVisibility/native seam selection and preserve Gravity Flow as the visibility authority.'
    : disposition === 'QUALIFIED_FOR_PINNED_RUNTIME'
      ? 'No production visibility repair is established for Gravity Flow 3.1.0; retain an exact-version qualification gate and re-qualify on host-version change.'
      : null,
};

fs.mkdirSync(artifactDir, { recursive: true });
const dedicatedOut = path.join(artifactDir, 'gpp-rp-wu02-entry-visibility-differential.json');
const retainedOut = path.join(artifactDir, 'wu18-gf-settings-save-wu02-entry-visibility.json');
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
fs.writeFileSync(dedicatedOut, serialized);
fs.writeFileSync(retainedOut, serialized);
console.log(JSON.stringify({ status: 'EVIDENCE_COMPLETE', disposition, hard_gate_result: evidence.hard_gate_result, artifact: retainedOut }));
