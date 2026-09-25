await import('./pr87-native-height-restoration-counterfactual.mjs');

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { applyScenarioAction } from '../visual-regression/scenario-state.mjs';

// A structural hard gate, independent of PREVIEW_DIAGNOSTIC cosmetic warnings.
// The historical stylesheet is a counterfactual control, never a merge base.
const baseline = '3471aa4de03321d74a84c46ebef4cc07af5159a4';
const stylesheet = 'assets/css/srwf-gravity-flow-inbox.css';
const historicalCss = execFileSync('git', ['show', `${baseline}:${stylesheet}`], { encoding: 'utf8' });
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wp = code => execFileSync('php', [process.env.WU21_WP_CLI, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' }).trim();
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json')));
const p06 = JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"));'));
const humanDisplayFixturePath = path.join(artifactDir, 'pr32-human-display-fixture.json');
assert.equal(fs.existsSync(humanDisplayFixturePath), true, 'Integrated geometry requires the already-qualified PR32 human-display fixture evidence.');
const humanDisplayFixture = JSON.parse(fs.readFileSync(humanDisplayFixturePath, 'utf8'));
const pageSize = 20;
const baseTaskCount = Array.isArray(fixture.entry_records) ? fixture.entry_records.length : 0;
assert.equal(baseTaskCount, 25, 'The pristine WU21 fixture must remain the 25-task contract proven by the earlier native browser suite.');
assert.ok(Number.isInteger(humanDisplayFixture.entry_id) && humanDisplayFixture.entry_id > 0, 'PR32 human-display fixture entry identity is unavailable.');
const integratedTaskCount = Number(wp(`$m=get_option('gpp_wu21_fixture_manifest'); $u=(int)$m['operator']['id']; $t=0; Gravity_Flow_API::get_inbox_entries(array('filter_key'=>'workflow_user_id_'.$u,'user_id'=>$u,'paging'=>array('page_size'=>100)),$t); echo (int)$t;`));
const expectedIntegratedTaskCount = baseTaskCount + 1;
assert.equal(integratedTaskCount, expectedIntegratedTaskCount, 'Integrated Inbox assignment contains an unexpected task leak or missing PR32 fixture.');
const expectedSecondPageRows = Math.min(pageSize, Math.max(0, integratedTaskCount - pageSize));
assert.equal(expectedSecondPageRows, 6, 'Integrated pagination state must be 25 base tasks plus the one qualified PR32 task.');
const baseUrl = process.env.WU21_BASE_URL;
const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+900; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const scope = '.gflow-inbox.gflow-grid.gflow-common';
const selectors = {
  gridRoot: `${scope} .ag-root-wrapper`,
  centerRows: `${scope} .ag-center-cols-container`,
  searchInput: `${scope} [data-js="gflow-inbox-search"]`,
};
const rows = `${selectors.centerRows} > .ag-row`;
const routes = { shortcode: fixture.frontend_inbox_url, block: p06.authentic_block_page.url };
const devices = { desktop: { width:1440, height:1000 }, mobile: { width:390, height:844 } };
const report = {
  repository_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  baseline, authority: 'Pinned WU21 Gravity Flow 3.1.0 / AG Grid 25.2.0; integrated Hello/Elementor host',
  selected_method: 'gravityflow_js_config_shared -> native Inbox grid_options.rowBuffer=80',
  fixture_state: {
    pristine_task_count: baseTaskCount,
    pr32_human_display_entry_id: humanDisplayFixture.entry_id,
    integrated_task_count: integratedTaskCount,
    page_size: pageSize,
    expected_integrated_second_page_rows: expectedSecondPageRows,
    pristine_20_to_5_evidence: 'WU21 real native Inbox browser tests run earlier on the same exact Head',
  },
  text_scale_limit: 'Root font 200% is a text/reflow probe, not true browser 200% zoom.',
  measurements: [], status: 'RUNNING',
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));

const rowBufferControlPath = path.join(wpPath, 'wp-content', 'mu-plugins', 'gpp-pr87-row-buffer-negative-control.php');
const targetPageIds = [fixture.frontend_inbox_page_id, p06.authentic_block_page.page_id];
const rowBufferControlSource = `<?php
/* Test-only negative control: remove the production rowBuffer after GPP applies it. */
add_filter( 'gravityflow_js_config_shared', function ( $config ) {
    if ( ! is_page( ${JSON.stringify(targetPageIds)} ) || empty( $config['grids'] ) || ! is_array( $config['grids'] ) ) {
        return $config;
    }
    foreach ( $config['grids'] as &$grid ) {
        if ( isset( $grid['grid_options'] ) && is_array( $grid['grid_options'] ) ) {
            unset( $grid['grid_options']['rowBuffer'] );
        }
    }
    unset( $grid );
    return $config;
}, 1000, 1 );
`;

function installRowBufferNegativeControl() {
  fs.mkdirSync(path.dirname(rowBufferControlPath), { recursive: true });
  fs.writeFileSync(rowBufferControlPath, rowBufferControlSource);
}
function removeRowBufferNegativeControl() {
  if (fs.existsSync(rowBufferControlPath)) fs.unlinkSync(rowBufferControlPath);
}
async function settleLoaded(page) {
  await page.waitForSelector(selectors.gridRoot, { timeout: 30000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(700);
}
async function settle(page, count) {
  await page.waitForFunction(({ rows, count }) => document.querySelectorAll(rows).length === count, { rows, count }, { timeout: 15000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(350);
}
async function measure(page, label) {
  const result = await page.evaluate(({ scope, selectors }) => {
    const inbox = document.querySelector(scope);
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return { top:r.top, bottom:r.bottom, width:r.width, height:r.height, inline:el.getAttribute('style'), display:s.display, computedHeight:s.height, minHeight:s.minHeight, overflow:s.overflow, paddingTop:parseFloat(s.paddingTop), paddingBottom:parseFloat(s.paddingBottom) };
    };
    const chain = {};
    for (const name of ['ag-root-wrapper','ag-root-wrapper-body','ag-root','ag-body','ag-body-viewport','ag-center-cols-clipper','ag-center-cols-viewport','ag-center-cols-container','ag-paging-panel']) chain[name] = box(inbox.querySelector(`.${name}`));
    const nativeRows = [...inbox.querySelectorAll('.ag-center-cols-container > .ag-row')];
    const cards = [...inbox.querySelectorAll('.gpp-inbox-card')].filter(el => el.getBoundingClientRect().height > 0).map(box);
    const body = chain['ag-body-viewport'], container = chain['ag-center-cols-container'], pager = chain['ag-paging-panel'];
    const flowHeight = cards.length ? Math.max(...cards.map(c => c.bottom)) - Math.min(...cards.map(c => c.top)) : 0;
    const tops = [...new Set(cards.map(c => Math.round(c.top)))];
    const widthOwner = inbox.closest('[data-gpp-inbox-surface]') || inbox;
    return {
      chain, rows:nativeRows.map(el => ({ id:el.getAttribute('row-id'), ...box(el) })),
      row_count:nativeRows.length, card_count:cards.length,
      cards_per_row:cards.length ? Math.max(...tops.map(y => cards.filter(c => Math.abs(c.top-y)<3).length)) : 0,
      last_card_to_pager_gap:cards.length ? pager.top-Math.max(...cards.map(c => c.bottom)) : null,
      visual_card_flow_height:flowHeight, native_grid_body_height:body.height,
      visual_vs_native_height_delta:body.height-flowHeight,
      content_padding:container.paddingTop+container.paddingBottom,
      body_container_delta:body.height-container.height,
      horizontal_overflow:Math.max(0,widthOwner.scrollWidth-widthOwner.clientWidth),
      document_horizontal_overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
      inbox_width:inbox.getBoundingClientRect().width,
      host_width:widthOwner.getBoundingClientRect().width,
      grid_count:document.querySelectorAll(selectors.gridRoot).length,
      replacement_grid_count:document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').length,
      pager_count:inbox.querySelectorAll('.ag-paging-panel').length,
      manual_refresh_count:document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      empty_visible:!!inbox.querySelector('.ag-overlay-no-rows-center')?.getBoundingClientRect().height,
      row_buffer_80_present:[...document.scripts].some(script => (script.textContent||'').includes('"rowBuffer":80')),
    };
  }, { scope, selectors });
  report.measurements.push({ label, ...result });
  return result;
}
function assertNear(actual, expected, message) {
  assert.equal(typeof actual, 'number', `${message}: actual is not numeric`);
  assert.equal(typeof expected, 'number', `${message}: expected is not numeric`);
  assert.ok(Math.abs(actual-expected)<1, `${message}: ${actual} vs ${expected}`);
}
function assertGeometry(m, count, columns) {
  assert.equal(m.row_count, count); assert.equal(m.card_count, count);
  assert.equal(m.grid_count, 1); assert.equal(m.replacement_grid_count, 0); assert.equal(m.pager_count, 1);
  assert.equal(m.cards_per_row, Math.min(count, columns));
  assert.equal(m.horizontal_overflow, 0); assert.equal(m.document_horizontal_overflow, 0);
  assert.ok(Math.abs(m.body_container_delta)<1, `body must follow actual card container: ${m.body_container_delta}`);
  assert.ok(Math.abs(m.visual_vs_native_height_delta-m.content_padding)<1, `native/visual delta exceeds actual container padding: ${m.visual_vs_native_height_delta}`);
  // Existing native pager spacing is preserved. Reject overlap or a stale row-height gap.
  assert.ok(m.last_card_to_pager_gap>=0 && m.last_card_to_pager_gap<=64, `pager gap: ${m.last_card_to_pager_gap}`);
}
function assertFallbackEquivalent(control, candidate, label) {
  for (const key of ['row_count','card_count','grid_count','replacement_grid_count','pager_count']) {
    assert.equal(candidate[key], control[key], `${label}: fallback structural mismatch for ${key}`);
  }
  for (const boxName of ['ag-center-cols-container','ag-center-cols-clipper','ag-body-viewport']) {
    for (const key of ['height','width']) {
      assertNear(candidate.chain[boxName][key], control.chain[boxName][key], `${label}: fallback ${boxName}.${key}`);
    }
  }
}
async function fallback(page) {
  // Explicit client-side falsification of the existing server readiness marker.
  // This does not claim a new semantic resolver path; WU17 covers real unready fixtures.
  await page.locator(`${scope} .gpp-inbox-card__readiness--ready`).first().evaluate(el => {
    el.classList.replace('gpp-inbox-card__readiness--ready','gpp-inbox-card__readiness--unready');
  });
  await page.waitForTimeout(650);
}

const rowBufferOffControls = new Map();
try {
  // Method-specific negative control: current PR87 CSS remains active while a
  // test-only later filter removes only rowBuffer. Desktop must reproduce the
  // known under-materialization before the production candidate is measured.
  installRowBufferNegativeControl();
  for (const [route,url] of Object.entries(routes)) {
    for (const [device,viewport] of Object.entries(devices)) {
      const prefix = `${route}/${device}`;
      const control = await context.newPage(); await control.setViewportSize(viewport);
      await control.goto(url,{waitUntil:'networkidle'}); await settleLoaded(control);
      const cardMode = await measure(control,`${prefix}/row-buffer-off`);
      assert.equal(cardMode.row_buffer_80_present,false,`${prefix}: rowBuffer negative control did not remove selected config.`);
      assert.equal(cardMode.grid_count,1); assert.equal(cardMode.replacement_grid_count,0); assert.equal(cardMode.pager_count,1);
      if (device==='desktop') {
        assert.ok(cardMode.row_count>0 && cardMode.row_count<20,`${prefix}: rowBuffer-off control did not reproduce desktop under-materialization: ${cardMode.row_count}.`);
      } else {
        assert.equal(cardMode.row_count,20,`${prefix}: mobile rowBuffer-off control no longer matches qualified 20-row state.`);
      }
      await fallback(control);
      const nativeFallback = await measure(control,`${prefix}/row-buffer-off-fallback`);
      assert.equal(nativeFallback.row_count,20,`${prefix}: native fallback must materialize the full native page without rowBuffer.`);
      assert.equal(nativeFallback.card_count,0,`${prefix}: native fallback must yield Card Mode presentation.`);
      rowBufferOffControls.set(prefix,{cardMode,nativeFallback});
      await control.close();
    }
  }
  removeRowBufferNegativeControl();

  for (const [route,url] of Object.entries(routes)) {
    for (const [device,viewport] of Object.entries(devices)) {
      const prefix = `${route}/${device}`;
      const selectedControl = rowBufferOffControls.get(prefix);
      assert.ok(selectedControl,`${prefix}: selected-method negative control missing.`);

      const control = await context.newPage(); await control.setViewportSize(viewport);
      await control.route('**/srwf-gravity-flow-inbox.css*', route => route.fulfill({ status:200, contentType:'text/css', body:historicalCss }));
      await control.goto(url,{waitUntil:'networkidle'}); await settle(control,20);
      const before = await measure(control,`${prefix}/before`);
      assert.ok(Math.abs(before.body_container_delta)>100, 'Historical mismatch control did not reproduce.');
      await fallback(control); const nativeBefore = await measure(control,`${prefix}/before-mixed`);
      await control.close();

      const page = await context.newPage(); await page.setViewportSize(viewport);
      await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20);
      const columns=device==='desktop'?2:1;
      const after=await measure(page,`${prefix}/after`); assertGeometry(after,20,columns);
      assert.equal(after.row_buffer_80_present,true,`${prefix}: production rowBuffer=80 is absent from native shared grid config.`);
      assertNear(after.inbox_width,selectedControl.cardMode.inbox_width,`${prefix}: selected method changed Inbox width`);
      assertNear(after.host_width,selectedControl.cardMode.host_width,`${prefix}: selected method changed host width`);
      assertNear(after.inbox_width,before.inbox_width,`${prefix}: vertical repair changed historical host composition width`);
      assert.equal(after.chain['ag-center-cols-clipper'].inline,before.chain['ag-center-cols-clipper'].inline,'Do not replace native inline sizing state.');

      const pagination = await applyScenarioAction(page,'pagination',selectors);
      assert.equal(pagination.second_page_rows, expectedSecondPageRows, `${prefix}: integrated native pagination did not expose the exact remaining task count.`);
      await settle(page,expectedSecondPageRows);
      assertGeometry(await measure(page,`${prefix}/page-2`),expectedSecondPageRows,columns);
      await page.locator(`${scope} [ref="btPrevious"]`).click(); await settle(page,20);
      assertGeometry(await measure(page,`${prefix}/page-1-return`),20,columns);
      await applyScenarioAction(page,'search_result',selectors); await settle(page,1);
      assertGeometry(await measure(page,`${prefix}/search-one`),1,columns);
      const search=page.locator(selectors.searchInput);
      await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20);
      assertGeometry(await measure(page,`${prefix}/search-cleared`),20,columns);
      await applyScenarioAction(page,'search_empty',selectors); await settle(page,0);
      const empty=await measure(page,`${prefix}/empty`);
      assert.equal(empty.card_count,0); assert.equal(empty.row_count,0); assert.equal(empty.grid_count,1); assert.equal(empty.replacement_grid_count,0); assert.equal(empty.pager_count,1);
      assert.equal(empty.empty_visible,false,`${prefix}: AG Grid 25.2.0 keeps the no-row-data overlay hidden for quick-filtered zero rows.`);
      assert.equal(empty.horizontal_overflow,0); assert.equal(empty.document_horizontal_overflow,0);
      assert.ok(Math.abs(empty.body_container_delta)<1, `${prefix}: filtered empty grid body must follow its native container: ${empty.body_container_delta}`);
      await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20);
      assertGeometry(await measure(page,`${prefix}/empty-cleared`),20,columns);

      await fallback(page); const nativeAfter=await measure(page,`${prefix}/after-mixed`);
      assert.equal(nativeAfter.card_count,0);
      for (const key of ['computedHeight','minHeight','inline']) assert.equal(nativeAfter.chain['ag-center-cols-clipper'][key],nativeBefore.chain['ag-center-cols-clipper'][key],`Native fallback retained sizing residue: ${key}`);
      assertFallbackEquivalent(selectedControl.nativeFallback,nativeAfter,`${prefix}`);
      await page.locator(`${scope} .gpp-inbox-card__readiness--unready`).evaluate(el => el.classList.replace('gpp-inbox-card__readiness--unready','gpp-inbox-card__readiness--ready'));
      await settle(page,20); assertGeometry(await measure(page,`${prefix}/ready-restored`),20,columns);

      await page.evaluate(() => { document.documentElement.style.fontSize='200%'; });
      await settle(page,20); assertGeometry(await measure(page,`${prefix}/root-font-200`),20,columns);
      await page.evaluate(() => { document.documentElement.style.removeProperty('font-size'); });
      await settle(page,20);
      assert.equal(await page.locator('[data-gpp-inbox-manual-refresh]').count(),1);
      await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.locator('[data-gpp-inbox-manual-refresh]').click()]);
      await settle(page,20); const refreshed=await measure(page,`${prefix}/manual-refresh`); assertGeometry(refreshed,20,columns);
      assert.equal(refreshed.manual_refresh_count,1);
      await page.close();
    }
  }
  report.status='PASS';
} catch(error) {
  report.status='FAIL'; report.error=String(error.stack||error); throw error;
} finally {
  removeRowBufferNegativeControl();
  fs.writeFileSync(path.join(artifactDir,'inbox-card-geometry.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
  console.log(`INBOX_CARD_GEOMETRY=${report.status}`);
}