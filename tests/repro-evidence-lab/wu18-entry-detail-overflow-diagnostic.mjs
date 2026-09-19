import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';

if (!artifactDir || !wpPath || !wpCli) throw new Error('WU18 overflow diagnostic environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.alpha?.form_id || !manifest?.alpha?.entry_id) throw new Error('WU18 overflow diagnostic fixture manifest is incomplete.');

const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${manifest.alpha.form_id}&lid=${manifest.alpha.entry_id}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'bootstrap_admin');
await page.fill('#user_pass', adminPassword);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
await page.goto(entryUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"][data-gpp-profile-id="srwf.operations.entry-detail.full-width.v1"]', { timeout: 30000 });

const evidence = await page.evaluate(() => {
  const viewport = document.documentElement.clientWidth;
  const describe = node => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const s = getComputedStyle(node);
    return {
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      class: typeof node.className === 'string' ? node.className : null,
      rect: { left: r.left, right: r.right, width: r.width, x: r.x },
      scroll_width: node.scrollWidth,
      client_width: node.clientWidth,
      offset_width: node.offsetWidth,
      box_sizing: s.boxSizing,
      width: s.width,
      min_width: s.minWidth,
      max_width: s.maxWidth,
      margin_left: s.marginLeft,
      margin_right: s.marginRight,
      padding_left: s.paddingLeft,
      padding_right: s.paddingRight,
      border_left: s.borderLeftWidth,
      border_right: s.borderRightWidth,
      overflow_x: s.overflowX,
      position: s.position,
      display: s.display,
      direction: s.direction,
    };
  };
  const candidates = Array.from(document.querySelectorAll('body *'))
    .map(node => ({ node, rect: node.getBoundingClientRect(), style: getComputedStyle(node) }))
    .filter(item => item.style.display !== 'none' && item.style.visibility !== 'hidden' && item.rect.width > 0)
    .filter(item => item.rect.left < -1 || item.rect.right > viewport + 1)
    .sort((a, b) => Math.max(b.rect.right - viewport, -b.rect.left) - Math.max(a.rect.right - viewport, -a.rect.left))
    .slice(0, 40)
    .map(item => describe(item.node));
  const selectors = [
    '.gravityflow_workflow_detail',
    '.gravityflow_workflow_detail form',
    '#poststuff',
    '#post-body',
    '#post-body-content',
    '#postbox-container-1',
    '#postbox-container-2',
    '#gravityflow-status-box-container',
    '.gravityflow-status-box',
    '.gravityflow-timeline',
    '.gravityflow-timeline > .inside',
    '.gravityflow-timeline .gravityflow-note',
    '.gravityflow-action-buttons',
    '.gravityflow-action-buttons button',
    '.gpp-entry-dossier',
  ];
  return {
    viewport_width: viewport,
    document_scroll_width: document.documentElement.scrollWidth,
    body_scroll_width: document.body.scrollWidth,
    document: describe(document.documentElement),
    body: describe(document.body),
    key_nodes: Object.fromEntries(selectors.map(selector => [selector, describe(document.querySelector(selector))])),
    overflowers: candidates,
  };
});

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'wu18-entry-detail-overflow-diagnostic.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));
await browser.close();
