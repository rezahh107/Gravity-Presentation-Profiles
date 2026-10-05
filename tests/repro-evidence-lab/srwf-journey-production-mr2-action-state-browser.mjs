import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned MR-2 environment is incomplete.');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);
const operatorId = Number(manifest.users.operator.id);
if (manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED') {
  throw new Error('Production Entry Detail presentation was not admitted.');
}

function urlFor(entryId) {
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}

function createEntry(label) {
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'MR2-${safe}',
      '2'=>'Journey',
      '3'=>'${safe}',
      '4'=>'JRN-MR2-${safe}'
    ));
    if (is_wp_error($id)||!$id) { exit(2); }
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$id);
    $entry=GFAPI::get_entry((int)$id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent||is_wp_error($sent)) { exit(3); }
    echo (int)$id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid entry: ${raw}`);
  return id;
}

function host(entryId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${operatorId});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path().'/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)});
    $api=new Gravity_Flow_API(${formId});
    $step=$api->get_current_step($entry);
    $timeline=$api->get_timeline($entry);
    echo wp_json_encode(array(
      'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>(string)$api->get_status($entry),
      'current_step'=>$step?array(
        'id'=>(int)$step->get_id(),
        'type'=>(string)$step->get_type(),
        'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step)
      ):null,
      'timeline_count'=>is_array($timeline)?count($timeline):null
    ),JSON_UNESCAPED_SLASHES);
  `));
}

async function auth(context) {
  const cookies = JSON.parse(wpEval(`
    $expiry=time()+3600;
    echo wp_json_encode(array(
      array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie(${operatorId},$expiry,'auth'),'expires'=>$expiry),
      array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie(${operatorId},$expiry,'logged_in'),'expires'=>$expiry)
    ));
  `));
  await context.addCookies(cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: '127.0.0.1',
    path: '/',
    expires: Number(cookie.expires),
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  })));
}

async function gotoReview(page, entryId) {
  await page.goto(urlFor(entryId), { waitUntil: 'networkidle' });
  const dossier = page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]').first();
  if (await dossier.count() !== 1) throw new Error('Admitted Review missing.');
  const values = await page.locator('.gravityflow-action-buttons button').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.value));
  if (values.join(',') !== 'approved,rejected,revert') throw new Error(`Native actions drifted: ${values}`);
}

async function installSubmitProbe(page) {
  await page.evaluate(() => {
    window.__mr2Probe = { submits: 0, defaultPrevented: [], hiddenValues: [] };
    const form = document.querySelector('.gpp-entry-dossier[data-gpp-review-mode="read-only"]')?.closest('form');
    if (!form) throw new Error('Review form missing');
    form.addEventListener('submit', event => {
      window.__mr2Probe.submits += 1;
      queueMicrotask(() => {
        window.__mr2Probe.defaultPrevented.push(Boolean(event.defaultPrevented));
        window.__mr2Probe.hiddenValues.push(document.querySelector('#gravityflow_approval_new_status_step')?.value ?? null);
      });
    }, true);
  });
}

async function probe(page) {
  return page.evaluate(() => window.__mr2Probe || { submits: 0, defaultPrevented: [], hiddenValues: [] });
}

async function snap(page) {
  return page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-review-mode="read-only"]');
    const form = dossier?.closest('form');
    const region = form?.querySelector('.gravityflow-action-buttons');
    const feedback = region?.querySelector('.gpp-review-action-busy-feedback');
    const buttons = region ? [...region.querySelectorAll('button[type="submit"]')].filter(button => ['approved', 'rejected', 'revert'].includes(button.value)) : [];
    return {
      bound: dossier?.dataset.gppReviewActionBusyBound || null,
      busy: region?.dataset.gppReviewActionBusy || null,
      aria: region?.getAttribute('aria-busy') || null,
      hidden: form?.querySelector('#gravityflow_approval_new_status_step')?.value ?? null,
      feedback: feedback ? {
        hidden: feedback.hidden,
        text: feedback.textContent.replace(/\s+/g, ' ').trim(),
        role: feedback.getAttribute('role'),
        live: feedback.getAttribute('aria-live'),
        atomic: feedback.getAttribute('aria-atomic'),
      } : null,
      buttons: buttons.map(button => ({ value: button.value, disabled: button.disabled, aria: button.getAttribute('aria-disabled') })),
    };
  });
}

function assertBusy(state) {
  if (
    state.bound !== '1' || state.busy !== '1' || state.aria !== 'true' ||
    !state.feedback || state.feedback.hidden || state.feedback.text !== 'در حال ثبت نتیجه…' ||
    state.feedback.role !== 'status' || state.feedback.live !== 'polite' || state.feedback.atomic !== 'true' ||
    state.buttons.length !== 3 || state.buttons.some(button => button.disabled || button.aria !== 'true')
  ) throw new Error(`Busy contract failed: ${JSON.stringify(state)}`);
}

