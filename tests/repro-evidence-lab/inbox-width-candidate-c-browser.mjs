// WU21 exact-runtime verification of the production Candidate C implementation.
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
  schema_version: 2,
  repo_base: '24c29c9dfeda5c38d8ff021526da65ddaa301a6b',
  repo_head: process.env.GPP_WU21_REPOSITORY_SHA,
  policy: {saved_manual_overflow: 'NORMALIZE_IF_FIT_CAPABLE', live_shrink: 'DEFER_UNTIL_NEXT_INITIAL_RESTORE'},
  mode: 'PRODUCTION_IMPLEMENTATION_VERIFICATION',
  production_repair_executed: true,
  mutation_prototype_executed: false,
  runtime: JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'))),
  scenarios: [],
  scope_falsification: [],
  remaining_not_proven: [],
  page_errors: [],
};

assert.equal(hash(process.env.WU21_FLOW_ZIP), 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404');
const bundle = path.join(wpPath, 'wp-content/plugins/gravityflow/assets/js/dist/common-inbox.4181e438e8373cc50e14.js');
const originalBundle = hash(bundle);
assert.equal(originalBundle, 'f5866f71b6cf2dabf62f586998eddc382a2a6a49801ccee7e87536043acfbce4');

function wp(code) {
  const command = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], {encoding: 'utf8'});
  if (command.status !== 0) throw new Error(`${command.stderr}\n${command.stdout}`);
  return command.stdout.trim();
}

function state(widths, extra = {}) {
  return ids.map((colId, index) => ({
    colId, width: widths[index], hide: false, pinned: null, sort: null, sortIndex: null,
    aggFunc: null, rowGroup: false, rowGroupIndex: null, pivot: false, pivotIndex: null, flex: null,
    ...(extra[colId] || {}),
  }));
}
const stale = state([165, 528, 414, 355, 410]);
const fitting = state([80, 200, 200, 200, 200], {[ids[2]]: {sort: 'asc', sortIndex: 0}});
const minimumSum = 530;
let browser;
let pages = [];
let unrelatedForm = 0;
let activation = null;
let bindingSnapshot = null;
const visual = String.raw`$v=new \GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle(new \GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore(\GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle::OPTION_NAME));`;

async function snapshot(page) {
  return page.evaluate(() => {
    const report = window.__gppWidthQualification;
    const production = window.__gppCandidateCProduction;
    const root = document.querySelector('[data-js="gflow-inbox"]');
    const viewport = root?.querySelector('.ag-center-cols-viewport');
    const textHeader = root?.querySelector('.ag-header-cell-text');
    return {
      report: report ? JSON.parse(JSON.stringify(report)) : null,
      production: production ? JSON.parse(JSON.stringify(production)) : null,
      prior: window.__gppWidthPrior || null,
      controls: window.__gppWidthControl?.trace || null,
      public_state: window.__gppWidthControl?.inspect() || null,
      profile: !!document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]'),
      center: viewport ? {clientWidth: viewport.clientWidth, scrollWidth: viewport.scrollWidth} : null,
      headers: root ? [...root.querySelectorAll('.ag-header-cell[col-id]')].map(node => ({id: node.getAttribute('col-id'), width: node.getBoundingClientRect().width})) : [],
      rows: root ? root.querySelectorAll('.ag-center-cols-container .ag-row').length : null,
      rtl: root ? {
        ag_ltr: !!root.querySelector('.ag-ltr'),
        ag_rtl: !!root.querySelector('.ag-rtl'),
        directions: Object.fromEntries(['.ag-root-wrapper', '.ag-center-cols-viewport', '.ag-header-viewport', '.ag-body-horizontal-scroll-viewport'].map(selector => {
          const node = root.querySelector(selector);
          return [selector, node ? getComputedStyle(node).direction : null];
        })),
        header_text: textHeader ? getComputedStyle(textHeader).direction : null,
        cell_text: root.querySelector('.ag-cell') ? getComputedStyle(root.querySelector('.ag-cell')).direction : null,
        grids: root.querySelectorAll('.ag-root-wrapper').length,
        scrollbars: root.querySelectorAll('.ag-body-horizontal-scroll').length,
      } : null,
    };
  });
}

