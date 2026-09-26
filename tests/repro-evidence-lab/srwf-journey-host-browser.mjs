import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
const participantPassword = 'srwf-participant-pass-2026';

if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned qualification environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);

function hostState(entryId, asUserId = manifest.users.operator.id) {
  const code = `
    wp_set_current_user(${Number(asUserId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    $timeline=$api->get_timeline($entry);
    $out=array(
      'entry_id'=>(int)$entry['id'],
      'workflow_step'=>gform_get_meta((int)$entry['id'],'workflow_step'),
      'workflow_current_status'=>gform_get_meta((int)$entry['id'],'workflow_current_status'),
      'workflow_final_status'=>gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>$api->get_status($entry),
      'current_step'=>$step ? array(
        'id'=>(int)$step->get_id(),
        'type'=>$step->get_type(),
        'name'=>$step->get_name(),
        'evaluated_status'=>$step->evaluate_status(),
        'can_update'=>Gravity_Flow_Entry_Detail::can_update($step),
        'editable_fields'=>method_exists($step,'get_editable_fields') ? array_values(array_map('strval',$step->get_editable_fields())) : array(),
        'feed_assignees'=>(array) rgar($step->get_feed_meta(),'assignees'),
      ) : null,
      'timeline'=>is_array($timeline) ? array_slice($timeline,-8) : $timeline,
    );
    echo wp_json_encode($out, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `;
  return JSON.parse(wpEval(code));
}

function validateInvalidStatus(entryId) {
  const code = `
    wp_set_current_user(${Number(manifest.users.operator.id)});
    $entry=GFAPI::get_entry(${Number(entryId)});
    $form=GFAPI::get_form(${formId});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    $result=$step->validate_status_update('synthetic-invalid-status',$form);
    echo wp_json_encode(array('is_wp_error'=>is_wp_error($result),'code'=>is_wp_error($result)?$result->get_error_code():null,'message'=>is_wp_error($result)?$result->get_error_message():null),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `;
  return JSON.parse(wpEval(code));
}

const adminEntryUrl = entryId => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${formId}&lid=${entryId}`;
function frontendEntryUrl(route, entryId) {
  const url = new URL(route.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}

const results = [];
function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 10000) }); }
}

async function login(page, user, pass) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

async function actionBoxState(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.gravityflow-status-box');
    const buttons = [...document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')];
    const hidden = document.querySelector('#gravityflow_approval_new_status_step');
    const nonce = document.querySelector('input[name="_wpnonce"]');
    return {
      box_present: Boolean(box),
      buttons: buttons.map((b, index) => ({ index, value: b.value, text: b.textContent.replace(/\s+/g, ' ').trim(), onclick: b.getAttribute('onclick') || '' })),
      hidden_present: Boolean(hidden),
      hidden_value: hidden?.value ?? null,
      nonce_present: Boolean(nonce && nonce.value),
      dom_dialog_count: document.querySelectorAll('[role="dialog"], dialog').length,
      active_value: document.activeElement?.value || null,
    };
  });
}

async function acceptAction(page, value) {
  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native action button: ${value}`);
  let dialogInfo = null;
  page.once('dialog', async dialog => {
    dialogInfo = { type: dialog.type(), message: dialog.message() };
    await dialog.accept();
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    button.click(),
  ]);
  return dialogInfo;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await login(page, manifest.users.operator.login, operatorPassword);

await test('SRWF-HOST-CONFIRM-001', 'native Approval confirmation is browser-owned and cancel preserves host state', async () => {
  const entryId = manifest.entries.approve;
  const before = hostState(entryId);
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const initial = await actionBoxState(page);
  if (!initial.nonce_present || !initial.hidden_present) throw new Error(`Native nonce/status carrier missing: ${JSON.stringify(initial)}`);
  if (initial.buttons.map(x => x.value).join(',') !== 'approved,rejected,revert') throw new Error(`Native action ordering drifted: ${JSON.stringify(initial.buttons)}`);
  if (!initial.buttons.every(x => x.onclick.includes('handleApprovalStepButtonClick'))) throw new Error(`Native approval handler missing: ${JSON.stringify(initial.buttons)}`);
  if (initial.dom_dialog_count !== 0) throw new Error(`Unexpected DOM confirmation markup exists before native browser confirm: ${JSON.stringify(initial)}`);

  const approve = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  let dialogInfo = null;
  page.once('dialog', async dialog => {
    dialogInfo = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
  });
  await approve.click();
  await page.waitForTimeout(150);
  const afterCancelUi = await actionBoxState(page);
  const after = hostState(entryId);
  if (!dialogInfo || dialogInfo.type !== 'confirm') throw new Error(`Host did not emit native browser confirm: ${JSON.stringify(dialogInfo)}`);
  if (after.current_step?.id !== before.current_step?.id || after.workflow_final_status !== before.workflow_final_status) throw new Error(`Cancelled confirmation mutated host workflow: ${JSON.stringify({before,after})}`);
  if (afterCancelUi.hidden_value !== '') throw new Error(`Cancelled confirmation populated mutation carrier: ${JSON.stringify(afterCancelUi)}`);
  return { initial, dialog: dialogInfo, after_cancel_ui: afterCancelUi, before, after };
});