function assertIdle(state) {
  if (
    state.bound !== '1' || state.busy !== null || state.aria !== null ||
    !state.feedback || !state.feedback.hidden || state.buttons.length !== 3 ||
    state.buttons.some(button => button.disabled || button.aria === 'true')
  ) throw new Error(`Idle contract failed: ${JSON.stringify(state)}`);
}

async function activate(page, button, keyboard = false) {
  if (keyboard) {
    await button.focus();
    await page.keyboard.press('Enter');
    return;
  }
  const box = await button.boundingBox();
  if (!box) throw new Error('No button geometry');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitFor(check, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`MR-2 wait timeout after ${timeoutMs}ms`);
}

async function settle(promise, timeoutMs = 15000) {
  return Promise.race([
    promise.then(() => null).catch(error => error),
    new Promise(resolve => setTimeout(() => resolve(new Error(`Activation timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

async function accepted(page, value, { keyboard = false, duringBusy = null } = {}) {
  await installSubmitProbe(page);
  let releasePost;
  const postGate = new Promise(resolve => { releasePost = resolve; });
  let posts = 0;
  let postStatus = null;

  const route = async interceptedRoute => {
    const request = interceptedRoute.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) {
      posts += 1;
      await postGate;
    }
    await interceptedRoute.continue();
  };
  await page.route('**/*', route);

  const responseListener = response => {
    const request = response.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) postStatus = response.status();
  };
  page.on('response', responseListener);

  const dialogs = [];
  const initialDialog = new Promise((resolve, reject) => page.once('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    try {
      await dialog.accept();
      resolve();
    } catch (error) {
      reject(error);
    }
  }));

  const button = page.locator(`.gravityflow-action-buttons button[value="${value}"]`).first();
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).then(() => null).catch(error => error);
  const activation = settle(activate(page, button, keyboard));

  let failure = null;
  let result = null;
  try {
    await initialDialog;
    await page.waitForFunction(
      () => document.querySelector('.gravityflow-action-buttons')?.dataset.gppReviewActionBusy === '1',
      null,
      { timeout: 5000 }
    );
    await waitFor(() => posts === 1, 5000);

    const busy = await snap(page);
    const submitProbe = await probe(page);
    assertBusy(busy);
    if (submitProbe.submits !== 1 || posts !== 1 || dialogs.length !== 1 || dialogs[0].type !== 'confirm') {
      throw new Error(`Submit boundary wrong: ${JSON.stringify({ submitProbe, posts, dialogs })}`);
    }

    let extra = null;
    if (duringBusy) {
      const duplicateDialogs = [];
      const duplicateListener = async dialog => {
        duplicateDialogs.push({ type: dialog.type(), message: dialog.message() });
        await dialog.dismiss();
      };
      page.on('dialog', duplicateListener);
      try {
        extra = await duringBusy({
          button,
          getProbe: () => probe(page),
          getPosts: () => posts,
          getDialogs: () => duplicateDialogs.length,
        });
      } finally {
        page.off('dialog', duplicateListener);
      }
      if (duplicateDialogs.length) throw new Error(`Duplicate activation reached confirm: ${JSON.stringify(duplicateDialogs)}`);
    }

    result = { busy, probe: submitProbe, posts, dialogs, during_busy: extra };
  } catch (error) {
    const diagnostic = {
      error: String(error?.stack || error),
      state: await snap(page).catch(() => null),
      probe: await probe(page).catch(() => null),
      posts,
      dialogs,
    };
    failure = new Error(`Accepted action observation failed: ${JSON.stringify(diagnostic)}`);
  } finally {
    releasePost();
  }

  const [activationError, navigationError] = await Promise.all([activation, navigation]);
  await page.unroute('**/*', route);
  page.off('response', responseListener);
  if (failure) throw failure;
  if (activationError) throw activationError;
  if (navigationError) throw navigationError;
  await page.waitForLoadState('networkidle');
  return { ...result, post_status: postStatus };
}

const results = [];
async function test(id, name, fn) {
  try {
    results.push({ id, name, status: 'PASS', details: await fn() });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', details: { error: String(error?.stack || error).slice(0, 16000) } });
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await auth(context);
const page = await context.newPage();

await test('SRWF-MR2-CANCEL-001', 'Approve confirmation Cancel bypasses busy/submit', async () => {
  const id = createEntry('CANCEL');
  await gotoReview(page, id);
  await installSubmitProbe(page);
  const before = host(id);
  const dialogs = [];
  const listener = async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); };
  page.on('dialog', listener);
  const button = page.locator('.gravityflow-action-buttons button[value="approved"]').first();
  await activate(page, button);
  await page.waitForTimeout(80);
  const mouse = await snap(page);
  await activate(page, button, true);
  await page.waitForTimeout(80);
  page.off('dialog', listener);
  const keyboard = await snap(page);
  const after = host(id);
  const submitProbe = await probe(page);
  assertIdle(mouse);
  assertIdle(keyboard);
  if (dialogs.length !== 2 || dialogs.some(type => type !== 'confirm') || submitProbe.submits !== 0 || JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Cancel contract failed: ${JSON.stringify({ dialogs, submitProbe, before, after })}`);
  }
  return { dialogs, submitProbe, before, after };
});

await test('SRWF-MR2-APPROVE-001', 'Approve busy once then authoritative Approved read-back', async () => {
  const id = createEntry('APPROVE');
  await gotoReview(page, id);
  const submission = await accepted(page, 'approved');
  const state = host(id);
  const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
  if (state.current_step !== null || state.workflow_final_status !== 'approved' || state.api_status !== 'approved' || rendered.join(',') !== 'approved') {
    throw new Error(`Approve truth mismatch: ${JSON.stringify({ state, rendered })}`);
  }
  return { submission, state, rendered };
});

await test('SRWF-MR2-REJECT-001', 'Reject keyboard activation preserves business result', async () => {
  const id = createEntry('REJECT');
  await gotoReview(page, id);
  const submission = await accepted(page, 'rejected', { keyboard: true });
  const state = host(id);
  const result = page.locator('[data-gpp-entry-journey-result="rejected"]').filter({ visible: true }).first();
  const text = await result.innerText();
  if (state.current_step !== null || state.workflow_final_status !== 'rejected' || state.api_status !== 'rejected' || await result.count() !== 1 || /technical|خطای فنی|مشکل فنی/i.test(text)) {
    throw new Error(`Reject truth mismatch: ${JSON.stringify({ state, text })}`);
  }
  return { submission, state, text };
});

await test('SRWF-MR2-REVERT-001', 'Revert busy then native User Input', async () => {
  const id = createEntry('REVERT');
  await gotoReview(page, id);
  const submission = await accepted(page, 'revert');
  const state = host(id);
  const orientation = await page.locator('[data-gpp-entry-journey="correction"]').filter({ visible: true }).count();
  const mr3 = await page.locator('[data-gpp-reject-reason],.gpp-reject-reason,.gpp-entry-reject-reason').count();
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || !state.current_step?.can_update || orientation !== 1 || mr3 !== 0) {
    throw new Error(`Revert drift: ${JSON.stringify({ state, orientation, mr3 })}`);
  }
  return { submission, state, orientation, mr3 };
});

await test('SRWF-MR2-DOUBLE-001', 'rapid mouse/keyboard duplicate activation stays single-submit', async () => {
  const id = createEntry('DOUBLE');
  await gotoReview(page, id);
  const submission = await accepted(page, 'approved', {
    keyboard: true,
    duringBusy: async ({ button, getProbe, getPosts, getDialogs }) => {
      const first = settle(activate(page, button), 3000);
      const second = settle(activate(page, button, true), 3000);
      await Promise.all([first, second]);
      await page.waitForTimeout(80);
      const counts = { probe: await getProbe(), posts: getPosts(), dialogs: getDialogs() };
      if (counts.probe.submits !== 1 || counts.posts !== 1 || counts.dialogs !== 0) {
        throw new Error(`Duplicate escaped: ${JSON.stringify(counts)}`);
      }
      return counts;
    },
  });
  const state = host(id);
  if (state.workflow_final_status !== 'approved' || state.api_status !== 'approved' || state.current_step !== null) {
    throw new Error(`Double activation mutated wrong truth: ${JSON.stringify(state)}`);
  }
  return { submission, state };
});

await test('SRWF-MR2-STALE-001', 'two-tab stale Reject cannot override Tab A Approved truth', async () => {
  const id = createEntry('STALE');
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await Promise.all([gotoReview(tabA, id), gotoReview(tabB, id)]);

  const actionA = await accepted(tabA, 'approved');
  const afterA = host(id);
  if (afterA.workflow_final_status !== 'approved' || afterA.api_status !== 'approved' || afterA.current_step !== null) {
    throw new Error(`Tab A failed: ${JSON.stringify(afterA)}`);
  }

  let response = null;
  const responseListener = item => {
    const request = item.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) response = { status: item.status(), url: item.url() };
  };
  tabB.on('response', responseListener);
  const dialogs = [];
  const dialogPromise = new Promise((resolve, reject) => tabB.once('dialog', async dialog => {
    dialogs.push(dialog.type());
    try { await dialog.accept(); resolve(); } catch (error) { reject(error); }
  }));
  const navigation = tabB.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  const button = tabB.locator('.gravityflow-action-buttons button[value="rejected"]').first();
  const activation = settle(activate(tabB, button));
  await dialogPromise;
  const [activationError] = await Promise.all([activation, navigation]);
  tabB.off('response', responseListener);
  if (activationError) throw activationError;

  const afterB = host(id);
  const rendered = await tabB.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
  const controls = await tabB.locator('.gravityflow-action-buttons button').filter({ visible: true }).count();
  if (!response || dialogs.length !== 1 || dialogs[0] !== 'confirm' || JSON.stringify(afterB) !== JSON.stringify(afterA) || rendered.join(',') !== 'approved' || controls !== 0) {
    throw new Error(`Stale safety failed: ${JSON.stringify({ afterA, afterB, response, dialogs, rendered, controls })}`);
  }
  await Promise.all([tabA.close(), tabB.close()]);
  return { actionA, afterA, response, afterB, rendered, controls };
});

await test('SRWF-MR2-UNKNOWN-001', 'lost response never fabricates terminal client success', async () => {
  const id = createEntry('UNKNOWN');
  await gotoReview(page, id);
  let intercepted = null;
  const route = async interceptedRoute => {
    const request = interceptedRoute.request();
    if (!intercepted && request.method() === 'POST' && request.isNavigationRequest()) {
      const response = await interceptedRoute.fetch();
      intercepted = { status: response.status() };
      await interceptedRoute.abort('failed');
      return;
    }
    await interceptedRoute.continue();
  };
  await page.route('**/*', route);
  let dialog = null;
  const dialogPromise = new Promise((resolve, reject) => page.once('dialog', async item => {
    dialog = item.type();
    try { await item.accept(); resolve(); } catch (error) { reject(error); }
  }));
  const activation = settle(activate(page, page.locator('.gravityflow-action-buttons button[value="approved"]').first()));
  await dialogPromise;
  await waitFor(() => intercepted !== null, 5000).catch(() => {});
  await page.waitForTimeout(120);
  await page.unroute('**/*', route);
  const activationError = await activation;
  if (activationError && !/navigation|aborted|failed/i.test(String(activationError))) throw activationError;
  const pre = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).count();
  const busy = await snap(page);
  if (dialog !== 'confirm' || !intercepted || pre !== 0 || busy.busy !== '1') {
    throw new Error(`Unknown contract failed: ${JSON.stringify({ dialog, intercepted, pre, busy })}`);
  }
  const truth = host(id);
  await page.reload({ waitUntil: 'networkidle' });
  const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
  if (truth.workflow_final_status === 'approved' && truth.api_status === 'approved') {
    if (rendered.join(',') !== 'approved') throw new Error(`Fresh Approved truth missing after reload: ${JSON.stringify({ truth, rendered })}`);
  } else if (rendered.includes('approved') || rendered.includes('rejected')) {
    throw new Error(`Ambiguous truth fabricated terminal result: ${JSON.stringify({ truth, rendered })}`);
  }
  return { intercepted, pre, busy, truth, rendered };
});