function attachedCount(s) {
  return s.production?.attachment?.filter(item => item.attached).length || 0;
}
function repairCount(s) {
  return s.production?.repair_count || 0;
}
function nonWidth(columnState) {
  return columnState.map(({width, ...rest}) => rest);
}
function productionDeliveries(s) {
  return s.production?.deliveries || [];
}
function assertAuthorizedRuntime(s, name) {
  assert.equal(s.profile, true, `${name}: authorized wrapper missing`);
  assert.equal(s.report?.function_was_attached_before_mount, true, `${name}: observer was not pre-mount`);
  assert.ok(s.report.attachment.every(item => !item.failure && !item.mounted_before_attachment), `${name}: observer attachment failure`);
  assert.equal(attachedCount(s), 1, `${name}: production Candidate C attachment count`);
  assert.ok(s.rtl?.ag_ltr && !s.rtl?.ag_rtl, `${name}: PR #126 ag-ltr boundary changed`);
  assert.equal(s.rtl?.grids, 1, `${name}: native Grid count changed`);
  assert.equal(s.rtl?.scrollbars, 1, `${name}: native horizontal scrollbar count changed`);
  assert.ok(Object.values(s.rtl?.directions || {}).every(direction => direction === 'ltr'), `${name}: physical Grid axis changed`);
  assert.equal(s.rtl?.header_text, 'rtl', `${name}: Persian header text direction changed`);
  if (s.rtl?.cell_text) assert.equal(s.rtl.cell_text, 'rtl', `${name}: Persian cell text direction changed`);
  const deliveries = productionDeliveries(s);
  assert.ok(deliveries.length >= 1, `${name}: production callback never received a native delivery`);
  assert.ok(deliveries.every(item => !item.threw), `${name}: production callback threw unexpectedly`);
  assert.ok(deliveries.every(item => item.previous_return === 'prior-return'), `${name}: prior callback return was not preserved`);
  assert.ok(deliveries.every(item => item.this_api), `${name}: callback receiver/native API identity was not preserved`);
  assert.ok(s.prior?.some(item => item.name === 'onGridSizeChanged' && item.native_this_api), `${name}: known prior callback was not composed`);
}

async function scrollProof(page) {
  return page.evaluate(async () => {
    const root = document.querySelector('[data-js="gflow-inbox"]');
    const viewport = root.querySelector('.ag-body-horizontal-scroll-viewport');
    const samples = [];
    for (const fraction of [0, 1, 0.5]) {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) * fraction;
      await new Promise(resolve => setTimeout(resolve, 100));
      const cells = [...root.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0, 1).flatMap(row => [...row.querySelectorAll('.ag-cell[col-id]')]);
      samples.push({
        left: viewport.scrollLeft,
        range: viewport.scrollWidth - viewport.clientWidth,
        alignment: cells.map(cell => {
          const header = root.querySelector(`.ag-header-cell[col-id="${cell.getAttribute('col-id')}"]`);
          return header ? Math.abs(header.getBoundingClientRect().x - cell.getBoundingClientRect().x) : null;
        }),
      });
    }
    return samples;
  });
}

