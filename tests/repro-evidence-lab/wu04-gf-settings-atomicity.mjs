import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const CONCLUSIVE_OUTCOMES = new Set([
  'CONFIRMED_PARTIAL_MUTATION_DEFECT/FAIL',
  'ATOMICITY_PROVEN/PASS',
]);

function snapshotShapeValid(snapshot) {
  return Boolean(
    snapshot
      && typeof snapshot === 'object'
      && Number.isInteger(snapshot.form_id)
      && Object.prototype.hasOwnProperty.call(snapshot, 'binding_activation')
      && typeof snapshot.binding_state_sha256 === 'string'
      && snapshot.binding_state_sha256.length > 0
      && typeof snapshot.visual_state_sha256 === 'string'
      && snapshot.visual_state_sha256.length > 0
  );
}

function canonicalLifecycleDelta(before, after) {
  if (!snapshotShapeValid(before) || !snapshotShapeValid(after)) {
    return {
      evidence_complete: false,
      binding_activation_changed: null,
      binding_state_changed: null,
      visual_state_changed: null,
      any_lifecycle_mutation: null,
    };
  }

  const bindingActivationChanged = JSON.stringify(before.binding_activation) !== JSON.stringify(after.binding_activation);
  const bindingStateChanged = before.binding_state_sha256 !== after.binding_state_sha256;
  const visualStateChanged = before.visual_state_sha256 !== after.visual_state_sha256;

  return {
    evidence_complete: true,
    binding_activation_changed: bindingActivationChanged,
    binding_state_changed: bindingStateChanged,
    visual_state_changed: visualStateChanged,
    any_lifecycle_mutation: bindingActivationChanged || bindingStateChanged || visualStateChanged,
  };
}

function authenticSettingsPost(request) {
  const shape = request?.request_shape;
  return Boolean(
    shape
      && shape.host_form_id === 'gform-settings'
      && shape.method === 'POST'
      && shape.has_nonce
      && shape.has_submit
      && shape.has_operation
      && shape.has_sibling
  );
}

function classifyAtomicity({
  rejectedRequest,
  rejectedBefore,
  rejectedAfter,
  validRequest,
  validBefore,
  validAfter,
}) {
  const rejectedDelta = canonicalLifecycleDelta(rejectedBefore, rejectedAfter);
  const validDelta = canonicalLifecycleDelta(validBefore, validAfter);
  const rejectedByHost = Boolean(
    rejectedRequest?.response?.field_error_present
      && !rejectedRequest?.response?.settings_saved_message_present
  );
  const validBindingActivated = Boolean(
    validDelta.evidence_complete
      && validBefore.binding_activation === null
      && validAfter.binding_activation !== null
  );
  const validPositiveControl = Boolean(
    authenticSettingsPost(validRequest)
      && validBindingActivated
      && validDelta.any_lifecycle_mutation
  );
  const prerequisitesComplete = Boolean(
    authenticSettingsPost(rejectedRequest)
      && rejectedDelta.evidence_complete
      && validDelta.evidence_complete
      && rejectedByHost
      && validPositiveControl
  );

  let disposition = 'NOT_PROVEN';
  let hardGate = 'NOT_PROVEN';
  if (prerequisitesComplete) {
    if (rejectedDelta.any_lifecycle_mutation) {
      disposition = 'CONFIRMED_PARTIAL_MUTATION_DEFECT';
      hardGate = 'FAIL';
    } else {
      disposition = 'ATOMICITY_PROVEN';
      hardGate = 'PASS';
    }
  }

  return {
    disposition,
    hard_gate_result: hardGate,
    prerequisites_complete: prerequisitesComplete,
    rejected_by_host: rejectedByHost,
    rejected_delta: rejectedDelta,
    valid_delta: validDelta,
    valid_binding_activated: validBindingActivated,
    valid_positive_control: validPositiveControl,
  };
}

function qualificationExitCode(outcome) {
  return CONCLUSIVE_OUTCOMES.has(`${outcome?.disposition}/${outcome?.hard_gate_result}`) ? 0 : 2;
}

