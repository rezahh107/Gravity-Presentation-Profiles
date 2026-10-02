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
function wpCommand(args, env = process.env) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, ...args], { env, encoding: 'utf8', cwd: repoRoot });
  if (cp.status !== 0) throw new Error(`WP command failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
function wpEval(code) {
  return wpCommand(['eval', code]);
}
function wpControl(action) {
  return wpCommand(
    ['eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/runtime-control.php')],
    { ...process.env, WU21_CONTROL: action },
  );
}
function initiatorUrls(initiator) {
  const frames = [];
  let stack = initiator?.stack || null;
  while (stack) {
    for (const frame of stack.callFrames || []) if (frame?.url) frames.push(frame.url);
    stack = stack.parent || null;
  }
  return frames;
}
async function waitForRowId(page, rowId, present, timeout = 45000) {
  await page.waitForFunction(
    ({ rowId, present }) => Boolean(document.querySelector(`[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="${CSS.escape(String(rowId))}"]`)) === present,
    { rowId: String(rowId), present },
    { timeout },
  );
}
async function focusByKeyboardTab(page, locator, maxTabs = 120) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(element => element === document.activeElement).catch(() => false)) return index + 1;
  }
  throw new Error(`Manual refresh was not keyboard-reachable within ${maxTabs} Tab stops.`);
}

async function captureManualRefreshPresentation(page, control, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(50);
  return control.evaluate((element, viewportWidth) => {
    const style = getComputedStyle(element);
    const icon = getComputedStyle(element, '::before');
    const rect = element.getBoundingClientRect();
    const container = element.closest('.gpp-inbox-manual-refresh');
    return {
      viewport_width: viewportWidth,
      rect: { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      display: style.display,
      align_items: style.alignItems,
      gap: style.gap,
      color: style.color,
      background_color: style.backgroundColor,
      border_color: style.borderColor,
      border_radius: style.borderRadius,
      min_block_size: style.minBlockSize || style.minHeight,
      container_overflow_px: container ? Math.max(0, container.scrollWidth - container.clientWidth) : null,
      clipped: rect.left < -0.5 || rect.right > viewportWidth + 0.5 || rect.width > viewportWidth + 0.5,
      icon: {
        content: icon.content,
        display: icon.display,
        width: icon.width,
        height: icon.height,
        background_color: icon.backgroundColor,
        mask_image: icon.maskImage || icon.webkitMaskImage || '',
      },
    };
  }, width);
}

const browserResults = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
if (!Array.isArray(browserResults.results)) throw new Error('WU21 browser results are missing before manual refresh test.');
if (browserResults.results.some(item => item.id === 'WU21-BROWSER-007')) throw new Error('WU21-BROWSER-007 already exists.');

const authCookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('Synthetic WU21 admin unavailable.');
$expiration = time() + 900;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
), JSON_UNESCAPED_SLASHES);
`));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();
const network = [];
const visualEvidence = { viewports: [] };
let result;

