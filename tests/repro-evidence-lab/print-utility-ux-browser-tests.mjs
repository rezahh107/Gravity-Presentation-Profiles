import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Print utility browser environment unavailable.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const expectedPrintUrl = item => `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}&gpp_presentation=dossier`;
const results = [];
function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function test(id, name, fn) {
  try { record(id, name, 'PASS', await fn()); }
  catch (error) { record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 8000) }); }
}
async function login(page, user, pass) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function keyboardFocus(page, locator) {
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  for (let i = 0; i < 100; i += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate(el => document.activeElement === el)) return true;
  }
  return false;
}
function closeEnough(a, b, tolerance = 2) { return Math.abs(a - b) <= tolerance; }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript(() => {
  if (window === window.top) {
    window.__gppNativePrintEvents = [];
    window.addEventListener('message', event => {
      if (event?.data?.gppNativePrintCalled) window.__gppNativePrintEvents.push(event.data.href || '');
    });
  }
  window.print = function () {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ gppNativePrintCalled: true, href: window.location.href }, '*');
      }
    } catch (error) {}
  };
});
const page = await context.newPage();
const bootstrapPassword = ['wu21', 'bootstrap', 'pass', '2026'].join('-');
await login(page, 'bootstrap_admin', bootstrapPassword);
const buttonSelector = '[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-button]';

await test('PRINT-UTILITY-UX-001', 'idle markup and GPP-aligned computed presentation', async () => {
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const button = page.locator(buttonSelector);
  if (await button.count() !== 1) throw new Error('Expected one semantic dossier Print button.');
  if (await button.evaluate(el => el.tagName) !== 'BUTTON') throw new Error('Print utility is not a button.');
  if (await button.getAttribute('type') !== 'button') throw new Error('Print utility button type changed.');
  if (await button.getAttribute('aria-label') !== 'چاپ پرونده') throw new Error('Idle accessible name mismatch.');
  if (await button.getAttribute('aria-busy') !== 'false') throw new Error('Idle aria-busy mismatch.');
  if ((await button.locator('[data-gpp-print-label]').textContent())?.trim() !== 'چاپ پرونده') throw new Error('Idle visible label mismatch.');
  const url = await button.getAttribute('data-gpp-dossier-print-url');
  if (new URL(url).href !== new URL(expectedPrintUrl(manifest.alpha)).href) throw new Error(`Native Print URL changed: ${url}`);
  if (await page.evaluate(() => typeof window.printPage !== 'function')) throw new Error('Gravity Flow native printPage is unavailable on authentic Entry Detail.');
  const visual = await button.evaluate(el => {
    const style = getComputedStyle(el);
    const svg = el.querySelector('svg');
    return {
      minHeight: parseFloat(style.minHeight),
      height: el.getBoundingClientRect().height,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      color: style.color,
      display: style.display,
      gap: style.gap,
      svgStroke: svg ? getComputedStyle(svg).stroke : null,
      overflow: el.scrollWidth > el.clientWidth + 1,
    };
  });
  if (visual.height < 40 || visual.borderStyle !== 'solid' || visual.display !== 'inline-flex' || visual.overflow) throw new Error(`Idle visual contract failed: ${JSON.stringify(visual)}`);
  await page.screenshot({ path: path.join(artifactDir, 'print-utility-idle-desktop.png'), fullPage: true });
  return visual;
});

await test('PRINT-UTILITY-UX-002', 'keyboard focus-visible remains clear and semantic', async () => {
  const button = page.locator(buttonSelector);
  if (!await keyboardFocus(page, button)) throw new Error('Could not reach Print utility by keyboard Tab navigation.');
  const focus = await button.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      active: document.activeElement === el,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
    };
  });
  if (!focus.active || focus.outlineStyle === 'none' || focus.outlineWidth < 2) throw new Error(`Focus-visible contract failed: ${JSON.stringify(focus)}`);
  await page.screenshot({ path: path.join(artifactDir, 'print-utility-focus-visible.png'), fullPage: true });
  return focus;
});

