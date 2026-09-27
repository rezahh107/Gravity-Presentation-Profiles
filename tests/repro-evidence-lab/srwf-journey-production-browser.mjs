import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned production-journey environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);
if (manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED') throw new Error('Production Entry Detail presentation was not admitted in the lab.');

function hostState(entryId, asUserId = manifest.users.operator.id) {
  const code = `
    wp_set_current_user(${Number(asUserId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    echo wp_json_encode(array(
      'entry_id'=>(int)$entry['id'],
      'field_1'=>(string)rgar($entry,'1'),
      'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>(string)$api->get_status($entry),
      'current_step'=>$step ? array(
        'id'=>(int)$step->get_id(),
        'type'=>(string)$step->get_type(),
        'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step),
        'editable_fields'=>method_exists($step,'get_editable_fields') ? array_values(array_map('strval',$step->get_editable_fields())) : array()
      ) : null
    ), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `;
  return JSON.parse(wpEval(code));
}

function frontendEntryUrl(route, entryId) {
  const url = new URL(route.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}
const adminEntryUrl = entryId => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${formId}&lid=${entryId}`;

const results = [];
async function test(id, name, fn) {
  try { results.push({ id, name, status: 'PASS', details: await fn() }); }
  catch (error) { results.push({ id, name, status: 'FAIL', details: { error: String(error?.stack || error).slice(0, 12000) } }); }
}

async function login(page, user, pass = operatorPassword) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}

async function returnControls(page) {
  return page.evaluate(() => ({
    gpp: [...document.querySelectorAll('a.gpp-entry-journey__return')].filter(a => a.offsetParent !== null).map(a => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href })),
    native: [...document.querySelectorAll('.gravityflow-back-link-container a.back-link')].filter(a => a.offsetParent !== null).map(a => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.href })),
  }));
}

function canonicalComparable(url) {
  const u = new URL(url);
  for (const key of ['view', 'lid', 'id', 'paged', 'search', 'sort', 'sort_field', 'sort_direction']) u.searchParams.delete(key);
  return `${u.origin}${u.pathname}${u.search}`;
}

async function assertOneCanonicalReturn(page, expectedRoute) {
  const controls = await returnControls(page);
  const all = [...controls.gpp, ...controls.native];
  if (all.length !== 1) throw new Error(`Expected exactly one visible return control: ${JSON.stringify(controls)}`);
  if (!all[0].text.includes('بازگشت') && !all[0].text.toLowerCase().includes('return')) throw new Error(`Return control is not clearly named: ${JSON.stringify(all[0])}`);
  if (canonicalComparable(all[0].href) !== canonicalComparable(expectedRoute.url)) throw new Error(`Return target is not canonical Inbox page 1: ${JSON.stringify({ actual: all[0].href, expected: expectedRoute.url })}`);
  return { controls, selected: all[0] };
}

async function assertCanonicalInboxAfterClick(page, expectedRoute) {
  const controls = await returnControls(page);
  const all = [...controls.gpp, ...controls.native];
  if (all.length !== 1) throw new Error(`Cannot click non-unique return control: ${JSON.stringify(controls)}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.locator('a.gpp-entry-journey__return, .gravityflow-back-link-container a.back-link').filter({ visible: true }).first().click(),
  ]);
  const current = new URL(page.url());
  for (const key of ['view', 'lid', 'id', 'paged', 'search', 'sort', 'sort_field', 'sort_direction']) {
    if (current.searchParams.has(key)) throw new Error(`Canonical return retained transient ${key}: ${current}`);
  }
  if (canonicalComparable(current.toString()) !== canonicalComparable(expectedRoute.url)) throw new Error(`Return landed outside canonical Inbox route: ${current}`);
  if (await page.locator('[data-js="gflow-inbox"]').count() !== 1) throw new Error('Canonical return did not render the native Gravity Flow Inbox grid.');
  return current.toString();
}