async function capture(page, context, name, saved, options = {}) {
  const {
    width = 1440,
    empty = false,
    raw = null,
    before = false,
    live = false,
    wrongColumns = false,
    fakeWrapper = false,
    expectAttached = true,
    expectedRepair = null,
  } = options;
  await page.setViewportSize({width, height: 900});
  const url = new URL(context.url);
  url.searchParams.set('width_lab_discriminator', '1');
  if (before) url.searchParams.set('width_lab_before_guard', '1');
  if (live) url.searchParams.set('width_lab_live', '1');
  if (wrongColumns) url.searchParams.set('width_lab_wrong_columns', '1');
  if (fakeWrapper) url.searchParams.set('width_lab_fake_wrapper', '1');
  if (saved || raw !== null) url.searchParams.set('width_lab_seeded', '1');
  if (empty) url.searchParams.set('width_lab_empty', '1');

  await page.goto(url.toString(), {waitUntil: 'networkidle'});
  await waitForGrid(page);
  const gridId = await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  await page.evaluate(({gridId, saved, raw}) => {
    localStorage.setItem('method-local-sentinel', 'keep');
    sessionStorage.setItem('method-session-sentinel', 'keep');
    if (raw !== null) localStorage.setItem(gridId, raw);
    else if (saved) localStorage.setItem(gridId, JSON.stringify(saved));
    else localStorage.removeItem(gridId);
    sessionStorage.removeItem(gridId);
  }, {gridId, saved, raw});

  const errorStart = result.page_errors.length;
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  await page.waitForTimeout(450);
  const observed = await snapshot(page);
  const entry = {route: context.kind, scenario: name, viewport: {width, height: 900}, grid_id: gridId, fixture_state: saved, fixture_raw: raw, ...observed};
  entry.errors = result.page_errors.slice(errorStart);
  result.scenarios.push(entry);

  assert.equal(attachedCount(entry), expectAttached ? 1 : 0, `${name}: unexpected production attachment`);
  if (expectedRepair !== null) assert.equal(repairCount(entry), expectedRepair, `${name}: unexpected production native sizing count`);
  if (expectAttached) assertAuthorizedRuntime(entry, name);
  if (empty) assert.equal(entry.rows, 0, `${name}: Inbox is not empty`);
  return entry;
}

async function after(page) {
  await page.waitForTimeout(500);
  return snapshot(page);
}

