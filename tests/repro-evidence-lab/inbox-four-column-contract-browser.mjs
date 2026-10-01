import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  artifactDir,
  wpCli,
  wpPath,
  assertEnv,
  login,
  waitForGrid,
  nativeSearch,
  pagerState,
} from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = (fixture.forms || []).find(item => item.key === 'alpha') || fixture.forms?.[0];
if (!alpha?.form_id) throw new Error('INBOX_FOUR_COLUMN_FAILURE: alpha form fixture unavailable.');

const formId = Number(alpha.form_id);
const operatorId = Number(fixture.operator?.id || 0);
const firstField = Number(alpha.first_name_field_id);
const lastField = Number(alpha.last_name_field_id);
const nationalField = Number(alpha.national_id_field_id);
const gradeField = Number(alpha.grade_group_field_id);
const schoolField = Number(alpha.school_field_id);
const photoField = Number(alpha.photo_field_id);

const FIVE_PHYSICAL = ['date_created', String(schoolField), String(nationalField), String(firstField), 'id'];
const FOUR_PHYSICAL = ['date_created', String(schoolField), String(nationalField), String(firstField)];
const FOUR_RTL = [...FOUR_PHYSICAL].reverse();
const FIVE_RTL = [...FIVE_PHYSICAL].reverse();

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`WP-CLI failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

function setupScopedInbox() {
  const result = wpEval(`
$form_id = ${formId};
$operator_id = ${operatorId};
$first = ${firstField};
$last = ${lastField};
$national = ${nationalField};
$grade = ${gradeField};
$school = ${schoolField};
$photo = ${photoField};
$entry_ids = array();
for ($i = 0; $i < 25; $i++) {
    $entry = array(
        'form_id' => $form_id,
        'created_by' => $operator_id,
        (string) $first => sprintf('Four First %02d', $i),
        (string) $last => sprintf('Four Last %02d', $i),
        (string) $national => sprintf('FOUR-%03d', $i),
        (string) $grade => sprintf('پایه چهارستونه %02d', $i),
        (string) $school => sprintf('مدرسه چهارستونه %02d', $i),
        (string) $photo => '',
    );
    $entry_id = GFAPI::add_entry($entry);
    if (is_wp_error($entry_id)) { throw new RuntimeException($entry_id->get_error_message()); }
    GFAPI::update_entry_property($entry_id, 'date_created', gmdate('Y-m-d H:i:s', strtotime('2026-02-10 00:00:00 UTC') + $i));
    $api = new Gravity_Flow_API($form_id);
    $api->process_workflow($entry_id);
    $entry_ids[] = (int) $entry_id;
}
$page_a = wp_insert_post(array(
    'post_title' => 'WU21 Four Column Inbox A',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $form_id . '"]',
), true);
$page_b = wp_insert_post(array(
    'post_title' => 'WU21 Four Column Inbox B',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $form_id . '"]',
), true);
if (is_wp_error($page_a) || is_wp_error($page_b)) {
    throw new RuntimeException('Unable to create qualification Inbox pages.');
}
echo wp_json_encode(array(
    'page_a_id' => (int) $page_a,
    'page_a_url' => get_permalink($page_a),
    'page_b_id' => (int) $page_b,
    'page_b_url' => get_permalink($page_b),
    'entry_ids' => $entry_ids,
));
  `);
  const decoded = JSON.parse(result);
  if (!decoded?.page_a_url || !decoded?.page_b_url || !Array.isArray(decoded.entry_ids) || decoded.entry_ids.length !== 25) {
    throw new Error(`INBOX_FOUR_COLUMN_FAILURE: invalid setup result ${result}`);
  }
  return decoded;
}

function cleanupScopedInbox(setup) {
  if (!setup) return;
  const entryIds = JSON.stringify((setup.entry_ids || []).map(Number));
  wpEval(`
