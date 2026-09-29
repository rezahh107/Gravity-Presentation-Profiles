import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, inboxUrl, assertEnv, control, login, waitForGrid, rowIds, focusInfo, focusVisible, openByEnter, pagerState, scrollState, activeElementState } from './inbox-visual-design-v2-browser-lib.mjs';
import { evaluateQ4FocusLifecycle, evaluateQ4QualificationStatus } from './inbox-visual-design-v2-contract-evaluation.mjs';

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
    viewport: page.viewportSize(),
    document_horizontal_overflow_px: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)),
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

async function mobilePagerRoundTrip(width, height) {
  await page.setViewportSize({ width, height });
  const current = page.locator('[data-js="gflow-inbox"] [ref="lbCurrent"]');
  await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1');
  const first = (await current.innerText()).trim();
  await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2');
  const second = (await current.innerText()).trim();
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  return { viewport: { width, height }, first, second, document_horizontal_overflow_px: overflow, native_pager_count: await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').count() };
}

async function mobileNativeControls(width, height) {
  await page.setViewportSize({ width, height });
  const search = page.locator('[data-js="gflow-inbox-search"]');
  const settings = page.locator('.gflow-inbox.gflow-grid.gflow-common .gflow-grid__button--settings');
  const fullscreen = page.locator('.gflow-inbox.gflow-grid.gflow-common .gflow-grid__button--fullscreen');
  const identities = { search: await search.count(), settings: await settings.count(), fullscreen: await fullscreen.count() };
  const visible = { search: await search.isVisible(), settings: await settings.isVisible(), fullscreen: await fullscreen.isVisible() };
  await search.fill('WU21 Alpha Form');
  await search.dispatchEvent('keyup');
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row')];
    return rows.length > 0 && rows.length < 20;
  });
  const filteredRows = await rowIds(page);
  await search.fill('');
  await search.dispatchEvent('keyup');
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20);
  await settings.click();
  await page.locator('.gform-flyout--inbox-settings').waitFor({ state: 'visible' });
  const settingsFlyoutVisible = await page.locator('.gform-flyout--inbox-settings').isVisible();
  await page.locator('.gform-flyout--inbox-settings .gform-flyout__close').click();
  await page.locator('.gform-flyout--inbox-settings').waitFor({ state: 'hidden' });
  await fullscreen.click();
  const fullscreenEntered = await page.locator('.gflow-inbox.gflow-grid.gflow-common').evaluate(el => el.classList.contains('gflow-grid--fullscreen'));
  await fullscreen.click();
  await page.waitForFunction(() => !document.querySelector('.gflow-inbox.gflow-grid.gflow-common')?.classList.contains('gflow-grid--fullscreen'), null, { timeout: 5000 });
  const fullscreenExited = await page.locator('.gflow-inbox.gflow-grid.gflow-common').evaluate(el => !el.classList.contains('gflow-grid--fullscreen'));
  const pager = await pagerState(page);
  const link = page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first();
  const linkFocus = await focusInfo(link);
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  return { viewport: { width, height }, identities, visible, filtered_row_ids: filteredRows, settings_flyout_visible: settingsFlyoutVisible, fullscreen_entered: fullscreenEntered, fullscreen_exited: fullscreenExited, pager, native_open_focus_visible: focusVisible(linkFocus), native_open_href: linkFocus.href, document_horizontal_overflow_px: overflow };
}

