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
  checks.push('authentic_native_detail_navigation');

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
