import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned MR-2 environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);
const operatorId = Number(manifest.users.operator.id);
if (manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED') throw new Error('Production Entry Detail presentation was not admitted in the lab.');

function frontendEntryUrl(entryId) {
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}

function createReviewEntry(label) {
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'MR2-${safe}',
      '2'=>'Journey',
      '3'=>'${safe}',
      '4'=>'JRN-MR2-${safe}'
    ));
    if (is_wp_error($entry_id) || !$entry_id) { fwrite(STDERR, is_wp_error($entry_id)?$entry_id->get_error_message():'add_entry failed'); exit(2); }
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) { fwrite(STDERR,'send_to_step failed'); exit(3); }
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid synthetic entry id: ${raw}`);
  return id;
}

function hostState(entryId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${operatorId});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    $timeline=$api->get_timeline($entry);
    echo wp_json_encode(array(
      'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>(string)$api->get_status($entry),
      'current_step'=>$step?array('id'=>(int)$step->get_id(),'type'=>(string)$step->get_type(),'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step)):null,
      'timeline_count'=>is_array($timeline)?count($timeline):null
    ),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

const results = [];
async function test(id, name, fn) {
  try { results.push({ id, name, status: 'PASS', details: await fn() }); }
  catch (error) { results.push({ id, name, status: 'FAIL', details: { error: String(error?.stack || error).slice(0, 12000) } }); }
}

async function login(page) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', manifest.users.operator.login);
  await page.fill('#user_pass', operatorPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
  if (new URL(page.url()).pathname.endsWith('/wp-login.php')) throw new Error('Synthetic operator authentication failed.');
}

async function gotoReview(page, entryId) {
  await page.goto(frontendEntryUrl(entryId), { waitUntil: 'networkidle' });
  const dossier = page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]').first();
  if (await dossier.count() !== 1) throw new Error('Admitted SRWF Review dossier missing.');
  const actions = page.locator('.gravityflow-status-box .gravityflow-action-buttons button').filter({ visible: true });
  const values = await actions.evaluateAll(nodes => nodes.map(node => node.value));
  if (values.join(',') !== 'approved,rejected,revert') throw new Error(`Native Review actions drifted: ${JSON.stringify(values)}`);
  return values;
}

async function installSubmitProbe(page) {
  await page.evaluate(() => {
    window.__gppMr2SubmitCount = 0;
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]');
    const form = dossier?.closest('form');
    if (!form) throw new Error('Review form missing for submit probe.');
    form.addEventListener('submit', () => { window.__gppMr2SubmitCount += 1; }, true);
  });
}

async function submitCount(page) {
  return page.evaluate(() => window.__gppMr2SubmitCount || 0);
}

async function busySnapshot(page) {
  return page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]');
    const region = dossier?.closest('form')?.querySelector('.gravityflow-status-box .gravityflow-action-buttons');
    const feedback = region?.querySelector('.gpp-review-action-busy-feedback');
    const buttons = region ? [...region.querySelectorAll('button[type="submit"]')].filter(button => ['approved','rejected','revert'].includes(button.value)) : [];
    return {
      bound: dossier?.dataset.gppReviewActionBusyBound || null,
      busy: region?.dataset.gppReviewActionBusy || null,
      aria_busy: region?.getAttribute('aria-busy') || null,
      feedback_count: feedback ? 1 : 0,
      feedback_hidden: feedback ? feedback.hidden : null,
      feedback_text: feedback?.textContent?.replace(/\s+/g, ' ').trim() || null,
      feedback_role: feedback?.getAttribute('role') || null,
      feedback_live: feedback?.getAttribute('aria-live') || null,
      feedback_atomic: feedback?.getAttribute('aria-atomic') || null,
      buttons: buttons.map(button => ({ value: button.value, disabled: button.disabled, aria_disabled: button.getAttribute('aria-disabled') })),
    };
  });
}

function assertBusy(snapshot) {
  if (snapshot.bound !== '1' || snapshot.busy !== '1' || snapshot.aria_busy !== 'true') throw new Error(`Busy semantics missing: ${JSON.stringify(snapshot)}`);
  if (snapshot.feedback_count !== 1 || snapshot.feedback_hidden !== false || snapshot.feedback_text !== 'در حال ثبت نتیجه…' || snapshot.feedback_role !== 'status' || snapshot.feedback_live !== 'polite' || snapshot.feedback_atomic !== 'true') throw new Error(`Accessible busy feedback wrong: ${JSON.stringify(snapshot)}`);
  if (snapshot.buttons.length !== 3 || snapshot.buttons.some(button => !button.disabled || button.aria_disabled !== 'true')) throw new Error(`Material actions were not disabled truthfully: ${JSON.stringify(snapshot)}`);
}

function assertIdle(snapshot) {
  if (snapshot.bound !== '1' || snapshot.busy !== null || snapshot.aria_busy !== null) throw new Error(`Idle Review unexpectedly busy: ${JSON.stringify(snapshot)}`);
  if (snapshot.feedback_count !== 1 || snapshot.feedback_hidden !== true) throw new Error(`Idle feedback contract wrong: ${JSON.stringify(snapshot)}`);
  if (snapshot.buttons.length !== 3 || snapshot.buttons.some(button => button.disabled || button.aria_disabled === 'true')) throw new Error(`Idle material actions unavailable: ${JSON.stringify(snapshot)}`);
}

async function acceptedActionWithBusy(page, value, options = {}) {
  await installSubmitProbe(page);
  let releasePost;
  const postGate = new Promise(resolve => { releasePost = resolve; });
  let postCount = 0;
  let postResponseStatus = null;

  await page.route('**/*', async route => {
    const request = route.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) {
      postCount += 1;
      await postGate;
    }
    await route.continue();
  });

  const responseListener = response => {
    const request = response.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) postResponseStatus = response.status();
  };
  page.on('response', responseListener);

  const dialogs = [];
  const dialogListener = async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  };
  page.on('dialog', dialogListener);

  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native action ${value}`);
  const navigation = page.waitForNavigation({ waitUntil: 'networkidle' });

  if (options.keyboard) {
    await button.focus();
    await page.keyboard.press('Enter');
  } else {
    await button.click({ noWaitAfter: true });
  }

  await page.waitForFunction(() => document.querySelector('.gravityflow-action-buttons')?.dataset.gppReviewActionBusy === '1');
  await page.waitForTimeout(0);
  const busy = await busySnapshot(page);
  const submitsWhileBusy = await submitCount(page);
  assertBusy(busy);
  if (submitsWhileBusy !== 1 || postCount !== 1 || dialogs.length !== 1 || dialogs[0].type !== 'confirm') throw new Error(`Accepted action did not cross the native submit boundary exactly once: ${JSON.stringify({ submitsWhileBusy, postCount, dialogs })}`);

  let duringBusy = null;
  if (typeof options.duringBusy === 'function') {
    duringBusy = await options.duringBusy({ button, getSubmitCount: () => submitCount(page), getPostCount: () => postCount, getDialogCount: () => dialogs.length });
  }

  releasePost();
  await navigation;
  await page.unroute('**/*');
  page.off('response', responseListener);
  page.off('dialog', dialogListener);

  return { busy, submits_while_busy: submitsWhileBusy, post_count: postCount, post_response_status: postResponseStatus, dialogs, during_busy: duringBusy };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await login(page);

