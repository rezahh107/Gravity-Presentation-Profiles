import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
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
const operatorAssignee = `user_id|${Number(manifest.users.operator.id)}`;
const negativeControlAssignee = `user_id|${Number(manifest.users.negative_control.id)}`;
const asStringArray = value => Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)];

function hostState(entryId, asUserId = manifest.users.operator.id) {
  const code = `
    wp_set_current_user(${Number(asUserId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    $timeline=$api->get_timeline($entry);
    echo wp_json_encode(array(
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
        'feed_assignees'=>(array) rgar($step->get_feed_meta(),'assignees')
      ) : null,
      'timeline'=>$timeline
    ), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `;
  return JSON.parse(wpEval(code));
}

function validationProbe(entryId) {
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
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function actionBoxState(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')];
    const hidden = document.querySelector('#gravityflow_approval_new_status_step');
    const nonce = document.querySelector('input[name="_wpnonce"]');
    return {
      box_present: Boolean(document.querySelector('.gravityflow-status-box')),
      buttons: buttons.map((b, index) => ({ index, value: b.value, text: b.textContent.replace(/\s+/g, ' ').trim(), onclick: b.getAttribute('onclick') || '' })),
      hidden_present: Boolean(hidden), hidden_value: hidden?.value ?? null,
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
  page.once('dialog', async dialog => { dialogInfo = { type: dialog.type(), message: dialog.message() }; await dialog.accept(); });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), button.click()]);
  return dialogInfo;
}
async function assertCanonicalInbox(page, routeUrl, label) {
  await page.goto(routeUrl, { waitUntil: 'networkidle' });
  const current = new URL(page.url());
  for (const key of ['view','lid','id','paged']) {
    if (current.searchParams.has(key)) throw new Error(`${label} canonical route retained detail/paging state ${key}: ${current}`);
  }
  const grid = page.locator('[data-js="gflow-inbox"]');
  const search = page.locator('[data-js="gflow-inbox-search"]');
  if (await grid.count() !== 1 || await search.count() !== 1) throw new Error(`${label} canonical route did not render the native Inbox grid.`);
  return { url: current.toString(), grid_count: await grid.count(), search_count: await search.count() };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page, manifest.users.operator.login, operatorPassword);

await test('SRWF-HOST-CORRECTION-CONFIG-001', 'host-effective Review and User Input feeds enforce the SAME operator assignment', async () => {
  const reviewAssignees = asStringArray(manifest.steps.review_feed_meta?.assignees);
  const correctionAssignees = asStringArray(manifest.steps.correction_feed_meta?.assignees);
  if (reviewAssignees.length !== 1 || reviewAssignees[0] !== operatorAssignee) {
    throw new Error(`Review is not assigned exclusively to the synthetic registration operator: ${JSON.stringify(reviewAssignees)}`);
  }
  if (correctionAssignees.length !== 1 || correctionAssignees[0] !== operatorAssignee || correctionAssignees.includes(negativeControlAssignee)) {
    throw new Error(`User Input does not preserve SAME-OPERATOR assignment: ${JSON.stringify({ correctionAssignees, operatorAssignee, negativeControlAssignee })}`);
  }
  return {
    operator_id: Number(manifest.users.operator.id),
    negative_control_id: Number(manifest.users.negative_control.id),
    review_assignees: reviewAssignees,
    correction_assignees: correctionAssignees,
    different_participant_assignment_would_fail: true,
  };
});

