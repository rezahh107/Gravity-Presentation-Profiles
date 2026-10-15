import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

// Test-only: the real WU21/P06 WordPress, Gravity Flow and GPP runtime is provisioned
// by .github/workflows/blocksy-free-inbox-smoke.yml. No mock Inbox is rendered here.
const env = process.env;
const { WU21_WP_CLI: cli, WU21_WP_PATH: wpPath, WU21_ARTIFACT_DIR: out, WU21_BASE_URL: baseUrl } = env;
for (const [key, value] of Object.entries({ cli, wpPath, out, baseUrl })) {
  assert.ok(value, 'Missing WU21 environment: ' + key);
}
fs.mkdirSync(out, { recursive: true });
const readJson = name => JSON.parse(fs.readFileSync(path.join(out, name), 'utf8'));
const manifest = readJson('fixture-manifest.json');
const p06 = JSON.parse(wpEval("echo wp_json_encode(get_option('gpp_p06_fixture_manifest'), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);"));
assert.ok(manifest.frontend_inbox_url && p06?.authentic_block_page?.url && p06?.unrelated_page?.url,
  'Authentic WU21/P06 shortcode, block and negative-control pages are required.');

function wpEval(code) {
  const result = spawnSync('php', [cli, '--path=' + wpPath, 'eval', code], { encoding: 'utf8', env });
  if (result.status !== 0) throw new Error('WP runtime evaluation failed: ' + result.stderr);
  return result.stdout.trim();
}
const cookies = JSON.parse(wpEval([
  "$u = get_user_by('login', 'bootstrap_admin');",
  "if (!$u) { throw new RuntimeException('Synthetic operator unavailable'); }",
  "$expiry = time() + 900;",
  "echo wp_json_encode(array(",
  "  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiry, 'auth')),",
  "  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiry, 'logged_in'))",
  "), JSON_UNESCAPED_SLASHES);",
].join('\n')));

const scenarios = [
  { name: 'shortcode', url: manifest.frontend_inbox_url },
  { name: 'block', url: p06.authentic_block_page.url },
  { name: 'unrelated', url: p06.unrelated_page.url, negative: true },
];
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }];
const evidence = { schema_version: '1.0.0', source: 'AUTHENTIC_BLOCKSY_FREE_WORDPRESS', theme: readJson('blocksy-runtime.json'),
  status: 'PASS', scenarios: [], errors: [], page_errors: [] };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'fa-IR' });
await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();
// Attribute each actual uncaught page exception to the running scenario when possible.
// Keep the original page_errors evidence, then reconcile every captured event
 // into scenario/aggregate errors before deciding the process exit status.
let activeScenario = null;
const capturedPageErrors = [];
page.on('pageerror', err => {
  const message = String(err).slice(0, 900);
  evidence.page_errors.push(message);
  capturedPageErrors.push({ scenario: activeScenario?.name ?? null, message });
});
const injectionTarget = env.GPP_BLOCKSY_INJECT_PAGEERROR || null;
const artifactSuffix = injectionTarget ? '-negative' : '';

