import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU04 requires the admitted WU18 runtime environment.');

const repoSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const playwrightVersion = JSON.parse(fs.readFileSync('node_modules/playwright/package.json', 'utf8')).version;

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function createForm(title) {
  return Number(wpEval(`
$form = array(
  'title' => ${JSON.stringify(title)},
  'description' => 'Synthetic non-PII WU04 settings atomicity fixture.',
  'fields' => array(array('id' => 1, 'label' => 'Synthetic Value', 'type' => 'text', 'isRequired' => false)),
  'button' => array('type' => 'text', 'text' => 'Submit')
);
$id = GFAPI::add_form($form);
if (is_wp_error($id) || !$id) throw new RuntimeException('WU04 form creation failed.');
echo (int)$id;
`));
}

function snapshot(formId) {
  return JSON.parse(wpEval(`
+$operations = \\GravityPresentationProfiles\\GravityForms\\OperationsSetupService::forWordPress();
+$context = $operations->bindingContext(${Number(formId)});
+$bindings = new \\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle(
+  new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME),
+  new \\GravityPresentationProfiles\\Core\\Lifecycle\\EvidenceReferenceGate(array())
+);
+$binding_option = get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME);
+$visual_option = get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME);
+echo wp_json_encode(array(
+  'form_id' => ${Number(formId)},
+  'binding_activation' => $bindings->resolve($context),
+  'binding_state_sha256' => hash('sha256', wp_json_encode($binding_option)),
+  'visual_state_sha256' => hash('sha256', wp_json_encode($visual_option)),
+), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
+`).replace(/^\+/gm, ''));
}

const rejectedFormId = createForm('WU04 Rejected Transaction');
const validFormId = createForm('WU04 Valid Transaction');
const rejectedBefore = snapshot(rejectedFormId);
const validBefore = snapshot(validFormId);

const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
const operationName = '_gform_setting_operations_setup_action';
const siblingName = '_gform_setting_entry_detail_setup_action';
const invalidSiblingValue = 'wu04-invalid-sibling-action';

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

async function submitScenario(page, formId, invalidSibling) {
  await page.goto(settingsUrl, { waitUntil: 'networkidle' });

  const shape = await page.evaluate(({ operationName, siblingName }) => {
    const form = document.querySelector('#gform-settings');
    if (!(form instanceof HTMLFormElement)) return null;
    const names = Array.from(form.elements).map(el => el.getAttribute?.('name')).filter(Boolean);
    const action = new URL(form.action, location.href);
    return {
      host_form_id: form.id,
      method: String(form.method || '').toUpperCase(),
      action_path: action.pathname + action.search,
      has_nonce: names.includes('gform_settings_save_nonce'),
      has_submit: names.includes('gform-settings-save'),
      has_operation: names.includes(operationName),
      has_sibling: names.includes(siblingName),
      control_names: [...new Set(names)].sort(),
    };
  }, { operationName, siblingName });

  if (!shape || shape.host_form_id !== 'gform-settings' || shape.method !== 'POST' || !shape.has_nonce || !shape.has_submit || !shape.has_operation || !shape.has_sibling) {
    throw new Error(`Authentic GF settings form shape unavailable: ${JSON.stringify(shape)}`);
  }

  const operation = page.locator(`select[name="${operationName}"]`);
  const sibling = page.locator(`select[name="${siblingName}"]`);
  if (await operation.count() !== 1 || await sibling.count() !== 1) throw new Error('Required GPP settings controls are unavailable.');
  await operation.selectOption(`form:${formId}`);

  if (invalidSibling) {
    await sibling.evaluate((select, value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = 'Synthetic invalid sibling';
      option.selected = true;
      select.appendChild(option);
      select.value = value;
    }, invalidSiblingValue);
  } else {
    await sibling.selectOption('');
  }

  const submitted = await page.evaluate(({ operationName, siblingName }) => ({
    operation: document.querySelector(`[name="${operationName}"]`)?.value || null,
    sibling: document.querySelector(`[name="${siblingName}"]`)?.value || null,
  }), { operationName, siblingName });

  const submit = page.locator('[name="gform-settings-save"][value="save"]');
  if (await submit.count() !== 1) throw new Error('Gravity Forms settings Save control is unavailable.');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    submit.click(),
  ]);
  await page.waitForLoadState('networkidle');

  const response = await page.evaluate(({ siblingName, invalidSiblingValue }) => {
    const sibling = document.querySelector(`[name="${siblingName}"]`);
    const container = document.querySelector('#gform_setting_entry_detail_setup_action');
    const containerText = (container?.textContent || '').replace(/\s+/g, ' ').trim();
    const bodyText = document.body?.innerText || '';
    return {
      final_url: location.href,
      sibling_value_retained: sibling?.value === invalidSiblingValue,
      sibling_container_text: containerText.slice(0, 1500),
      sibling_error_nodes: container ? Array.from(container.querySelectorAll('[class*="error"], [role="alert"]')).map(node => ({
        class_name: String(node.className || ''),
        role: node.getAttribute('role'),
        text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
      })) : [],
      has_validation_language: /invalid|نامعتبر|خطا|Refresh the page and try again/i.test(containerText),
      has_saved_language: /Settings saved|تنظیمات.*ذخیره/i.test(bodyText),
    };
  }, { siblingName, invalidSiblingValue });

  return {
    request_shape: {
      ...shape,
      submitted_operation: submitted.operation,
      submitted_sibling: invalidSibling ? 'SYNTHETIC_INVALID_VALUE' : '',
      nonce_value_recorded: false,
    },
    response,
  };
}

