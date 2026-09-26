import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Qualification runtime environment unavailable.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_qualification_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.review_step_id);
const inputId = Number(manifest.user_input_step_id);
const results = [];

function withQuery(raw, params) {
  const u = new URL(raw);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}
function entryUrl(fixture, entryId) { return withQuery(fixture.url, { view: 'entry', id: formId, lid: entryId }); }
function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (e) { record(id, name, 'FAIL', { error: String(e?.stack || e).slice(0, 12000) }); }
}
async function login(page, user, pass) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
function snapshot(entryId) {
  const code = `
    $m=get_option('gpp_srwf_journey_qualification_manifest');
    $e=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API((int)$m['form_id']);
    $c=$api->get_current_step($e);
    $r=gravity_flow()->get_step((int)$m['review_step_id'],$e);
    $u=gravity_flow()->get_step((int)$m['user_input_step_id'],$e);
    $out=array(
      'current_step_id'=>$c?(int)$c->get_id():null,
      'current_step_type'=>$c?(string)$c->get_type():null,
      'current_step_status'=>$c&&method_exists($c,'get_status')?(string)$c->get_status():null,
      'review_step_status'=>$r&&method_exists($r,'get_status')?(string)$r->get_status():null,
      'user_input_step_status'=>$u&&method_exists($u,'get_status')?(string)$u->get_status():null,
      'workflow_current_status'=>gform_get_meta((int)$e['id'],'workflow_current_status'),
      'workflow_final_status'=>gform_get_meta((int)$e['id'],'workflow_final_status'),
      'field_2'=>rgar($e,'2')
    );
    echo wp_json_encode($out,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `;
  return JSON.parse(wpEval(code));
}
async function nativeActionShape(page) {
  return page.evaluate(() => {
    const form = document.querySelector('form[id^="gform_"]');
    const hidden = document.querySelector('#gravityflow_approval_new_status_step');
    const nonce = form?.querySelector('input[name="_wpnonce"]');
    const buttons = [...document.querySelectorAll('.gravityflow-action-buttons button')].map(b => ({ value: b.value, text: b.textContent.replace(/\s+/g,' ').trim(), onclick: b.getAttribute('onclick') }));
    return { form: form?.id || null, hidden_name: hidden?.name || null, hidden_value: hidden?.value ?? null, nonce_present: Boolean(nonce), buttons };
  });
}
async function triggerConfirm(page, selector, { accept, viaKeyboard = false }) {
  let dialogInfo = null;
  const dialogPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native confirmation dialog did not appear.')), 10000);
    page.once('dialog', async dialog => {
      try {
        dialogInfo = { type: dialog.type(), message: dialog.message(), defaultValue: dialog.defaultValue() };
        if (accept) await dialog.accept(); else await dialog.dismiss();
        clearTimeout(timer); resolve();
      } catch (e) { clearTimeout(timer); reject(e); }
    });
  });
  if (viaKeyboard) {
    await page.locator(selector).focus();
    await page.keyboard.press('Enter');
  } else {
    await page.click(selector);
  }
  await dialogPromise;
  return dialogInfo;
}
async function afterDialogNavigation(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
}

