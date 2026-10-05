import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned MR-2 environment is incomplete.');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {
    encoding: 'utf8', env: process.env, timeout: 15000,
  });
  if (result.error) throw result.error;
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
      feedback: feedback ? {
        hidden: feedback.hidden,
        text: feedback.textContent.replace(/\s+/g, ' ').trim(),
        role: feedback.getAttribute('role'),
        live: feedback.getAttribute('aria-live'),
        atomic: feedback.getAttribute('aria-atomic'),
      } : null,
      buttons: buttons.map(button => ({
        value: button.value,
        disabled: button.disabled,
        aria: button.getAttribute('aria-disabled'),
      })),
    };
  });
}

function assertIdle(state) {
  if (
    state.bound !== '1' || state.busy !== null || state.aria !== null ||
    !state.feedback || !state.feedback.hidden || state.buttons.length !== 3 ||
    state.buttons.some(button => button.disabled || button.aria === 'true')
  ) throw new Error(`Idle contract failed: ${JSON.stringify(state)}`);
}

function assertBusy(state) {
  if (
    state.bound !== '1' || state.busy !== '1' || state.aria !== 'true' ||
    !state.feedback || state.feedback.hidden || state.feedback.text !== 'در حال ثبت نتیجه…' ||
    state.feedback.role !== 'status' || state.feedback.live !== 'polite' || state.feedback.atomic !== 'true' ||
    state.buttons.length !== 3 || state.buttons.some(button => button.disabled || button.aria !== 'true')
  ) throw new Error(`Busy contract failed: ${JSON.stringify(state)}`);
}

async function gotoReview(page, entryId) {
  await page.goto(urlFor(entryId), { waitUntil: 'networkidle', timeout: 15000 });
  const dossier = page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]').first();
  if (await dossier.count() !== 1) throw new Error('Admitted Review missing.');
  const values = await page.locator('.gravityflow-action-buttons button').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.value));
  if (values.join(',') !== 'approved,rejected,revert') throw new Error(`Native actions drifted: ${values}`);
  assertIdle(await snap(page));
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

async function installLifecycleProbe(page, token, { duplicateOnFormdata = false, duplicateValue = 'approved' } = {}) {
  await page.evaluate(({ token, duplicateOnFormdata, duplicateValue }) => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-review-mode="read-only"]');
    const form = dossier?.closest('form');
    const region = form?.querySelector('.gravityflow-action-buttons');
    if (!form || !region) throw new Error('Review lifecycle probe target missing.');

    let submitCount = 0;
    let formdataCount = 0;
    const emit = (kind, detail = {}) => console.log(`MR2_PROBE ${token} ${JSON.stringify({ kind, ...detail })}`);
    const state = () => {
      const feedback = region.querySelector('.gpp-review-action-busy-feedback');
      const buttons = [...region.querySelectorAll('button[type="submit"]')].filter(button => ['approved', 'rejected', 'revert'].includes(button.value));
      return {
        busy: region.dataset.gppReviewActionBusy || null,
        aria: region.getAttribute('aria-busy'),
        feedback: feedback ? {
          hidden: feedback.hidden,
          text: feedback.textContent.replace(/\s+/g, ' ').trim(),
          role: feedback.getAttribute('role'),
          live: feedback.getAttribute('aria-live'),
          atomic: feedback.getAttribute('aria-atomic'),
        } : null,
        buttons: buttons.map(button => ({ value: button.value, disabled: button.disabled, aria: button.getAttribute('aria-disabled') })),
      };
    };

    form.addEventListener('submit', event => {
      submitCount += 1;
      queueMicrotask(() => emit('submit', {
        submitCount,
        defaultPrevented: Boolean(event.defaultPrevented),
        hidden: form.querySelector('#gravityflow_approval_new_status_step')?.value ?? null,
      }));
    }, true);

    form.addEventListener('formdata', event => {
      formdataCount += 1;
      emit('formdata', {
        formdataCount,
        action: event.formData.get('gravityflow_approval_new_status_step'),
        state: state(),
      });

      if (duplicateOnFormdata && formdataCount === 1) {
        const button = region.querySelector(`button[type="submit"][value="${duplicateValue}"]`);
        button?.click();
        button?.click();
        emit('duplicate-attempted', { submitCount, formdataCount, state: state() });
      }
    });
  }, { token, duplicateOnFormdata, duplicateValue });
}

function probeCollector(page, token) {
  const events = [];
  const listener = message => {
    const prefix = `MR2_PROBE ${token} `;
    const text = message.text();
    if (!text.startsWith(prefix)) return;
    try { events.push(JSON.parse(text.slice(prefix.length))); } catch {}
  };
  page.on('console', listener);
  return { events, stop: () => page.off('console', listener) };
}