async function nativeActionButtons(page) {
  return page.locator('.gravityflow-status-box .gravityflow-action-buttons button').evaluateAll(nodes => nodes.filter(n => n.offsetParent !== null).map(n => ({
    value: n.value,
    text: n.textContent.replace(/\s+/g, ' ').trim(),
    onclick: n.getAttribute('onclick') || '',
  })));
}

async function acceptNativeAction(page, value) {
  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native Gravity Flow action ${value}.`);
  let dialogInfo = null;
  const dialogPromise = new Promise(resolve => {
    page.once('dialog', async dialog => {
      dialogInfo = { type: dialog.type(), message: dialog.message() };
      await dialog.accept();
      resolve();
    });
  });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), button.click(), dialogPromise]);
  return dialogInfo;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await login(page, manifest.users.operator.login);

await test('SRWF-PROD-REVIEW-001', 'admitted Review preserves dossier/native actions and adds one canonical return', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  if (await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').count() !== 1) throw new Error('Approved Entry Detail vNext dossier was not preserved.');
  const actions = await nativeActionButtons(page);
  if (actions.map(x => x.value).join(',') !== 'approved,rejected,revert') throw new Error(`Native workflow action set changed: ${JSON.stringify(actions)}`);
  if (!actions.every(x => x.onclick.includes('handleApprovalStepButtonClick'))) throw new Error('Native Gravity Flow action handler ownership changed.');
  if (await page.locator('.gpp-entry-journey button, .gpp-entry-journey-result button').count() !== 0) throw new Error('GPP manufactured a journey workflow button.');
  return { actions, return_control: await assertOneCanonicalReturn(page, manifest.routes.shortcode), dossier_count: 1 };
});

await test('SRWF-PROD-CONFIRM-CANCEL-001', 'browser-native Approve confirmation cancel preserves state and emits no result', async () => {
  const entryId = manifest.entries.approve;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const before = hostState(entryId);
  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  let dialogInfo = null;
  page.once('dialog', async dialog => { dialogInfo = { type: dialog.type(), message: dialog.message() }; await dialog.dismiss(); });
  await button.click();
  await page.waitForTimeout(150);
  const after = hostState(entryId);
  if (!dialogInfo || dialogInfo.type !== 'confirm') throw new Error(`Approval confirmation is not browser-native: ${JSON.stringify(dialogInfo)}`);
  if (after.current_step?.id !== before.current_step?.id || after.workflow_final_status !== before.workflow_final_status || after.api_status !== before.api_status) throw new Error('Cancel mutated authoritative workflow state.');
  if (await page.locator('[data-gpp-entry-journey-result]').count() !== 0) throw new Error('Cancelled confirmation produced semantic result presentation.');
  return { dialog: dialogInfo, before, after, result_count: 0, keyboard_semantics: 'native browser ownership retained; physical Escape not separately asserted' };
});

await test('SRWF-PROD-APPROVE-001', 'Approve read-back gates Approved result and canonical continuation', async () => {
  const entryId = manifest.entries.approve;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptNativeAction(page, 'approved');
  const state = hostState(entryId);
  if (!dialog || dialog.type !== 'confirm' || state.current_step !== null || state.workflow_final_status !== 'approved' || state.api_status !== 'approved') throw new Error(`Authoritative Approved truth not established: ${JSON.stringify({ dialog, state })}`);
  const result = page.locator('[data-gpp-entry-journey-result="approved"]').first();
  if (await result.count() !== 1 || await result.getAttribute('role') !== 'status') throw new Error('Approved semantic result is missing or inaccessible.');
  const text = await result.innerText();
  if (!text.includes('پرونده تأیید شد') || !text.includes('Journey Approve') || !text.includes('JRN-PROD-APPROVE')) throw new Error(`Approved result lost compact case identity: ${text}`);
  return { dialog, authoritative_readback: state, result_text: text, return_control: await assertOneCanonicalReturn(page, manifest.routes.shortcode) };
});

await test('SRWF-PROD-REJECT-001', 'Reject read-back gates Rejected business result without error semantics', async () => {
  const entryId = manifest.entries.reject;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptNativeAction(page, 'rejected');
  const state = hostState(entryId);
  if (!dialog || dialog.type !== 'confirm' || state.current_step !== null || state.workflow_final_status !== 'rejected' || state.api_status !== 'rejected') throw new Error(`Authoritative Rejected truth not established: ${JSON.stringify({ dialog, state })}`);
  const result = page.locator('[data-gpp-entry-journey-result="rejected"]').first();
  if (await result.count() !== 1 || await result.getAttribute('role') !== 'status') throw new Error('Rejected semantic result is missing or inaccessible.');
  const text = await result.innerText();
  if (!text.includes('پرونده رد شد') || /technical|خطای فنی|مشکل فنی/i.test(text)) throw new Error(`Rejected was misrepresented as a technical error: ${text}`);
  return { dialog, authoritative_readback: state, result_text: text, return_control: await assertOneCanonicalReturn(page, manifest.routes.shortcode) };
});

await test('SRWF-PROD-CORRECTION-001', 'native Revert exposes SAME-operator User Input guidance without a second editor', async () => {
  const entryId = manifest.entries.revert;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const dialog = await acceptNativeAction(page, 'revert');
  const operatorState = hostState(entryId, manifest.users.operator.id);
  if (operatorState.current_step?.id !== correctionId || operatorState.current_step?.type !== 'user_input' || !operatorState.current_step?.can_update) throw new Error(`Correction host truth missing: ${JSON.stringify(operatorState)}`);
  const orientation = page.locator('[data-gpp-entry-journey="correction"]').first();
  if (await orientation.count() !== 1 || await orientation.getAttribute('role') !== 'status') throw new Error('Correction orientation is missing.');
  const editable = await page.locator('input[name^="input_"]:visible, textarea[name^="input_"]:visible, select[name^="input_"]:visible').evaluateAll(nodes => nodes.map(n => n.getAttribute('name')));
  const uniqueEditable = [...new Set(editable)].filter(Boolean);
  if (uniqueEditable.join(',') !== 'input_1') throw new Error(`GPP/native composition exposed non-host-authorized editable fields: ${JSON.stringify(uniqueEditable)}`);
  if (await page.locator('.gpp-entry-journey input, .gpp-entry-journey textarea, .gpp-entry-journey select').count() !== 0) throw new Error('GPP manufactured a parallel correction form.');
  return { dialog, operator_state: operatorState, editable_controls: uniqueEditable, orientation: (await orientation.innerText()).slice(0, 800) };
});

await test('SRWF-PROD-CORRECTION-NEGATIVE-001', 'unauthorized user gains neither correction presentation nor editable authority', async () => {
  const entryId = manifest.entries.revert;
  await login(page, manifest.users.negative_control.login);
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const negativeState = hostState(entryId, manifest.users.negative_control.id);
  if (negativeState.current_step?.can_update) throw new Error('Negative-control user gained host correction authority.');
  if (await page.locator('[data-gpp-entry-journey="correction"]').count() !== 0) throw new Error('GPP exposed correction orientation to unauthorized user.');
  if (await page.locator('input[name="input_1"]:visible').count() !== 0) throw new Error('Unauthorized user received native editable correction field.');
  return { authoritative_negative_control: negativeState, correction_orientation_count: 0, editable_field_count: 0 };
});

await test('SRWF-PROD-CORRECTION-COMPLETE-001', 'native User Input persists edit and returns SAME operator to Review', async () => {
  const entryId = manifest.entries.revert;
  await login(page, manifest.users.operator.login);
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const input = page.locator('input[name="input_1"]').first();
  if (await input.count() !== 1 || !(await input.isVisible())) throw new Error('Native correction input unavailable.');
  const corrected = 'PRODUCTION-CORRECTED-VALUE';
  await input.fill(corrected);
  const submit = page.locator(`#gform_submit_button_${formId}, form[id^="gform_"] input[type="submit"], form[id^="gform_"] button[type="submit"]`).filter({ visible: true }).last();
  if (await submit.count() !== 1) throw new Error('Native User Input submit unavailable.');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), submit.click()]);
  const operatorState = hostState(entryId, manifest.users.operator.id);
  const negativeState = hostState(entryId, manifest.users.negative_control.id);
  if (operatorState.field_1 !== corrected || operatorState.current_step?.id !== reviewId || operatorState.current_step?.type !== 'approval' || !operatorState.current_step?.can_update || negativeState.current_step?.can_update) throw new Error(`Native correction completion did not persist/return correctly: ${JSON.stringify({ operatorState, negativeState })}`);
  if (await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').count() !== 1) throw new Error('Review dossier did not return after native User Input completion.');
  return { operator_state: operatorState, negative_control_state: negativeState, persisted_value: corrected, return_control: await assertOneCanonicalReturn(page, manifest.routes.shortcode) };
});