await test('SRWF-MR2-CANCEL-001', 'Approve native confirmation Cancel never enters GPP busy state', async () => {
  const id = createReviewEntry('CANCEL');
  await gotoReview(page, id);
  await installSubmitProbe(page);
  const before = hostState(id);
  const dialogs = [];
  const listener = async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); };
  page.on('dialog', listener);
  const approve = page.locator('.gravityflow-action-buttons button[value="approved"]').first();
  await approve.click();
  await page.waitForTimeout(120);
  const afterMouse = await busySnapshot(page);
  await approve.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  page.off('dialog', listener);
  const afterKeyboard = await busySnapshot(page);
  const after = hostState(id);
  const submits = await submitCount(page);
  assertIdle(afterMouse);
  assertIdle(afterKeyboard);
  if (dialogs.length !== 2 || dialogs.some(dialog => dialog.type !== 'confirm') || submits !== 0) throw new Error(`Cancel reached material submit boundary: ${JSON.stringify({ dialogs, submits })}`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Cancel mutated host truth: ${JSON.stringify({ before, after })}`);
  return { dialogs, submits, before, after, idle_after_mouse: afterMouse, idle_after_keyboard: afterKeyboard };
});

await test('SRWF-MR2-APPROVE-001', 'accepted Approve enters one busy lifetime and final success still comes from fresh host truth', async () => {
  const id = createReviewEntry('APPROVE');
  await gotoReview(page, id);
  const submission = await acceptedActionWithBusy(page, 'approved');
  const state = hostState(id);
  const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-gpp-entry-journey-result')));
  if (state.current_step !== null || state.workflow_final_status !== 'approved' || state.api_status !== 'approved' || rendered.join(',') !== 'approved') throw new Error(`Approved fresh truth/result mismatch: ${JSON.stringify({ state, rendered })}`);
  return { submission, state, rendered };
});

await test('SRWF-MR2-REJECT-001', 'accepted Reject uses the same busy lifetime and remains a business result', async () => {
  const id = createReviewEntry('REJECT');
  await gotoReview(page, id);
  const submission = await acceptedActionWithBusy(page, 'rejected');
  const state = hostState(id);
  const result = page.locator('[data-gpp-entry-journey-result="rejected"]').filter({ visible: true }).first();
  const text = await result.innerText();
  if (state.current_step !== null || state.workflow_final_status !== 'rejected' || state.api_status !== 'rejected' || await result.count() !== 1 || /technical|خطای فنی|مشکل فنی/i.test(text)) throw new Error(`Rejected business result mismatch: ${JSON.stringify({ state, text })}`);
  return { submission, state, text };
});

await test('SRWF-MR2-REVERT-001', 'native Revert uses bounded busy behavior and still enters native User Input', async () => {
  const id = createReviewEntry('REVERT');
  await gotoReview(page, id);
  const submission = await acceptedActionWithBusy(page, 'revert');
  const state = hostState(id);
  const orientation = await page.locator('[data-gpp-entry-journey="correction"]').filter({ visible: true }).count();
  const mr3 = await page.locator('[data-gpp-reject-reason], .gpp-reject-reason, .gpp-entry-reject-reason').count();
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || !state.current_step?.can_update || orientation !== 1 || mr3 !== 0) throw new Error(`Revert/correction ownership drifted: ${JSON.stringify({ state, orientation, mr3 })}`);
  return { submission, state, orientation, mr3_reason_ui_count: mr3 };
});

await test('SRWF-MR2-DOUBLE-001', 'rapid mouse/keyboard reactivation cannot create a second material submission', async () => {
  const id = createReviewEntry('DOUBLE');
  await gotoReview(page, id);
  const submission = await acceptedActionWithBusy(page, 'approved', {
    keyboard: true,
    duringBusy: async ({ button, getSubmitCount, getPostCount, getDialogCount }) => {
      await button.click({ force: true, noWaitAfter: true, timeout: 800 }).catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(80);
      const counts = { submits: await getSubmitCount(), posts: getPostCount(), dialogs: getDialogCount() };
      if (counts.submits !== 1 || counts.posts !== 1 || counts.dialogs !== 1) throw new Error(`Duplicate activation escaped busy guard: ${JSON.stringify(counts)}`);
      return counts;
    },
  });
  const state = hostState(id);
  if (state.workflow_final_status !== 'approved' || state.api_status !== 'approved' || state.current_step !== null || submission.post_count !== 1 || submission.dialogs.length !== 1) throw new Error(`Double activation terminal state wrong: ${JSON.stringify({ submission, state })}`);
  return { submission, state };
});

await test('SRWF-MR2-STALE-001', 'two-tab stale action remains host-authoritative and cannot fabricate a second GPP result', async () => {
  const id = createReviewEntry('STALE');
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await Promise.all([gotoReview(tabA, id), gotoReview(tabB, id)]);

  const actionA = await acceptedActionWithBusy(tabA, 'approved');
  const afterA = hostState(id);
  if (afterA.workflow_final_status !== 'approved' || afterA.api_status !== 'approved' || afterA.current_step !== null) throw new Error(`Tab A did not establish Approved host truth: ${JSON.stringify(afterA)}`);

  let staleResponse = null;
  const responseListener = response => {
    const request = response.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) staleResponse = { status: response.status(), url: response.url() };
  };
  tabB.on('response', responseListener);
  const staleDialogs = [];
  const dialogListener = async dialog => { staleDialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.accept(); };
  tabB.on('dialog', dialogListener);
  const navigation = tabB.waitForNavigation({ waitUntil: 'networkidle' });
  await tabB.locator('.gravityflow-action-buttons button[value="rejected"]').first().click({ noWaitAfter: true });
  await navigation;
  tabB.off('response', responseListener);
  tabB.off('dialog', dialogListener);

  const afterB = hostState(id);
  const rendered = await tabB.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-gpp-entry-journey-result')));
  const staleControls = await tabB.locator('.gravityflow-status-box .gravityflow-action-buttons button').filter({ visible: true }).count();
  if (!staleResponse || staleDialogs.length !== 1 || staleDialogs[0].type !== 'confirm') throw new Error(`Stale Tab B did not traverse the authentic host action boundary: ${JSON.stringify({ staleResponse, staleDialogs })}`);
  if (afterB.workflow_final_status !== afterA.workflow_final_status || afterB.api_status !== afterA.api_status || afterB.current_step !== null || afterB.timeline_count !== afterA.timeline_count) throw new Error(`Unsafe stale duplicate mutation detected: ${JSON.stringify({ afterA, afterB })}`);
  if (rendered.join(',') !== 'approved' || staleControls !== 0) throw new Error(`Tab B stale presentation remained authoritative or fabricated a result: ${JSON.stringify({ rendered, staleControls, afterA, afterB })}`);

  await tabA.close();
  await tabB.close();
  return { actionA, after_tab_a: afterA, stale_response: staleResponse, stale_dialogs: staleDialogs, after_tab_b: afterB, rendered_after_readback: rendered, stale_controls_after_readback: staleControls };
});

await test('SRWF-MR2-UNKNOWN-001', 'lost action response keeps busy intent non-terminal until fresh host read-back', async () => {
  const id = createReviewEntry('UNKNOWN');
  await gotoReview(page, id);
  let intercepted = null;
  await page.route('**/*', async route => {
    const request = route.request();
    if (!intercepted && request.method() === 'POST' && request.isNavigationRequest()) {
      const response = await route.fetch();
      intercepted = { status: response.status() };
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  let dialog = null;
  page.once('dialog', async item => { dialog = { type: item.type() }; await item.accept(); });
  await page.locator('.gravityflow-action-buttons button[value="approved"]').first().click({ noWaitAfter: true }).catch(() => {});
  await page.waitForTimeout(220);
  await page.unroute('**/*');
  const beforeReloadResults = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).count();
  const busy = await busySnapshot(page);
  if (!dialog || !intercepted || beforeReloadResults !== 0 || busy.busy !== '1') throw new Error(`Lost response fabricated or lost the bounded in-flight state: ${JSON.stringify({ dialog, intercepted, beforeReloadResults, busy })}`);
  const truth = hostState(id);
  await page.reload({ waitUntil: 'networkidle' });
  const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-gpp-entry-journey-result')));
  if (truth.workflow_final_status === 'approved' && truth.api_status === 'approved') {
    if (rendered.join(',') !== 'approved') throw new Error(`Fresh Approved truth not reflected after lost response: ${JSON.stringify({ truth, rendered })}`);
  } else if (rendered.includes('approved') || rendered.includes('rejected')) {
    throw new Error(`Ambiguous fresh truth fabricated terminal result: ${JSON.stringify({ truth, rendered })}`);
  }
  return { dialog, intercepted, busy_before_reload: busy, truth, rendered_after_fresh_readback: rendered };
});

await test('SRWF-MR2-RESPONSIVE-001', 'idle Review keeps existing action colors and bounded desktop/mobile geometry', async () => {
  const id = createReviewEntry('RESPONSIVE');
  const captures = [];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 760 }]) {
    await page.setViewportSize(viewport);
    await gotoReview(page, id);
    const state = await page.evaluate(() => {
      const region = document.querySelector('.gravityflow-status-box .gravityflow-action-buttons');
      const buttons = [...document.querySelectorAll('.gravityflow-action-buttons button')].filter(node => node.offsetParent !== null);
      return {
        document_overflow: document.documentElement.scrollWidth - window.innerWidth,
        region_width: region?.getBoundingClientRect().width || 0,
        feedback_hidden: region?.querySelector('.gpp-review-action-busy-feedback')?.hidden ?? null,
        buttons: buttons.map(button => ({ value: button.value, background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
      };
    });
    const colors = Object.fromEntries(state.buttons.map(button => [button.value, button.background]));
    if (state.document_overflow > 1 || state.region_width < 1 || state.feedback_hidden !== true || state.buttons.length !== 3 || state.buttons.some(button => button.width < 1 || button.height < 44)) throw new Error(`Responsive action geometry regressed: ${JSON.stringify({ viewport, state })}`);
    if (colors.approved !== 'rgb(55, 155, 82)' || colors.rejected !== 'rgb(229, 89, 103)' || colors.revert !== 'rgb(252, 242, 216)') throw new Error(`Semantic action colors drifted: ${JSON.stringify({ viewport, colors })}`);
    captures.push({ viewport, state });
  }
  return captures;
});

await browser.close();
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(`${artifactDir}/srwf-journey-production-mr2-action-state-browser.json`, JSON.stringify({ schema_version: '1.0.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n');
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR2_ACTION_STATE_PASS ${results.length}`);
