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
const vazirCommit = 'ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1';
const vazirDir = path.join(wpPath, 'wp-content', 'plugins', 'vazir-font-wp');

function run(command, args, options = {}) {
  const cp = spawnSync(command, args, { encoding: 'utf8', env: process.env, ...options });
  if (cp.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
function wpEval(code) {
  return run('php', [wpCli, `--path=${wpPath}`, 'eval', code]);
}
function wp(...args) {
  return run('php', [wpCli, `--path=${wpPath}`, ...args]);
}

if (fs.existsSync(vazirDir)) fs.rmSync(vazirDir, { recursive: true, force: true });
run('git', ['clone', '--filter=blob:none', '--no-tags', 'https://github.com/rezahh107/Vazir.git', vazirDir]);
run('git', ['-C', vazirDir, 'checkout', '--detach', vazirCommit]);
const actualVazirCommit = run('git', ['-C', vazirDir, 'rev-parse', 'HEAD']);
if (actualVazirCommit !== vazirCommit) throw new Error('Pinned Vazir source identity mismatch.');
wp('plugin', 'activate', 'vazir-font-wp');
const vazirVersion = wp('plugin', 'get', 'vazir-font-wp', '--field=version');
if (vazirVersion !== '1.3.0') throw new Error(`Unexpected Vazir version: ${vazirVersion}`);

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const alpha = manifest.alpha;
const fontRuntime = JSON.parse(wpEval(`
$loader = class_exists('VazirFont_Loader') ? VazirFont_Loader::get_instance() : null;
echo wp_json_encode(array(
  'loader_available' => is_object($loader),
  'selected_weights' => is_object($loader) ? $loader->get_selected_weights() : array(),
  'options' => class_exists('VazirFontPlugin') ? VazirFontPlugin::get_options() : array(),
), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));
const cookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('bootstrap_admin unavailable');
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
add_filter('gravityflow_print_styles', static function ($styles, $entry_ids) {
    unset($entry_ids);
    if (!isset($_GET['gpp_wu03_styles']) || 'candidate' !== sanitize_key(wp_unslash($_GET['gpp_wu03_styles']))) return $styles;
    if (!defined('GPP_PLUGIN_FILE')) return $styles;
    $path = dirname(GPP_PLUGIN_FILE) . '/assets/css/srwf-gravity-flow-print-dossier.css';
    if (!is_file($path) || !is_readable($path)) return $styles;
    $handle = 'gpp-wu03-native-print-dossier';
    wp_register_style($handle, plugins_url('assets/css/srwf-gravity-flow-print-dossier.css', GPP_PLUGIN_FILE), array(), \\GravityPresentationProfiles\\SRWF\\GravityFlow\\PrintDossierPresentationAdapter::STYLE_VERSION, 'all');
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

function pdfInfo(pdfPath) {
  const out = run('pdfinfo', [pdfPath]);
  const pages = out.match(/^Pages:\s+(\d+)/m);
  const size = out.match(/^Page size:\s+([0-9.]+) x ([0-9.]+) pts(?: \(([^)]+)\))?/m);
  if (!pages || !size) throw new Error(`Incomplete pdfinfo for ${pdfPath}`);
  return { pages: Number(pages[1]), width_pt: Number(size[1]), height_pt: Number(size[2]), label: size[3] || null };
}

async function capture(page, mode) {
  const suffix = mode === 'candidate' ? '&gpp_wu03_styles=candidate' : '';
  const url = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${alpha.entry_id}&gpp_presentation=dossier${suffix}`;
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]', { timeout: 30000 });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts?.ready);

  const state = await page.evaluate(() => {
    const sheets = Array.from(document.querySelectorAll('.gpp-print-sheet'));
    const nodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style[id]')).map((node, index) => ({
      index,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      href: node.tagName === 'LINK' ? node.href : null,
      text: node.tagName === 'STYLE' ? (node.textContent || '').slice(0, 12000) : null,
    }));
    const dossier = document.querySelector('.gpp-print-dossier[data-gpp-print-state="ready"]');
    const trace = document.querySelector('.gpp-print-decision-trace');
    const dims = node => node ? {
      width: getComputedStyle(node).width,
      height: getComputedStyle(node).height,
      scroll_width: node.scrollWidth,
      client_width: node.clientWidth,
      scroll_height: node.scrollHeight,
      client_height: node.clientHeight,
    } : null;
    const fontFaces = document.fonts ? Array.from(document.fonts).filter(face => /Vazir/i.test(face.family)).map(face => ({ family: face.family, weight: face.weight, status: face.status })) : [];
    return {
      http_status: performance.getEntriesByType('navigation')[0]?.responseStatus || null,
      ready: Boolean(dossier),
      dir: dossier?.getAttribute('dir') || null,
      profile_id: dossier?.dataset.gppProfileId || null,
      nodes,
      manual_link_count: document.querySelectorAll('#gpp-print-dossier-css').length,
      candidate_link_count: document.querySelectorAll('#gpp-wu03-native-print-dossier-css').length,
      vazir_inline_count: document.querySelectorAll('#vazir-font-frontend-inline-css').length,
      font_family: dossier ? getComputedStyle(dossier).fontFamily : null,
      font_faces: fontFaces,
      sheet_count: sheets.length,
      page_order: sheets.map(node => node.dataset.gppPrintPage || null),
      front: dims(document.querySelector('#gpp-print-front')),
      back: dims(document.querySelector('#gpp-print-back')),
      overflow_free: sheets.every(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1),
      trace_text: trace?.textContent?.trim() || null,
      text_content: dossier?.textContent?.replace(/\s+/g, ' ').trim() || null,
    };
  });
  state.http_status = response?.status() ?? state.http_status;

  const pdfPath = path.join(artifactDir, `gpp-rp-wu03-${mode}.pdf`);
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, scale: 1 });
  state.pdf = pdfInfo(pdfPath);
  state.pdf_sha256 = crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex');
  state.dossier_style = state.nodes.find(node => mode === 'candidate' ? node.id === 'gpp-wu03-native-print-dossier-css' : node.id === 'gpp-print-dossier-css') || null;
  state.vazir_style = state.nodes.find(node => node.id === 'vazir-font-frontend-inline-css') || null;
  state.dossier_after_vazir = Boolean(state.vazir_style && state.dossier_style && state.dossier_style.index > state.vazir_style.index);
  state.vazir_font_face_present = Boolean(state.vazir_style?.text?.includes("font-family: 'Vazir'"));
  state.all_vazir_faces_loaded = state.font_faces.length >= 5 && state.font_faces.every(face => face.status === 'loaded');
  state.asset_version = state.dossier_style?.href ? new URL(state.dossier_style.href).searchParams.get('ver') : null;
  return state;
}