await test('SRWF-PROD-AMBIGUITY-001', 'lost action response never turns stale client intent into result truth', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const before = hostState(entryId);
  let intercepted = null;
  await page.route('**/*', async route => {
    const request = route.request();
    if (!intercepted && request.method() === 'POST' && request.isNavigationRequest()) {
      const response = await route.fetch();
      intercepted = { url: request.url(), method: request.method(), server_status: response.status() };
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  const button = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').first();
  let dialogInfo = null;
  page.once('dialog', async dialog => { dialogInfo = { type: dialog.type(), message: dialog.message() }; await dialog.accept(); });
  await button.click().catch(() => {});
  await page.waitForTimeout(200);
  await page.unroute('**/*');

  const staleClaims = await page.locator('[data-gpp-entry-journey-result="approved"], [data-gpp-entry-journey-result="rejected"], [data-gpp-entry-journey="correction"]').count();
  if (!dialogInfo || dialogInfo.type !== 'confirm' || !intercepted || staleClaims !== 0) throw new Error(`Response-loss control did not establish ambiguity safely: ${JSON.stringify({ dialogInfo, intercepted, staleClaims })}`);

  const authoritative = hostState(entryId);
  await page.reload({ waitUntil: 'networkidle' });
  const rendered = await page.locator('[data-gpp-entry-journey-result]').evaluateAll(nodes => nodes.filter(n => n.offsetParent !== null).map(n => n.getAttribute('data-gpp-entry-journey-result')));
  if (authoritative.current_step === null && authoritative.workflow_final_status === 'approved' && authoritative.api_status === 'approved') {
    if (rendered.join(',') !== 'approved') throw new Error(`Fresh Approved host truth was not rendered exactly: ${JSON.stringify({ authoritative, rendered })}`);
  } else if (authoritative.current_step?.type === 'approval') {
    if (rendered.some(value => value === 'approved' || value === 'rejected')) throw new Error(`Review truth produced false terminal result: ${JSON.stringify({ authoritative, rendered })}`);
  } else if (rendered.some(value => value === 'approved' || value === 'rejected')) {
    throw new Error(`Ambiguous host truth produced false terminal result: ${JSON.stringify({ authoritative, rendered })}`);
  }
  return { before, dialog: dialogInfo, lost_response: intercepted, stale_result_claim_count: staleClaims, authoritative_readback: authoritative, rendered_after_fresh_readback: rendered };
});

await test('SRWF-PROD-RETURN-SHORTCODE-001', 'shortcode return reaches canonical Inbox page 1 with no detail/paging context', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, entryId), { waitUntil: 'networkidle' });
  const before = await assertOneCanonicalReturn(page, manifest.routes.shortcode);
  return { before, landed: await assertCanonicalInboxAfterClick(page, manifest.routes.shortcode) };
});

