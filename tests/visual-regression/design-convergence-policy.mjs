const infra = message => { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${message}`); };
const finite = value => Number.isFinite(value);

export function assertDesignComparisonPolicy(policy) {
  if (!policy || typeof policy.schema_version !== 'string' || !policy.schema_version || !policy.relations || typeof policy.relations !== 'object') {
    infra('design comparison policy is missing or malformed.');
  }
  for (const [name, rule] of Object.entries(policy.relations)) {
    if (!rule || !['numeric_delta', 'discrete_exact'].includes(rule.kind)) infra(`unsupported design relation policy for ${name}.`);
    if (rule.kind === 'numeric_delta' && (!finite(rule.tolerance) || rule.tolerance < 0)) infra(`invalid numeric tolerance for ${name}.`);
  }
  return policy;
}

export function evaluateDesignConvergence(deltas, policy, requiredRelations) {
  assertDesignComparisonPolicy(policy);
  if (!Array.isArray(requiredRelations) || !requiredRelations.length || new Set(requiredRelations).size !== requiredRelations.length) {
    infra('scenario design relation requirements are missing or malformed.');
  }
  const relations = {};
  let warningCount = 0;
  let invalidCount = 0;
  for (const name of requiredRelations) {
    const rule = policy.relations[name];
    if (!rule) infra(`required design relation ${name} has no declared policy.`);
    const evidence = deltas?.[name];
    let classification = 'INVALID_EVIDENCE';
    if (rule.kind === 'numeric_delta') {
      if (finite(evidence?.design) && finite(evidence?.runtime) && finite(evidence?.delta)) {
        classification = Math.abs(evidence.delta) <= rule.tolerance ? 'PASS' : 'WARNING';
      }
    } else if (rule.kind === 'discrete_exact') {
      if (evidence && evidence.design !== null && evidence.design !== undefined && evidence.runtime !== null && evidence.runtime !== undefined) {
        classification = Object.is(evidence.design, evidence.runtime) ? 'PASS' : 'WARNING';
      }
    }
    if (classification === 'WARNING') warningCount += 1;
    if (classification === 'INVALID_EVIDENCE') invalidCount += 1;
    relations[name] = { ...evidence, kind: rule.kind, tolerance: rule.kind === 'numeric_delta' ? rule.tolerance : null, classification };
  }
  return {
    policy_version: policy.schema_version,
    status: invalidCount ? 'INVALID_EVIDENCE' : warningCount ? 'WARNING' : 'PASS',
    warning_count: warningCount,
    invalid_count: invalidCount,
    relations,
  };
}

export function assertDesignComparisonEvidence(comparison, policy, requiredRelations) {
  const evaluated = evaluateDesignConvergence(comparison?.deltas, policy, requiredRelations);
  if (comparison?.policy_version !== evaluated.policy_version || JSON.stringify(comparison?.evaluation) !== JSON.stringify(evaluated)) {
    infra('serialized design comparison evidence does not match the versioned policy.');
  }
  return evaluated;
}

export function projectScenarioStatus({ captureStability, designComparison, mode }) {
  if (designComparison?.status === 'INVALID_EVIDENCE') infra('required design comparison evidence is invalid.');
  if (!['PREVIEW_DIAGNOSTIC', 'APPROVED_VISUAL_CONTRACT'].includes(mode)) infra('unsupported visual contract mode.');
  const divergent = captureStability !== 'PASS' || designComparison?.status === 'WARNING';
  if (!divergent) return 'PASS';
  return mode === 'APPROVED_VISUAL_CONTRACT' ? 'VISUAL_CONTRACT_FAIL' : 'VISUAL_REGRESSION_WARNING';
}