async function authorizedCases(page, context) {
  const clean = await capture(page, context, 'clean', null, {expectedRepair: 0});
  assert.ok(clean.center && clean.center.scrollWidth - clean.center.clientWidth <= 1, 'clean native fit is not fitting');

  const old = await capture(page, context, 'known_stale_165_528_414_355_410', stale, {expectedRepair: 1});
  assert.ok(old.center.scrollWidth - old.center.clientWidth <= 1, 'stale state was not normalized to usable center width');
  assert.deepEqual(nonWidth(old.public_state.state), nonWidth(stale), 'stale repair changed non-width state');
  assert.ok(old.report.resize_events.some(event => event.source === 'sizeColumnsToFit'), 'stale repair lacked native sizeColumnsToFit evidence');
  old.scroll_after_repair = await scrollProof(page);
  assert.ok(old.scroll_after_repair.every(sample => sample.alignment.every(delta => delta === null || delta <= 1)), 'header/body alignment changed after repair');
  assert.deepEqual(old.headers.map(column => column.id), ids, 'PR #126 physical column order changed');

  old.native_saved = await page.evaluate(id => JSON.parse(localStorage.getItem(id)), old.grid_id);
  assert.deepEqual(old.native_saved, old.public_state.state, 'Gravity Flow native persistence did not save corrected widths');
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  old.after_reload = await after(page);
  assertAuthorizedRuntime(old.after_reload, 'native_persistence_reload');
  assert.equal(repairCount(old.after_reload), 0, 'restored corrected widths required a second repair');
  assert.deepEqual(old.after_reload.public_state.state, old.native_saved, 'reload did not restore native corrected state exactly');

  const fit = await capture(page, context, 'fitting_nondefault_saved', fitting, {expectedRepair: 0});
  assert.deepEqual(fit.public_state.state, fitting, 'fitting saved state changed');

  const empty = await capture(page, context, 'empty_stale', stale, {empty: true, expectedRepair: 1});
  assert.ok(!empty.report.events.some(event => event.callback === 'onFirstDataRendered'), 'empty repair depended on firstDataRendered');
  assert.ok(empty.center.scrollWidth - empty.center.clientWidth <= 1, 'empty stale Inbox was not normalized');

  const wide = await capture(page, context, 'wide_desktop_saved', stale, {width: 1920});
  const expectedWide = 1872 > wide.center.clientWidth + 1 && minimumSum <= wide.center.clientWidth ? 1 : 0;
  assert.equal(repairCount(wide), expectedWide, 'wide desktop repair did not follow actual geometry');
  if (expectedWide) assert.ok(wide.center.scrollWidth - wide.center.clientWidth <= 1, 'wide fit-capable overflow remained');

  for (const width of [390, 320]) {
    const narrow = await capture(page, context, `native_minimum_overflow_${width}`, stale, {width, expectedRepair: 0});
    assert.ok(narrow.center.clientWidth < minimumSum, `${width}px fixture unexpectedly fit native minima`);
    assert.ok(narrow.center.scrollWidth > narrow.center.clientWidth, `${width}px legitimate minimum overflow was removed`);
    narrow.scroll = await scrollProof(page);
    assert.ok(narrow.scroll.some(sample => sample.left > 0), `${width}px native horizontal scrollbar is not usable`);
    assert.ok(narrow.scroll.every(sample => sample.alignment.every(delta => delta === null || delta <= 1)), `${width}px header/body scroll alignment changed`);
  }

  const pinned = await capture(page, context, 'pinned_stale', state([165, 528, 414, 355, 410], {[ids[3]]: {pinned: 'left'}}), {expectedRepair: 0});
  assert.deepEqual(pinned.public_state.state, pinned.fixture_state, 'pinned state was mutated by Candidate C');

  const flex = await capture(page, context, 'flex_stale', state([165, 528, 414, 355, 410], {[ids[4]]: {flex: 1}}), {expectedRepair: 0});
  assert.equal(flex.public_state.state.find(column => column.colId === ids[4]).flex, 1, 'flex state was changed');

  const mounted = await capture(page, context, 'shrink_grow_same_mount', fitting, {expectedRepair: 0});
  await page.setViewportSize({width: 900, height: 900});
  mounted.after_shrink = await after(page);
  assert.equal(repairCount(mounted.after_shrink), 0, 'same-mount shrink retriggered Candidate C');
  assert.deepEqual(mounted.after_shrink.public_state.state, fitting, 'same-mount shrink changed saved widths');
  await page.setViewportSize({width: 1920, height: 900});
  mounted.after_grow = await after(page);
  assert.equal(repairCount(mounted.after_grow), 0, 'same-mount grow retriggered Candidate C');
  assert.deepEqual(mounted.after_grow.public_state.state, fitting, 'same-mount grow refit columns');
  await page.setViewportSize({width: 900, height: 900});
  await page.reload({waitUntil: 'networkidle'});
  await waitForGrid(page);
  mounted.after_remount = await after(page);
  assertAuthorizedRuntime(mounted.after_remount, 'reload_new_mount');
  const reloadExpected = 880 > mounted.after_remount.center.clientWidth + 1 && minimumSum <= mounted.after_remount.center.clientWidth ? 1 : 0;
  assert.equal(repairCount(mounted.after_remount), reloadExpected, 'new mount did not receive one fresh geometry opportunity');

  const manual = await capture(page, context, 'native_manual_after_guard', fitting, {expectedRepair: 0});
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
  assert.ok(point, 'manual resize handle was not hittable');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 600, point.y, {steps: 10});
  await page.mouse.up();
  manual.after_drag = await after(page);
  assert.equal(repairCount(manual.after_drag), 0, 'manual drag retriggered Candidate C');
  assert.ok(manual.after_drag.center.scrollWidth > manual.after_drag.center.clientWidth, 'manual overflow negative control missing');
  assert.notDeepEqual(manual.after_drag.public_state.state, fitting, 'manual drag did not change native state');
  assert.deepEqual(nonWidth(manual.after_drag.public_state.state), nonWidth(fitting), 'manual drag changed non-width state');
  manual.native_saved = await page.evaluate(id => JSON.parse(localStorage.getItem(id)), manual.grid_id);
  assert.deepEqual(manual.native_saved, manual.after_drag.public_state.state, 'Gravity Flow did not persist manual mounted-session change');

  const live = await capture(page, context, 'ordinary_live_refresh', stale, {live: true, expectedRepair: 1});
  const response = await page.waitForResponse(r => r.url().includes('/gravityflow/internal/inbox/changes') && r.request().method() === 'POST', {timeout: 15000});
  live.refresh_http = response.status();
  assert.equal(live.refresh_http, 200, 'native Live Refresh failed');
  live.after_refresh = await after(page);
  assert.equal(repairCount(live.after_refresh), 1, 'Live Refresh retriggered Candidate C');
  assert.deepEqual(live.after_refresh.public_state.state, live.public_state.state, 'Live Refresh changed corrected geometry unexpectedly');

  const before = await capture(page, context, 'unrelated_api_before_guard', fitting, {before: true, expectedRepair: 1});
  assert.ok(before.controls.some(record => record.origin === 'unrelated_before_geometry_guard'), 'pre-guard unrelated API control did not execute');
  assert.ok(before.center.scrollWidth - before.center.clientWidth <= 1, 'resulting effective pre-guard overflow was not normalized');

  const post = await capture(page, context, 'unrelated_api_after_guard', fitting, {expectedRepair: 0});
  await page.evaluate(next => window.__gppWidthControl.run('unrelated_after_guard', next), stale);
  post.after_api = await after(page);
  assert.equal(repairCount(post.after_api), 0, 'post-guard unrelated API state retriggered Candidate C');
  assert.deepEqual(post.after_api.public_state.state, stale, 'post-guard unrelated API state was overwritten by Candidate C');

  const extra = state([165, 528, 414, 355, 410], {
    [ids[2]]: {sort: 'desc', sortIndex: 1},
    [ids[1]]: {sort: 'asc', sortIndex: 0},
    [ids[4]]: {hide: true},
  });
  [extra[2], extra[3]] = [extra[3], extra[2]];
  const preserved = await capture(page, context, 'non_width_order_visibility_sort', extra, {expectedRepair: 1});
  assert.deepEqual(nonWidth(preserved.public_state.state), nonWidth(extra), 'repair changed non-width order/visibility/sort state');
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('method-local-sentinel'), sessionStorage.getItem('method-session-sentinel')]), ['keep', 'keep'], 'Candidate C touched unrelated browser storage');

  const mismatch = await capture(page, context, 'mismatched_ids', stale.slice(1), {expectedRepair: 0});
  assert.equal(repairCount(mismatch), 0, 'Candidate C tried to recover/reset mismatched native state');

  const malformed = await capture(page, context, 'malformed_json', null, {raw: '{invalid-json', expectedRepair: 0});
  assert.ok(malformed.errors.length > 0, 'malformed native saved state did not preserve host error behavior');
}