foreach (json_decode('${entryIds}', true) as $entry_id) { GFAPI::delete_entry((int) $entry_id); }
wp_delete_post(${Number(setup.page_a_id)}, true);
wp_delete_post(${Number(setup.page_b_id)}, true);
  `);
}

async function waitForRows(page) {
  await waitForGrid(page);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0,
    null,
    { timeout: 15000 },
  );
}

async function headerSnapshot(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(cells => cells
    .filter(cell => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(cell => {
      const rect = cell.getBoundingClientRect();
      const label = cell.querySelector('.ag-header-cell-text');
      return {
        col_id: cell.getAttribute('col-id'),
        text: (label?.textContent || cell.textContent || '').replace(/\\s+/g, ' ').trim(),
        x: rect.x,
        width: rect.width,
      };
    }));

}

function physicalHeaders(headers) {
  return [...headers].sort((a, b) => a.x - b.x);
}

function rtlHeaders(headers) {
  return [...headers].sort((a, b) => b.x - a.x);
}

async function rowSnapshot(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().evaluate(row => {
    return [...row.querySelectorAll('.ag-cell')]
      .map(cell => {
        const rect = cell.getBoundingClientRect();
        return {
          col_id: cell.getAttribute('col-id'),
          text: (cell.textContent || '').replace(/\\s+/g, ' ').trim(),
          x: rect.x,
        };
      })
      .filter(cell => cell.col_id && cell.width !== 0)
      .sort((a, b) => a.x - b.x);
  });
}

async function gridSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-js="gflow-inbox"]');
    const gridId = root?.dataset?.gridId || '';
    const raw = gridId ? window.localStorage.getItem(gridId) : null;
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch (_) {}
    const options = window.gflow_config?.grids?.[gridId]?.grid_options;
    return {
      grid_id: gridId,
      storage_raw: raw,
      storage_state: parsed,
      column_defs: Array.isArray(options?.columnDefs) ? options.columnDefs.map(c => String(c.field)) : null,
      ag_rtl: Boolean(root?.querySelector('.ag-root-wrapper')?.classList.contains('ag-rtl')),
      root_direction: root?.querySelector('.ag-root-wrapper') ? getComputedStyle(root.querySelector('.ag-root-wrapper')).direction : null,
    };
  });
}

async function setSentinels(page) {
  await page.evaluate(() => {
    localStorage.setItem('wu21-unrelated-local-sentinel', 'LOCAL_SENTINEL_v1');
    sessionStorage.setItem('wu21-unrelated-session-sentinel', 'SESSION_SENTINEL_v1');
  });
}

async function sentinelSnapshot(page) {
  return page.evaluate(() => ({
    local: localStorage.getItem('wu21-unrelated-local-sentinel'),
    session: sessionStorage.getItem('wu21-unrelated-session-sentinel'),
  }));
}

async function firstRowId(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().getAttribute('row-id');
}
async function collectAllRowIds(page) {
  const ids = [];
  while (true) {
    ids.push(...await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').evaluateAll(rows => rows.map(r => Number(r.getAttribute('row-id')))));
    const state = await pagerState(page);
    if (state.next_disabled) break;
    await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
    await page.waitForFunction(
      previous => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() !== previous,
      state.current,
      { timeout: 10000 },
    );
  }
  while ((await pagerState(page)).current !== '1') {
    const state = await pagerState(page);
    await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
    await page.waitForFunction(
      previous => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() !== previous,
      state.current,
      { timeout: 10000 },
    );
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}


async function addLiveEntry() {
  return Number(wpEval(`
