import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Shared implementation of the already-qualified Matrix-J genuine browser zoom
 * mechanism. This is test infrastructure only; CSS/root-font/device-scale
 * approximations remain explicitly non-equivalent.
 */
export const BROWSER_TAB_ZOOM_MECHANISM = Object.freeze({
  kind: 'CHROMIUM_EXTENSION_TABS_SET_ZOOM',
  api: 'chrome.tabs.setZoom(tabId, factor)',
  verification_api: 'chrome.tabs.getZoom(tabId)',
  settings_api: 'chrome.tabs.getZoomSettings(tabId)',
  playwright_launch: 'chromium.launchPersistentContext(channel="chromium", viewport=null)',
  approximation_rejected: [
    'CSS zoom',
    'root font-size scaling',
    'viewport resizing as zoom',
    'deviceScaleFactor substitution',
    'screenshot scaling',
  ],
});

function createExtensionFixture(root) {
  const extension = path.join(root, 'extension');
  fs.mkdirSync(extension, { recursive: true });
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'GPP WU21 Browser Zoom Harness',
    version: '1.0.0',
    permissions: ['tabs'],
    background: { service_worker: 'background.js' },
  }));
  fs.writeFileSync(path.join(extension, 'background.js'), '// WU21 test-only browser zoom service worker.\n');
  return extension;
}

async function extensionWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  return worker;
}

export async function setBrowserTabZoom(worker, page, factor) {
  return worker.evaluate(async ({ url, factor: requested }) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(candidate => candidate.url === url) || tabs.find(candidate => candidate.active);
    if (!tab?.id) throw new Error(`Unable to bind browser zoom to target tab: ${url}`);
    await chrome.tabs.setZoom(tab.id, requested);
    const actual = await chrome.tabs.getZoom(tab.id);
    const settings = await chrome.tabs.getZoomSettings(tab.id);
    return { tab_id: tab.id, requested, actual, settings };
  }, { url: page.url(), factor });
}

export async function launchBrowserZoomContext({ windowWidth, windowHeight, locale = 'en-US', timezoneId = 'UTC' }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gpp-wu21-browser-zoom-'));
  const extension = createExtensionFixture(tempRoot);
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(tempRoot, 'profile'), {
      channel: 'chromium',
      headless: true,
      viewport: null,
      locale,
      timezoneId,
      reducedMotion: 'reduce',
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        `--window-size=${windowWidth},${windowHeight}`,
      ],
    });
    const worker = await extensionWorker(context);
    return {
      context,
      worker,
      tempRoot,
      async close() {
        await context.close().catch(() => {});
        fs.rmSync(tempRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (context) await context.close().catch(() => {});
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}