await test('SRWF-HOST-CONFIRM-001', 'native Approval confirmation is browser-owned and cancel preserves host state', async () => {
  const entryId = manifest.entries.approve;
  const before = hostState(entryId);
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const initial = await actionBoxState(page);
  if (!initial.nonce_present || !initial.hidden_present) throw new Error(`Native nonce/status carrier missing: ${JSON.stringify(initial)}`);
  if (initial.buttons.map(x => x.value).join(',') !== 'approved,rejected,revert') throw new Error(`Native action ordering drifted: ${JSON.stringify(initial.buttons)}`);
  if (!initial.buttons.every(x => x.onclick.includes('handleApprovalStepButtonClick'))) throw new Error(`Native approval handler missing: ${JSON.stringify(initial.buttons)}`);
  if (initial.dom_dialog_count !== 0) throw new Error(`Unexpected DOM confirmation markup exists: ${JSON.stringify(initial)}`);
  const approve = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  let dialogInfo = null;
  page.once('dialog', async dialog => { dialogInfo = { type: dialog.type(), message: dialog.message() }; await dialog.dismiss(); });
  await approve.click();
  await page.waitForTimeout(150);
  const afterUi = await actionBoxState(page);
  const after = hostState(entryId);
  if (!dialogInfo || dialogInfo.type !== 'confirm') throw new Error(`Host did not emit native browser confirm: ${JSON.stringify(dialogInfo)}`);
  if (after.current_step?.id !== before.current_step?.id || after.workflow_final_status !== before.workflow_final_status) throw new Error('Cancelled confirm mutated host workflow.');
  if (afterUi.hidden_value !== '' || afterUi.active_value !== 'approved') throw new Error(`Cancel/focus behavior changed: ${JSON.stringify(afterUi)}`);
  return { initial, dialog: dialogInfo, after_cancel_ui: afterUi, before, after, exact_keyboard_semantics: 'UA-owned; physical Escape not independently asserted' };
});

await test('SRWF-HOST-RESULT-APPROVE-001', 'accepted Approve produces authoritative completed host truth', async () => {
  const entryId = manifest.entries.approve;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptAction(page, 'approved');
  const after = hostState(entryId);
  if (!dialog || after.current_step !== null || after.workflow_final_status !== 'approved' || after.api_status !== 'approved') throw new Error(`Approved host truth missing: ${JSON.stringify({dialog,after})}`);
  const body = (await page.locator('body').innerText()).slice(0, 1800);
  if (!body.includes('Entry Approved') || !body.includes('Status: Approved')) throw new Error('Native approved render truth missing.');
  return { dialog, after, resulting_url: page.url(), native_render_truth: ['Entry Approved','Status: Approved'] };
});

await test('SRWF-HOST-RESULT-REJECT-001', 'accepted Reject produces authoritative completed host truth', async () => {
  const entryId = manifest.entries.reject;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptAction(page, 'rejected');
  const after = hostState(entryId);
  if (!dialog || after.current_step !== null || after.workflow_final_status !== 'rejected' || after.api_status !== 'rejected') throw new Error(`Rejected host truth missing: ${JSON.stringify({dialog,after})}`);
  const body = (await page.locator('body').innerText()).slice(0, 1800);
  if (!body.includes('Entry Rejected') || !body.includes('Status: Rejected')) throw new Error('Native rejected render truth missing.');
  return { dialog, after, resulting_url: page.url(), native_render_truth: ['Entry Rejected','Status: Rejected'] };
});

await test('SRWF-HOST-CORRECTION-001', 'native Revert preserves correction authority for the SAME registration operator', async () => {
  const entryId = manifest.entries.revert;
  const beforeOperator = hostState(entryId, manifest.users.operator.id);
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptAction(page, 'revert');
  const operatorAfter = hostState(entryId, manifest.users.operator.id);
  const negativeControlAfter = hostState(entryId, manifest.users.negative_control.id);
  if (!dialog || operatorAfter.current_step?.id !== correctionId || operatorAfter.current_step?.type !== 'user_input') throw new Error(`Revert did not reach User Input: ${JSON.stringify(operatorAfter)}`);
  if (!operatorAfter.current_step?.can_update || negativeControlAfter.current_step?.can_update || !operatorAfter.current_step?.editable_fields?.includes('1')) {
    throw new Error(`Native SAME-OPERATOR correction authorization/editability wrong: ${JSON.stringify({operatorAfter,negativeControlAfter})}`);
  }
  return { before_operator: beforeOperator, dialog, operator_after: operatorAfter, negative_control_after: negativeControlAfter };
});

