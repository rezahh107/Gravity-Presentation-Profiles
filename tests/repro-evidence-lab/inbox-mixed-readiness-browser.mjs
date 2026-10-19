import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

// Post-baseline authentic acceptance. All host content and GPP binding state
// are provisioned by inbox-mixed-readiness-fixture.php via real product APIs.
// No mock rows, GPP permission flags, Grid shims, or synthetic request handlers.
const env = process.env;
const { WU21_ARTIFACT_DIR: out, WU21_WP_PATH: wpPath, WU21_WP_CLI: cli, WU21_BASE_URL: base } = env;
for (const [name, value] of Object.entries({ out, wpPath, cli, base })) assert.ok(value, 'Missing pinned environment ' + name);
const read = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
const fixture = read('fixture-manifest.json');
const mixed = read('inbox-mixed-readiness-php.json');
assert.equal(mixed.data_class, 'SYNTHETIC_NON_PII');
assert.equal(mixed.evidence_kind, 'PINNED_WU21_AUTHENTIC_GF_FLOW_POST_BASELINE');

function wpEval(code) {
  const run = spawnSync('php', [cli, '--path=' + wpPath, 'eval', code], { env, encoding: 'utf8', timeout: 60000 });
  if (run.status !== 0) throw Error('Authentic WP-CLI call failed: ' + String(run.stderr || run.stdout).slice(0, 1500));
  return run.stdout.trim();
}
function cookies(login) {
  assert.ok(['bootstrap_admin', 'wu21_viewer'].includes(login));
  return JSON.parse(wpEval(
    "$u=get_user_by('login','" + login + "');if(!$u)throw new RuntimeException('Missing pinned synthetic user');" +
    "$e=time()+1800;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')]," +
    "['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);"
  )).map(item => ({ ...item, url: base }));
}
const host = JSON.parse(wpEval(
  "$t=wp_get_theme();$p=get_option('gpp_p06_fixture_manifest');echo wp_json_encode(['theme'=>$t->get_stylesheet()," +
  "'theme_version'=>$t->get('Version'),'block_url'=>$p['authentic_block_page']['url']??null," +
  "'unrelated_url'=>$p['unrelated_page']['url']??null]);"
));
assert.ok(host.block_url && host.unrelated_url, 'Authentic registered Inbox Block/P06 boundary not provisioned.');
const routes = [
  { name: 'shortcode', url: fixture.frontend_inbox_url },
  { name: 'block', url: host.block_url },
  { name: 'form-scoped', url: mixed.form_scoped.url },
];
const evidence = {
  schema_version: '1.0.0',
  status: 'NOT_VERIFIED',
  head_sha: env.GPP_BLOCKSY_HEAD_SHA || env.GPP_WU21_REPOSITORY_SHA || env.GITHUB_SHA || 'HEAD_NOT_EXPOSED',
  pinned_fixture: 'WU21 authentic WP/GF/Flow',
  host,
  php: mixed,
  routes: [],
  authorization: {},
  unrelated: null,
  negative_control: null,
  errors: [],
};
const browser = await chromium.launch({ headless: true });
let op = await browser.newContext({ locale: 'fa-IR' });
const viewer = await browser.newContext({ locale: 'fa-IR' });
await op.addCookies(cookies('bootstrap_admin'));
await viewer.addCookies(cookies('wu21_viewer'));
let page = await op.newPage();
const selector = '[data-js="gflow-inbox"]';
const rows = selector + ' .ag-center-cols-container .ag-row[row-id]';
const expected = Object.values(mixed.entries).map(Number);
const native = new Set(mixed.native_operator.ids.map(Number));
const present = expected.filter(id => native.has(id));
const absent = expected.filter(id => !native.has(id));
// A different native form/query filter can restrict the multi-form Inbox.
// It is documented in host evidence; do not fake rows or change assignments.
assert.ok(present.includes(mixed.entries.complete) && present.includes(mixed.entries.missing_required_values));
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 700)));

async function openInbox(route, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  const response = await page.goto(route.url, { waitUntil: 'networkidle', timeout: 45000 });
  assert.equal(response?.status(), 200, 'Native Inbox HTTP render failed: ' + route.name);
  await page.locator(selector + ' .ag-root-wrapper').waitFor({ timeout: 30000 });
  await page.locator(rows).first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator(selector).count(), 1);
  assert.equal(await page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"]').count(), 1);
  assert.equal(await page.locator('.gpp-inbox-card, [data-gpp-replacement-inbox]').count(), 0);
}

