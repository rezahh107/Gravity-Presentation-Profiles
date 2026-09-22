import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
if (!artifactDir || !wpCli || !wpPath) throw new Error('P06 cascade diagnostic requires WU21 runtime.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const authCookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
$expiration = time() + 600;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
), JSON_UNESCAPED_SLASHES);
`));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1874, height: 1200 } });
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();
const response = await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
const raw = response ? await response.text() : '';

const diagnostic = await page.evaluate(() => {
  const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
  const parent = surface?.parentElement;
  const inner = surface?.querySelector('.gpp-inbox-surface__inner');
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const style = el => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      display: s.display,
      width: s.width,
      inlineSize: s.inlineSize,
      maxWidth: s.maxWidth,
      maxInlineSize: s.maxInlineSize,
      marginLeft: s.marginLeft,
      marginRight: s.marginRight,
      marginInlineStart: s.marginInlineStart,
      marginInlineEnd: s.marginInlineEnd,
      boxSizing: s.boxSizing,
    };
  };
  const sheets = [...document.styleSheets].map((sheet, index) => {
    const node = sheet.ownerNode;
    const id = node?.id || '';
    const href = sheet.href || '';
    const label = href || id || node?.tagName || 'inline';
    const relevantRules = [];
    try {
      for (const rule of [...sheet.cssRules]) {
        const text = rule.cssText || '';
        if (text.includes('gpp-inbox-surface--full-width') || text.includes('.wp-site-blocks') || text.includes('--wp--style--global--content-size')) {
          relevantRules.push(text.slice(0, 1200));
        }
      }
    } catch (error) {
      relevantRules.push(`UNREADABLE:${String(error)}`);
    }
    return { index, label, id, href, parent: node?.parentElement?.tagName || null, relevantRules };
  }).filter(item => item.relevantRules.length || item.href.includes('srwf-gravity-flow-inbox'));

  return {
    viewport: { width: innerWidth, height: innerHeight },
    surface: { rect: rect(surface), style: style(surface), classes: surface?.className || null },
    parent: { rect: rect(parent), style: style(parent), classes: parent?.className || null, tag: parent?.tagName || null },
    inner: { rect: rect(inner), style: style(inner) },
    body_classes: document.body.className,
    stylesheets: sheets,
  };
});

const lowerRaw = raw.toLowerCase();
const headClose = lowerRaw.indexOf('</head>');
const presentationIndex = raw.indexOf('/assets/css/srwf-gravity-flow-inbox.css');
const nativeIndex = raw.indexOf('/assets/css/srwf-gravity-flow-inbox-native.css');
diagnostic.raw_delivery = {
  head_close_index: headClose,
  presentation_index: presentationIndex,
  native_index: nativeIndex,
  presentation_before_head_close: presentationIndex >= 0 && presentationIndex < headClose,
  native_before_head_close: nativeIndex >= 0 && nativeIndex < headClose,
};

fs.writeFileSync(path.join(artifactDir, 'p06-cascade-diagnostic.json'), JSON.stringify(diagnostic, null, 2) + '\n');
process.stdout.write(`P06_CASCADE_DIAGNOSTIC=${JSON.stringify(diagnostic)}\n`);
await browser.close();