await test('SRWF-HOST-CORRECTION-002', 'SAME operator completes native User Input and remains eligible when Review returns', async () => {
  const entryId = manifest.entries.revert;
  await login(page, manifest.users.operator.login, operatorPassword);
  const userInputUrl = frontendEntryUrl(manifest.routes.shortcode, entryId);
  await page.goto(userInputUrl, { waitUntil: 'networkidle' });
  const input = page.locator('input[name="input_1"]').first();
  if (await input.count() !== 1 || !(await input.isVisible())) throw new Error('Native User Input field unavailable to the assigned registration operator.');
  await input.fill('SYNTHETIC-CORRECTED-VALUE');
  const submit = page.locator(`#gform_submit_button_${formId}, form[id^="gform_"] input[type="submit"], form[id^="gform_"] button[type="submit"]`).filter({ visible: true }).last();
  if (await submit.count() < 1) throw new Error('Native User Input submit unavailable.');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
  const operatorAfter = hostState(entryId, manifest.users.operator.id);
  const negativeControlAfter = hostState(entryId, manifest.users.negative_control.id);
  if (operatorAfter.current_step?.id !== reviewId || operatorAfter.current_step?.type !== 'approval' || !operatorAfter.current_step?.can_update || negativeControlAfter.current_step?.can_update) {
    throw new Error(`Return-to-Review SAME-OPERATOR ownership wrong: ${JSON.stringify({operatorAfter,negativeControlAfter})}`);
  }
  const value = wpEval(`echo GFAPI::get_entry(${Number(entryId)})['1'];`);
  if (value !== 'SYNTHETIC-CORRECTED-VALUE') throw new Error(`Corrected value did not persist: ${value}`);
  return { user_input_url: userInputUrl, resulting_url: page.url(), operator_after: operatorAfter, negative_control_after: negativeControlAfter, persisted_value: value };
});

await test('SRWF-HOST-RESULT-NEGATIVE-VALIDATOR-001', 'Approval validator alone is not a safe Technical Error truth seam', async () => {
  const entryId = manifest.entries.invalid;
  const before = hostState(entryId);
  const validation = validationProbe(entryId);
  const after = hostState(entryId);
  if (validation.is_wp_error) throw new Error(`Pinned host behavior changed: arbitrary status is now validator-rejected: ${JSON.stringify(validation)}`);
  if (after.current_step?.id !== before.current_step?.id || after.workflow_final_status !== before.workflow_final_status) throw new Error('Validator probe mutated workflow.');
  return { validation, before, after, disposition: 'validate_status_update is not an authoritative Technical Error classifier' };
});

await test('SRWF-HOST-RESULT-FAILURE-NONCE-001', 'invalid native Approval nonce fails closed and leaves workflow pending', async () => {
  const entryId = manifest.entries.invalid;
  await login(page, manifest.users.operator.login, operatorPassword);
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const before = hostState(entryId);
  await page.evaluate(() => { const n=document.querySelector('input[name="_wpnonce"]'); if(n) n.value='invalid-synthetic-nonce'; });
  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  let dialogInfo = null;
  page.once('dialog', async dialog => { dialogInfo={type:dialog.type(),message:dialog.message()}; await dialog.accept(); });
  const responsePromise = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
  await button.click();
  const response = await responsePromise;
  const after = hostState(entryId);
  const body = (await page.locator('body').innerText()).slice(0, 1200);
  if (!dialogInfo || dialogInfo.type !== 'confirm') throw new Error('Nonce failure did not traverse native confirmation.');
  if (after.current_step?.id !== reviewId || after.workflow_final_status !== 'pending') throw new Error(`Nonce failure mutated workflow: ${JSON.stringify(after)}`);
  if (response && response.status() < 400 && !/Are you sure|nonce|expired|invalid/i.test(body)) throw new Error(`Nonce failure lacked native failure surface: ${response.status()} ${body}`);
  return { dialog: dialogInfo, http_status: response?.status() ?? null, body_sample: body, before, after, safe_completed_result: false };
});