fs.mkdirSync(artifactDir, { recursive: true });
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

function isA4(pdf) {
  return pdf.pages === 2 && Math.abs(pdf.width_pt - 595.28) < 1 && Math.abs(pdf.height_pt - 841.89) < 1;
}
function gate(state, mode) {
  return {
    http_ok: state.http_status === 200,
    ready: state.ready,
    stylesheet_present: Boolean(state.dossier_style),
    stylesheet_single_delivery: mode === 'control' ? state.manual_link_count === 1 : state.candidate_link_count === 1 && state.manual_link_count === 0,
    deterministic_asset_identity: state.asset_version === '1.0.1' && cssSha256.length === 64,
    vazir_present: state.vazir_inline_count === 1 && state.vazir_font_face_present,
    vazir_loaded: state.all_vazir_faces_loaded,
    stylesheet_order_after_vazir: state.dossier_after_vazir,
    rtl: state.dir === 'rtl',
    front_back_order: state.sheet_count === 2 && JSON.stringify(state.page_order) === JSON.stringify(['front', 'back']),
    a4_two_page_pdf: isA4(state.pdf),
    no_overflow: state.overflow_free,
  };
}
const controlGates = gate(control, 'control');
const candidateGates = gate(candidate, 'candidate');
const controlPass = Object.values(controlGates).every(Boolean);
const candidatePass = Object.values(candidateGates).every(Boolean);
const materialEquivalent =
  control.ready && candidate.ready &&
  control.profile_id === candidate.profile_id &&
  control.font_family === candidate.font_family &&
  control.text_content === candidate.text_content &&
  control.trace_text === candidate.trace_text &&
  JSON.stringify(control.page_order) === JSON.stringify(candidate.page_order) &&
  control.front?.width === candidate.front?.width && control.front?.height === candidate.front?.height &&
  control.back?.width === candidate.back?.width && control.back?.height === candidate.back?.height &&
  JSON.stringify(control.pdf) === JSON.stringify(candidate.pdf) &&
  control.asset_version === candidate.asset_version;

let disposition = 'NOT_PROVEN';
if (controlPass && candidatePass && materialEquivalent) disposition = 'EQUIVALENT_ALTERNATIVES_NO_MATERIAL_OUTPUT_DIFFERENCE';
else if (!controlPass && candidatePass) disposition = 'OFFICIAL_NATIVE_SEAM_UNIQUELY_QUALIFIED';
else if (controlPass && !candidatePass) disposition = 'KEEP_CURRENT_DELIVERY_QUALIFIED';

const evidence = {
  schema_version: '2.0.0',
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
    vazir: { version: vazirVersion, repository: 'rezahh107/Vazir', commit: actualVazirCommit },
    node: process.version,
    playwright: playwrightVersion,
    dossier_css_sha256: cssSha256,
  },
  font_authority: {
    ...fontRuntime,
    required_weights: ['300', '400', '500', '700', '900'],
    authority: 'rezahh107/Vazir@ad8feae35a4e1c27fb13d646fa18abf05bb4e7b1',
  },
  control: { delivery: 'production_manual_footer_link', ...control, hard_gates: controlGates },
  candidate: { delivery: 'test_only_gravityflow_print_styles', ...candidate, hard_gates: candidateGates },
  comparison: { material_equivalent: materialEquivalent, pdf_bytes_equal: control.pdf_sha256 === candidate.pdf_sha256 },
  hard_gate_result: controlPass && candidatePass ? 'PASS' : 'FAIL',
  disposition,
  production_direction: disposition === 'OFFICIAL_NATIVE_SEAM_UNIQUELY_QUALIFIED'
    ? 'Later production repair should move dossier CSS to gravityflow_print_styles and remove the manual footer link.'
    : disposition === 'KEEP_CURRENT_DELIVERY_QUALIFIED'
      ? 'Keep current manual delivery; native seam did not survive all hard gates.'
      : disposition === 'EQUIVALENT_ALTERNATIVES_NO_MATERIAL_OUTPUT_DIFFERENCE'
        ? 'Both delivery methods survive the pinned runtime gates. A later canonicalization PR may move dossier CSS to the official gravityflow_print_styles seam without an evidence-supported output change.'
        : null,
};

const out = path.join(artifactDir, 'gpp-rp-wu03-print-stylesheet-seam.json');
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ status: 'EVIDENCE_COMPLETE', disposition, hard_gate_result: evidence.hard_gate_result, artifact: out }));