await test('SRWF-HOST-RESULT-APPROVE-001', 'accepted Approve produces authoritative host read-back before completed UI is eligible', async () => {
  const entryId = manifest.entries.approve;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptAction(page, 'approved');
  const after = hostState(entryId);
  if (!dialog || dialog.type !== 'confirm') throw new Error('Approve did not traverse native browser confirmation.');
  if (after.current_step !== null) throw new Error(`Terminal approved fixture still has a current step: ${JSON.stringify(after)}`);
  if (!after.workflow_final_status || after.workflow_final_status === 'pending') throw new Error(`Approved fixture lacks terminal workflow truth: ${JSON.stringify(after)}`);
  return { dialog, after, resulting_url: page.url(), body_sample: (await page.locator('body').innerText()).slice(0, 1200) };
});

await test('SRWF-HOST-RESULT-REJECT-001', 'accepted Reject produces authoritative host read-back and remains distinct from technical failure', async () => {
  const entryId = manifest.entries.reject;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptAction(page, 'rejected');
  const after = hostState(entryId);
  if (!dialog || dialog.type !== 'confirm') throw new Error('Reject did not traverse native browser confirmation.');
  if (after.current_step !== null) throw new Error(`Terminal rejected fixture still has a current step: ${JSON.stringify(after)}`);
  if (!after.workflow_final_status || after.workflow_final_status === 'pending') throw new Error(`Rejected fixture lacks terminal workflow truth: ${JSON.stringify(after)}`);
  return { dialog, after, resulting_url: page.url(), body_sample: (await page.locator('body').innerText()).slice(0, 1200) };
});

await test('SRWF-HOST-CORRECTION-001', 'native Revert routes Review to assigned User Input without GPP workflow ownership', async () => {
  const entryId = manifest.entries.revert;
  const beforeOperator = hostState(entryId, manifest.users.operator.id);
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptAction(page, 'revert');
  const operatorAfter = hostState(entryId, manifest.users.operator.id);
  const participantAfter = hostState(entryId, manifest.users.participant.id);
  if (!dialog || dialog.type !== 'confirm') throw new Error('Revert did not traverse native browser confirmation.');
  if (operatorAfter.current_step?.id !== correctionId || operatorAfter.current_step?.type !== 'user_input') throw new Error(`Revert did not reach User Input: ${JSON.stringify(operatorAfter)}`);
  if (operatorAfter.current_step?.can_update) throw new Error(`Operator retained correction edit authority unexpectedly: ${JSON.stringify(operatorAfter)}`);
  if (!participantAfter.current_step?.can_update) throw new Error(`Configured User Input participant did not receive native edit authority: ${JSON.stringify(participantAfter)}`);
  if (!participantAfter.current_step?.editable_fields?.includes('1')) throw new Error(`Native User Input editable field set is incorrect: ${JSON.stringify(participantAfter)}`);
  return { before_operator: beforeOperator, dialog, operator_after: operatorAfter, participant_after: participantAfter };
});

await test('SRWF-HOST-CORRECTION-002', 'User Input participant completes correction and native Next Step returns to same Review Approval', async () => {
  const entryId = manifest.entries.revert;
  await login(page, manifest.users.participant.login, participantPassword);
  const userInputUrl = frontendEntryUrl(manifest.routes.shortcode, entryId);
  await page.goto(userInputUrl, { waitUntil: 'networkidle' });
  const input = page.locator('input[name="input_1"]').first();
  if (await input.count() !== 1 || !(await input.isVisible())) throw new Error('Native User Input editable field is not visible to participant.');
  await input.fill('SYNTHETIC-CORRECTED-VALUE');
  const submit = page.locator(`#gform_submit_button_${formId}, form[id^="gform_"] input[type="submit"], form[id^="gform_"] button[type="submit"]`).filter({ visible: true }).last();
  if (await submit.count() < 1) throw new Error('Native User Input submit control unavailable.');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    submit.click(),
  ]);
  const participantAfter = hostState(entryId, manifest.users.participant.id);
  const operatorAfter = hostState(entryId, manifest.users.operator.id);
  if (operatorAfter.current_step?.id !== reviewId || operatorAfter.current_step?.type !== 'approval') throw new Error(`User Input did not route back to Review: ${JSON.stringify(operatorAfter)}`);
  if (!operatorAfter.current_step?.can_update) throw new Error(`Original registration operator did not regain native Review eligibility: ${JSON.stringify(operatorAfter)}`);
  if (participantAfter.current_step?.can_update) throw new Error(`Correction participant retained Review approval authority unexpectedly: ${JSON.stringify(participantAfter)}`);
  const value = wpEval(`echo GFAPI::get_entry(${Number(entryId)})['1'];`);
  if (value !== 'SYNTHETIC-CORRECTED-VALUE') throw new Error(`Native Gravity Forms correction value did not persist: ${value}`);
  return { user_input_url: userInputUrl, resulting_url: page.url(), participant_after: participantAfter, operator_after: operatorAfter, persisted_value: value };
});