await test('SRWF-MR2-RESPONSIVE-A11Y-001', 'busy enhancement preserves keyboard/a11y and desktop/mobile action presentation', async () => {
  const id = createEntry('RESPONSIVE');
  const samples = [];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await gotoReview(page, id);
    const idle = await snap(page);
    assertIdle(idle);
    const geometry = await page.locator('.gravityflow-action-buttons button').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { value: node.value, left: rect.left, right: rect.right, height: rect.height, background: style.backgroundColor, color: style.color };
    }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1 || geometry.length !== 3 || geometry.some(item => item.left < -1 || item.right > viewport.width + 1 || item.height < 44)) {
      throw new Error(`Responsive action geometry failed: ${JSON.stringify({ viewport, overflow, geometry })}`);
    }
    const colors = Object.fromEntries(geometry.map(item => [item.value, item.background]));
    if (colors.approved !== 'rgb(55, 155, 82)' || colors.rejected !== 'rgb(229, 89, 103)' || colors.revert !== 'rgb(252, 242, 216)') {
      throw new Error(`Semantic action colors changed: ${JSON.stringify({ viewport, colors })}`);
    }
    samples.push({ viewport, overflow, idle, geometry });
  }
  return samples;
});

await browser.close();
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(
  `${artifactDir}/srwf-journey-production-mr2-action-state-browser.json`,
  JSON.stringify({ schema_version: '1.1.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n'
);
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR2_ACTION_STATE_PASS ${results.length}`);