function installAmbiguousBindingForForm(formId) {
  const original = wp(`echo wp_json_encode(get_option('gpp_binding_set_lifecycle_v1'));`);
  const code = String.raw`
$state=get_option('gpp_binding_set_lifecycle_v1');
$found=null;
foreach($state['activations'] as $context_key=>$identity){
  $record=$state['installed'][$identity['binding_set_id']][$identity['binding_set_version']]??null;
  if(!$record||($record['artifact']['context']['form_source_ref']['form_id']??null)!=${formId})continue;
  if(!in_array('gravity_flow.inbox',$record['artifact']['context']['surfaces']??array(),true))continue;
  $found=$record;break;
}
if(!$found)throw new RuntimeException('Alpha binding record not found');
$clone=$found;
$clone['binding_set_id']='gpp.wu21.candidate-c.ambiguous';
$clone['artifact']['binding_set_id']=$clone['binding_set_id'];
$clone['artifact']['context']['surfaces'][]='gravity_flow.entry_detail';
$clone['artifact']['context']['surfaces']=array_values(array_unique($clone['artifact']['context']['surfaces']));
$key=\GravityPresentationProfiles\Core\Portable\CanonicalJson::hash($clone['artifact']['context']);
$clone['context_key']=$key;
$version=$clone['binding_set_version'];
$state['installed'][$clone['binding_set_id']][$version]=$clone;
$state['activations'][$key]=array('binding_set_id'=>$clone['binding_set_id'],'binding_set_version'=>$version);
update_option('gpp_binding_set_lifecycle_v1',$state,false);
echo 'OK';`;
  assert.equal(wp(code), 'OK');
  return original;
}

