import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifact = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const cli = process.env.WU21_WP_CLI;
if (!artifact || !wpPath || !cli) throw new Error('MR3 pinned journey environment missing');

function wpEval(script) {
  const result = spawnSync('php', [cli, '--path=' + wpPath, 'eval', script], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(String(result.stderr) + String(result.stdout));
  return result.stdout.trim();
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"));'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const operator = manifest.users.operator;
const results = [];
function store(id, status, observation, limits = '') { results.push({ id, status, observation, limits }); }
async function probe(id, fn) {
  try { store(id, 'PASS', await fn(), 'Pinned disposable Chromium/WordPress runtime only; not Owner production'); }
  catch (error) { store(id, 'NOT_PROVEN', { error: String(error.stack || error).slice(0, 3500) }, 'Do not admit production from this scenario'); }
}
function create(label) {
  const entry = wpEval(
    'wp_set_current_user(' + Number(operator.id) + ');' +
    '$id=GFAPI::add_entry(array("form_id"=>' + formId + ',"created_by"=>' + Number(operator.id) + ',"1"=>"SYNTHETIC-MR3-' + label + '"));' +
    'if(is_wp_error($id)||!$id){fwrite(STDERR,"MR3_CREATE_FAILED");exit(2);}' +
    '$api=new Gravity_Flow_API(' + formId + ');$api->process_workflow((int)$id);' +
    '$e=GFAPI::get_entry((int)$id);$r=$api->send_to_step($e,' + reviewId + ');' +
    'if(false===$r||is_wp_error($r)){fwrite(STDERR,"MR3_STEP_FAILED");exit(3);}echo (int)$id;'
  );
  return Number(entry);
}
function truth(id) {
  return JSON.parse(wpEval(
    'wp_set_current_user(' + Number(operator.id) + ');' +
    '$entry=GFAPI::get_entry(' + Number(id) + ');$api=new Gravity_Flow_API(' + formId + ');' +
    '$step=$api->get_current_step($entry);echo wp_json_encode(array(' +
    '"step"=>$step?(int)$step->get_id():null,' +
    '"api_status"=>$api->get_status($entry),' +
    '"final"=>gform_get_meta(' + Number(id) + ',"workflow_final_status"),' +
    '"timeline"=>$api->get_timeline($entry)' +
    '),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);'
  ));
}
function entryUrl(id, frontend = true) {
  if (!frontend) return base + '/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=' + formId + '&lid=' + id;
  const url = new URL(manifest.routes.shortcode.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(id));
  return url.toString();
}
async function login(page, username = operator.login) {
  await page.goto(base + '/wp-login.php');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill('wu21-bootstrap-pass-2026');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.locator('#wp-submit').click()]);
}
async function goto(page, id, frontend = true, width = 390) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(entryUrl(id, frontend), { waitUntil: 'networkidle' });
}
const noteSelector = '.gravityflow-status-box textarea[name="gravityflow_note"]';
const rejectSelector = '.gravityflow-status-box .gravityflow-action-buttons button[value="rejected"]';
const approveSelector = '.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]';
const revertSelector = '.gravityflow-status-box .gravityflow-action-buttons button[value="revert"]';

/**
 * Browser-only prototype, NOT a production seam:
 * One first native Reject click is suppressed in the capture phase, native Note
 * is disclosed in place. Second real user click reaches the original inline
 * Gravity Flow handler without replay/requestSubmit/synthetic click.
 * No native action/nonce/form/textarea is replaced.
 */
