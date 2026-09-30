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
if (!alpha?.form_id) throw new Error('INBOX_COLUMN_STATE_RUNTIME_FAILURE: alpha form fixture is unavailable.');

const ownerRightToLeftIds = [
  'id',
  String(alpha.first_name_field_id),
  String(alpha.national_id_field_id),
  String(alpha.school_field_id),
  'date_created',
];
const expectedFreshPhysicalIds = [...ownerRightToLeftIds].reverse();
const stalePhysicalIds = [
  'id',
  'date_created',
  String(alpha.school_field_id),
  String(alpha.national_id_field_id),
  String(alpha.first_name_field_id),
];
const markerPrefix = 'gpp:srwf-inbox-column-contract:';
const unrelatedLocalKey = 'wu21-unrelated-grid-state';
const unrelatedSessionKey = 'wu21-unrelated-session-state';
const evidencePath = path.join(artifactDir, 'inbox-column-state-contract-evidence.json');

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
        (string) $first => sprintf('State First %02d', $i),
        (string) $last => sprintf('State Last %02d', $i),
        (string) $national => sprintf('STATE-A-%03d', $i),
        (string) $grade => sprintf('پایه حالت %02d', $i),
        (string) $school => sprintf('مدرسه حالت %02d', $i),
        (string) $photo => '',
    );
    $entry_id = GFAPI::add_entry($entry);
    if (is_wp_error($entry_id)) { throw new RuntimeException($entry_id->get_error_message()); }
    GFAPI::update_entry_property($entry_id, 'date_created', gmdate('Y-m-d H:i:s', strtotime('2026-03-01 00:00:00 UTC') + $i));
    $api = new Gravity_Flow_API($form_id);
    $api->process_workflow($entry_id);
    $entry_ids[] = (int) $entry_id;
}
$page_id = wp_insert_post(array(
    'post_title' => 'WU21 SRWF Column State Inbox',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $form_id . '"]',
), true);
if (is_wp_error($page_id)) { throw new RuntimeException($page_id->get_error_message()); }
echo wp_json_encode(array('page_id' => (int) $page_id, 'url' => get_permalink($page_id), 'entry_ids' => $entry_ids));
  `);
  const decoded = JSON.parse(result);
  if (!decoded?.page_id || !decoded?.url || !Array.isArray(decoded.entry_ids)) {
    throw new Error(`INBOX_COLUMN_STATE_RUNTIME_FAILURE: invalid setup result ${result}`);
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

async function gridId(page) {
  return page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
}

async function visibleHeaders(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(cells => cells
    .filter(cell => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(cell => {
      const rect = cell.getBoundingClientRect();
      return {
        col_id: cell.getAttribute('col-id'),
        x: rect.x,
        width: rect.width,
      };
    }));
}

function physicalIds(headers) {
  return [...headers].sort((a, b) => a.x - b.x).map(item => item.col_id);
}

function rightToLeftIds(headers) {
  return [...headers].sort((a, b) => b.x - a.x).map(item => item.col_id);
}

async function rowPhysicalIds(page) {
  const cells = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().locator('.ag-cell').evaluateAll(nodes => nodes
    .filter(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(node => ({ col_id: node.getAttribute('col-id'), x: node.getBoundingClientRect().x })));
  return [...cells].sort((a, b) => a.x - b.x).map(item => item.col_id);
}

async function storageSnapshot(page) {
  return page.evaluate(() => {
    const read = storage => {
      const out = {};
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        out[key] = storage.getItem(key);
      }
      return out;
    };
    return { local: read(localStorage), session: read(sessionStorage) };
  });
}

function changedKeys(before, after) {
  const out = [];
  for (const area of ['local', 'session']) {
    const keys = new Set([...Object.keys(before[area] || {}), ...Object.keys(after[area] || {})]);
    for (const key of keys) {
      if ((before[area] || {})[key] !== (after[area] || {})[key]) out.push({ area, key });
    }
  }
  return out;
}

async function dragHeaderBefore(page, sourceId, targetId) {
  const source = page.locator(`[data-js="gflow-inbox"] .ag-header-cell[col-id="${sourceId}"]`).first();
  const target = page.locator(`[data-js="gflow-inbox"] .ag-header-cell[col-id="${targetId}"]`).first();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Unable to resolve native header drag geometry.');

  await page.mouse.move(sourceBox.x + (sourceBox.width / 2), sourceBox.y + (sourceBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + (sourceBox.width / 2) - 20, sourceBox.y + (sourceBox.height / 2), { steps: 4 });
  await page.mouse.move(targetBox.x + 3, targetBox.y + (targetBox.height / 2), { steps: 14 });
  await page.waitForTimeout(350);
  await page.mouse.up();
}

async function waitForPhysicalOrder(page, expected) {
  await page.waitForFunction(expectedIds => {
    const cells = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell')]
      .filter(cell => {
        const rect = cell.getBoundingClientRect();
        const style = getComputedStyle(cell);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(cell => ({ id: cell.getAttribute('col-id'), x: cell.getBoundingClientRect().x }))
      .sort((a, b) => a.x - b.x)
      .map(item => item.id);
    return JSON.stringify(cells) === JSON.stringify(expectedIds);
  }, expected, { timeout: 10000 });
}

async function resizeColumn(page, columnId, delta) {
  const header = page.locator(`[data-js="gflow-inbox"] .ag-header-cell[col-id="${columnId}"]`).first();
  const resize = header.locator('.ag-header-cell-resize').first();
  const before = await header.boundingBox();
  const box = await resize.boundingBox();
  if (!before || !box) throw new Error('Native AG Grid resize handle is unavailable.');
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + delta, box.y + (box.height / 2), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await header.boundingBox();
  if (!after) throw new Error('Header disappeared after native resize.');
  assert.ok(Math.abs(after.width - before.width) >= Math.min(20, Math.abs(delta) / 2), 'Native width change did not take effect.');
  return { before: before.width, after: after.width };
}

let browser = null;
let cleanBrowser = null;
let scoped = null;
let evidence = { contract: 'SRWF_INBOX_COLUMN_STATE_CONTRACT_V1', execution_status: 'ERROR' };

try {
  scoped = setupScopedInbox();
  const rtlUrl = new URL(scoped.url);
  rtlUrl.searchParams.set('wu21_header_rtl_probe', '1');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  await page.evaluate(({ localKey, sessionKey }) => {
    localStorage.setItem(localKey, 'keep-local');
    sessionStorage.setItem(sessionKey, 'keep-session');
  }, { localKey: unrelatedLocalKey, sessionKey: unrelatedSessionKey });

  await page.goto(rtlUrl.toString(), { waitUntil: 'networkidle' });
  await waitForRows(page);

  const activeGridId = await gridId(page);
  assert.ok(activeGridId, 'Native Gravity Flow Grid ID is unavailable.');
  const initialHeaders = await visibleHeaders(page);
  assert.deepEqual(physicalIds(initialHeaders), expectedFreshPhysicalIds, 'Fresh physical order does not match the approved PR #111 contract.');
  assert.deepEqual(rightToLeftIds(initialHeaders), ownerRightToLeftIds, 'Fresh visible RTL order does not match the Owner contract.');

  const storageBeforeDrag = await storageSnapshot(page);
  await dragHeaderBefore(page, 'id', 'date_created');
  await waitForPhysicalOrder(page, stalePhysicalIds);

  let storageAfterDrag = await storageSnapshot(page);
  let mutations = changedKeys(storageBeforeDrag, storageAfterDrag);
  for (let attempt = 0; attempt < 20 && !mutations.some(item => item.key.includes(activeGridId)); attempt += 1) {
    await page.waitForTimeout(150);
    storageAfterDrag = await storageSnapshot(page);
    mutations = changedKeys(storageBeforeDrag, storageAfterDrag);
  }

  const hostStateMutations = mutations.filter(item => item.key.includes(activeGridId));
  assert.equal(hostStateMutations.length, 1, `Expected one native persisted Grid state record for ${activeGridId}; observed ${JSON.stringify(mutations)}.`);
  const hostState = hostStateMutations[0];
  const stalePersistedValue = storageAfterDrag[hostState.area][hostState.key];
  assert.ok(typeof stalePersistedValue === 'string' && stalePersistedValue.length > 0, 'Native stale persisted Grid state was not captured.');

  evidence = {
    ...evidence,
    execution_status: 'CAPTURED_STALE_STATE',
    route: { page_id: Number(scoped.page_id), form_id: Number(alpha.form_id), url: rtlUrl.toString() },
    grid_id: activeGridId,
    expected: {
      owner_right_to_left_ids: ownerRightToLeftIds,
      fresh_physical_ids: expectedFreshPhysicalIds,
      stale_physical_ids: stalePhysicalIds,
    },
    stale_state_creation: {
      mechanism: 'native_ag_grid_header_drag',
      storage_before: storageBeforeDrag,
      storage_after: storageAfterDrag,
      changed_keys: mutations,
      host_state: { area: hostState.area, key: hostState.key, value: stalePersistedValue },
    },
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`INBOX_COLUMN_STATE_STALE_FIXTURE ${JSON.stringify({ grid_id: activeGridId, host_state: hostState, stale_physical_ids: stalePhysicalIds })}`);

  // The second Grid initialization begins with the exact stale native record
  // already present. Pre-fix code must fail here; the root repair must make this
  // reload resolve to the current GPP column contract without manual clearing.
  await page.reload({ waitUntil: 'networkidle' });
  await waitForRows(page);
  const firstUpgradeHeaders = await visibleHeaders(page);
  const firstUpgradePhysical = physicalIds(firstUpgradeHeaders);
  const firstUpgradeRtl = rightToLeftIds(firstUpgradeHeaders);
  const firstUpgradeRows = await rowPhysicalIds(page);
  const storageAfterMigration = await storageSnapshot(page);

  evidence.first_upgrade_load = {
    physical_ids: firstUpgradePhysical,
    right_to_left_ids: firstUpgradeRtl,
    first_row_physical_ids: firstUpgradeRows,
    storage_after: storageAfterMigration,
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');

  assert.deepEqual(firstUpgradePhysical, expectedFreshPhysicalIds, 'Stale native persisted column order overrode the current GPP physical column contract.');
  assert.deepEqual(firstUpgradeRtl, ownerRightToLeftIds, 'First stale-state upgrade load did not resolve to the Owner-required visible RTL order.');
  assert.deepEqual(firstUpgradeRows, firstUpgradePhysical, 'Header and first rendered row are not aligned by identical colId order.');

  const markerKey = Object.keys(storageAfterMigration.local).find(key => key === `${markerPrefix}${activeGridId}`);
  assert.ok(markerKey, 'GPP column-contract marker was not recorded for the exact active Grid ID.');
  assert.equal(storageAfterMigration.local[unrelatedLocalKey], 'keep-local', 'Unrelated localStorage entry was modified.');
  assert.equal(storageAfterMigration.session[unrelatedSessionKey], 'keep-session', 'Unrelated sessionStorage entry was modified.');

  const widthState = await resizeColumn(page, String(alpha.national_id_field_id), 48);
  const postWidthStorage = await storageSnapshot(page);
  assert.notEqual(postWidthStorage[hostState.area][hostState.key], null, 'Native host state disappeared after a compatible width change.');

  const dateHeader = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first();
  await dateHeader.click();
  await page.waitForTimeout(250);
  const sortDirection = await dateHeader.getAttribute('aria-sort');
  assert.ok(['ascending', 'descending'].includes(sortDirection), `Native sort did not activate: ${sortDirection}`);

  const firstAddedId = Number(scoped.entry_ids[0]);
  const searchMatches = await nativeSearch(page, 'STATE-A-000');
  assert.equal(searchMatches.includes(firstAddedId), true, 'Native search did not retain the expected scoped row after migration.');
  await nativeSearch(page, '');
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20, null, { timeout: 10000 });

  const pagerBefore = await pagerState(page);
  assert.equal(pagerBefore.current, '1', 'Migrated Inbox did not begin on native page 1.');
  assert.equal(pagerBefore.next_disabled, false, 'Migrated fixture must expose native page 2.');
  await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2', null, { timeout: 10000 });
  const pagerPage2 = await pagerState(page);
  await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1', null, { timeout: 10000 });
  const pagerRoundTrip = await pagerState(page);

  // A current marker must prevent a second invalidation. The compatible native
  // width change is our durable witness: if GPP clears the host state again,
  // the width returns to the default on reload.
  await page.reload({ waitUntil: 'networkidle' });
  await waitForRows(page);
  const secondReloadHeaders = await visibleHeaders(page);
  const secondReloadNational = secondReloadHeaders.find(item => item.col_id === String(alpha.national_id_field_id));
  assert.ok(secondReloadNational, 'National-ID header is unavailable after second reload.');
  assert.ok(Math.abs(secondReloadNational.width - widthState.after) <= 3, `Compatible native width did not persist across second reload (${widthState.after} -> ${secondReloadNational.width}).`);
  assert.deepEqual(rightToLeftIds(secondReloadHeaders), ownerRightToLeftIds, 'Second reload lost the current visible RTL column contract.');

  const secondReloadStorage = await storageSnapshot(page);
  assert.equal(secondReloadStorage.local[markerKey], storageAfterMigration.local[markerKey], 'Current GPP contract marker changed unexpectedly on second reload.');
  assert.equal(secondReloadStorage.local[unrelatedLocalKey], 'keep-local', 'Unrelated localStorage entry changed on second reload.');
  assert.equal(secondReloadStorage.session[unrelatedSessionKey], 'keep-session', 'Unrelated sessionStorage entry changed on second reload.');

  const openLink = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first();
  const openHref = await openLink.getAttribute('href');
  assert.match(openHref || '', /view=entry/, 'Native entry-open link is missing after migration.');

  // Independent clean-browser path: no persisted host state and no GPP marker
  // exists before initialization. First load must render correctly without any
  // manual browser-storage operation by the user.
  cleanBrowser = await chromium.launch({ headless: true });
  const cleanPage = await cleanBrowser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(cleanPage);
  const cleanBefore = await storageSnapshot(cleanPage);
  assert.equal(Object.keys(cleanBefore.local).some(key => key.includes(activeGridId)), false, 'Clean browser unexpectedly contains target Grid storage before first load.');
  await cleanPage.goto(rtlUrl.toString(), { waitUntil: 'networkidle' });
  await waitForRows(cleanPage);
  const cleanHeaders = await visibleHeaders(cleanPage);
  assert.deepEqual(physicalIds(cleanHeaders), expectedFreshPhysicalIds, 'Clean-browser first load physical order is incorrect.');
  assert.deepEqual(rightToLeftIds(cleanHeaders), ownerRightToLeftIds, 'Clean-browser first load visible RTL order is incorrect.');

  const cleanAfter = await storageSnapshot(cleanPage);
  const cleanMarker = Object.keys(cleanAfter.local).find(key => key === `${markerPrefix}${activeGridId}`);
  assert.ok(cleanMarker, 'Clean-browser first load did not record the current GPP contract marker.');

  evidence = {
    ...evidence,
    execution_status: 'PASS',
    first_upgrade_load: {
      ...evidence.first_upgrade_load,
      marker_key: markerKey,
    },
    compatible_user_state: {
      column_id: String(alpha.national_id_field_id),
      width_before: widthState.before,
      width_after_change: widthState.after,
      width_after_second_reload: secondReloadNational.width,
    },
    sorting: { column_id: 'date_created', direction_after_click: sortDirection },
    search: { query: 'STATE-A-000', expected_entry_id: firstAddedId, matched_row_ids: searchMatches },
    pagination: { page_1: pagerBefore, page_2: pagerPage2, round_trip: pagerRoundTrip },
    entry_open: { href: openHref },
    second_reload: {
      physical_ids: physicalIds(secondReloadHeaders),
      right_to_left_ids: rightToLeftIds(secondReloadHeaders),
      marker_value: secondReloadStorage.local[markerKey],
      unrelated_local: secondReloadStorage.local[unrelatedLocalKey],
      unrelated_session: secondReloadStorage.session[unrelatedSessionKey],
    },
    clean_browser_first_load: {
      storage_before: cleanBefore,
      physical_ids: physicalIds(cleanHeaders),
      right_to_left_ids: rightToLeftIds(cleanHeaders),
      marker_key: cleanMarker,
    },
  };
  console.log('INBOX_COLUMN_STATE_CONTRACT_RUNTIME_PASS');
} finally {
  if (cleanBrowser) await cleanBrowser.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  cleanupScopedInbox(scoped);
}
