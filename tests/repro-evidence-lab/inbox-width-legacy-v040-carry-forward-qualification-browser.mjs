// Qualification-only authentic WU21 browser test for the legacy v0.4.0
// persisted-width carry-forward boundary. This file MUST NOT repair production
// behavior; it only simulates an in-place asset upgrade while preserving native
// Gravity Flow localStorage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, repoRoot, login, waitForGrid } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir || !wpCli || !wpPath || !repoRoot) throw new Error('Pinned WU21 lab required');

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json')));
const form = fixture.forms.find(item => item.key === 'alpha');
if (!form) throw new Error('WU21 alpha form missing');

const ids = ['id', 'date_created', String(form.school_field_id), String(form.national_id_field_id), String(form.first_name_field_id)];
const mu = path.join(wpPath, 'wp-content/mu-plugins/inbox-width-candidate-d-mu.php');
const productionAsset = path.join(repoRoot, 'assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js');
const legacyAsset = path.join(repoRoot, 'tests/repro-evidence-lab/fixtures/srwf-gravity-flow-inbox-initial-geometry-guard-v0.4.0.js');
const prospectiveEvidencePath = path.join(artifactDir, 'inbox-visual-design-v2-bidirectional-fit-recovery-evidence.json');
const evidencePath = path.join(artifactDir, 'inbox-width-legacy-v040-carry-forward-qualification.json');
const expectedLegacyGitBlob = 'd668c65a12af57ac9385e8eae931308e16a7abbb';
const expectedFlowPackageSha256 = 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404';
const expectedCommonInboxSha256 = 'f5866f71b6cf2dabf62f586998eddc382a2a6a49801ccee7e87536043acfbce4';

const sha256Bytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sha256File = file => sha256Bytes(fs.readFileSync(file));
const gitBlobSha = bytes => crypto.createHash('sha1')
  .update(Buffer.from(`blob ${bytes.length}\0`))
  .update(bytes)
  .digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const widths = state => state.map(column => ({colId: String(column.colId), width: Number(column.width)}));
const nonWidth = state => state.map(({width, ...rest}) => rest);

const repairedBytes = fs.readFileSync(productionAsset);
const legacyBytes = fs.readFileSync(legacyAsset);
assert.equal(gitBlobSha(legacyBytes), expectedLegacyGitBlob, 'legacy v0.4.0 fixture Git blob identity drifted');
assert.notEqual(sha256Bytes(repairedBytes), sha256Bytes(legacyBytes), 'legacy fixture unexpectedly equals repaired production asset');
assert.equal(sha256File(process.env.WU21_FLOW_ZIP), expectedFlowPackageSha256, 'Gravity Flow package identity drifted');
const commonInboxBundle = path.join(wpPath, 'wp-content/plugins/gravityflow/assets/js/dist/common-inbox.4181e438e8373cc50e14.js');
assert.equal(sha256File(commonInboxBundle), expectedCommonInboxSha256, 'Gravity Flow common Inbox source identity drifted');

const result = {
  schema_version: 1,
  repo_head: process.env.GPP_WU21_REPOSITORY_SHA,
  mode: 'LEGACY_V040_PERSISTED_STATE_CARRY_FORWARD_QUALIFICATION',
  runtime: JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'))),
  identities: {
    legacy_fixture_git_blob_sha1: gitBlobSha(legacyBytes),
    legacy_fixture_sha256: sha256Bytes(legacyBytes),
    repaired_asset_sha256: sha256Bytes(repairedBytes),
    gravity_flow_package_sha256: sha256File(process.env.WU21_FLOW_ZIP),
    gravity_flow_common_inbox_sha256: sha256File(commonInboxBundle),
  },
  direct_upgrade_routes: [],
  manual_state_controls: [],
  prospective_positive_control: null,
  page_errors: [],
  remaining_not_proven: [],
};

let wpEvalSequence = 0;
function wp(code) {
  const script = path.join(artifactDir, `legacy-carry-forward-wp-eval-${process.pid}-${++wpEvalSequence}.php`);
  fs.writeFileSync(script, `<?php\n${code}\n`);
  let command;
  try {
    command = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', script], {encoding: 'utf8'});
  } finally {
    fs.rmSync(script, {force: true});
  }
  if (command.error) throw command.error;
  if (command.status !== 0) throw new Error(`WP-CLI eval-file failed status=${command.status}\n${command.stderr || ''}\n${command.stdout || ''}`);
  return (command.stdout || '').trim();
}

