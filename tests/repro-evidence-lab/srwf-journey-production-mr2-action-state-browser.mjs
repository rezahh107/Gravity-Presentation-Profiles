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
  const state = JSON.parse(wpEval(`
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
      'timeline'=>$timeline
    ),JSON_UNESCAPED_SLASHES);
  `));
  const hasTimeline = Object.prototype.hasOwnProperty.call(state, 'timeline');
  if (!hasTimeline || typeof state.timeline !== 'string' || state.timeline.trim() === '') {
    throw new Error(`Unusable native Gravity Flow timeline evidence: ${JSON.stringify({
      entry_id: Number(entryId),
      timeline_present: hasTimeline,
      timeline_type: typeof state.timeline,
      timeline: hasTimeline ? state.timeline : null,
    })}`);
  }
  return state;
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

async function installLifecycleProbe(page, token, { duplicateValue = null } = {}) {
  await page.evaluate(({ token, duplicateValue }) => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-review-mode="read-only"]');
    const form = dossier?.closest('form');
    const region = form?.querySelector('.gravityflow-action-buttons');
    const hidden = form?.querySelector('#gravityflow_approval_new_status_step');
    if (!form || !region || !hidden?.name) throw new Error('Review lifecycle probe target missing.');

    let submitCount = 0;
    let formdataCount = 0;
    let busyEnterCount = 0;
    let duplicateAttempted = false;
    let lastBusy = region.dataset.gppReviewActionBusy || null;
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
        hidden: hidden.value,
      }));
    }, true);

    form.addEventListener('formdata', event => {
      formdataCount += 1;
      const action = event.formData.get(hidden.name);
      const current = state();
      if (lastBusy !== '1' && current.busy === '1') busyEnterCount += 1;
      lastBusy = current.busy;
      emit('formdata', { formdataCount, action, hiddenName: hidden.name, busyEnterCount, state: current });

      if (!duplicateAttempted && duplicateValue && action === duplicateValue && current.busy === '1') {
        duplicateAttempted = true;
        const button = region.querySelector(`button[type="submit"][value="${duplicateValue}"]`);
        button?.click();
        button?.click();
        emit('duplicate-attempted', { submitCount, formdataCount, busyEnterCount, state: state() });
      }
    });
  }, { token, duplicateValue });
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

