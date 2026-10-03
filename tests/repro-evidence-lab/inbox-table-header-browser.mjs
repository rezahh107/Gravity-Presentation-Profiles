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
if (!alpha?.form_id) throw new Error('INBOX_HEADER_RUNTIME_FAILURE: alpha form fixture is unavailable.');

const expectedLtrPhysicalLabels = ['عملیات', 'نام دانش‌آموز', 'کد ملی', 'مدرسه و پایه', 'تاریخ و ساعت ثبت'];
const expectedLtrPhysicalColumnIds = [
  'id',
  String(alpha.first_name_field_id),
  String(alpha.national_id_field_id),
  String(alpha.school_field_id),
  'date_created',
];
const expectedRightToLeftLabels = ['نام دانش‌آموز', 'کد ملی', 'مدرسه و پایه', 'تاریخ و ساعت ثبت', 'عملیات'];
const expectedRightToLeftColumnIds = [
  String(alpha.first_name_field_id),
  String(alpha.national_id_field_id),
  String(alpha.school_field_id),
  'date_created',
  'id',
];
const expectedPhysicalRtlLabels = [...expectedRightToLeftLabels].reverse();
const expectedPhysicalRtlColumnIds = [...expectedRightToLeftColumnIds].reverse();

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
$form_id = ${Number(alpha.form_id)};
$operator_id = ${Number(fixture.operator?.id || 0)};
$first = ${Number(alpha.first_name_field_id)};
$last = ${Number(alpha.last_name_field_id)};
$national = ${Number(alpha.national_id_field_id)};
$grade = ${Number(alpha.grade_group_field_id)};
$school = ${Number(alpha.school_field_id)};
$photo = ${Number(alpha.photo_field_id)};
$entry_ids = array();
for ($i = 0; $i < 10; $i++) {
    $entry = array(
        'form_id' => $form_id,
        'created_by' => $operator_id,
        (string) $first => sprintf('Header First %02d', $i),
        (string) $last => sprintf('Header Last %02d', $i),
        (string) $national => sprintf('HDR-A-%03d', $i),
        (string) $grade => sprintf('پایه آزمون هدر %02d', $i),
        (string) $school => sprintf('مدرسه آزمون هدر %02d', $i),
        (string) $photo => '',
    );
    $entry_id = GFAPI::add_entry($entry);
    if (is_wp_error($entry_id)) { throw new RuntimeException($entry_id->get_error_message()); }
    GFAPI::update_entry_property($entry_id, 'date_created', gmdate('Y-m-d H:i:s', strtotime('2026-02-01 00:00:00 UTC') + $i));
    $api = new Gravity_Flow_API($form_id);
    $api->process_workflow($entry_id);
    $entry_ids[] = (int) $entry_id;
}
$page_id = wp_insert_post(array(
    'post_title' => 'WU21 SRWF Header Scoped Inbox',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $form_id . '"]',
), true);
if (is_wp_error($page_id)) { throw new RuntimeException($page_id->get_error_message()); }
echo wp_json_encode(array('page_id' => (int) $page_id, 'url' => get_permalink($page_id), 'entry_ids' => $entry_ids));
  `);
  const decoded = JSON.parse(result);
  if (!decoded?.page_id || !decoded?.url || !Array.isArray(decoded.entry_ids)) {
    throw new Error(`INBOX_HEADER_RUNTIME_FAILURE: invalid setup result ${result}`);
  }
  return decoded;
}

function cleanupScopedInbox(setup) {
  if (!setup) return;
  const entryIds = JSON.stringify((setup.entry_ids || []).map(Number));
  wpEval(`
