const infra = message => { throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${message}`); };
const finite = value => Number.isFinite(value);

export function assertDesignComparisonPolicy(policy) {
  if (!policy || typeof policy.schema_version !== 'string' || !policy.schema_version || !policy.relations || typeof policy.relations !== 'object') {
    infra('design comparison policy is missing or malformed.');
  }
  for (const [name, rule] of Object.entries(policy.relations)) {
    if (!rule || !['numeric_delta', 'discrete_exact'].includes(rule.kind)) infra(`unsupported design relation policy for ${name}.`);
    if (rule.kind === 'numeric_delta' && (!finite(rule.tolerance) || rule.tolerance < 0)) infra(`invalid numeric tolerance for ${name}.`);
    if (rule.minimum_observations_each !== undefined && (!Number.isInteger(rule.minimum_observations_each) || rule.minimum_observations_each < 1)) {
      infra(`invalid minimum observation count for ${name}.`);
    }
  }
  if (!policy.action_requirements || typeof policy.action_requirements !== 'object') infra('stateful action visual-coverage policy is missing.');
  for (const [action, relations] of Object.entries(policy.action_requirements)) {
    if (!Array.isArray(relations) || !relations.length || new Set(relations).size !== relations.length) infra(`action-specific visual relation requirements are malformed for ${action}.`);
    for (const relation of relations) if (!policy.relations[relation]) infra(`action-specific visual relation ${relation} for ${action} has no declared policy.`);
  }
  return policy;
}

export function assertActionVisualCoverage(policy, scenario) {
  assertDesignComparisonPolicy(policy);
  if (!scenario?.action) return [];
  const required=policy.action_requirements[scenario.action];
  if (!Array.isArray(required) || !required.length) infra(`stateful scenario ${scenario.id} has no action-specific visual relation contract.`);
  if (!Array.isArray(scenario.design_relations)) infra(`scenario ${scenario.id} design relations are missing.`);
  for (const relation of required) {
    if (!scenario.design_relations.includes(relation)) infra(`scenario ${scenario.id} is missing required action-specific visual relation ${relation}.`);
  }
  return required;
}

function observationDisposition(rule, evidence) {
  if (rule.minimum_observations_each === undefined) return null;
  const designCount=evidence?.observations?.design;
  const runtimeCount=evidence?.observations?.runtime;
  if (!Number.isInteger(designCount) || designCount < 0 || !Number.isInteger(runtimeCount) || runtimeCount < 0) return 'INVALID_EVIDENCE';
  if (designCount < rule.minimum_observations_each || runtimeCount < rule.minimum_observations_each) return 'NOT_COMPARABLE';
  return null;
}

export function evaluateDesignConvergence(deltas, policy, requiredRelations, context = {}) {
  assertDesignComparisonPolicy(policy);
  if (!Array.isArray(requiredRelations) || !requiredRelations.length || new Set(requiredRelations).size !== requiredRelations.length) {
    infra('scenario design relation requirements are missing or malformed.');
  }
  const relations = {};
  let warningCount = 0;
  let invalidCount = 0;
  let notComparableCount = 0;
  let nativeHostLimitationCount = 0;
  for (const name of requiredRelations) {
    const rule = policy.relations[name];
    if (!rule) infra(`required design relation ${name} has no declared policy.`);
    const evidence = deltas?.[name];
    const disposition = context?.relation_dispositions?.[name] ?? null;
    let classification = 'INVALID_EVIDENCE';
    let reason = null;
    let evidenceRef = null;

    if (disposition) {
      if (disposition.classification !== 'NATIVE_HOST_LIMITATION') infra(`unsupported contextual disposition for ${name}.`);
      if (evidence?.runtime !== 'ABSENT') infra(`native-host limitation for ${name} requires the qualified runtime node to remain absent.`);
      classification = 'NATIVE_HOST_LIMITATION';
      reason = disposition.reason || null;
      evidenceRef = disposition.evidence_ref || null;
    } else {
      const observationState = observationDisposition(rule, evidence);
      if (observationState) {
        classification = observationState;
        if (classification === 'NOT_COMPARABLE') {
          reason = `At least ${rule.minimum_observations_each} design and runtime observations are required to establish this capacity relation.`;
        }
      } else if (rule.kind === 'numeric_delta') {
        if (finite(evidence?.design) && finite(evidence?.runtime) && finite(evidence?.delta)) {
          classification = Math.abs(evidence.delta) <= rule.tolerance ? 'PASS' : 'WARNING';
        }
      } else if (rule.kind === 'discrete_exact') {
        if (evidence && evidence.design !== null && evidence.design !== undefined && evidence.runtime !== null && evidence.runtime !== undefined) {
          classification = Object.is(evidence.design, evidence.runtime) ? 'PASS' : 'WARNING';
        }
      }
    }

    if (classification === 'WARNING') warningCount += 1;
    if (classification === 'INVALID_EVIDENCE') invalidCount += 1;
    if (classification === 'NOT_COMPARABLE') notComparableCount += 1;
    if (classification === 'NATIVE_HOST_LIMITATION') nativeHostLimitationCount += 1;
    relations[name] = {
      ...evidence,
      kind: rule.kind,
      tolerance: rule.kind === 'numeric_delta' ? rule.tolerance : null,
      minimum_observations_each: rule.minimum_observations_each ?? null,
      classification,
      reason,
      evidence_ref: evidenceRef,
    };
  }
  return {
    policy_version: policy.schema_version,
    status: invalidCount ? 'INVALID_EVIDENCE' : warningCount ? 'WARNING' : (notComparableCount || nativeHostLimitationCount) ? 'QUALIFIED_EVIDENCE_LIMITATION' : 'PASS',
    warning_count: warningCount,
    invalid_count: invalidCount,
    not_comparable_count: notComparableCount,
    native_host_limitation_count: nativeHostLimitationCount,
    relations,
  };
}

export function assertDesignComparisonEvidence(comparison, policy, requiredRelations, context = {}) {
  const evaluated = evaluateDesignConvergence(comparison?.deltas, policy, requiredRelations, context);
  if (comparison?.policy_version !== evaluated.policy_version || JSON.stringify(comparison?.evaluation) !== JSON.stringify(evaluated)) {
    infra('serialized design comparison evidence does not match the versioned policy and evidence context.');
  }
  return evaluated;
}

export function projectScenarioStatus({ captureStability, designComparison, mode }) {
  if (designComparison?.status === 'INVALID_EVIDENCE') infra('required design comparison evidence is invalid.');
  if (!['PREVIEW_DIAGNOSTIC', 'APPROVED_VISUAL_CONTRACT'].includes(mode)) infra('unsupported visual contract mode.');
  const divergent = captureStability !== 'PASS' || designComparison?.status === 'WARNING';
  if (divergent) return mode === 'APPROVED_VISUAL_CONTRACT' ? 'VISUAL_CONTRACT_FAIL' : 'VISUAL_REGRESSION_WARNING';
  if (designComparison?.status === 'QUALIFIED_EVIDENCE_LIMITATION') return 'EVIDENCE_LIMITATION';
  return 'PASS';
}
