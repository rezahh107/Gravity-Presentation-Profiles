import assert from 'node:assert/strict';
import { evaluateDesignConvergence, projectScenarioStatus } from './design-convergence-policy.mjs';

const policy={schema_version:'1.0.0',relations:{width:{kind:'numeric_delta',tolerance:2},columns:{kind:'discrete_exact'}},action_requirements:{}};
const stableCapture='PASS';
const warning=evaluateDesignConvergence({width:{design:100,runtime:110,delta:10},columns:{design:2,runtime:2,delta:0}},policy,['width','columns']);
assert.equal(warning.status,'WARNING');
assert.equal(projectScenarioStatus({captureStability:stableCapture,designComparison:warning,mode:'PREVIEW_DIAGNOSTIC'}),'VISUAL_REGRESSION_WARNING');
assert.equal(projectScenarioStatus({captureStability:stableCapture,designComparison:warning,mode:'APPROVED_VISUAL_CONTRACT'}),'VISUAL_CONTRACT_FAIL');
const passing=evaluateDesignConvergence({width:{design:100,runtime:101,delta:1},columns:{design:2,runtime:2,delta:0}},policy,['width','columns']);
assert.equal(passing.status,'PASS');
assert.equal(projectScenarioStatus({captureStability:stableCapture,designComparison:passing,mode:'PREVIEW_DIAGNOSTIC'}),'PASS');
const missing=evaluateDesignConvergence({width:{design:100,runtime:null,delta:null},columns:{design:2,runtime:2,delta:0}},policy,['width','columns']);
assert.equal(missing.status,'INVALID_EVIDENCE');
assert.throws(()=>projectScenarioStatus({captureStability:stableCapture,designComparison:missing,mode:'PREVIEW_DIAGNOSTIC'}),/required design comparison evidence is invalid/);
console.log('DESIGN_CONVERGENCE_FALSIFICATION_PASS stable_capture_can_warn=true within_policy_pass=true missing_required_rejected=true approved_fail_closed=true');
