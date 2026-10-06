// Authentic WU21 browser regression for SRWF Inbox bidirectional viewport-fit recovery.
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
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result = {
  schema_version: 1,
  repo_head: process.env.GPP_WU21_REPOSITORY_SHA,
  mode: 'PRODUCTION_BIDIRECTIONAL_VIEWPORT_FIT_RECOVERY',
  runtime: JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'))),
  routes: [],
  page_errors: [],
  remaining_not_proven: [],
};

assert.equal(hash(process.env.WU21_FLOW_ZIP), 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404');
const bundle = path.join(wpPath, 'wp-content/plugins/gravityflow/assets/js/dist/common-inbox.4181e438e8373cc50e14.js');
const originalBundle = hash(bundle);
assert.equal(originalBundle, 'f5866f71b6cf2dabf62f586998eddc382a2a6a49801ccee7e87536043acfbce4');

let wpEvalSequence = 0;
function wp(code) {
  const script = path.join(artifactDir, `bidirectional-fit-wp-eval-${process.pid}-${++wpEvalSequence}.php`);
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

function nonWidth(state) { return state.map(({width, ...rest}) => rest); }
function widths(state) { return state.map(column => ({colId: String(column.colId), width: Number(column.width)})); }
function assertWidthsClose(actual, expected, label, tolerance = 1) {
  assert.deepEqual(actual.map(item => item.colId), expected.map(item => item.colId), `${label}: column identities changed`);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(Math.abs(actual[index].width - expected[index].width) <= tolerance,
      `${label}: ${actual[index].colId} width ${actual[index].width} != ${expected[index].width}`);
  }
}

async function snapshot(page, gridId) {
  return page.evaluate(({gridId, formId}) => {
    const root = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox"]');
    const center = root?.querySelector('.ag-center-cols-viewport');
    const report = window.__gppWidthQualification;
    const production = window.__gppCandidateCProduction;
    const state = window.__gppWidthControl?.inspect()?.state || null;
    const provenanceKey = `gpp:srwf-inbox-fit:v1:${formId}:${gridId}`;
    const nativeRaw = localStorage.getItem(gridId);
    const provenanceRaw = localStorage.getItem(provenanceKey);
    let nativeSaved = null;
    let provenance = null;
    try { nativeSaved = nativeRaw ? JSON.parse(nativeRaw) : null; } catch (error) { nativeSaved = {parse_error: String(error)}; }
    try { provenance = provenanceRaw ? JSON.parse(provenanceRaw) : null; } catch (error) { provenance = {parse_error: String(error)}; }
    const displayed = state?.filter(column => !column.hide) || [];
    return {
      grid_id: gridId,
      profile: Boolean(root),
      center: center ? {clientWidth: center.clientWidth, scrollWidth: center.scrollWidth} : null,
      displayed_width: displayed.reduce((sum, column) => sum + Number(column.width || 0), 0),
      state,
      native_saved: nativeSaved,
      provenance,
      production: production ? JSON.parse(JSON.stringify(production)) : null,
      resize_events: report?.resize_events ? JSON.parse(JSON.stringify(report.resize_events)) : [],
      rows: root ? root.querySelectorAll('.ag-center-cols-container .ag-row').length : null,
      pager_text: root?.querySelector('.ag-paging-panel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
      header_ids: root ? [...root.querySelectorAll('.ag-header-cell[col-id]')].map(node => node.getAttribute('col-id')) : [],
      native_scrollbars: root ? root.querySelectorAll('.ag-body-horizontal-scroll').length : 0,
    };
  }, {gridId, formId: form.form_id});
}

async function settle(page, ms = 500) { await page.waitForTimeout(ms); }
async function cleanStorageAndReload(page, gridId) {
  await page.evaluate(({gridId, formId}) => {
    localStorage.removeItem(gridId);
    localStorage.removeItem(`gpp:srwf-inbox-fit:v1:${formId}:${gridId}`);
  }, {gridId, formId: form.form_id});
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
}

async function legacyV040RegressionControl(page, context) {
  const productionAsset = path.join(repoRoot, 'assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js');
  const legacyAsset = path.join(repoRoot, 'tests/repro-evidence-lab/fixtures/srwf-gravity-flow-inbox-initial-geometry-guard-v0.4.0.js');
  const currentBytes = fs.readFileSync(productionAsset);
  const legacyBytes = fs.readFileSync(legacyAsset);
  assert.notEqual(hash(productionAsset), hash(legacyAsset), 'legacy mutation fixture unexpectedly equals repaired production source');
  const evidence = {route: context.kind, legacy_asset_sha256: hash(legacyAsset), checkpoints: {}};

  try {
    fs.writeFileSync(productionAsset, legacyBytes);
    await page.setViewportSize({width: 1920, height: 900});
    const url = new URL(context.url);
    url.searchParams.set('width_lab_discriminator', '1');
    await page.goto(url.toString(), {waitUntil: 'networkidle'});
    await waitForGrid(page);
    const gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
    await cleanStorageAndReload(page, gridId);
    evidence.checkpoints.wide = await snapshot(page, gridId);
    assert.ok(Math.abs(evidence.checkpoints.wide.displayed_width - evidence.checkpoints.wide.center.clientWidth) <= 2,
      'v0.4.0 control did not begin from a fitted 1920 baseline');

    await page.setViewportSize({width: 1680, height: 900});
    await settle(page, 300);
    evidence.checkpoints.narrow_live = await snapshot(page, gridId);
    assert.ok(evidence.checkpoints.narrow_live.center.scrollWidth > evidence.checkpoints.narrow_live.center.clientWidth,
      'v0.4.0 control did not expose the expected live narrow overflow');

    await page.reload({waitUntil: 'networkidle'});
    await waitForGrid(page);
    await settle(page);
    evidence.checkpoints.narrow_reload = await snapshot(page, gridId);
    assert.equal(evidence.checkpoints.narrow_reload.production?.repair_count || 0, 1,
      'v0.4.0 control did not execute its known one-shot narrow normalization');
    assert.ok(evidence.checkpoints.narrow_reload.center.scrollWidth - evidence.checkpoints.narrow_reload.center.clientWidth <= 1,
      'v0.4.0 control did not fit at 1680');
    const narrowWidths = widths(evidence.checkpoints.narrow_reload.state);

    await page.setViewportSize({width: 1920, height: 900});
    await page.reload({waitUntil: 'networkidle'});
    await waitForGrid(page);
    await settle(page);
    evidence.checkpoints.wide_reload = await snapshot(page, gridId);
    assert.equal(evidence.checkpoints.wide_reload.production?.repair_count || 0, 0,
      'v0.4.0 negative control unexpectedly performed grow recovery');
    assertWidthsClose(widths(evidence.checkpoints.wide_reload.state), narrowWidths,
      'v0.4.0 negative control narrow widths after direct wide reload');
    evidence.stranded_blank_px = evidence.checkpoints.wide_reload.center.clientWidth - evidence.checkpoints.wide_reload.displayed_width;
    assert.ok(evidence.stranded_blank_px >= 24,
      `v0.4.0 negative control did not reproduce stranded blank width: ${evidence.stranded_blank_px}`);
    evidence.status = 'EXPECTED_FAILURE_REPRODUCED';
    return evidence;
  } finally {
    fs.writeFileSync(productionAsset, currentBytes);
  }
}

async function routeSequence(page, context) {
  const evidence = {route: context.kind, checkpoints: {}};
  await page.setViewportSize({width: 1920, height: 900});
  const url = new URL(context.url);
  url.searchParams.set('width_lab_discriminator', '1');
  await page.goto(url.toString(), {waitUntil: 'networkidle'});
  await waitForGrid(page);
  let gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  assert.ok(gridId, `${context.kind}: native grid id missing`);
  await cleanStorageAndReload(page, gridId);
  gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');

  const wide = evidence.checkpoints.wide_baseline = await snapshot(page, gridId);
  assert.equal(wide.profile, true, `${context.kind}: authorized wrapper missing`);
  assert.ok(wide.center && wide.center.scrollWidth - wide.center.clientWidth <= 1, `${context.kind}: fresh 1920 baseline overflows`);
  assert.ok(Math.abs(wide.displayed_width - wide.center.clientWidth) <= 2, `${context.kind}: fresh 1920 columns do not use available width`);
  assert.equal(wide.provenance, null, `${context.kind}: native startup fit was incorrectly claimed as GPP provenance`);
  assert.deepEqual(wide.header_ids, ids, `${context.kind}: admitted column identity/order changed`);
  assert.equal(wide.native_scrollbars, 1, `${context.kind}: native scrollbar topology changed`);
  const baselineNonWidth = nonWidth(wide.state);
  const baselineRows = wide.rows;
  const baselinePager = wide.pager_text;

  const repairsAtWide = wide.production?.repair_count || 0;
  await page.setViewportSize({width: 1680, height: 900});
  await settle(page, 350);
  const narrowLive = evidence.checkpoints.wide_to_narrow_live = await snapshot(page, gridId);
  assert.equal(narrowLive.production?.repair_count || 0, repairsAtWide, `${context.kind}: live shrink triggered GPP fit`);
  assert.ok(narrowLive.center.scrollWidth > narrowLive.center.clientWidth, `${context.kind}: live shrink did not preserve temporary native overflow control`);
  assert.deepEqual(nonWidth(narrowLive.state), baselineNonWidth, `${context.kind}: live shrink changed non-width state`);

  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
  const narrowReload = evidence.checkpoints.narrow_reload_normalization = await snapshot(page, gridId);
  assert.equal(narrowReload.production?.repair_count || 0, 1, `${context.kind}: narrow reload did not perform exactly one GPP normalization`);
  assert.ok(narrowReload.center.scrollWidth - narrowReload.center.clientWidth <= 1, `${context.kind}: narrow reload left fit-capable overflow`);
  assert.ok(narrowReload.provenance, `${context.kind}: narrow GPP fit provenance missing`);
  assert.ok(Math.abs(narrowReload.provenance.usable_width - narrowReload.center.clientWidth) <= 1, `${context.kind}: provenance usable width does not bind to fitted viewport`);
  assertWidthsClose(widths(narrowReload.native_saved), widths(narrowReload.state), `${context.kind}: native persistence after narrow fit`);
  assert.deepEqual(nonWidth(narrowReload.state), baselineNonWidth, `${context.kind}: narrow fit changed non-width state`);

  const narrowWidths = widths(narrowReload.state);
  await page.setViewportSize({width: 1760, height: 900});
  await page.setViewportSize({width: 1840, height: 900});
  await page.setViewportSize({width: 1920, height: 900});
  await settle(page, 550);
  const wideLive = evidence.checkpoints.narrow_fitted_to_wide_live = await snapshot(page, gridId);
  assert.equal(wideLive.production?.repair_count || 0, 2, `${context.kind}: bounded live grow recovery did not execute exactly once`);
  assert.ok(wideLive.center.scrollWidth - wideLive.center.clientWidth <= 1, `${context.kind}: live grow left horizontal overflow`);
  assert.ok(Math.abs(wideLive.displayed_width - wideLive.center.clientWidth) <= 2, `${context.kind}: live grow left stranded blank width`);
  assert.notDeepEqual(widths(wideLive.state), narrowWidths, `${context.kind}: live grow did not change narrow fitted widths`);
  assert.ok(wideLive.provenance && wideLive.provenance.usable_width > narrowReload.provenance.usable_width, `${context.kind}: live grow provenance was not advanced`);
  assert.deepEqual(nonWidth(wideLive.state), baselineNonWidth, `${context.kind}: live grow changed non-width state`);

  await page.setViewportSize({width: 1680, height: 900});
  await settle(page, 300);
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
  const narrowAgain = evidence.checkpoints.narrow_again_before_direct_reload = await snapshot(page, gridId);
  assert.equal(narrowAgain.production?.repair_count || 0, 1, `${context.kind}: second narrow reload did not normalize once`);
  assert.ok(narrowAgain.provenance, `${context.kind}: second narrow provenance missing`);
  const directNarrowWidths = widths(narrowAgain.state);
  await page.setViewportSize({width: 1920, height: 900});
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
  const directWide = evidence.checkpoints.narrow_fitted_to_wide_reload = await snapshot(page, gridId);
  assert.equal(directWide.production?.repair_count || 0, 1, `${context.kind}: direct wide reload did not perform one provenance-gated grow recovery`);
  assert.ok(directWide.center.scrollWidth - directWide.center.clientWidth <= 1, `${context.kind}: direct wide reload overflowed`);
  assert.ok(Math.abs(directWide.displayed_width - directWide.center.clientWidth) <= 2, `${context.kind}: direct wide reload remained stranded at narrow geometry`);
  assert.notDeepEqual(widths(directWide.state), directNarrowWidths, `${context.kind}: direct wider reload kept narrow widths`);
  assert.ok(directWide.provenance && directWide.provenance.usable_width > narrowAgain.provenance.usable_width, `${context.kind}: direct wide provenance was not advanced`);
  assert.deepEqual(nonWidth(directWide.state), baselineNonWidth, `${context.kind}: direct wide recovery changed non-width state`);

  await page.setViewportSize({width: 1680, height: 900});
  await settle(page, 300);
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
  const manualStart = evidence.checkpoints.manual_control_narrow_start = await snapshot(page, gridId);
  assert.ok(manualStart.provenance, `${context.kind}: manual control lacks starting GPP provenance`);

  const resizeHandle = page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"] .ag-header-cell-resize').first();
  const point = await resizeHandle.evaluate(node => {
    const box = node.getBoundingClientRect();
    for (const fraction of [.1, .25, .4, .6, .8, .9]) {
      const x = box.x + box.width * fraction;
      const y = box.y + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === node || node.contains(hit))) return {x, y};
    }
    return null;
  });
  assert.ok(point, `${context.kind}: manual resize handle not hittable`);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 90, point.y, {steps: 8});
  await page.mouse.up();
  await settle(page, 250);
  const afterManual = evidence.checkpoints.manual_after_drag = await snapshot(page, gridId);
  assert.equal(afterManual.provenance, null, `${context.kind}: manual drag did not revoke GPP provenance`);
  assert.ok(afterManual.resize_events.some(event => event.source === 'uiColumnDragged' && event.finished === true), `${context.kind}: authentic manual uiColumnDragged control missing`);
  const manualWidths = widths(afterManual.state);
  assert.notDeepEqual(manualWidths, widths(manualStart.state), `${context.kind}: manual drag did not change widths`);
  assertWidthsClose(widths(afterManual.native_saved), manualWidths, `${context.kind}: native manual width persistence`);
  const repairsAfterManual = afterManual.production?.repair_count || 0;

  await page.setViewportSize({width: 1920, height: 900});
  await settle(page, 550);
  const manualWideLive = evidence.checkpoints.manual_then_wide_live = await snapshot(page, gridId);
  assert.equal(manualWideLive.production?.repair_count || 0, repairsAfterManual, `${context.kind}: live grow overrode manual widths`);
  assertWidthsClose(widths(manualWideLive.state), manualWidths, `${context.kind}: manual widths after live grow`);

  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await settle(page);
  const manualWideReload = evidence.checkpoints.manual_then_wide_reload = await snapshot(page, gridId);
  assert.equal(manualWideReload.production?.repair_count || 0, 0, `${context.kind}: wide reload overrode manual widths without GPP provenance`);
  assertWidthsClose(widths(manualWideReload.state), manualWidths, `${context.kind}: manual widths after wide reload`);
  assert.equal(manualWideReload.provenance, null, `${context.kind}: manual reload recreated provenance without a GPP fit`);

  for (const [name, checkpoint] of Object.entries(evidence.checkpoints)) {
    assert.equal(checkpoint.rows, baselineRows, `${context.kind}/${name}: row count changed`);
    assert.equal(checkpoint.pager_text, baselinePager, `${context.kind}/${name}: pager changed`);
    assert.deepEqual(checkpoint.header_ids, ids, `${context.kind}/${name}: column identities/order changed`);
    assert.equal(checkpoint.native_scrollbars, 1, `${context.kind}/${name}: native scrollbar count changed`);
  }

  evidence.status = 'PASS';
  return evidence;
}

