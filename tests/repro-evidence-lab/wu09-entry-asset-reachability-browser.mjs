import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('WU09 qualification requires the admitted WU18 runtime environment.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

function withProbe(input, id) {
  const url = new URL(input, baseUrl);
  url.searchParams.set('gpp_wu09_probe', id);
  return url.toString();
}

function queryUrl(base, params) {
  const url = new URL(base, baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

function readProbeRecords() {
  const file = path.join(artifactDir, 'wu09-entry-asset-request-probes.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function state(page) {
  return page.evaluate(() => {
    const styleLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(link => /\/assets\/css\/srwf-gravity-flow-entry-detail\.css(?:\?|$)/.test(link.href || ''))
      .map(link => ({ id: link.id || '', href: link.href || '' }));
    const scripts = [...document.querySelectorAll('script[src]')]
      .filter(script => /\/assets\/js\/srwf-gravity-flow-entry-detail\.js(?:\?|$)/.test(script.src || ''))
      .map(script => ({ id: script.id || '', src: script.src || '' }));
    const dossier = document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]');
    const table = document.querySelector('.entry-detail-view');
    const editor = table?.querySelector('.gform_wrapper');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    return {
      styleLinks,
      scripts,
      dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
      suppression_marker_count: document.querySelectorAll('[data-gpp-native-table-suppression="read-only-review"]').length,
      review_mode: dossier?.dataset.gppReviewMode || null,
      preview_bound: dossier?.dataset.gppPreviewBound || null,
      native_table_present: Boolean(table),
      native_table_display: table ? getComputedStyle(table).display : null,
      native_editor_visible: Boolean(editor && getComputedStyle(editor).display !== 'none'),
      status_visible: Boolean(status && getComputedStyle(status).display !== 'none' && getComputedStyle(status).visibility !== 'hidden'),
      timeline_visible: Boolean(timeline && getComputedStyle(timeline).display !== 'none' && getComputedStyle(timeline).visibility !== 'hidden'),
      native_print_present: Boolean(nativePrint),
      native_print_display: nativePrint ? getComputedStyle(nativePrint).display : null,
    };
  });
}

async function pageEvidence(page, url, id, wait = 'networkidle') {
  const response = await page.goto(withProbe(url, id), { waitUntil: wait });
  const html = await page.content();
  return {
    id,
    requested_url: url,
    final_url: page.url(),
    http_status: response?.status() ?? null,
    state: await state(page),
    source_positions: {
      css: html.indexOf('/assets/css/srwf-gravity-flow-entry-detail.css'),
      dossier: html.indexOf('data-gpp-entry-detail="ready"'),
      js: html.indexOf('/assets/js/srwf-gravity-flow-entry-detail.js'),
      body_close: html.lastIndexOf('</body>'),
    },
  };
}

function assertNoBaseAssets(result, label) {
  assert.equal(result.state.styleLinks.length, 0, `${label}: base Entry Detail CSS leaked.`);
  assert.equal(result.state.scripts.length, 0, `${label}: Entry Detail JS leaked.`);
}

function assertAdmittedAssets(result, label) {
  assert.equal(result.state.styleLinks.length, 1, `${label}: base CSS must appear exactly once.`);
  assert.equal(result.state.scripts.length, 1, `${label}: post-admission JS must appear exactly once.`);
  assert.equal(result.state.dossier_count, 1, `${label}: admitted dossier missing.`);
  assert.equal(result.state.suppression_marker_count, 1, `${label}: server suppression marker missing.`);
  assert.equal(result.state.review_mode, 'read-only', `${label}: server review authority missing.`);
  assert.equal(result.state.preview_bound, '1', `${label}: progressive enhancement did not bind exactly to the admitted dossier.`);
  assert.ok(result.source_positions.css >= 0 && result.source_positions.dossier >= 0 && result.source_positions.css < result.source_positions.dossier,
    `${label}: CSS was not delivered before dossier rendering.`);
  assert.ok(result.source_positions.js > result.source_positions.dossier && result.source_positions.js < result.source_positions.body_close,
    `${label}: JS was not printed through the normal footer lifecycle after dossier admission.`);
}

const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const qualificationMuSource = path.join(repoRoot, 'tests/repro-evidence-lab/wu09-entry-asset-qualification-mu.php');
const qualificationMuTarget = path.join(wpPath, 'wp-content/mu-plugins/gpp-wu09-entry-asset-qualification.php');
fs.mkdirSync(path.dirname(qualificationMuTarget), { recursive: true });
fs.copyFileSync(qualificationMuSource, qualificationMuTarget);
const wu18 = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const base = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
if (!wu18?.alpha?.form_id || !wu18?.alpha?.entry_id || !wu18?.editor?.entry_id || !base?.frontend_inbox_url) {
  throw new Error('WU09 qualification fixtures are incomplete.');
}

const extra = JSON.parse(wpEval(`
$unrelated = wp_insert_post(array(
  'post_title' => 'WU09 unrelated frontend control',
  'post_status' => 'publish',
  'post_type' => 'page',
  'post_content' => '<p>WU09 unrelated frontend control.</p>',
), true);
if (is_wp_error($unrelated)) throw new RuntimeException($unrelated->get_error_message());
$block = wp_insert_post(array(
  'post_title' => 'WU09 authentic native Inbox block host',
  'post_status' => 'publish',
  'post_type' => 'page',
  'post_content' => '<!-- wp:gravityflow/inbox /-->',
), true);
if (is_wp_error($block)) throw new RuntimeException($block->get_error_message());
echo wp_json_encode(array(
  'unrelated_url' => get_permalink($unrelated),
  'block_url' => get_permalink($block),
), JSON_UNESCAPED_SLASHES);
`));

const authCookies = JSON.parse(wpEval(`
$u = get_user_by('login', 'bootstrap_admin');
if (!$u) throw new RuntimeException('bootstrap_admin unavailable');
$expiration = time() + 900;
echo wp_json_encode(array(
  array('name' => AUTH_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'auth')),
  array('name' => LOGGED_IN_COOKIE, 'value' => wp_generate_auth_cookie($u->ID, $expiration, 'logged_in'))
), JSON_UNESCAPED_SLASHES);
`));

const alpha = wu18.alpha;
const editor = wu18.editor;
const adminEntry = queryUrl(`${baseUrl}/wp-admin/admin.php`, {
  page: 'gravityflow-inbox', view: 'entry', id: alpha.form_id, lid: alpha.entry_id,
});
const editorEntry = queryUrl(`${baseUrl}/wp-admin/admin.php`, {
  page: 'gravityflow-inbox', view: 'entry', id: editor.form_id, lid: editor.entry_id,
});
const ordinaryInbox = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox`;
const unrelatedAdmin = `${baseUrl}/wp-admin/options-general.php`;
const printUrl = queryUrl(`${baseUrl}/wp-admin/admin-ajax.php`, {
  action: 'gravityflow_print_entries', lid: alpha.entry_id, gpp_presentation: 'dossier',
});
const missingId = queryUrl(`${baseUrl}/wp-admin/admin.php`, {
  page: 'gravityflow-inbox', view: 'entry', lid: alpha.entry_id,
});
const missingLid = queryUrl(`${baseUrl}/wp-admin/admin.php`, {
  page: 'gravityflow-inbox', view: 'entry', id: alpha.form_id,
});
const malformedLid = queryUrl(`${baseUrl}/wp-admin/admin.php`, {
  page: 'gravityflow-inbox', view: 'entry', id: alpha.form_id, lid: 'nope',
});
const wrongAdminPage = queryUrl(`${baseUrl}/wp-admin/options-general.php`, {
  view: 'entry', id: alpha.form_id, lid: alpha.entry_id,
});
const unrelatedFrontendLookalike = queryUrl(extra.unrelated_url, {
  view: 'entry', id: alpha.form_id, lid: alpha.entry_id,
});

fs.rmSync(path.join(artifactDir, 'wu09-entry-asset-request-probes.jsonl'), { force: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(authCookies.map(cookie => ({ ...cookie, url: baseUrl })));
const page = await context.newPage();

const results = {
  schema_version: '1.0.0',
  work_unit: 'GPP-RP-WU-09-ENTRY-ASSET-REACHABILITY-REPAIR',
  status: 'PASS',
  repository_head: repositoryHead,
  runtime: {
    wordpress: wpEval('echo get_bloginfo("version");'),
    php: wpEval('echo PHP_VERSION;'),
    gravity_forms: wpEval('echo class_exists("GFForms") ? GFForms::$version : "";'),
    gravity_flow: wpEval('echo defined("GRAVITY_FLOW_VERSION") ? GRAVITY_FLOW_VERSION : "";'),
  },
  q1: {},
  q2: {},
  q3: {},
  q4: {},
};

try {
  results.q1.authentic_admin_entry = await pageEvidence(page, adminEntry, 'admin-admitted');
  assertAdmittedAssets(results.q1.authentic_admin_entry, 'authentic admin Entry Detail');

  results.q1.native_editor_entry = await pageEvidence(page, editorEntry, 'admin-editor');
  assert.equal(results.q1.native_editor_entry.state.styleLinks.length, 1, 'Genuine native editor Entry Detail must receive early CSS.');
  assert.equal(results.q1.native_editor_entry.state.scripts.length, 0, 'Native editor fallback must not receive post-admission JS.');
  assert.equal(results.q1.native_editor_entry.state.dossier_count, 0, 'Native editor fallback unexpectedly emitted dossier.');
  assert.equal(results.q1.native_editor_entry.state.suppression_marker_count, 0, 'Native editor fallback unexpectedly emitted suppression marker.');
  assert.equal(results.q1.native_editor_entry.state.native_editor_visible, true, 'Native editor fallback lost its host editor.');
  assert.notEqual(results.q1.native_editor_entry.state.native_table_display, 'none', 'CSS availability suppressed the native editor table without admission.');

  const userInputEntry = queryUrl(`${baseUrl}/wp-admin/admin.php`, {
    page: 'gravityflow-inbox', view: 'entry', id: wu18.transition.form_id, lid: wu18.transition.entry_id,
  });
  results.q1.native_user_input_entry = await pageEvidence(page, userInputEntry, 'admin-user-input');
  assert.equal(results.q1.native_user_input_entry.state.styleLinks.length, 1, 'Genuine User Input Entry Detail must receive early CSS.');
  assert.equal(results.q1.native_user_input_entry.state.scripts.length, 0, 'Native User Input fallback must not receive post-admission JS.');
  assert.equal(results.q1.native_user_input_entry.state.dossier_count, 0, 'Native User Input unexpectedly emitted dossier.');
  assert.equal(results.q1.native_user_input_entry.state.suppression_marker_count, 0, 'Native User Input unexpectedly emitted suppression marker.');
  assert.equal(results.q1.native_user_input_entry.state.native_editor_visible, true, 'Native User Input editor is not visible.');
  assert.notEqual(results.q1.native_user_input_entry.state.native_table_display, 'none', 'CSS availability suppressed native User Input without admission.');

  results.q1.ordinary_inbox = await pageEvidence(page, ordinaryInbox, 'ordinary-inbox');
  assertNoBaseAssets(results.q1.ordinary_inbox, 'ordinary Inbox');

  results.q1.unrelated_admin = await pageEvidence(page, unrelatedAdmin, 'unrelated-admin');
  assertNoBaseAssets(results.q1.unrelated_admin, 'unrelated admin');

  results.q1.missing_id = await pageEvidence(page, missingId, 'missing-id');
  assertNoBaseAssets(results.q1.missing_id, 'incomplete Entry Detail missing id');
  assert.equal(results.q1.missing_id.state.dossier_count, 0, 'Host rendered admitted dossier without required form id; candidate predicate would be a false negative.');

  results.q1.missing_lid = await pageEvidence(page, missingLid, 'missing-lid');
  assertNoBaseAssets(results.q1.missing_lid, 'incomplete Entry Detail missing lid');

  results.q1.malformed_lid = await pageEvidence(page, malformedLid, 'malformed-lid');
  assertNoBaseAssets(results.q1.malformed_lid, 'malformed Entry Detail lid');

  results.q1.wrong_admin_page = await pageEvidence(page, wrongAdminPage, 'wrong-admin-page');
  assertNoBaseAssets(results.q1.wrong_admin_page, 'Entry Detail-looking unrelated admin page');

  results.q1.unrelated_frontend_lookalike = await pageEvidence(page, unrelatedFrontendLookalike, 'frontend-lookalike');
  assertNoBaseAssets(results.q1.unrelated_frontend_lookalike, 'Entry Detail-looking unrelated frontend page');

  await page.goto(base.frontend_inbox_url, { waitUntil: 'networkidle' });
  const shortcodeLinks = await page.locator('a[href*="view=entry"][href*="lid="]').evaluateAll(nodes => nodes.map(node => node.href));
  const shortcodeNativeLink = shortcodeLinks.find(href => {
    const u = new URL(href);
    return Number(u.searchParams.get('lid')) === Number(alpha.entry_id);
  }) || null;
  const shortcodeObservedLink = shortcodeNativeLink || shortcodeLinks[0] || null;

  const shortcodeCandidate = shortcodeNativeLink || queryUrl(base.frontend_inbox_url, {
    view: 'entry', id: alpha.form_id, lid: alpha.entry_id,
  });
  const shortcodeEntry = await pageEvidence(page, shortcodeCandidate, 'frontend-shortcode-entry');
  const shortcodeSupported = shortcodeEntry.state.native_table_present || shortcodeEntry.state.dossier_count > 0;
  results.q1.frontend_shortcode_entry = {
    native_link_observed: Boolean(shortcodeObservedLink),
    native_link: shortcodeObservedLink,
    matching_alpha_link_observed: Boolean(shortcodeNativeLink),
    supported: shortcodeSupported,
    evidence: shortcodeEntry,
  };
  if (shortcodeSupported) assertAdmittedAssets(shortcodeEntry, 'authentic frontend shortcode Entry Detail');
  else assertNoBaseAssets(shortcodeEntry, 'unsupported frontend shortcode Entry Detail candidate');

  await page.goto(extra.block_url, { waitUntil: 'networkidle' });
  const blockLinks = await page.locator('a[href*="view=entry"][href*="lid="]').evaluateAll(nodes => nodes.map(node => node.href));
  const blockNativeLink = blockLinks.find(href => {
    const u = new URL(href);
    return Number(u.searchParams.get('lid')) === Number(alpha.entry_id);
  }) || null;
  const blockObservedLink = blockNativeLink || blockLinks[0] || null;
  const blockCandidate = blockNativeLink || queryUrl(extra.block_url, {
    view: 'entry', id: alpha.form_id, lid: alpha.entry_id,
  });
  const blockEntry = await pageEvidence(page, blockCandidate, 'frontend-block-entry');
  const blockSupported = blockEntry.state.native_table_present || blockEntry.state.dossier_count > 0;
  results.q1.frontend_block_entry = {
    native_link_observed: Boolean(blockObservedLink),
    native_link: blockObservedLink,
    matching_alpha_link_observed: Boolean(blockNativeLink),
    supported: blockSupported,
    evidence: blockEntry,
  };
  if (blockSupported) assertAdmittedAssets(blockEntry, 'authentic frontend block Entry Detail');
  else assertNoBaseAssets(blockEntry, 'unsupported frontend block Entry Detail candidate');

  const printResponse = await context.request.get(withProbe(printUrl, 'print-request'));
  const printText = await printResponse.text();
  results.q1.print = {
    http_status: printResponse.status(),
    base_css_in_response: printText.includes('/assets/css/srwf-gravity-flow-entry-detail.css'),
    js_in_response: printText.includes('/assets/js/srwf-gravity-flow-entry-detail.js'),
  };
  assert.equal(results.q1.print.base_css_in_response, false, 'Print response received Entry Detail CSS.');
  assert.equal(results.q1.print.js_in_response, false, 'Print response received Entry Detail JS.');

  const deniedContext = await browser.newContext();
  const deniedPage = await deniedContext.newPage();
  const deniedAdmin = await pageEvidence(deniedPage, adminEntry, 'admin-denied', 'domcontentloaded');
  results.q4.permission_denied_admin = deniedAdmin;
  assert.equal(deniedAdmin.state.dossier_count, 0, 'Unauthenticated admin request bypassed native authorization.');
  assert.equal(deniedAdmin.state.suppression_marker_count, 0, 'Permission-denied admin request emitted suppression marker.');
  await deniedContext.close();

  results.q2 = {
    classification: 'QUALIFIED_EARLY_REQUEST_GATED_CSS',
    genuine_admin_css_before_dossier: results.q1.authentic_admin_entry.source_positions.css < results.q1.authentic_admin_entry.source_positions.dossier,
    editor_css_without_admission: results.q1.native_editor_entry.state.styleLinks.length === 1
      && results.q1.native_editor_entry.state.dossier_count === 0
      && results.q1.native_editor_entry.state.suppression_marker_count === 0,
    unrelated_controls_absent: [
      results.q1.ordinary_inbox,
      results.q1.unrelated_admin,
      results.q1.missing_id,
      results.q1.missing_lid,
      results.q1.malformed_lid,
      results.q1.wrong_admin_page,
      results.q1.unrelated_frontend_lookalike,
    ].every(item => item.state.styleLinks.length === 0),
  };

  results.q3 = {
    classification: 'QUALIFIED_POST_ADMISSION_JS',
    admin_exactly_once: results.q1.authentic_admin_entry.state.scripts.length === 1,
    editor_absent: results.q1.native_editor_entry.state.scripts.length === 0,
    frontend_shortcode: shortcodeSupported ? shortcodeEntry.state.scripts.length === 1 : 'NOT_SUPPORTED',
    frontend_block: blockSupported ? blockEntry.state.scripts.length === 1 : 'NOT_SUPPORTED',
  };

  results.q4.server_markers_remain_authority = (
    results.q1.native_editor_entry.state.styleLinks.length === 1
    && results.q1.native_editor_entry.state.suppression_marker_count === 0
    && results.q1.native_editor_entry.state.native_table_display !== 'none'
    && results.q1.native_user_input_entry.state.styleLinks.length === 1
    && results.q1.native_user_input_entry.state.suppression_marker_count === 0
    && results.q1.native_user_input_entry.state.native_table_display !== 'none'
  );

  await context.close();
  await browser.close();

  await new Promise(resolve => setTimeout(resolve, 250));
  const probes = readProbeRecords();
  const byId = new Map(probes.map(record => [record.id, record]));
  results.server_probes = Object.fromEntries(byId);

  for (const id of ['admin-admitted', 'admin-editor', 'ordinary-inbox', 'unrelated-admin', 'missing-id', 'missing-lid', 'malformed-lid', 'wrong-admin-page', 'frontend-lookalike']) {
    assert.ok(byId.has(id), `Missing server probe record: ${id}`);
  }

  const admittedProbe = byId.get('admin-admitted');
  assert.equal(admittedProbe.candidate_reachable, true, 'Authentic admin Entry Detail was not candidate-reachable.');
  assert.equal(admittedProbe.profile_model_active, true, 'Authentic admin Entry Detail did not resolve the active model.');
  assert.equal(admittedProbe.css_enqueued, true, 'Authentic admin Entry Detail did not enqueue early CSS.');
  assert.equal(admittedProbe.post_permission_seam_reached, true, 'Authentic admin Entry Detail did not reach the post-permission host seam.');
  assert.equal(admittedProbe.dossier_admitted, true, 'Successful dossier admission was not observed server-side.');
  assert.equal(admittedProbe.js_enqueued, true, 'Post-admission JS was not enqueued.');
  assert.equal(admittedProbe.footer_state_at_js_enqueue?.admin_print_footer_scripts, 0, 'Admin footer scripts had already printed before post-admission JS enqueue.');
  assert.equal(admittedProbe.script_done_at_shutdown, true, 'Post-admission JS did not complete normal footer delivery.');

  const editorProbe = byId.get('admin-editor');
  assert.equal(editorProbe.candidate_reachable, true, 'Native editor route was not recognized as genuine Entry Detail.');
  assert.equal(editorProbe.css_enqueued, true, 'Native editor route did not receive early CSS.');
  assert.equal(editorProbe.post_permission_seam_reached, true, 'Native editor route did not reach host Entry Detail seam.');
  assert.equal(editorProbe.dossier_admitted, false, 'Native editor route was incorrectly admitted as dossier.');
  assert.equal(editorProbe.js_enqueued, false, 'Native editor route incorrectly received post-admission JS.');

  const userInputProbe = byId.get('admin-user-input');
  assert.ok(userInputProbe, 'Missing native User Input server probe.');
  assert.equal(userInputProbe.candidate_reachable, true, 'Native User Input route was not recognized as genuine Entry Detail.');
  assert.equal(userInputProbe.css_enqueued, true, 'Native User Input route did not receive early CSS.');
  assert.equal(userInputProbe.post_permission_seam_reached, true, 'Native User Input route did not reach host Entry Detail seam.');
  assert.equal(userInputProbe.dossier_admitted, false, 'Native User Input route was incorrectly admitted as dossier.');
  assert.equal(userInputProbe.js_enqueued, false, 'Native User Input route incorrectly received post-admission JS.');

  for (const id of ['ordinary-inbox', 'unrelated-admin', 'missing-id', 'missing-lid', 'malformed-lid', 'wrong-admin-page', 'frontend-lookalike']) {
    const probe = byId.get(id);
    assert.equal(probe.candidate_reachable, false, `${id}: request predicate false positive.`);
    assert.equal(probe.css_enqueued, false, `${id}: early CSS false positive.`);
    assert.equal(probe.js_enqueued, false, `${id}: JS false positive.`);
  }

  for (const [id, supported] of [['frontend-shortcode-entry', shortcodeSupported], ['frontend-block-entry', blockSupported]]) {
    const probe = byId.get(id);
    if (!probe) continue;
    if (supported) {
      assert.equal(probe.candidate_reachable, true, `${id}: supported native frontend Entry Detail route was missed.`);
      assert.equal(probe.css_enqueued, true, `${id}: supported route missed early CSS.`);
      assert.equal(probe.dossier_admitted, true, `${id}: supported admitted route did not record dossier admission.`);
      assert.equal(probe.js_enqueued, true, `${id}: supported admitted route missed post-admission JS.`);
      assert.equal(probe.footer_state_at_js_enqueue?.wp_print_footer_scripts, 0, `${id}: frontend footer scripts had already printed before JS enqueue.`);
      assert.equal(probe.script_done_at_shutdown, true, `${id}: frontend JS did not complete footer delivery.`);
    } else {
      assert.equal(probe.candidate_reachable, false, `${id}: unsupported frontend route was a candidate false positive.`);
    }
  }

  const wu18BrowserPath = path.join(artifactDir, 'wu18-browser-results.json');
  if (fs.existsSync(wu18BrowserPath)) {
    const wu18Browser = JSON.parse(fs.readFileSync(wu18BrowserPath, 'utf8'));
    const byTest = new Map((wu18Browser.results || []).map(item => [item.id, item]));
    for (const id of ['WU18-BROWSER-005', 'WU18-BROWSER-007', 'WU18-BROWSER-008']) {
      assert.equal(byTest.get(id)?.status, 'PASS', `Existing native fallback interaction failed under candidate asset delivery: ${id}`);
    }
    results.q4.reused_wu18_browser_controls = {
      js_blocked_native_ownership: byTest.get('WU18-BROWSER-005'),
      approval_editor_fallback: byTest.get('WU18-BROWSER-007'),
      user_input_fallback: byTest.get('WU18-BROWSER-008'),
    };
  }

  fs.rmSync(qualificationMuTarget, { force: true });

  fs.writeFileSync(
    path.join(artifactDir, 'wu09-entry-asset-reachability-qualification.json'),
    `${JSON.stringify(results, null, 2)}\n`
  );
  process.stdout.write(`WU09_ENTRY_ASSET_REACHABILITY_QUALIFIED ${JSON.stringify({
    css: results.q2.classification,
    js: results.q3.classification,
    frontend_shortcode_supported: shortcodeSupported,
    frontend_block_supported: blockSupported,
  })}\n`);
} catch (error) {
  results.status = 'FAIL';
  results.error = String(error?.stack || error).slice(0, 12000);
  try { await context.close(); } catch {}
  try { await browser.close(); } catch {}
  try { fs.rmSync(qualificationMuTarget, { force: true }); } catch {}
  fs.writeFileSync(
    path.join(artifactDir, 'wu09-entry-asset-reachability-qualification.json'),
    `${JSON.stringify(results, null, 2)}\n`
  );
  throw error;
}