await test('SRWF-PROD-RETURN-BLOCK-001', 'registered Inbox Block return reaches canonical Block page 1', async () => {
  if (!manifest.routes.block) return { supported: false, reason: 'gravityflow/inbox block not registered in pinned runtime' };
  const entryId = manifest.entries.invalid;
  await page.goto(frontendEntryUrl(manifest.routes.block, entryId), { waitUntil: 'networkidle' });
  const before = await assertOneCanonicalReturn(page, manifest.routes.block);
  return { supported: true, before, landed: await assertCanonicalInboxAfterClick(page, manifest.routes.block) };
});

await test('SRWF-PROD-RETURN-ADMIN-001', 'admin Entry Detail return resolves the stable native admin Inbox authority', async () => {
  const entryId = manifest.entries.invalid;
  await page.goto(adminEntryUrl(entryId), { waitUntil: 'networkidle' });
  const controls = await returnControls(page);
  const all = [...controls.gpp, ...controls.native];
  if (all.length !== 1) throw new Error(`Admin route did not expose exactly one return: ${JSON.stringify(controls)}`);
  const target = new URL(all[0].href);
  if (target.pathname !== '/wp-admin/admin.php' || target.searchParams.get('page') !== 'gravityflow-inbox' || [...target.searchParams.keys()].some(k => ['view', 'lid', 'id', 'paged'].includes(k))) throw new Error(`Admin return is not canonical native Inbox authority: ${target}`);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.locator('a.gpp-entry-journey__return, .gravityflow-back-link-container a.back-link').filter({ visible: true }).first().click(),
  ]);
  if (await page.locator('[data-js="gflow-inbox"]').count() !== 1) throw new Error('Admin canonical return did not render native Inbox.');
  return { controls, landed: page.url() };
});

