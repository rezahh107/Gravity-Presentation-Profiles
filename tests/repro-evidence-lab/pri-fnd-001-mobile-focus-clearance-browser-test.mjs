import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { runPriFnd001MobileFocusClearance } from './pri-fnd-001-mobile-focus-clearance-probe.mjs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;

function loadManifest() {
  const cp = spawnSync(
    'php',
    [wpCli, `--path=${wpPath}`, 'eval', 'echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'],
    { encoding: 'utf8', env: process.env },
  );
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  const manifest = JSON.parse(cp.stdout);
  if (!manifest?.frontend_inbox_url) throw new Error('WU21 frontend Inbox URL missing from fixture manifest.');
  return manifest;
}

const manifest = loadManifest();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });

try {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', ['wu21', 'bootstrap', 'pass', '2026'].join('-'));
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);

  await runPriFnd001MobileFocusClearance(page, manifest.frontend_inbox_url, artifactDir);
} finally {
  await browser.close();
}
