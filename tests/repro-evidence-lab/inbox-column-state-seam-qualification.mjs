import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  artifactDir,
  wpCli,
  wpPath,
  assertEnv,
  login,
  waitForGrid,
  nativeSearch,
} from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = (fixture.forms || []).find(item => item.key === 'alpha') || fixture.forms?.[0];
if (!alpha?.form_id) throw new Error('INBOX_COLUMN_STATE_SEAM_QUALIFICATION_FAILURE: alpha form fixture unavailable.');

const studentId = String(alpha.first_name_field_id);
const nationalId = String(alpha.national_id_field_id);
const schoolId = String(alpha.school_field_id);
const expectedPhysicalIds = ['date_created', schoolId, nationalId, studentId, 'id'];
const stalePhysicalIds = ['id', 'date_created', schoolId, nationalId, studentId];
const evidencePath = path.join(artifactDir, 'inbox-column-state-seam-qualification.json');
const muPath = path.join(wpPath, 'wp-content', 'mu-plugins', 'gpp-column-state-seam-qualification.php');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error(`WP-CLI failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

function setupPage() {
  return JSON.parse(wpEval(`
+$page_id = wp_insert_post(array(
+  'post_title' => 'WU21 Inbox Column State Seam Qualification',
+  'post_status' => 'publish',
+  'post_type' => 'page',
+  'post_content' => '[gravityflow page="inbox" form="${Number(alpha.form_id)}"]',
+), true);
+if (is_wp_error($page_id)) throw new RuntimeException($page_id->get_error_message());
+echo wp_json_encode(array('page_id'=>(int)$page_id,'url'=>get_permalink($page_id)));
+  `.replace(/^\+/gm, '')));
}

async function waitForRows(page) {
  await waitForGrid(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 15000 });
}

async function headerPhysicalIds(page) {
  const headers = await page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(nodes => nodes
    .filter(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map(node => ({ id: node.getAttribute('col-id'), x: node.getBoundingClientRect().x })));
  return headers.sort((a, b) => a.x - b.x).map(item => item.id);
}

async function gridRootClass(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').first().getAttribute('class');
}

async function exactGridId(page) {
  const ids = await page.locator('[data-js="gflow-inbox"][data-grid-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-grid-id')).filter(Boolean));
  assert.equal(ids.length, 1, `Expected one native Inbox Grid ID, found ${ids.length}.`);
  return ids[0];
}

async function captureAuthenticState(page, gridId) {
  await page.evaluate(id => localStorage.removeItem(id), gridId);
  await nativeSearch(page, 'WU21-A-');
  await nativeSearch(page, '');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const raw = await page.evaluate(id => localStorage.getItem(id), gridId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Gravity Flow did not persist authentic state for ${gridId}.`);
}

function reorderAuthenticState(state, order) {
  const byId = new Map(state.map(item => [String(item.colId), item]));
  for (const id of order) assert.ok(byId.has(id), `Authentic state missing ${id}.`);
  return order.map(id => byId.get(id));
}

function writeQualificationMuPlugin(pageId) {
  const logPath = path.join(artifactDir, 'inbox-column-state-seam-config.jsonl')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
  const php = `<?php
+add_filter('gravityflow_js_config_shared', function($config) {
+    if ((int) get_queried_object_id() !== ${Number(pageId)} || empty($_GET['wu21_column_state_candidate'])) {
+        return $config;
+    }
+    $candidate = sanitize_key((string) $_GET['wu21_column_state_candidate']);
+    if (!in_array($candidate, array('suppress_movable','lock_position','enable_rtl'), true) || !is_array($config) || empty($config['grids']) || !is_array($config['grids'])) {
+        return $config;
+    }
+    foreach ($config['grids'] as $grid_id => &$grid_config) {
+        if (empty($grid_config['grid_options']['columnDefs']) || !is_array($grid_config['grid_options']['columnDefs'])) continue;
+        $ids = array_map(static function($def) { return isset($def['field']) ? (string) $def['field'] : ''; }, $grid_config['grid_options']['columnDefs']);
+        $expected = ${JSON.stringify(expectedPhysicalIds)};
+        if ($ids !== $expected) continue;
+        if ($candidate === 'enable_rtl') {
+            $grid_config['grid_options']['enableRtl'] = true;
+        } else {
+            foreach ($grid_config['grid_options']['columnDefs'] as &$def) {
+                if ($candidate === 'suppress_movable') $def['suppressMovable'] = true;
+                if ($candidate === 'lock_position') $def['lockPosition'] = true;
+            }
+            unset($def);
+        }
+        file_put_contents('${logPath}', wp_json_encode(array(
+            'candidate'=>$candidate,
+            'grid_id'=>(string)$grid_id,
+            'column_ids'=>$ids,
+            'enable_rtl'=>isset($grid_config['grid_options']['enableRtl']) ? (bool)$grid_config['grid_options']['enableRtl'] : null,
+            'column_defs'=>$grid_config['grid_options']['columnDefs'],
+        ), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)."\\n", FILE_APPEND|LOCK_EX);
+    }
+    unset($grid_config);
+    return $config;
+}, 99, 1);
+`;
  fs.writeFileSync(muPath, php.replace(/^\+/gm, ''));
}

