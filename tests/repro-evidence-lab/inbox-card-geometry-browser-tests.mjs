import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Compatibility filename: this former Card Mode gate now proves the replacement
// Native-First ownership boundary. It deliberately makes no Card Mode claim.
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const repositorySha = process.env.GPP_WU21_REPOSITORY_SHA;
if (!artifactDir || !wpPath || !wpCli || !repositorySha) throw new Error('Native-First geometry runtime identity is incomplete.');

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
if (!fixture.frontend_inbox_url) throw new Error('Authentic frontend Inbox fixture is unavailable.');
const cookieJson = execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', `
$u=get_user_by('login','bootstrap_admin');
if(!$u) throw new RuntimeException('Synthetic WU21 admin unavailable.');
$e=time()+900;
echo wp_json_encode(array(
 array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),
 array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))
), JSON_UNESCAPED_SLASHES);
`], { encoding: 'utf8' }).trim();
const authCookies = JSON.parse(cookieJson);

const report = {
  schema_version: '2.0.0',
  artifact_name_compatibility: 'inbox-card-geometry.json is retained only because the WU21 workflow/artifact path predates the Native-First reset.',
  repository_sha: repositorySha,
  architecture: 'NATIVE_FIRST',
  superseded_architecture: 'CARD_MODE',
  status: 'RUNNING',
  measurements: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));

async function measure(viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(fixture.frontend_inbox_url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(200);

  const measured = await page.evaluate(() => {
    const root = document.documentElement;
    const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const inbox = document.querySelector('.gflow-inbox.gflow-grid.gflow-common');
    const grid = document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper');
    const pager = document.querySelector('[data-js="gflow-inbox"] .ag-paging-panel');
    const rows = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row')];
    const box = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
    };
    const lastRow = rows.length ? rows.reduce((last, row) => row.getBoundingClientRect().bottom > last.getBoundingClientRect().bottom ? row : last, rows[0]) : null;
    const lastRowBox = box(lastRow);
    const pagerBox = box(pager);
    return {
      native_wrapper_count: document.querySelectorAll('.gflow-inbox.gflow-grid.gflow-common').length,
      native_grid_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-root-wrapper').length,
      native_row_count: rows.length,
      search_count: document.querySelectorAll('[data-js="gflow-inbox-search"]').length,
      pager_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
      manual_refresh_count: document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      card_node_count: document.querySelectorAll('.gpp-inbox-card').length,
      card_column_count: document.querySelectorAll('[col-id="gpp_case_card"]').length,
      replacement_widget_count: document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').length,
      document_horizontal_overflow_px: Math.max(0, root.scrollWidth-root.clientWidth),
      surface_horizontal_overflow_px: surface ? Math.max(0, surface.scrollWidth-surface.clientWidth) : null,
      surface: box(surface),
      inbox: box(inbox),
      grid: box(grid),
      pager: pagerBox,
      last_row: lastRowBox,
      last_row_to_pager_gap: lastRowBox && pagerBox ? pagerBox.top-lastRowBox.bottom : null,
      direction: inbox ? getComputedStyle(inbox).direction : null,
    };
  });

  assert.equal(measured.native_wrapper_count, 1, 'Native Gravity Flow wrapper must remain singular.');
  assert.equal(measured.native_grid_count, 1, 'Native AG Grid must remain singular.');
  assert.ok(measured.native_row_count > 0, 'Native Inbox rendered no rows.');
  assert.equal(measured.search_count, 1, 'Native Search must remain singular.');
  assert.equal(measured.pager_count, 1, 'Native pager must remain singular.');
  assert.equal(measured.manual_refresh_count, 1, 'GPP manual reload utility must remain singular.');
  assert.equal(measured.card_node_count, 0, 'Card Mode markup is still present.');
  assert.equal(measured.card_column_count, 0, 'gpp_case_card is still present.');
  assert.equal(measured.replacement_widget_count, 0, 'A replacement Inbox widget is present.');
  assert.ok(measured.document_horizontal_overflow_px <= 4, `Document horizontal overflow: ${measured.document_horizontal_overflow_px}`);
  if (measured.surface_horizontal_overflow_px !== null) assert.ok(measured.surface_horizontal_overflow_px <= 4, `Surface horizontal overflow: ${measured.surface_horizontal_overflow_px}`);
  if (measured.last_row_to_pager_gap !== null) assert.ok(measured.last_row_to_pager_gap >= -2, `Native rows overlap native pager by ${measured.last_row_to_pager_gap}px.`);

  const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
  const previous = page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]');
  let pagination = { exercised: false };
  if (await next.count() === 1 && !(await next.evaluate(el => el.classList.contains('ag-disabled')))) {
    const firstIds = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').evaluateAll(rows => rows.map(row => row.getAttribute('row-id')).filter(Boolean));
    await next.click();
    await page.waitForTimeout(350);
    const secondIds = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').evaluateAll(rows => rows.map(row => row.getAttribute('row-id')).filter(Boolean));
    assert.ok(secondIds.length > 0, 'Native second page rendered no rows.');
    assert.notDeepEqual(secondIds, firstIds, 'Native pagination did not change row identity.');
    assert.equal(await previous.count(), 1, 'Native previous-page control disappeared.');
    await previous.click();
    await page.waitForTimeout(350);
    pagination = { exercised: true, first_page_rows: firstIds.length, second_page_rows: secondIds.length };
  }

  await page.close();
  return { viewport, ...measured, pagination };
}

try {
  report.measurements.push(await measure({ width: 1440, height: 1000 }));
  report.measurements.push(await measure({ width: 390, height: 844 }));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error?.stack || error);
  throw error;
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-card-geometry.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(`NATIVE_FIRST_GEOMETRY=${report.status}`);
}