await test('SRWF-HOST-RESULT-ERROR-001', 'invalid Approval status is explicitly rejected by host and does not establish a completed outcome', async () => {
  const entryId = manifest.entries.invalid;
  const before = hostState(entryId);
  const validation = validateInvalidStatus(entryId);
  const after = hostState(entryId);
  if (!validation.is_wp_error) throw new Error(`Host accepted invalid Approval status: ${JSON.stringify(validation)}`);
  if (after.current_step?.id !== reviewId || after.workflow_final_status !== 'pending') throw new Error(`Invalid action mutated host workflow: ${JSON.stringify({before,after})}`);
  return { validation, before, after, classification_ceiling: 'explicit host validation failure can support Technical Error; missing post-action truth must remain Unknown' };
});

await test('SRWF-HOST-NAV-001', 'frontend shortcode Entry Detail exposes native same-page canonical Inbox return', async () => {
  const entryId = manifest.entries.invalid;
  await login(page, manifest.users.operator.login, operatorPassword);
  const detailUrl = frontendEntryUrl(manifest.routes.shortcode, entryId);
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  const link = page.locator('.gravityflow-back-link-container .back-link').first();
  if (await link.count() !== 1) throw new Error('Native shortcode Entry Detail back link unavailable.');
  const href = await link.getAttribute('href');
  const expected = new URL(manifest.routes.shortcode.url).toString();
  const actual = new URL(href, baseUrl).toString();
  if (actual !== expected) throw new Error(`Native shortcode back link is not canonical page 1: ${JSON.stringify({actual,expected})}`);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), link.click()]);
  const returned = new URL(page.url());
  for (const key of ['view','lid','id','page','paged']) if (returned.searchParams.has(key)) throw new Error(`Return retained transient Entry Detail/paging query ${key}: ${returned}`);
  return { detail_url: detailUrl, native_href: actual, returned_url: returned.toString() };
});

await test('SRWF-HOST-NAV-002', 'registered Inbox Block route is measured for the same canonical return behavior', async () => {
  if (!manifest.routes.block) return { supported: false, reason: 'gravityflow/inbox block not registered in pinned runtime' };
  const entryId = manifest.entries.invalid;
  const detailUrl = frontendEntryUrl(manifest.routes.block, entryId);
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  const link = page.locator('.gravityflow-back-link-container .back-link').first();
  if (await link.count() !== 1) return { supported: true, native_back_link_emitted: false, detail_url: detailUrl, canonical_page_url: manifest.routes.block.url };
  const actual = new URL(await link.getAttribute('href'), baseUrl).toString();
  const expected = new URL(manifest.routes.block.url).toString();
  if (actual !== expected) throw new Error(`Native Block back link is not canonical page 1: ${JSON.stringify({actual,expected})}`);
  return { supported: true, native_back_link_emitted: true, detail_url: detailUrl, native_href: actual, canonical_page_url: expected };
});

await test('SRWF-HOST-NAV-003', 'admin Entry Detail has no native frontend back-link but canonical native admin Inbox route is stable', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const nativeBackLinks = await page.locator('.gravityflow-back-link-container .back-link').count();
  if (nativeBackLinks !== 0) throw new Error('Pinned admin Entry Detail unexpectedly emitted frontend back link.');
  const target = new URL(manifest.routes.admin_inbox_url);
  if (target.pathname !== '/wp-admin/admin.php' || target.searchParams.get('page') !== 'gravityflow-inbox') throw new Error(`Canonical admin Inbox authority changed: ${target}`);
  await page.goto(target.toString(), { waitUntil: 'networkidle' });
  if (!page.url().includes('page=gravityflow-inbox')) throw new Error(`Canonical admin Inbox route did not resolve: ${page.url()}`);
  return { admin_entry_url: adminEntryUrl(entryId), native_back_link_count: nativeBackLinks, canonical_admin_inbox: target.toString(), resolved_url: page.url() };
});

await browser.close();

const failures = results.filter(r => r.status !== 'PASS');
const payload = {
  schema_version: '1.0.0',
  data_class: 'SYNTHETIC_NON_PII',
  evidence_class: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  production_equivalence: 'NOT_PROVEN',
  runtime: manifest.runtime,
  results,
};
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(`${artifactDir}/srwf-journey-host-browser-results.json`, `${JSON.stringify(payload, null, 2)}\n`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('SRWF_JOURNEY_HOST_BROWSER_PASS');