const browser = await chromium.launch({ headless: true });
let rejectedRequest;
let validRequest;
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  rejectedRequest = await submitScenario(page, rejectedFormId, true);
  validRequest = await submitScenario(page, validFormId, false);
} finally {
  await browser.close();
}

const rejectedAfter = snapshot(rejectedFormId);
const validAfter = snapshot(validFormId);
const rejectedUi = rejectedRequest.response;

const rejectedByHost = rejectedUi.sibling_value_retained && rejectedUi.has_validation_language && !rejectedUi.has_saved_language;
const rejectedMutationPersisted = rejectedBefore.binding_activation === null && rejectedAfter.binding_activation !== null;
const validMutationPersisted = validBefore.binding_activation === null && validAfter.binding_activation !== null;
const validStateChanged = validBefore.binding_state_sha256 !== validAfter.binding_state_sha256;

let disposition = 'NOT_PROVEN';
let hardGate = 'NOT_PROVEN';
if (rejectedByHost && validMutationPersisted && validStateChanged) {
  if (rejectedMutationPersisted) {
    disposition = 'CONFIRMED_PARTIAL_MUTATION_DEFECT';
    hardGate = 'FAIL';
  } else {
    disposition = 'ATOMICITY_PROVEN';
    hardGate = 'PASS';
  }
}

const evidence = {
  schema_version: '1.1.0',
  work_unit: 'GPP-RP-WU-04-GF-SETTINGS-ATOMICITY',
  problems: ['P-23'],
  claim_ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  repository_head: repoSha,
  objective: 'Determine whether a rejected real Gravity Forms settings submission can persist an unrelated valid GPP lifecycle mutation.',
  non_goals: ['production transaction repair', 'controller-only testing', 'settings UI redesign'],
  runtime: {
    wordpress: '7.1.1',
    gravity_forms: '3.1.1.1',
    gravity_flow: '3.1.0',
    node: process.version,
    playwright: playwrightVersion,
  },
  production_call_path: {
    host_form: 'GFAddOn#gform-settings',
    lifecycle_field: 'operations_setup_action',
    validation_callback: 'GravityPresentationProfiles\\GravityForms\\AddOn::validate_operations_setup_action',
    service_call: 'OperationsSetupService::forWordPress()->initialize',
    canonical_state: 'BindingSetLifecycle::OPTION_NAME',
    rejected_path_reached_by_observable_mutation: rejectedMutationPersisted,
    valid_positive_path_reached_by_observable_mutation: validMutationPersisted && validStateChanged,
  },
  rejected_transaction: {
    form_id: rejectedFormId,
    request: rejectedRequest.request_shape,
    validation_outcome: rejectedUi,
    canonical_before: rejectedBefore,
    canonical_after: rejectedAfter,
    mutation_persisted: rejectedMutationPersisted,
  },
  valid_positive_control: {
    form_id: validFormId,
    request: validRequest.request_shape,
    validation_outcome: validRequest.response,
    canonical_before: validBefore,
    canonical_after: validAfter,
    mutation_persisted: validMutationPersisted,
    state_changed: validStateChanged,
  },
  hard_gates: {
    authentic_gform_settings_post: rejectedRequest.request_shape.host_form_id === 'gform-settings' && rejectedRequest.request_shape.method === 'POST',
    invalid_sibling_rejected: rejectedByHost,
    positive_control_mutates_canonical_state: validMutationPersisted && validStateChanged,
    rejected_transaction_does_not_persist_lifecycle_mutation: !rejectedMutationPersisted,
  },
  hard_gate_result: hardGate,
  disposition,
  narrow_repair_boundary: disposition === 'CONFIRMED_PARTIAL_MUTATION_DEFECT'
    ? 'Move lifecycle-changing work out of per-field validation callbacks into a post-validation save boundary that runs only after the host settings transaction is globally valid; keep Gravity Forms ownership of nonce, capability and field validation.'
    : null,
};

fs.mkdirSync(artifactDir, { recursive: true });
const retainedOut = path.join(artifactDir, 'wu18-gf-settings-save-wu04-atomicity.json');
const dedicatedOut = path.join(artifactDir, 'gpp-rp-wu04-gf-settings-atomicity.json');
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
fs.writeFileSync(retainedOut, serialized);
fs.writeFileSync(dedicatedOut, serialized);
console.log(JSON.stringify({ status: 'EVIDENCE_COMPLETE', disposition, hard_gate_result: hardGate, artifact: retainedOut }));