try {
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
  const hostParent = await page.locator('.gflow-inbox.gflow-grid.gflow-common').evaluate(element => element.parentElement?.className || null);
  const refreshInsideHost = await page.locator('.gflow-inbox.gflow-grid.gflow-common [data-gpp-inbox-manual-refresh]').count();
  if (refreshInsideHost !== 0) throw new Error('Manual refresh was mounted inside the host-owned Inbox subtree.');

  for (const width of [1440, 390, 320]) {
    const presentation = await captureManualRefreshPresentation(page, control, width);
    visualEvidence.viewports.push(presentation);
    if (presentation.display !== 'inline-flex' || presentation.align_items !== 'center' || presentation.gap !== '8px') {
      throw new Error(`Manual refresh text/icon alignment is not stable at ${width}px: ${JSON.stringify(presentation)}`);
    }
    if (presentation.color !== 'rgb(29, 78, 216)' || presentation.background_color !== 'rgb(248, 250, 254)' || presentation.border_color !== 'rgb(201, 214, 240)') {
      throw new Error(`Manual refresh utility-blue idle treatment drifted at ${width}px: ${JSON.stringify(presentation)}`);
    }
    if (presentation.border_radius !== '10px' || presentation.rect.height < 44 || presentation.clipped || presentation.container_overflow_px > 1) {
      throw new Error(`Manual refresh responsive geometry failed at ${width}px: ${JSON.stringify(presentation)}`);
    }
    if (presentation.icon.display === 'none' || presentation.icon.width !== '18px' || presentation.icon.height !== '18px' || presentation.icon.background_color !== presentation.color || presentation.icon.mask_image === 'none' || !presentation.icon.mask_image.includes('data:image/svg+xml')) {
      throw new Error(`Manual refresh decorative icon is not visibly bound to currentColor at ${width}px: ${JSON.stringify(presentation.icon)}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await control.hover();
  await page.waitForTimeout(220);
  visualEvidence.hover = await control.evaluate(element => {
    const style = getComputedStyle(element);
    return { color: style.color, background_color: style.backgroundColor, border_color: style.borderColor };
  });
  if (visualEvidence.hover.color !== 'rgb(30, 64, 175)' || visualEvidence.hover.background_color !== 'rgb(248, 250, 254)' || visualEvidence.hover.border_color !== 'rgb(155, 180, 231)') {
    throw new Error(`Manual refresh hover treatment drifted: ${JSON.stringify(visualEvidence.hover)}`);
  }
  await page.mouse.move(0, 0);

  // A bfcache restoration must not preserve stale busy/disabled utility state.
  await control.evaluate(button => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'در حال به‌روزرسانی…';
  });
  if ((await control.textContent())?.trim() !== 'در حال به‌روزرسانی…' || (await control.getAttribute('aria-busy')) !== 'true' || !(await control.isDisabled())) {
    throw new Error('Manual refresh busy semantics changed before reload.');
  }
  await page.waitForTimeout(220);
  visualEvidence.busy = await control.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      background_color: style.backgroundColor,
      border_color: style.borderColor,
      opacity: style.opacity,
      cursor: style.cursor,
      icon_background_color: getComputedStyle(element, '::before').backgroundColor,
    };
  });
  if (visualEvidence.busy.color !== 'rgb(71, 84, 103)' || visualEvidence.busy.background_color !== 'rgb(248, 250, 254)' || visualEvidence.busy.border_color !== 'rgb(201, 214, 240)' || Number(visualEvidence.busy.opacity) >= 1 || visualEvidence.busy.icon_background_color !== visualEvidence.busy.color) {
    throw new Error(`Manual refresh busy presentation drifted: ${JSON.stringify(visualEvidence.busy)}`);
  }
  await control.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  if (await control.isDisabled()) throw new Error('pageshow did not recover the manual refresh disabled state.');
  if (await control.getAttribute('aria-busy')) throw new Error('pageshow did not clear the manual refresh busy state.');
  if ((await control.textContent())?.trim() !== label) throw new Error('pageshow did not restore the idle Persian label.');
  if (await page.locator(controlSelector).count() !== 1) throw new Error('pageshow recovery duplicated the manual refresh control.');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => {
    network.push({ url: event.request.url, type: event.type, initiator_type: event.initiator?.type || null, initiator_urls: initiatorUrls(event.initiator) });
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
  const gppScriptRequests = network.filter(item => item.type !== 'Document' && item.initiator_urls.some(url => url.includes('/assets/js/gravity-flow-inbox-manual-refresh.js')));
  if (gppScriptRequests.length !== 0) throw new Error(`Manual refresh script initiated non-document network requests: ${JSON.stringify(gppScriptRequests)}`);

  const wrappersAfterClick = await page.locator('.gflow-inbox.gflow-grid.gflow-common').count();
  const gridsAfterClick = await page.locator(gridSelector).count();
  const cardModeAfterClick = await page.locator('.gpp-inbox-card, [col-id="gpp_case_card"]').count();
  const rowsAfterClick = await page.locator(centerRowsSelector).count();
  const controlsAfterClick = await page.locator(controlSelector).count();
  if (wrappersAfterClick !== 1 || gridsAfterClick !== 1 || controlsAfterClick !== 1) throw new Error(`Native Inbox/manual utility was not reconstructed exactly once: wrapper=${wrappersAfterClick}, grid=${gridsAfterClick}, refresh=${controlsAfterClick}`);
  if (rowsAfterClick < 1 || cardModeAfterClick !== 0) throw new Error(`Native-first presentation failed after reload: rows=${rowsAfterClick}, card_mode_nodes=${cardModeAfterClick}`);

  // Prove the host's own polling lifecycle still works after the GPP document
  // reload. The native Inbox does not expose the former Card Mode student field,
  // so observe the authoritative AG Grid row-id instead of Card-only text.
  const dynamicId = Number(wpControl('add'));
  try {
    await waitForRowId(page, dynamicId, true, 45000);
    const dynamicRow = page.locator(`[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="${dynamicId}"]`);
    if (await dynamicRow.count() !== 1) throw new Error(`Host Live Refresh did not materialize native row-id ${dynamicId}.`);
  } finally {
    wpControl('remove');
  }
  await waitForRowId(page, dynamicId, false, 45000);
  if (await page.locator(controlSelector).count() !== 1) throw new Error('Host Live Refresh duplicated the GPP manual refresh utility.');

  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector(gridSelector, { timeout: 30000 });
  const keyboardControl = page.getByRole('button', { name: label, exact: true });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(220);
  const keyboardTabStops = await focusByKeyboardTab(page, keyboardControl);
  const focusStyle = await keyboardControl.evaluate(element => ({
    active: element === document.activeElement,
    focusVisible: element.matches(':focus-visible'),
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth,
    outlineColor: getComputedStyle(element).outlineColor,
    color: getComputedStyle(element).color,
    backgroundColor: getComputedStyle(element).backgroundColor,
  }));
  visualEvidence.focus = focusStyle;
  if (!focusStyle.active || !focusStyle.focusVisible || focusStyle.outlineStyle === 'none' || parseFloat(focusStyle.outlineWidth) <= 0 || focusStyle.outlineColor !== 'rgb(147, 197, 253)' || focusStyle.color !== 'rgb(29, 78, 216)') {
    throw new Error(`Manual refresh keyboard focus is not visibly indicated by the semantic utility treatment: ${JSON.stringify(focusStyle)}`);
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector(gridSelector, { timeout: 30000 });
  const keyboardNavigationType = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type || null);
  if (keyboardNavigationType !== 'reload') throw new Error(`Keyboard activation did not perform a document reload: ${keyboardNavigationType}`);
  if (await page.locator('.gflow-inbox.gflow-grid.gflow-common').count() !== 1 || await page.locator(gridSelector).count() !== 1 || await page.locator(controlSelector).count() !== 1) {
    throw new Error('Keyboard reload did not reconstruct exactly one native Inbox/grid/refresh utility.');
  }

  const hostInboxChanges = network.filter(item => item.url.includes('/wp-json/gravityflow/internal/inbox/changes'));
  const privateApiNames = network.filter(item => item.initiator_urls.some(url => /gravity-flow-inbox-manual-refresh\.js/.test(url)) && /inbox\/changes|admin-ajax|wp-json/.test(item.url));
  if (privateApiNames.length !== 0) throw new Error(`GPP manual control directly initiated a refresh endpoint: ${JSON.stringify(privateApiNames)}`);

  result = {
    id: 'WU21-BROWSER-007',
    name: 'manual Inbox refresh performs one native document reload, pageshow recovery and no host-node ownership',
    status: 'PASS',
    details: {
      label,
      route: inboxUrl,
      click_navigation_type: navigationType,
      keyboard_navigation_type: keyboardNavigationType,
      native_wrappers_after_click: wrappersAfterClick,
      native_grids_after_click: gridsAfterClick,
      reconstructed_rows: rowsAfterClick,
      card_mode_nodes_after_click: cardModeAfterClick,
      refresh_controls_after_click: controlsAfterClick,
      refresh_inside_native_host: refreshInsideHost,
      native_host_parent_class: hostParent,
      pageshow_recovery: true,
      post_reload_live_refresh_entry_id: dynamicId,
      post_reload_live_refresh_observed_by_native_row_id: true,
      direct_non_document_requests_from_gpp_control: gppScriptRequests.length,
      direct_private_refresh_requests_from_gpp_control: privateApiNames.length,
      host_owned_inbox_changes_observed_after_reload: hostInboxChanges.length,
      unrelated_admin_control_count: 0,
      unrelated_frontend_control_count: 0,
      keyboard_tab_stops_to_control: keyboardTabStops,
      keyboard_focus: focusStyle,
      visual_contract: visualEvidence,
    },
  };
} catch (error) {
  result = {
    id: 'WU21-BROWSER-007',
    name: 'manual Inbox refresh performs one native document reload, pageshow recovery and no host-node ownership',
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