async function activateAccepted(page, entryId, value, { keyboard = false, duplicate = false } = {}) {
  const token = `${value}-${entryId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const collector = probeCollector(page, token);
  await installLifecycleProbe(page, token, { duplicateValue: duplicate ? value : null });

  const dialogs = [];
  const dialogListener = async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (dialogs.length === 1) await dialog.accept();
    else await dialog.dismiss();
  };
  page.on('dialog', dialogListener);

  const requests = [];
  const responses = [];
  const requestListener = request => {
    if (request.method() === 'POST') {
      requests.push({ url: request.url(), resource_type: request.resourceType(), navigation: request.isNavigationRequest() });
    }
  };
  const responseListener = response => {
    const request = response.request();
    if (request.method() === 'POST') {
      responses.push({ url: response.url(), status: response.status(), resource_type: request.resourceType(), navigation: request.isNavigationRequest() });
    }
  };
  page.on('request', requestListener);
  page.on('response', responseListener);

  const button = page.locator(`.gravityflow-action-buttons button[value="${value}"]`).first();
  const navigation = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  try {
    if (keyboard) {
      await button.focus();
      await Promise.all([navigation, page.keyboard.press('Enter')]);
    } else {
      await Promise.all([navigation, button.click()]);
    }
  } finally {
    page.off('dialog', dialogListener);
    page.off('request', requestListener);
    page.off('response', responseListener);
    collector.stop();
  }

  const material = collector.events.filter(event => event.kind === 'formdata' && event.action === value);
  const duplicateAttempts = collector.events.filter(event => event.kind === 'duplicate-attempted');
  const busyEntries = material.length ? Math.max(...material.map(event => Number(event.busyEnterCount || 0))) : 0;
  const navigationPosts = requests.filter(request => request.navigation);

  if (dialogs.length !== 1 || dialogs[0].type !== 'confirm') throw new Error(`Native confirmation drifted: ${JSON.stringify(dialogs)}`);
  if (navigationPosts.length !== 1) throw new Error(`Expected one native navigation POST: ${JSON.stringify(requests)}`);
  if (material.length < 1) throw new Error(`No material host payload observed: ${JSON.stringify(collector.events)}`);
  if (busyEntries !== 1) throw new Error(`Busy entered ${busyEntries} times: ${JSON.stringify(collector.events)}`);
  material.forEach(event => assertBusy({ bound: '1', ...event.state }));
  if (duplicate && duplicateAttempts.length !== 1) throw new Error(`Duplicate probe count wrong: ${JSON.stringify(collector.events)}`);

  return {
    dialogs,
    requests,
    responses,
    lifecycle: collector.events,
    material_formdata_count: material.length,
    busy_enter_count: busyEntries,
    duplicate_attempts: duplicateAttempts.length,
  };
}

const results = [];
function persist() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    `${artifactDir}/srwf-journey-production-mr2-action-state-browser.json`,
    JSON.stringify({ schema_version: '1.4.0', runtime: 'REPRODUCIBLE_PINNED_LAB', results }, null, 2) + '\n'
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

await test('SRWF-MR2-CANCEL-001', 'Approve native confirmation Cancel never enters material busy state', async () => {
  const id = createEntry('CANCEL');
  const page = await context.newPage();
  try {
    await gotoReview(page, id);
    const before = host(id);
    const token = `cancel-${id}-${Date.now()}`;
    const collector = probeCollector(page, token);
    await installLifecycleProbe(page, token);
    const dialogs = [];
    const listener = async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); };
    page.on('dialog', listener);
    await page.locator('.gravityflow-action-buttons button[value="approved"]').first().click();
    await page.waitForTimeout(150);
    page.off('dialog', listener);
    collector.stop();
    const idle = await snap(page);
    const after = host(id);
    assertIdle(idle);
    if (dialogs.length !== 1 || dialogs[0] !== 'confirm') throw new Error(`Cancel confirmation drifted: ${JSON.stringify(dialogs)}`);
    if (collector.events.some(event => event.kind === 'formdata' && ['approved', 'rejected', 'revert'].includes(event.action))) {
      throw new Error(`Cancel reached material payload boundary: ${JSON.stringify(collector.events)}`);
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`Cancel mutated host truth: ${JSON.stringify({ before, after })}`);
    return { dialogs, lifecycle: collector.events, before, after, idle };
  } finally {
    await page.close();
  }
});

await test('SRWF-MR2-APPROVE-001', 'Approve enters one busy lifetime and final success remains host-truth gated', async () => {
  const id = createEntry('APPROVE');
  const page = await context.newPage();
  try {
    await gotoReview(page, id);
    const submission = await activateAccepted(page, id, 'approved');
    const state = host(id);
    const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
    if (state.current_step !== null || state.workflow_final_status !== 'approved' || state.api_status !== 'approved' || rendered.join(',') !== 'approved') {
      throw new Error(`Approve truth mismatch: ${JSON.stringify({ state, rendered })}`);
    }
    return { submission, state, rendered };
  } finally {
    await page.close();
  }
});

await test('SRWF-MR2-REJECT-001', 'Reject keyboard activation uses same busy contract and remains a business result', async () => {
  const id = createEntry('REJECT');
  const page = await context.newPage();
  try {
    await gotoReview(page, id);
    const submission = await activateAccepted(page, id, 'rejected', { keyboard: true });
    const state = host(id);
    const result = page.locator('[data-gpp-entry-journey-result="rejected"]').filter({ visible: true }).first();
    const text = await result.innerText();
    if (state.current_step !== null || state.workflow_final_status !== 'rejected' || state.api_status !== 'rejected' || await result.count() !== 1 || /technical|خطای فنی|مشکل فنی/i.test(text)) {
      throw new Error(`Reject truth mismatch: ${JSON.stringify({ state, text })}`);
    }
    return { submission, state, text };
  } finally {
    await page.close();
  }
});

await test('SRWF-MR2-REVERT-001', 'Revert uses bounded busy behavior and still enters native User Input', async () => {
  const id = createEntry('REVERT');
  const page = await context.newPage();
  try {
    await gotoReview(page, id);
    const submission = await activateAccepted(page, id, 'revert');
    const state = host(id);
    const orientation = await page.locator('[data-gpp-entry-journey="correction"]').filter({ visible: true }).count();
    const mr3 = await page.locator('[data-gpp-reject-reason],.gpp-reject-reason,.gpp-entry-reject-reason').count();
    if (state.current_step?.id !== correctionId || state.current_step?.type !== 'user_input' || !state.current_step?.can_update || orientation !== 1 || mr3 !== 0) {
      throw new Error(`Revert/correction ownership drifted: ${JSON.stringify({ state, orientation, mr3 })}`);
    }
    return { submission, state, orientation, mr3_reason_ui_count: mr3 };
  } finally {
    await page.close();
  }
});

await test('SRWF-MR2-DOUBLE-001', 'rapid repeated activation cannot create two material submissions', async () => {
  const id = createEntry('DOUBLE');
  const page = await context.newPage();
  try {
    await gotoReview(page, id);
    const before = host(id);
    const submission = await activateAccepted(page, id, 'approved', { keyboard: true, duplicate: true });
    const after = host(id);
    const navigationPosts = submission.requests.filter(request => request.navigation);
    if (submission.dialogs.length !== 1 || navigationPosts.length !== 1 || submission.duplicate_attempts !== 1 || submission.busy_enter_count !== 1) {
      throw new Error(`Duplicate activation escaped guard: ${JSON.stringify(submission)}`);
    }
    if (after.workflow_final_status !== 'approved' || after.api_status !== 'approved' || after.current_step !== null) {
      throw new Error(`Double activation terminal truth wrong: ${JSON.stringify({ before, after })}`);
    }
    return { submission, before, after };
  } finally {
    await page.close();
  }
});

await test('SRWF-MR2-STALE-001', 'two-tab stale Reject cannot override Tab A Approved host truth', async () => {
  const id = createEntry('STALE');
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  try {
    await Promise.all([gotoReview(tabA, id), gotoReview(tabB, id)]);
    const beforeA = host(id);
    const actionA = await activateAccepted(tabA, id, 'approved');
    const afterA = host(id);
    if (afterA.workflow_final_status !== 'approved' || afterA.api_status !== 'approved' || afterA.current_step !== null) {
      throw new Error(`Tab A did not establish Approved host truth: ${JSON.stringify(afterA)}`);
    }
    if (afterA.timeline === beforeA.timeline) {
      throw new Error(`Timeline observation positive control failed: ${JSON.stringify({ beforeA, afterA })}`);
    }

    const staleAction = await activateAccepted(tabB, id, 'rejected');
    const afterB = host(id);
    if (afterB.timeline !== afterA.timeline) {
      throw new Error(`Stale Tab B mutated native Gravity Flow timeline: ${JSON.stringify({ beforeA, afterA, afterB, staleAction })}`);
    }
    const rendered = await tabB.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
    const controls = await tabB.locator('.gravityflow-status-box .gravityflow-action-buttons button').filter({ visible: true }).count();
    if (afterB.workflow_final_status !== afterA.workflow_final_status || afterB.api_status !== afterA.api_status || afterB.current_step !== null) {
      throw new Error(`Unsafe stale workflow mutation detected: ${JSON.stringify({ afterA, afterB, staleAction })}`);
    }
    if (rendered.join(',') !== 'approved' || controls !== 0) {
      throw new Error(`Stale Tab B fabricated or retained authoritative action UI: ${JSON.stringify({ rendered, controls, afterA, afterB })}`);
    }
    return {
      beforeA,
      actionA,
      afterA,
      timeline_changed_after_approve: true,
      staleAction,
      afterB,
      timeline_unchanged_after_stale_action: true,
      rendered,
      controls,
    };
  } finally {
    await Promise.all([tabA.close(), tabB.close()]);
  }
});

await test('SRWF-MR2-UNKNOWN-001', 'lost response never fabricates terminal client success', async () => {
  const id = createEntry('UNKNOWN');
  const page = await context.newPage();
  try {
    await gotoReview(page, id);
    const token = `unknown-${id}-${Date.now()}`;
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
    const click = page.locator('.gravityflow-action-buttons button[value="approved"]').first().click().catch(error => error);
    await Promise.race([
      interceptedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Lost-response navigation POST was not intercepted.')), 8000)),
    ]);
    await page.waitForTimeout(150);
    await page.unroute('**/*', route);
    page.off('dialog', listener);
    collector.stop();
    await click;

    const pre = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).count();
    const material = collector.events.filter(event => event.kind === 'formdata' && event.action === 'approved');
    if (dialogs.length !== 1 || dialogs[0] !== 'confirm' || !intercepted || pre !== 0 || material.length < 1) {
      throw new Error(`Unknown-response contract failed: ${JSON.stringify({ dialogs, intercepted, pre, lifecycle: collector.events })}`);
    }
    material.forEach(event => assertBusy({ bound: '1', ...event.state }));
    const busy = { bound: '1', ...material[0].state };

    const truth = host(id);
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    const rendered = await page.locator('[data-gpp-entry-journey-result]').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => node.dataset.gppEntryJourneyResult));
    if (truth.workflow_final_status === 'approved' && truth.api_status === 'approved') {
      if (rendered.join(',') !== 'approved') throw new Error(`Fresh Approved truth missing after reload: ${JSON.stringify({ truth, rendered })}`);
    } else if (rendered.includes('approved') || rendered.includes('rejected')) {
      throw new Error(`Ambiguous truth fabricated terminal result: ${JSON.stringify({ truth, rendered })}`);
    }
    return { intercepted, pre, busy, lifecycle: collector.events, truth, rendered };
  } finally {
    await page.close();
  }
});

await test('SRWF-MR2-RESPONSIVE-A11Y-001', 'busy enhancement preserves a11y and current desktop/mobile action presentation', async () => {
  const id = createEntry('RESPONSIVE');
  const page = await context.newPage();
  try {
    const samples = [];
    let canonicalColors = null;
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
      await page.setViewportSize(viewport);
      await gotoReview(page, id);
      const idle = await snap(page);
      const geometry = await page.locator('.gravityflow-action-buttons button').filter({ visible: true }).evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          value: node.value,
          left: rect.left,
          right: rect.right,
          height: rect.height,
          background: style.backgroundColor,
          color: style.color,
          border: style.borderColor,
        };
      }));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1 || geometry.length !== 3 || geometry.some(item => item.left < -1 || item.right > viewport.width + 1 || item.height < 44)) {
        throw new Error(`Responsive action geometry failed: ${JSON.stringify({ viewport, overflow, geometry })}`);
      }
      const colors = Object.fromEntries(geometry.map(item => [item.value, { background: item.background, color: item.color, border: item.border }]));
      if (canonicalColors === null) canonicalColors = colors;
      else if (JSON.stringify(colors) !== JSON.stringify(canonicalColors)) {
        throw new Error(`Responsive semantic colors drifted: ${JSON.stringify({ viewport, canonicalColors, colors })}`);
      }
      samples.push({ viewport, overflow, idle, geometry });
    }
    return { canonical_colors: canonicalColors, samples };
  } finally {
    await page.close();
  }
});

await browser.close();
persist();
const failed = results.filter(result => result.status !== 'PASS');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log(`SRWF_JOURNEY_PRODUCTION_MR2_ACTION_STATE_PASS ${results.length}`);
