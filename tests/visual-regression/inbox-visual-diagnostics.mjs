import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR || '/tmp/wu21-artifacts';
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const repositorySha = process.env.GPP_WU21_REPOSITORY_SHA || null;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
const out = path.join(artifactDir, 'visual-regression-diagnostics');
const fixturePath = path.join(artifactDir, 'fixture-manifest.json');

if (!repositorySha || !wpCli || !wpPath) throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: exact runtime identity is unavailable.');
if (!fs.existsSync(fixturePath)) throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: WU21 fixture manifest is unavailable.');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
if (!fixture.frontend_inbox_url) throw new Error('NATIVE_FIRST_DIAGNOSTIC_FAILURE: authentic frontend Inbox URL is unavailable.');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const legacyVisualDisposition = {
  status: 'NOT_APPLICABLE_NATIVE_FIRST_RESET',
  architecture: 'NATIVE_FIRST',
  reason: 'The Owner-approved reset retired Card Mode visual topology. This production task does not admit a replacement visual Golden.',
};
fs.writeFileSync(path.join(out, 'empty-state-seam.json'), JSON.stringify({
  ...legacyVisualDisposition,
  qualification_id: 'RETIRED_WITH_CARD_MODE',
  coverage_note: 'No-result behavior is exercised by the native Inbox browser runtime suite; this file is not a PASS claim for historical visual evidence.',
}, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'matrix-j-browser-zoom.json'), JSON.stringify({
  ...legacyVisualDisposition,
  qualification_id: 'RETIRED_WITH_CARD_MODE',
  matrix: 'J',
  coverage_note: 'True-browser-zoom visual admission is intentionally not performed in the Native-First reset.',
}, null, 2) + '\n');

const cookieJson = execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', `
$u=get_user_by('login','bootstrap_admin');
if(!$u) throw new RuntimeException('Synthetic WU21 admin unavailable.');
$e=time()+900;
echo wp_json_encode(array(
 array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),
 array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))
), JSON_UNESCAPED_SLASHES);
`], { encoding: 'utf8' }).trim();
const authCookies = JSON.parse(cookieJson);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();
const scenarios = [];
let failure = null;

async function snapshot(id, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(fixture.frontend_inbox_url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(200);

  const state = await page.evaluate(() => {
    const root = document.documentElement;
    const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const inbox = document.querySelector('.gflow-inbox.gflow-grid.gflow-common');
    const grid = document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper');
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    return {
      native_target_count: document.querySelectorAll('[data-js="gflow-inbox"]').length,
      native_wrapper_count: document.querySelectorAll('.gflow-inbox.gflow-grid.gflow-common').length,
      native_grid_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-root-wrapper').length,
      visible_row_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length,
      search_count: document.querySelectorAll('[data-js="gflow-inbox-search"]').length,
      pager_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
      manual_refresh_count: document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      card_node_count: document.querySelectorAll('.gpp-inbox-card').length,
      card_column_count: document.querySelectorAll('[col-id="gpp_case_card"]').length,
      replacement_widget_count: document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').length,
      document_horizontal_overflow_px: Math.max(0, root.scrollWidth - root.clientWidth),
      surface_horizontal_overflow_px: surface ? Math.max(0, surface.scrollWidth - surface.clientWidth) : null,
      surface_rect: rect(surface),
      inbox_rect: rect(inbox),
      grid_rect: rect(grid),
      direction: inbox ? getComputedStyle(inbox).direction : null,
    };
  });

  const violations = [];
  const requireEqual = (actual, expected, label) => { if (actual !== expected) violations.push(`${label}: ${actual} !== ${expected}`); };
  requireEqual(state.native_target_count, 1, 'native_target_count');
  requireEqual(state.native_wrapper_count, 1, 'native_wrapper_count');
  requireEqual(state.native_grid_count, 1, 'native_grid_count');
  requireEqual(state.search_count, 1, 'search_count');
  requireEqual(state.pager_count, 1, 'pager_count');
  requireEqual(state.manual_refresh_count, 1, 'manual_refresh_count');
  requireEqual(state.card_node_count, 0, 'card_node_count');
  requireEqual(state.card_column_count, 0, 'card_column_count');
  requireEqual(state.replacement_widget_count, 0, 'replacement_widget_count');
  if (state.visible_row_count < 1) violations.push(`visible_row_count: ${state.visible_row_count}`);
  if (state.document_horizontal_overflow_px > 4) violations.push(`document_horizontal_overflow_px: ${state.document_horizontal_overflow_px}`);
  if (state.surface_horizontal_overflow_px !== null && state.surface_horizontal_overflow_px > 4) violations.push(`surface_horizontal_overflow_px: ${state.surface_horizontal_overflow_px}`);

  const screenshot = `${id}.png`;
  await page.screenshot({ path: path.join(out, screenshot), fullPage: true });
  const scenario = { id, status: violations.length ? 'FAIL' : 'PASS', viewport, architecture: 'NATIVE_FIRST', screenshot, state, violations };
  fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(scenario, null, 2) + '\n');
  scenarios.push(scenario);
  if (violations.length) throw new Error(`${id}: ${violations.join('; ')}`);
}

try {
  await snapshot('native-first-desktop-1440', { width: 1440, height: 1000 });
  await snapshot('native-first-mobile-390', { width: 390, height: 844 });
} catch (error) {
  failure = String(error?.stack || error);
} finally {
  await browser.close();
}

const manifest = {
  schema_version: '2.0.0',
  evidence_kind: 'NATIVE_FIRST_STRUCTURAL_DIAGNOSTIC',
  repository_sha: repositorySha,
  architecture: 'NATIVE_FIRST',
  superseded_architecture: 'CARD_MODE',
  visual_golden_admission: 'NOT_ATTEMPTED_OUT_OF_SCOPE',
  status: failure ? 'FAIL' : 'PASS',
  authentic_surface: fixture.frontend_inbox_url,
  scenarios,
  failure,
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

if (failure) throw new Error(`NATIVE_FIRST_DIAGNOSTIC_FAILURE: ${failure}`);
console.log(`NATIVE_FIRST_STRUCTURAL_DIAGNOSTIC_PASS scenarios=${scenarios.length}`);

// Extend the same pinned WU21 visual/runtime host with the Owner-approved raw
// native baseline. The imported capture writes only beneath the existing
// diagnostics evidence tree and does not change the current visual contract.
await import('../repro-evidence-lab/native-inbox-baseline-capture.mjs');