function qualificationStatus(outcome) {
  return 0 === qualificationExitCode(outcome) ? 'EVIDENCE_COMPLETE' : 'EVIDENCE_INCONCLUSIVE';
}

function syntheticSnapshot(formId, activation, bindingHash, visualHash) {
  return {
    form_id: formId,
    binding_activation: activation,
    binding_state_sha256: bindingHash,
    visual_state_sha256: visualHash,
  };
}

function syntheticRequest({ rejected }) {
  return {
    request_shape: {
      host_form_id: 'gform-settings',
      method: 'POST',
      has_nonce: true,
      has_submit: true,
      has_operation: true,
      has_sibling: true,
    },
    response: {
      field_error_present: rejected,
      settings_saved_message_present: !rejected,
    },
  };
}

function runClassifierFalsification() {
  const rejectedRequest = syntheticRequest({ rejected: true });
  const validRequest = syntheticRequest({ rejected: false });
  const rejectedBefore = syntheticSnapshot(101, null, 'binding-a', 'visual-a');
  const validBefore = syntheticSnapshot(202, null, 'binding-after-rejected', 'visual-a');
  const validAfter = syntheticSnapshot(202, { key: 'valid' }, 'binding-after-valid', 'visual-a');

  const defect = classifyAtomicity({
    rejectedRequest,
    rejectedBefore,
    rejectedAfter: syntheticSnapshot(101, { key: 'rejected' }, 'binding-after-rejected', 'visual-a'),
    validRequest,
    validBefore,
    validAfter,
  });
  assert.equal(defect.disposition, 'CONFIRMED_PARTIAL_MUTATION_DEFECT');
  assert.equal(defect.hard_gate_result, 'FAIL');
  assert.equal(qualificationExitCode(defect), 0);

  const atomic = classifyAtomicity({
    rejectedRequest,
    rejectedBefore,
    rejectedAfter: syntheticSnapshot(101, null, 'binding-a', 'visual-a'),
    validRequest,
    validBefore: syntheticSnapshot(202, null, 'binding-a', 'visual-a'),
    validAfter: syntheticSnapshot(202, { key: 'valid' }, 'binding-after-valid', 'visual-a'),
  });
  assert.equal(atomic.disposition, 'ATOMICITY_PROVEN');
  assert.equal(atomic.hard_gate_result, 'PASS');
  assert.equal(qualificationExitCode(atomic), 0);

  const inconclusive = classifyAtomicity({
    rejectedRequest,
    rejectedBefore,
    rejectedAfter: syntheticSnapshot(101, null, 'binding-a', 'visual-a'),
    validRequest,
    validBefore: syntheticSnapshot(202, null, 'binding-a', 'visual-a'),
    validAfter: syntheticSnapshot(202, null, 'binding-a', 'visual-a'),
  });
  assert.equal(inconclusive.disposition, 'NOT_PROVEN');
  assert.equal(inconclusive.hard_gate_result, 'NOT_PROVEN');
  assert.notEqual(qualificationExitCode(inconclusive), 0);

  const canonicalMutationWithoutRejectedActivation = classifyAtomicity({
    rejectedRequest,
    rejectedBefore,
    rejectedAfter: syntheticSnapshot(101, null, 'binding-mutated-without-form-activation', 'visual-a'),
    validRequest,
    validBefore: syntheticSnapshot(202, null, 'binding-mutated-without-form-activation', 'visual-a'),
    validAfter: syntheticSnapshot(202, { key: 'valid' }, 'binding-after-valid', 'visual-a'),
  });
  assert.equal(canonicalMutationWithoutRejectedActivation.disposition, 'CONFIRMED_PARTIAL_MUTATION_DEFECT');
  assert.equal(canonicalMutationWithoutRejectedActivation.hard_gate_result, 'FAIL');
  assert.equal(canonicalMutationWithoutRejectedActivation.rejected_delta.binding_activation_changed, false);
  assert.equal(canonicalMutationWithoutRejectedActivation.rejected_delta.binding_state_changed, true);

  assert.notEqual(qualificationExitCode({ disposition: 'ATOMICITY_PROVEN', hard_gate_result: 'FAIL' }), 0);
  assert.notEqual(qualificationExitCode({ disposition: 'CONFIRMED_PARTIAL_MUTATION_DEFECT', hard_gate_result: 'PASS' }), 0);

  return {
    confirmed_defect_fail_exits_successfully: true,
    atomicity_proven_pass_exits_successfully: true,
    not_proven_fails_closed: true,
    canonical_mutation_without_rejected_form_activation_is_defect: true,
    inconsistent_terminal_pairs_fail_closed: true,
  };
}