async function accepted(page, value, { keyboard = false, duplicateOnFormdata = false } = {}) {
  const token = `${value}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const collector = probeCollector(page, token);
  await installLifecycleProbe(page, token, { duplicateOnFormdata, duplicateValue: value });

  const dialogs = [];
  const dialogListener = async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (dialogs.length === 1) await dialog.accept();
    else await dialog.dismiss();
  };
  page.on('dialog', dialogListener);

  let posts = 0;
  let postStatus = null;
  const requestListener = request => {
    if (request.method() === 'POST' && request.isNavigationRequest()) posts += 1;
  };
  const responseListener = response => {
    const request = response.request();
    if (request.method() === 'POST' && request.isNavigationRequest()) postStatus = response.status();
  };
  page.on('request', requestListener);
  page.on('response', responseListener);

  const navigation = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  const button = page.locator(`.gravityflow-action-buttons button[value="${value}"]`).first();
  try {
    await activate(page, button, keyboard);
    await navigation;
  } finally {
    page.off('dialog', dialogListener);
    page.off('request', requestListener);
    page.off('response', responseListener);
    collector.stop();
  }

  const formdata = collector.events.filter(event => event.kind === 'formdata');
  const duplicate = collector.events.filter(event => event.kind === 'duplicate-attempted');
  if (dialogs.length !== 1 || dialogs[0].type !== 'confirm') throw new Error(`Native confirmation drifted: ${JSON.stringify(dialogs)}`);
  if (posts !== 1) throw new Error(`Expected exactly one native navigation POST, got ${posts}`);
  if (formdata.length !== 1) throw new Error(`Expected exactly one material formdata boundary, got ${JSON.stringify(collector.events)}`);
  if (formdata[0].action !== value) throw new Error(`Submitted action carrier drifted: ${JSON.stringify(formdata[0])}`);
  assertBusy({ bound: '1', ...formdata[0].state });
  if (duplicateOnFormdata && duplicate.length !== 1) throw new Error(`Duplicate probe did not run exactly once: ${JSON.stringify(collector.events)}`);

  return { dialogs, posts, post_status: postStatus, lifecycle: collector.events };
}

const results = [];
function persist() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    `${artifactDir}/srwf-journey-production-mr2-action-state-browser.json`,
    JSON.stringify({ schema_version: '1.2.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n'
  );
}

async function test(id, name, fn) {
  console.log(`MR2_TEST_START ${id}`);
  try {
    const details = await fn();
    results.push({ id, name, status: 'PASS', details });
    console.log(`MR2_TEST_PASS ${id}`);
  } catch (error) {
    const details = { error: String(error?.stack || error).slice(0, 16000) };
    results.push({ id, name, status: 'FAIL', details });
    console.error(`MR2_TEST_FAIL ${id} ${details.error}`);
  } finally {
    persist();
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
context.setDefaultTimeout(10000);
context.setDefaultNavigationTimeout(15000);
await auth(context);
const page = await context.newPage();

await test('SRWF-MR2-CANCEL-001', 'Approve confirmation Cancel bypasses payload/busy and mutation', async () => {
  const id = createEntry('CANCEL');
  await gotoReview(page, id);
  const before = host(id);
  const token = `cancel-${Date.now()}`;
  const collector = probeCollector(page, token);
  await installLifecycleProbe(page, token);
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
  collector.stop();
  const keyboard = await snap(page);
  const after = host(id);
  assertIdle(mouse);
  assertIdle(keyboard);
  if (dialogs.length !== 2 || dialogs.some(type => type !== 'confirm')) throw new Error(`Cancel confirmation drifted: ${JSON.stringify(dialogs)}`);
  if (collector.events.some(event => event.kind === 'submit' || event.kind === 'formdata')) throw new Error(`Cancel reached material boundary: ${JSON.stringify(collector.events)}`);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Cancel mutated host truth: ${JSON.stringify({ before, after })}`);
  return { dialogs, lifecycle: collector.events, before, after };
});