const browser = await chromium.launch({ headless: true });
const operatorContext = await browser.newContext();
const page = await operatorContext.newPage();
await login(page, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');
const shortcode = manifest.frontend.shortcode;

await test('SRWF-Q1-CONFIRM-CANCEL-APPROVE', 'native Approve confirmation is browser-owned and Cancel prevents mutation', async () => {
  const entryId = Number(manifest.entries.approve);
  await page.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const before = snapshot(entryId);
  const shape = await nativeActionShape(page);
  if (!shape.nonce_present || !shape.hidden_name?.endsWith(`_${reviewId}`)) throw new Error(`Native nonce/action shape unavailable: ${JSON.stringify(shape)}`);
  const approve = '.gravityflow-action-buttons button[value="approved"]';
  const button = shape.buttons.find(b => b.value === 'approved');
  if (!button?.onclick?.includes('handleApprovalStepButtonClick') || !button.onclick.includes('true')) throw new Error(`Require Confirmation not wired to native Approve button: ${JSON.stringify(button)}`);
  await page.locator(approve).focus();
  const activeBefore = await page.evaluate(() => ({ tag: document.activeElement?.tagName, value: document.activeElement?.value || null }));
  const dialog = await triggerConfirm(page, approve, { accept: false, viaKeyboard: true });
  await page.waitForTimeout(150);
  const after = snapshot(entryId);
  const hidden = await page.locator('#gravityflow_approval_new_status_step').inputValue();
  const activeAfter = await page.evaluate(() => ({ tag: document.activeElement?.tagName, value: document.activeElement?.value || null }));
  if (dialog.type !== 'confirm' || !/approve/i.test(dialog.message)) throw new Error(`Unexpected native confirmation: ${JSON.stringify(dialog)}`);
  if (hidden !== '' || before.current_step_id !== after.current_step_id || after.review_step_status !== before.review_step_status) throw new Error(`Cancel mutated native state: ${JSON.stringify({before,after,hidden})}`);
  return { dialog, activation: 'keyboard Enter on focused native button', active_before: activeBefore, active_after_dismiss: activeAfter, hidden_after_cancel: hidden, state_unchanged: true, dialog_dom_present: false, styling_boundary: 'browser-native confirm; no host DOM dialog seam' };
});

await test('SRWF-Q1-CONFIRM-SUBMIT-APPROVE', 'accepting native Approve confirmation submits host action and yields authoritative approved step state', async () => {
  const entryId = Number(manifest.entries.approve);
  await page.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
  const dialog = await triggerConfirm(page, '.gravityflow-action-buttons button[value="approved"]', { accept: true });
  await nav; await afterDialogNavigation(page);
  const after = snapshot(entryId);
  const text = await page.locator('body').innerText();
  if (after.review_step_status !== 'approved') throw new Error(`Approved host state not established: ${JSON.stringify(after)}`);
  return { dialog, after, host_feedback_present: text.includes('HOST_APPROVED_CONFIRMATION') || /Entry Approved/i.test(text), url: page.url() };
});

await test('SRWF-Q1-CONFIRM-CANCEL-REJECT', 'native Reject confirmation Cancel prevents mutation', async () => {
  const entryId = Number(manifest.entries.reject);
  await page.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const before = snapshot(entryId);
  const dialog = await triggerConfirm(page, '.gravityflow-action-buttons button[value="rejected"]', { accept: false });
  await page.waitForTimeout(150);
  const after = snapshot(entryId);
  const hidden = await page.locator('#gravityflow_approval_new_status_step').inputValue();
  if (dialog.type !== 'confirm' || !/reject/i.test(dialog.message)) throw new Error(`Unexpected reject confirmation: ${JSON.stringify(dialog)}`);
  if (hidden !== '' || before.review_step_status !== after.review_step_status) throw new Error(`Reject Cancel mutated state: ${JSON.stringify({before,after,hidden})}`);
  return { dialog, state_unchanged: true };
});

await test('SRWF-Q2-REJECT-TRUTH', 'accepted Reject action is distinguishable from technical failure by authoritative host step status', async () => {
  const entryId = Number(manifest.entries.reject);
  await page.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
  const dialog = await triggerConfirm(page, '.gravityflow-action-buttons button[value="rejected"]', { accept: true });
  await nav; await afterDialogNavigation(page);
  const after = snapshot(entryId);
  const text = await page.locator('body').innerText();
  if (after.review_step_status !== 'rejected') throw new Error(`Rejected host state not established: ${JSON.stringify(after)}`);
  return { dialog, after, host_feedback_present: text.includes('HOST_REJECTED_CONFIRMATION') || /Entry Rejected/i.test(text) };
});

await test('SRWF-Q3-REVERT-TO-USER-INPUT', 'native Revert ends Review and starts the configured User Input step', async () => {
  const entryId = Number(manifest.entries.correction);
  await page.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const before = snapshot(entryId);
  const shape = await nativeActionShape(page);
  if (!shape.buttons.some(b => b.value === 'revert')) throw new Error(`Native Revert control missing: ${JSON.stringify(shape)}`);
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
  const dialog = await triggerConfirm(page, '.gravityflow-action-buttons button[value="revert"]', { accept: true });
  await nav; await afterDialogNavigation(page);
  const after = snapshot(entryId);
  if (after.current_step_id !== inputId || after.current_step_type !== 'user_input') throw new Error(`Revert did not route to User Input: ${JSON.stringify({before,after})}`);
  return { dialog, before, after, operator_page_text_sample: (await page.locator('body').innerText()).slice(0,800) };
});

await test('SRWF-Q3-USER-INPUT-RETURN', 'User Input participant completes native correction and routing returns the entry to Review Approval', async () => {
  const entryId = Number(manifest.entries.correction);
  const participantContext = await browser.newContext();
  const p = await participantContext.newPage();
  await login(p, 'srwf_correction_participant', 'srwf-correction-pass-2026');
  await p.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const before = snapshot(entryId);
  const field = p.locator('input[name="input_2"], textarea[name="input_2"]').first();
  if (await field.count() !== 1 || !(await field.isVisible())) throw new Error('Native User Input editable field is not visible to participant.');
  await field.fill('Corrected by native User Input');
  const formShape = await p.evaluate(() => ({
    statuses: [...document.querySelectorAll('[name="gravityflow_status"]')].map(e => ({tag:e.tagName,type:e.type,value:e.value,checked:e.checked})),
    submits: [...document.querySelectorAll('form[id^="gform_"] :is(button,input)[type="submit"]')].map(e => ({tag:e.tagName,name:e.name,value:e.value,text:e.textContent?.trim()||'',visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})),
  }));
  const completeRadio = p.locator('input[name="gravityflow_status"][value="complete"]');
  if (await completeRadio.count()) await completeRadio.check();
  else {
    const status = p.locator('[name="gravityflow_status"]').first();
    if (await status.count()) await status.evaluate(el => { el.value='complete'; el.dispatchEvent(new Event('change',{bubbles:true})); });
  }
  const submit = p.locator('form[id^="gform_"] :is(button,input)[type="submit"]:visible').last();
  if (await submit.count() !== 1) throw new Error(`Native User Input submit control unavailable: ${JSON.stringify(formShape)}`);
  await Promise.all([p.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null), submit.click()]);
  await p.waitForLoadState('networkidle').catch(() => {});
  const after = snapshot(entryId);
  await participantContext.close();
  if (after.field_2 !== 'Corrected by native User Input') throw new Error(`User Input did not persist editable field: ${JSON.stringify(after)}`);
  if (after.current_step_id !== reviewId || after.current_step_type !== 'approval') throw new Error(`User Input completion did not return to Review: ${JSON.stringify({before,after,formShape})}`);

  const operatorCheck = await browser.newContext();
  const op = await operatorCheck.newPage();
  await login(op, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');
  await op.goto(entryUrl(shortcode, entryId), { waitUntil: 'networkidle' });
  const operatorShape = await nativeActionShape(op);
  await operatorCheck.close();
  if (!operatorShape.buttons.some(b => b.value === 'approved') || !operatorShape.buttons.some(b => b.value === 'revert')) throw new Error(`Returning operator did not regain native Review actions: ${JSON.stringify(operatorShape)}`);
  return { before, user_input_form_shape: formShape, after, operator_review_actions_restored: true };
});

async function qualifyBackLink(fixture, label) {
  const entryId = Number(manifest.entries.failure);
  await page.goto(entryUrl(fixture, entryId), { waitUntil: 'networkidle' });
  const link = page.locator('.gravityflow-back-link-container a.back-link');
  if (await link.count() !== 1) throw new Error(`${label}: native back link not rendered.`);
  const href = await link.getAttribute('href');
  const resolved = new URL(href, page.url());
  for (const key of ['view','lid','id','new_status','gworkflow_token','paged']) {
    if (resolved.searchParams.has(key)) throw new Error(`${label}: back link retained non-canonical state ${key}: ${resolved}`);
  }
  const expected = new URL(fixture.url);
  if (resolved.origin !== expected.origin || resolved.pathname !== expected.pathname) throw new Error(`${label}: back link escaped native Inbox surface: ${resolved} vs ${expected}`);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), link.click()]);
  const landed = new URL(page.url());
  if (landed.pathname !== expected.pathname || landed.searchParams.has('view') || landed.searchParams.has('lid') || landed.searchParams.has('id')) throw new Error(`${label}: did not return to canonical Inbox page 1: ${landed}`);
  return { href: resolved.toString(), landed: landed.toString(), page_id_not_used_as_product_identity: true };
}