const classifierFalsification = runClassifierFalsification();
if (process.argv.includes('--classifier-self-test')) {
  console.log(JSON.stringify({ status: 'WU04_CLASSIFIER_SELF_TEST_PASS', classifier_falsification: classifierFalsification }));
  process.exit(0);
}

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU04 requires the admitted WU18 runtime environment.');

const { chromium } = await import('playwright');
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
$operations = \\GravityPresentationProfiles\\GravityForms\\OperationsSetupService::forWordPress();
$context = $operations->bindingContext(${Number(formId)});
$bindings = new \\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle(
  new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME),
  new \\GravityPresentationProfiles\\Core\\Lifecycle\\EvidenceReferenceGate(array())
);
$binding_option = get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME);
$visual_option = get_option(\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME);
echo wp_json_encode(array(
  'form_id' => ${Number(formId)},
  'binding_activation' => $bindings->resolve($context),
  'binding_state_sha256' => hash('sha256', wp_json_encode($binding_option)),
  'visual_state_sha256' => hash('sha256', wp_json_encode($visual_option)),
), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));
}

const rejectedFormId = createForm('WU04 Rejected Transaction');
const validFormId = createForm('WU04 Valid Transaction');
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
const operationName = '_gform_setting_operations_setup_action';
const siblingName = '_gform_setting_entry_detail_setup_action';
const invalidSiblingValue = 'wu04-invalid-sibling-action';
const expectedSiblingError = 'The selected Entry Detail setup action is invalid. Refresh the page and try again.';
const bootstrapPassword = ['wu21', 'bootstrap', 'pass', '2026'].join('-');

async function login(page) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', bootstrapPassword);
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

  const response = await page.evaluate(({ expectedSiblingError }) => {
    const container = document.querySelector('#gform_setting_entry_detail_setup_action');
    const errorNodes = container ? Array.from(container.querySelectorAll('.gform-settings-validation__error, [class*="validation"][class*="error"], [role="alert"]')) : [];
    const bodyText = document.body?.innerText || '';
    const errorTexts = errorNodes.map(node => (node.textContent || '').replace(/\s+/g, ' ').trim());
    return {
      final_url: location.href,
      field_error_present: errorTexts.some(text => text.includes(expectedSiblingError)),
      field_error_texts: errorTexts.map(text => text.slice(0, 500)),
      settings_saved_message_present: /Settings saved|تنظیمات.*ذخیره/i.test(bodyText),
    };
  }, { expectedSiblingError });

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

const transactionSequence = [];
let rejectedBefore;
let rejectedRequest;
let rejectedAfter;
let validBefore;
let validRequest;
let validAfter;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);

  rejectedBefore = snapshot(rejectedFormId);
  transactionSequence.push('rejectedBefore');
  rejectedRequest = await submitScenario(page, rejectedFormId, true);
  transactionSequence.push('rejectedPOST');
  rejectedAfter = snapshot(rejectedFormId);
  transactionSequence.push('rejectedAfter');

  validBefore = snapshot(validFormId);
  transactionSequence.push('validBefore');
  validRequest = await submitScenario(page, validFormId, false);
  transactionSequence.push('validPOST');
  validAfter = snapshot(validFormId);
  transactionSequence.push('validAfter');
} finally {
  await browser.close();
}

const expectedTransactionSequence = [
  'rejectedBefore',
  'rejectedPOST',
  'rejectedAfter',
  'validBefore',
  'validPOST',
  'validAfter',
];
assert.deepEqual(transactionSequence, expectedTransactionSequence);

