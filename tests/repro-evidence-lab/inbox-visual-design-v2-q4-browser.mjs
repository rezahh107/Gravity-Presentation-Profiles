import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, inboxUrl, assertEnv, control, login, waitForGrid, rowIds, focusInfo, focusVisible, openByEnter, pagerState, scrollState, activeElementState } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const syntheticEntryIds = new Set((fixture.entry_ids || []).map(Number));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const polls = [];
let phase = 'initial';
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

async function state() {
  return {
    pager: await pagerState(page),
    visible_row_ids: await rowIds(page),
    focused: await activeElementState(page),
    scroll: await scrollState(page),
    native_grid_count: await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').count(),
    pager_count: await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').count(),
    search_count: await page.locator('[data-js="gflow-inbox-search"]').count(),
    grid_marker: await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').getAttribute('data-ivd2-grid-marker'),
  };
}

function all(flags) { return Object.values(flags).every(Boolean); }
let out = { contract: 'Q4_PAGE2_POLL_FOCUS', execution_status: 'CAPTURED' };
let failed = false;
try {
  await login(page);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);
  const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
  if (await next.evaluate(el => el.classList.contains('ag-disabled'))) throw new Error('Q4 requires at least two native pages.');
  await next.click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2', null, { timeout: 10000 });
  await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').evaluate(el => { el.dataset.ivd2GridMarker = 'q4-page2-grid'; });
  const initialLink = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first();
  const initialFocus = await focusInfo(initialLink);
  const before = await state();
  const updateId = before.visible_row_ids.find(id => syntheticEntryIds.has(Number(id)));
  if (!updateId) throw new Error('Page 2 contains no WU21 synthetic row suitable for bounded update qualification.');

  phase = 'update';
  control('q4-update', { IVD2_ENTRY_ID: String(updateId) });
  const updatePoll = await waitPoll(updateId);
  await page.waitForTimeout(300);
  const afterUpdate = await state();

  phase = 'add';
  const addedId = Number(control('q4-add'));
  const addPoll = await waitPoll(addedId);
  await page.waitForTimeout(300);
  const afterAdd = await state();

  phase = 'remove';
  control('q4-remove');
  const removePoll = await waitPoll(addedId);
  await page.waitForTimeout(300);
  const afterRemove = await state();

  const navigation = await openByEnter(page, page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first());
  const focusPreserved = afterUpdate.focused?.href === before.focused?.href && afterUpdate.focused?.row_id === before.focused?.row_id;
  const flags = {
    page_state_remains_two: [before, afterUpdate, afterAdd, afterRemove].every(item => item.pager.current === '2'),
    one_native_pager: [before, afterUpdate, afterAdd, afterRemove].every(item => item.pager_count === 1),
    one_native_grid: [before, afterUpdate, afterAdd, afterRemove].every(item => item.native_grid_count === 1),
    one_native_search: [before, afterUpdate, afterAdd, afterRemove].every(item => item.search_count === 1),
    same_native_grid: [afterUpdate, afterAdd, afterRemove].every(item => item.grid_marker === 'q4-page2-grid'),
    update_observed: updatePoll.status === 200,
    add_observed: addPoll.status === 200,
    remove_observed: removePoll.status === 200,
    native_open_after_poll: /view=entry/.test(navigation.url),
    initial_focus_visible: focusVisible(initialFocus),
  };
  out = {
    ...out,
    status: all(flags) ? 'PASS' : 'FAIL',
    evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    flags,
    focus_disposition: focusPreserved ? 'PRESERVED' : 'BOUNDED_NATIVE_FOCUS_CHANGE',
    before,
    after_update: afterUpdate,
    after_add: afterAdd,
    after_remove: afterRemove,
    mutation_ids: { updated_entry_id: updateId, added_then_removed_entry_id: addedId },
    native_open_after_poll: navigation,
    polling_statuses: { update: updatePoll.status, add: addPoll.status, remove: removePoll.status },
  };
} catch (error) {
  failed = true;
  out = { ...out, execution_status: 'ERROR', error: String(error?.stack || error).slice(0, 12000) };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-q4-error.png'), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q4.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q4-polling.json'), JSON.stringify(polls, null, 2) + '\n');
  await browser.close();
}
if (failed) process.exit(1);
