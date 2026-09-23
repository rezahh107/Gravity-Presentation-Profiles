import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';

if (!artifactDir || !wpPath || !wpCli) {
  throw new Error('WU09 browser qualification requires the existing WU18 runtime environment.');
}

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const qualification = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu09_entry_asset_qualification"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const baseManifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));

const styleHandle = qualification.production_baseline.style_handle;
const scriptHandle = qualification.production_baseline.script_handle;
const entryCssNeedle = '/assets/css/srwf-gravity-flow-entry-detail';
const entryJsNeedle = '/assets/js/srwf-gravity-flow-entry-detail.js';

function withQuery(raw, params) {
  const url = new URL(raw);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const adminEntry = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const adminInbox = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
const unrelatedAdmin = `${baseUrl}/wp-admin/index.php`;
const printUrl = item => `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${item.entry_id}`;

function frontendEntry(fixture, item) {
  return withQuery(fixture.url, { view: 'entry', id: item.form_id, lid: item.entry_id });
}

const results = [];
function record(id, name, status, details = null) {
  results.push({ id, name, status, details });
}
async function test(id, name, fn) {
  try {
    record(id, name, 'PASS', await fn());
  } catch (error) {
    record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 8000) });
  }
}
async function login(page, user = 'bootstrap_admin', pass = adminPassword) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

async function assetState(page) {
  return page.evaluate(({ styleHandle, scriptHandle, entryCssNeedle, entryJsNeedle }) => {
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const table = document.querySelector('.entry-detail-view');
    const editor = table?.querySelector('.gform_wrapper');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const script = document.querySelector(`script#${scriptHandle}-js`);
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const entryLinks = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(link => link.href.includes(entryCssNeedle));
    const entryScripts = [...document.querySelectorAll('script[src]')].filter(node => node.src.includes(entryJsNeedle));
    const markers = dossier ? {
      ready: dossier.dataset.gppEntryDetail || null,
      review: dossier.dataset.gppReviewMode || null,
      suppression: dossier.dataset.gppNativeTableSuppression || null,
      previewBound: dossier.dataset.gppPreviewBound || null,
    } : null;
    return {
      url: location.href,
      title: document.title,
      style_handle_count: document.querySelectorAll(`link#${styleHandle}-css`).length,
      script_handle_count: document.querySelectorAll(`script#${scriptHandle}-js`).length,
      entry_css_link_count: entryLinks.length,
      entry_css_hrefs: entryLinks.map(node => node.href),
      entry_js_tag_count: entryScripts.length,
      entry_js_resource_count: resources.filter(name => name.includes(entryJsNeedle)).length,
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      markers,
      native_table_present: Boolean(table),
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none' && getComputedStyle(editor).visibility !== 'hidden'),
      status_count: document.querySelectorAll('.gravityflow-status-box').length,
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
      timeline_visible: Boolean(timeline && getComputedStyle(timeline).display !== 'none' && getComputedStyle(timeline).visibility !== 'hidden'),
      script_after_dossier: Boolean(dossier && script && (dossier.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING)),
      body_class: document.body?.className || '',
      text_sample: document.body?.innerText?.slice(0, 500) || '',
    };
  }, { styleHandle, scriptHandle, entryCssNeedle, entryJsNeedle });
}