async function installPrototype(page) {
  return page.evaluate(() => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-review-mode="read-only"]');
    const form = dossier?.closest('form');
    const note = form?.querySelector('.gravityflow-status-box textarea[name="gravityflow_note"]');
    const label = form?.querySelector('.gravityflow-status-box label[for="gravityflow-note"]');
    const reject = form?.querySelector('.gravityflow-status-box .gravityflow-action-buttons button[value="rejected"]');
    const approved = form?.querySelector('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]');
    const revert = form?.querySelector('.gravityflow-status-box .gravityflow-action-buttons button[value="revert"]');
    const carrier = form?.querySelector('#gravityflow_approval_new_status_step');
    if (!form || !note || !label || !reject || !approved || !revert || !carrier?.name ||
        !reject.getAttribute('onclick')?.includes('handleApprovalStepButtonClick') ||
        note.disabled || note.required) {
      return { eligible: false, reason: 'Native Review/Note or optional contract missing' };
    }
    let wrapper = note;
    while (wrapper && !wrapper.contains(label)) wrapper = wrapper.parentElement;
    const actionRegion = reject.closest('.gravityflow-action-buttons');
    if (!wrapper || wrapper.contains(actionRegion) || wrapper === form ||
        wrapper.classList.contains('gravityflow-status-box') ||
        wrapper.querySelectorAll('textarea[name="gravityflow_note"]').length !== 1) {
      return { eligible: false, reason: 'No bounded shared Note + label wrapper, cannot safely hide' };
    }
    const original = { onclick: reject.getAttribute('onclick'), noteName: note.name, carrierName: carrier.name };
    const guidance = document.createElement('p');
    guidance.textContent = 'دلیل رد پرونده (اختیاری)؛ می‌توانید این قسمت را خالی بگذارید.';
    guidance.lang = 'fa'; guidance.dir = 'rtl';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'انصراف';
    cancel.setAttribute('data-mr3-prototype-cancel', '1');
    wrapper.insertBefore(guidance, note);
    wrapper.appendChild(cancel);
    let open = false;
    let intercepted = 0;
    const show = () => {
      open = true;
      wrapper.style.display = '';
      note.focus({ preventScroll: true });
    };
    const close = () => {
      note.value = '';
      open = false;
      wrapper.style.display = 'none';
      reject.focus({ preventScroll: true });
    };
    cancel.addEventListener('click', close);
    wrapper.addEventListener('keydown', e => {
      if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
    });
    // Capture on form deliberately precedes the native button's inline onclick.
    form.addEventListener('click', e => {
      if (e.target.closest('button') !== reject || open) return;
      intercepted++;
      e.preventDefault();
      e.stopImmediatePropagation();
      show();
    }, true);
    wrapper.style.display = 'none';
    window.__mr3TestSnapshot = () => ({
      open, intercepted, wrapperVisible: getComputedStyle(wrapper).display !== 'none',
      noteVisible: note.getBoundingClientRect().height > 0,
      noteValue: note.value, focus: document.activeElement === note ? 'note' : document.activeElement === reject ? 'reject' : 'other',
      noteIdentityUnchanged: note.name === original.noteName && form.querySelectorAll('textarea[name="gravityflow_note"]').length === 1,
      rejectHandlerUnchanged: reject.getAttribute('onclick') === original.onclick,
      carrierUnchanged: carrier.name === original.carrierName
    });
    return { eligible: true, original, wrapperTag: wrapper.tagName, wrapperClass: wrapper.className, panelInitial: window.__mr3TestSnapshot() };
  });
}
async function state(page) { return page.evaluate(() => window.__mr3TestSnapshot?.() || null); }
async function firstReject(page) {
  let dialogs = 0;
  page.on('dialog', async d => { dialogs++; await d.dismiss(); });
  await page.locator(rejectSelector).click();
  await page.waitForTimeout(80);
  page.removeAllListeners('dialog');
  return { dialogs, state: await state(page) };
}
async function nativeConfirm(page, value, accept) {
  const seen = [];
  const listener = async d => { seen.push(d.type()); if (accept) await d.accept(); else await d.dismiss(); };
  page.on('dialog', listener);
  const click = page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="' + value + '"]').click();
  if (accept) await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), click]);
  else { await click; await page.waitForTimeout(120); }
  page.off('dialog', listener);
  return seen;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await login(page);
  await probe('MR3-001-CONTROL-CONTRACT', async () => {
    const id = create('INITIAL');
    await goto(page, id);
    const before = truth(id);
    const hostNoteVisible = await page.locator(noteSelector).isVisible();
    const installed = await installPrototype(page);
    assert(installed.eligible, JSON.stringify(installed));
    const initial = await state(page);
    assert(hostNoteVisible && !initial.noteVisible && initial.noteIdentityUnchanged && initial.rejectHandlerUnchanged && initial.carrierUnchanged, JSON.stringify({ installed, initial }));
    assert(before.step === reviewId, 'Not actionable Review');
    return { installed, hostNoteVisible, initial };
  });
  await probe('MR3-002-REJECT-EMPTY', async () => {
    const id = create('EMPTY');
    await goto(page, id); const before = truth(id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const first = await firstReject(page);
    const afterFirst = truth(id);
    assert(first.dialogs === 0 && first.state.noteVisible && first.state.focus === 'note' && JSON.stringify(before) === JSON.stringify(afterFirst), JSON.stringify({ first, before, afterFirst }));
    const nativeDialogs = await nativeConfirm(page, 'rejected', true);
    const after = truth(id);
    assert(nativeDialogs.length === 1 && nativeDialogs[0] === 'confirm' && after.final === 'rejected' && after.api_status === 'rejected' && after.step === null, JSON.stringify({ nativeDialogs, after }));
    return { first, nativeDialogs, after };
  });
  await probe('MR3-003-REJECT-NONEMPTY-TIMELINE', async () => {
    const id = create('NONEMPTY');
    await goto(page, id); const initial = await installPrototype(page); assert(initial.eligible, JSON.stringify(initial));
    await firstReject(page);
    const noteText = 'SYNTHETIC-MR3-REJECT-TIMELINE-' + id;
    await page.locator(noteSelector).fill(noteText);
    const dialogs = await nativeConfirm(page, 'rejected', true);
    const after = truth(id);
    const timelineContains = JSON.stringify(after.timeline).includes(noteText);
    assert(dialogs.length === 1 && after.final === 'rejected' && timelineContains, JSON.stringify({ dialogs, after, timelineContains }));
    const result = await page.locator('[data-gpp-entry-journey-result="rejected"]').innerText();
    assert(!result.includes(noteText), 'Rejected Result repeated rejection reason');
    return { dialogs, status: after.final, timelineContains, resultReasonLeaked: result.includes(noteText) };
  });
  await probe('MR3-004-LOCAL-CANCEL', async () => {
    const id = create('CANCEL'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const before = truth(id); await firstReject(page);
    await page.locator('[data-mr3-prototype-cancel]').click();
    const after = truth(id), snapshot = await state(page);
    assert(JSON.stringify(before) === JSON.stringify(after) && !snapshot.noteVisible && snapshot.focus === 'reject' && snapshot.noteValue === '', JSON.stringify({ before, after, snapshot }));
    return { before, after, snapshot };
  });
  await probe('MR3-005-FILLED-LOCAL-CANCEL', async () => {
    const id = create('FILLCANCEL'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const before = truth(id); await firstReject(page); await page.locator(noteSelector).fill('SYNTHETIC-MR3-UNSAVED');
    await page.locator('[data-mr3-prototype-cancel]').click();
    const after = truth(id), snapshot = await state(page);
    assert(JSON.stringify(before) === JSON.stringify(after) && snapshot.noteValue === '' && !snapshot.noteVisible, JSON.stringify({ after, snapshot }));
    return { after, snapshot };
  });
  await probe('MR3-006-NATIVE-CONFIRM-CANCEL', async () => {
    const id = create('CONFIRMCANCEL'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const before = truth(id); await firstReject(page); await page.locator(noteSelector).fill('SYNTHETIC-NOT-SAVED');
    const dialogs = await nativeConfirm(page, 'rejected', false);
    const after = truth(id);
    assert(dialogs.length === 1 && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ dialogs, before, after }));
    return { dialogs, unchanged: true, panel: await state(page) };
  });
  await probe('MR3-007-APPROVE-UNTOUCHED', async () => {
    const id = create('APPROVE'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const initial = await state(page); assert(!initial.noteVisible, 'Note visible pre-Approve');
    const dialogs = await nativeConfirm(page, 'approved', true), after = truth(id);
    assert(dialogs.length === 1 && after.final === 'approved' && after.step === null, JSON.stringify({ dialogs, after }));
    return { dialogs, after };
  });
  await probe('MR3-008-CORRECTION-UNTOUCHED', async () => {
    const id = create('REVERT'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const initial = await state(page); assert(!initial.noteVisible, 'Note visible pre-Revert');
    const dialogs = await nativeConfirm(page, 'revert', true), after = truth(id);
    assert(after.step !== reviewId && after.final === 'pending', JSON.stringify({ dialogs, after }));
    return { dialogs, afterStep: after.step, afterFinal: after.final };
  });
  await probe('MR3-009-KEYBOARD-ESCAPE-RTL-VIEWPORTS', async () => {
    const states = [];
    for (const width of [320, 390, 1440]) {
      const id = create('WIDTH' + width); await goto(page, id, true, width);
      const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
      const dir = await page.locator('.gravityflow_workflow_detail').first().evaluate(el => getComputedStyle(el).direction);
      await page.locator(rejectSelector).focus();
      await page.keyboard.press('Enter');
      const open = await state(page);
      assert(open.noteVisible && open.focus === 'note', JSON.stringify({ width, open }));
      await page.keyboard.press('Escape');
      const closed = await state(page);
      assert(!closed.noteVisible && closed.focus === 'reject', JSON.stringify({ width, closed }));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      states.push({ width, dir, open, closed, overflow });
    }
    return states;
  });
  await probe('MR3-010-ADMIN-UNRELATED', async () => {
    const id = create('ADMIN'); await goto(page, id, false);
    const native = await page.locator(noteSelector).count();
    const disclosed = await page.locator('[data-mr3-prototype-cancel]').count();
    assert(native === 1 && disclosed === 0, JSON.stringify({ native, disclosed }));
    return { nativeNoteCount: native, prototypeLeak: disclosed };
  });
  await probe('MR3-011-STALE-TWO-TABS', async () => {
    const id = create('STALE');
    const a = await context.newPage(); const b = await context.newPage();
    try {
      await goto(a, id); await goto(b, id);
      const installed = await installPrototype(b); assert(installed.eligible, JSON.stringify(installed));
      await firstReject(b);
      await b.locator(noteSelector).fill('SYNTHETIC-MR3-STALE-DO-NOT-PERSIST');
      await nativeConfirm(a, 'approved', true);
      const approved = truth(id);
      const dialogs = await nativeConfirm(b, 'rejected', true);
      const stale = truth(id);
      assert(approved.final === 'approved' && stale.final === 'approved' && JSON.stringify(approved.timeline) === JSON.stringify(stale.timeline) && !JSON.stringify(stale.timeline).includes('SYNTHETIC-MR3-STALE-DO-NOT-PERSIST'), JSON.stringify({ approved, stale, dialogs }));
      return { dialogs, final: stale.final, noStaleNotePersistence: true };
    } finally { await a.close(); await b.close(); }
  });
  await probe('MR3-012-UNAUTHORIZED', async () => {
    const id = create('UNAUTHORIZED');
    const other = await browser.newContext(); const p = await other.newPage();
    try {
      await login(p, manifest.users.negative_control.login);
      await goto(p, id);
      const eligible = await installPrototype(p);
      const actions = await p.locator(rejectSelector).count();
      assert(!eligible.eligible && actions === 0, JSON.stringify({ eligible, actions }));
      return { eligible, nativeRejectButtonCount: actions };
    } finally { await other.close(); }
  });
  await probe('MR3-013-NOTE-PRINT-EXCLUSION', async () => {
    const id = create('PRINT');
    await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    await firstReject(page);
    const marker = 'SYNTHETIC-MR3-PRINT-EXCLUDE-' + id;
    await page.locator(noteSelector).fill(marker);
    await nativeConfirm(page, 'rejected', true);
    const utility = page.locator('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-url]').first();
    const url = await utility.getAttribute('data-gpp-dossier-print-url');
    assert(Boolean(url), 'Print utility URL unavailable');
    const printPage = await context.newPage();
    try {
      const response = await printPage.goto(url, { waitUntil: 'networkidle' });
      const html = await printPage.locator('body').innerText();
      const sheets = await printPage.locator('.gpp-print-sheet').count();
      assert(response.status() === 200 && sheets === 2 && !html.includes(marker), JSON.stringify({ status: response.status(), sheets, leaked: html.includes(marker) }));
      return { status: response.status(), sheets, reasonLeaked: false };
    } finally { await printPage.close(); }
  });
  await probe('MR3-014-INVALID-NONCE-NOTE', async () => {
    const id = create('BADNONCE'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const before = truth(id);
    await firstReject(page);
    const marker = 'SYNTHETIC-MR3-NONCE-MUST-NOT-PERSIST-' + id;
    await page.locator(noteSelector).fill(marker);
    await page.locator('input[name="_wpnonce"]').first().evaluate(el => { el.value = 'MR3-intentionally-invalid'; });
    const dialogs = await nativeConfirm(page, 'rejected', true);
    const after = truth(id);
    const leaked = JSON.stringify(after.timeline).includes(marker);
    assert(dialogs.length === 1 && after.final === 'pending' && after.step === before.step && !leaked, JSON.stringify({ dialogs, before, after, leaked }));
    return { dialogs, final: after.final, persistedNote: leaked, authoritativeResultUnchanged: true };
  });
  await probe('MR3-015-DOUBLE-ACTIVATION-CANCEL', async () => {
    const id = create('DOUBLE'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const before = truth(id), dialogs = [];
    const listener = async d => { dialogs.push(d.type()); await d.dismiss(); };
    page.on('dialog', listener);
    try {
      await page.locator(rejectSelector).dblclick();
      await page.waitForTimeout(100);
    } finally { page.off('dialog', listener); }
    const after = truth(id), snapshot = await state(page);
    assert(JSON.stringify(before) === JSON.stringify(after) && snapshot.intercepted === 1 && dialogs.length === 1, JSON.stringify({ dialogs, snapshot, before, after }));
    return { dialogs, snapshot, noMutation: true, note: 'Second physical activation still opens native confirmation; native Cancel owns termination' };
  });
  await probe('MR3-016-INTERRUPTED-POST', async () => {
    const id = create('ABORT'); await goto(page, id);
    const installed = await installPrototype(page); assert(installed.eligible, JSON.stringify(installed));
    const before = truth(id);
    await firstReject(page);
    const marker = 'SYNTHETIC-MR3-ABORT-MUST-NOT-PERSIST-' + id;
    await page.locator(noteSelector).fill(marker);
    let aborted = 0, confirmCount = 0;
    const handler = async route => {
      if (route.request().isNavigationRequest() && route.request().method() === 'POST') {
        aborted++;
        await route.abort('failed');
      } else await route.continue();
    };
    const listener = async d => { confirmCount++; await d.accept(); };
    await page.route('**/*', handler);
    page.on('dialog', listener);
    let transportError = null;
    try {
      await page.locator(rejectSelector).click({ timeout: 12000 });
      await page.waitForTimeout(150);
    } catch (error) { transportError = String(error).slice(0, 500); }
    finally { page.off('dialog', listener); await page.unroute('**/*', handler); }
    const after = truth(id);
    const fabricated = await page.locator('[data-gpp-entry-journey-result="rejected"]').count();
    assert(aborted >= 1 && confirmCount === 1 && JSON.stringify(before) === JSON.stringify(after) && fabricated === 0, JSON.stringify({ aborted, confirmCount, before, after, fabricated, transportError }));
    return { aborted, confirmCount, afterStatus: after.final, fabricated, transportError };
  });
} finally {
  await browser.close();
  fs.writeFileSync(artifact + '/srwf-mr3-browser-qualification.json', JSON.stringify({
    kind: 'NON_PRODUCTION_BROWSER_PROTOTYPE', authority: 'GRAVITY_FLOW_NATIVE',
    verdict: 'UNDECIDED_UNTIL_SOURCE_AND_RUNTIME_REVIEW',
    result_count: results.length, results
  }, null, 2) + '\n');
}
console.log('MR3_PROTOTYPE_CAPTURED ' + JSON.stringify(results.map(x => [x.id, x.status])));
