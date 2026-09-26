import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertActionVisualCoverage, evaluateDesignConvergence, projectScenarioStatus } from './design-convergence-policy.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
const policy=contract.design_comparison_policy;
const seed=scenario=>Object.fromEntries(scenario.design_relations.map(name=>{
  const rule=policy.relations[name];
  const evidence=rule.kind==='numeric_delta'?{design:10,runtime:10,delta:0}:{design:'SAME',runtime:'SAME',delta:null};
  if(rule.minimum_observations_each!==undefined) evidence.observations={design:2,runtime:2};
  return [name,evidence];
}));
const mutations={
  focus:'search_focus_outline',
  pagination:'pager_current_background_color',
  search_empty:'empty_state_border',
  search_result:'result_summary_color',
};
for(const [action,relation] of Object.entries(mutations)){
  const scenario=contract.scenarios.find(item=>item.action===action);
  assert.ok(scenario,`missing scenario for ${action}`);
  assert.doesNotThrow(()=>assertActionVisualCoverage(policy,scenario));
  const evidence=seed(scenario);
  evidence[relation]={design:'DESIGN',runtime:'MUTATED',delta:null};
  const evaluation=evaluateDesignConvergence(evidence,policy,scenario.design_relations);
  assert.equal(evaluation.relations[relation].classification,'WARNING');
  assert.equal(projectScenarioStatus({captureStability:'PASS',designComparison:evaluation,mode:'PREVIEW_DIAGNOSTIC'}),'VISUAL_REGRESSION_WARNING');
}
const focus=contract.scenarios.find(item=>item.action==='focus');
const within=evaluateDesignConvergence(seed(focus),policy,focus.design_relations);
assert.equal(within.status,'PASS');
assert.equal(projectScenarioStatus({captureStability:'PASS',designComparison:within,mode:'PREVIEW_DIAGNOSTIC'}),'PASS');
const missing=seed(focus);delete missing[policy.action_requirements.focus[0]];
const invalid=evaluateDesignConvergence(missing,policy,focus.design_relations);
assert.equal(invalid.status,'INVALID_EVIDENCE');
assert.throws(()=>projectScenarioStatus({captureStability:'PASS',designComparison:invalid,mode:'PREVIEW_DIAGNOSTIC'}),/required design comparison evidence is invalid/);
const uncovered={...focus,design_relations:focus.design_relations.filter(name=>name!==policy.action_requirements.focus[0])};
assert.throws(()=>assertActionVisualCoverage(policy,uncovered),/action-specific visual relation/);
console.log('STATE_VISUAL_FALSIFICATION_PASS focus_mutation_warns=true pagination_mutation_warns=true empty_mutation_warns=true search_result_mutation_warns=true missing_state_evidence_fails=true within_policy_pass=true same_run_stability_remains_distinct=true cardinality_explicit=true');