foreach (json_decode('${entryIds}', true) as $entry_id) { GFAPI::delete_entry((int) $entry_id); }
wp_delete_post(${Number(setup.page_id)}, true);
  `);
}

async function waitForRows(page) {
  await waitForGrid(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 15000 });
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
        text: (label?.textContent || cell.textContent || '').replace(/\s+/g, ' ').trim(),
        direction: getComputedStyle(label || cell).direction,
        x: rect.x,
        width: rect.width,
      };
    }));
}

function leftToRight(headers) {
  return [...headers].sort((a, b) => a.x - b.x);
}

function rightToLeft(headers) {
  return [...headers].sort((a, b) => b.x - a.x);
}

async function visibleRowIds(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').evaluateAll(rows => rows
    .map(row => Number(row.getAttribute('row-id')))
    .filter(Number.isFinite));
}

async function embeddedGridState(page) {
  return page.evaluate(() => {
    const gridElement = document.querySelector('[data-js="gflow-inbox"]');
    const gridId = gridElement?.dataset?.gridId || 'inbox_default';
    const gridConfig = window.gflow_config?.grids?.[gridId]?.grid_options;
    const root = gridElement?.querySelector('.ag-root-wrapper');
    return {
      grid_id: gridId,
      ag_rtl: Boolean(root?.classList.contains('ag-rtl')),
      root_direction: root ? getComputedStyle(root).direction : null,
      column_defs: Array.isArray(gridConfig?.columnDefs)
        ? gridConfig.columnDefs.map(column => ({
            field: column.field ?? null,
            display_key: column.displayKey ?? null,
            compare_type: column.compareType ?? null,
          }))
        : null,
      rows: Array.isArray(gridConfig?.rowData) ? gridConfig.rowData : null,
    };
  });
}

const evidencePath = path.join(artifactDir, 'inbox-table-header-evidence.json');
let scoped = null;
let browser = null;
let evidence = { contract: 'SRWF_INBOX_TABLE_HEADER_V1', execution_status: 'ERROR' };

try {
  scoped = setupScopedInbox();

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);

  // WU21's existing lab plugin already requires the raw-native bypass from the
  // symlinked repository. Reuse that one authoritative module instead of
  // copying the same class into mu-plugins a second time.
  const rawUrl = new URL(scoped.url);
  rawUrl.searchParams.set('wu21_native_inbox_baseline', 'raw_native');
  await page.goto(rawUrl.toString(), { waitUntil: 'networkidle' });
  await waitForRows(page);
  const before = await headerSnapshot(page);
  await page.screenshot({ path: path.join(artifactDir, 'inbox-table-header-before.png'), fullPage: true });

  // Non-RTL control: the existing physical order must remain unchanged.
  await page.goto(scoped.url, { waitUntil: 'networkidle' });
  await waitForRows(page);
  const ltrControl = leftToRight(await headerSnapshot(page));
  assert.deepEqual(ltrControl.map(item => item.text), expectedLtrPhysicalLabels, 'Non-RTL physical header order changed unexpectedly.');
  assert.deepEqual(ltrControl.map(item => item.col_id), expectedLtrPhysicalColumnIds, 'Non-RTL native column IDs changed unexpectedly.');

  // Qualification-only request signal makes WordPress is_rtl() truthful while
  // leaving the native Gravity Flow/AG Grid direction/state untouched.
  const rtlUrl = new URL(scoped.url);
  rtlUrl.searchParams.set('wu21_header_rtl_probe', '1');
  await page.goto(rtlUrl.toString(), { waitUntil: 'networkidle' });
  await waitForRows(page);
  const after = await headerSnapshot(page);
  const afterLeftToRight = leftToRight(after);
  const afterRightToLeft = rightToLeft(after);
  const embedded = await embeddedGridState(page);
  await page.screenshot({ path: path.join(artifactDir, 'inbox-table-header-after.png'), fullPage: true });

  evidence = {
    contract: 'SRWF_INBOX_TABLE_HEADER_V1',
    execution_status: 'CAPTURED',
    route: { form_id: Number(alpha.form_id), page_id: Number(scoped.page_id), rtl_probe: true },
    before: { headers: before },
    ltr_control: { headers_left_to_right: ltrControl },
    after: {
      headers: after,
      headers_left_to_right: afterLeftToRight,
      headers_right_to_left: afterRightToLeft,
    },
    embedded_grid: embedded,
    expected: {
      ltr_physical_labels: expectedLtrPhysicalLabels,
      ltr_physical_column_ids: expectedLtrPhysicalColumnIds,
      right_to_left_labels: expectedRightToLeftLabels,
      right_to_left_column_ids: expectedRightToLeftColumnIds,
      physical_left_to_right_labels_on_rtl: expectedPhysicalRtlLabels,
      physical_left_to_right_column_ids_on_rtl: expectedPhysicalRtlColumnIds,
    },
  };

  assert.equal(embedded.ag_rtl, false, 'RTL repair must not enable or take ownership of AG Grid RTL state.');
  assert.equal(embedded.root_direction, 'ltr', 'Native AG Grid physical axis must remain LTR inside the RTL SRWF page.');
  assert.deepEqual(afterLeftToRight.map(item => item.text), expectedPhysicalRtlLabels, 'RTL physical left-to-right order is not the required inverse sequence.');
  assert.deepEqual(afterLeftToRight.map(item => item.col_id), expectedPhysicalRtlColumnIds, 'RTL physical native column IDs are not the required inverse sequence.');
  assert.deepEqual(afterRightToLeft.map(item => item.text), expectedRightToLeftLabels, 'Rendered visible right-to-left order differs from the Owner contract.');
  assert.deepEqual(afterRightToLeft.map(item => item.col_id), expectedRightToLeftColumnIds, 'Rendered right-to-left native column identities differ from the Owner contract.');
  assert.equal(after.length, 5, 'Exactly five visible native header cells are required.');
  for (const removed of ['وضعیت', 'مرحله', 'ارسال‌کننده']) {
    assert.equal(after.some(item => item.text === removed), false, `Removed header is still visible: ${removed}`);
  }
  assert.equal(after.some(item => item.text.includes('\uFFFD')), false, 'Persian header text contains replacement characters.');

  assert.equal(Array.isArray(embedded.column_defs), true, 'Native AG Grid column definitions were not exposed by Gravity Flow.');
  assert.equal(Array.isArray(embedded.rows), true, 'Native AG Grid row data were not exposed by Gravity Flow.');
  const dateColumn = embedded.column_defs.find(column => column.field === 'date_created');
  assert.equal(dateColumn?.display_key, 'date_created_human_readable', 'Native Submitted column lost Gravity Flow\'s qualified display identity.');

  const dateHeader = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first();
  await dateHeader.click();
  await page.waitForTimeout(250);
  const sortFirst = await dateHeader.getAttribute('aria-sort');
  const sortRowsFirst = await visibleRowIds(page);
  await dateHeader.click();
  await page.waitForTimeout(250);
  const sortSecond = await dateHeader.getAttribute('aria-sort');
  const sortRowsSecond = await visibleRowIds(page);
  assert.ok(['ascending', 'descending'].includes(sortFirst), `Native date sort did not activate: ${sortFirst}`);
  assert.ok(['ascending', 'descending'].includes(sortSecond), `Native date sort did not cycle: ${sortSecond}`);
  assert.notEqual(sortFirst, sortSecond, 'Native date sort direction did not change on the second header activation.');
  assert.notDeepEqual(sortRowsFirst, sortRowsSecond, 'Native date sort did not change the visible row order.');

  const firstAddedId = Number(scoped.entry_ids[0]);
  const searched = await nativeSearch(page, 'HDR-A-000');
  assert.equal(searched.includes(firstAddedId), true, 'Native Inbox search did not retain the expected scoped row.');
  const searchedRow = page.locator(`[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="${firstAddedId}"]`).first();
  await searchedRow.waitFor({ state: 'visible', timeout: 10000 });
  const studentCell = searchedRow.locator(`.ag-cell[col-id="${alpha.first_name_field_id}"]`);
  const nationalCell = searchedRow.locator(`.ag-cell[col-id="${alpha.national_id_field_id}"]`);
  const schoolGradeCell = searchedRow.locator(`.ag-cell[col-id="${alpha.school_field_id}"]`);
  const dateCell = searchedRow.locator('.ag-cell[col-id="date_created"]');
  const studentText = (await studentCell.innerText()).trim();
  const nationalText = (await nationalCell.innerText()).trim();
  const schoolGradeText = (await schoolGradeCell.innerText()).trim();
  const dateText = (await dateCell.innerText()).trim();
  const textDirections = {
    student_name: await studentCell.evaluate(el => getComputedStyle(el).direction),
    national_id: await nationalCell.evaluate(el => getComputedStyle(el).direction),
    school_grade: await schoolGradeCell.evaluate(el => getComputedStyle(el).direction),
    date_created: await dateCell.evaluate(el => getComputedStyle(el).direction),
    headers: await page.locator('[data-js="gflow-inbox"] .ag-header-cell-text').evaluateAll(nodes => nodes.map(el => getComputedStyle(el).direction)),
  };
  const embeddedRow = embedded.rows.find(row => Number(row.id) === firstAddedId);
  assert.equal(studentText, 'Header First 00 Header Last 00', 'Student-name plain-text composition is not authoritative.');
  assert.equal(nationalText, 'HDR-A-000', 'National-ID native field value changed unexpectedly.');
  assert.equal(schoolGradeText, 'مدرسه آزمون هدر 00 — پایه آزمون هدر 00', 'School/grade plain-text composition is not authoritative.');
  assert.equal(typeof embeddedRow?.date_created, 'number', 'Native date_created raw compare value is unavailable.');
  assert.equal(typeof embeddedRow?.date_created_human_readable, 'string', 'Native date_created display value is unavailable.');
  assert.notEqual(embeddedRow?.date_created_human_readable, '', 'Native date_created display value is empty.');
  assert.equal(dateText, embeddedRow.date_created_human_readable, 'Submitted cell must display Gravity Flow\'s native human-readable value rather than a fabricated value.');
  assert.deepEqual(
    Object.values(textDirections).flat(),
    Object.values(textDirections).flat().map(() => 'rtl'),
    'Persian/native Inbox text leaves must remain RTL while the physical Grid axis is LTR.'
  );

  await nativeSearch(page, '');
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20, null, { timeout: 10000 });

  const pagerBefore = await pagerState(page);
  assert.equal(pagerBefore.count, 1, 'Native pager disappeared from the scoped Inbox.');
  assert.equal(pagerBefore.current, '1', 'Scoped Inbox did not begin on native page 1.');
  assert.equal(pagerBefore.next_disabled, false, 'Synthetic scoped fixture should expose native page 2.');
  await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2', null, { timeout: 10000 });
  const pagerPage2 = await pagerState(page);
  assert.equal(pagerPage2.current, '2', 'Native Next did not navigate to page 2.');
  await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1', null, { timeout: 10000 });
  const pagerRoundTrip = await pagerState(page);
  assert.equal(pagerRoundTrip.current, '1', 'Native Previous did not return to page 1.');

  const openLink = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first();
  const openHref = await openLink.getAttribute('href');
  assert.match(openHref || '', /view=entry/, 'Native Open/entry link is missing from the Operations column.');
  await Promise.all([
    page.waitForURL(/view=entry/, { timeout: 30000 }),
    openLink.click(),
  ]);
  const openedUrl = page.url();
  assert.match(openedUrl, /view=entry/, 'Native entry-open navigation did not reach Entry Detail.');

  evidence = {
    ...evidence,
    execution_status: 'PASS',
    sorting: {
      column_id: 'date_created',
      first_direction: sortFirst,
      second_direction: sortSecond,
      first_row_ids: sortRowsFirst,
      second_row_ids: sortRowsSecond,
    },
    search: { query: 'HDR-A-000', matched_row_ids: searched, expected_entry_id: firstAddedId },
    row_values: {
      student_name: studentText,
      national_id: nationalText,
      school_grade: schoolGradeText,
      date_created_display: dateText,
      date_created_raw: embeddedRow.date_created,
      directions: textDirections,
    },
    pagination: { page_1: pagerBefore, page_2: pagerPage2, round_trip: pagerRoundTrip },
    entry_open: { href: openHref, opened_url: openedUrl },
  };

  console.log('INBOX_TABLE_HEADER_RUNTIME_PASS');
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  cleanupScopedInbox(scoped);
}