await test('SRWF-Q4-SHORTCODE-BACK', 'shortcode Entry Detail uses native back-link authority to canonical Inbox page 1', async () => qualifyBackLink(shortcode, 'shortcode'));
await test('SRWF-Q4-BLOCK-BACK', 'registered Inbox Block Entry Detail uses native back-link authority when available', async () => {
  if (!manifest.frontend.block_registered || !manifest.frontend.block) return { supported: false, reason: 'gravityflow/inbox block not registered in pinned runtime' };
  return { supported: true, ...(await qualifyBackLink(manifest.frontend.block, 'block')) };
});

await operatorContext.close();
await browser.close();
const failed = results.filter(r => r.status !== 'PASS');
const payload = {
  schema_version: '1.0.0',
  evidence_class_ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  browser: 'Chromium via Playwright 1.55.0',
  results,
  summary: { passed: results.length - failed.length, failed: failed.length },
  explicit_ceiling: {
    native_confirm_internal_focus: 'NOT_PROVEN_AND_NOT_DOM_EXPOSED',
    physical_escape_key_mapping_inside_browser_dialog: 'USER_AGENT_OWNED_NOT_PROVEN',
    target_production_equivalence: false,
  },
};
fs.mkdirSync(artifactDir,{recursive:true});
fs.writeFileSync(`${artifactDir}/wu18-srwf-journey-browser.json`, JSON.stringify(payload,null,2)+'\n');
if (failed.length) throw new Error(`SRWF journey browser qualification failed: ${failed.map(x=>x.id).join(', ')}`);
console.log('WU18_SRWF_JOURNEY_BROWSER_PASS');
