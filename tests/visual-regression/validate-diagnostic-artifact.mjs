import fs from 'node:fs';
import path from 'node:path';
import { assertIntegratedHostIdentity } from './host-runtime-contract.mjs';
import { assertSerializedReferenceIdentity } from './reference-selection.mjs';
import { assertActionVisualCoverage, assertDesignComparisonEvidence, projectScenarioStatus } from './design-convergence-policy.mjs';
import { buildDesignEvidenceContext, EMPTY_STATE_QUALIFICATION_ID, MATRIX_J_QUALIFICATION_ID } from './evidence-context.mjs';
import { assertArtifactVazirProvenance } from './font-runtime-contract.mjs';
import { assertSerializedMatrixJProvenEvidence } from './matrix-j-evidence-contract.mjs';

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
const emptyStateQualification=read('empty-state-seam.json');
if(emptyStateQualification.qualification_id!==EMPTY_STATE_QUALIFICATION_ID) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: empty-state seam qualification identity mismatch.');
const matrixJ=read('matrix-j-browser-zoom.json');
if(matrixJ.qualification_id!==MATRIX_J_QUALIFICATION_ID||matrixJ.matrix!=='J') throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: Matrix J qualification identity mismatch.');
const zoom=contract.future_scenarios?.true_browser_zoom_200;
if (manifest.scenarios.some(scenario=>scenario.matrix?.includes('J'))) {
  throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: Matrix J is a separate genuine-browser-zoom qualification and must not be claimed by ordinary visual scenario matrices.');
}
const matrixContractStatus={
  PROVEN:'EXECUTED_PROVEN',
  NOT_PROVEN:'NOT_PROVEN',
  PROVEN_WITH_RUNTIME_FINDING:'EXECUTED_WITH_RUNTIME_FINDING',
}[matrixJ.status];
if(!matrixContractStatus) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: unsupported Matrix J runtime status ${matrixJ.status}.`);
if(zoom?.matrix!=='J'||zoom?.status!==matrixContractStatus) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: Matrix J contract/runtime status mismatch: contract=${zoom?.status||'MISSING'} runtime=${matrixJ.status}.`);
if(matrixJ.status==='PROVEN'){
  try { assertSerializedMatrixJProvenEvidence(matrixJ); }
  catch (error) { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: Matrix J PROVEN evidence is incomplete: ${error.message}`); }
}
if(matrixJ.status==='NOT_PROVEN'&&!matrixJ.remaining_evidence_path) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: Matrix J NOT_PROVEN must retain the authentic remaining evidence path.');

for (const scenario of manifest.scenarios) {
  const scenarioContract=contract.scenarios.find(candidate=>candidate.id===scenario.id);
  if (!scenarioContract) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: scenario ${scenario.id} is absent from the versioned contract.`);
  assertActionVisualCoverage(contract.design_comparison_policy,scenarioContract);
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
  assertArtifactVazirProvenance(environment,contract.host_runtime.vazir_font);
  if (environment.design_authority?.classification!=='OWNER_APPROVED_DESIGN_AUTHORITY' || !['inbox-desktop','inbox-mobile'].includes(environment.design_authority?.surface) || environment.capture_scope!==contract.capture.scope || environment.capture_selector!==contract.capture.selector || host.elementor_container_present!==true || host.fixture_mount_present!==true || host.surface_present!==true || host.surface_dom_nested_in_fixture_mount!==true || host.surface_dom_nested_in_elementor_container!==true || host.fixture_container_element_id!==environment.integrated_visual_host?.host_fixture?.container_element_id || host.fixture_mount_element_id!==environment.integrated_visual_host?.host_fixture?.mount_element_id) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid integrated host/design evidence for ${scenario.id}`);
  const metrics=read(path.join(scenario.id,'metrics.json')); const geometry=read(path.join(scenario.id,'geometry.json')); const designComparison=read(path.join(scenario.id,'design-vs-runtime.json'));
  assertSerializedReferenceIdentity({metrics,environment,scenario,mode:manifest.mode});
  const evidenceContext=buildDesignEvidenceContext(scenarioContract,emptyStateQualification);
  const designEvaluation=assertDesignComparisonEvidence(designComparison,contract.design_comparison_policy,scenarioContract.design_relations,evidenceContext);
  const projectedStatus=projectScenarioStatus({captureStability:scenario.capture_stability,designComparison:designEvaluation,mode:manifest.mode});
  if (scenario.status!==projectedStatus || scenario.design_comparison_status!==designEvaluation.status || scenario.design_warning_count!==designEvaluation.warning_count || scenario.design_not_comparable_count!==designEvaluation.not_comparable_count || scenario.design_native_host_limitation_count!==designEvaluation.native_host_limitation_count) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: scenario status/design evidence projection mismatch for ${scenario.id}`);
  if (metrics.capture_scope!==contract.capture.scope) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid capture scope for ${scenario.id}`);
  if (typeof metrics.differing_pixel_ratio!=='number' || !Object.hasOwn(geometry.relationships||{},'last_card_to_pager_gap') || typeof geometry.relationships?.visual_vs_native_height_delta!=='number' || !Number.isInteger(geometry.relationships?.visible_card_count)) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: incomplete metrics for ${scenario.id}`);
  }
  const state=read(path.join(scenario.id,'scenario-state.json'));
  if (scenario.id==='shortcode-search-result' && !(state.observed_rows===1 && state.observed_cards===1 && state.unique_fixture_present===true)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: search_result postcondition evidence is invalid.');
  if (scenario.id==='shortcode-search-empty' && !(state.observed_rows===0 && state.observed_cards===0 && state.authentic_grid_surface_present===true && state.empty_state_kind==='NATIVE_GRID_ZERO_ROWS')) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: search_empty postcondition evidence is invalid.');
  if (scenario.id==='shortcode-pagination' && !(state.page_before==='1' && state.total_pages>=2 && state.page_after==='2' && state.first_page_rows===20 && state.second_page_rows>=1 && state.second_page_rows<=20 && state.row_identity_changed===true && state.native_next_control===true)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: pagination postcondition evidence is invalid.');
  if (scenario.id==='shortcode-focus' && state.search_input_owns_focus!==true) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: focus postcondition evidence is invalid.');
}
const warningCount=manifest.scenarios.filter(scenario=>scenario.status==='VISUAL_REGRESSION_WARNING').length;
const failureCount=manifest.scenarios.filter(scenario=>scenario.status==='VISUAL_CONTRACT_FAIL').length;
const evidenceLimitationScenarioCount=manifest.scenarios.filter(scenario=>scenario.status==='EVIDENCE_LIMITATION').length;
const designWarningCount=manifest.scenarios.reduce((sum,scenario)=>sum+(scenario.design_warning_count||0),0);
const notComparableCount=manifest.scenarios.reduce((sum,scenario)=>sum+(scenario.design_not_comparable_count||0),0);
const nativeHostLimitationCount=manifest.scenarios.reduce((sum,scenario)=>sum+(scenario.design_native_host_limitation_count||0),0);
const expectedStatus=failureCount?'VISUAL_CONTRACT_FAIL':warningCount?'VISUAL_REGRESSION_WARNING':evidenceLimitationScenarioCount?'EVIDENCE_LIMITATION':'PASS';
if (manifest.warning_count!==warningCount || manifest.failure_count!==failureCount || manifest.evidence_limitation_scenario_count!==evidenceLimitationScenarioCount || manifest.design_relation_warning_count!==designWarningCount || manifest.design_relation_not_comparable_count!==notComparableCount || manifest.native_host_limitation_relation_count!==nativeHostLimitationCount || manifest.status!==expectedStatus) {
  throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: manifest warning/failure/qualified-evidence aggregation is inconsistent with scenario evidence.');
}
console.log(`VISUAL_DIAGNOSTIC_ARTIFACT_PASS scenarios=${manifest.scenarios.length} status=${manifest.status} warnings=${manifest.warning_count} design_relation_warnings=${manifest.design_relation_warning_count} not_comparable=${manifest.design_relation_not_comparable_count} native_host_limitations=${manifest.native_host_limitation_relation_count} matrix_j=${matrixJ.status}`);
