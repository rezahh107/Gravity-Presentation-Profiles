import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = 'wu21-bootstrap-pass-2026';
const viewerPassword = 'wu21-synthetic-viewer-2026';
const styleId = 'gpp-srwf-gravity-flow-entry-detail-css';
const scriptId = 'gpp-srwf-gravity-flow-entry-detail-js';
const results = [];

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(
  wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);')
);

function entryUrl(item, overrides = {}) {
  const query = new URLSearchParams({
    page: 'gravityflow-inbox',
    view: 'entry',
    id: String(item.form_id),
    lid: String(item.entry_id),
    ...overrides,
  });
  return `${baseUrl}/wp-admin/admin.php?${query.toString()}`;
}

function record(id, name, status, details = null) {
  results.push({ id, name, status, details });
}

async function test(id, name, fn) {
  try {
    record(id, name, 'PASS', await fn());
  } catch (error) {
    record(id, name, 'FAIL', { error: String(error?.stack || error).slice(0, 9000) });
  }
}

async function login(page, user, password) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', user);
  await page.fill('#user_pass', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('#wp-submit'),
  ]);
}

async function pageState(page) {
  return page.evaluate(({ styleId, scriptId }) => {
    const style = document.getElementById(styleId);
    const script = document.getElementById(scriptId);
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const nativeTable = document.querySelector('.entry-detail-view');
    const nativeEditor = nativeTable?.querySelector('.gform_wrapper');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const q = document.getElementById('gpp-wu09-qualification-state');
    const scriptNodes = [...document.querySelectorAll(`script#${scriptId}`)];
    const styleNodes = [...document.querySelectorAll(`link#${styleId}`)];
    return {
      url: location.href,
      style_count: styleNodes.length,
      style_in_head: Boolean(style && document.head.contains(style)),
      script_count: scriptNodes.length,
      script_in_body: Boolean(script && document.body.contains(script)),
      script_after_dossier: Boolean(
        dossier && script && (dossier.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING)
      ),
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      suppression_marker_count: document.querySelectorAll('[data-gpp-native-table-suppression="read-only-review"]').length,
      preview_bound: dossier?.dataset.gppPreviewBound || null,
      native_table_present: Boolean(nativeTable),
      native_table_display: nativeTable ? getComputedStyle(nativeTable).display : null,
      native_editor_visible: Boolean(nativeEditor && getComputedStyle(nativeEditor).display !== 'none'),
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      timeline_visible: Boolean(timeline && getComputedStyle(timeline).display !== 'none' && getComputedStyle(timeline).visibility !== 'hidden'),
      host_entry_detail_surface: Boolean(dossier || nativeTable || status),
      qualification: q ? {
        candidate_request: q.dataset.candidateRequest,
        style_enqueued: q.dataset.styleEnqueued,
        script_enqueued: q.dataset.scriptEnqueued,
        admission_pass: q.dataset.admissionPass,
        late_enqueue_count: Number(q.dataset.lateEnqueueCount || 0),
      } : null,
      body_text: document.body?.innerText?.slice(0, 1200) || '',
    };
  }, { styleId, scriptId });
}

function assertNoAssets(state, label) {
  if (state.style_count !== 0 || state.script_count !== 0) {
    throw new Error(`${label} leaked Entry Detail assets: ${JSON.stringify(state)}`);
  }
}

const browser = await chromium.launch({ headless: true });
const adminContext = await browser.newContext();
const adminPage = await adminContext.newPage();
await login(adminPage, 'bootstrap_admin', adminPassword);