let browser;
let pages = [];
try {
  const attrs = {selectedFormsJson: JSON.stringify([{value: form.form_id}])};
  pages = JSON.parse(wp(`$items=array();foreach(array('shortcode'=>'[gravityflow page="inbox" form="${form.form_id}"]','block'=>'<!-- wp:gravityflow/inbox ${JSON.stringify(attrs)} /-->') as $kind=>$content){$id=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Bidirectional fit '.$kind,'post_content'=>wp_slash($content)),true);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$items[]=array('id'=>(int)$id,'kind'=>$kind,'url'=>get_permalink($id));}echo wp_json_encode($items);`));
  wp(`update_option('gpp_width_candidate_d_lab',array('pages'=>${JSON.stringify(pages.map(page => page.id))},'observer_path'=>${JSON.stringify(path.join(repoRoot, 'tests/repro-evidence-lab/inbox-width-candidate-d-observer.js'))},'accepted_ids'=>${JSON.stringify(ids)},'control_state'=>array()),false);`);
  fs.copyFileSync(path.join(repoRoot, 'tests/repro-evidence-lab/inbox-width-candidate-d-mu.php'), mu);

  process.env.IVD2_ADMIN_USER = fixture.operator.login;
  process.env.IVD2_ADMIN_PASSWORD = 'wu21-bootstrap-pass-2026';
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1920, height: 900}});
  page.on('pageerror', error => result.page_errors.push(String(error)));
  await login(page);

  result.v040_negative_control = await legacyV040RegressionControl(page, pages.find(item => item.kind === 'shortcode'));
  for (const context of pages) result.routes.push(await routeSequence(page, context));

  assert.equal(hash(bundle), originalBundle, 'Gravity Flow vendor bundle was modified');
  assert.deepEqual(result.page_errors, [], 'browser page errors occurred during bidirectional recovery');
  result.gravity_flow_package_sha256 = hash(process.env.WU21_FLOW_ZIP);
  result.gravity_flow_common_inbox_sha256 = originalBundle;
  result.disposition = 'BIDIRECTIONAL_VIEWPORT_FIT_RECOVERY_RUNTIME_VERIFIED';
  result.execution_status = 'PASS';
  result.remaining_not_proven = [
    'Owner production-site/theme acceptance is not established by the pinned WU21 lab.',
    'Host versions/shapes outside the admitted Gravity Flow 3.1.0 runtime remain outside this exact-runtime proof.',
  ];
} catch (error) {
  result.execution_status = 'ERROR';
  result.failure = String(error.stack || error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (fs.existsSync(mu)) fs.unlinkSync(mu);
  if (pages.length) wp(`foreach(${JSON.stringify(pages.map(page => page.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_d_lab');`);
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-bidirectional-fit-recovery-evidence.json'), JSON.stringify(result, null, 2) + '\n');
}

console.log('INBOX_WIDTH_BIDIRECTIONAL_FIT_RECOVERY_RUNTIME_PASS');
