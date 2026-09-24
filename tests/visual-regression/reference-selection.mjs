export const SAME_RUN_REFERENCE_IDENTITY = 'SAME_RUN_CAPTURE_STABILITY_CONTROL';

export function selectComparisonReference(contract, scenario) {
  const configured = scenario.reference;
  if (configured?.path) {
    if (!configured.classification) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} reference classification is missing.`);
    if (contract.mode === 'APPROVED_VISUAL_CONTRACT' && configured.classification !== 'OWNER_APPROVED_GOLDEN') {
      throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} is not backed by an Owner-approved Golden.`);
    }
    return Object.freeze({ kind: 'VERSIONED_REFERENCE_FILE', path: configured.path, identity: configured.classification });
  }
  if (contract.mode === 'APPROVED_VISUAL_CONTRACT') {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} has no approved Golden.`);
  }
  return Object.freeze({ kind: 'SAME_RUN_CAPTURE', path: null, identity: SAME_RUN_REFERENCE_IDENTITY });
}

export function assertSerializedReferenceIdentity({ metrics, environment, scenario, mode }) {
  const metricsIdentity = metrics?.reference_identity;
  const environmentIdentity = environment?.base_reference_identity;
  const scenarioIdentity = scenario?.reference_identity;
  if (!metricsIdentity || metricsIdentity !== environmentIdentity || metricsIdentity !== scenarioIdentity) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: serialized reference identity mismatch for ${scenario?.id || 'unknown scenario'}.`);
  }
  if (mode === 'APPROVED_VISUAL_CONTRACT' && metricsIdentity === SAME_RUN_REFERENCE_IDENTITY) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: approved mode cannot serialize the same-run reference identity for ${scenario?.id || 'unknown scenario'}.`);
  }
  return metricsIdentity;
}
