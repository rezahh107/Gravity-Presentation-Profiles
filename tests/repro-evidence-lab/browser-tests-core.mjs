import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runWu17BrowserTests } from './wu17-browser-tests.mjs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const results = [];
let wu17Results = [];
const browserDiagnostics = { console: [], page_errors: [], request_failures: [] };
const pollingDiagnostics = { requests: [], responses: [] };
let pollingPhase = 'pre_browser_005';

function bounded(value, max = 1200) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
function record(id, name, status, details = null) {
  results.push({ id, name, status, details });
}
function isPollingUrl(url) {
  return String(url).includes('/wp-json/gravityflow/internal/inbox/changes');
}
function parsePollingFormData(raw) {
  const text = String(raw ?? '');
  const scalar = name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`name="${escaped}"\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n--|$)`));
    return match ? match[1] : null;
  };
  const currentIds = [];
  const currentIdRe = /name="current_ids(?:\[(?:\d+)\])?"\r?\n\r?\n([\s\S]*?)(?=\r?\n--|$)/g;
  let match;
  while ((match = currentIdRe.exec(text)) !== null) currentIds.push(match[1]);
  const token = scalar('gflow_access_token');
  const searchArgsRaw = scalar('search_args');
  let searchArgs = searchArgsRaw;
  if (searchArgsRaw) {
    try { searchArgs = JSON.parse(searchArgsRaw); } catch {}
  }
  return {
    gflow_access_token: token ? 'present/redacted' : null,
    current_ids: currentIds,
    search_args: searchArgs,
    raw_length: text.length,
  };
}
async function pageSnapshot(page) {
  const nativeTarget = page.locator('[data-js="gflow-inbox"]');
  const nativeWrapper = page.locator('.gflow-inbox.gflow-grid.gflow-common');
  const adminNoticeText = await page.locator('.wrap, #wpbody-content').first().innerText().catch(() => '');
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    native_target_count: await nativeTarget.count().catch(() => -1),
    native_wrapper_count: await nativeWrapper.count().catch(() => -1),
    ag_root_wrapper_count: await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').count().catch(() => -1),
    card_column_count: await page.locator('[col-id="gpp_case_card"]').count().catch(() => -1),
    admin_text_excerpt: bounded(adminNoticeText),
    console: browserDiagnostics.console.slice(-20),
    page_errors: browserDiagnostics.page_errors.slice(-20),
    request_failures: browserDiagnostics.request_failures.slice(-20),
  };
}
async function test(page, id, name, fn) {
  try {
    record(id, name, 'PASS', await fn());
  } catch (e) {
    record(id, name, 'FAIL', {
      error: bounded(e?.stack || e, 5000),
      diagnostic: await pageSnapshot(page),
    });
  }
}
function wpControl(action) {
  const env = { ...process.env, WU21_CONTROL: action };
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/runtime-control.php')], { env, encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`WP control ${action} failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
async function waitForRows(page, count, timeout = 15000) {
  await page.waitForFunction(
    expected => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === expected,
    count,
    { timeout },
  );
}
async function findSortableHeader(page) {
  const headers = page.locator('[data-js="gflow-inbox"] .ag-header-cell');
  const count = await headers.count();
  for (let i = 0; i < count; i += 1) {
    const header = headers.nth(i);
    if (!(await header.isVisible().catch(() => false))) continue;
    const colId = await header.getAttribute('col-id');
    if (colId === 'gpp_case_card') throw new Error('Superseded gpp_case_card header is still rendered.');
    await header.click();
    await page.waitForTimeout(250);
    const ariaSort = await header.getAttribute('aria-sort');
    if (ariaSort && ariaSort !== 'none') return { header, colId, first: ariaSort };
  }
  throw new Error('No native sortable AG Grid header could be exercised.');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => browserDiagnostics.console.push({ type: msg.type(), text: bounded(msg.text()) }));
page.on('pageerror', error => browserDiagnostics.page_errors.push(bounded(error?.stack || error, 3000)));
page.on('requestfailed', request => browserDiagnostics.request_failures.push({
  method: request.method(),
  url: bounded(request.url(), 800),
  error: bounded(request.failure()?.errorText || 'unknown'),
}));
page.on('request', request => {
  if (!isPollingUrl(request.url())) return;
  pollingDiagnostics.requests.push({
    observed_at_utc: new Date().toISOString(),
    phase: pollingPhase,
    url: request.url(),
    method: request.method(),
    content_type: request.headers()['content-type'] || null,
    payload: parsePollingFormData(request.postData()),
  });
});
page.on('response', async response => {
  if (!isPollingUrl(response.url())) return;
  let body = null;
  try { body = bounded(await response.text(), 12000); } catch (error) { body = `UNAVAILABLE: ${bounded(error?.message || error, 1000)}`; }
  pollingDiagnostics.responses.push({
    observed_at_utc: new Date().toISOString(),
    phase: pollingPhase,
    url: response.url(),
    status: response.status(),
    status_text: response.statusText(),
    content_type: response.headers()['content-type'] || null,
    body,
  });
});

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;

  await test(page, 'WU21-BROWSER-001', 'native AG Grid Inbox renders synthetic tasks without a replacement Card Mode', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
    const wrappers = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
    const rows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
    const cards = await page.locator('.gpp-inbox-card, [col-id="gpp_case_card"]').count();
    const replacements = await page.locator('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').count();
    if (wrappers !== 1) throw new Error(`Expected one native Inbox wrapper, got ${wrappers}`);
    if (rows < 1) throw new Error('No visible native AG Grid rows.');
    if (cards !== 0 || replacements !== 0) throw new Error(`Superseded replacement presentation leaked: cards=${cards}, replacement=${replacements}`);
    return { wrappers, visible_rows: rows, card_mode_nodes: cards, replacement_widgets: replacements };
  });

  if (results[0]?.status === 'PASS') {
    await test(page, 'WU21-BROWSER-002', 'native quick search executes populated → no-result → clear with visible focus', async () => {
      const search = page.locator('[data-js="gflow-inbox-search"]');
      await search.click();
      const focus = await search.evaluate(element => {
        const style = getComputedStyle(element);
        return { active: element === document.activeElement, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      if (!focus.active || focus.outlineStyle === 'none' || parseFloat(focus.outlineWidth) <= 0) throw new Error(`Search focus indicator is not visible: ${JSON.stringify(focus)}`);

      await search.fill('00:24:00');
      await search.dispatchEvent('keyup');
      await waitForRows(page, 1);
      const text = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().innerText();
      if (!text.includes('WU21 Alpha Student 24') || !text.includes('2026-01-01 00:24:00')) throw new Error('Quick-search result did not contain the unique synthetic fixture.');

      await search.fill('WU21 DEFINITELY NO RESULT');
      await search.dispatchEvent('keyup');
      await waitForRows(page, 0);

      await search.fill('');
      await search.dispatchEvent('keyup');
      await waitForRows(page, 20);
      if (await page.locator('[data-js="gflow-inbox-search"]').count() !== 1) throw new Error('Native Search was duplicated during the lifecycle.');
      return { populated_rows: 1, no_result_rows: 0, cleared_rows: 20, focus };
    });

    pollingPhase = 'browser_003_pre_mutation';
    await test(page, 'WU21-BROWSER-003', 'native sorting and pager execute page 1 → 2 → 1 including keyboard return', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
      await waitForRows(page, 20);

      const sortable = await findSortableHeader(page);
      await sortable.header.click();
      await page.waitForTimeout(300);
      const sort2 = await sortable.header.getAttribute('aria-sort');
      if (!sort2 || sortable.first === sort2) throw new Error(`Native sorting state did not toggle: ${sortable.first} -> ${sort2}`);

      const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
      const previous = page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]');
      if (await next.count() !== 1 || await previous.count() !== 1) throw new Error('Native AG Grid pager controls not found exactly once.');
      if (await next.evaluate(element => element.classList.contains('ag-disabled'))) throw new Error('Next page is disabled with 25 tasks / page size 20.');
      await next.click();
      await waitForRows(page, 5);
      await previous.focus();
      if (!(await previous.evaluate(element => element === document.activeElement))) throw new Error('Native previous-page control could not receive keyboard focus.');
      await page.keyboard.press('Enter');
      await waitForRows(page, 20);
      const pagerCount = await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').count();
      if (pagerCount !== 1) throw new Error(`Expected one native pager, got ${pagerCount}`);
      return { sorted_column: sortable.colId, first_sort: sortable.first, second_sort: sort2, second_page_rows: 5, returned_first_page_rows: 20, pager_count: pagerCount };
    });

    await test(page, 'WU21-BROWSER-004', 'native Entry Detail navigation is preserved from a native cell link', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      const link = page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first();
      await link.waitFor({ state: 'visible', timeout: 30000 });
      const href = await link.getAttribute('href');
      if (!href || !href.includes('admin.php?page=gravityflow-inbox&view=entry') || !href.includes('&id=') || !href.includes('&lid=')) throw new Error(`Unexpected native Entry Detail href: ${href}`);
      await Promise.all([
        page.waitForURL(/page=gravityflow-inbox.*view=entry/, { timeout: 30000 }),
        link.click(),
      ]);
      return { href, native_cell_link: true };
    });

    pollingPhase = 'browser_005_before_mutation';
    await test(page, 'WU21-BROWSER-005', 'native Live Refresh adds and removes a synthetic task without GPP reconciliation', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox-search"]', { timeout: 30000 });
      const search = page.locator('[data-js="gflow-inbox-search"]');
      await search.fill('WU21 Refresh Student');
      await search.dispatchEvent('keyup');
      await waitForRows(page, 0);
      const id = wpControl('add');
      pollingPhase = 'browser_005_after_mutation';
      await waitForRows(page, 1, 45000);
      const addedText = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().innerText();
      if (!addedText.includes('WU21 Refresh Student')) throw new Error('Native Live Refresh did not add the synthetic task.');
      wpControl('remove');
      await waitForRows(page, 0, 45000);
      const nativeControls = {
        search: await page.locator('[data-js="gflow-inbox-search"]').count(),
        pager: await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').count(),
      };
      if (nativeControls.search !== 1 || nativeControls.pager !== 1) throw new Error(`Native controls were invalid after rerender: ${JSON.stringify(nativeControls)}`);
      return { dynamic_entry_id: Number(id), add_observed: true, remove_observed: true, native_controls: nativeControls };
    });

    pollingPhase = 'browser_006_after_mutation';
    await test(page, 'WU21-BROWSER-006', 'reload retains exactly one native Inbox and one GPP refresh utility', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
      const wrappers = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
      const replacement = await page.locator('[data-gpp-replacement-inbox], .gpp-custom-inbox-app, .gpp-inbox-card').count();
      const refresh = await page.locator('[data-gpp-inbox-manual-refresh]').count();
      if (wrappers !== 1 || replacement !== 0 || refresh !== 1) throw new Error(`Rerender ownership failure: native=${wrappers}, replacement=${replacement}, refresh=${refresh}`);
      return { native_wrappers: wrappers, replacement_widgets: replacement, manual_refresh_controls: refresh };
    });
  } else {
    for (const [id, name] of [
      ['WU21-BROWSER-002', 'native quick search executes populated → no-result → clear with visible focus'],
      ['WU21-BROWSER-003', 'native sorting and pager execute page 1 → 2 → 1 including keyboard return'],
      ['WU21-BROWSER-004', 'native Entry Detail navigation is preserved from a native cell link'],
      ['WU21-BROWSER-005', 'native Live Refresh adds and removes a synthetic task without GPP reconciliation'],
      ['WU21-BROWSER-006', 'reload retains exactly one native Inbox and one GPP refresh utility'],
    ]) record(id, name, 'NOT_RUN', 'Blocked by WU21-BROWSER-001 native grid initialization failure.');
  }

  wu17Results = await runWu17BrowserTests({ page, inboxUrl, wpControl, artifactDir });
} finally {
  const failed = results.filter(r => r.status !== 'PASS');
  if (failed.length) {
    await page.screenshot({ path: path.join(artifactDir, 'browser-failure-synthetic.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(artifactDir, 'browser-diagnostics.json'), JSON.stringify({ diagnostic: await pageSnapshot(page) }, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(artifactDir, 'polling-network-diagnostics.json'), JSON.stringify(pollingDiagnostics, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'browser-results.json'), JSON.stringify({ suite: 'WU21 Native-First Inbox browser/runtime', results }, null, 2) + '\n');
  await browser.close();
}

for (const r of results) console.log(`${r.status} ${r.id} ${r.name}`);
if (results.some(r => r.status !== 'PASS') || wu17Results.some(r => r.status !== 'PASS')) process.exit(1);