const outcome = classifyAtomicity({
  rejectedRequest,
  rejectedBefore,
  rejectedAfter,
  validRequest,
  validBefore,
  validAfter,
});
const qualificationProcessExitCode = qualificationExitCode(outcome);
const qualificationProcessStatus = qualificationStatus(outcome);

const evidence = {
  schema_version: '1.2.0',
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
  classifier_falsification: classifierFalsification,
  transaction_isolation: {
    expected_sequence: expectedTransactionSequence,
    observed_sequence: transactionSequence,
    proven: true,
  },
  production_call_path: {
    host_form: 'GFAddOn#gform-settings',
    lifecycle_field: 'operations_setup_action',
    validation_callback: 'GravityPresentationProfiles\\GravityForms\\AddOn::validate_operations_setup_action',
    service_call: 'OperationsSetupService::forWordPress()->initialize',
    canonical_state: 'BindingSetLifecycle::OPTION_NAME',
    admitted_canonical_state_surfaces: [
      'form-specific BindingSetLifecycle resolution',
      'BindingSetLifecycle::OPTION_NAME',
      'VisualPackageLifecycle::OPTION_NAME',
    ],
    rejected_path_reached_by_observable_mutation: Boolean(outcome.rejected_delta.any_lifecycle_mutation),
    valid_positive_path_reached_by_observable_mutation: outcome.valid_positive_control,
  },
  rejected_transaction: {
    form_id: rejectedFormId,
    request: rejectedRequest.request_shape,
    validation_outcome: rejectedRequest.response,
    canonical_before: rejectedBefore,
    canonical_after: rejectedAfter,
    canonical_delta: outcome.rejected_delta,
    mutation_persisted: Boolean(outcome.rejected_delta.any_lifecycle_mutation),
  },
  valid_positive_control: {
    form_id: validFormId,
    request: validRequest.request_shape,
    validation_outcome: validRequest.response,
    canonical_before: validBefore,
    canonical_after: validAfter,
    canonical_delta: outcome.valid_delta,
    mutation_persisted: outcome.valid_binding_activated,
    state_changed: Boolean(outcome.valid_delta.any_lifecycle_mutation),
  },
  hard_gates: {
    authentic_gform_settings_post: authenticSettingsPost(rejectedRequest) && authenticSettingsPost(validRequest),
    invalid_sibling_rejected: outcome.rejected_by_host,
    positive_control_mutates_canonical_state: outcome.valid_positive_control,
    rejected_transaction_does_not_persist_lifecycle_mutation: outcome.rejected_delta.any_lifecycle_mutation === false,
    transaction_local_snapshot_order: true,
    classifier_terminal_state_conclusive: 0 === qualificationProcessExitCode,
  },
  hard_gate_result: outcome.hard_gate_result,
  disposition: outcome.disposition,
  qualification_process: {
    status: qualificationProcessStatus,
    exit_code: qualificationProcessExitCode,
    conclusive_outcomes: [
      'CONFIRMED_PARTIAL_MUTATION_DEFECT / FAIL',
      'ATOMICITY_PROVEN / PASS',
    ],
  },
  narrow_repair_boundary: outcome.disposition === 'CONFIRMED_PARTIAL_MUTATION_DEFECT'
    ? 'Move lifecycle-changing work out of per-field validation callbacks into a post-validation save boundary that runs only after the host settings transaction is globally valid; keep Gravity Forms ownership of nonce, capability and field validation.'
    : null,
};

fs.mkdirSync(artifactDir, { recursive: true });
const dedicatedOut = path.join(artifactDir, 'gpp-rp-wu04-gf-settings-atomicity.json');
const retainedOut = path.join(artifactDir, 'wu18-gf-settings-save-wu04-atomicity.json');
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
fs.writeFileSync(dedicatedOut, serialized);
fs.writeFileSync(retainedOut, serialized);
console.log(JSON.stringify({
  status: qualificationProcessStatus,
  disposition: outcome.disposition,
  hard_gate_result: outcome.hard_gate_result,
  artifact: retainedOut,
}));
process.exitCode = qualificationProcessExitCode;
