import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU19 visual-control capture environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha = manifest.alpha;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', 'wu21-bootstrap-pass-2026');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

  const dossierUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${alpha.entry_id}&gpp_presentation=dossier`;
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(dossierUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]');
  await page.emulateMedia({ media: 'print' });

  const canonical = path.join(artifactDir, 'wu19-canonical.pdf');
  const browserCanonical = path.join(artifactDir, 'wu19-browser-canonical.pdf');
  if (fs.existsSync(canonical) && !fs.existsSync(browserCanonical)) fs.copyFileSync(canonical, browserCanonical);
  await page.pdf({ path: canonical, printBackground: true, preferCSSPageSize: true, scale: 1 });
  console.log(`WU19 post-normalization visual-control PDF captured: ${canonical}`);
} finally {
  await browser.close();
}