await test('SRWF-PROD-MOBILE-RTL-A11Y-001', '390x844 Review keeps RTL, focus visibility, one action set and bounded geometry', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(frontendEntryUrl(manifest.routes.shortcode, manifest.entries.revert), { waitUntil: 'networkidle' });
  const link = page.locator('a.gpp-entry-journey__return').filter({ visible: true }).first();
  if (await link.count() !== 1) throw new Error('Mobile return control unavailable.');
  await link.focus();
  const metrics = await page.evaluate(() => {
    const link = document.querySelector('a.gpp-entry-journey__return');
    const style = link ? getComputedStyle(link) : null;
    const rect = link?.getBoundingClientRect();
    return {
      dir: document.querySelector('.gpp-entry-journey-nav')?.getAttribute('dir') || null,
      document_overflow: document.documentElement.scrollWidth - window.innerWidth,
      link_rect: rect ? { left: rect.left, right: rect.right, width: rect.width, height: rect.height } : null,
      outline_style: style?.outlineStyle || null,
      outline_width: style?.outlineWidth || null,
      journey_buttons: document.querySelectorAll('.gpp-entry-journey button, .gpp-entry-journey-result button').length,
      native_actions: [...document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')].filter(n => n.offsetParent !== null).length,
    };
  });
  if (metrics.dir !== 'rtl' || metrics.document_overflow > 1 || !metrics.link_rect || metrics.link_rect.left < -1 || metrics.link_rect.right > 391 || metrics.link_rect.height < 44 || metrics.outline_style === 'none' || metrics.journey_buttons !== 0 || metrics.native_actions !== 3) throw new Error(`Mobile/RTL/accessibility contract failed: ${JSON.stringify(metrics)}`);
  await page.screenshot({ path: `${artifactDir}/srwf-journey-production-390x844.png`, fullPage: true });
  return metrics;
});

await test('SRWF-PROD-NO-TECHNICAL-ERROR-001', 'production DOM contains no invented Technical Error result taxonomy', async () => {
  const html = await page.content();
  if (/data-gpp-entry-journey-result=["']technical/i.test(html) || /Technical Error|خطای فنی|مشکل فنی/i.test(html)) throw new Error('Unqualified Technical Error presentation appeared in production DOM.');
  return { technical_error_result_count: 0 };
});

await browser.close();
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(`${artifactDir}/srwf-journey-production-browser.json`, JSON.stringify({ schema_version: '1.0.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n');
const failed = results.filter(x => x.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_BROWSER_PASS ${results.length}`);
