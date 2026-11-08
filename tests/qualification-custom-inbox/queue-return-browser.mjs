import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

// Isolated, synthetic-only return lifecycle discriminator. First, the Officer
// really clicks the native Gravity Flow Approval button and returns voluntarily.
// A separate host API transition then probes the BFCache recovery boundary.
const env = process.env;
const root = env.WU21_ARTIFACT_DIR;
const f = JSON.parse(fs.readFileSync(path.join(root, 'ciq2-browser-fixture.json'), 'utf8'));
const report = {head: env.GPP_WU21_REPOSITORY_SHA, status: 'RUNNING', checks: [], scope: 'synthetic-return-lifecycle'};
const save = () => fs.writeFileSync(path.join(root, 'ciq2-queue-return.json'), JSON.stringify(report, null, 2));
const pass = name => { report.checks.push(name); save(); };
function wp(code) {
  const p = spawnSync('php', [env.WU21_WP_CLI, '--path=' + env.WU21_WP_PATH, 'eval', code],
    {env, encoding: 'utf8', timeout: 120000});
  assert.equal(p.status, 0, p.stderr || p.stdout);
  return p.stdout.trim();
}
const oracle = () => JSON.parse(wp(
  'wp_set_current_user(' + f.officer + ');$r=ciq2_snapshot_rows(["form_id"=>' + f.form_id + ']);' +
  'if(is_wp_error($r))throw new RuntimeException($r->get_error_code());' +
  'echo wp_json_encode(array_map("intval",array_column($r,"id")));'
));
const ids = p => p.locator('[data-ciq2-entry]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.ciq2Entry)));
const browser = await chromium.launch({headless: true});
try {
  const ctx = await browser.newContext({viewport: {width: 390, height: 850}});
  const cookies = JSON.parse(wp(
    '$u=get_user_by("id",' + f.officer + ');$e=time()+3600;' +
    'echo wp_json_encode([["name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"auth")],' +
    '["name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"logged_in")]]);'
  ));
  await ctx.addCookies(cookies.map(c => ({...c, url: env.WU21_BASE_URL})));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const response = await page.goto(f.custom_url, {waitUntil: 'networkidle'});
  assert.equal(response.status(), 200);
  const before = oracle();
  assert.ok(before.length >= 2, 'Synthetic Officer queue should contain two tasks');
  assert.deepEqual(await ids(page), before, 'Server-rendered order differs from host-backed ordered rows');
  report.before = before;
  pass('ordered_authorized_host_queue_matches_rendered_cards');

  const firstTask = before[0];
  const link = page.locator('[data-ciq2-entry="' + firstTask + '"] [data-ciq2-detail]');
  const nativeHref = await link.getAttribute('href');
  assert.equal(Number(new URL(nativeHref, env.WU21_BASE_URL).searchParams.get('lid')), firstTask);
  await link.click();
  await page.locator('.gravityflow_workflow_detail').waitFor();
  report.native_detail_controls = await page.locator('.gravityflow_workflow_detail input, .gravityflow_workflow_detail button, .gravityflow_workflow_detail select').evaluateAll(elements =>
    elements.map(e => ({tag: e.tagName, type: e.type || '', name: e.name || '', value: String(e.value || '').slice(0, 80),
      text: String(e.textContent || '').trim().slice(0, 80)})).slice(0, 35));
  const approve = page.locator('.gravityflow_workflow_detail button[type="submit"][value="approved"]');
  assert.equal(await approve.count(), 1, 'Native Gravity Flow Approval button was not present');
  const nativePosts = [];
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().startsWith(env.WU21_BASE_URL)) nativePosts.push(request.url());
  });
  await approve.click(); // Genuine operator click: keep native validation and Result flow.
  await page.waitForLoadState('networkidle');
  const afterNativeApproval = oracle();
  report.native_approval = {
    clicked: true, method: 'native_form_submit', post_count: nativePosts.length,
    operator_task_ids_after: afterNativeApproval,
    result_url: page.url(),
    result_text_excerpt: (await page.locator('body').innerText()).slice(0, 400),
    return_links: await page.locator('a[href]').evaluateAll(a => a.map(x =>
      ({text: (x.textContent || '').trim().slice(0, 65), href: x.getAttribute('href')}))
      .filter(x => /inbox|back|return|بازگشت|برگشت/i.test(x.text)).slice(0, 10)),
  };
  save();
  assert.ok(nativePosts.length >= 1, 'Approval click did not submit a native POST');
  assert.ok(!afterNativeApproval.includes(firstTask), 'Officer still has an actionable task after approving it');
  pass('genuine_officer_native_approval_changes_authoritative_pending_task_set');

  // User-initiated browser Back from the native Result/Detail page. The native
  // Result remains visible before this action; no automatic next-task jump.
  let returned = false;
  for (let i = 0; i < 3 && !returned; i++) {
    const response = await page.goBack({waitUntil: 'domcontentloaded'});
    if (!response) break;
    returned = new URL(page.url()).pathname === new URL(f.custom_url).pathname;
  }
  assert.equal(returned, true, 'Native Result browser Back did not reach the originating Inbox 2');
  await page.waitForFunction(expected => {
    const r = document.querySelector('[data-ciq2-root]');
    return r?.dataset.ciq2State === 'current' &&
      JSON.stringify([...document.querySelectorAll('[data-ciq2-entry]')].map(x => Number(x.dataset.ciq2Entry))) === JSON.stringify(expected);
  }, afterNativeApproval, {timeout: 90000});
  assert.deepEqual(await ids(page), afterNativeApproval);
  pass('genuine_native_approval_and_browser_back_revalidated_next_queue_task');

  // Separate BFCache regression discriminator using a real host transition,
  // not a second browser approval. No new task/authorization engine is created.
  const target = afterNativeApproval[0];
  assert.ok(Number.isSafeInteger(target) && target > 0);
  const moved = wp('wp_set_current_user(' + f.admin + ');$e=GFAPI::get_entry(' + target + ');' +
    '$a=new Gravity_Flow_API(' + f.form_id + ');$r=$a->send_to_step($e,' + f.next_step + ');' +
    'if(is_wp_error($r)||false===$r)throw new RuntimeException("transition_failed");echo "native-step";');
  assert.equal(moved, 'native-step');
  const authoritativeAfter = oracle();
  assert.ok(!authoritativeAfter.includes(target), 'Host still considers transitioned task actionable');
  report.after_host = authoritativeAfter;
  const browserBeforeRestore = await ids(page);
  report.browser_before_restore = browserBeforeRestore;

  // Test the BFCache lifecycle contract even when headless Chromium bypasses
  // BFCache due to Cache-Control: no-store. This is a *simulated persisted event*
  // against the real host; do not label it an observed actual BFCache restore.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
  const immediate = await page.evaluate(id => {
    const r = document.querySelector('[data-ciq2-root]');
    return {state: r?.dataset.ciq2State, oldCard: !!document.querySelector('[data-ciq2-entry="' + id + '"]'),
      oldLink: !!document.querySelector('[data-ciq2-entry="' + id + '"] [data-ciq2-detail]')};
  }, target);
  report.immediate_persisted_pageshow = immediate;
  save();
  assert.equal(immediate.oldCard, false, 'Restored old private card was left available before fresh authorization');
  assert.notEqual(immediate.state, 'current', 'Restored unvalidated queue still declares itself current');
  pass('persisted_pageshow_invalidates_old_cards_before_async_recheck');

  await page.waitForFunction(expected => {
    const root = document.querySelector('[data-ciq2-root]');
    return root?.dataset.ciq2State === 'current' &&
      JSON.stringify([...document.querySelectorAll('[data-ciq2-entry]')].map(e => Number(e.dataset.ciq2Entry))) === JSON.stringify(expected);
  }, authoritativeAfter, {timeout: 90000});
  assert.deepEqual(await ids(page), authoritativeAfter);
  assert.equal((await ids(page))[0], authoritativeAfter[0]);
  pass('persisted_pageshow_rechecks_host_membership_and_presents_next_task');

  // A hidden tab is no longer an authorized currently actionable task view.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await ctx.clearCookies();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));
  });
  await page.locator('[data-ciq2-state="stale"]').waitFor({timeout: 90000});
  assert.deepEqual(await ids(page), [], 'Expired session kept private task cards visible');
  pass('expired_session_on_restore_clears_private_cards');
  assert.deepEqual(errors, []);
  report.status = 'PASS_RETURN_LIFECYCLE_SYNTHETIC';
  save();
  console.log('CIQ2_QUEUE_RETURN_PASS ' + report.checks.length);
  await ctx.close();
} catch (error) {
  report.status = 'FAIL'; report.error = String(error.stack || error); save(); throw error;
} finally {
  await browser.close();
}