try {
  const attrs = {selectedFormsJson: JSON.stringify([{value: form.form_id}])};
  pages = JSON.parse(wp(`$items=array();foreach(array('shortcode'=>'[gravityflow page="inbox" form="${form.form_id}"]','block'=>'<!-- wp:gravityflow/inbox ${JSON.stringify(attrs)} /-->') as $kind=>$content){$id=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Candidate C production '.$kind,'post_content'=>wp_slash($content)),true);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$items[]=array('id'=>(int)$id,'kind'=>$kind,'url'=>get_permalink($id));}echo wp_json_encode($items);`));
  wp(`update_option('gpp_width_candidate_d_lab',array('pages'=>${JSON.stringify(pages.map(page => page.id))},'observer_path'=>${JSON.stringify(path.join(repoRoot, 'tests/repro-evidence-lab/inbox-width-candidate-d-observer.js'))},'accepted_ids'=>${JSON.stringify(ids)},'control_state'=>json_decode(${JSON.stringify(JSON.stringify(stale))},true)),false);`);
  fs.copyFileSync(path.join(repoRoot, 'tests/repro-evidence-lab/inbox-width-candidate-d-mu.php'), mu);

  process.env.IVD2_ADMIN_USER = fixture.operator.login;
  process.env.IVD2_ADMIN_PASSWORD = 'wu21-bootstrap-pass-2026';
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', error => result.page_errors.push(String(error)));
  await login(page);

  for (const context of pages) await authorizedCases(page, context);

  // Production scope falsification: exact active profile but the JS Grid shape
  // is deliberately changed after PHP binding resolution and before mount.
  const wrongColumns = await capture(page, pages[0], 'scope_wrong_column_identity', null, {wrongColumns: true, expectAttached: false, expectedRepair: 0});
  assert.equal(wrongColumns.profile, true, 'wrong-column falsifier lost the active profile wrapper');
  result.scope_falsification.push({scenario: 'correct_wrapper_wrong_column_identity', attached: attachedCount(wrongColumns)});

  // Ambiguous active binding configurations for one form must fail closed.
  bindingSnapshot = installAmbiguousBindingForForm(form.form_id);
  const ambiguous = await capture(page, pages[0], 'scope_ambiguous_binding', null, {expectAttached: false, expectedRepair: 0});
  result.scope_falsification.push({scenario: 'ambiguous_binding_resolution', attached: attachedCount(ambiguous), profile: ambiguous.profile});
  wp(`update_option('gpp_binding_set_lifecycle_v1',json_decode(${JSON.stringify(bindingSnapshot)},true),false);`);
  bindingSnapshot = null;

  // Inactive profile must not emit the production attachment.
  activation = JSON.parse(wp(visual + `echo wp_json_encode($v->resolve('gravity_flow.inbox'));`));
  assert.ok(activation, 'active Inbox visual profile missing before inactive-scope falsification');
  wp(visual + `$v->deactivate(array('surface'=>'gravity_flow.inbox'));`);
  const inactive = await capture(page, pages[0], 'inactive_profile', null, {expectAttached: false, expectedRepair: 0});
  assert.equal(inactive.profile, false, 'inactive profile still rendered authorized wrapper');
  result.scope_falsification.push({scenario: 'inactive_profile', attached: attachedCount(inactive)});
  wp(visual + `$a=json_decode(${JSON.stringify(JSON.stringify(activation))},true);$a['surface']='gravity_flow.inbox';$v->activate($a);`);
  activation = null;

  // Wrong/unbound form, both normal and with a forged global wrapper, must not
  // gain Candidate C authority.
  const unrelated = JSON.parse(wp(`$f=GFAPI::get_form(${form.form_id});unset($f['id']);$f['title']='Unrelated Candidate C form';$id=GFAPI::add_form($f);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$p=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Unrelated Inbox','post_content'=>'[gravityflow page="inbox" form="'.$id.'"]'),true);echo wp_json_encode(array('form_id'=>$id,'id'=>$p,'url'=>get_permalink($p),'kind'=>'shortcode'));`));
  unrelatedForm = unrelated.form_id;
  pages.push(unrelated);
  wp(`$lab=get_option('gpp_width_candidate_d_lab');$lab['pages'][]=${unrelated.id};update_option('gpp_width_candidate_d_lab',$lab,false);`);
  const unrelatedObserved = await capture(page, unrelated, 'unrelated_inbox_wrong_form', null, {expectAttached: false, expectedRepair: 0});
  result.scope_falsification.push({scenario: 'active_profile_wrong_unbound_form', attached: attachedCount(unrelatedObserved), profile: unrelatedObserved.profile});
  const forged = await capture(page, unrelated, 'unrelated_inbox_forged_wrapper', null, {fakeWrapper: true, expectAttached: false, expectedRepair: 0});
  assert.equal(forged.profile, true, 'forged wrapper falsifier did not create the wrapper negative control');
  result.scope_falsification.push({scenario: 'unrelated_inbox_global_wrapper_present', attached: attachedCount(forged)});

  assert.equal(hash(bundle), originalBundle, 'Gravity Flow vendor bundle was modified');
  result.gravity_flow_package_sha256 = hash(process.env.WU21_FLOW_ZIP);
  result.gravity_flow_common_inbox_sha256 = originalBundle;
  result.remaining_not_proven = [
    'Authentic same-page explicit Grid destroy/recreate was unavailable in the existing WU21 host; reload/new native mount is proven instead.',
    'Host versions/shapes outside the qualified Gravity Flow 3.1.0 capability set remain version-bounded and fail closed by production predicates.',
  ];
  result.disposition = 'PRODUCTION_CANDIDATE_C_RUNTIME_VERIFIED';
  result.execution_status = 'PASS_PRODUCTION_IMPLEMENTATION';
} catch (error) {
  result.execution_status = 'ERROR';
  result.failure = String(error.stack || error);
  throw error;
} finally {
  if (browser) await browser.close();
  if (fs.existsSync(mu)) fs.unlinkSync(mu);
  if (bindingSnapshot) wp(`update_option('gpp_binding_set_lifecycle_v1',json_decode(${JSON.stringify(bindingSnapshot)},true),false);`);
  if (activation) wp(visual + `$a=json_decode(${JSON.stringify(JSON.stringify(activation))},true);$a['surface']='gravity_flow.inbox';$v->activate($a);`);
  if (pages.length) wp(`foreach(${JSON.stringify(pages.map(page => page.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_d_lab');`);
  if (unrelatedForm) wp(`GFAPI::delete_form(${unrelatedForm});`);
  fs.writeFileSync(path.join(artifactDir, 'inbox-width-candidate-c-production-runtime.json'), JSON.stringify(result, null, 2) + '\n');
}

console.log('CANDIDATE_C_PRODUCTION_RUNTIME_PASS');
