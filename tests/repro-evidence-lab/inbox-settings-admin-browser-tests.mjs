import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const settingsUrl = `${baseUrl}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'inbox-settings-fixture.json'), 'utf8'));
const resultFile = path.join(artifactDir, 'inbox-settings-browser-results.json');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`WP eval failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function sameJson(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function productState(formId) {
  const code = `
    $form_id=${Number(formId)};
    $operations=\\GravityPresentationProfiles\\GravityForms\\OperationsSetupService::forWordPress();
    $binding_lifecycle=new \\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle(
      new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\BindingSetLifecycle::OPTION_NAME),
      new \\GravityPresentationProfiles\\Core\\Lifecycle\\EvidenceReferenceGate(array())
    );
    $context=$operations->bindingContext($form_id);
    $active=$binding_lifecycle->resolve($context);
    $snapshot=$binding_lifecycle->snapshot();
    $artifact=$snapshot['installed'][$active['binding_set_id']][$active['binding_set_version']]['artifact'];
    $visual=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(
      new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME)
    );
    echo wp_json_encode(array(
      'print'=>$visual->resolve('print.dossier'),
      'inbox'=>$visual->resolve('gravity_flow.inbox'),
      'binding_set_id'=>$active['binding_set_id'],
      'binding_set_version'=>$active['binding_set_version'],
      'bindings'=>$artifact['bindings'],
      'runtime_claims'=>$artifact['runtime_claims'],
    ), JSON_UNESCAPED_SLASHES);
  `;
  return JSON.parse(wpEval(code));
}

function bindingBySlot(state, slot) {
  return state.bindings.find(item => item.semantic_slot_key === slot);
}

function availabilityBySlot(state, slot) {
  return state.runtime_claims.find(item => item.semantic_slot_key === slot && item.claim === 'availability');
}

async function saveInboxAction(page, formId) {
  const selector = page.getByLabel('Initialize / Adopt Inbox presentation', { exact: true });
  await selector.waitFor({ state: 'visible', timeout: 30000 });
  await selector.selectOption(`form:${formId}`);
  const settingsForm = selector.locator('xpath=ancestor::form');
  const submit = settingsForm.locator('button[type="submit"], input[type="submit"]').last();
  await submit.waitFor({ state: 'visible', timeout: 15000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    submit.click(),
  ]);
  await page.waitForLoadState('networkidle');
}

const result = {
  id: 'WU21-INBOX-SETTINGS-001',
  name: 'real GF plugin settings Inbox setup reachability and mutation seam',
  status: 'FAIL',
  details: {},
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await page.goto(settingsUrl, { waitUntil: 'networkidle' });

  const bodyText = await page.locator('body').innerText();
  const printPosition = bodyText.indexOf('Operations Setup (Print)');
  const inboxPosition = bodyText.indexOf('Operations Setup (Inbox)');
  if (printPosition < 0) throw new Error('Operations Setup (Print) is not visible on the real GPP settings page.');
  if (inboxPosition < 0) throw new Error('Operations Setup (Inbox) is not visible on the real GPP settings page.');
  if (inboxPosition <= printPosition) throw new Error('Inbox setup is not rendered after the separate Print setup section.');
  if (await page.locator('[data-gpp-inbox-setup="explicit"]').count() !== 0) {
    throw new Error('Legacy admin-notice Inbox mutation control is still rendered.');
  }

  const inboxSelector = page.getByLabel('Initialize / Adopt Inbox presentation', { exact: true });
  await inboxSelector.waitFor({ state: 'visible', timeout: 30000 });
  const option = inboxSelector.locator(`option[value="form:${fixture.form_id}"]`);
  if (await option.count() !== 1) throw new Error('Probe Gravity Forms form is not selectable in the Inbox settings action.');
  const optionText = await option.innerText();
  if (!optionText.includes(fixture.form_title) || !optionText.includes(`Form ${fixture.form_id}`)) {
    throw new Error(`Inbox form selector does not expose exact form identity: ${optionText}`);
  }

  const before = productState(fixture.form_id);
  const createdBefore = bindingBySlot(before, 'entry.created_at');
  const stepBefore = bindingBySlot(before, 'workflow.current_step');
  if (!createdBefore || createdBefore.state !== 'UNBOUND') throw new Error('Probe entry.created_at was already qualified before UI action.');
  if (!stepBefore || stepBefore.state !== 'UNBOUND') throw new Error('Probe workflow.current_step was already qualified before UI action.');
  const mappedBefore = Object.fromEntries(
    Object.keys(fixture.mapped_fields).map(slot => [slot, bindingBySlot(before, slot)?.source_ref || null])
  );

  await saveInboxAction(page, fixture.form_id);

  const success = page.locator('[data-gpp-inbox-setup-result="completed"]');
  await success.waitFor({ state: 'visible', timeout: 30000 });
  const successText = await success.innerText();
  if (!successText.includes(fixture.form_title) || !successText.includes(`Form ${fixture.form_id}`)) {
    throw new Error('Inbox setup success feedback did not identify the selected form.');
  }
  if (!successText.includes('Print activation was preserved')) {
    throw new Error('Inbox setup success feedback did not state preservation of compatible Print state.');
  }

  const after = productState(fixture.form_id);
  if (!after.inbox || after.inbox.profile_id !== 'srwf.operations.inbox.v1') {
    throw new Error('Inbox profile is not active after the real settings action.');
  }
  if (!sameJson(before.print, after.print)) throw new Error('Inbox settings action changed the existing Print activation.');
  if (before.binding_set_id !== after.binding_set_id) throw new Error('Inbox settings action replaced the authoritative binding-set identity.');
  if (before.binding_set_version === after.binding_set_version) throw new Error('First qualification did not publish the required immutable binding successor.');

  const createdAfter = bindingBySlot(after, 'entry.created_at');
  const stepAfter = bindingBySlot(after, 'workflow.current_step');
  if (createdAfter?.state !== 'PROVEN' || createdAfter?.source_ref?.type !== 'gravity_forms.entry_meta' || createdAfter?.source_ref?.meta_key !== 'date_created') {
    throw new Error('entry.created_at was not qualified against admitted Gravity Forms entry metadata through the settings action.');
  }
  if (stepAfter?.state !== 'PROVEN' || stepAfter?.source_ref?.type !== 'gravity_flow.state' || stepAfter?.source_ref?.state_key !== 'current_step') {
    throw new Error('workflow.current_step was not qualified against admitted Gravity Flow current-step state through the settings action.');
  }
  if (availabilityBySlot(after, 'entry.created_at')?.evidence_state !== 'PROVEN') throw new Error('entry.created_at availability is not PROVEN after UI setup.');
  if (availabilityBySlot(after, 'workflow.current_step')?.evidence_state !== 'PROVEN') throw new Error('workflow.current_step availability is not PROVEN after UI setup.');

  for (const [slot, sourceBefore] of Object.entries(mappedBefore)) {
    const sourceAfter = bindingBySlot(after, slot)?.source_ref || null;
    if (!sameJson(sourceBefore, sourceAfter)) throw new Error(`Inbox settings action changed explicit field mapping for ${slot}.`);
  }

  await saveInboxAction(page, fixture.form_id);
  const secondSuccess = page.locator('[data-gpp-inbox-setup-result="completed"]');
  await secondSuccess.waitFor({ state: 'visible', timeout: 30000 });
  const rerun = productState(fixture.form_id);
  if (rerun.binding_set_version !== after.binding_set_version) throw new Error('Idempotent Inbox settings rerun created unnecessary binding-version churn.');
  if (!sameJson(after.inbox, rerun.inbox)) throw new Error('Idempotent Inbox settings rerun changed compatible Inbox activation.');
  if (!sameJson(after.print, rerun.print)) throw new Error('Idempotent Inbox settings rerun changed Print activation.');

  result.status = 'PASS';
  result.details = {
    settings_url: settingsUrl,
    form_id: fixture.form_id,
    form_title: fixture.form_title,
    print_section_visible: true,
    inbox_section_visible: true,
    legacy_notice_control_present: false,
    initial_binding_version: before.binding_set_version,
    qualified_binding_version: after.binding_set_version,
    rerun_binding_version: rerun.binding_set_version,
    inbox_profile_id: after.inbox.profile_id,
    print_activation_preserved: true,
    explicit_field_mappings_preserved: true,
    entry_created_at_source: createdAfter.source_ref,
    entry_created_at_availability: availabilityBySlot(after, 'entry.created_at').evidence_state,
    workflow_current_step_source: stepAfter.source_ref,
    workflow_current_step_availability: availabilityBySlot(after, 'workflow.current_step').evidence_state,
    idempotent_rerun_no_binding_churn: true,
  };
} catch (error) {
  result.details.error = String(error?.stack || error).slice(0, 8000);
} finally {
  await browser.close();
}

fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n');
console.log(`${result.status} ${result.id} ${result.name}`);
if (result.status !== 'PASS') process.exit(1);