async function exerciseCandidate(context, baseUrl, candidate) {
  const url = new URL(baseUrl);
  url.searchParams.set('wu21_header_rtl_probe', '1');
  url.searchParams.set('wu21_column_state_candidate', candidate);
  const page = await context.newPage();
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await waitForRows(page);
  const gridId = await exactGridId(page);
  const cleanOrder = await headerPhysicalIds(page);
  const cleanRootClass = await gridRootClass(page);

  const authentic = await captureAuthenticState(page, gridId);
  const stale = reorderAuthenticState(authentic, stalePhysicalIds);
  await page.evaluate(({ id, value }) => localStorage.setItem(id, value), { id: gridId, value: JSON.stringify(stale) });

  await page.reload({ waitUntil: 'networkidle' });
  await waitForRows(page);
  const firstReload = await headerPhysicalIds(page);
  const firstRootClass = await gridRootClass(page);
  const firstPersistedRaw = await page.evaluate(id => localStorage.getItem(id), gridId);
  const firstPersisted = firstPersistedRaw ? JSON.parse(firstPersistedRaw).map(item => String(item.colId)) : null;

  // Trigger the host's own persistence again; do not fabricate state between
  // the first reload and the closure reload.
  await nativeSearch(page, 'WU21-A-');
  await nativeSearch(page, '');
  await page.waitForTimeout(300);
  const repersistedRaw = await page.evaluate(id => localStorage.getItem(id), gridId);
  const repersisted = repersistedRaw ? JSON.parse(repersistedRaw).map(item => String(item.colId)) : null;

  await page.reload({ waitUntil: 'networkidle' });
  await waitForRows(page);
  const secondReload = await headerPhysicalIds(page);
  const secondRootClass = await gridRootClass(page);

  const result = {
    candidate,
    grid_id: gridId,
    clean_order: cleanOrder,
    clean_root_class: cleanRootClass,
    preserves_clean_contract: JSON.stringify(cleanOrder) === JSON.stringify(expectedPhysicalIds),
    authentic_state_ids: authentic.map(item => String(item.colId)),
    stale_state_ids: stale.map(item => String(item.colId)),
    first_reload_order: firstReload,
    first_root_class: firstRootClass,
    first_persisted_ids: firstPersisted,
    host_repersisted_ids: repersisted,
    second_reload_order: secondReload,
    second_root_class: secondRootClass,
    closes_first_reload: JSON.stringify(firstReload) === JSON.stringify(expectedPhysicalIds),
    closes_subsequent_reload: JSON.stringify(secondReload) === JSON.stringify(expectedPhysicalIds),
  };
  await page.close();
  return result;
}

async function clearCandidateState(context, baseUrl) {
  const cleanupPage = await context.newPage();
  await cleanupPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const candidateGridId = await exactGridId(cleanupPage);
  await cleanupPage.evaluate(id => localStorage.removeItem(id), candidateGridId);
  await cleanupPage.close();
}

let browser = null;
let pageInfo = null;
let evidence = { contract: 'SRWF_INBOX_COLUMN_STATE_SEAM_QUALIFICATION_V1', execution_status: 'ERROR' };
try {
  pageInfo = setupPage();
  writeQualificationMuPlugin(pageInfo.page_id);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await context.newPage();
  await login(loginPage);
  await loginPage.close();

  const suppressMovable = await exerciseCandidate(context, pageInfo.url, 'suppress_movable');
  await clearCandidateState(context, pageInfo.url);
  const lockPosition = await exerciseCandidate(context, pageInfo.url, 'lock_position');
  await clearCandidateState(context, pageInfo.url);
  const enableRtl = await exerciseCandidate(context, pageInfo.url, 'enable_rtl');

  const configLogPath = path.join(artifactDir, 'inbox-column-state-seam-config.jsonl');
  const configRecords = fs.existsSync(configLogPath)
    ? fs.readFileSync(configLogPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    : [];

  evidence = {
    contract: 'SRWF_INBOX_COLUMN_STATE_SEAM_QUALIFICATION_V1',
    execution_status: 'CAPTURED',
    gravity_flow: {
      version: wpEval("$d=get_file_data(WP_PLUGIN_DIR.'/gravityflow/gravityflow.php',array('v'=>'Version')); echo $d['v'];"),
      package_sha256: process.env.WU21_FLOW_SHA256 || null,
    },
    expected_physical_ids: expectedPhysicalIds,
    candidates: {
      suppress_movable: suppressMovable,
      lock_position: lockPosition,
      enable_rtl: enableRtl,
    },
    config_filter_records: configRecords,
    interpretation: {
      candidate_is_admissible_only_if_clean_and_first_and_subsequent_reload_close: true,
      no_candidate_is_selected_by_this_probe: true,
      note: 'This test-only probe evaluates AG Grid-native pre-construction options delivered through the exact Gravity Flow 3.1.0 shared Grid config filter. Supported/public classification is decided separately from runtime efficacy.',
    },
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`INBOX_COLUMN_STATE_SEAM_QUALIFICATION_CAPTURED ${JSON.stringify({ suppress_movable: suppressMovable, lock_position: lockPosition, enable_rtl: enableRtl })}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (fs.existsSync(muPath)) fs.unlinkSync(muPath);
  if (pageInfo?.page_id) wpEval(`wp_delete_post(${Number(pageInfo.page_id)}, true);`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
}