function assertAdmittedCssAndMarkers(state, label) {
  if (state.style_handle_count !== 1 || state.entry_css_link_count < 1) throw new Error(`${label}: request-gated Entry Detail CSS missing: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 1 || state.markers?.ready !== 'ready' || state.markers?.review !== 'read-only' || state.markers?.suppression !== 'read-only-review') throw new Error(`${label}: admitted dossier markers missing: ${JSON.stringify(state)}`);
  if (state.native_table_display !== 'none' || !state.status_visible || !state.timeline_visible) throw new Error(`${label}: native suppression/status/timeline contract changed: ${JSON.stringify(state)}`);
}
function assertPostAdmissionJs(state, label) {
  if (state.script_handle_count !== 1 || state.entry_js_tag_count !== 1 || state.entry_js_resource_count !== 1) throw new Error(`${label}: post-admission JS was not delivered exactly once: ${JSON.stringify(state)}`);
  if (state.markers?.previewBound !== '1' || !state.script_after_dossier) throw new Error(`${label}: JS did not bind only after admitted dossier output: ${JSON.stringify(state)}`);
}
function lifecycleEvents() {
  const file = path.join(artifactDir, 'wu09-entry-asset-lifecycle.ndjson');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
function latestLifecycleFor(url) {
  const pathname = new URL(url).pathname + new URL(url).search;
  return lifecycleEvents().filter(event => event.request_uri === pathname).at(-1) || null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await login(page);

await test('WU09-Q1-ADMIN-ENTRY', 'authentic admin Entry Detail is reachable on the native Gravity Flow Inbox route', async () => {
  await page.goto(adminEntry(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await assetState(page);
  assertAdmittedCssAndMarkers(state, 'admin Entry Detail');
  assertPostAdmissionJs(state, 'admin Entry Detail');
  return { ...state, lifecycle: latestLifecycleFor(state.url) };
});

await test('WU09-Q1-EDITOR', 'native Approval editor is a genuine Entry Detail route but remains marker-free', async () => {
  await page.goto(adminEntry(manifest.editor), { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.style_handle_count !== 1 || state.entry_css_link_count < 1) throw new Error(`Editor route lost request-gated CSS: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 0 || state.markers !== null || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`Editor route was treated as admitted GPP Review: ${JSON.stringify(state)}`);
  if (state.script_handle_count !== 0 || state.entry_js_tag_count !== 0 || state.entry_js_resource_count !== 0) throw new Error(`Editor route received post-admission JS without admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q1-FRONTEND-INBOX-SHORTCODE', 'authentic frontend Inbox shortcode serves Entry Detail on the same page', async () => {
  await page.goto(frontendEntry(qualification.frontend_fixtures.inbox_shortcode, manifest.alpha), { waitUntil: 'networkidle' });
  const state = await assetState(page);
  assertAdmittedCssAndMarkers(state, 'frontend Inbox shortcode Entry Detail');
  const lifecycle = latestLifecycleFor(state.url);
  if (state.entry_js_tag_count > 1 || state.entry_js_resource_count > 1) throw new Error(`Frontend Inbox shortcode duplicated Entry Detail JS: ${JSON.stringify(state)}`);
  return { ...state, post_admission_js_delivered: state.entry_js_tag_count === 1 && state.entry_js_resource_count === 1 && state.markers?.previewBound === '1', lifecycle };
});

await test('WU09-Q1-FRONTEND-INBOX-BLOCK', 'registered native Inbox block serves Entry Detail on the same page when available', async () => {
  const fixture = qualification.frontend_fixtures.inbox_block;
  if (!fixture) return { supported: false, reason: 'gravityflow/inbox block not registered in pinned runtime' };
  await page.goto(frontendEntry(fixture, manifest.alpha), { waitUntil: 'networkidle' });
  const state = await assetState(page);
  assertAdmittedCssAndMarkers(state, 'frontend Inbox block Entry Detail');
  const lifecycle = latestLifecycleFor(state.url);
  if (state.entry_js_tag_count > 1 || state.entry_js_resource_count > 1) throw new Error(`Frontend Inbox block duplicated Entry Detail JS: ${JSON.stringify(state)}`);
  return { supported: true, ...state, post_admission_js_delivered: state.entry_js_tag_count === 1 && state.entry_js_resource_count === 1 && state.markers?.previewBound === '1', lifecycle };
});

await test('WU09-Q1-FRONTEND-STATUS', 'frontend Status shortcode Entry Detail support is measured rather than assumed', async () => {
  const fixture = qualification.frontend_fixtures.status_shortcode;
  await page.goto(frontendEntry(fixture, manifest.alpha), { waitUntil: 'networkidle' });
  const state = await assetState(page);
  const hostDetail = state.native_table_present || state.status_count > 0 || state.dossier_count > 0;
  if (!hostDetail) {
    if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0) throw new Error(`Unsupported Status detail route received Entry Detail assets: ${JSON.stringify(state)}`);
    return { supported: false, ...state };
  }
  assertAdmittedCssAndMarkers(state, 'frontend Status shortcode Entry Detail');
  const lifecycle = latestLifecycleFor(state.url);
  if (state.entry_js_tag_count > 1 || state.entry_js_resource_count > 1) throw new Error(`Frontend Status duplicated Entry Detail JS: ${JSON.stringify(state)}`);
  return { supported: true, ...state, post_admission_js_delivered: state.entry_js_tag_count === 1 && state.entry_js_resource_count === 1 && state.markers?.previewBound === '1', lifecycle };
});

await test('WU09-Q1-ADMIN-INBOX-NEGATIVE', 'ordinary admin Inbox does not receive Entry Detail assets', async () => {
  await page.goto(adminInbox, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0 || state.dossier_count !== 0) throw new Error(`Admin Inbox leaked Entry Detail assets: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q1-UNRELATED-ADMIN-NEGATIVE', 'unrelated wp-admin page does not receive Entry Detail assets', async () => {
  await page.goto(unrelatedAdmin, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0) throw new Error(`Unrelated admin leaked Entry Detail assets: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q1-UNRELATED-FRONTEND-QUERY-NEGATIVE', 'view=entry and lid alone do not make an unrelated frontend page reachable', async () => {
  const url = withQuery(qualification.frontend_fixtures.unrelated.url, { view: 'entry', id: manifest.alpha.form_id, lid: manifest.alpha.entry_id });
  await page.goto(url, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0 || state.dossier_count !== 0) throw new Error(`Query-only unrelated frontend false-positive: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q1-MALFORMED-ADMIN-NEGATIVE', 'incomplete admin Entry Detail-looking request is not asset-reachable', async () => {
  const url = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${manifest.alpha.form_id}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0) throw new Error(`Malformed admin route received Entry Detail assets: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q1-MALFORMED-FRONTEND-NEGATIVE', 'incomplete authentic frontend Entry Detail-looking request is not asset-reachable', async () => {
  const url = withQuery(qualification.frontend_fixtures.inbox_shortcode.url, { view: 'entry', id: manifest.alpha.form_id, lid: null });
  await page.goto(url, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0 || state.dossier_count !== 0) throw new Error(`Malformed frontend route received Entry Detail assets: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q2-MARKER-AUTHORITY', 'CSS availability on editor route does not suppress native fields without server admission markers', async () => {
  await page.goto(adminEntry(manifest.editor), { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.style_handle_count !== 1 || state.dossier_count !== 0 || state.native_table_display === 'none' || !state.native_editor_visible) throw new Error(`CSS availability became presentation admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q3-REPEAT-ADMITTED', 'fresh admitted requests each receive one normal footer script and never duplicate within a document', async () => {
  const observed = [];
  for (let i = 0; i < 2; i++) {
    await page.goto(adminEntry(manifest.alpha), { waitUntil: 'networkidle' });
    const state = await assetState(page);
    assertAdmittedCssAndMarkers(state, `repeat admitted request ${i + 1}`);
    assertPostAdmissionJs(state, `repeat admitted request ${i + 1}`);
    observed.push({ script_handle_count: state.script_handle_count, resource_count: state.entry_js_resource_count, preview_bound: state.markers.previewBound });
  }
  return observed;
});

await test('WU09-Q3-FALLBACK-FRONTEND', 'early request-gated JS fallback loads once and binds through the existing admitted-dossier root guard', async () => {
  const url = withQuery(frontendEntry(qualification.frontend_fixtures.inbox_shortcode, manifest.alpha), { gpp_wu09_js_mode: 'early' });
  await page.goto(url, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  assertAdmittedCssAndMarkers(state, 'early fallback frontend admitted Entry Detail');
  if (state.script_handle_count !== 1 || state.entry_js_tag_count !== 1 || state.entry_js_resource_count !== 1 || state.markers?.previewBound !== '1') throw new Error(`Early request-gated fallback failed on admitted frontend Entry Detail: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q3-FALLBACK-EDITOR-GUARD', 'early request-gated JS fallback remains behaviorally inert without server dossier admission', async () => {
  const url = withQuery(adminEntry(manifest.editor), { gpp_wu09_js_mode: 'early' });
  await page.goto(url, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.style_handle_count !== 1 || state.script_handle_count !== 1 || state.entry_js_resource_count !== 1) throw new Error(`Early fallback assets were not request-gated on genuine editor route: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 0 || state.markers !== null || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`Early fallback JS changed native editor behavior without server admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q3-FALLBACK-UNRELATED-GUARD', 'early fallback JS remains absent when request reachability is false', async () => {
  const url = withQuery(qualification.frontend_fixtures.unrelated.url, { view: 'entry', id: manifest.alpha.form_id, lid: manifest.alpha.entry_id, gpp_wu09_js_mode: 'early' });
  await page.goto(url, { waitUntil: 'networkidle' });
  const state = await assetState(page);
  if (state.entry_css_link_count !== 0 || state.entry_js_tag_count !== 0 || state.entry_js_resource_count !== 0) throw new Error(`Early fallback leaked to unrelated frontend query: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q4-PERMISSION-DENIED', 'non-authorized viewer never gains dossier admission or post-admission JS authority', async () => {
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await login(viewerPage, baseManifest.viewer.login, 'wu21-synthetic-viewer-2026');
  await viewerPage.goto(adminEntry(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await assetState(viewerPage);
  if (state.dossier_count !== 0 || state.entry_js_tag_count !== 0 || state.entry_js_resource_count !== 0) throw new Error(`Permission-denied route gained GPP admission/JS: ${JSON.stringify(state)}`);
  await viewerContext.close();
  return state;
});

await test('WU09-Q4-PRINT-NEGATIVE', 'native Print response does not receive Entry Detail base assets', async () => {
  const response = await context.request.get(printUrl(manifest.alpha));
  const contentType = response.headers()['content-type'] || '';
  const body = await response.body();
  const text = body.toString('utf8');
  if (text.includes(styleHandle) || text.includes(scriptHandle) || text.includes('srwf-gravity-flow-entry-detail.css') || text.includes('srwf-gravity-flow-entry-detail.js')) {
    throw new Error('Print response contains Entry Detail base asset delivery.');
  }
  return { status: response.status(), content_type: contentType, bytes: body.length };
});

await browser.close();

const failures = results.filter(result => result.status === 'FAIL');
const statusResult = results.find(result => result.id === 'WU09-Q1-FRONTEND-STATUS');
const frontendAdmissionResults = results.filter(result => ['WU09-Q1-FRONTEND-INBOX-SHORTCODE', 'WU09-Q1-FRONTEND-INBOX-BLOCK', 'WU09-Q1-FRONTEND-STATUS'].includes(result.id) && result.status === 'PASS' && result.details?.supported !== false);
const frontendLateJsReliable = frontendAdmissionResults.length > 0 && frontendAdmissionResults.every(result => result.details?.post_admission_js_delivered === true);
const fallbackIds = ['WU09-Q3-FALLBACK-FRONTEND', 'WU09-Q3-FALLBACK-EDITOR-GUARD', 'WU09-Q3-FALLBACK-UNRELATED-GUARD'];
const fallbackQualified = fallbackIds.every(id => results.find(result => result.id === id)?.status === 'PASS');
const cssCriticalIds = [
  'WU09-Q1-ADMIN-ENTRY','WU09-Q1-EDITOR','WU09-Q1-FRONTEND-INBOX-SHORTCODE','WU09-Q1-FRONTEND-INBOX-BLOCK','WU09-Q1-FRONTEND-STATUS',
  'WU09-Q1-ADMIN-INBOX-NEGATIVE','WU09-Q1-UNRELATED-ADMIN-NEGATIVE','WU09-Q1-UNRELATED-FRONTEND-QUERY-NEGATIVE',
  'WU09-Q1-MALFORMED-ADMIN-NEGATIVE','WU09-Q1-MALFORMED-FRONTEND-NEGATIVE','WU09-Q2-MARKER-AUTHORITY','WU09-Q4-PRINT-NEGATIVE'
];
const cssQualified = cssCriticalIds.every(id => results.find(result => result.id === id)?.status === 'PASS');
const output = {
  schema_version: '1.0.0',
  work_unit: 'GPP-RP-WU-09-ENTRY-ASSET-REACHABILITY-REPAIR',
  repository_head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: qualification.runtime,
  request_reachability: {
    admin_entry: 'SUPPORTED_AND_EXERCISED',
    frontend_inbox_shortcode: 'SUPPORTED_AND_EXERCISED',
    frontend_inbox_block: qualification.frontend_fixtures.inbox_block ? 'SUPPORTED_AND_EXERCISED' : 'NOT_REGISTERED',
    frontend_status_shortcode: statusResult?.details?.supported === false ? 'NOT_OBSERVED_AS_ENTRY_DETAIL' : 'SUPPORTED_AND_EXERCISED',
    ordinary_inbox: 'NEGATIVE_CONTROL',
    unrelated_admin: 'NEGATIVE_CONTROL',
    unrelated_frontend: 'NEGATIVE_CONTROL',
    print: 'NEGATIVE_CONTROL',
    malformed_requests: 'NEGATIVE_CONTROL',
  },
  candidate: {
    css: cssQualified ? 'QUALIFIED_EARLY_REQUEST_GATED_CSS' : 'NOT_QUALIFIED',
    js: frontendLateJsReliable ? 'QUALIFIED_POST_ADMISSION_JS' : 'NOT_QUALIFIED_FOR_POST_ADMISSION',
    post_admission_js_failure_reason: frontendLateJsReliable ? null : 'supported frontend Entry Detail renders dossier after the normal footer script print point or otherwise too late for reliable footer delivery',
    early_request_gated_js_fallback: fallbackQualified ? 'SUPPORTED_BY_EXECUTED_EVIDENCE' : 'NOT_PROVEN',
    authority: 'server dossier/admission markers remain required for duplicate suppression and admitted host chrome; JS root guard remains dossier-scoped',
  },
  results,
};
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'wu09-entry-asset-browser-results.json'), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length || !cssQualified || !fallbackQualified) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

console.log('WU09_ENTRY_ASSET_BROWSER_QUALIFICATION_PASS');
