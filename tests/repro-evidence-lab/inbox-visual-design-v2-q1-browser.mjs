import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, inboxUrl, assertEnv, control, login, waitForGrid, rowIds, waitForRow, nativeSearch, openByEnter, focusVisible } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();
const setup = JSON.parse(fs.readFileSync(path.join(artifactDir, 'inbox-visual-design-v2-qualification-setup.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { window.__GPP_IVD2_UNSAFE = 0; });
const polls = [];
const errors = [];
let phase = 'initial';
page.on('pageerror', error => errors.push(String(error?.stack || error).slice(0, 4000)));
page.on('response', async response => {
  if (!response.url().includes('/wp-json/gravityflow/internal/inbox/changes')) return;
  let body = '';
  try { body = await response.text(); } catch {}
  polls.push({ phase, status: response.status(), body: body.slice(0, 30000) });
});

async function waitPoll(needle, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hit = polls.find(item => item.phase === phase && item.body.includes(String(needle)));
    if (hit) return hit;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Missing native polling evidence for ${needle} in ${phase}`);
}

function all(flags) { return Object.values(flags).every(Boolean); }
let out = { contract: 'Q1_HTML_CELL_VALUE_PATH', execution_status: 'CAPTURED', status: 'NOT_PROVEN' };
let executionError = false;
try {
  await login(page);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);
  await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').evaluate(el => { el.dataset.ivd2GridMarker = 'q1-initial'; });

  const header = page.locator('[data-js="gflow-inbox"] .ag-header-cell').filter({ hasText: 'Q1 Rich Probe' }).first();
  const headerCount = await header.count();
  await page.waitForTimeout(900);
  const html = {
    header_count: headerCount,
    benign_node_count: await page.locator('[data-ivd2-rich="benign"]').count(),
    benign_svg_count: await page.locator('[data-ivd2-svg="benign"]').count(),
    unsafe_wrapper_count: await page.locator('[data-ivd2-rich="unsafe"]').count(),
    unsafe_script_count: await page.locator('[data-ivd2-unsafe-script]').count(),
    unsafe_img_count: await page.locator('[data-ivd2-unsafe-img]').count(),
    unsafe_svg_count: await page.locator('[data-ivd2-unsafe-svg]').count(),
    unsafe_execution_sentinel: await page.evaluate(() => window.__GPP_IVD2_UNSAFE || 0),
    escaped_markup_visible: (await page.locator('[data-js="gflow-inbox"]').innerText()).includes('<strong>IVD2 Visible'),
  };

  const searchRaw = await nativeSearch(page, 'IVD2_RAW_A');
  const searchDisplay = await nativeSearch(page, 'IVD2 Visible Zulu');
  await nativeSearch(page, 'IVD2 Visible');

  let ariaSort = null;
  let sortedRows = [];
  if (headerCount === 1) {
    for (let i = 0; i < 3; i += 1) {
      await header.click();
      await page.waitForTimeout(250);
      ariaSort = await header.getAttribute('aria-sort');
      if (ariaSort === 'ascending') break;
    }
    sortedRows = await rowIds(page);
  }
  const rawOrder = [Number(setup.entry_a), Number(setup.entry_z)];
  const displayOrder = [Number(setup.entry_z), Number(setup.entry_a)];
  const probeSortedRows = sortedRows.filter(id => rawOrder.includes(Number(id)));

  await nativeSearch(page, '');
  const filter = { available: false, display_query_row_ids: [], raw_query_row_ids: [] };
  const menuButton = header.locator('.ag-header-cell-menu-button');
  if (headerCount === 1 && await menuButton.count()) {
    await menuButton.click();
    await page.waitForTimeout(250);
    const filterInput = page.locator('.ag-menu .ag-filter-filter input').first();
    if (await filterInput.count()) {
      filter.available = true;
      await filterInput.fill('IVD2 Visible Alpha');
      await filterInput.dispatchEvent('input');
      await page.waitForTimeout(350);
      filter.display_query_row_ids = await rowIds(page);
      await filterInput.fill('IVD2_RAW_Z');
      await filterInput.dispatchEvent('input');
      await page.waitForTimeout(350);
      filter.raw_query_row_ids = await rowIds(page);
      await filterInput.fill('');
      await filterInput.dispatchEvent('input');
      // AG Grid's native text filter is debounced. Do not assume that clearing
      // the input immediately clears the row model; wait for the same native
      // filter lifecycle to restore a known probe row before continuing.
      await waitForRow(page, Number(setup.entry_a), true, 5000);
    }
    await page.keyboard.press('Escape');
  }

  await nativeSearch(page, '');
  await waitForRow(page, Number(setup.entry_a), true, 5000);
  const open = await openByEnter(page, page.locator(`[data-js="gflow-inbox"] .ag-row[row-id="${setup.entry_a}"] .gflow-inbox__entry-cell-link`).first());
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);
  await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').evaluate(el => { el.dataset.ivd2GridMarker = 'q1-live'; });

  phase = 'update';
  control('q1-update');
  await page.waitForSelector(`[data-js="gflow-inbox"] .ag-row[row-id="${setup.entry_a}"] [data-ivd2-rich="updated"]`, { timeout: 45000 });
  const updatePoll = await waitPoll(setup.entry_a);
  const updateMarker = await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').getAttribute('data-ivd2-grid-marker');

  phase = 'add';
  const addedId = Number(control('q1-add'));
  await waitForRow(page, addedId, true);
  await page.waitForSelector(`[data-js="gflow-inbox"] .ag-row[row-id="${addedId}"] [data-ivd2-rich="added"]`, { timeout: 45000 });
  const addPoll = await waitPoll(addedId);
  const addMarker = await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').getAttribute('data-ivd2-grid-marker');
  control('q1-remove');
  await waitForRow(page, addedId, false);

  const semantics = {
    raw_preserved: setup.raw_readback[String(setup.entry_a)] === 'IVD2_RAW_A' && setup.raw_readback[String(setup.entry_z)] === 'IVD2_RAW_Z',
    search_raw_matches: searchRaw.includes(Number(setup.entry_a)),
    search_display_matches: searchDisplay.includes(Number(setup.entry_a)),
    sort_matches_raw: JSON.stringify(probeSortedRows) === JSON.stringify(rawOrder),
    sort_matches_display: JSON.stringify(probeSortedRows) === JSON.stringify(displayOrder),
    filter_available: filter.available,
    filter_raw_matches: filter.raw_query_row_ids.includes(Number(setup.entry_z)),
    filter_display_matches: filter.display_query_row_ids.includes(Number(setup.entry_z)),
  };
  const flags = {
    rich_html_rendered: html.benign_node_count > 0 && !html.escaped_markup_visible,
    svg_rendered: html.benign_svg_count > 0,
    unsafe_script_and_handlers_not_executable: html.unsafe_execution_sentinel === 0,
    raw_entry_semantics_preserved: semantics.raw_preserved,
    search_uses_raw_semantics: semantics.search_raw_matches && !semantics.search_display_matches,
    sort_uses_raw_semantics: semantics.sort_matches_raw && !semantics.sort_matches_display,
    filter_uses_raw_semantics: filter.available && semantics.filter_raw_matches && !semantics.filter_display_matches,
    native_open_href_preserved: Boolean(open.href?.includes('view=entry') && open.href.includes('&id=') && open.href.includes('&lid=')),
    keyboard_enter_preserved: /view=entry/.test(open.url),
    visible_focus_preserved: focusVisible(open.focus),
    update_survives_native_poll: updatePoll.status === 200 && updateMarker === 'q1-live',
    add_survives_native_poll: addPoll.status === 200 && addMarker === 'q1-live',
    same_native_grid: updateMarker === 'q1-live' && addMarker === 'q1-live',
  };
  out = {
    ...out,
    status: filter.available ? (all(flags) ? 'PASS' : 'FAIL') : 'NOT_PROVEN',
    evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    flags,
    html_observation: html,
    unsafe_probe_classes: ['script', 'img_onerror', 'svg_onload'],
    raw_and_query_semantics: semantics,
    search_observation: { raw_query_row_ids: searchRaw, display_only_query_row_ids: searchDisplay },
    sort_observation: { aria_sort: ariaSort, all_observed_row_ids: sortedRows, probe_row_ids: probeSortedRows, raw_expected: rawOrder, display_expected: displayOrder },
    filter_observation: filter,
    native_interaction: open,
    live_refresh: { update_poll_status: updatePoll.status, add_poll_status: addPoll.status, added_entry_id: addedId, grid_marker_after_update: updateMarker, grid_marker_after_add: addMarker },
    mechanism: setup.mechanism,
    errors,
  };
  control('q1-disable');
} catch (error) {
  executionError = true;
  errors.push(String(error?.stack || error).slice(0, 12000));
  out = { ...out, execution_status: 'ERROR', errors };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-q1-error.png'), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q1.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q1-polling.json'), JSON.stringify(polls, null, 2) + '\n');
  await browser.close();
}
if (executionError) process.exit(1);
