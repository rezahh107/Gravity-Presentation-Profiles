import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, findBrowser, getFreePort, CdpClient, waitForJson, evaluate } from './browser-cdp.mjs';
import { runBrowserAssertions } from './browser-assertions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const browser = findBrowser();
const browserVersion = spawnSync(browser, ['--version'], { encoding: 'utf8' }).stdout.trim();
const debugPort = await getFreePort();
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpp-wu3-chrome-'));
const chrome = spawn(browser, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=320,900',
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

let stderr = '';
chrome.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

let client;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const pageInfoResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  assert(pageInfoResponse.ok, `Cannot create browser target: ${pageInfoResponse.status}`);
  const pageInfo = await pageInfoResponse.json();
  client = new CdpClient(pageInfo.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: false });
  const fixturePath = path.join(repoRoot, 'tests', 'wu3', 'fixtures', 'synthetic-registration.html');
  const baseCss = fs.readFileSync(path.join(repoRoot, 'assets', 'css', 'base.css'), 'utf8');
  const profileCss = fs.readFileSync(path.join(repoRoot, 'profiles', 'srwf', 'registration', 'profile.css'), 'utf8');
  let fixtureHtml = fs.readFileSync(fixturePath, 'utf8');
  fixtureHtml = fixtureHtml
    .replace(/<link rel="stylesheet" href="[^"]*assets\/css\/base\.css">/, `<style data-production-asset="assets/css/base.css">${baseCss}</style>`)
    .replace(/<link rel="stylesheet" href="[^"]*profiles\/srwf\/registration\/profile\.css">/, `<style data-production-asset="profiles/srwf/registration/profile.css">${profileCss}</style>`);
  const frameTreeResult = await client.send('Page.getFrameTree');
  await client.send('Page.setDocumentContent', { frameId: frameTreeResult.frameTree.frame.id, html: fixtureHtml });
  const pageState = await evaluate(client, `({readyState: document.readyState, hasSelected: !!document.getElementById('selected-form')})`);
  assert(pageState.hasSelected, `Fixture did not load through Page.setDocumentContent: ${JSON.stringify(pageState)}`);

  const { layout, aria, focusEvidence, contrastEvidence, isolation } = await runBrowserAssertions(client);
  console.log(JSON.stringify({
    status: 'WU3_BROWSER_VALIDATION_PASS',
    browser: browserVersion,
    viewport_css_px: 320,
    fixture_evidence_scope: 'SYNTHETIC_CONTROL_FIXTURE_NOT_AUTHENTIC_HOST_RUNTIME',
    layout,
    aria,
    focus: focusEvidence,
    contrast: contrastEvidence,
    isolation
  }, null, 2));
} catch (error) {
  console.error(`WU3_BROWSER_VALIDATION_FAIL: ${error.message}`);
  if (stderr) console.error(stderr.slice(-4000));
  process.exitCode = 1;
} finally {
  try { client?.close(); } catch {}
  chrome.kill('SIGTERM');
  await new Promise((resolve) => { if (chrome.exitCode !== null) resolve(); else { const timer = setTimeout(resolve, 1000); chrome.once('exit', () => { clearTimeout(timer); resolve(); }); } });
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
}
