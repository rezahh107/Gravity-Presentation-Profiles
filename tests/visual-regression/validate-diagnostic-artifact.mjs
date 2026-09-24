import fs from 'node:fs';
import path from 'node:path';
import { assertIntegratedHostIdentity } from './host-runtime-contract.mjs';
import { assertSerializedReferenceIdentity } from './reference-selection.mjs';

const contract = JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json', import.meta.url), 'utf8'));

const root = process.argv[2];
if (!root || !fs.existsSync(root)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: diagnostic artifact root is missing.');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = read('manifest.json');
if (manifest.status === 'VISUAL_TEST_INFRASTRUCTURE_FAILURE') {
  const failure = manifest.infrastructure_failure;
  if (!failure?.scenario || !failure?.failed_stage || !failure?.error?.stack) {
    throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: incomplete failure provenance in visual manifest.');
  }
  const failureFile = path.join(root, failure.scenario, 'infrastructure-failure.json');
  const stateFile = path.join(root, failure.scenario, 'capture-state.json');
  if (!fs.existsSync(failureFile) || !fs.existsSync(stateFile)) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: missing staged failure evidence for ${failure.scenario}.`);
  }
  throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${failure.scenario} failed at ${failure.failed_stage}: ${failure.error.stack}`);
}
if (!['PREVIEW_DIAGNOSTIC', 'APPROVED_VISUAL_CONTRACT'].includes(manifest.mode) || !Array.isArray(manifest.scenarios) || !manifest.scenarios.length) {
  throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid visual manifest.');
}
read('changed-files.json');
for (const scenario of manifest.scenarios) {
  for (const file of ['reference.png','actual.png','diff.png','metrics.json','scenario-state.json','geometry.json','computed-styles.json','dom-summary.json','environment.json']) {
    const target = path.join(root, scenario.id, file);
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: missing ${scenario.id}/${file}`);
  }
  for (const file of ['design-authority.png','design-authority-state.json','design-geometry.json','design-vs-runtime.json','host-integration.json']) {
    const target = path.join(root, scenario.id, file);
    if (!fs.existsSync(target) || fs.statSync(target).size === 0) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: missing ${scenario.id}/${file}`);
  }
  const environment=read(path.join(scenario.id,'environment.json')); const host=read(path.join(scenario.id,'host-integration.json'));
  assertIntegratedHostIdentity(environment.integrated_visual_host, contract.host_runtime);
  if (environment.design_authority?.classification!=='OWNER_APPROVED_DESIGN_AUTHORITY' || !['inbox-desktop','inbox-mobile'].includes(environment.design_authority?.surface) || environment.capture_scope!==contract.capture.scope || environment.capture_selector!==contract.capture.selector || host.elementor_container_present!==true || host.surface_present!==true || host.surface_dom_nested_in_elementor_container!==true) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid integrated host/design evidence for ${scenario.id}`);
  const metrics=read(path.join(scenario.id,'metrics.json')); const geometry=read(path.join(scenario.id,'geometry.json'));
  assertSerializedReferenceIdentity({metrics,environment,scenario,mode:manifest.mode});
  if (metrics.capture_scope!==contract.capture.scope) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid capture scope for ${scenario.id}`);
  if (typeof metrics.differing_pixel_ratio!=='number' || !Object.hasOwn(geometry.relationships||{},'last_card_to_pager_gap') || typeof geometry.relationships?.visual_vs_native_height_delta!=='number') {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: incomplete metrics for ${scenario.id}`);
  }
  const state=read(path.join(scenario.id,'scenario-state.json'));
  if (scenario.id==='shortcode-search-result' && !(state.observed_rows===1 && state.observed_cards===1 && state.unique_fixture_present===true)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: search_result postcondition evidence is invalid.');
  if (scenario.id==='shortcode-search-empty' && !(state.observed_rows===0 && state.observed_cards===0 && state.authentic_grid_surface_present===true && state.empty_state_kind==='NATIVE_GRID_ZERO_ROWS')) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: search_empty postcondition evidence is invalid.');
  if (scenario.id==='shortcode-pagination' && !(state.page_before==='1' && state.total_pages>=2 && state.page_after==='2' && state.first_page_rows===20 && state.second_page_rows>=1 && state.second_page_rows<=20 && state.row_identity_changed===true && state.native_next_control===true)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: pagination postcondition evidence is invalid.');
  if (scenario.id==='shortcode-focus' && state.search_input_owns_focus!==true) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: focus postcondition evidence is invalid.');
}
console.log(`VISUAL_DIAGNOSTIC_ARTIFACT_PASS scenarios=${manifest.scenarios.length} status=${manifest.status}`);