$entry = array(
    'form_id' => ${formId},
    'created_by' => ${operatorId},
    (string) ${firstField} => 'Live First',
    (string) ${lastField} => 'Live Last',
    (string) ${nationalField} => 'FOUR-LIVE',
    (string) ${gradeField} => 'پایه زنده',
    (string) ${schoolField} => 'مدرسه زنده',
    (string) ${photoField} => '',
);
$id = GFAPI::add_entry($entry);
if (is_wp_error($id)) { throw new RuntimeException($id->get_error_message()); }
GFAPI::update_entry_property($id, 'date_created', '2026-02-11 00:00:00');
$api = new Gravity_Flow_API(${formId});
$api->process_workflow($id);
echo (int) $id;
  `));
}

async function removeLiveEntry(id) {
  wpEval(`GFAPI::delete_entry(${Number(id)});`);
}

async function gotoInbox(page, url, fourColumn = false) {
  const target = new URL(url);
  target.searchParams.set('wu21_four_column_rtl', '1');
  target.searchParams.set('wu21_header_rtl_probe', '1');
  if (fourColumn) {
    target.searchParams.set('wu21_four_column', '1');
    target.searchParams.set('wu21_four_column_form', String(formId));
  }
  await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
  await waitForRows(page);
}

const evidencePath = path.join(artifactDir, 'inbox-four-column-contract-evidence.json');
let scoped = null;
let browser = null;
let context = null;
let page = null;
let evidence = {
  contract: 'SRWF_INBOX_FOUR_COLUMN_PERSISTENCE_QUALIFICATION_V1',
  execution_status: 'ERROR',
};

try {
  scoped = setupScopedInbox();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await login(page);
  await setSentinels(page);

  // Q1: current five-column mapping. The Operations header is emitted on colId=id
  // and its only native Entry Detail link is the host gflow-inbox entry-cell link.
  await gotoInbox(page, scoped.page_a_url, false);
  const fiveHeaders = await headerSnapshot(page);
  const fivePhysical = physicalHeaders(fiveHeaders);
  const fiveGrid = await gridSnapshot(page);
  const idCell = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().locator('.ag-cell[col-id="id"]');
  const idLink = idCell.locator('a.gflow-inbox__entry-cell-link').first();
  const idLinkHref = await idLink.getAttribute('href');
  assert.equal(idCell.count ? await idCell.count() : 0, 1, 'Operations/id cell is missing.');
  assert.match(idLinkHref || '', /view=entry/, 'Operations/id cell does not contain the native Entry Detail link.');
  assert.deepEqual(fivePhysical.map(c => c.col_id), FIVE_PHYSICAL, 'Current five-column physical contract changed unexpectedly.');
  assert.equal(fiveHeaders.find(c => c.col_id === 'id')?.text, 'عملیات', 'The visible Operations header is not bound to colId=id.');
  assert.equal(fiveGrid.ag_rtl, false, 'Native Grid unexpectedly entered AG Grid RTL mode.');
  assert.equal(fiveGrid.root_direction, 'rtl', 'The qualification RTL request did not establish the surrounding RTL direction.');

  const baselineRowIds = await collectAllRowIds(page);

  // Capture an authentic host state. A native sort is enough to force Gravity Flow
  // to persist the complete state object without fabricating its properties.
  await page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first().click();
  await page.waitForTimeout(600);
  const fiveStateBeforeReload = await gridSnapshot(page);
  assert.ok(Array.isArray(fiveStateBeforeReload.storage_state), 'Gravity Flow did not persist an authentic five-column state.');
  assert.deepEqual(
    fiveStateBeforeReload.storage_state.map(item => String(item.colId)),
    FIVE_PHYSICAL,
    'The first native five-column persistence did not retain the physical column contract.'
  );

  // Q4 requires an authentic persisted five-column state with the known
  // conflicting order. Gravity Flow's current runtime may write the clean
  // physical order on this first native persistence, so the qualification
  // preserves that authentic state object in full and changes only its array
  // sequence as a deterministic test fixture. No properties are invented and
  // the target state is not cleared after seeding.
  const authenticFiveState = fiveStateBeforeReload.storage_state;
  const conflictingFiveState = [
    authenticFiveState.find(item => String(item.colId) === 'id'),
    ...authenticFiveState.filter(item => String(item.colId) !== 'id'),
  ];
  assert.equal(conflictingFiveState.length, authenticFiveState.length, 'Conflicting five-column fixture lost a persisted state object.');
  assert.equal(conflictingFiveState.every(Boolean), true, 'Conflicting five-column fixture contains an invalid state object.');
  await page.evaluate(
    ({ gridId, state }) => window.localStorage.setItem(gridId, JSON.stringify(state)),
    { gridId: fiveStateBeforeReload.grid_id, state: conflictingFiveState },
  );
  const seededHistorical = await gridSnapshot(page);
  assert.deepEqual(
    seededHistorical.storage_state.map(item => String(item.colId)),
    ['id', 'date_created', String(schoolField), String(nationalField), String(firstField)],
    'Historical five-column state was not seeded with the required conflicting order.'
  );

  // The next reload exercises Gravity Flow's authentic restore path against the
  // captured host state. No storage is cleared after seeding.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRows(page);
  const fiveAfterRestore = await gridSnapshot(page);
  const fiveAfterRestoreHeaders = physicalHeaders(await headerSnapshot(page));
  assert.deepEqual(
    fiveAfterRestore.storage_state.map(item => String(item.colId)),
    ['id', 'date_created', String(schoolField), String(nationalField), String(firstField)],
    'Exact five-column host restore did not preserve the seeded id-first state.'
  );
  assert.deepEqual(
    fiveAfterRestoreHeaders.map(c => c.col_id),
    ['id', 'date_created', String(schoolField), String(nationalField), String(firstField)],
    'The reproduced five-column stale state did not manifest as the known id-first physical order.'
  );

  // Q3/Q4: remove id only from the actual supported column-definition seam, with
  // no storage clearing. The same native Grid ID is intentionally retained.
  const historicalState = fiveAfterRestore.storage_state;
  const historicalGridId = fiveAfterRestore.grid_id;
  const beforeHistoricalStorage = fiveAfterRestore.storage_raw;
  assert.equal(historicalGridId, fiveStateBeforeReload.grid_id, 'Grid ID changed unexpectedly across five-column reload.');

  await gotoInbox(page, scoped.page_a_url, true);
  const fourFirst = await gridSnapshot(page);
  const fourFirstHeaders = await headerSnapshot(page);
  const fourFirstPhysical = physicalHeaders(fourFirstHeaders);
  const fourFirstRtl = rtlHeaders(fourFirstHeaders);
  const fourFirstRows = await rowSnapshot(page);

  assert.deepEqual(fourFirst.column_defs, FOUR_PHYSICAL, 'Fresh four-column native Grid definitions are not the expected four identities.');
  assert.deepEqual(fourFirstPhysical.map(c => c.col_id), FOUR_PHYSICAL, 'Fresh four-column physical order is not date|school|national|student.');
  assert.deepEqual(fourFirstRtl.map(c => c.col_id), FOUR_RTL, 'Fresh four-column RTL visual order is not student|national|school|date.');
  assert.equal(fourFirstPhysical.length, 4, 'Fresh four-column Grid has an unexpected visible column count.');
  assert.deepEqual(fourFirstRows.map(c => c.col_id), FOUR_PHYSICAL, 'First row cell order is not aligned with four-column header order.');
  const historicalStorageOutcome = fourFirst.storage_raw === beforeHistoricalStorage
    ? 'old_five_column_state_retained'
    : (Array.isArray(fourFirst.storage_state) && fourFirst.storage_state.map(item => String(item.colId)).join('|') === FOUR_PHYSICAL.join('|')
      ? 'new_four_column_state_created_natively'
      : 'other_native_storage_transition');
  const fourRowIds = await collectAllRowIds(page);
  assert.deepEqual(fourRowIds, baselineRowIds, 'Removing id changed the native query/assignment row set.');

  // The host has now rejected the incompatible five-column state by identity set.
  // A normal native sort must be able to write a fresh four-column state without
  // any GPP-owned persistence layer.
  await page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first().click();
  await page.waitForTimeout(700);
  const fourPersisted = await gridSnapshot(page);
  assert.ok(Array.isArray(fourPersisted.storage_state), 'Gravity Flow did not naturally persist the four-column state.');
  assert.deepEqual(
    fourPersisted.storage_state.map(item => String(item.colId)),
    FOUR_PHYSICAL,
    'Native four-column persistence did not contain exactly the four active identities.'
  );

  const firstFourRowBeforeReload = await rowSnapshot(page);
  const firstFourSortState = fourPersisted.storage_state.find(item => String(item.colId) === 'date_created')?.sort || null;
  const unrelatedBefore = await sentinelSnapshot(page);

  // First repaired reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRows(page);
  const fourSecond = await gridSnapshot(page);
  const fourSecondHeaders = await headerSnapshot(page);
  const fourSecondPhysical = physicalHeaders(fourSecondHeaders);
  const fourSecondRtl = rtlHeaders(fourSecondHeaders);
  const fourSecondRows = await rowSnapshot(page);
  assert.deepEqual(fourSecondPhysical.map(c => c.col_id), FOUR_PHYSICAL, 'First four-column reload changed physical order.');
  assert.deepEqual(fourSecondRtl.map(c => c.col_id), FOUR_RTL, 'First four-column reload changed RTL order.');
  assert.deepEqual(fourSecondRows.map(c => c.col_id), FOUR_PHYSICAL, 'First four-column reload broke header/body identity alignment.');
  assert.equal(
    fourSecond.storage_state.find(item => String(item.colId) === 'date_created')?.sort || null,
    firstFourSortState,
    'Native sort persistence on date_created was lost on first four-column reload.'
  );
  assert.deepEqual(
    fourSecond.storage_state.map(item => String(item.colId)),
    FOUR_PHYSICAL,
    'First four-column reload did not retain the native four-column persisted order.'
  );

  // Second/subsequent reload: this is the defect-class closure gate.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRows(page);
  const fourThird = await gridSnapshot(page);
  const fourThirdHeaders = await headerSnapshot(page);
  const fourThirdPhysical = physicalHeaders(fourThirdHeaders);
  const fourThirdRtl = rtlHeaders(fourThirdHeaders);
  const fourThirdRows = await rowSnapshot(page);
  assert.deepEqual(fourThirdPhysical.map(c => c.col_id), FOUR_PHYSICAL, 'Second four-column reload changed physical order.');
  assert.deepEqual(fourThirdRtl.map(c => c.col_id), FOUR_RTL, 'Second four-column reload changed RTL order.');
  assert.deepEqual(fourThirdRows.map(c => c.col_id), FOUR_PHYSICAL, 'Second four-column reload broke header/body identity alignment.');
  assert.deepEqual(
    fourThird.storage_state.map(item => String(item.colId)),
    FOUR_PHYSICAL,
    'Second four-column reload did not retain the native four-column persisted order.'
  );

  // Q6: native search and pagination remain native.
  const firstId = Number(scoped.entry_ids[0]);
  const searched = await nativeSearch(page, 'FOUR-000');
  assert.equal(searched.includes(firstId), true, 'Native search failed after Operations removal.');
  await nativeSearch(page, '');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20,
    null,
    { timeout: 10000 }
  );
  const pager1 = await pagerState(page);
  assert.equal(pager1.current, '1', 'Native pager did not start on page 1.');
  assert.equal(pager1.next_disabled, false, 'Native pager did not expose page 2.');
  await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2', null, { timeout: 10000 });
  const pager2 = await pagerState(page);
  await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1', null, { timeout: 10000 });
  const pagerRoundTrip = await pagerState(page);
  assert.equal(pager2.current, '2', 'Native pager did not reach page 2.');
  assert.equal(pagerRoundTrip.current, '1', 'Native pager did not return to page 1.');

  // Q8: native Live Refresh must still add and remove rows without a replacement Grid.
  const liveId = await addLiveEntry();
  await page.waitForFunction(
    id => Boolean(document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`)),
    liveId,
    { timeout: 30000 }
  );
  await removeLiveEntry(liveId);
  await page.waitForFunction(
    id => !document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`),
    liveId,
    { timeout: 30000 }
  );
  const nativeWrappers = await page.locator('[data-js="gflow-inbox"]').count();
  const replacementTables = await page.locator('[data-gpp-replacement-grid], [data-gpp-custom-grid]').count();
  assert.equal(nativeWrappers, 1, 'Four-column qualification does not use exactly one native Inbox.');
  assert.equal(replacementTables, 0, 'A replacement/custom Grid appeared during qualification.');

  // Q7: row click is the documented native Entry Detail path. The id/Operations
  // link was already proven above; this test determines whether removing it makes
  // Entry Detail unreachable through another supported native path.
  const row = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first();
  const rowId = await row.getAttribute('row-id');
  await Promise.all([
    page.waitForURL(/view=entry/, { timeout: 30000 }),
    row.click(),
  ]);
  const rowOpenUrl = page.url();
  assert.match(rowOpenUrl, /view=entry/, 'Native row-click Entry Detail navigation disappeared after Operations removal.');

  const unrelatedAfter = await sentinelSnapshot(page);
  assert.deepEqual(unrelatedAfter, unrelatedBefore, 'Unrelated local/session storage sentinel changed.');

  // Grid isolation: a second page must have a distinct native Grid ID and must
  // retain its own state independently of page A.
  const pageB = await context.newPage();
  await gotoInbox(pageB, scoped.page_b_url, true);
  const gridBInitial = await gridSnapshot(pageB);
  assert.notEqual(gridBInitial.grid_id, historicalGridId, 'Two distinct Inbox pages unexpectedly share the same native Grid ID.');
  const gridBStateBefore = gridBInitial.storage_raw;
  await pageB.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first().click();
  await pageB.waitForTimeout(700);
  const gridBAfterSort = await gridSnapshot(pageB);
  assert.deepEqual(gridBAfterSort.storage_state.map(item => String(item.colId)), FOUR_PHYSICAL, 'Second Grid did not persist its own four-column state.');
  const pageAFourUrl = new URL(scoped.page_a_url);
  pageAFourUrl.searchParams.set('wu21_four_column_rtl', '1');
  pageAFourUrl.searchParams.set('wu21_header_rtl_probe', '1');
  pageAFourUrl.searchParams.set('wu21_four_column', '1');
  pageAFourUrl.searchParams.set('wu21_four_column_form', String(formId));
  await page.goto(pageAFourUrl.toString(), { waitUntil: 'domcontentloaded' });
  await waitForRows(page);
  const gridAAfterB = await gridSnapshot(page);
  assert.deepEqual(gridAAfterB.storage_state.map(item => String(item.colId)), FOUR_PHYSICAL, 'Grid A state changed after Grid B interaction.');
  const gridBStoredRawAfterA = await page.evaluate(gridId => localStorage.getItem(gridId), gridBAfterSort.grid_id);
  assert.equal(gridBStoredRawAfterA, gridBAfterSort.storage_raw, 'Grid B persisted state was altered by Grid A activity.');
  assert.equal(gridBStateBefore === null || typeof gridBStateBefore === 'string', true);

  evidence = {
    contract: 'SRWF_INBOX_FOUR_COLUMN_PERSISTENCE_QUALIFICATION_V1',
    execution_status: 'PASS',
    repository_sha: process.env.GPP_WU21_REPOSITORY_SHA || null,
    runtime: JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'), 'utf8')),
    authority: {
      gravity_flow_filter: 'gravityflow_columns_inbox_table',
      documented_native_id_removal: 'id_column="false"',
      qualification_override: 'test-only post-production filter on the same gravityflow_columns_inbox_table seam',
    },
    q1_operations_mapping: {
      col_id: 'id',
      header: 'عملیات',
      renderer_selector: '.gflow-inbox__entry-cell-link',
      href: idLinkHref,
      relation: 'native Entry Detail link owned by the Operations/id cell on the five-column contract',
    },
    q3_fresh_four_column: {
      physical_headers: fourFirstPhysical,
      rtl_headers: fourFirstRtl,
      first_row_cells: fourFirstRows,
      grid_id: fourFirst.grid_id,
      column_defs: fourFirst.column_defs,
    },
    q4_historical_five_column: {
      grid_id: historicalGridId,
      before_four_column_storage: historicalState,
      conflicting_order: historicalState.map(item => String(item.colId)),
      after_four_column_fallback_storage: fourFirst.storage_state,
      historical_storage_outcome: historicalStorageOutcome,
      old_storage_preserved_without_manual_clear: true,
      fresh_four_column_state_created_after_native_sort: fourPersisted.storage_state,
    },
    q5_stability: {
      before_reload: fourPersisted.storage_state,
      first_reload: fourSecond.storage_state,
      second_reload: fourThird.storage_state,
      required_physical_order: FOUR_PHYSICAL,
    },
    q6_native_state: {
      date_created_sort: firstFourSortState,
      survived_first_reload: fourSecond.storage_state.find(item => String(item.colId) === 'date_created')?.sort || null,
      survived_second_reload: fourThird.storage_state.find(item => String(item.colId) === 'date_created')?.sort || null,
      search: { query: 'FOUR-000', matched_row_ids: searched },
      pagination: { page_1: pager1, page_2: pager2, round_trip: pagerRoundTrip },
    },
    q7_navigation: {
      id_column_href: idLinkHref,
      row_click_opened_entry_detail: true,
      row_click_url: rowOpenUrl,
      navigation_dependency: 'Operations/id link is one native path; row click remains another native path.',
    },
    q8_native_behavior: {
      baseline_row_ids: baselineRowIds,
      live_refresh_entry_id: liveId,
      live_refresh_add_remove: true,
      native_inbox_count: nativeWrappers,
      replacement_grid_count: replacementTables,
      storage_sentinels: { before: unrelatedBefore, after: unrelatedAfter },
      grid_isolation: {
        grid_a_id: historicalGridId,
        grid_b_id: gridBAfterSort.grid_id,
        grid_a_after_b: gridAAfterB.storage_state,
        grid_b_after_a_raw: gridBStoredRawAfterA,
      },
    },
    clean_state_control: {
      separate_page_b_initial_storage: gridBStateBefore,
      distinct_grid_id: gridBInitial.grid_id,
    },
  };

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('INBOX_FOUR_COLUMN_CONTRACT_PASS');
} catch (error) {
  evidence.error = { message: error?.message || String(error), stack: error?.stack || null };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanupScopedInbox(scoped);
}