try {
  for (const scenario of scenarios) {
    for (const viewport of (scenario.negative ? [viewports[0]] : viewports)) {
      const key = scenario.name + '-' + viewport.width;
      const record = { name: key, url: scenario.url, viewport, status: 'PASS' };
      evidence.scenarios.push(record);
      activeScenario = record;
      try {
        await page.setViewportSize(viewport);
        const response = await page.goto(scenario.url, { waitUntil: 'networkidle', timeout: 45000 });
        assert.equal(response?.status(), 200, key + ': page HTTP status is not 200.');
        if (!scenario.negative) {
          await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').waitFor({ timeout: 30000 });
        }
        record.geometry = await page.evaluate(() => {
          const rect = selector => {
            const el = document.querySelector(selector);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { x: b.x, right: b.right, width: b.width, height: b.height,
              scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
          };
          const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map(x => x.href);
          const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
          const header = document.querySelector('.gpp-inbox-surface__header');
          return {
            html_lang: document.documentElement.lang,
            html_dir: document.documentElement.dir,
            body_classes: document.body.className.split(/\s+/).filter(x => /blocksy|rtl|page/.test(x)).slice(0, 15),
            document_scroll_width: document.documentElement.scrollWidth,
            viewport_width: window.innerWidth,
            surface_count: document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"]').length,
            native_inbox_count: document.querySelectorAll('[data-js="gflow-inbox"]').length,
            ag_grid_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-root-wrapper').length,
            ag_row_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-row').length,
            h1_count: surface ? surface.querySelectorAll('h1').length : 0,
            gpp_header_text: header?.querySelector('h1')?.textContent?.trim() || null,
            gpp_header_direction: header ? getComputedStyle(header).direction : null,
            native_grid_direction: (() => {
              const n = document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper');
              return n ? getComputedStyle(n).direction : null;
            })(),
            gpp_inbox_css: styles.filter(x => /\/assets\/css\/srwf-gravity-flow-inbox(?:-native)?\.css(?:\?|$)/.test(x)),
            blocksy_assets: styles.filter(x => x.includes('/themes/blocksy/')).length,
            surface: rect('[data-gpp-inbox-surface="gravity_flow.inbox"]'),
            host: rect('.gpp-inbox-surface__host'),
            grid: rect('[data-js="gflow-inbox"] .ag-root-wrapper'),
          };
        });
        const g = record.geometry;
        assert.equal(g.html_dir, 'rtl', key + ': WordPress full-page HTML is not RTL.');
        if (scenario.negative) {
          assert.equal(g.surface_count, 0, 'GPP Inbox leaked to unrelated page.');
          assert.equal(g.gpp_inbox_css.length, 0, 'GPP Inbox styles leaked to unrelated page.');
          continue;
        }
        assert.equal(g.surface_count, 1, key + ': exactly one GPP Inbox surface required.');
        assert.equal(g.native_inbox_count, 1, key + ': native Gravity Flow Inbox must be rendered.');
        assert.equal(g.ag_grid_count, 1, key + ': real AG Grid mount missing.');
        assert.ok(g.ag_row_count > 0, key + ': synthetic workflow rows were not rendered.');
        assert.equal(g.h1_count, 1, key + ': Inbox must have exactly one GPP heading.');
        assert.equal(g.gpp_header_text, 'کارهای من', key + ': Owner Inbox heading mismatch.');
        assert.equal(g.gpp_header_direction, 'rtl', key + ': GPP header is not RTL.');
        assert.equal(g.gpp_inbox_css.length, 2, key + ': both GPP stylesheets must load.');
        assert.ok(g.blocksy_assets > 0, key + ': Blocksy theme assets missing in real page.');
        assert.ok(g.surface && g.surface.width > 0 && g.grid?.width > 0, key + ': invalid Inbox geometry.');
        assert.ok(g.surface.x >= -2 && g.surface.right <= viewport.width + 2,
          key + ': GPP surface escaped the viewport.');
        assert.ok(g.document_scroll_width <= viewport.width + 2,
          key + ': full-page horizontal overflow (native Grid interior scroll is allowed).');
        for (const href of g.gpp_inbox_css) {
          const cssResponse = await context.request.get(href);
          assert.equal(cssResponse.status(), 200, key + ': GPP stylesheet HTTP delivery failed: ' + href);
          assert.match(await cssResponse.text(), /gpp-inbox|gflow-inbox/,
            key + ': delivered GPP stylesheet appears empty/wrong.');
        }
        // Deterministic falsification in the real browser, after ALL DOM,
        // geometry, RTL and HTTP asset assertions have already succeeded.
        if (injectionTarget === key) {
          record.dom_assertions_passed = true;
          const uncaught = page.waitForEvent('pageerror', {
            predicate: error => String(error).includes('GPP_BLOCKSY_PAGEERROR_FALSIFICATION'),
            timeout: 10000,
          });
          await page.evaluate(() => {
            setTimeout(() => { throw new Error('GPP_BLOCKSY_PAGEERROR_FALSIFICATION'); }, 0);
          });
          await uncaught;
        }
      } catch (error) {
        record.status = 'FAIL';
        record.error = String(error?.stack || error).slice(0, 3000);
        evidence.errors.push({ scenario: key, error: record.error });
      } finally {
        await page.screenshot({ path: path.join(out, key + artifactSuffix + '.png'), fullPage: true }).catch(() => {});
        activeScenario = null;
      }
    }
  }
} finally {
  await browser.close();
  for (const { scenario, message } of capturedPageErrors) {
    const record = evidence.scenarios.find(candidate => candidate.name === scenario);
    if (record) {
      record.status = 'FAIL';
      (record.page_errors ??= []).push(message);
    }
    evidence.errors.push({ scenario: scenario ?? 'browser-global', error: 'Uncaught browser page exception: ' + message });
  }
  // Both existing assertion failures and every captured uncaught page error
  // independently force a FAIL verdict; neither can be masked by a PASS DOM.
  evidence.status = evidence.errors.length || evidence.page_errors.length ? 'FAIL' : 'PASS';
  fs.writeFileSync(path.join(out, 'blocksy-browser-smoke' + artifactSuffix + '.json'), JSON.stringify(evidence, null, 2) + '\n');
}
if (evidence.status !== 'PASS') {
  console.error('BLOCKSY_AUTHENTIC_SMOKE_FAIL ' + JSON.stringify(evidence.errors));
  process.exitCode = 1;
} else {
  console.log('BLOCKSY_AUTHENTIC_SMOKE_PASS scenarios=' + evidence.scenarios.length);
}
