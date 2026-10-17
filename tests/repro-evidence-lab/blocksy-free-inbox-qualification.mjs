import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

// A test-only extension of the PR #156 pinned, real Blocksy/WU21/P06 fixture.
// No GPP/Gravity Flow behavior or production site state is modified.
const env = process.env;
const { WU21_ARTIFACT_DIR: out, WU21_WP_PATH: wpPath, WU21_WP_CLI: cli, WU21_BASE_URL: base } = env;
for (const [key, value] of Object.entries({ out, wpPath, cli, base })) assert.ok(value, 'Missing ' + key);
fs.mkdirSync(out, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture-manifest.json'), 'utf8'));
const p06 = JSON.parse(fs.readFileSync(path.join(out, 'p06-fixture-initialization.json'), 'utf8'));
assert.equal(fixture.data_class, 'SYNTHETIC_NON_PII');
assert.equal(p06.status, 'PASS');
const routes = [
  { key: 'shortcode', url: fixture.frontend_inbox_url, id: fixture.frontend_inbox_page_id },
  { key: 'block', ...JSON.parse(wpEval("echo wp_json_encode(get_option('gpp_p06_fixture_manifest')['authentic_block_page']);")) },
];
routes[1].id = routes[1].page_id;
assert.ok(routes.every(r => r.id && r.url && r.url.startsWith(base + '/')));
const unrelated = JSON.parse(wpEval("echo wp_json_encode(get_option('gpp_p06_fixture_manifest')['unrelated_page']);"));
const grid = '[data-js="gflow-inbox"] .ag-root-wrapper';
const rows = '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row';
const search = '[data-js="gflow-inbox-search"]';
const surface = '[data-gpp-inbox-surface="gravity_flow.inbox"]';
const refresh = '[data-gpp-inbox-manual-refresh]';
const pollEndpoint = '/wp-json/gravityflow/internal/inbox/changes';
const results = { schema_version: '1.0.0', source: 'BLOCKSY_FREE_2_1_59_WU21_AUTHENTIC', cases: [],
  errors: [], page_errors: [], host_title: {}, interactions: [], runtime: JSON.parse(fs.readFileSync(path.join(out, 'blocksy-runtime.json'), 'utf8')) };
assert.equal(results.runtime.version, '2.1.59');
assert.equal(results.runtime.theme, 'blocksy');
assert.equal(results.runtime.child, false);

function wpEval(code) {
  const cp = spawnSync('php', [cli, '--path=' + wpPath, 'eval', code], { encoding: 'utf8', env, timeout: 60000 });
  if (cp.status !== 0) throw Error('Authentic WP-CLI failure: ' + (cp.stderr || cp.stdout).slice(0, 1600));
  return cp.stdout.trim();
}
function control(action) {
  const cp = spawnSync('php', [cli, '--path=' + wpPath, 'eval-file',
    path.join(env.GITHUB_WORKSPACE, 'tests/repro-evidence-lab/runtime-control.php')],
  { encoding: 'utf8', env: { ...env, WU21_CONTROL: action }, timeout: 60000 });
  if (cp.status !== 0) throw Error('WU21 host mutation failed: ' + (cp.stderr || cp.stdout).slice(0, 1200));
  return cp.stdout.trim();
}
function auth(user) {
  const safeUser = user === 'viewer' ? 'wu21_viewer' : 'bootstrap_admin';
  return JSON.parse(wpEval(
    "$u=get_user_by('login','" + safeUser + "');if(!$u)throw new RuntimeException('Missing synthetic user');" +
    "$e=time()+1800;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')]," +
    "['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);"
  )).map(item => ({ ...item, url: base }));
}
function clip(x, n = 1800) { return String(x ?? '').slice(0, n); }
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'fa-IR' });
await ctx.addCookies(auth('operator'));
const page = await ctx.newPage();
let active = null;
page.on('pageerror', e => {
  const message = clip(e?.stack || e, 1600);
  results.page_errors.push({ scenario: active, message });
});
const hostRequests = [];
page.on('response', async r => {
  if (r.url().includes(pollEndpoint)) hostRequests.push({ scenario: active, status: r.status(), url: r.url(), at: Date.now() });
});
async function check(id, fn, missing = false) {
  active = id;
  const record = { id, status: 'PASS', observations: null };
  results.cases.push(record);
  try {
    record.observations = await fn();
  } catch (error) {
    record.status = missing ? 'NOT_PROVEN' : 'FAIL';
    record.error = clip(error?.stack || error, 2500);
    if (!missing) results.errors.push({ id, error: record.error });
  } finally { active = null; }
  console.log('BLOCKSY_CASE ' + record.status + ' ' + id + (record.error ? ' ' + clip(record.error, 150) : ''));
  return record;
}
async function openInbox(route) {
  const r = await page.goto(route.url, { waitUntil: 'networkidle', timeout: 45000 });
  assert.equal(r?.status(), 200, 'Inbox page response');
  await page.locator(grid).waitFor({ timeout: 30000 });
  assert.equal(await page.locator(surface).count(), 1);
  assert.equal(await page.locator(grid).count(), 1);
}
async function headings() {
  return page.evaluate(selector => [...document.querySelectorAll('h1')].map(node => ({
    text: node.textContent.trim(), outer: !node.closest(selector),
    path: node.parentElement?.className || null, visible: !!node.getClientRects().length,
  })), surface);
}
async function picture(name) {
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
}
async function geometry() {
  return page.evaluate(({ surface, grid, refresh }) => {
    const rect = node => {
      if (!node) return null;
      const b = node.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width,
        height: b.height, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    };
    const doc = document.documentElement;
    const nodes = Object.fromEntries(Object.entries({ surface, grid, refresh,
      search: '[data-js="gflow-inbox-search"]', pager: '[data-js="gflow-inbox"] .ag-paging-panel',
      hero: '.hero-section', header: '.gpp-inbox-surface__header' })
      .map(([key, sel]) => [key, rect(document.querySelector(sel))]));
    const counts = {
      native: document.querySelectorAll('[data-js="gflow-inbox"]').length,
      grid: document.querySelectorAll(grid).length,
      surface: document.querySelectorAll(surface).length,
      search: document.querySelectorAll('[data-js="gflow-inbox-search"]').length,
      pager: document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
      manual_refresh: document.querySelectorAll(refresh).length,
      replacement: document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app, .gpp-inbox-card').length,
    };
    const clipping = Object.entries(nodes).filter(([k]) => k !== 'grid' && k !== 'hero' && k !== 'pager')
      .filter(([, b]) => b && (b.left < -2 || b.right > innerWidth + 2));
    return { viewport: innerWidth, html_dir: doc.dir, doc_scroll_width: doc.scrollWidth, nodes, counts,
      clipped: clipping.map(([k]) => k), title_elements: [...document.querySelectorAll('h1')].map(n => n.textContent.trim()) };
  }, { surface, grid, refresh });
}
function assertGeometry(g, width) {
  assert.equal(g.html_dir, 'rtl');
  assert.equal(g.counts.surface, 1); assert.equal(g.counts.native, 1); assert.equal(g.counts.grid, 1);
  assert.equal(g.counts.search, 1); assert.equal(g.counts.pager, 1);
  assert.equal(g.counts.manual_refresh, 1); assert.equal(g.counts.replacement, 0);
  assert.ok(g.doc_scroll_width <= width + 2, 'Document-wide overflow');
  assert.deepEqual(g.clipped, [], 'Clipped outer presentation controls');
  assert.ok(g.nodes.surface?.width > 0);
  assert.ok(g.nodes.pager?.width > 0 && g.nodes.pager?.height > 0, 'Native pager clipped/hidden');
  assert.ok(g.nodes.refresh?.height >= 40, 'Refresh touch target collapsed');
}
async function waitCount(n) {
  await page.waitForFunction(({ rows, n }) => document.querySelectorAll(rows).length === n,
    { rows, n }, { timeout: 18000 });
}
async function waitId(id, present) {
  await page.waitForFunction(({ rows, id, present }) =>
    [...document.querySelectorAll(rows)].some(node => node.getAttribute('row-id') === String(id)) === present,
  { rows, id, present }, { timeout: 45000 });
}
function sourceProbe() {
  const root = path.join(wpPath, 'wp-content/themes/blocksy');
  const witnesses = [];
  function scan(dir, depth) {
    if (depth > 8) return;
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', 'static', 'vendor', 'languages'].includes(file.name)) continue;
      const p = path.join(dir, file.name);
      if (file.isDirectory()) { scan(p, depth + 1); continue; }
      if (!/\.php$/.test(file.name)) continue;
      const body = fs.readFileSync(p, 'utf8');
      const lines = body.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/(blocksy_post_meta_options|has_hero_section|page_title_enabled|page_title|hero-section)/.test(lines[i])) {
          witnesses.push({ file: path.relative(root, p), line: i + 1, snippet: clip(lines[i].trim(), 220) });
        }
      }
    }
  }
  scan(root, 0);
  const facts = { root, total_witnesses: witnesses.length,
    post_meta_witnesses: witnesses.filter(w => w.snippet.includes('blocksy_post_meta_options')),
    title_witnesses: witnesses.filter(w => w.snippet.includes('page_title') || w.snippet.includes('has_hero_section')).slice(0, 100),
    hero_witnesses: witnesses.filter(w => w.snippet.includes('hero-section')).slice(0, 20) };
  fs.writeFileSync(path.join(out, 'blocksy-title-source.json'), JSON.stringify(facts, null, 2));
  return facts;
}
// Run source/host title qualification without prematurely claiming the guessed
// persisted-option shape is supported. Rendered before/after is the authority.
try {
  const source = sourceProbe();
  console.log('BLOCKSY_TITLE_SOURCE ' + JSON.stringify({
    post_meta: source.post_meta_witnesses.slice(0, 3), title: source.title_witnesses.slice(0, 8)
  }));
  results.host_title.source_provenance = { total_witnesses: source.total_witnesses, meta: source.post_meta_witnesses };
  for (const route of routes) {
    await check('title-before-' + route.key, async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await openInbox(route);
      const h = await headings();
      const g = await geometry();
      await picture(route.key + '-before');
      assert.equal(h.filter(x => !x.outer && x.text === 'کارهای من').length, 1);
      assert.ok(h.some(x => x.outer && x.visible && x.text === (route.key === 'block' ? 'P06 Authentic Inbox Block' : 'WU21 Frontend Inbox')),
        'Outer Blocksy native page title was not reproduced');
      return { headings: h, geometry: g, page_id: route.id };
    });
  }
  // Test-only mutation of disposable, synthetic CI pages, not the Owner site.
  // The source probe and browser must corroborate whether this is really a
  // supported Blocksy per-page title option; an unsuccessful trial is NOT_PROVEN.
  const idList = routes.map(r => Number(r.id)).join(',');
  const mutation = await check('title-native-page-setting-source', async () => {
    assert.ok(source.post_meta_witnesses.length > 0, 'Installed Blocksy source does not expose the per-post options meta key.');
    assert.ok(source.title_witnesses.some(w => w.snippet.includes('has_hero_section')), 'Installed Blocksy source does not expose the native has_hero_section option.');
    assert.ok(source.title_witnesses.some(w => w.snippet.includes('disabled')), 'Installed Blocksy source does not expose disabled hero setting.');
    const data = JSON.parse(wpEval(
      '$ids=[' + idList + '];$out=[];' +
      'foreach($ids as $id){$before=get_post_meta($id,"blocksy_post_meta_options",true);' +
      '$options=is_array($before)?$before:[];$options["has_hero_section"]="disabled";' +
      'update_post_meta($id,"blocksy_post_meta_options",$options);' +
      '$after=get_post_meta($id,"blocksy_post_meta_options",true);' +
      '$resolved=function_exists("blocksy_get_post_options")?blocksy_get_post_options($id):null;' +
      '$out[]=["id"=>$id,"before"=>$before,"persisted"=>$after,"resolved"=>$resolved];}' +
      'echo wp_json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);'
    ));
    assert.ok(data.every(x => x.persisted?.has_hero_section === 'disabled'));
    return data;
  }, true);
  for (const route of routes) {
    await check('title-after-' + route.key, async () => {
      await openInbox(route);
      const h = await headings();
      const g = await geometry();
      await picture(route.key + '-after');
      assert.equal(h.filter(x => !x.outer && x.text === 'کارهای من').length, 1);
      assert.equal(h.filter(x => x.outer && x.visible).length, 0, 'Native Blocksy title not suppressed by attempted page setting');
      assert.equal(g.counts.surface, 1);
      return { headings: h, geometry: g, setting: mutation.status, page_id: route.id };
    }, mutation.status !== 'PASS');
  }
  for (const route of routes) {
    for (const width of [1440, 414, 390, 360, 320]) {
      await check('geometry-' + route.key + '-' + width, async () => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        await openInbox(route);
        const g = await geometry();
        await picture(route.key + '-after-' + width);
        assertGeometry(g, width);
        return g;
      });
    }
  }
  await check('unrelated-negative-control', async () => {
    await page.goto(unrelated.url, { waitUntil: 'networkidle' });
    const facts = await page.evaluate(() => ({
      gpp: document.querySelectorAll('[data-gpp-inbox-surface]').length,
      styles: [...document.styleSheets].filter(s => /srwf-gravity-flow-inbox/.test(s.href || '')).length,
      outer_page_heading: [...document.querySelectorAll('h1')].map(x => x.textContent.trim()) }));
    assert.equal(facts.gpp, 0); assert.equal(facts.styles, 0);
    return facts;
  });
  for (const route of routes) {
    await check('search-' + route.key, async () => {
      await page.setViewportSize({ width: 1440, height: 900 }); await openInbox(route);
      await waitCount(20);
      const input = page.locator(search);
      await input.fill('WU21 Alpha Form'); await input.dispatchEvent('keyup');
      await page.waitForFunction(sel => {
        const rs = [...document.querySelectorAll(sel)];
        return rs.length > 0 && rs.length < 20 && rs.every(n => n.textContent.includes('WU21 Alpha Form'));
      }, rows, { timeout: 18000 });
      const filtered = await page.locator(rows).count();
      await input.fill('WU21 DEFINITELY NO RESULT'); await input.dispatchEvent('keyup'); await waitCount(0);
      await input.fill(''); await input.dispatchEvent('keyup'); await waitCount(20);
      assert.equal(await input.count(), 1);
      return { filtered, no_result: 0, cleared: 20, native_search: true };
    });
    await check('sort-pager-' + route.key, async () => {
      await openInbox(route); await waitCount(20);
      const headers = page.locator('[data-js="gflow-inbox"] .ag-header-cell');
      let sort = null;
      for (let i = 0; i < await headers.count(); i++) {
        const cell = headers.nth(i);
        if (!(await cell.isVisible())) continue;
        await cell.click(); await page.waitForTimeout(200);
        const first = await cell.getAttribute('aria-sort');
        if (first && first !== 'none') {
          await cell.click(); await page.waitForTimeout(200);
          const second = await cell.getAttribute('aria-sort');
          assert.notEqual(first, second);
          sort = { column: await cell.getAttribute('col-id'), first, second };
          break;
        }
      }
      assert.ok(sort, 'No actual sortable native header');
      const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
      const prev = page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]');
      assert.equal(await next.count(), 1); assert.equal(await prev.count(), 1);
      await next.click(); await waitCount(5);
      await prev.focus(); assert.ok(await prev.evaluate(n => n === document.activeElement));
      await page.keyboard.press('Enter'); await waitCount(20);
      return { sort, next_page: 5, previous_page: 20 };
    });
    await check('manual-refresh-' + route.key, async () => {
      await openInbox(route);
      const button = page.getByRole('button', { name: 'به‌روزرسانی کارهای من', exact: true });
      assert.equal(await button.count(), 1);
      assert.equal(await button.getAttribute('type'), 'button');
      const prior = page.url();
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), button.click()]);
      await page.locator(grid).waitFor({ timeout: 30000 });
      assert.equal(page.url(), prior);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type), 'reload');
      assert.equal(await page.locator(refresh).count(), 1);
      await page.goto(unrelated.url); await page.goBack({ waitUntil: 'networkidle' });
      await page.locator(grid).waitFor({ timeout: 30000 });
      assert.equal(await page.locator(refresh).count(), 1);
      return { reload: true, reentry: true, native_grid: true };
    });
  }
  // Real WU21 host data mutation, observed in AG Grid after genuine Gravity Flow polling.
  await check('live-refresh-shortcode', async () => {
    await openInbox(routes[0]); await waitCount(20);
    const before = hostRequests.length;
    let dynamic = null;
    try {
      dynamic = Number(control('add'));
      await waitId(dynamic, true);
      assert.equal(await page.locator(rows + '[row-id="' + dynamic + '"]').count(), 1);
    } finally { if (dynamic !== null) control('remove'); }
    await waitId(dynamic, false);
    const traffic = hostRequests.slice(before);
    assert.ok(traffic.some(r => r.status === 200), 'No genuine Gravity Flow changes response observed');
    return { dynamic_id: dynamic, added: true, removed: true, host_poll_responses: traffic.length };
  });
  let detail = null;
  await check('authorized-entry-navigation', async () => {
    await openInbox(routes[0]);
    const a = page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first();
    await a.waitFor({ state: 'visible', timeout: 30000 });
    const href = await a.getAttribute('href');
    assert.ok(href && href.includes('view=entry') && href.includes('id=') && href.includes('lid='), 'Native detail link invalid');
    await Promise.all([page.waitForURL(/view=entry/, { timeout: 30000 }), a.click()]);
    assert.ok(page.url().includes('view=entry'));
    detail = page.url();
    return { destination: detail, native_click: true };
  });
  await check('permission-isolation', async () => {
    assert.ok(detail, 'No verified native authorized detail URL to test');
    const vctx = await browser.newContext({ locale: 'fa-IR' });
    try {
      await vctx.addCookies(auth('viewer'));
      const vp = await vctx.newPage();
      const r = await vp.goto(detail, { waitUntil: 'networkidle' });
      const text = await vp.locator('body').innerText();
      const markers = await vp.locator('.gflow-inbox__entry-cell-link, [data-gpp-entry-detail-surface]').count();
      assert.ok(!text.includes('WU21 Alpha Form') && !text.includes('WU21 Beta Form'),
        'Unassigned subscriber can read protected synthetic entry content');
      return { status: r?.status(), final_url: vp.url(), protected_text_absent: true, detail_markers: markers };
    } finally { await vctx.close(); }
  }, !detail);
  await check('keyboard-action-accessibility', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await openInbox(routes[0]);
    const button = page.locator(refresh);
    assert.equal(await button.count(), 1);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    let tabs = 0, reached = false;
    for (; tabs < 160; tabs++) {
      await page.keyboard.press('Tab');
      if (await button.evaluate(n => n === document.activeElement)) { reached = true; break; }
    }
    assert.ok(reached, 'Native keyboard Tab did not reach refresh action');
    const style = await button.evaluate(n => ({ visible: n.matches(':focus-visible'),
      outline: getComputedStyle(n).outlineStyle, width: getComputedStyle(n).outlineWidth }));
    assert.ok(style.visible && style.outline !== 'none' && Number.parseFloat(style.width) > 0);
    return { tab_stops: tabs + 1, focus: style, accessible_name: await button.getAttribute('aria-label') };
  });
} finally {
  await browser.close();
  for (const err of results.page_errors) {
    results.errors.push({ id: err.scenario || 'unattributed', error: 'Uncaught browser page exception: ' + err.message });
    const record = results.cases.find(r => r.id === err.scenario);
    if (record) record.status = 'FAIL';
  }
  results.polling = hostRequests;
  results.summary = { PASS: results.cases.filter(r => r.status === 'PASS').length,
    FAIL: results.cases.filter(r => r.status === 'FAIL').length,
    NOT_PROVEN: results.cases.filter(r => r.status === 'NOT_PROVEN').length };
  results.status = results.errors.length ? 'FAIL' : results.summary.NOT_PROVEN ? 'QUALIFICATION_INCOMPLETE' : 'PASS';
  fs.writeFileSync(path.join(out, 'blocksy-extended-qualification.json'), JSON.stringify(results, null, 2) + '\n');
  console.log('BLOCKSY_QUALIFICATION_RESULT ' + JSON.stringify({ status: results.status, summary: results.summary }));
}
if (results.status === 'FAIL') process.exitCode = 1;
