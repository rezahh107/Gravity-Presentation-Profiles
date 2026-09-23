// Qualification only. Reuse P06 pages and WU21 host-owned synthetic mutations.
// Assertions cover observable contracts; semantic/RTL attribution needs review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const env = process.env;
const dir = env.WU21_ARTIFACT_DIR;
const root = env.GITHUB_WORKSPACE;
assert.ok(dir && root && env.WU21_WP_CLI && env.WU21_WP_PATH);
function wp(args, extra = {}) {
  const p = spawnSync('php', [env.WU21_WP_CLI, `--path=${env.WU21_WP_PATH}`, ...args], { encoding: 'utf8', env: { ...env, ...extra } });
  assert.equal(p.status, 0, p.stderr || p.stdout);
  return p.stdout.trim();
}
const evaluate = code => wp(['eval', code]);
const option = name => JSON.parse(evaluate(`echo wp_json_encode(get_option('${name}'));`));
const control = action => wp(['eval-file', path.join(root, 'tests/repro-evidence-lab/runtime-control.php')], { WU21_CONTROL: action });
const manifest = option('gpp_wu21_fixture_manifest');
const p06 = option('gpp_p06_fixture_manifest');
assert.ok(p06?.authentic_block_page?.url, 'Run the existing P06 suite first; do not build another block fixture.');
const routes = { shortcode: manifest.frontend_inbox_url, block: p06.authentic_block_page.url };
// Earlier admitted suites add a human-display task. Read host truth rather
// than incorrectly reusing WU17's pre-extension second-page count of five.
const taskTotal = Number(evaluate(`$m=get_option('gpp_wu21_fixture_manifest'); $u=(int)$m['operator']['id']; wp_set_current_user($u); $total=0; Gravity_Flow_API::get_inbox_entries(array('filter_key'=>'workflow_user_id_'.$u,'user_id'=>$u,'paging'=>array('page_size'=>100)), $total); echo $total;`));
assert.ok(Number.isInteger(taskTotal) && taskTotal > 20 && taskTotal <= 40, 'Two-page native fixture precondition changed.');
const runtime = JSON.parse(fs.readFileSync(path.join(dir, 'runtime.json'), 'utf8'));
assert.equal(runtime.wordpress.version, '6.8.3');
assert.equal(runtime.php.version, '8.2.34');
assert.equal(runtime.plugins.gravity_forms.runtime_version, '3.1.1.1');
assert.equal(runtime.plugins.gravity_flow.runtime_version, '3.1.0');
assert.equal(evaluate('echo get_option("template");'), 'twentytwentyfive');
assert.equal(evaluate('echo get_option("stylesheet");'), 'twentytwentyfive');
const result = {
  repository_head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime, theme_version: wp(['theme', 'get', 'twentytwentyfive', '--field=version']),
  routes, host_task_total: taskTotal, observations: {}, interactions: {}, negatives: {},
  ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION_ONLY',
  attribution: 'REQUIRES_EXECUTED_EVIDENCE_REVIEW',
  rtl_context: 'Test-only server language_attributes dir=rtl on the two existing pages; no CSS override, translated locale or target equivalence claim.',
};
const save = () => fs.writeFileSync(path.join(dir, 'wu06-results.json'), JSON.stringify(result, null, 2) + '\n');
const rows = '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row';
const searchSelector = '[data-js="gflow-inbox-search"]';
const mu = path.join(env.WU21_WP_PATH, 'wp-content/mu-plugins/wu06-rtl-context.php');
assert.ok(!fs.existsSync(mu));
// Exercise an RTL document context without manufacturing headings or repairing
// the vendor's computed CSS direction. Confined to existing synthetic pages.
fs.writeFileSync(mu, `<?php
add_filter('language_attributes', static function ($attributes) {
    $base = get_option('gpp_wu21_fixture_manifest');
    $p06 = get_option('gpp_p06_fixture_manifest');
    if (isset($_GET['wu06_rtl']) && '1' === $_GET['wu06_rtl'] && is_page(array((int) $base['frontend_inbox_page_id'], (int) $p06['authentic_block_page']['page_id']))) {
        return preg_replace('/\\sdir="[^"]*"/', '', $attributes) . ' dir="rtl"';
    }
    return $attributes;
});
`);
const visualClass = '\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle';
const visualOption = evaluate(`echo ${visualClass}::OPTION_NAME;`);
const visualBackup = option(visualOption);
function setActive(active) {
  if (active) {
    const b64 = Buffer.from(JSON.stringify(visualBackup)).toString('base64');
    evaluate(`update_option('${visualOption}', json_decode(base64_decode('${b64}'), true), false);`);
  } else {
    evaluate(`$l = new ${visualClass}(new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore('${visualOption}')); $l->deactivate(array('surface'=>'gravity_flow.inbox')); if (null !== $l->resolve('gravity_flow.inbox')) throw new RuntimeException('Deactivation failed');`);
  }
}
const browser = await chromium.launch({ headless: true });
result.chromium = browser.version();
const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
const cookies = JSON.parse(evaluate(`$u=get_user_by('login','bootstrap_admin'); echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,time()+1800,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,time()+1800,'logged_in'))));`));
await context.addCookies(cookies.map(c => ({ ...c, url: env.WU21_BASE_URL })));
const page = await context.newPage();
page.setDefaultTimeout(15000);
async function waitRows(n) {
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: rows, count: n }, { timeout: 45000 });
}
async function open(url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper');
  await waitRows(20);
}
async function state() {
  return page.evaluate(selector => {
    const visible = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const all = s => [...document.querySelectorAll(s)];
    return {
      rows: all(selector).length, ids: all(selector).map(e => e.getAttribute('row-id')),
      grids: all('[data-js="gflow-inbox"] .ag-root-wrapper').length,
      pagers: all('[data-js="gflow-inbox"] .ag-paging-panel').length,
      searches: all('[data-js="gflow-inbox-search"]').length,
      cards: all(`${selector} .gpp-inbox-card`).filter(visible).length,
      unready: all(`${selector} .gpp-inbox-card__readiness--unready`).length,
      native_cells: all(`${selector} .ag-cell:not([col-id="gpp_case_card"])`).filter(visible).length,
      page: document.querySelector('[ref="lbCurrent"]')?.textContent.trim(),
      query: document.querySelector('[data-js="gflow-inbox-search"]')?.value,
    };
  }, rows);
}
async function observation() {
  return page.evaluate(() => {
    const all = s => [...document.querySelectorAll(s)];
    const box = e => {
      if (!e) return null;
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return { tag: e.tagName, class: e.className, x: r.x, right: r.right, y: r.y, width: r.width, height: r.height,
        direction: s.direction, textAlign: s.textAlign, paddingLeft: s.paddingLeft, paddingRight: s.paddingRight,
        paddingInlineStart: s.paddingInlineStart, paddingInlineEnd: s.paddingInlineEnd,
        overflowX: s.overflowX, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth,
        visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 };
    };
    const name = e => ({ ariaLabel: e.getAttribute('aria-label'), labelledby: e.getAttribute('aria-labelledby'),
      references: (e.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => ({ id, count: all('[id]').filter(n => n.id === id).length, text: document.getElementById(id)?.textContent.trim() })) });
    const owner = e => e.closest('[data-gpp-inbox-surface],.gpp-inbox-card') ? 'GPP' : e.closest('.gflow-inbox') ? 'Gravity Flow' : e.matches('.wp-block-post-title') ? 'TT25 core/post-title (WordPress content title)' : e.closest('.wp-block-template-part') ? 'TT25 template part' : 'WordPress content or theme (inspect)';
    const input = document.querySelector('[data-js="gflow-inbox-search"]');
    return {
      url: location.href, htmlDir: document.documentElement.dir, html: box(document.documentElement), body: box(document.body),
      inbox: box(document.querySelector('[data-js="gflow-inbox"]')), grid: box(document.querySelector('.ag-root-wrapper')),
      search: { ...box(input), value: input?.value, ...input && name(input), placeholder: input?.placeholder,
        parent: input?.parentElement.outerHTML.slice(0, 6000),
        siblings: input ? [...input.parentElement.children].map(box) : [],
        parentBefore: input ? { content: getComputedStyle(input.parentElement, '::before').content, left: getComputedStyle(input.parentElement, '::before').left, right: getComputedStyle(input.parentElement, '::before').right } : null },
      header: box(document.querySelector('.gflow-grid__header')),
      pagination: all('.ag-paging-panel [ref]').map(e => ({ ref: e.getAttribute('ref'), text: e.textContent.trim(), ...box(e) })),
      headings: all('h1,h2,h3').map(e => ({ level: e.tagName, text: e.textContent.trim(), owner: owner(e), id: e.id, ...box(e) })),
      landmarks: all('main,section[aria-labelledby],nav,[role="region"],[role="main"],[role="grid"]').map(e => ({ tag: e.tagName, role: e.getAttribute('role'), ...name(e) })),
      surfaces: all('[data-gpp-inbox-surface]').map(e => ({ ...name(e), ...box(e) })),
      card: all('.gpp-inbox-card').slice(0, 2).map(e => ({ ...box(e), nameTag: e.querySelector('.gpp-inbox-card__name')?.tagName, details: e.querySelector('dl')?.outerHTML, headings: e.querySelectorAll('h1,h2,h3').length })),
      styles: all('link[rel="stylesheet"]').filter(e => /srwf-gravity-flow-inbox(?:-native)?\.css/.test(e.href)).map(e => ({ id: e.id, href: e.href })),
      scripts: all('script[src]').map(e => e.src),
    };
  });
}
async function check(route, label, fn) {
  try { result.interactions[route][label] = { status: 'PASS', evidence: await fn() }; }
  catch (e) { result.interactions[route][label] = { status: 'FAIL', error: e.stack, state: await state() }; }
  save();
}
try {
  for (const active of [false, true]) {
    setActive(active);
    for (const [route, url] of Object.entries(routes)) {
      for (const rtl of [false, true]) {
        const key = `${route}_${rtl ? 'rtl_document' : 'default_document'}_${active ? 'gpp' : 'native'}`;
        await open(rtl ? `${url}?wu06_rtl=1` : url);
        const measured = await observation();
        measured.state = await state();
        assert.equal(measured.styles.length, active ? 2 : 0, `${key}: asset isolation/duplication`);
        if (rtl) assert.equal(measured.htmlDir, 'rtl');
        await page.screenshot({ path: path.join(dir, `wu06-${key}.png`), fullPage: true });
        fs.writeFileSync(path.join(dir, `wu06-${key}-a11y.txt`), await page.locator('body').ariaSnapshot());
        result.observations[key] = measured;
        save();
      }
    }
  }
  for (const [route, url] of Object.entries(routes)) {
    result.interactions[route] = {};
    const target = `${url}?wu06_rtl=1`;
    await check(route, 'initial_and_card_readiness', async () => {
      await open(target); const s = await state();
      assert.equal(s.cards, 20); assert.equal(s.native_cells, 0);
      assert.deepEqual([s.grids, s.pagers, s.searches], [1, 1, 1]); return s;
    });
    await check(route, 'native_search_rerender', async () => {
      await open(target); await page.locator(searchSelector).pressSequentially('00:24:00'); await waitRows(1);
      const filtered = await state(); assert.equal(filtered.cards, 1);
      assert.match(await page.locator(rows).innerText(), /WU21 Alpha Student 24/);
      await page.locator(searchSelector).press('Control+A'); await page.locator(searchSelector).press('Backspace'); await waitRows(20);
      return { filtered, restored: await state() };
    });
    await check(route, 'native_sort_and_pagination', async () => {
      await open(target);
      const header = page.locator('.ag-header-cell[col-id="gpp_case_card"]').first();
      await header.click(); const first = await header.getAttribute('aria-sort'); const ids1 = (await state()).ids;
      await header.click(); const second = await header.getAttribute('aria-sort'); const ids2 = (await state()).ids;
      assert.ok(first && second && first !== second); assert.notDeepEqual(ids1, ids2);
      await page.locator('[ref="btNext"]').click(); await waitRows(taskTotal - 20); const next = await state(); assert.equal(next.cards, taskTotal - 20); assert.equal(next.page, '2');
      await page.locator('[ref="btPrevious"]').click(); await waitRows(20);
      assert.equal(await header.getAttribute('aria-sort'), second);
      return { first, second, ids1, ids2, next, restored: await state() };
    });
    await check(route, 'native_entry_navigation', async () => {
      await open(target);
      const link = page.locator(`${rows} .ag-cell[col-id="gpp_case_card"] .gflow-inbox__entry-cell-link`).first();
      const href = await link.getAttribute('href'); assert.ok(href);
      const expected = new URL(href, page.url()); assert.equal(expected.searchParams.get('view'), 'entry'); assert.ok(expected.searchParams.get('lid'));
      await Promise.all([page.waitForURL(expected.href), link.click()]);
      assert.equal(page.url(), expected.href);
      assert.ok((await page.locator('body').innerText()).length > 0);
      return { href, final_url: page.url() };
    });
    await check(route, 'native_live_refresh_add_remove_state', async () => {
      await open(target);
      const responses = [];
      const listener = r => { if (r.url().includes('/gravityflow/internal/inbox/changes')) responses.push({ url: r.url(), status: r.status() }); };
      page.on('response', listener);
      await page.locator(searchSelector).pressSequentially('WU21 Refresh Student'); await waitRows(0);
      try {
        const id = control('add'); await waitRows(1); const added = await state(); assert.equal(added.cards, 1); assert.equal(added.query, 'WU21 Refresh Student');
        control('remove'); await waitRows(0); const removed = await state(); assert.equal(removed.query, added.query);
        assert.ok(responses.some(r => r.status === 200)); assert.deepEqual([removed.grids, removed.pagers, removed.searches], [1, 1, 1]);
        return { id, added, removed, responses, mutation_owner: 'GFAPI / Gravity_Flow_API via existing runtime-control.php', browser_owner: 'native Inbox REST / AG Grid; no injected refresh or grid code' };
      } finally { control('remove'); page.off('response', listener); }
    });
    await check(route, 'mixed_readiness_native_fallback', async () => {
      control('add-unbound');
      try {
        await page.goto(target, { waitUntil: 'networkidle' }); await page.waitForSelector('.ag-root-wrapper');
        await page.waitForFunction(s => document.querySelectorAll(s).length > 0, rows);
        if (!(await state()).unready) { await page.locator('[ref="btNext"]').click(); await page.waitForFunction(() => document.querySelector('.gpp-inbox-card__readiness--unready')); }
        const s = await state(); assert.ok(s.unready > 0); assert.equal(s.cards, 0); assert.ok(s.native_cells > 0); assert.deepEqual([s.grids, s.pagers, s.searches], [1, 1, 1]); return s;
      } finally { control('remove-unbound'); }
    });
  }
  for (const name of ['commented_shortcode_page', 'cdata_shortcode_page', 'lookalike_page', 'unrelated_page']) {
    await page.goto(p06[name].url, { waitUntil: 'networkidle' }); const o = await observation();
    assert.equal(o.styles.length, 0); assert.equal(o.surfaces.length, 0);
    result.negatives[name] = { styles: o.styles, surfaces: o.surfaces, headings: o.headings }; save();
  }
  result.execution = Object.values(result.interactions).some(r => Object.values(r).some(t => t.status === 'FAIL')) ? 'INTERACTION_FAILURE_REQUIRES_ATTRIBUTION' : 'MEASUREMENTS_AND_INTERACTIONS_EXECUTED_REVIEW_REQUIRED';
} catch (e) {
  result.execution = 'NOT_PROVEN'; result.error = e.stack; throw e;
} finally {
  setActive(true); fs.unlinkSync(mu); save(); await browser.close();
  process.stdout.write(`WU06_EVIDENCE=${JSON.stringify(result)}\n`);
}
if (result.execution === 'INTERACTION_FAILURE_REQUIRES_ATTRIBUTION') process.exitCode = 1;