await test('SRWF-HOST-RESULT-AMBIGUOUS-001', 'aborted action transport cannot justify a completed outcome before authoritative read-back', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const before = hostState(entryId);
  let aborted = false;
  await page.route('**/*', async route => {
    const req = route.request();
    if (!aborted && req.method() === 'POST' && new URL(req.url()).pathname === '/wp-admin/admin.php') { aborted = true; await route.abort('failed'); return; }
    await route.continue();
  });
  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  let dialogInfo = null;
  page.once('dialog', async dialog => { dialogInfo={type:dialog.type(),message:dialog.message()}; await dialog.accept(); });
  let navigationError = null;
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(error => { navigationError=String(error); return null; });
  try { await button.click({ timeout: 5000 }); } catch (error) { navigationError = navigationError || String(error); }
  await nav;
  await page.unroute('**/*');
  const after = hostState(entryId);
  if (!aborted || !dialogInfo) throw new Error(`Transport ambiguity was not actually exercised: ${JSON.stringify({aborted,dialogInfo,navigationError})}`);
  if (after.current_step?.id !== reviewId || after.workflow_final_status !== 'pending') throw new Error(`Aborted transport mutated workflow: ${JSON.stringify(after)}`);
  return { dialog: dialogInfo, transport_aborted: aborted, navigation_error: navigationError, before, authoritative_readback: after, safe_ui_before_readback: 'UNKNOWN_ONLY' };
});

await test('SRWF-HOST-NAV-001', 'shortcode Entry Detail has no default native back-link but its WordPress page permalink is canonical Inbox page 1', async () => {
  await login(page, manifest.users.operator.login, operatorPassword);
  const detailUrl = frontendEntryUrl(manifest.routes.shortcode, manifest.entries.invalid);
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  const nativeBackLinkCount = await page.locator('.gravityflow-back-link-container .back-link').count();
  if (nativeBackLinkCount !== 0) throw new Error('Default shortcode fixture unexpectedly emitted opt-in native back-link.');
  const canonical = await assertCanonicalInbox(page, manifest.routes.shortcode.url, 'shortcode');
  return { detail_url: detailUrl, native_back_link_count: nativeBackLinkCount, canonical, native_back_link_requires_host_back_link_configuration: true };
});

await test('SRWF-HOST-NAV-002', 'registered Inbox Block page permalink is canonical Inbox page 1', async () => {
  if (!manifest.routes.block) return { supported: false, reason: 'gravityflow/inbox block not registered in pinned runtime' };
  const detailUrl = frontendEntryUrl(manifest.routes.block, manifest.entries.invalid);
  await page.goto(detailUrl, { waitUntil: 'networkidle' });
  const nativeBackLinkCount = await page.locator('.gravityflow-back-link-container .back-link').count();
  const canonical = await assertCanonicalInbox(page, manifest.routes.block.url, 'block');
  return { supported: true, detail_url: detailUrl, native_back_link_count: nativeBackLinkCount, canonical };
});

await test('SRWF-HOST-NAV-003', 'admin Entry Detail uses stable native admin Inbox route authority', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const nativeBackLinks = await page.locator('.gravityflow-back-link-container .back-link').count();
  if (nativeBackLinks !== 0) throw new Error('Pinned admin Entry Detail unexpectedly emitted frontend back link.');
  const target = new URL(manifest.routes.admin_inbox_url);
  if (target.pathname !== '/wp-admin/admin.php' || target.searchParams.get('page') !== 'gravityflow-inbox') throw new Error(`Admin Inbox authority changed: ${target}`);
  await page.goto(target.toString(), { waitUntil: 'networkidle' });
  if (await page.locator('[data-js="gflow-inbox"]').count() !== 1) throw new Error('Canonical admin Inbox route did not render native Inbox.');
  return { admin_entry_url: adminEntryUrl(entryId), native_back_link_count: nativeBackLinks, canonical_admin_inbox: target.toString(), resolved_url: page.url() };
});

await browser.close();
const failures = results.filter(r => r.status !== 'PASS');
const payload = { schema_version:'1.2.0', data_class:'SYNTHETIC_NON_PII', evidence_class:'PROVEN_IN_REPRODUCIBLE_SIMULATION', production_equivalence:'NOT_PROVEN', runtime:manifest.runtime, results };
fs.mkdirSync(artifactDir, { recursive:true });
fs.writeFileSync(`${artifactDir}/srwf-journey-host-browser-results.json`, `${JSON.stringify(payload,null,2)}\n`);
if (failures.length) { console.error(JSON.stringify(failures,null,2)); process.exit(1); }
console.log('SRWF_JOURNEY_HOST_BROWSER_PASS');