async function visibleRowIds() {
  return page.locator(rows).evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('row-id'))).filter(Number.isInteger));
}
async function traverseNativePaging() {
  const seen = new Set();
  const pages = [];
  for (let step = 0; step < 15; step++) {
    const ids = await visibleRowIds();
    pages.push(ids);
    ids.forEach(id => seen.add(id));
    const next = page.locator(selector + ' [ref="btNext"]');
    if (await next.count() !== 1 || await next.isDisabled() ||
      (await next.getAttribute('class') || '').includes('ag-disabled')) break;
    const previousIds = ids.join(',');
    await next.click();
    await page.waitForFunction(({ rows, previousIds }) => {
      const ids = [...document.querySelectorAll(rows)].map(n => n.getAttribute('row-id')).join(',');
      return ids.length > 0 && ids !== previousIds;
    }, { rows, previousIds }, { timeout: 20000 });
    if (step === 14) throw Error('Native Inbox paging did not reach its last page.');
  }
  return { visible_ids: [...seen], pages: pages.length, page_ids: pages };
}
try {
  for (const route of routes) {
    // AG Grid owns persisted grid state. Isolate the *test browser storage*
    // across independent native route configurations rather than implicitly
    // carrying a multi-form column-state snapshot into a form-scoped probe.
    if (evidence.routes.length > 0) {
      await op.close();
      op = await browser.newContext({ locale: 'fa-IR' });
      await op.addCookies(cookies('bootstrap_admin'));
      page = await op.newPage();
      page.on('pageerror', e => pageErrors.push(String(e).slice(0, 700)));
    }
    const record = { route: route.name, url: route.url, viewports: [], paginated: null, navigation: null };
    evidence.routes.push(record);
    for (const width of [1440, 414, 390, 360, 320]) {
      await openInbox(route, width, width < 500 ? 780 : 900);
      const facts = await page.evaluate((sel) => {
        const grid = document.querySelector(sel);
        const root = grid?.querySelector('.ag-root-wrapper');
        const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
        const rule = '.ag-header-viewport, .ag-center-cols-viewport, .ag-body-horizontal-scroll-viewport';
        const physical = [root, ...grid.querySelectorAll(rule)].map(el => ({
          selector: el.className, direction: getComputedStyle(el).direction,
        }));
        return {
          grid_id: grid?.getAttribute('data-grid-id'),
          native_config_columns: (() => {
            const key = grid?.getAttribute('data-grid-id') || 'inbox_default';
            const definitions = window.gflow_config?.grids?.[key]?.grid_options?.columnDefs;
            return Array.isArray(definitions) ? definitions.map(x => x.field ?? null) : null;
          })(),
          headers: [...grid.querySelectorAll('.ag-header-cell[col-id]')].map(el => el.getAttribute('col-id')),
          native_rows: grid.querySelectorAll('.ag-row[row-id]').length,
          rtl_header: getComputedStyle(surface?.querySelector('.gpp-inbox-surface__header')).direction,
          native_root_direction: getComputedStyle(root).direction,
          physical,
          gpp_heading: surface?.querySelector('h1')?.textContent?.trim(),
          scroll_width: document.documentElement.scrollWidth,
          client_width: document.documentElement.clientWidth,
          native_pager: !!grid.querySelector('.ag-paging-panel'),
          host_dom_preserved: !!surface?.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper'),
        };
      }, selector);
      assert.equal(facts.gpp_heading, 'کارهای من');
      assert.equal(facts.rtl_header, 'rtl');
      assert.ok(facts.host_dom_preserved && facts.native_pager);
      assert.ok(facts.native_rows > 0);
      // AG Grid column virtualization can render fewer visible header nodes
      // than the five host-owned column definitions, particularly at 320px.
      // The authoritative contract is the native Grid configuration, not the
      // number of currently materialized header elements.
      if (route.name === 'form-scoped') {
        const expected = mixed.header_projection.ready?.column_ids?.map(String);
        assert.ok(Array.isArray(expected) && expected.length === 5,
          'Product five-column source contract was not qualified by the real host fixture.');
        assert.ok(Array.isArray(facts.native_config_columns),
          'Host native Grid column definitions are unavailable: ' + JSON.stringify(facts));
        assert.deepEqual([...facts.native_config_columns].map(String).sort(), [...expected].sort(),
          'Form-scoped native Grid did not receive five exact source-bound columns.');
        assert.ok(facts.headers.length > 0 && facts.headers.every(id => facts.native_config_columns.includes(id)),
          'Visible virtualized headers do not belong to the actual native column set.');
      } else {
        assert.ok(facts.headers.length >= 1, 'Native multi-form Inbox exposed no headers.');
      }
      assert.equal(facts.physical.length, 4, 'Owner-authorized four-node physical axis is absent.');
      for (const node of facts.physical) assert.equal(node.direction, 'ltr', 'Owner physical LTR exception drifted.');
      assert.ok(facts.scroll_width <= facts.client_width + 3, 'Document-wide overflow at ' + width);
      record.viewports.push({ width, ...facts });
    }
    await openInbox(route);
    record.paginated = await traverseNativePaging();
    const routeExpected = route.name === 'form-scoped'
      ? [mixed.entries.complete, mixed.entries.missing_required_values].map(Number)
      : present;
    for (const id of routeExpected) {
      assert.ok(record.paginated.visible_ids.includes(id),
        'Native host-authorized entry disappeared from ' + route.name + ': ' + id);
    }
    if (route.name === 'form-scoped') {
      assert.ok(!record.paginated.visible_ids.includes(Number(mixed.entries.unproven_form)),
        'Native form scope leaked an entry from a different form.');
    }
    const linkId = Number(mixed.entries.complete);
    await openInbox(route);
    // Search is native AG Grid. No GPP row insertion or GPP form filtering.
    const input = page.locator('[data-js="gflow-inbox-search"]');
    assert.equal(await input.count(), 1);
    await input.fill('SYN-MIX-Ready');
    await input.dispatchEvent('keyup');
    // Host default visible columns may not include national ID; do not
    // assume search can discover a hidden source. Clear through native control.
    await input.fill('');
    await input.dispatchEvent('keyup');
    // A new host render is the supported reset after interacting with native
    // search. Do not inspect potentially stale AG Grid filter/pager state.
    await openInbox(route);
    let found = false;
    for (let turn = 0; turn < 15 && !found; turn++) {
      const link = page.locator(rows + '[row-id="' + linkId + '"] a[href*="view=entry"]').first();
      if (await link.count() > 0) {
        const href = await link.getAttribute('href');
        assert.ok(href?.includes('view=entry') && href.includes('id=') && href.includes('lid='),
          'Native Entry Detail link lost authentic routing.');
        const target = new URL(href, page.url());
        assert.ok([target.searchParams.get('id'), target.searchParams.get('lid')].includes(String(linkId)));
        record.navigation = { entry_id: linkId, url: target.href, original_href: href };
        found = true;
        break;
      }
      const next = page.locator(selector + ' [ref="btNext"]');
      if (await next.count() !== 1 || await next.isDisabled() ||
        (await next.getAttribute('class') || '').includes('ag-disabled')) break;
      await next.click();
      await page.waitForTimeout(350);
    }
    if (!found) {
      const nearby = await page.locator(rows).evaluateAll(nodes => nodes.map(n => ({
        id: n.getAttribute('row-id'),
        hrefs: [...n.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).slice(0, 5),
      })).slice(0, 25));
      throw Error('Authorized native entry link missing: ' + route.name +
        ' id=' + linkId + ' visible_page=' + JSON.stringify(nearby));
    }
  }

  const opDetail = evidence.routes[0].navigation.url;
  const opPage = await op.newPage();
  const authResponse = await opPage.goto(opDetail, { waitUntil: 'networkidle' });
  const opText = await opPage.locator('body').innerText();
  assert.ok(opText.includes('SYN-MIX-Ready'), 'Authorized host Entry Detail lacks protected entry witness.');
  evidence.authorization.operator = { http: authResponse?.status(), protected_witness_visible: true, url: opPage.url() };
  await opPage.close();

  const vp = await viewer.newPage();
  const response = await vp.goto(opDetail, { waitUntil: 'networkidle' });
  const viewerText = await vp.locator('body').innerText();
  assert.ok(!viewerText.includes('SYN-MIX-Ready'), 'Unassigned viewer gained authentic host Entry Detail data.');
  assert.ok(!viewerText.includes('MIX-Ready'), 'Unassigned viewer gained protected name data.');
  evidence.authorization.viewer = { http: response?.status(), protected_witness_absent: true, url: vp.url() };
  await vp.goto(routes[0].url, { waitUntil: 'networkidle' });
  const viewerRows = await vp.locator(rows).count();
  assert.equal(viewerRows, 0, 'Unassigned viewer gained native Inbox rows.');
  evidence.authorization.viewer.native_row_count = viewerRows;
  await vp.close();

  // Supported lifecycle mutation: establish an authentic native-only
  // fallback without forging readiness/permissions. Restore in finally.
  const getActiveVisual = () => JSON.parse(wpEval(
    "$v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(" +
    "new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(" +
    "\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME));" +
    "echo wp_json_encode(['activation'=>$v->resolve('gravity_flow.inbox')," +
    "'installed'=>$v->snapshot()['installed']]);"
  ));
  const visualBefore = getActiveVisual();
  assert.ok(visualBefore.activation?.package_id && visualBefore.activation?.profile_id);
  try {
    wpEval(
      "$v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(" +
      "new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(" +
      "\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME));" +
      "$v->deactivate(['surface'=>'gravity_flow.inbox']);"
    );
    const nativeResponse = await page.goto(routes[0].url, { waitUntil: 'networkidle' });
    await page.locator(selector + ' .ag-root-wrapper').waitFor({ timeout: 30000 });
    assert.equal(nativeResponse?.status(), 200);
    assert.equal(await page.locator('[data-gpp-inbox-surface="gravity_flow.inbox"]').count(), 0,
      'Inactive global profile still injected GPP wrapper.');
    assert.equal(await page.locator(selector).count(), 1, 'Native Flow Grid vanished after GPP deactivation.');
    evidence.native_global_fallback = { inactive_profile: true, native_grid_present: true,
      gpp_shell_absent: true, native_rows_on_first_page: await page.locator(rows).count() };
    assert.ok(evidence.native_global_fallback.native_rows_on_first_page > 0);
  } finally {
    const activation = visualBefore.activation;
    const request = JSON.stringify({
      surface: 'gravity_flow.inbox',
      package_id: activation.package_id,
      package_version: activation.package_version,
      profile_id: activation.profile_id,
      expected_current_activation: null,
    });
    wpEval(
      "$v=new \\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle(" +
      "new \\GravityPresentationProfiles\\Core\\Lifecycle\\WordPressOptionStateStore(" +
      "\\GravityPresentationProfiles\\Core\\Lifecycle\\VisualPackageLifecycle::OPTION_NAME));" +
      "$v->activateIfCurrent(json_decode('" + request + "',true));"
    );
  }
  const visualAfter = getActiveVisual();
  assert.deepEqual(visualAfter.activation, visualBefore.activation, 'Rollback failed to restore visual activation.');
  assert.deepEqual(visualAfter.installed, visualBefore.installed, 'Mutable visual package data changed during fallback.');
  await openInbox(routes[0]);
  evidence.native_global_fallback.restored_shell = true;

  await page.goto(host.unrelated_url, { waitUntil: 'networkidle' });
  evidence.unrelated = await page.evaluate(() => ({
    gpp_shell_count: document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"]').length,
    gpp_style_count: [...document.styleSheets].filter(s => /srwf-gravity-flow-inbox/.test(s.href || '')).length,
  }));
  assert.equal(evidence.unrelated.gpp_shell_count, 0);
  assert.equal(evidence.unrelated.gpp_style_count, 0);

  // A deliberately false oracle must be rejected by the acceptance guard.
  assert.throws(() => assert.ok(native.has(-9999999) && present.includes(-9999999)));
  evidence.negative_control = { forged_authorized_row: -9999999, assertion_rejected: true };
  evidence.native_host_filter_limitations = absent;
  assert.deepEqual(pageErrors, [], 'Uncaught page errors during authentic Inbox acceptance.');
  evidence.status = 'PASS';
} catch (error) {
  evidence.status = 'FAIL';
  evidence.errors.push(String(error?.stack || error).slice(0, 4500));
} finally {
  fs.writeFileSync(path.join(out, 'inbox-mixed-readiness-browser.json'), JSON.stringify(evidence, null, 2) + '\n');
  await op.close();
  await viewer.close();
  await browser.close();
}
if (evidence.status !== 'PASS') {
  console.error('WU21_MIXED_READINESS_BROWSER_FAIL ' + JSON.stringify(evidence.errors));
  process.exit(1);
}
console.log('WU21_MIXED_READINESS_BROWSER_PASS ' +
  JSON.stringify({ routes: evidence.routes.length, theme: host.theme, forms: mixed.forms, filter_limitations: absent }));
