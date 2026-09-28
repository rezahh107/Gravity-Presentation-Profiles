import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const capture = read('tests/repro-evidence-lab/native-inbox-baseline-capture.mjs');
const bypass = read('tests/repro-evidence-lab/wu21-native-inbox-baseline-mode.php');
const labPlugin = read('tests/repro-evidence-lab/wu21-lab-plugin.php');
const diagnostics = read('tests/visual-regression/inbox-visual-diagnostics.mjs');
const zoomHelper = read('tests/visual-regression/browser-tab-zoom.mjs');
const matrixJ = read('tests/visual-regression/matrix-j-browser-zoom.mjs');

function productionFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionFiles(absolute));
    else if (/\.(php|js|css)$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

const productionSource = [
  read('gravity-presentation-profiles.php'),
  ...productionFiles(path.join(root, 'src')).map(file => fs.readFileSync(file, 'utf8')),
  ...productionFiles(path.join(root, 'assets')).map(file => fs.readFileSync(file, 'utf8')),
].join('\n');

assert.ok(!productionSource.includes('wu21_native_inbox_baseline'), 'Raw Native baseline query seam leaked into production runtime source.');
assert.ok(!productionSource.includes('GPP_WU21_Native_Inbox_Baseline_Mode'), 'WU21 baseline mode leaked into production runtime source.');

assert.match(bypass, /add_action\(\s*'gform_loaded'.*99\s*\)/s, 'Raw Native bypass must run after the existing GPP gform_loaded registration boundary.');
for (const expected of [
  "remove_filter( 'gravityflow_shortcode_inbox'",
  "remove_filter( 'render_block'",
  "remove_action( 'wp_enqueue_scripts'",
  "remove_filter( 'render_block_gravityflow/inbox'",
]) assert.ok(bypass.includes(expected), `Raw Native bypass is missing bounded GPP detachment: ${expected}`);
for (const forbidden of ['remove_all_filters', 'deactivate_plugins', 'wp_dequeue_script', 'wp_dequeue_style', 'gpp_case_card']) {
  assert.ok(!bypass.includes(forbidden), `Raw Native bypass contains forbidden broad/structural operation: ${forbidden}`);
}
assert.ok(labPlugin.includes('wu21-native-inbox-baseline-mode.php'), 'Existing WU21 MU-plugin does not load the bounded Raw Native bypass.');
assert.ok(diagnostics.includes("await import('../repro-evidence-lab/native-inbox-baseline-capture.mjs')"), 'Existing WU21 Inbox diagnostics do not execute baseline capture.');

assert.ok(matrixJ.includes("from './browser-tab-zoom.mjs'"), 'Historical Matrix-J qualification is not wired to the shared browser-zoom implementation.');
for (const sharedCall of ['launchBrowserZoomContext', 'setBrowserTabZoom']) {
  assert.ok(matrixJ.includes(sharedCall), `Historical Matrix-J qualification does not consume shared zoom primitive ${sharedCall}.`);
}
for (const semantic of ['chrome.tabs.setZoom', 'chrome.tabs.getZoom', 'launchPersistentContext']) {
  assert.ok(zoomHelper.includes(semantic), `Shared browser-zoom helper does not preserve Matrix-J semantic ${semantic}.`);
}
assert.match(zoomHelper, /viewport\s*:\s*null/, 'Shared browser-zoom helper must preserve the Matrix-J real-browser viewport semantic.');
assert.ok(matrixJ.includes("api:'chrome.tabs.setZoom(tabId, 2)'"), 'Matrix-J serialized qualification identity changed while reusing the shared helper.');
for (const rejected of ['CSS zoom', 'root font-size scaling', 'deviceScaleFactor substitution', 'screenshot scaling']) {
  assert.ok(zoomHelper.includes(rejected), `Browser-zoom helper no longer rejects approximation: ${rejected}`);
}
for (const forbiddenApproximation of ['style.zoom', 'document.documentElement.style.fontSize', 'deviceScaleFactor: 2']) {
  assert.ok(!capture.includes(forbiddenApproximation), `Baseline capture uses forbidden 200% approximation: ${forbiddenApproximation}`);
}

for (const scenario of [
  "id: 'desktop-1440'",
  "viewport: { width: 1440, height: 1000 }",
  "id: 'mobile-390'",
  "viewport: { width: 390, height: 844 }",
  "id: 'narrow-mobile-320'",
  "viewport: { width: 320, height: 720 }",
  "id: 'browser-zoom-200'",
  'requested_zoom: 2',
]) assert.ok(capture.includes(scenario), `Required Native baseline scenario declaration is missing: ${scenario}`);

for (const identity of [
  "'RAW_NATIVE'",
  "'NATIVE_FIRST_GPP'",
  'native_search_count',
  'native_settings_count',
  'native_fullscreen_count',
  'native_grid_count',
  'native_pager_count',
  'direction_observations',
  'geometry',
  'PROVEN_IN_REPRODUCIBLE_RUNTIME',
  "target_production_equivalence: 'NOT_PROVEN'",
  "owner_site_visual_acceptance: 'NOT_PROVEN'",
  "runtime_golden_approval: 'NOT_ACTIVATED'",
  "approved_visual_contract: 'NOT_ACTIVATED'",
]) assert.ok(capture.includes(identity), `Baseline evidence contract is missing: ${identity}`);

assert.ok(capture.includes('gpp_surface_count, 0') || capture.includes('facts.gpp_surface_count, 0'), 'RAW_NATIVE does not prove GPP wrapper absence.');
assert.ok(capture.includes('facts.gpp_manual_refresh_count, 0'), 'RAW_NATIVE does not prove GPP Manual Refresh absence.');
assert.ok(capture.includes('facts.gpp_surface_count, 1'), 'Paired GPP capture does not prove ordinary GPP surface restoration.');
assert.ok(capture.includes('getBrowserTabZoom(harness.worker, page)'), '200% screenshot is not bound to a non-mutating capture-time getZoom proof.');

console.log('NATIVE_INBOX_BASELINE_CONTRACT_PASS production_seam=false paired_capture=true scenarios=4 genuine_zoom_reused=true evidence_ceiling_bounded=true');