await test('SRWF-MR2-APPROVE-001', 'Approve enters busy at payload boundary and final result comes from fresh host truth', async () => {
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

await test('SRWF-MR2-REJECT-001', 'Reject keyboard activation uses the same busy boundary and remains a business result', async () => {
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

await test('SRWF-MR2-REVERT-001', 'Revert uses bounded busy behavior and still enters native User Input', async () => {
  const id = createEntry('REVERT');
  await gotoReview(page, id);
  const submission = await accepted(page, 'revert');
  const state = host(id);
  const orientation = await page.locator('[data-gpp-entry-journey="correction"]').filter({ visible: true }).count();
  const mr3 = await page.locator('[data-gpp-reject-reason],.gpp-reject-reason,.gpp-entry-reject-reason').count();
  if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || !state.current_step?.can_update || orientation !== 1 || mr3 !== 0) {
    throw new Error(`Revert/correction ownership drifted: ${JSON.stringify({ state, orientation, mr3 })}`);
  }
  return { submission, state, orientation, mr3_reason_ui_count: mr3 };
});

await test('SRWF-MR2-DOUBLE-001', 'rapid repeated activation cannot create a second material submission', async () => {
  const id = createEntry('DOUBLE');
  await gotoReview(page, id);
  const submission = await accepted(page, 'approved', { keyboard: true, duplicateOnFormdata: true });
  const state = host(id);
  const duplicate = submission.lifecycle.find(event => event.kind === 'duplicate-attempted');
  if (!duplicate || duplicate.submitCount !== 1 || duplicate.formdataCount !== 1 || submission.dialogs.length !== 1 || submission.posts !== 1) {
    throw new Error(`Duplicate activation escaped busy guard: ${JSON.stringify(submission)}`);
  }
  if (state.workflow_final_status !== 'approved' || state.api_status !== 'approved' || state.current_step !== null) {
    throw new Error(`Double activation terminal truth wrong: ${JSON.stringify(state)}`);
  }
  return { submission, state };
});

await test('SRWF-MR2-STALE-001', 'two-tab stale Reject remains host-authoritative and cannot fabricate a second result', async () => {
  const id = createEntry('STALE');
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await Promise.all([gotoReview(tabA, id), gotoReview(tabB, id)]);

  const actionA = await accepted(tabA, 'approved');
  const afterA = host(id);
  if (afterA.workflow_final_status !== 'approved' || afterA.api_status !== 'approved' || afterA.current_step !== null) {
    throw new Error(`Tab A did not establish Approved host truth: ${JSON.stringify(afterA)}`);
  }

  const staleAction = await accepted(tabB, 'rejected');
  const afterB = host(id);
  const rendered = await tabB.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
  const controls = await tabB.locator('.gravityflow-status-box .gravityflow-action-buttons button').filter({ visible: true }).count();
  if (afterB.workflow_final_status !== afterA.workflow_final_status || afterB.api_status !== afterA.api_status || afterB.current_step !== null || afterB.timeline_count !== afterA.timeline_count) {
    throw new Error(`Unsafe stale duplicate mutation detected: ${JSON.stringify({ afterA, afterB, staleAction })}`);
  }
  if (rendered.join(',') !== 'approved' || controls !== 0) {
    throw new Error(`Stale Tab B fabricated or retained authoritative action UI: ${JSON.stringify({ rendered, controls, afterA, afterB })}`);
  }
  await Promise.all([tabA.close(), tabB.close()]);
  return { actionA, staleAction, afterA, afterB, rendered, controls };
});

await test('SRWF-MR2-UNKNOWN-001', 'lost response never fabricates terminal client success', async () => {
  const id = createEntry('UNKNOWN');
  await gotoReview(page, id);
  const token = `unknown-${Date.now()}`;
  const collector = probeCollector(page, token);
  await installLifecycleProbe(page, token);

  let intercepted = null;
  let resolveIntercepted;
  const interceptedPromise = new Promise(resolve => { resolveIntercepted = resolve; });
  const route = async interceptedRoute => {
    const request = interceptedRoute.request();
    if (!intercepted && request.method() === 'POST' && request.isNavigationRequest()) {
      const response = await interceptedRoute.fetch();
      intercepted = { status: response.status(), url: request.url() };
      resolveIntercepted();
      await interceptedRoute.abort('failed');
      return;
    }
    await interceptedRoute.continue();
  };
  await page.route('**/*', route);

  const dialogs = [];
  const listener = async dialog => { dialogs.push(dialog.type()); await dialog.accept(); };
  page.on('dialog', listener);
  const activation = activate(page, page.locator('.gravityflow-action-buttons button[value="approved"]').first()).catch(error => error);
  await Promise.race([
    interceptedPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Lost-response POST was not intercepted.')), 8000)),
  ]);
  await page.waitForTimeout(120);
  await page.unroute('**/*', route);
  page.off('dialog', listener);
  collector.stop();
  await activation;

  const pre = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).count();
  const busy = await snap(page);
  const formdata = collector.events.filter(event => event.kind === 'formdata');
  if (dialogs.length !== 1 || dialogs[0] !== 'confirm' || !intercepted || pre !== 0 || formdata.length !== 1) {
    throw new Error(`Unknown-response contract failed: ${JSON.stringify({ dialogs, intercepted, pre, lifecycle: collector.events })}`);
  }
  assertBusy(busy);

  const truth = host(id);
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
  if (truth.workflow_final_status === 'approved' && truth.api_status === 'approved') {
    if (rendered.join(',') !== 'approved') throw new Error(`Fresh Approved truth missing after reload: ${JSON.stringify({ truth, rendered })}`);
  } else if (rendered.includes('approved') || rendered.includes('rejected')) {
    throw new Error(`Ambiguous truth fabricated terminal result: ${JSON.stringify({ truth, rendered })}`);
  }
  return { intercepted, pre, busy, lifecycle: collector.events, truth, rendered };
});

await test('SRWF-MR2-RESPONSIVE-A11Y-001', 'busy enhancement preserves keyboard/a11y and desktop/mobile action presentation', async () => {
  const id = createEntry('RESPONSIVE');
  const samples = [];
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
    await page.setViewportSize(viewport);
    await gotoReview(page, id);
    const idle = await snap(page);
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
persist();
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR2_ACTION_STATE_PASS ${results.length}`);
