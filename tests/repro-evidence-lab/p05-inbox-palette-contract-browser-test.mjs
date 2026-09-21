import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
if (!artifactDir || !wpCli || !wpPath) throw new Error('P05 palette regression requires the admitted WU21 runtime environment.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.frontend_inbox_url) throw new Error('P05 frontend Inbox fixture URL is unavailable.');

const authCookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('bootstrap_admin unavailable');
$expiration = time() + 600;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
), JSON_UNESCAPED_SLASHES);
`));

const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const playwrightVersion = JSON.parse(fs.readFileSync('node_modules/playwright/package.json', 'utf8')).version;
const expected = {
  canvas: 'rgb(247, 248, 252)',
  surface: 'rgb(255, 255, 255)',
  text: 'rgb(23, 32, 51)',
  muted: 'rgb(71, 84, 103)',
  border: 'rgb(228, 231, 236)',
  controlBorder: 'rgb(134, 144, 161)',
  accent: 'rgb(29, 78, 216)',
  focus: 'rgb(56, 88, 233)',
  error: 'rgb(180, 35, 24)',
};
const mutatedCanvas = 'rgb(1, 2, 3)';
const hostileError = 'rgb(33, 34, 35)';

async function waitForCardMode(page) {
  await page.waitForSelector('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"] .gpp-inbox-card').length > 1, null, { timeout: 30000 });
}

async function ensureOverdueObservable(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const details = surface?.querySelector('.gpp-inbox-card .gpp-inbox-card__details');
    if (!surface || !details) throw new Error('P05 canonical Inbox details fixture is unavailable.');

    let overdue = details.querySelector('.gpp-inbox-card__due--overdue');
    let source = 'runtime_fixture';
    if (!overdue) {
      overdue = document.createElement('div');
      overdue.className = 'gpp-inbox-card__detail gpp-inbox-card__due gpp-inbox-card__due--overdue';
      overdue.dataset.gppP05TestOverdue = 'true';

      const term = document.createElement('dt');
      term.textContent = 'سررسید';
      const value = document.createElement('dd');
      value.textContent = '۱۴۰۴/۰۱/۰۱';
      overdue.append(term, value);
      details.appendChild(overdue);
      source = 'p05_test_controlled';
    }

    const value = overdue.querySelector('dd');
    if (!value) throw new Error('P05 overdue fixture has no value node.');
    return {
      source,
      selector: '.gpp-inbox-card__due--overdue dd',
      test_controlled: overdue.dataset.gppP05TestOverdue === 'true',
    };
  });
}

async function observe(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const grid = surface?.querySelector('.ag-center-cols-container');
    const card = surface?.querySelector('.gpp-inbox-card');
    const name = card?.querySelector('.gpp-inbox-card__name');
    const meta = card?.querySelector('.gpp-inbox-card__meta');
    const open = card?.querySelector('.gpp-inbox-card__open');
    const overdue = card?.querySelector('.gpp-inbox-card__due--overdue dd');
    const search = surface?.querySelector('[data-js="gflow-inbox-search"]');
    const cell = card?.closest('.ag-cell[col-id="gpp_case_card"]');
    if (!surface || !grid || !card || !name || !meta || !open || !overdue || !search || !cell) {
      throw new Error('P05 canonical Inbox card-mode surface is incomplete.');
    }

    const surfaceStyle = getComputedStyle(surface);
    const gridStyle = getComputedStyle(grid);
    const cardStyle = getComputedStyle(card);
    const nameStyle = getComputedStyle(name);
    const metaStyle = getComputedStyle(meta);
    const openStyle = getComputedStyle(open);
    const overdueStyle = getComputedStyle(overdue);
    const searchStyle = getComputedStyle(search);
    return {
      direction: surfaceStyle.direction,
      canvas: surfaceStyle.backgroundColor,
      scope_tokens: {
        canvas: surfaceStyle.getPropertyValue('--gpp-inbox-canvas').trim(),
        surface: surfaceStyle.getPropertyValue('--gpp-inbox-surface').trim(),
        text: surfaceStyle.getPropertyValue('--gpp-inbox-text').trim(),
        muted: surfaceStyle.getPropertyValue('--gpp-inbox-text-muted').trim(),
        border: surfaceStyle.getPropertyValue('--gpp-inbox-border').trim(),
        control_border: surfaceStyle.getPropertyValue('--gpp-inbox-control-border').trim(),
        accent: surfaceStyle.getPropertyValue('--gpp-inbox-accent').trim(),
        accent_active: surfaceStyle.getPropertyValue('--gpp-inbox-accent-active').trim(),
        focus: surfaceStyle.getPropertyValue('--gpp-inbox-focus').trim(),
      },
      computed: {
        grid_background: gridStyle.backgroundColor,
        card_background: cardStyle.backgroundColor,
        card_border: cardStyle.borderColor,
        name_color: nameStyle.color,
        meta_color: metaStyle.color,
        open_background: openStyle.backgroundColor,
        overdue_color: overdueStyle.color,
        search_background: searchStyle.backgroundColor,
        search_border: searchStyle.borderColor,
        search_color: searchStyle.color,
      },
      geometry: {
        surface: (() => { const r = surface.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
        grid: (() => { const r = grid.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
        card: (() => { const r = card.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
        grid_columns: gridStyle.gridTemplateColumns,
      },
      card_mode: gridStyle.display === 'grid',
      outside_scope_token: getComputedStyle(document.body).getPropertyValue('--gpp-inbox-text').trim(),
    };
  });
}

function normalizeGeometry(observation) {
  const normalizeRect = rect => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value * 100) / 100]));
  return {
    surface: normalizeRect(observation.geometry.surface),
    grid: normalizeRect(observation.geometry.grid),
    card: normalizeRect(observation.geometry.card),
    grid_columns: observation.geometry.grid_columns,
  };
}

function assertOwnedPalette(observation, label) {
  assert.equal(observation.scope_tokens.surface, '#fff', `${label}: owned surface token drifted.`);
  assert.equal(observation.scope_tokens.text, '#172033', `${label}: owned text token drifted.`);
  assert.equal(observation.scope_tokens.muted, '#475467', `${label}: owned muted token drifted.`);
  assert.equal(observation.scope_tokens.border, '#e4e7ec', `${label}: owned border token drifted.`);
  assert.equal(observation.scope_tokens.control_border, '#8690a1', `${label}: owned control-border token drifted.`);
  assert.equal(observation.scope_tokens.accent, '#1d4ed8', `${label}: owned accent token drifted.`);
  assert.equal(observation.scope_tokens.accent_active, '#1e40af', `${label}: owned active-accent token drifted.`);
  assert.equal(observation.scope_tokens.focus, '#3858e9', `${label}: owned focus token drifted.`);
  assert.equal(observation.computed.card_background, expected.surface, `${label}: card surface changed.`);
  assert.equal(observation.computed.card_border, expected.border, `${label}: card border changed.`);
  assert.equal(observation.computed.name_color, expected.text, `${label}: primary text changed.`);
  assert.equal(observation.computed.meta_color, expected.muted, `${label}: muted text changed.`);
  assert.equal(observation.computed.open_background, expected.accent, `${label}: primary action changed.`);
  assert.equal(observation.computed.search_background, expected.surface, `${label}: search surface changed.`);
  assert.equal(observation.computed.search_border, expected.controlBorder, `${label}: control border changed.`);
  assert.equal(observation.computed.search_color, expected.text, `${label}: search text changed.`);
  assert.equal(observation.computed.overdue_color, expected.error, `${label}: overdue/error color changed.`);
}

async function mutateExternalThemeTokens(page) {
  await page.addStyleTag({ content: `
    .gpp-inbox-surface,
    .gflow-inbox.gflow-grid.gflow-common {
      --gpp-inbox-canvas: rgb(1, 2, 3) !important;
      --wpds-color-background-surface-neutral-weak: rgb(1, 2, 3) !important;
      --wpds-color-background-surface-neutral: rgb(9, 10, 11) !important;
      --wpds-color-foreground-content-neutral: rgb(12, 13, 14) !important;
      --wpds-color-foreground-content-neutral-weak: rgb(15, 16, 17) !important;
      --wpds-color-stroke-surface-neutral-weak: rgb(18, 19, 20) !important;
      --wpds-color-stroke-interactive-neutral: rgb(21, 22, 23) !important;
      --wpds-color-background-interactive-brand-strong: rgb(24, 25, 26) !important;
      --wpds-color-background-interactive-brand-strong-active: rgb(27, 28, 29) !important;
      --wpds-color-stroke-focus: rgb(30, 31, 32) !important;
      --wpds-color-foreground-content-error: rgb(33, 34, 35) !important;
    }
  ` });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function proveOverdueAssertionCausality(page, label) {
  const regressionStyle = await page.addStyleTag({ content: `
    .gflow-inbox.gflow-grid.gflow-common .gpp-inbox-card__due--overdue dd {
      color: var(--wpds-color-foreground-content-error, #b42318);
    }
  ` });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const falsified = await observe(page);
  assert.equal(falsified.computed.overdue_color, hostileError, `${label}: falsification did not restore external error-token authority.`);
  assert.throws(
    () => assertOwnedPalette(falsified, `${label} falsification`),
    error => error?.code === 'ERR_ASSERTION' && /overdue\/error color changed/.test(error.message),
    `${label}: overdue assertion did not reject external error-token takeover.`
  );

  await regressionStyle.evaluate(node => node.remove());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const restored = await observe(page);
  assertOwnedPalette(restored, `${label} restored`);

  return {
    simulated_external_token_color: falsified.computed.overdue_color,
    assertion_rejected_takeover: true,
    restored_overdue_color: restored.computed.overdue_color,
  };
}

async function verifyViewport(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(manifest.frontend_inbox_url, { waitUntil: 'networkidle' });
  await waitForCardMode(page);
  const overdueFixture = await ensureOverdueObservable(page);
  const before = await observe(page);
  assert.equal(before.direction, 'rtl', `P05 ${width}px: Inbox is not RTL before mutation.`);
  assert.equal(before.canvas, expected.canvas, `P05 ${width}px: baseline canvas is unexpected.`);
  assert.equal(before.card_mode, true, `P05 ${width}px: card mode is not active on canonical fixture.`);
  assertOwnedPalette(before, `P05 ${width}px baseline`);
  assert.equal(before.outside_scope_token, '', `P05 ${width}px: Inbox-owned token leaked to body.`);

  await mutateExternalThemeTokens(page);
  const after = await observe(page);
  assert.equal(after.direction, 'rtl', `P05 ${width}px: RTL changed after host-token mutation.`);
  assert.equal(after.scope_tokens.canvas, mutatedCanvas, `P05 ${width}px: admitted semantic canvas alias did not accept host override.`);
  assert.equal(after.canvas, mutatedCanvas, `P05 ${width}px: admitted theme-semantic canvas did not follow host override.`);
  assert.equal(after.computed.grid_background, mutatedCanvas, `P05 ${width}px: card-mode canvas did not follow admitted host override.`);
  assertOwnedPalette(after, `P05 ${width}px mutated`);
  assert.deepEqual(normalizeGeometry(after), normalizeGeometry(before), `P05 ${width}px: palette mutation changed Inbox geometry.`);
  assert.equal(after.outside_scope_token, '', `P05 ${width}px: owned palette leaked outside Inbox scope after mutation.`);

  const falsification = await proveOverdueAssertionCausality(page, `P05 ${width}px`);
  return { width, height, overdue_fixture: overdueFixture, before, after, falsification };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();
const results = {
  status: 'PASS',
  repository_head: repositoryHead,
  playwright_version: playwrightVersion,
  contract: {
    host_semantic: ['--gpp-inbox-canvas'],
    gpp_owned_deterministic: [
      '--gpp-inbox-surface', '--gpp-inbox-text', '--gpp-inbox-text-muted', '--gpp-inbox-border',
      '--gpp-inbox-control-border', '--gpp-inbox-accent', '--gpp-inbox-accent-active', '--gpp-inbox-focus',
      '.gpp-inbox-card__due--overdue dd color',
    ],
  },
  viewports: [],
  assertions: {
    authenticated_native_inbox: true,
    host_canvas_remains_semantic: false,
    gpp_owned_palette_resists_external_wpds_mutation: false,
    overdue_observable_and_color_proven: false,
    overdue_external_token_takeover_is_detected_by_assertion: false,
    no_scope_leak: false,
    rtl_and_geometry_preserved: false,
    card_mode_preserved: false,
    focus_contract_cross_checked_by_wu17: true,
  },
};

try {
  results.viewports.push(await verifyViewport(page, 1366, 1000));
  results.viewports.push(await verifyViewport(page, 760, 1000));

  for (const viewport of results.viewports) {
    assert.equal(viewport.after.scope_tokens.focus, '#3858e9');
    assert.equal(viewport.before.computed.overdue_color, expected.error);
    assert.equal(viewport.after.computed.overdue_color, expected.error);
    assert.equal(viewport.falsification.simulated_external_token_color, hostileError);
    assert.equal(viewport.falsification.assertion_rejected_takeover, true);
    assert.equal(viewport.falsification.restored_overdue_color, expected.error);
  }

  results.assertions.host_canvas_remains_semantic = true;
  results.assertions.gpp_owned_palette_resists_external_wpds_mutation = true;
  results.assertions.overdue_observable_and_color_proven = true;
  results.assertions.overdue_external_token_takeover_is_detected_by_assertion = true;
  results.assertions.no_scope_leak = true;
  results.assertions.rtl_and_geometry_preserved = true;
  results.assertions.card_mode_preserved = results.viewports.every(item => item.before.card_mode && item.after.card_mode);
} catch (error) {
  results.status = 'FAIL';
  results.error = String(error?.stack || error);
} finally {
  await browser.close();
}

fs.mkdirSync(artifactDir, { recursive: true });
const artifactPath = path.join(artifactDir, 'p05-inbox-palette-contract.json');
fs.writeFileSync(artifactPath, `${JSON.stringify(results, null, 2)}\n`);

const browserResultsPath = path.join(artifactDir, 'browser-results.json');
if (!fs.existsSync(browserResultsPath)) throw new Error('P05 canonical browser-results evidence is unavailable.');
const browserResults = JSON.parse(fs.readFileSync(browserResultsPath, 'utf8'));
browserResults.p05_inbox_palette_contract = results;
fs.writeFileSync(browserResultsPath, `${JSON.stringify(browserResults, null, 2)}\n`);

if (results.status !== 'PASS') {
  console.error(results.error || 'P05 Inbox palette contract regression failed.');
  process.exit(1);
}

console.log('P05_INBOX_PALETTE_CONTRACT_PASS');
console.log(JSON.stringify({
  status: results.status,
  repository_head: results.repository_head,
  artifact: artifactPath,
  assertions: results.assertions,
}));