import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const BOUND_HEAD = '58176df6d7232e3996a62c5d1261b3172402b8aa';
const CANDIDATES = [20, 40, 80, 120, 160, 200, 240, 320];
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const baseUrl = process.env.WU21_BASE_URL;
if (!artifactDir || !wpPath || !wpCli || !repoRoot || !baseUrl) {
  throw new Error('PR87 row-buffer sweep requires the pinned WU21 environment.');
}

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const p06 = JSON.parse(execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', 'echo wp_json_encode(get_option("gpp_p06_fixture_manifest"));'], { encoding: 'utf8' }).trim());
if (!fixture?.frontend_inbox_url || !Number.isInteger(fixture?.frontend_inbox_page_id) || !p06?.authentic_block_page?.url || !Number.isInteger(p06?.authentic_block_page?.page_id)) {
  throw new Error('Authentic shortcode/block fixture identities are unavailable.');
}

const sourceProbePath = path.join(artifactDir, 'pr87-row-buffer-source-probe.json');
assert.equal(fs.existsSync(sourceProbePath), true, 'Pinned row-buffer source probe is required.');
const sourceProbe = JSON.parse(fs.readFileSync(sourceProbePath, 'utf8'));
assert.ok(Number(sourceProbe?.counts_by_term?.rowBuffer || 0) > 0, 'Pinned AG Grid source does not expose rowBuffer.');
assert.ok(Number(sourceProbe?.counts_by_term?.gravityflow_js_config_shared || 0) > 0, 'Pinned Gravity Flow source does not expose gravityflow_js_config_shared.');

const diffNames = execFileSync('git', ['diff', '--name-only', `${BOUND_HEAD}...HEAD`], { cwd: repoRoot, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const productionMutation = diffNames.some(name => name.startsWith('assets/') || name.startsWith('src/') || name === 'gravity-presentation-profiles.php');
assert.equal(productionMutation, false, `Qualification branch mutated production source: ${diffNames.join(', ')}`);

const wp = code => execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' }).trim();
const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+2400; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const routes = { shortcode: fixture.frontend_inbox_url, block: p06.authentic_block_page.url };
const targetPageIds = [fixture.frontend_inbox_page_id, p06.authentic_block_page.page_id];
const muDir = path.join(wpPath, 'wp-content', 'mu-plugins');
const muPath = path.join(muDir, 'gpp-pr87-row-buffer-counterfactual.php');
const scope = '.gflow-inbox.gflow-grid.gflow-common';
const rowsSelector = `${scope} .ag-center-cols-container > .ag-row`;

function muSource(rowBuffer) {
  return `<?php\n/* Qualification-only runtime counterfactual; never shipped. */\nadd_filter( 'gravityflow_js_config_shared', function ( $config ) {\n    if ( ! is_page( ${JSON.stringify(targetPageIds)} ) || empty( $config['grids'] ) || ! is_array( $config['grids'] ) ) {\n        return $config;\n    }\n    foreach ( $config['grids'] as &$grid ) {\n        if ( isset( $grid['grid_options'] ) && is_array( $grid['grid_options'] ) ) {\n            $grid['grid_options']['rowBuffer'] = ${rowBuffer};\n        }\n    }\n    unset( $grid );\n    return $config;\n}, 99, 1 );\n`;
}

async function measure(page, candidate, label) {
  return page.evaluate(({ scope, candidate, label }) => {
    const inbox = document.querySelector(scope);
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, width: r.width, height: r.height, inline: el.getAttribute('style') };
    };
    const body = box(inbox?.querySelector('.ag-body-viewport'));
    const pager = box(inbox?.querySelector('.ag-paging-panel'));
    const rows = [...(inbox?.querySelectorAll('.ag-center-cols-container > .ag-row') || [])];
    const cards = [...(inbox?.querySelectorAll('.gpp-inbox-card') || [])].filter(el => el.getBoundingClientRect().height > 0).map(box);
    const visualBottom = cards.length ? Math.max(...cards.map(card => card.bottom)) : null;
    const widthOwner = inbox?.closest('[data-gpp-inbox-surface]') || inbox;
    return {
      label,
      row_count: rows.length,
      visible_card_count: cards.length,
      native_grid_body_height: body?.height ?? null,
      last_card_to_pager_gap: cards.length && pager ? pager.top - visualBottom : null,
      horizontal_overflow_surface: widthOwner ? Math.max(0, widthOwner.scrollWidth - widthOwner.clientWidth) : null,
      horizontal_overflow_document: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      localized_row_buffer_marker: [...document.scripts].some(script => (script.textContent || '').includes(`"rowBuffer":${candidate}`)),
    };
  }, { scope, candidate, label });
}

async function stableMeasure(page, candidate, label) {
  await page.waitForSelector(`${scope} .ag-root-wrapper`, { timeout: 30000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  let previous = null;
  let stable = 0;
  let latest = null;
  for (let i = 0; i < 32; i += 1) {
    latest = await measure(page, candidate, label);
    const signature = `${latest.row_count}:${latest.visible_card_count}:${Math.round(latest.native_grid_body_height || 0)}`;
    stable = signature === previous ? stable + 1 : 0;
    previous = signature;
    if (stable >= 4) return latest;
    await page.waitForTimeout(250);
  }
  return latest;
}

function geometryOk(observation, expectedRows) {
  if (!observation) return false;
  const gapOk = expectedRows === 0 || (observation.last_card_to_pager_gap !== null && observation.last_card_to_pager_gap >= 0 && observation.last_card_to_pager_gap <= 64);
  return observation.row_count === expectedRows && observation.visible_card_count === expectedRows && gapOk && observation.horizontal_overflow_surface === 0 && observation.horizontal_overflow_document === 0 && observation.localized_row_buffer_marker === true;
}

const report = {
  schema_version: '1.0.0',
  repository: 'rezahh107/Gravity-Presentation-Profiles',
  pr: 87,
  bound_production_head: BOUND_HEAD,
  qualification_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  production_source_mutation: productionMutation ? 'YES' : 'NO',
  source_contract: {
    gravityflow_version: '3.1.0',
    gravityflow_package_sha256: 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404',
    gravityflow_js_config_shared_occurrences: sourceProbe.counts_by_term.gravityflow_js_config_shared,
    rowBuffer_occurrences: sourceProbe.counts_by_term.rowBuffer,
  },
  candidates: CANDIDATES,
  observations: [],
  selected_candidate: null,
  result: 'RUNNING',
};

fs.mkdirSync(muDir, { recursive: true });
if (fs.existsSync(muPath)) fs.rmSync(muPath);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce' });
await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
try {
  for (const candidate of CANDIDATES) {
    fs.writeFileSync(muPath, muSource(candidate));
    const candidateReport = { row_buffer: candidate, routes: {}, qualifies: false };
    for (const [route, url] of Object.entries(routes)) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1440, height: 1000 });
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        const fresh = await stableMeasure(page, candidate, `${route}/desktop/fresh`);
        const next = page.locator(`${scope} [ref="btNext"]`);
        assert.equal(await next.count(), 1, `Native next-page control unavailable for ${route}.`);
        await next.click();
        const page2 = await stableMeasure(page, candidate, `${route}/desktop/page-2`);
        candidateReport.routes[route] = { fresh, page_2: page2, fresh_ok: geometryOk(fresh, 20), page_2_ok: geometryOk(page2, 5) };
      } finally {
        await page.close();
      }
    }
    candidateReport.qualifies = Object.values(candidateReport.routes).every(route => route.fresh_ok && route.page_2_ok);
    report.observations.push(candidateReport);
    if (candidateReport.qualifies && report.selected_candidate === null) report.selected_candidate = candidate;
    fs.rmSync(muPath, { force: true });
  }
  report.result = report.selected_candidate === null ? 'NO_ROW_BUFFER_CANDIDATE_FOUND' : 'ROW_BUFFER_CANDIDATE_SELECTED';
} finally {
  fs.rmSync(muPath, { force: true });
  await browser.close();
  fs.writeFileSync(path.join(artifactDir, 'pr87-row-buffer-sweep.json'), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`PR87_ROW_BUFFER_SWEEP=${report.result}`);
console.log(JSON.stringify({ selected_candidate: report.selected_candidate, observations: report.observations.map(item => ({ row_buffer: item.row_buffer, qualifies: item.qualifies, routes: Object.fromEntries(Object.entries(item.routes).map(([route, value]) => [route, { fresh_rows: value.fresh?.row_count, page_2_rows: value.page_2?.row_count, fresh_gap: value.fresh?.last_card_to_pager_gap, page_2_gap: value.page_2?.last_card_to_pager_gap }])) })) }, null, 2));

if (report.selected_candidate !== null) {
  const sourcePath = path.join(repoRoot, 'tests/repro-evidence-lab/pr87-row-buffer-counterfactual.mjs');
  const generatedPath = path.join(repoRoot, 'tests/repro-evidence-lab/.pr87-row-buffer-selected-runtime.mjs');
  let source = fs.readFileSync(sourcePath, 'utf8');
  source = source.replace('const ROW_BUFFER = 20;', `const ROW_BUFFER = ${report.selected_candidate};`);
  source = source.replace(`includes('"rowBuffer":20')`, `includes('"rowBuffer":${report.selected_candidate}')`);
  assert.ok(source.includes(`const ROW_BUFFER = ${report.selected_candidate};`), 'Failed to bind selected rowBuffer into full lifecycle qualification.');
  assert.ok(source.includes(`includes('"rowBuffer":${report.selected_candidate}')`), 'Failed to bind selected rowBuffer marker into full lifecycle qualification.');
  fs.writeFileSync(generatedPath, source);
  try {
    await import(`${pathToFileURL(generatedPath).href}?candidate=${report.selected_candidate}`);
  } finally {
    fs.rmSync(generatedPath, { force: true });
  }
}
