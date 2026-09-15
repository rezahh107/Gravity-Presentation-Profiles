import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const resultFile = path.join(artifactDir, 'browser-results.json');
const inboxUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
const label = 'به‌روزرسانی کارهای من';
const controlSelector = '[data-gpp-inbox-manual-refresh]';
const gridSelector = '[data-js="gflow-inbox"] .ag-root-wrapper';
const centerRowsSelector = '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row';

function bounded(value, max = 5000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function wpControl(action) {
  const env = { ...process.env, WU21_CONTROL: action };
  const cp = spawnSync(
    'php',
    [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/runtime-control.php')],
    { env, encoding: 'utf8' },
  );
  if (cp.status !== 0) throw new Error(`WP control ${action} failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function initiatorUrls(initiator) {
  const frames = [];
  let stack = initiator?.stack || null;
  while (stack) {
    for (const frame of stack.callFrames || []) {
      if (frame?.url) frames.push(frame.url);
    }
    stack = stack.parent || null;
  }
  return frames;
}

const browserResults = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
if (!Array.isArray(browserResults.results)) throw new Error('WU21 browser results are missing before manual refresh test.');
if (browserResults.results.some(item => item.id === 'WU21-BROWSER-007')) throw new Error('WU21-BROWSER-007 already exists.');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const network = [];
let result;

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await page.goto(`${baseUrl}/wp-admin/`, { waitUntil: 'networkidle' });
  if (await page.locator(controlSelector).count() !== 0) throw new Error('Manual Inbox refresh leaked onto an unrelated admin page.');
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (await page.locator(controlSelector).count() !== 0) throw new Error('Manual Inbox refresh leaked onto an unrelated frontend page.');

  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector(gridSelector, { timeout: 30000 });
  const control = page.getByRole('button', { name: label, exact: true });
  await control.waitFor({ state: 'visible', timeout: 15000 });
  if (await control.count() !== 1) throw new Error('Expected exactly one manual Inbox refresh control.');
  if ((await control.textContent())?.trim() !== label) throw new Error('Owner-locked Persian label mismatch.');
  if ((await control.getAttribute('type')) !== 'button') throw new Error('Manual refresh control is not a non-submit button.');
  if ((await control.getAttribute('aria-label')) !== label) throw new Error('Manual refresh accessible name mismatch.');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => {
    network.push({
      url: event.request.url,
      type: event.type,
      initiator_type: event.initiator?.type || null,
      initiator_urls: initiatorUrls(event.initiator),
    });
  });

  network.length = 0;
  const beforeUrl = page.url();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    control.click(),
  ]);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector(gridSelector, { timeout: 30000 });

  if (page.url() !== beforeUrl || page.url() !== inboxUrl) throw new Error(`Manual reload changed native Inbox route: ${beforeUrl} -> ${page.url()}`);
  const navigationType = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type || null);
  if (navigationType !== 'reload') throw new Error(`Expected browser reload navigation, observed ${navigationType}`);
  const documentReloads = network.filter(item => item.type === 'Document' && item.url.startsWith(inboxUrl));
  if (documentReloads.length < 1) throw new Error('No top-level native Inbox document reload request was observed.');

  const gppScriptRequests = network.filter(item =>
    item.type !== 'Document' && item.initiator_urls.some(url => url.includes('/assets/js/gravity-flow-inbox-manual-refresh.js')),
  );
  if (gppScriptRequests.length !== 0) {
    throw new Error(`Manual refresh script initiated non-document network requests: ${JSON.stringify(gppScriptRequests)}`);
  }

  const wrappersAfterClick = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
  const gridsAfterClick = await page.locator(gridSelector).count();
  const cardsAfterClick = await page.locator('.gpp-inbox-card').count();
  const rowsAfterClick = await page.locator(centerRowsSelector).count();
  if (wrappersAfterClick !== 1 || gridsAfterClick !== 1) throw new Error(`Native Inbox was not reconstructed exactly once after reload: wrapper=${wrappersAfterClick}, grid=${gridsAfterClick}`);
  if (rowsAfterClick < 1 || cardsAfterClick !== rowsAfterClick) throw new Error(`GPP presentation did not reconstruct normally after reload: rows=${rowsAfterClick}, cards=${cardsAfterClick}`);

  const search = page.locator('[data-js="gflow-inbox-search"]');
  await search.click();
  await search.pressSequentially('WU21 Refresh Student');
  await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, centerRowsSelector, { timeout: 15000 });
  const dynamicId = Number(wpControl('add'));
  try {
    await page.waitForFunction(selector => document.querySelectorAll(selector).length === 1, centerRowsSelector, { timeout: 45000 });
    const rowText = await page.locator(centerRowsSelector).first().innerText();
    if (!rowText.includes('WU21 Refresh Student')) throw new Error('Host Live Refresh did not add the post-reload synthetic task.');
  } finally {
    wpControl('remove');
  }
  await page.waitForFunction(selector => document.querySelectorAll(selector).length === 0, centerRowsSelector, { timeout: 45000 });

  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector(gridSelector, { timeout: 30000 });
  const keyboardControl = page.getByRole('button', { name: label, exact: true });
  await keyboardControl.focus();
  if (!(await keyboardControl.evaluate(element => element === document.activeElement))) throw new Error('Manual refresh control could not receive keyboard focus.');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector(gridSelector, { timeout: 30000 });
  const keyboardNavigationType = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type || null);
  if (keyboardNavigationType !== 'reload') throw new Error(`Keyboard activation did not perform a document reload: ${keyboardNavigationType}`);
  if (await page.locator('.gflow-inbox.gflow-grid.gflow-common').count() !== 1 || await page.locator(gridSelector).count() !== 1) {
    throw new Error('Keyboard reload did not reconstruct exactly one native Inbox/grid.');
  }

  const hostInboxChanges = network.filter(item => item.url.includes('/wp-json/gravityflow/internal/inbox/changes'));
  const privateApiNames = network.filter(item => item.initiator_urls.some(url => /gravity-flow-inbox-manual-refresh\.js/.test(url)) && /inbox\/changes|admin-ajax|wp-json/.test(item.url));
  if (privateApiNames.length !== 0) throw new Error(`GPP manual control directly initiated a refresh endpoint: ${JSON.stringify(privateApiNames)}`);

  result = {
    id: 'WU21-BROWSER-007',
    name: 'manual Inbox refresh performs only a native top-level reload and preserves host Live Refresh',
    status: 'PASS',
    details: {
      label,
      route: inboxUrl,
      click_navigation_type: navigationType,
      keyboard_navigation_type: keyboardNavigationType,
      native_wrappers_after_click: wrappersAfterClick,
      native_grids_after_click: gridsAfterClick,
      reconstructed_rows: rowsAfterClick,
      reconstructed_cards: cardsAfterClick,
      post_reload_live_refresh_entry_id: dynamicId,
      direct_non_document_requests_from_gpp_control: gppScriptRequests.length,
      direct_private_refresh_requests_from_gpp_control: privateApiNames.length,
      host_owned_inbox_changes_observed_after_reload: hostInboxChanges.length,
      unrelated_admin_control_count: 0,
      unrelated_frontend_control_count: 0,
    },
  };
} catch (error) {
  result = {
    id: 'WU21-BROWSER-007',
    name: 'manual Inbox refresh performs only a native top-level reload and preserves host Live Refresh',
    status: 'FAIL',
    details: { error: bounded(error?.stack || error) },
  };
} finally {
  await browser.close();
}

browserResults.results.push(result);
browserResults.manual_inbox_refresh_network = network.slice(-200);
fs.writeFileSync(resultFile, JSON.stringify(browserResults, null, 2) + '\n');
console.log(`${result.status} ${result.id} ${result.name}`);
if (result.status !== 'PASS') process.exit(1);
