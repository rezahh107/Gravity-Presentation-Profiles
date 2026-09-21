import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU03 requires the admitted WU19 runtime environment.');

const repoSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const playwrightVersion = JSON.parse(fs.readFileSync('node_modules/playwright/package.json', 'utf8')).version;
const cssPath = path.resolve('assets/css/srwf-gravity-flow-print-dossier.css');
const cssSha256 = crypto.createHash('sha256').update(fs.readFileSync(cssPath)).digest('hex');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha = manifest.alpha;
const cookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) { throw new RuntimeException('bootstrap_admin unavailable'); }
$expiration = time() + 600;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
));
`));

const muDir = path.join(wpPath, 'wp-content', 'mu-plugins');
fs.mkdirSync(muDir, { recursive: true });
const muPath = path.join(muDir, 'gpp-wu03-print-style-seam.php');
fs.writeFileSync(muPath, `<?php
/** Test-only WU03 native Print stylesheet candidate. */
add_filter('gravityflow_print_styles', static function ($styles, $entry_ids) {
    unset($entry_ids);
    if (!isset($_GET['gpp_wu03_styles']) || 'candidate' !== sanitize_key(wp_unslash($_GET['gpp_wu03_styles']))) return $styles;
    if (!defined('GPP_PLUGIN_FILE')) return $styles;
    $path = dirname(GPP_PLUGIN_FILE) . '/assets/css/srwf-gravity-flow-print-dossier.css';
    if (!is_file($path) || !is_readable($path)) return $styles;
    $handle = 'gpp-wu03-native-print-dossier';
    wp_register_style($handle, plugins_url('assets/css/srwf-gravity-flow-print-dossier.css', GPP_PLUGIN_FILE), array(), substr(hash_file('sha256', $path), 0, 16), 'all');
    $styles = is_array($styles) ? $styles : array();
    if (!in_array($handle, $styles, true)) $styles[] = $handle;
    return $styles;
}, 30, 2);
add_action('gravityflow_print_entry_footer', static function () {
    if (!isset($_GET['gpp_wu03_styles']) || 'candidate' !== sanitize_key(wp_unslash($_GET['gpp_wu03_styles']))) return;
    ob_start(static function ($html) {
        return preg_replace('/<link\\s+[^>]*id=["\\']gpp-print-dossier-css["\\'][^>]*\\/?>(?:\\s*)/i', '', $html);
    });
}, 19, 0);
add_action('gravityflow_print_entry_footer', static function () {
    if (!isset($_GET['gpp_wu03_styles']) || 'candidate' !== sanitize_key(wp_unslash($_GET['gpp_wu03_styles']))) return;
    if (ob_get_level() > 0) ob_end_flush();
}, 21, 0);
`);

function pdfPages(pdfPath) {
  const cp = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`pdfinfo failed for ${pdfPath}: ${cp.stderr}`);
  const match = cp.stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error(`Unable to read PDF page count: ${pdfPath}`);
  return Number(match[1]);
}

async function capture(page, mode) {
  const suffix = mode === 'candidate' ? '&gpp_wu03_styles=candidate' : '';
  const url = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${alpha.entry_id}&gpp_presentation=dossier${suffix}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]', { timeout: 30000 });
  await page.emulateMedia({ media: 'print' });

  const state = await page.evaluate(() => {
    const sheet = selector => document.querySelector(selector);
    const sheets = Array.from(document.querySelectorAll('.gpp-print-sheet'));
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link, index) => ({
      index,
      id: link.id || null,
      href: link.href,
      media: link.media || null,
    }));
    const dossier = document.querySelector('.gpp-print-dossier[data-gpp-print-state="ready"]');
    const trace = document.querySelector('.gpp-print-decision-trace');
    const front = sheet('#gpp-print-front');
    const back = sheet('#gpp-print-back');
    const dims = node => node ? {
      width: getComputedStyle(node).width,
      height: getComputedStyle(node).height,
      scroll_width: node.scrollWidth,
      client_width: node.clientWidth,
      scroll_height: node.scrollHeight,
      client_height: node.clientHeight,
    } : null;
    return {
      ready: Boolean(dossier),
      dir: dossier?.getAttribute('dir') || null,
      profile_id: dossier?.dataset.gppProfileId || null,
      links,
      manual_link_count: document.querySelectorAll('#gpp-print-dossier-css').length,
      candidate_link_count: document.querySelectorAll('#gpp-wu03-native-print-dossier-css').length,
      vazir_link_count: document.querySelectorAll('#vazir-font-frontend-css').length,
      font_family: dossier ? getComputedStyle(dossier).fontFamily : null,
      sheet_count: sheets.length,
      page_order: sheets.map(node => node.dataset.gppPrintPage || null),
      front: dims(front),
      back: dims(back),
      overflow_free: sheets.every(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1),
      trace_text: trace?.textContent?.trim() || null,
      text_content: dossier?.textContent?.replace(/\s+/g, ' ').trim() || null,
    };
  });

  const pdfPath = path.join(artifactDir, `gpp-rp-wu03-${mode}.pdf`);
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, scale: 1 });
  state.pdf_pages = pdfPages(pdfPath);
  state.pdf_sha256 = crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex');
  state.dossier_style = state.links.find(link => mode === 'candidate'
    ? link.id === 'gpp-wu03-native-print-dossier-css'
    : link.id === 'gpp-print-dossier-css') || null;
  state.vazir_style = state.links.find(link => link.id === 'vazir-font-frontend-css') || null;
  state.dossier_after_vazir = Boolean(state.dossier_style && state.vazir_style && state.dossier_style.index > state.vazir_style.index);
  return state;
}

const browser = await chromium.launch({ headless: true });
let control;
let candidate;
try {
  const context = await browser.newContext();
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 1000 });
  control = await capture(page, 'control');
  candidate = await capture(page, 'candidate');
} finally {
  await browser.close();
  fs.rmSync(muPath, { force: true });
}

const gate = state => ({
  ready: state.ready,
  stylesheet_present: Boolean(state.dossier_style),
  stylesheet_single_delivery: control === state ? state.manual_link_count === 1 : state.candidate_link_count === 1 && state.manual_link_count === 0,
  stylesheet_order_after_vazir: state.dossier_after_vazir,
  vazir_present: state.vazir_link_count === 1,
  rtl: state.dir === 'rtl',
  front_back_order: state.sheet_count === 2 && JSON.stringify(state.page_order) === JSON.stringify(['front', 'back']),
  exactly_two_pdf_pages: state.pdf_pages === 2,
  no_overflow: state.overflow_free,
});
const controlGates = gate(control);
const candidateGates = gate(candidate);
const controlPass = Object.values(controlGates).every(Boolean);
const candidatePass = Object.values(candidateGates).every(Boolean);
const materialEquivalent =
  control.ready && candidate.ready &&
  control.profile_id === candidate.profile_id &&
  control.font_family === candidate.font_family &&
  control.text_content === candidate.text_content &&
  control.trace_text === candidate.trace_text &&
  JSON.stringify(control.page_order) === JSON.stringify(candidate.page_order) &&
  control.front?.width === candidate.front?.width &&
  control.front?.height === candidate.front?.height &&
  control.back?.width === candidate.back?.width &&
  control.back?.height === candidate.back?.height &&
  control.pdf_pages === candidate.pdf_pages;

let disposition = 'NOT_PROVEN';
if (controlPass && candidatePass && materialEquivalent) disposition = 'EQUIVALENT_ALTERNATIVES_NO_MATERIAL_OUTPUT_DIFFERENCE';
else if (!controlPass && candidatePass) disposition = 'OFFICIAL_NATIVE_SEAM_UNIQUELY_QUALIFIED';
else if (controlPass && !candidatePass) disposition = 'KEEP_CURRENT_DELIVERY_QUALIFIED';

const evidence = {
  schema_version: '1.0.0',
  work_unit: 'GPP-RP-WU-03-PRINT-STYLESHEET-SEAM',
  problems: ['P-18'],
  claim_ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  repository_head: repoSha,
  objective: 'Compare current manual dossier stylesheet delivery with Gravity Flow native gravityflow_print_styles delivery without modifying production delivery.',
  non_goals: ['production Print delivery change', 'authorization change', 'visual redesign'],
  runtime: {
    wordpress: '6.8.3',
    gravity_forms: '3.1.1.1',
    gravity_flow: '3.1.0',
    node: process.version,
    playwright: playwrightVersion,
    css_sha256: cssSha256,
  },
  control: { delivery: 'production_manual_footer_link', ...control, hard_gates: controlGates },
  candidate: { delivery: 'test_only_gravityflow_print_styles', ...candidate, hard_gates: candidateGates },
  comparison: { material_equivalent: materialEquivalent },
  hard_gate_result: controlPass || candidatePass ? 'PASS' : 'NOT_PROVEN',
  disposition,
  production_direction: disposition === 'OFFICIAL_NATIVE_SEAM_UNIQUELY_QUALIFIED'
    ? 'Later production repair should move dossier CSS to gravityflow_print_styles and remove the manual footer link.'
    : disposition === 'KEEP_CURRENT_DELIVERY_QUALIFIED'
      ? 'Keep current manual delivery; native seam did not survive all hard gates.'
      : disposition === 'EQUIVALENT_ALTERNATIVES_NO_MATERIAL_OUTPUT_DIFFERENCE'
        ? 'No unique production direction is established by output behavior alone.'
        : null,
};

fs.mkdirSync(artifactDir, { recursive: true });
const out = path.join(artifactDir, 'gpp-rp-wu03-print-stylesheet-seam.json');
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ status: 'EVIDENCE_COMPLETE', disposition, artifact: out }));