function assertWidthsClose(actual, expected, label, tolerance = 1) {
  assert.deepEqual(actual.map(item => item.colId), expected.map(item => item.colId), `${label}: column identities changed`);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(Math.abs(actual[index].width - expected[index].width) <= tolerance,
      `${label}: ${actual[index].colId} width ${actual[index].width} != ${expected[index].width}`);
  }
}

async function settle(page, ms = 500) {
  await page.waitForTimeout(ms);
}

async function storageSnapshot(page, gridId) {
  return page.evaluate(({gridId, formId}) => {
    const provenanceKey = `gpp:srwf-inbox-fit:v1:${formId}:${gridId}`;
    const nativeRaw = localStorage.getItem(gridId);
    const provenanceRaw = localStorage.getItem(provenanceKey);
    const parse = raw => {
      if (raw == null) return null;
      try { return JSON.parse(raw); } catch (error) { return {parse_error: String(error)}; }
    };
    return {
      native_key: gridId,
      native_raw: nativeRaw,
      native_parsed: parse(nativeRaw),
      provenance_key: provenanceKey,
      provenance_raw: provenanceRaw,
      provenance_parsed: parse(provenanceRaw),
    };
  }, {gridId, formId: form.form_id});
}

async function snapshot(page, gridId) {
  return page.evaluate(({gridId, formId}) => {
    const root = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox"]');
    const center = root?.querySelector('.ag-center-cols-viewport');
    const state = window.__gppWidthControl?.inspect()?.state || null;
    const report = window.__gppWidthQualification;
    const production = window.__gppCandidateCProduction;
    const provenanceKey = `gpp:srwf-inbox-fit:v1:${formId}:${gridId}`;
    const parse = raw => {
      if (raw == null) return null;
      try { return JSON.parse(raw); } catch (error) { return {parse_error: String(error)}; }
    };
    const nativeRaw = localStorage.getItem(gridId);
    const provenanceRaw = localStorage.getItem(provenanceKey);
    const displayed = state?.filter(column => !column.hide) || [];
    const displayedWidth = displayed.reduce((sum, column) => sum + Number(column.width || 0), 0);
    return {
      grid_id: gridId,
      profile: Boolean(root),
      center: center ? {clientWidth: center.clientWidth, scrollWidth: center.scrollWidth} : null,
      displayed_width: displayedWidth,
      stranded_blank_width: center ? center.clientWidth - displayedWidth : null,
      state,
      native_saved_raw: nativeRaw,
      native_saved: parse(nativeRaw),
      provenance_key: provenanceKey,
      provenance_raw: provenanceRaw,
      provenance: parse(provenanceRaw),
      production: production ? JSON.parse(JSON.stringify(production)) : null,
      resize_events: report?.resize_events ? JSON.parse(JSON.stringify(report.resize_events)) : [],
      rows: root ? root.querySelectorAll('.ag-center-cols-container .ag-row').length : null,
      pager_text: root?.querySelector('.ag-paging-panel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      header_ids: root ? [...root.querySelectorAll('.ag-header-cell[col-id]')].map(node => node.getAttribute('col-id')) : [],
      native_scrollbars: root ? root.querySelectorAll('.ag-body-horizontal-scroll').length : 0,
    };
  }, {gridId, formId: form.form_id});
}

async function cleanScenarioAndReload(page, gridId) {
  await page.evaluate(({gridId, formId}) => {
    localStorage.removeItem(gridId);
    localStorage.removeItem(`gpp:srwf-inbox-fit:v1:${formId}:${gridId}`);
  }, {gridId, formId: form.form_id});
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
}

async function persistStateViaPublicApi(page, gridId, state, label) {
  const accepted = await page.evaluate(({label, state}) => window.__gppWidthControl.run(label, state), {label, state});
  assert.equal(accepted, true, `${label}: public applyColumnState fixture was rejected`);
  await settle(page, 250);
  const saved = await storageSnapshot(page, gridId);
  assert.ok(Array.isArray(saved.native_parsed), `${label}: Gravity Flow did not persist native Grid state`);
  assert.deepEqual(nonWidth(saved.native_parsed), nonWidth(state), `${label}: native persistence changed non-width state`);
  assertWidthsClose(widths(saved.native_parsed), widths(state), `${label}: persisted widths`);
  return saved;
}

function assertStableSurface(snapshotValue, baseline, label) {
  assert.equal(snapshotValue.rows, baseline.rows, `${label}: row count changed`);
  assert.equal(snapshotValue.pager_text, baseline.pager_text, `${label}: pager changed`);
  assert.deepEqual(snapshotValue.state.map(column => String(column.colId)), ids, `${label}: Grid state identity/order changed`);
  assert.ok(snapshotValue.state.every(column => column.hide !== true), `${label}: admitted column hidden`);
  assert.equal(snapshotValue.native_scrollbars, 1, `${label}: native horizontal scrollbar topology changed`);
}

function classifyUpgrade(before, after) {
  const beforeWidths = widths(before.state);
  const afterWidths = widths(after.state);
  const widthChanged = JSON.stringify(beforeWidths) !== JSON.stringify(afterWidths);
  const nowFitted = Math.abs(after.displayed_width - after.center.clientWidth) <= 2;
  if (nowFitted && widthChanged) return 'REPAIRED';
  if (!widthChanged && after.stranded_blank_width >= 24) return 'UNCHANGED_STRANDED';
  return 'CHANGED_OTHER_PATH';
}

async function directLegacyUpgrade(page, context) {
  const evidence = {route: context.kind, checkpoints: {}};
  result.direct_upgrade_routes.push(evidence);

  try {
    fs.writeFileSync(productionAsset, legacyBytes);
    await page.setViewportSize({width: 1920, height: 900});
    const url = new URL(context.url);
    url.searchParams.set('width_lab_discriminator', '1');
    url.searchParams.set('legacy_carry_forward', context.kind);
    await page.goto(url.toString(), {waitUntil: 'networkidle'});
    await waitForGrid(page);
    let gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
    assert.ok(gridId, `${context.kind}: native grid id missing`);

    // Scenario setup may start clean. From the confirmed legacy failure onward,
    // storage is preserved byte-for-byte through the simulated product upgrade.
    await cleanScenarioAndReload(page, gridId);
    gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
    const wide = evidence.checkpoints.legacy_wide_baseline = await snapshot(page, gridId);
    assert.ok(Math.abs(wide.displayed_width - wide.center.clientWidth) <= 2, `${context.kind}: legacy wide baseline not fitted`);
    assert.equal(wide.provenance_raw, null, `${context.kind}: v0.4.0 unexpectedly wrote GPP v1 provenance`);
    const baselineNonWidth = nonWidth(wide.state);

    evidence.persisted_wide_precondition = await persistStateViaPublicApi(
      page, gridId, wide.state, `${context.kind}_legacy_owner_sequence_wide_persisted_state`
    );

    await page.setViewportSize({width: 1680, height: 900});
    await settle(page, 300);
    evidence.checkpoints.legacy_narrow_live = await snapshot(page, gridId);
    assert.ok(evidence.checkpoints.legacy_narrow_live.center.scrollWidth > evidence.checkpoints.legacy_narrow_live.center.clientWidth,
      `${context.kind}: legacy live shrink did not expose native overflow`);

    await page.reload({waitUntil: 'networkidle'});
    await waitForGrid(page);
    await settle(page);
    const narrowReload = evidence.checkpoints.legacy_narrow_reload_autofit = await snapshot(page, gridId);
    assert.ok(narrowReload.center.scrollWidth - narrowReload.center.clientWidth <= 1,
      `${context.kind}: v0.4.0 narrow reload did not reach fitted geometry`);
    assert.ok(Math.abs(narrowReload.displayed_width - narrowReload.center.clientWidth) <= 2,
      `${context.kind}: v0.4.0 narrow reload did not consume usable width`);
    assert.equal(narrowReload.provenance_raw, null, `${context.kind}: v0.4.0 narrow auto-fit unexpectedly wrote v1 provenance`);
    assertWidthsClose(widths(narrowReload.native_saved), widths(narrowReload.state), `${context.kind}: v0.4.0 persisted narrow auto-fit`);
    assert.deepEqual(nonWidth(narrowReload.state), baselineNonWidth, `${context.kind}: v0.4.0 narrow fit changed non-width state`);
    evidence.storage_before_legacy_failure = await storageSnapshot(page, gridId);

    await page.setViewportSize({width: 1920, height: 900});
    await page.reload({waitUntil: 'networkidle'});
    await waitForGrid(page);
    await settle(page);
    const legacyFailure = evidence.checkpoints.legacy_wide_reload_stranded = await snapshot(page, gridId);
    assertWidthsClose(widths(legacyFailure.state), widths(narrowReload.state), `${context.kind}: legacy wide reload did not retain narrow widths`);
    assert.ok(legacyFailure.stranded_blank_width >= 24,
      `${context.kind}: legacy wider reload did not reproduce material stranded blank width`);
    assert.equal(legacyFailure.provenance_raw, null, `${context.kind}: legacy failure unexpectedly has v1 provenance`);
    evidence.storage_after_legacy_failure = await storageSnapshot(page, gridId);
    evidence.gpp_provenance_before_upgrade = {
      key: legacyFailure.provenance_key,
      raw: legacyFailure.provenance_raw,
      parsed: legacyFailure.provenance,
    };

    const storageBeforeUpgrade = await storageSnapshot(page, gridId);
    fs.writeFileSync(productionAsset, repairedBytes);
    assert.equal(sha256File(productionAsset), result.identities.repaired_asset_sha256, `${context.kind}: repaired asset swap failed`);
    const storageImmediatelyAfterAssetSwap = await storageSnapshot(page, gridId);
    assert.deepEqual(storageImmediatelyAfterAssetSwap, storageBeforeUpgrade,
      `${context.kind}: simulated asset upgrade mutated native/provenance storage before reload`);
    evidence.storage_immediately_before_upgrade = storageBeforeUpgrade;
    evidence.same_storage_immediately_after_simulated_upgrade = storageImmediatelyAfterAssetSwap;

    // No cleanStorageAndReload() here: same browser/context, same localStorage,
    // only the inline production asset bytes have changed.
    await page.reload({waitUntil: 'networkidle'});
    await waitForGrid(page);
    await settle(page);
    const repairedReload = evidence.checkpoints.repaired_build_wide_reload_same_storage = await snapshot(page, gridId);
    evidence.outcome = classifyUpgrade(legacyFailure, repairedReload);
    evidence.metrics = {
      displayed_width: repairedReload.displayed_width,
      usable_center_width: repairedReload.center.clientWidth,
      stranded_blank_width: repairedReload.stranded_blank_width,
      repair_count: repairedReload.production?.repair_count || 0,
    };

    assert.deepEqual(nonWidth(repairedReload.state), baselineNonWidth, `${context.kind}: upgrade changed non-width Grid state`);
    assertStableSurface(legacyFailure, wide, `${context.kind}: legacy failure surface`);
    assertStableSurface(repairedReload, wide, `${context.kind}: repaired reload surface`);
    evidence.status = 'PASS';
    return evidence;
  } finally {
    fs.writeFileSync(productionAsset, repairedBytes);
  }
}

async function manualSafetyControl(page, context, legacyEvidence) {
  const evidence = {route: context.kind, checkpoints: {}};
  result.manual_state_controls.push(evidence);

  await page.setViewportSize({width: 1920, height: 900});
  const url = new URL(context.url);
  url.searchParams.set('width_lab_discriminator', '1');
  url.searchParams.set('legacy_manual_control', context.kind);
  await page.goto(url.toString(), {waitUntil: 'networkidle'});
  await waitForGrid(page);
  let gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  assert.ok(gridId, `${context.kind}: manual control native grid id missing`);
  await cleanScenarioAndReload(page, gridId);
  gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');

  const baseline = evidence.checkpoints.fresh_repaired_wide = await snapshot(page, gridId);
  const legacyNarrowState = clone(legacyEvidence.checkpoints.legacy_narrow_reload_autofit.state);
  const legacyPersisted = clone(legacyEvidence.storage_after_legacy_failure.native_parsed);
  assert.ok(Array.isArray(legacyPersisted), `${context.kind}: missing legacy persisted reference state`);

  evidence.intentional_api_persist = await persistStateViaPublicApi(
    page, gridId, legacyNarrowState, `${context.kind}_intentional_provenance_free_api_underfill`
  );
  await settle(page, 300);
  const manualUnderfill = evidence.checkpoints.intentional_api_underfill = await snapshot(page, gridId);
  assert.equal(manualUnderfill.provenance_raw, null, `${context.kind}: intentional API width choice retained GPP provenance`);
  assert.ok(manualUnderfill.resize_events.some(event => event.source === 'api' && event.finished === true),
    `${context.kind}: intentional API width control did not expose completed source=api`);
  assertWidthsClose(widths(manualUnderfill.state), widths(legacyPersisted), `${context.kind}: manual state vs legacy persisted widths`);
  assert.deepEqual(nonWidth(manualUnderfill.state), nonWidth(legacyPersisted), `${context.kind}: manual state vs legacy persisted non-width state`);
  assert.ok(manualUnderfill.stranded_blank_width >= 24, `${context.kind}: intentional manual/API state is not materially underfilled`);

  evidence.boundary_equivalence = {
    width_state_equal: true,
    non_width_state_equal: true,
    provenance_absent_on_legacy: legacyEvidence.storage_after_legacy_failure.provenance_raw === null,
    provenance_absent_on_manual: manualUnderfill.provenance_raw === null,
    exact_native_storage_raw_equal: manualUnderfill.native_saved_raw === legacyEvidence.storage_after_legacy_failure.native_raw,
  };
  assert.equal(evidence.boundary_equivalence.provenance_absent_on_legacy, true, `${context.kind}: legacy reference unexpectedly has provenance`);
  assert.equal(evidence.boundary_equivalence.provenance_absent_on_manual, true, `${context.kind}: manual reference unexpectedly has provenance`);

  const manualWidths = widths(manualUnderfill.state);
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
  const manualReload = evidence.checkpoints.intentional_api_underfill_wide_reload = await snapshot(page, gridId);
  assert.equal(manualReload.production?.repair_count || 0, 0, `${context.kind}: repaired build normalized provenance-free intentional widths`);
  assertWidthsClose(widths(manualReload.state), manualWidths, `${context.kind}: repaired build changed intentional widths on reload`);
  assert.equal(manualReload.provenance_raw, null, `${context.kind}: repaired reload manufactured provenance for intentional widths`);
  assert.ok(manualReload.stranded_blank_width >= 24, `${context.kind}: intentional widths were silently normalized`);
  assertStableSurface(manualReload, baseline, `${context.kind}: manual safety reload surface`);
  evidence.status = 'PASS';
  return evidence;
}

function qualifyProspectivePositiveControl() {
  assert.ok(fs.existsSync(prospectiveEvidencePath), 'prospective PR #143 browser evidence missing from same WU21 run');
  const prior = JSON.parse(fs.readFileSync(prospectiveEvidencePath));
  assert.equal(prior.execution_status, 'PASS', 'prospective PR #143 positive control did not pass');
  assert.equal(prior.disposition, 'BIDIRECTIONAL_VIEWPORT_FIT_RECOVERY_RUNTIME_VERIFIED', 'prospective disposition drifted');
  assert.equal(prior.repo_head, result.repo_head, 'prospective evidence came from a different repository head');
  assert.equal(prior.gravity_flow_package_sha256, expectedFlowPackageSha256, 'prospective evidence used a different Gravity Flow package');
  const routes = prior.routes.map(route => {
    const checkpoint = route.checkpoints?.narrow_fitted_to_wide_reload;
    assert.ok(checkpoint, `${route.route}: prospective direct-wide checkpoint missing`);
    assert.equal(checkpoint.production?.repair_count || 0, 1, `${route.route}: prospective provenance-gated reload did not repair exactly once`);
    assert.ok(checkpoint.provenance, `${route.route}: prospective repaired reload lacks provenance`);
    assert.ok(Math.abs(checkpoint.displayed_width - checkpoint.center.clientWidth) <= 2,
      `${route.route}: prospective repaired reload did not fill usable width`);
    return {
      route: route.route,
      status: route.status,
      repair_count: checkpoint.production?.repair_count || 0,
      displayed_width: checkpoint.displayed_width,
      usable_center_width: checkpoint.center.clientWidth,
      provenance_present: Boolean(checkpoint.provenance),
    };
  });
  assert.deepEqual(routes.map(route => route.route).sort(), ['block', 'shortcode'], 'prospective control did not cover both supported routes');
  assert.ok(routes.every(route => route.status === 'PASS'), 'prospective route control failed');
  return {
    source_evidence_file: path.basename(prospectiveEvidencePath),
    disposition: prior.disposition,
    routes,
    status: 'PASS',
  };
}

let browser;
let pages = [];
try {
  const attrs = {selectedFormsJson: JSON.stringify([{value: form.form_id}])};
  pages = JSON.parse(wp(`$items=array();foreach(array('shortcode'=>'[gravityflow page="inbox" form="${form.form_id}"]','block'=>'<!-- wp:gravityflow/inbox ${JSON.stringify(attrs)} /-->') as $kind=>$content){$id=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Legacy carry-forward '.$kind,'post_content'=>wp_slash($content)),true);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$items[]=array('id'=>(int)$id,'kind'=>$kind,'url'=>get_permalink($id));}echo wp_json_encode($items);`));
  wp(`update_option('gpp_width_candidate_d_lab',array('pages'=>${JSON.stringify(pages.map(page => page.id))},'observer_path'=>${JSON.stringify(path.join(repoRoot, 'tests/repro-evidence-lab/inbox-width-candidate-d-observer.js'))},'accepted_ids'=>${JSON.stringify(ids)},'control_state'=>array()),false);`);
  fs.copyFileSync(path.join(repoRoot, 'tests/repro-evidence-lab/inbox-width-candidate-d-mu.php'), mu);

  process.env.IVD2_ADMIN_USER = fixture.operator.login;
  process.env.IVD2_ADMIN_PASSWORD = 'wu21-bootstrap-pass-2026';
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1920, height: 900}});
  page.on('pageerror', error => result.page_errors.push(String(error)));
  await login(page);

  const legacyByKind = new Map();
  for (const context of pages) {
    const evidence = await directLegacyUpgrade(page, context);
    legacyByKind.set(context.kind, evidence);
  }
  for (const context of pages) {
    await manualSafetyControl(page, context, legacyByKind.get(context.kind));
  }

  result.prospective_positive_control = qualifyProspectivePositiveControl();
  assert.equal(sha256File(commonInboxBundle), expectedCommonInboxSha256, 'Gravity Flow vendor bundle was modified');
  assert.equal(sha256File(productionAsset), result.identities.repaired_asset_sha256, 'production asset was not restored after qualification');
  assert.deepEqual(result.page_errors, [], 'browser page errors occurred during legacy carry-forward qualification');

  const legacyOutcomes = result.direct_upgrade_routes.map(route => route.outcome);
  result.current_pr_repairs_legacy_state = legacyOutcomes.every(outcome => outcome === 'REPAIRED')
    ? true
    : legacyOutcomes.every(outcome => outcome === 'UNCHANGED_STRANDED') ? false : 'MIXED_OR_OTHER_PATH';
  result.manual_width_safety = result.manual_state_controls.every(control => control.status === 'PASS') ? 'PASS' : 'FAIL';
  result.legacy_discriminator = 'LEGACY_AUTO_MIGRATION_DISCRIMINATOR_NOT_PROVEN';
  result.root_cause_disposition = result.current_pr_repairs_legacy_state === false
    ? 'LEGACY_PERSISTED_STATE_CARRY_FORWARD_GAP_CONFIRMED'
    : 'LEGACY_PERSISTED_STATE_CARRY_FORWARD_GAP_NOT_CONFIRMED_AS_STRANDED';
  result.execution_status = 'PASS';
  result.remaining_not_proven = [
    'No automatic discriminator is proven that separates historical v0.4.0 auto-fitted native state from intentional provenance-free manual/API width state.',
    'Target-production equivalence remains NOT_PROVEN; WU21 is a pinned reproducible lab and performs no production-site read-back.',
    'Owner policy for any explicit legacy-state reset/normalization migration is not selected by this qualification.',
  ];
} catch (error) {
  result.execution_status = 'ERROR';
  result.failure = String(error.stack || error);
  throw error;
} finally {
  fs.writeFileSync(productionAsset, repairedBytes);
  if (browser) await browser.close();
  if (fs.existsSync(mu)) fs.unlinkSync(mu);
  if (pages.length) wp(`foreach(${JSON.stringify(pages.map(page => page.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_d_lab');`);
  fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2) + '\n');
}

console.log('INBOX_WIDTH_LEGACY_V040_CARRY_FORWARD_QUALIFICATION_PASS');