await test('PRINT-UTILITY-UX-003', 'busy state observes native Gravity Flow iframe handoff without duplicate dispatch', async () => {
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const button = page.locator(buttonSelector);
  const label = button.locator('[data-gpp-print-label]');
  const status = page.locator('[data-gpp-print-utility="dossier"] [data-gpp-print-status]');
  const targetHref = new URL(expectedPrintUrl(manifest.alpha)).href;
  let printRequests = 0;
  const onRequest = request => {
    try {
      if (new URL(request.url()).href === targetHref) printRequests += 1;
    } catch (error) {}
  };
  page.on('request', onRequest);
  await page.route('**/admin-ajax.php?**', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get('action') === 'gravityflow_print_entries' && requestUrl.searchParams.get('gpp_presentation') === 'dossier') {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    await route.continue();
  });

  const idleBox = await button.boundingBox();
  await button.click();
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'true', buttonSelector);
  const busyBox = await button.boundingBox();
  const busy = {
    ariaBusy: await button.getAttribute('aria-busy'),
    ariaDisabled: await button.getAttribute('aria-disabled'),
    accessibleName: await button.getAttribute('aria-label'),
    visibleLabel: (await label.textContent())?.trim(),
    liveStatus: (await status.textContent())?.trim(),
    spinnerHidden: await button.locator('[data-gpp-print-spinner]').getAttribute('hidden'),
    iconHidden: await button.locator('[data-gpp-print-icon]').getAttribute('hidden'),
    focused: await button.evaluate(el => document.activeElement === el),
  };
  if (busy.ariaBusy !== 'true' || busy.ariaDisabled !== 'true' || busy.visibleLabel !== 'در حال آماده‌سازی چاپ…' || busy.liveStatus !== 'در حال آماده‌سازی چاپ…') throw new Error(`Busy state incomplete: ${JSON.stringify(busy)}`);
  if (busy.accessibleName !== 'چاپ پرونده') throw new Error('Busy update changed the stable button accessible name and risks duplicate live announcements.');
  if (!busy.focused) throw new Error('Busy transition caused focus loss.');
  if (!idleBox || !busyBox || !closeEnough(idleBox.width, busyBox.width) || !closeEnough(idleBox.height, busyBox.height)) throw new Error(`Material layout shift detected: idle=${JSON.stringify(idleBox)} busy=${JSON.stringify(busyBox)}`);

  await page.evaluate(() => {
    const iframe = document.createElement('iframe');
    iframe.src = 'about:blank';
    iframe.setAttribute('data-gpp-unrelated-test-frame', '1');
    document.body.appendChild(iframe);
  });
  await page.waitForTimeout(100);
  if (await button.getAttribute('aria-busy') !== 'true') throw new Error('Unrelated iframe incorrectly released Busy state.');

  await button.click();
  await page.waitForTimeout(100);
  if (printRequests > 1) throw new Error(`Duplicate activation created ${printRequests} native Print requests.`);
  await page.screenshot({ path: path.join(artifactDir, 'print-utility-busy-desktop.png'), fullPage: true });

  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', buttonSelector, { timeout: 15000 });
  await page.waitForTimeout(50);
  const idleAgain = {
    label: (await label.textContent())?.trim(),
    status: (await status.textContent())?.trim(),
    printRequests,
    nativePrintEvents: await page.evaluate(() => window.__gppNativePrintEvents || []),
  };
  if (idleAgain.label !== 'چاپ پرونده' || idleAgain.status !== '') throw new Error(`Busy state did not safely reset: ${JSON.stringify(idleAgain)}`);
  if (printRequests !== 1) throw new Error(`Expected one native Print request, observed ${printRequests}.`);
  if (!idleAgain.nativePrintEvents.some(href => {
    try { return new URL(href).searchParams.get('gpp_presentation') === 'dossier'; } catch { return false; }
  })) throw new Error(`Native Gravity Flow iframe load did not reach its print() handoff: ${JSON.stringify(idleAgain.nativePrintEvents)}`);

  await page.unroute('**/admin-ajax.php?**');
  page.off('request', onRequest);
  return { ...busy, layout_shift_px: { width: busyBox.width - idleBox.width, height: busyBox.height - idleBox.height }, print_requests: printRequests, native_print_handoff_observed: true };
});

await test('PRINT-UTILITY-UX-004', 'window.open fallback dispatches the same URL and releases parent busy state', async () => {
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const button = page.locator(buttonSelector);
  await page.evaluate(() => {
    window.__gppFallbackUrls = [];
    window.printPage = undefined;
    window.open = function (url) {
      window.__gppFallbackUrls.push(String(url));
      return {};
    };
  });
  await button.click();
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', buttonSelector, { timeout: 2000 });
  const urls = await page.evaluate(() => window.__gppFallbackUrls || []);
  if (urls.length !== 1 || new URL(urls[0]).href !== new URL(expectedPrintUrl(manifest.alpha)).href) throw new Error(`Fallback URL changed: ${JSON.stringify(urls)}`);
  return { fallback_calls: urls.length, busy_released: true, url_preserved: true };
});

await test('PRINT-UTILITY-UX-005', 'bounded recovery timeout unlocks UI without retrying Print', async () => {
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const button = page.locator(buttonSelector);
  await button.evaluate(el => el.setAttribute('data-gpp-print-recovery-ms', '300'));
  await page.evaluate(() => {
    window.__gppTimeoutDispatches = [];
    window.printPage = function (url) { window.__gppTimeoutDispatches.push(String(url)); };
  });
  await button.click();
  if (await button.getAttribute('aria-busy') !== 'true') throw new Error('Timeout case did not enter Busy immediately.');
  await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-busy') === 'false', buttonSelector, { timeout: 2000 });
  const calls = await page.evaluate(() => window.__gppTimeoutDispatches || []);
  if (calls.length !== 1) throw new Error(`Recovery timeout retried or skipped Print: ${JSON.stringify(calls)}`);
  return { dispatches: 1, auto_retry: false, unlocked: true };
});

await test('PRINT-UTILITY-UX-006', 'narrow layout remains usable and reduced-motion removes spinner animation', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const button = page.locator(buttonSelector);
  const state = await button.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const spinner = el.querySelector('[data-gpp-print-spinner]');
    const spinnerStyle = spinner ? getComputedStyle(spinner) : null;
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      viewport: document.documentElement.clientWidth,
      overflow: rect.left < -1 || rect.right > document.documentElement.clientWidth + 1,
      spinnerAnimation: spinnerStyle?.animationName || null,
    };
  });
  if (state.overflow || state.height < 40 || state.spinnerAnimation !== 'none') throw new Error(`Narrow/reduced-motion contract failed: ${JSON.stringify(state)}`);
  await page.screenshot({ path: path.join(artifactDir, 'print-utility-mobile.png'), fullPage: true });
  return state;
});

await browser.close();
const failed = results.filter(result => result.status === 'FAIL');
const resultPath = path.join(artifactDir, 'print-utility-ux-browser-results.json');
fs.writeFileSync(resultPath, JSON.stringify({ suite: 'GPP Print utility UX browser', results }, null, 2) + '\n');
if (failed.length) {
  console.error(JSON.stringify({ failed }, null, 2));
  process.exit(1);
}
console.log('PRINT_UTILITY_UX_BROWSER_PASS');