await test('WU09-Q1-ADMIN', 'canonical native admin Entry Detail route is authentic and request-gated', async () => {
  await adminPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (!state.host_entry_detail_surface || state.dossier_count !== 1) throw new Error(`Canonical admin Entry Detail did not render admitted dossier: ${JSON.stringify(state)}`);
  if (state.qualification?.candidate_request !== '1') throw new Error(`Canonical admin route missed candidate request predicate: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q2-CSS', 'candidate CSS is early on admitted Review and marker-dependent suppression remains server-authoritative', async () => {
  await adminPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.style_count !== 1 || !state.style_in_head) throw new Error(`Entry Detail CSS was not delivered once in head: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 1 || state.suppression_marker_count !== 1 || state.native_table_display !== 'none') throw new Error(`Admitted marker/suppression contract failed: ${JSON.stringify(state)}`);
  if (!state.status_visible || !state.timeline_visible) throw new Error(`Native workflow/Timeline ownership was not preserved: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q3-JS', 'post-admission JS uses normal footer lifecycle exactly once and binds only admitted dossier', async () => {
  await adminPage.goto(entryUrl(manifest.alpha), { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.script_count !== 1 || !state.script_in_body || !state.script_after_dossier) throw new Error(`Post-admission script was not printed once in footer order: ${JSON.stringify(state)}`);
  if (state.preview_bound !== '1') throw new Error(`Progressive-enhancement JS did not bind admitted dossier: ${JSON.stringify(state)}`);
  if (state.qualification?.admission_pass !== '1' || state.qualification?.late_enqueue_count !== 1) throw new Error(`Late enqueue was not tied to successful dossier admission: ${JSON.stringify(state)}`);
  const trigger = adminPage.locator('[data-gpp-image-preview]').first();
  if (await trigger.count() !== 1) throw new Error('Qualified image preview trigger is missing.');
  await trigger.click();
  const dialog = adminPage.locator('[data-gpp-image-dialog]');
  await dialog.waitFor({ state: 'visible' });
  if (!(await dialog.evaluate(node => node.open === true))) throw new Error('Late-loaded image preview JS did not open dialog.');
  await dialog.locator('[data-gpp-image-close]').click();
  return state;
});

await test('WU09-Q4-EDITOR', 'Approval editor keeps early CSS but no markers, suppression or post-admission JS', async () => {
  await adminPage.goto(entryUrl(manifest.editor), { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.style_count !== 1 || !state.style_in_head) throw new Error(`Authentic editor route lost request-gated CSS: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 0 || state.suppression_marker_count !== 0 || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`Native Approval editor fallback was altered: ${JSON.stringify(state)}`);
  if (state.script_count !== 0 || state.qualification?.admission_pass === '1' || state.qualification?.late_enqueue_count !== 0) throw new Error(`Failed dossier admission received JS: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q4-USER-INPUT', 'native User Input route keeps CSS availability separate from GPP admission', async () => {
  await adminPage.goto(entryUrl(manifest.transition), { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.style_count !== 1 || !state.style_in_head) throw new Error(`Authentic User Input route lost request-gated CSS: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 0 || state.suppression_marker_count !== 0 || !state.native_editor_visible || state.native_table_display === 'none') throw new Error(`Native User Input fallback was altered: ${JSON.stringify(state)}`);
  if (state.script_count !== 0 || state.qualification?.admission_pass === '1') throw new Error(`User Input received post-admission JS without dossier admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q1-INBOX', 'ordinary native Inbox is not Entry Detail asset-reachable', async () => {
  await adminPage.goto(`${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`, { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  assertNoAssets(state, 'Ordinary Inbox');
  return state;
});

await test('WU09-Q1-UNRELATED-ADMIN', 'unrelated admin page is not Entry Detail asset-reachable', async () => {
  await adminPage.goto(`${baseUrl}/wp-admin/admin.php?page=gf_settings`, { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  assertNoAssets(state, 'Unrelated admin');
  return state;
});

await test('WU09-Q1-FRONTEND', 'frontend Entry Detail-looking query is not an exercised native Entry Detail route in pinned host', async () => {
  await adminPage.goto(`${baseUrl}/?view=entry&id=${manifest.alpha.form_id}&lid=${manifest.alpha.entry_id}`, { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.host_entry_detail_surface || state.dossier_count || state.native_editor_visible) {
    throw new Error(`Pinned host exposed an authentic frontend Entry Detail route; admin-only candidate is a false negative: ${JSON.stringify(state)}`);
  }
  assertNoAssets(state, 'Frontend Entry Detail-looking query');
  return state;
});

await test('WU09-Q1-MISSING-LID', 'incomplete admin Entry Detail-looking request without lid is rejected by reachability gate', async () => {
  await adminPage.goto(`${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${manifest.alpha.form_id}`, { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.dossier_count || state.native_editor_visible) throw new Error(`Missing-lid request unexpectedly rendered Entry Detail: ${JSON.stringify(state)}`);
  assertNoAssets(state, 'Missing-lid request');
  return state;
});

await test('WU09-Q1-MISSING-ID', 'incomplete admin Entry Detail-looking request without form id is rejected by reachability gate', async () => {
  await adminPage.goto(`${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&lid=${manifest.alpha.entry_id}`, { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.host_entry_detail_surface || state.dossier_count || state.native_editor_visible) {
    throw new Error(`Pinned host supports Entry Detail without id; strict candidate predicate is a false negative: ${JSON.stringify(state)}`);
  }
  assertNoAssets(state, 'Missing-id request');
  return state;
});

await test('WU09-Q1-WRONG-PAGE', 'Entry Detail-looking parameters on unrelated admin page do not qualify', async () => {
  await adminPage.goto(`${baseUrl}/wp-admin/admin.php?page=gf_settings&view=entry&id=${manifest.alpha.form_id}&lid=${manifest.alpha.entry_id}`, { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  assertNoAssets(state, 'Wrong-page request');
  return state;
});

await test('WU09-Q4-MISMATCH', 'shape-valid but mismatched Entry Detail payload does not gain dossier admission or JS', async () => {
  await adminPage.goto(entryUrl(manifest.alpha, { id: String(manifest.beta.form_id) }), { waitUntil: 'networkidle' });
  const state = await pageState(adminPage);
  if (state.style_count !== 1 || !state.style_in_head) throw new Error(`Shape-valid request did not retain early CSS availability: ${JSON.stringify(state)}`);
  if (state.dossier_count !== 0 || state.suppression_marker_count !== 0 || state.script_count !== 0) throw new Error(`Mismatched host payload was promoted into GPP admission: ${JSON.stringify(state)}`);
  return state;
});

await test('WU09-Q4-PRINT', 'native Print path receives no Entry Detail base assets', async () => {
  const printUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=gravityflow_print_entries&lid=${manifest.alpha.entry_id}`;
  const response = await adminPage.goto(printUrl, { waitUntil: 'domcontentloaded' });
  const html = await adminPage.content();
  const result = {
    status: response?.status() ?? null,
    style_occurrences: (html.match(/gpp-srwf-gravity-flow-entry-detail-css/g) || []).length,
    script_occurrences: (html.match(/gpp-srwf-gravity-flow-entry-detail-js/g) || []).length,
    dossier_markers: (html.match(/data-gpp-entry-detail="ready"/g) || []).length,
  };
  if (result.style_occurrences !== 0 || result.script_occurrences !== 0) throw new Error(`Print leaked Entry Detail assets: ${JSON.stringify(result)}`);
  return result;
});

const viewerContext = await browser.newContext();
const viewerPage = await viewerContext.newPage();
await login(viewerPage, 'wu21_viewer', viewerPassword);

await test('WU09-Q4-PERMISSION', 'permission-denied/non-admitted Entry Detail does not gain dossier markers or JS', async () => {
  const response = await viewerPage.goto(entryUrl(manifest.viewer), { waitUntil: 'domcontentloaded' });
  const state = await pageState(viewerPage);
  if (state.dossier_count !== 0 || state.suppression_marker_count !== 0 || state.script_count !== 0) {
    throw new Error(`Permission-denied request gained GPP admission or JS: ${JSON.stringify(state)}`);
  }
  return { http_status: response?.status() ?? null, ...state };
});

await browser.close();

const failures = results.filter(result => result.status === 'FAIL');
const output = {
  schema_version: '1.0.0',
  work_unit: 'GPP-RP-WU-09-ENTRY-ASSET-REACHABILITY-REPAIR',
  production_modified: false,
  candidates: {
    css: 'early admin gravityflow-inbox view=entry with positive id/lid + existing active-model gate',
    js: 'existing registered handle re-enqueued after successful server dossier admission',
  },
  results,
};

fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, 'wu09-entry-asset-browser.json'), `${JSON.stringify(output, null, 2)}\n`);

if (failures.length) {
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

console.log('WU09_ENTRY_ASSET_BROWSER_QUALIFICATION_PASS');
