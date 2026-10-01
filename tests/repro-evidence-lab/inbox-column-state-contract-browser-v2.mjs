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

const studentId = String(alpha.first_name_field_id);
const nationalId = String(alpha.national_id_field_id);
const schoolId = String(alpha.school_field_id);
const ownerRightToLeftIds = ['id', studentId, nationalId, schoolId, 'date_created'];
const expectedFreshPhysicalIds = [...ownerRightToLeftIds].reverse();
const stalePhysicalIds = ['id', 'date_created', schoolId, nationalId, studentId];
const unrelatedLocalKey = 'wu21-unrelated-grid-state';
const unrelatedSessionKey = 'wu21-unrelated-session-state';
const evidencePath = path.join(artifactDir, 'inbox-column-state-contract-evidence.json');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
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
    if (is_wp_error($entry_id)) throw new RuntimeException($entry_id->get_error_message());
    GFAPI::update_entry_property($entry_id, 'date_created', gmdate('Y-m-d H:i:s', strtotime('2026-03-01 00:00:00 UTC') + $i));
    (new Gravity_Flow_API($form_id))->process_workflow($entry_id);
    $entry_ids[] = (int) $entry_id;
}
$page_id = wp_insert_post(array(
    'post_title' => 'WU21 SRWF Column State Inbox',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $form_id . '"]',
), true);
if (is_wp_error($page_id)) throw new RuntimeException($page_id->get_error_message());
echo wp_json_encode(array('page_id' => (int) $page_id, 'url' => get_permalink($page_id), 'entry_ids' => $entry_ids));
  `);
  const decoded = JSON.parse(result);
  if (!decoded?.page_id || !decoded?.url || !Array.isArray(decoded.entry_ids)) throw new Error(`Invalid setup result ${result}`);
  return decoded;
}

function cleanupScopedInbox(setup) {
  if (!setup) return;
  const ids = JSON.stringify((setup.entry_ids || []).map(Number));
  wpEval(`foreach (json_decode('${ids}', true) as $entry_id) GFAPI::delete_entry((int)$entry_id); wp_delete_post(${Number(setup.page_id)}, true);`);
}

async function waitForRows(page) {
  await waitForGrid(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 15000 });
}

async function visibleHeaders(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(cells => cells
    .filter(cell => {
      const rect = cell.getBoundingClientRect();
      const style = getComputedStyle(cell);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(cell => ({ col_id: cell.getAttribute('col-id'), x: cell.getBoundingClientRect().x })));
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

async function clearExactHostState(page, gridId) {
  await page.evaluate(id => {
    localStorage.removeItem(id);
    sessionStorage.removeItem(id);
  }, gridId);
}

async function exactHostState(page, gridId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = await page.evaluate(id => ({ local: localStorage.getItem(id), session: sessionStorage.getItem(id) }), gridId);
    const matches = Object.entries(found).filter(([, raw]) => typeof raw === 'string' && raw.length > 0);
    if (matches.length === 1) {
      const [area, raw] = matches[0];
      const parsed = JSON.parse(raw);
      assert.ok(Array.isArray(parsed), 'Persisted native Grid state is not a getColumnState() array.');
      return { area, raw, parsed };
    }
    if (matches.length > 1) throw new Error(`Grid state exists in more than one storage area for ${gridId}.`);
    await page.waitForTimeout(100);
  }
  throw new Error(`Exact native Grid state was not persisted under runtime Grid ID ${gridId}.`);
}

function staleStateFromAuthenticState(state) {
  const byId = new Map(state.map(item => [String(item.colId), item]));
  for (const id of stalePhysicalIds) assert.ok(byId.has(id), `Authentic state is missing ${id}.`);
  const stale = stalePhysicalIds.map(id => byId.get(id));
  for (const item of state) if (!stalePhysicalIds.includes(String(item.colId))) stale.push(item);
  return stale;
}

async function writeExactState(page, area, gridId, state) {
  await page.evaluate(({ storageArea, key, value }) => {
    const storage = storageArea === 'local' ? localStorage : sessionStorage;
    storage.setItem(key, value);
  }, { storageArea: area, key: gridId, value: JSON.stringify(state) });
}

async function persistedSort(page, area, gridId, colId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const raw = await page.evaluate(({ storageArea, key }) => (storageArea === 'local' ? localStorage : sessionStorage).getItem(key), { storageArea: area, key: gridId });
    if (raw) {
      const item = JSON.parse(raw).find(state => String(state.colId) === colId);
      if (item?.sort === 'asc' || item?.sort === 'desc') return item.sort;
    }
    await page.waitForTimeout(100);
  }
  return null;
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
  const activeGridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  assert.ok(activeGridId, 'Native runtime Grid ID is unavailable.');
  const initialHeaders = await visibleHeaders(page);
  assert.deepEqual(physicalIds(initialHeaders), expectedFreshPhysicalIds, 'Fresh physical order differs from PR #111 contract.');
  assert.deepEqual(rightToLeftIds(initialHeaders), ownerRightToLeftIds, 'Fresh visible RTL order differs from Owner contract.');

  // Capture the host-owned persistence shape without calling a private callback.
  // We clear only the exact runtime Grid ID, then exercise genuine native Search.
  // Gravity Flow 3.1.0's onModelUpdated handler must recreate its own exact key,
  // storage area and getColumnState() JSON representation.
  await clearExactHostState(page, activeGridId);
  const storageBeforePersistence = await storageSnapshot(page);
  const persistenceSearchMatches = await nativeSearch(page, 'STATE-A-000');
  assert.equal(persistenceSearchMatches.includes(Number(scoped.entry_ids[0])), true, 'Native Search did not reach the scoped synthetic row while creating host state.');
  await nativeSearch(page, '');
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20, null, { timeout: 10000 });
  const authentic = await exactHostState(page, activeGridId);
  for (const id of ownerRightToLeftIds) assert.ok(authentic.parsed.some(item => String(item.colId) === id), `Native state lacks ${id}.`);

  const staleState = staleStateFromAuthenticState(authentic.parsed);
  await writeExactState(page, authentic.area, activeGridId, staleState);
  const beforeReload = await storageSnapshot(page);
  assert.equal(beforeReload[authentic.area][activeGridId], JSON.stringify(staleState), 'Stale state is not present before Grid re-initialization.');

  evidence = {
    ...evidence,
    execution_status: 'CAPTURED_STALE_STATE',
    route: { page_id: Number(scoped.page_id), form_id: Number(alpha.form_id), url: rtlUrl.toString() },
    grid_id: activeGridId,
    expected: { owner_right_to_left_ids: ownerRightToLeftIds, fresh_physical_ids: expectedFreshPhysicalIds, stale_physical_ids: stalePhysicalIds },
    authentic_persistence: {
      trigger: 'native_search_model_update',
      storage_area: authentic.area,
      storage_key: activeGridId,
      storage_before: storageBeforePersistence,
      captured_state: authentic.parsed,
    },
    stale_state_fixture: { source: 'reordered_authentic_getColumnState_objects', persisted_state_before_reload: staleState },
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`INBOX_COLUMN_STATE_STALE_FIXTURE ${JSON.stringify({ grid_id: activeGridId, storage_area: authentic.area, stale_state_ids: staleState.map(item => String(item.colId)) })}`);

  // Pre-fix regression: #111 must fail here because Gravity Flow accepts the
  // same colId set and reorders persisted state with id first before applyOrder.
  await page.reload({ waitUntil: 'networkidle' });
  await waitForRows(page);
  const upgradedHeaders = await visibleHeaders(page);
  const upgradedPhysical = physicalIds(upgradedHeaders);
  const upgradedRtl = rightToLeftIds(upgradedHeaders);
  const upgradedRows = await rowPhysicalIds(page);
  const storageAfterUpgrade = await storageSnapshot(page);
  evidence.first_upgrade_load = { physical_ids: upgradedPhysical, right_to_left_ids: upgradedRtl, first_row_physical_ids: upgradedRows, storage_after: storageAfterUpgrade };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');

  assert.deepEqual(upgradedPhysical, expectedFreshPhysicalIds, 'Stale native persisted column order overrode the current GPP physical column contract.');
  assert.deepEqual(upgradedRtl, ownerRightToLeftIds, 'First stale-state upgrade load did not resolve to Owner RTL order.');
  assert.deepEqual(upgradedRows, upgradedPhysical, 'Header and row colId order diverged.');
  assert.equal(storageAfterUpgrade.local[unrelatedLocalKey], 'keep-local', 'Unrelated localStorage entry was modified.');
  assert.equal(storageAfterUpgrade.session[unrelatedSessionKey], 'keep-session', 'Unrelated sessionStorage entry was modified.');

  // Compatible native state must survive the order repair. Sorting is a host-
  // owned state property and does not depend on pointer geometry.
  const dateHeader = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first();
  await dateHeader.click();
  await page.waitForTimeout(300);
  const sortDirection = await dateHeader.getAttribute('aria-sort');
  assert.ok(['ascending', 'descending'].includes(sortDirection), `Native sort did not activate: ${sortDirection}`);
  const persistedSortDirection = await persistedSort(page, authentic.area, activeGridId, 'date_created');
  assert.ok(['asc', 'desc'].includes(persistedSortDirection), 'Native persisted column state did not retain date sort.');

  const firstAddedId = Number(scoped.entry_ids[0]);
  const searchMatches = await nativeSearch(page, 'STATE-A-000');
  assert.equal(searchMatches.includes(firstAddedId), true, 'Native search failed after migration.');
  await nativeSearch(page, '');
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20, null, { timeout: 10000 });

  const pagerBefore = await pagerState(page);
  assert.equal(pagerBefore.current, '1');
  assert.equal(pagerBefore.next_disabled, false);
  await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2', null, { timeout: 10000 });
  const pagerPage2 = await pagerState(page);
  await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1', null, { timeout: 10000 });
  const pagerRoundTrip = await pagerState(page);

  // A second initialization must retain the presentation contract while keeping
  // the compatible native sort state. This catches repairs that merely clear a
  // stale key once even though Gravity Flow re-applies id-first persisted order.
  await page.reload({ waitUntil: 'networkidle' });
  await waitForRows(page);
  const secondHeaders = await visibleHeaders(page);
  assert.deepEqual(physicalIds(secondHeaders), expectedFreshPhysicalIds, 'Second reload restored invalid physical order.');
  assert.deepEqual(rightToLeftIds(secondHeaders), ownerRightToLeftIds, 'Second reload lost Owner RTL order.');
  const secondSort = await page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first().getAttribute('aria-sort');
  assert.equal(secondSort, sortDirection, 'Compatible native sort did not persist across second reload.');

  const secondStorage = await storageSnapshot(page);
  assert.equal(secondStorage.local[unrelatedLocalKey], 'keep-local');
  assert.equal(secondStorage.session[unrelatedSessionKey], 'keep-session');

  const openLink = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first();
  const openHref = await openLink.getAttribute('href');
  assert.match(openHref || '', /view=entry/, 'Native entry-open link is missing after migration.');

  cleanBrowser = await chromium.launch({ headless: true });
  const cleanPage = await cleanBrowser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(cleanPage);
  const cleanBefore = await storageSnapshot(cleanPage);
  assert.equal(Object.prototype.hasOwnProperty.call(cleanBefore.local, activeGridId), false, 'Clean browser unexpectedly has target Grid state.');
  assert.equal(Object.prototype.hasOwnProperty.call(cleanBefore.session, activeGridId), false, 'Clean browser unexpectedly has target session Grid state.');
  await cleanPage.goto(rtlUrl.toString(), { waitUntil: 'networkidle' });
  await waitForRows(cleanPage);
  const cleanHeaders = await visibleHeaders(cleanPage);
  assert.deepEqual(physicalIds(cleanHeaders), expectedFreshPhysicalIds, 'Clean first-load physical order is incorrect.');
  assert.deepEqual(rightToLeftIds(cleanHeaders), ownerRightToLeftIds, 'Clean first-load RTL order is incorrect.');

  evidence = {
    ...evidence,
    execution_status: 'PASS',
    compatible_user_state: { kind: 'native_date_sort', aria_sort: sortDirection, persisted_sort: persistedSortDirection, aria_sort_after_second_reload: secondSort },
    search: { query: 'STATE-A-000', expected_entry_id: firstAddedId, matched_row_ids: searchMatches },
    pagination: { page_1: pagerBefore, page_2: pagerPage2, round_trip: pagerRoundTrip },
    entry_open: { href: openHref },
    second_reload: { physical_ids: physicalIds(secondHeaders), right_to_left_ids: rightToLeftIds(secondHeaders) },
    clean_browser_first_load: { storage_before: cleanBefore, physical_ids: physicalIds(cleanHeaders), right_to_left_ids: rightToLeftIds(cleanHeaders) },
  };
  console.log('INBOX_COLUMN_STATE_CONTRACT_RUNTIME_PASS');
} finally {
  if (cleanBrowser) await cleanBrowser.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  cleanupScopedInbox(scoped);
}
