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
const wp = code => execFileSync('php', [process.env.WU21_WP_CLI, `--path=${process.env.WU21_WP_PATH}`, 'eval', code], { encoding: 'utf8' }).trim();
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json')));
const p06 = JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"));'));
const baseUrl = process.env.WU21_BASE_URL;
const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+900; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const scope = '.gflow-inbox.gflow-grid.gflow-common';
const selectors = {
  gridRoot: `${scope} .ag-root-wrapper`,
  centerRows: `${scope} .ag-center-cols-container`,
  searchInput: `${scope} [data-js="gflow-inbox-search"]`,
};
const rows = `${selectors.centerRows} > .ag-row`;
const report = {
  repository_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  baseline, authority: 'Pinned WU21 Gravity Flow 3.1.0 / AG Grid 25.2.0; integrated Hello/Elementor host',
  text_scale_limit: 'Root font 200% is a text/reflow probe, not true browser 200% zoom.',
  measurements: [], status: 'RUNNING',
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));

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
      inbox_width:inbox.getBoundingClientRect().width,
      grid_count:document.querySelectorAll(selectors.gridRoot).length,
      pager_count:inbox.querySelectorAll('.ag-paging-panel').length,
      manual_refresh_count:document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      empty_visible:!!inbox.querySelector('.ag-overlay-no-rows-center')?.getBoundingClientRect().height,
    };
  }, { scope, selectors });
  report.measurements.push({ label, ...result });
  return result;
}
function assertGeometry(m, count, columns) {
  assert.equal(m.row_count, count); assert.equal(m.card_count, count);
  assert.equal(m.grid_count, 1); assert.equal(m.pager_count, 1);
  assert.equal(m.cards_per_row, Math.min(count, columns));
  assert.equal(m.horizontal_overflow, 0);
  assert.ok(Math.abs(m.body_container_delta)<1, `body must follow actual card container: ${m.body_container_delta}`);
  assert.ok(Math.abs(m.visual_vs_native_height_delta-m.content_padding)<1, `native/visual delta exceeds actual container padding: ${m.visual_vs_native_height_delta}`);
  // Existing native pager spacing is preserved. Reject overlap or a stale row-height gap.
  assert.ok(m.last_card_to_pager_gap>=0 && m.last_card_to_pager_gap<=64, `pager gap: ${m.last_card_to_pager_gap}`);
}
async function fallback(page) {
  // Explicit client-side falsification of the existing server readiness marker.
  // This does not claim a new semantic resolver path; WU17 covers real unready fixtures.
  await page.locator(`${scope} .gpp-inbox-card__readiness--ready`).first().evaluate(el => {
    el.classList.replace('gpp-inbox-card__readiness--ready','gpp-inbox-card__readiness--unready');
  });
  await page.waitForTimeout(350);
}
try {
  for (const [route,url] of Object.entries({shortcode:fixture.frontend_inbox_url, block:p06.authentic_block_page.url})) {
    for (const [device,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})) {
      const prefix = `${route}/${device}`;
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
      assert.equal(after.inbox_width,before.inbox_width,'Vertical repair must preserve host composition width.');
      assert.equal(after.chain['ag-center-cols-clipper'].inline,before.chain['ag-center-cols-clipper'].inline,'Do not replace native inline sizing state.');

      await applyScenarioAction(page,'pagination',selectors); await settle(page,5);
      assertGeometry(await measure(page,`${prefix}/page-2`),5,columns);
      await page.locator(`${scope} [ref="btPrevious"]`).click(); await settle(page,20);
      assertGeometry(await measure(page,`${prefix}/page-1-return`),20,columns);
      await applyScenarioAction(page,'search_result',selectors); await settle(page,1);
      assertGeometry(await measure(page,`${prefix}/search-one`),1,columns);
      const search=page.locator(selectors.searchInput);
      await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20);
      assertGeometry(await measure(page,`${prefix}/search-cleared`),20,columns);
      await applyScenarioAction(page,'search_empty',selectors); await settle(page,0);
      const empty=await measure(page,`${prefix}/empty`);
      assert.equal(empty.card_count,0); assert.equal(empty.grid_count,1); assert.equal(empty.pager_count,1); assert.equal(empty.empty_visible,true);
      assert.equal(empty.chain['ag-center-cols-clipper'].minHeight,'500px','Native empty-state minimum must resume.');
      await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20);
      assertGeometry(await measure(page,`${prefix}/empty-cleared`),20,columns);

      await fallback(page); const nativeAfter=await measure(page,`${prefix}/after-mixed`);
      assert.equal(nativeAfter.card_count,0);
      for (const key of ['computedHeight','minHeight','inline']) assert.equal(nativeAfter.chain['ag-center-cols-clipper'][key],nativeBefore.chain['ag-center-cols-clipper'][key],`Native fallback retained sizing residue: ${key}`);
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
  fs.writeFileSync(path.join(artifactDir,'inbox-card-geometry.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
  console.log(`INBOX_CARD_GEOMETRY=${report.status}`);
}