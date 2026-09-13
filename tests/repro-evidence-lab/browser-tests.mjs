import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const results = [];
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

  await test(page, 'WU21-BROWSER-001', 'native AG Grid Inbox renders synthetic tasks', async () => {
    await page.goto(inboxUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-js="gflow-inbox"]', { timeout: 15000 });
    await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
    const wrappers = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
    const rows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
    if (wrappers !== 1) throw new Error(`Expected one native Inbox wrapper, got ${wrappers}`);
    if (rows < 1) throw new Error('No visible native AG Grid rows.');
    return { wrappers, visible_rows: rows };
  });

  if (results[0]?.status === 'PASS') {
    await test(page, 'WU21-BROWSER-002', 'native quick search uses Gravity Flow grid control', async () => {
      const search = page.locator('[data-js="gflow-inbox-search"]');
      await search.click();
      await search.pressSequentially('WU21 Alpha Student 00');
      await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 1, null, { timeout: 15000 });
      const rows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
      if (rows !== 1) throw new Error(`Expected one quick-search row, got ${rows}`);
      const text = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().innerText();
      if (!text.includes('WU21 Alpha Student 00')) throw new Error('Quick-search row did not contain expected synthetic name.');
      await search.press('Control+A');
      await search.press('Backspace');
      await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 20, null, { timeout: 15000 });
      return { matched_rows: rows };
    });

    pollingPhase = 'browser_003_pre_mutation';
    await test(page, 'WU21-BROWSER-003', 'native AG Grid sorting and pagination execute', async () => {
      const header = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first();
      await header.click();
      await page.waitForTimeout(300);
      const sort1 = await header.getAttribute('aria-sort');
      await header.click();
      await page.waitForTimeout(300);
      const sort2 = await header.getAttribute('aria-sort');
      if (!sort1 || !sort2 || sort1 === sort2) throw new Error(`Sorting state did not toggle: ${sort1} -> ${sort2}`);
      const next = page.locator('[data-js="gflow-inbox"] [ref="btNext"]');
      if (await next.count() !== 1) throw new Error('Native AG Grid next-page control not found.');
      const disabled = await next.getAttribute('disabled');
      if (disabled !== null) throw new Error('Next-page control unexpectedly disabled with 25 tasks / page size 20.');
      await next.click();
      await page.waitForTimeout(300);
      const visible = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
      if (visible < 1 || visible > 20) throw new Error(`Unexpected second-page visible row count: ${visible}`);
      return { first_sort: sort1, second_sort: sort2, second_page_rows: visible };
    });

    await test(page, 'WU21-BROWSER-004', 'native Entry Details navigation is preserved', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('.gflow-inbox__entry-cell-link', { timeout: 30000 });
      const href = await page.locator('.gflow-inbox__entry-cell-link').first().getAttribute('href');
      if (!href || !href.includes('admin.php?page=gravityflow-inbox&view=entry') || !href.includes('&id=') || !href.includes('&lid=')) {
        throw new Error(`Unexpected native Entry Details href: ${href}`);
      }
      await Promise.all([
        page.waitForURL(/page=gravityflow-inbox.*view=entry/, { timeout: 30000 }),
        page.locator('.gflow-inbox__entry-cell-link').first().click(),
      ]);
      return { href };
    });

    pollingPhase = 'browser_005_before_mutation';
    await test(page, 'WU21-BROWSER-005', 'native polling refresh adds and removes a synthetic task', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox-search"]', { timeout: 30000 });
      const search = page.locator('[data-js="gflow-inbox-search"]');
      await search.click();
      await search.pressSequentially('WU21 Refresh Student');
      await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 0, null, { timeout: 15000 });
      let rows = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').count();
      if (rows !== 0) throw new Error(`Refresh negative control expected zero rows before mutation, got ${rows}`);
      const id = wpControl('add');
      pollingPhase = 'browser_005_after_mutation';
      await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 1, null, { timeout: 45000 });
      const addedText = await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().innerText();
      if (!addedText.includes('WU21 Refresh Student')) throw new Error('Native refresh did not add the synthetic task.');
      wpControl('remove');
      await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length === 0, null, { timeout: 45000 });
      return { dynamic_entry_id: Number(id), add_observed: true, remove_observed: true };
    });

    pollingPhase = 'browser_006_after_mutation';
    await test(page, 'WU21-BROWSER-006', 'reload/re-render retains exactly one native Inbox grid', async () => {
      await page.goto(inboxUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
      const wrappers = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
      const replacement = await page.locator('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').count();
      if (wrappers !== 1 || replacement !== 0) throw new Error(`Rerender ownership failure: native=${wrappers}, replacement=${replacement}`);
      return { native_wrappers: wrappers, replacement_widgets: replacement };
    });
  } else {
    for (const [id, name] of [
      ['WU21-BROWSER-002', 'native quick search uses Gravity Flow grid control'],
      ['WU21-BROWSER-003', 'native AG Grid sorting and pagination execute'],
      ['WU21-BROWSER-004', 'native Entry Details navigation is preserved'],
      ['WU21-BROWSER-005', 'native polling refresh adds and removes a synthetic task'],
      ['WU21-BROWSER-006', 'reload/re-render retains exactly one native Inbox grid'],
    ]) record(id, name, 'NOT_RUN', 'Blocked by WU21-BROWSER-001 native grid initialization failure.');
  }
} finally {
  const failed = results.filter(r => r.status !== 'PASS');
  if (failed.length) {
    await page.screenshot({ path: path.join(artifactDir, 'browser-failure-synthetic.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(artifactDir, 'browser-diagnostics.json'), JSON.stringify({ diagnostic: await pageSnapshot(page) }, null, 2) + '\n');
  }
  fs.writeFileSync(path.join(artifactDir, 'polling-network-diagnostics.json'), JSON.stringify(pollingDiagnostics, null, 2) + '\n');
  fs.writeFileSync(path.join(artifactDir, 'browser-results.json'), JSON.stringify({ suite: 'WU21 browser/runtime', results }, null, 2) + '\n');
  await browser.close();
}

for (const r of results) console.log(`${r.status} ${r.id} ${r.name}`);
if (results.some(r => r.status !== 'PASS')) process.exit(1);
