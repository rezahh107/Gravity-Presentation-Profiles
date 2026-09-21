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
const adapterPath = path.resolve('src/SRWF/GravityFlow/PrintDossierPresentationAdapter.php');
const cssSha256 = crypto.createHash('sha256').update(fs.readFileSync(cssPath)).digest('hex');
const expectedAssetVersion = cssSha256.slice(0, 16);
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const requiredFontWeights = ['300', '400', '500', '700', '900'];
const expectedFixtureMarker = 'vazir-loader-interface-local-font-fixture-v1';

function run(command, args, options = {}) {
  const cp = spawnSync(command, args, { encoding: 'utf8', env: process.env, ...options });
  if (cp.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function wpEval(code) {
  return run('php', [wpCli, `--path=${wpPath}`, 'eval', code]);
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu19_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!manifest?.alpha?.entry_id) throw new Error('WU03 print fixture manifest is incomplete.');
const alpha = manifest.alpha;

// WP-CLI eval is a separate request lifecycle and is not authoritative for
// hooks registered later in an HTTP Print request. Use it only for immutable
// adapter/font constants; the actual seam is proved by the authentic Print
// response below.
const runtimeContract = JSON.parse(wpEval(`
$loader = class_exists('VazirFont_Loader') ? VazirFont_Loader::get_instance() : null;
$adapter = '\\GravityPresentationProfiles\\SRWF\\GravityFlow\\PrintDossierPresentationAdapter';
echo wp_json_encode(array(
  'loader_available' => is_object($loader),
  'selected_weights' => is_object($loader) && method_exists($loader, 'get_selected_weights') ? $loader->get_selected_weights() : array(),
  'fixture_marker' => defined('GPP_WU03_FONT_PROVIDER_CONTRACT') ? GPP_WU03_FONT_PROVIDER_CONTRACT : null,
  'dossier_style_handle' => $adapter::DOSSIER_STYLE_HANDLE,
  'vazir_style_handle' => $adapter::VAZIR_STYLE_HANDLE,
), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));

const sourceContract = {
  vazir_native_filter_declared: adapterSource.includes("add_filter( 'gravityflow_print_styles', array( __CLASS__, 'includeVazirPrintStyle' ), 20, 2 )"),
  dossier_native_filter_declared: adapterSource.includes("add_filter( 'gravityflow_print_styles', array( __CLASS__, 'includeDossierPrintStyle' ), 30, 2 )"),
  content_addressed_dossier_version_declared:
    adapterSource.includes('$version = self::assetVersion( $path );') &&
    adapterSource.includes('if ( false === $version )') &&
    adapterSource.includes("wp_register_style(\n            self::DOSSIER_STYLE_HANDLE") &&
    adapterSource.includes("            $version,\n            'all'"),
  manual_style_version_authority_absent: !adapterSource.includes('STYLE_VERSION'),
  legacy_manual_link_absent: !adapterSource.includes("echo '<link") && !adapterSource.includes('gpp-print-dossier-css"'),
};

if (!runtimeContract.loader_available) throw new Error('WU03 font contract fixture did not expose VazirFont_Loader.');
if (runtimeContract.fixture_marker !== expectedFixtureMarker) throw new Error('WU03 font contract fixture identity mismatch.');
if (JSON.stringify(runtimeContract.selected_weights) !== JSON.stringify(requiredFontWeights)) throw new Error('WU03 font contract fixture weights mismatch.');
if (runtimeContract.dossier_style_handle !== 'gpp-print-dossier' || runtimeContract.vazir_style_handle !== 'vazir-font-frontend') {
  throw new Error(`Unexpected canonical style handles: ${JSON.stringify(runtimeContract)}`);
}
if (!Object.values(sourceContract).every(Boolean)) throw new Error(`Production adapter source no longer declares one native content-addressed Print stylesheet path: ${JSON.stringify(sourceContract)}`);

const cookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('bootstrap_admin unavailable');
$expiration = time() + 600;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
));
`));

function pdfInfo(pdfPath) {
  const out = run('pdfinfo', [pdfPath]);
  const pages = out.match(/^Pages:\s+(\d+)/m);
  const size = out.match(/^Page size:\s+([0-9.]+) x ([0-9.]+) pts(?: \(([^)]+)\))?/m);
  if (!pages || !size) throw new Error(`Incomplete pdfinfo for ${pdfPath}`);
  return { pages: Number(pages[1]), width_pt: Number(size[1]), height_pt: Number(size[2]), label: size[3] || null };
}

function isA4(pdf) {
  return pdf.pages === 2 && Math.abs(pdf.width_pt - 595.28) < 1 && Math.abs(pdf.height_pt - 841.89) < 1;
}

fs.mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let state;
try {
  const context = await browser.newContext();
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
  const page = await context.newPage({ viewport: { width: 1280, height: 1000 } });
  const url = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${alpha.entry_id}&gpp_presentation=dossier`;
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-print-dossier[data-gpp-print-state="ready"]', { timeout: 30000 });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts?.ready);

  state = await page.evaluate(() => {
    const dossier = document.querySelector('.gpp-print-dossier[data-gpp-print-state="ready"]');
    const sheets = Array.from(document.querySelectorAll('.gpp-print-sheet'));
    const sheet = sheets[0] || null;
    const styleNodes = Array.from(document.querySelectorAll('link[rel="stylesheet"], style[id]')).map((node, index) => ({
      index,
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      href: node.tagName === 'LINK' ? node.href : null,
      text: node.tagName === 'STYLE' ? (node.textContent || '').slice(0, 12000) : null,
    }));
    const fontFaces = document.fonts
      ? Array.from(document.fonts).filter(face => /Vazir/i.test(face.family)).map(face => ({ family: face.family, weight: face.weight, status: face.status }))
      : [];
    const dims = node => node ? {
      width: getComputedStyle(node).width,
      height: getComputedStyle(node).height,
      scroll_width: node.scrollWidth,
      client_width: node.clientWidth,
      scroll_height: node.scrollHeight,
      client_height: node.clientHeight,
    } : null;

    return {
      http_status: performance.getEntriesByType('navigation')[0]?.responseStatus || null,
      ready: Boolean(dossier),
      dir: dossier?.getAttribute('dir') || null,
      profile_id: dossier?.dataset.gppProfileId || null,
      dossier_link_count: document.querySelectorAll('#gpp-print-dossier-css').length,
      font_contract_inline_count: document.querySelectorAll('#vazir-font-frontend-inline-css').length,
      style_nodes: styleNodes,
      font_family: sheet ? getComputedStyle(sheet).fontFamily : null,
      font_faces: fontFaces,
      sheet_count: sheets.length,
      page_order: sheets.map(node => node.dataset.gppPrintPage || null),
      front: dims(document.querySelector('#gpp-print-front')),
      back: dims(document.querySelector('#gpp-print-back')),
      overflow_free: sheets.every(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1),
      trace_text: document.querySelector('.gpp-print-decision-trace')?.textContent?.trim() || null,
    };
  });
  state.http_status = response?.status() ?? state.http_status;

  const dossierStyle = state.style_nodes.find(node => node.id === 'gpp-print-dossier-css') || null;
  const fontContractStyle = state.style_nodes.find(node => node.id === 'vazir-font-frontend-inline-css') || null;
  state.dossier_style = dossierStyle;
  state.font_contract_style = fontContractStyle;
  state.dossier_after_font_contract = Boolean(fontContractStyle && dossierStyle && dossierStyle.index > fontContractStyle.index);
  state.font_contract_face_present = Boolean(fontContractStyle?.text?.includes("font-family: 'Vazir'"));
  state.all_font_contract_faces_loaded = requiredFontWeights.every(weight => state.font_faces.some(face => String(face.weight) === weight && face.status === 'loaded'));
  state.asset_version = dossierStyle?.href ? new URL(dossierStyle.href).searchParams.get('ver') : null;
  state.asset_path_matches = Boolean(dossierStyle?.href && new URL(dossierStyle.href).pathname.endsWith('/gravity-presentation-profiles/assets/css/srwf-gravity-flow-print-dossier.css'));

  const pdfPath = path.join(artifactDir, 'gpp-rp-wu03-production-native-seam.pdf');
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, scale: 1 });
  state.pdf = pdfInfo(pdfPath);
  state.pdf_sha256 = crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex');
} finally {
  await browser.close();
}

const hardGates = {
  authentic_http_response: state.http_status === 200,
  dossier_ready: state.ready === true,
  native_filter_source_contract: Object.values(sourceContract).every(Boolean),
  single_dossier_stylesheet_delivery: state.dossier_link_count === 1 && Boolean(state.dossier_style),
  stylesheet_is_canonical_asset: state.asset_path_matches === true,
  deterministic_asset_identity: state.asset_version === expectedAssetVersion,
  font_contract_present: state.font_contract_inline_count === 1 && state.font_contract_face_present,
  font_contract_loaded: state.all_font_contract_faces_loaded,
  dossier_font_family_contract: /Vazir/i.test(state.font_family || ''),
  stylesheet_order_after_font_contract: state.dossier_after_font_contract,
  rtl: state.dir === 'rtl',
  front_back_order: state.sheet_count === 2 && JSON.stringify(state.page_order) === JSON.stringify(['front', 'back']),
  a4_two_page_pdf: isA4(state.pdf),
  no_overflow: state.overflow_free,
};

const pass = Object.values(hardGates).every(Boolean);
const disposition = pass ? 'PRODUCTION_NATIVE_SEAM_REGRESSION_PROVEN' : 'PRODUCTION_NATIVE_SEAM_REGRESSION_FAILED';
const evidence = {
  schema_version: '3.1.0',
  work_unit: 'GPP-RP-WU-03-PRINT-STYLESHEET-SEAM',
  problems: ['P-18'],
  claim_ceiling: 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  repository_head: repoSha,
  objective: 'Regression-protect the canonical production Gravity Flow print stylesheet seam after P-18 repair.',
  non_goals: [
    'compare historical manual and native alternatives',
    'change Print authorization',
    'visual redesign',
    'execute the private Vazir package',
    'claim equivalence to production font binaries',
  ],
  runtime: {
    wordpress: '6.8.3',
    gravity_forms: '3.1.1.1',
    gravity_flow: '3.1.0',
    node: process.version,
    playwright: playwrightVersion,
    dossier_css_sha256: cssSha256,
    dossier_css_version: expectedAssetVersion,
    font_provider_fixture: runtimeContract.fixture_marker,
  },
  canonical_constants: runtimeContract,
  production_source_contract: sourceContract,
  production_observation: state,
  hard_gates: hardGates,
  hard_gate_result: pass ? 'PASS' : 'FAIL',
  disposition,
};

const out = path.join(artifactDir, 'gpp-rp-wu03-print-stylesheet-seam.json');
fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({
  status: pass ? 'EVIDENCE_COMPLETE' : 'EVIDENCE_FAILED',
  disposition,
  hard_gate_result: evidence.hard_gate_result,
  artifact: out,
}));
if (!pass) process.exit(1);
