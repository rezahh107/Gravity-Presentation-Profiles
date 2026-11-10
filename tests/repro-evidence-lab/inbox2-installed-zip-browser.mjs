import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env = process.env;
const fixture = JSON.parse(fs.readFileSync(path.join(env.WU21_ARTIFACT_DIR, 'gpp-inbox2-installed-fixture.json'), 'utf8'));
const checks = [];
function wp(code) {
  const result = spawnSync('php', [env.WU21_WP_CLI, '--path=' + env.WU21_WP_PATH, 'eval', code],
    {env, encoding: 'utf8', timeout: 90000});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function cookies(id) {
  const code = "$u=get_user_by('id'," + id + ");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(code)).map(x => ({...x, url: env.WU21_BASE_URL}));
}
const ids = async page => page.locator('[data-ciq2-entry]').evaluateAll(nodes =>
  nodes.map(node => Number(node.dataset.ciq2Entry)));
const visible = async page => page.locator('[data-ciq2-entry]').evaluateAll(nodes =>
  nodes.filter(node => !node.hidden).map(node => Number(node.dataset.ciq2Entry)));
const browser = await chromium.launch({headless: true});
const report = {status: 'FAIL', installedVersion: fixture.version, checks};
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await context.addCookies(cookies(fixture.operator_id));
  const page = await context.newPage();
  const errors = [];
  const assets = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/gpp-inbox2.')) assets.push({url: response.url(), status: response.status()});
  });
  const response = await page.goto(fixture.url, {waitUntil: 'networkidle'});
  assert.equal(response.status(), 200);
  assert.equal(await page.locator('[data-ciq2-root][data-ciq2-state="current"]').count(), 1);
  const received = await ids(page);
  const expected = fixture.expected_native_ids;
  assert.deepEqual([...received].sort((a,b)=>a-b), expected);
  assert.equal(new Set(received).size, received.length);
  assert.equal((await visible(page)).length, Math.min(20, received.length));
  assert.ok(assets.some(x => x.url.includes('gpp-inbox2.js') && x.status === 200));
  assert.ok(assets.some(x => x.url.includes('gpp-inbox2.css') && x.status === 200));
  checks.push('real_installed_zip_with_native_authorized_task_identity_and_assets');

  // Independently read the pinned Native Task Model at setup; compare every
  // final permitted text cell against the actual installed shortcode DOM.
  const actualCells = await page.locator('[data-ciq2-entry]').evaluateAll(nodes =>
    Object.fromEntries(nodes.map(node => [
      node.dataset.ciq2Entry,
      {
        student_name: node.querySelector('[data-ciq2-name]').textContent.trim(),
        national_id: node.querySelector('[data-ciq2-national-id]').textContent.trim(),
        school_grade: node.querySelector('[data-ciq2-school-grade]').textContent.trim()
      }
    ])));
  for (const [id, cells] of Object.entries(fixture.expected_final_cells)) {
    assert.deepEqual(actualCells[id], {
      student_name: cells.student_name.trim(),
      national_id: cells.national_id.trim(),
      school_grade: cells.school_grade.trim()
    }, 'final Native Task Model cells diverged on entry ' + id);
  }
  assert.equal(Object.keys(actualCells).length, Object.keys(fixture.expected_final_cells).length);
  checks.push('installed_shortcode_exact_final_native_task_model_cell_parity');

  // The installed shortcode must retain focus on the SAME authorized case
  // when a server-confirmed redraw replaces the old element.
  const focusedId = await page.locator('[data-ciq2-entry]').first().getAttribute('data-ciq2-entry');
  await page.locator('[data-ciq2-detail]').first().focus();
  await page.evaluate(() => document.querySelector('[data-ciq2-refresh]').closest('form').requestSubmit());
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  assert.equal(await page.evaluate(() =>
    document.activeElement.closest('[data-ciq2-entry]')?.dataset.ciq2Entry), focusedId);
  checks.push('same_entry_keyboard_focus_survives_authoritative_refresh');

  // Two independently rendered PHP shortcodes on the same authenticated page:
  // IDs/labels, search, controls, and requested data remain per instance.
  const multi = await context.newPage();
  const multiResponse = await multi.goto(fixture.multi_url, {waitUntil:'networkidle'});
  assert.equal(multiResponse.status(), 200);
  const roots = multi.locator('[data-ciq2-root]');
  assert.equal(await roots.count(), 2);
  const headingIds = await roots.locator('h2').evaluateAll(nodes => nodes.map(node => node.id));
  const searchIds = await roots.locator('[data-ciq2-search]').evaluateAll(nodes => nodes.map(node => node.id));
  assert.equal(new Set(headingIds).size, 2);
  assert.equal(new Set(searchIds).size, 2);
  await roots.nth(0).locator('[data-ciq2-search]').fill('متن-ساختگی-بدون-تطابق-۹۹۹');
  assert.equal(await roots.nth(0).locator('[data-ciq2-entry]:visible').count(), 0);
  assert.ok((await roots.nth(1).locator('[data-ciq2-entry]:visible').count()) > 0);
  await roots.nth(0).locator('[data-ciq2-search]').fill('');
  checks.push('two_shortcode_instances_have_unique_ids_and_isolated_search');

  // Dynamic Elementor-like insertion is NOT a widget qualification: no
  // personalized copied HTML may remain while the new root revalidates.
  let releaseRead;
  let signalHeld;
  const requestHeld = new Promise(resolve => { signalHeld = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  await multi.route('**/admin-ajax.php', async route => {
    if (route.request().postData()?.includes('gpp_inbox2_read')) {
      signalHeld();
      await readGate;
    }
    await route.continue();
  });
  await multi.evaluate(() => {
    const clone = document.querySelector('[data-ciq2-root]').cloneNode(true);
    clone.querySelectorAll('[id]').forEach(node => { node.id += '-dynamic'; });
    clone.querySelectorAll('label[for]').forEach(node => { node.htmlFor += '-dynamic'; });
    document.body.appendChild(clone);
  });
  await requestHeld;
  assert.equal(await roots.count(), 3);
  assert.equal(await roots.nth(2).locator('[data-ciq2-entry]').count(), 0);
  assert.equal(await roots.nth(2).getAttribute('data-ciq2-state'), 'syncing');
  releaseRead();
  await multi.waitForFunction(() => {
    const candidate = [...document.querySelectorAll('[data-ciq2-root]')].at(-1);
    return candidate?.dataset.ciq2State === 'current' &&
      candidate.querySelectorAll('[data-ciq2-entry]').length > 0;
  });
  await multi.unroute('**/admin-ajax.php');
  await multi.evaluate(() => {
    window.GPPInbox2.initAll(document);
    window.GPPInbox2.initAll(document);
  });
  let refreshCalls = 0;
  multi.on('request', request => {
    if (request.url().includes('admin-ajax.php') &&
        request.postData()?.includes('gpp_inbox2_read')) refreshCalls++;
  });
  await roots.nth(2).locator('[data-ciq2-refresh]').click();
  await multi.waitForFunction(() =>
    [...document.querySelectorAll('[data-ciq2-root]')].at(-1)?.dataset.ciq2State === 'current');
  assert.equal(refreshCalls, 1, 'repeated initialization duplicated refresh listeners');
  await multi.evaluate(() => [...document.querySelectorAll('[data-ciq2-root]')].at(-1).remove());
  await multi.waitForFunction(() => document.querySelectorAll('[data-ciq2-root]').length === 2);
  checks.push('dynamic_instance_clears_old_cells_idempotent_init_and_removal');

  // Parent-constrained layout at desktop viewport: genuine CSS container query,
  // not only a narrow device-width media query.
  await multi.setViewportSize({width:1440,height:900});
  await multi.evaluate(() => {
    const parent = document.querySelector('[data-ciq2-root]').parentElement;
    parent.style.width = '390px';
    parent.style.maxWidth = '390px';
  });
  const columns = await roots.first().locator('[data-ciq2-entry]').first().evaluate(node =>
    getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
  assert.equal(columns, 2, 'narrow parent did not stack the case row');
  checks.push('desktop_viewport_with_390px_parent_uses_mobile_card_columns');
  await multi.close();

  // A valid nonce for this page/form must not authorize a different target.
  const tamperResults = await page.evaluate(async () => {
    const root = document.querySelector('[data-ciq2-root]');
    const args = {
      action: 'gpp_inbox2_read', nonce: root.dataset.ciq2Nonce,
      page_id: root.dataset.ciq2Page, form_id: root.dataset.ciq2Form,
      native_page_id: root.dataset.ciq2NativePage
    };
    const outcomes = [];
    for (const property of ['form_id', 'native_page_id']) {
      const params = {...args, [property]: String(Number(args[property]) + 1)};
      const response = await fetch(root.dataset.ciq2Ajax, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        body: new URLSearchParams(params)
      });
      outcomes.push({status: response.status, payload: await response.json()});
    }
    return outcomes;
  });
  for (const check of tamperResults) {
    assert.equal(check.status, 403);
    assert.equal(check.payload.success, false);
    assert.equal(check.payload.data?.reason, 'authorization_required');
  }
  checks.push('forged_form_and_native_page_ajax_targets_rejected');

  const firstName = await page.locator('[data-ciq2-name]').first().innerText();
  assert.ok(firstName.trim().length > 0);
  assert.ok(await page.locator('[data-ciq2-national-id]').first().innerText());
  assert.ok(await page.locator('[data-ciq2-school-grade]').first().innerText());
  await page.locator('[data-ciq2-search]').fill(firstName);
  assert.ok((await visible(page)).length > 0);
  await page.locator('[data-ciq2-search]').fill('');
  checks.push('final_native_cells_and_bounded_local_search');

  const detail = await page.locator('a[data-ciq2-detail]').first().getAttribute('href');
  const native = new URL(detail);
  assert.equal(native.searchParams.get('page'), 'gravityflow-inbox');
  assert.equal(native.searchParams.get('view'), 'entry');
  assert.equal(Number(native.searchParams.get('id')), fixture.form_id);
  assert.ok(received.includes(Number(native.searchParams.get('lid'))));
  await Promise.all([page.waitForNavigation({waitUntil: 'domcontentloaded'}), page.locator('a[data-ciq2-detail]').first().click()]);
  assert.equal(new URL(page.url()).searchParams.get('view'), 'entry');
  await page.locator('.gravityflow_workflow_detail').waitFor({timeout: 15000});
  const detailText = await page.locator('.gravityflow_workflow_detail').innerText();
  assert.doesNotMatch(detailText, /You don't have permission to view this entry\./);
  checks.push('authentic_native_entry_detail_renderer_and_navigation');

  await page.goBack({waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'current');
  assert.deepEqual([...await ids(page)].sort((a,b)=>a-b), expected);
  checks.push('manual_refresh_and_detail_return');

  await page.evaluate(() => document.querySelector('[data-ciq2-root]').dataset.ciq2Nonce = 'invalid');
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'stale');
  assert.deepEqual(await ids(page), []);
  checks.push('invalid_nonce_clears_stale_task_cards');

  await page.reload({waitUntil: 'networkidle'});
  assert.deepEqual([...await ids(page)].sort((a,b)=>a-b), expected);
  await context.clearCookies();
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(() => document.querySelector('[data-ciq2-root]')?.dataset.ciq2State === 'stale');
  assert.deepEqual(await ids(page), []);
  checks.push('expired_login_clears_old_authorized_cells');
  const viewerContext = await browser.newContext({viewport: {width: 390, height: 844}});
  await viewerContext.addCookies(cookies(fixture.viewer_id));
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(fixture.url, {waitUntil: 'networkidle'});
  const viewerIds = await ids(viewerPage);
  const viewerQuery = "wp_set_current_user(" + fixture.viewer_id + ");" +
    "$a=apply_filters('gravityflow_inbox_args',array_merge(Gravity_Flow_Inbox::get_defaults(),['form_id'=>" +
    fixture.form_id + ",'paging'=>['offset'=>0,'page_size'=>2001]]));$n=0;" +
    "$p=Gravity_Flow_API::get_inbox_entries($a,$n);if(is_wp_error($p))$p=[];" +
    "echo wp_json_encode(array_map('intval',array_column($p,'id')));";
  const viewerAllowed = JSON.parse(wp(viewerQuery));
  assert.deepEqual([...viewerIds].sort((a,b)=>a-b), [...viewerAllowed].sort((a,b)=>a-b));
  await viewerContext.close();
  checks.push('second_actor_exact_native_list_authorization_parity');
  assert.deepEqual(errors, []);
  checks.push('no_page_javascript_exceptions');
  report.status = 'PASS';
} catch (error) {
  report.error = String(error?.stack || error);
  throw error;
} finally {
  fs.writeFileSync(path.join(env.WU21_ARTIFACT_DIR, 'gpp-inbox2-installed-browser.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