function sameRows(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function uniqueRows(ids) { return new Set(ids.map(Number)).size === ids.length; }
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
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-row-1440.png'), fullPage: true });
  const updateId = before.visible_row_ids.find(id => syntheticEntryIds.has(Number(id)));
  if (!updateId) throw new Error('Page 2 contains no WU21 synthetic row suitable for bounded update qualification.');

  phase = 'update';
  control('q4-update', { IVD2_ENTRY_ID: String(updateId) });
  const updatePoll = await waitPoll(updateId);
  await page.waitForTimeout(300);
  const afterUpdate = await state();

  await page.setViewportSize({ width: 390, height: 844 });
  phase = 'add';
  const addedId = Number(control('q4-add'));
  const addPoll = await waitPoll(addedId);
  await page.waitForTimeout(300);
  const afterAdd = await state();
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-row-390.png'), fullPage: true });

  await page.setViewportSize({ width: 320, height: 720 });
  phase = 'remove';
  control('q4-remove');
  const removePoll = await waitPoll(addedId);
  await page.waitForTimeout(300);
  const afterRemove = await state();
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-row-320.png'), fullPage: true });

  const focusEvaluation = evaluateQ4FocusLifecycle({
    before,
    after_update: afterUpdate,
    after_add: afterAdd,
    after_remove: afterRemove,
  });
  const mobilePager = [await mobilePagerRoundTrip(390, 844), await mobilePagerRoundTrip(320, 720)];
  const mobileControls = [await mobileNativeControls(390, 844), await mobileNativeControls(320, 720)];
  const navigation = await openByEnter(page, page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first());
  const states = [before, afterUpdate, afterAdd, afterRemove];
  const flags = {
    page_state_remains_two: states.every(item => item.pager.current === '2'),
    pager_state_coherent: states.every(item => item.pager.count === 1 && item.pager.previous_disabled === false),
    one_native_pager: states.every(item => item.pager_count === 1),
    one_native_grid: states.every(item => item.native_grid_count === 1),
    one_native_search: states.every(item => item.search_count === 1),
    same_native_grid: [afterUpdate, afterAdd, afterRemove].every(item => item.grid_marker === 'q4-page2-grid'),
    unique_row_identity: states.every(item => uniqueRows(item.visible_row_ids)),
    update_keeps_visible_page_rows: sameRows(before.visible_row_ids, afterUpdate.visible_row_ids) && afterUpdate.visible_row_ids.includes(Number(updateId)),
    add_remove_round_trip_restores_page_rows: sameRows(afterUpdate.visible_row_ids, afterRemove.visible_row_ids) && !afterRemove.visible_row_ids.includes(addedId),
    update_observed: updatePoll.status === 200,
    add_observed: addPoll.status === 200,
    remove_observed: removePoll.status === 200,
    native_open_after_poll: /view=entry/.test(navigation.url),
    keyboard_enter_after_poll: /view=entry/.test(navigation.url),
    initial_focus_visible: focusVisible(initialFocus),
    post_poll_open_focus_visible: focusVisible(navigation.focus),
    focus_behavior_accounted_for: focusEvaluation.acceptable,
    no_document_overflow: states.every(item => item.document_horizontal_overflow_px === 0) && mobilePager.every(item => item.document_horizontal_overflow_px === 0) && mobileControls.every(item => item.document_horizontal_overflow_px === 0),
    mobile_native_pager_round_trip: mobilePager.every(item => item.first === '1' && item.second === '2' && item.native_pager_count === 1),
    mobile_native_controls_usable: mobileControls.every(item => Object.values(item.identities).every(count => count === 1) && Object.values(item.visible).every(Boolean) && item.filtered_row_ids.length > 0 && item.settings_flyout_visible && item.fullscreen_entered && item.fullscreen_exited && item.pager.count === 1 && item.native_open_focus_visible && /view=entry/.test(item.native_open_href)),
  };
  out = {
    ...out,
    status: evaluateQ4QualificationStatus(flags),
    evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    flags,
    focus_disposition: focusEvaluation.disposition,
    focus_evidence: focusEvaluation,
    before,
    after_update: afterUpdate,
    after_add: afterAdd,
    after_remove: afterRemove,
    mutation_ids: { updated_entry_id: updateId, added_then_removed_entry_id: addedId },
    add_visibility: {
      visible_on_page_2_after_add: afterAdd.visible_row_ids.includes(addedId),
      page_2_row_count_before: before.visible_row_ids.length,
      page_2_row_count_after_add: afterAdd.visible_row_ids.length,
    },
    mobile_native_pager: mobilePager,
    mobile_native_controls: mobileControls,
    native_open_after_poll: navigation,
    polling_statuses: { update: updatePoll.status, add: addPoll.status, remove: removePoll.status },
  };
} catch (error) {
  failed = true;
  out = { ...out, execution_status: 'ERROR', error: String(error?.stack || error).slice(0, 12000) };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-q4-error.png'), fullPage: true }).catch(() => {});
} finally {
  try { control('q4-restore'); } catch (error) {
    failed = true;
    out = { ...out, execution_status: 'ERROR', restore_error: String(error?.stack || error).slice(0, 12000) };
  }
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q4.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q4-polling.json'), JSON.stringify(polls, null, 2) + '\n');
  await browser.close();
}
if (failed) process.exit(1);
