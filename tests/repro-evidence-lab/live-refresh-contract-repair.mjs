import fs from 'node:fs';
import path from 'node:path';
import { reduceQualificationState, runReducerFalsification } from './live-refresh-qualification-reducer.mjs';

const EXPECTED_RUNTIME = {
  wordpress: '6.8.3',
  php: '8.2.34',
  gravity_forms: '3.1.1.1',
  gravity_flow: '3.1.0',
  gravity_flow_package_sha256: 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404',
  node: 'v22.19.0',
  playwright: '1.55.0',
  chromium: '140.0.7339.16',
  ag_grid: '25.2.0',
};

function assertPinnedRuntime(runtime) {
  for (const [key, expected] of Object.entries(EXPECTED_RUNTIME)) {
    if (runtime?.[key] !== expected) {
      throw new Error(`Live Refresh runtime drift: ${key} expected ${expected}, got ${runtime?.[key]}`);
    }
  }
}

function scenarioMap(scenarios) {
  return Object.fromEntries((scenarios || []).map((scenario) => [scenario.id, scenario]));
}

export function repairLiveRefreshContract({ artifactDir, materiality }) {
  const qualificationPath = path.join(artifactDir, 'live-refresh-qualification.json');
  const qualification = JSON.parse(fs.readFileSync(qualificationPath, 'utf8'));
  const contract = qualification.contract || {};
  assertPinnedRuntime(contract.exact_runtime);

  if (contract.evidence_ceiling !== 'REPRODUCIBLE_PINNED_RUNTIME_NOT_TARGET_PRODUCTION') {
    throw new Error('Live Refresh evidence ceiling drifted.');
  }

  const byId = scenarioMap(qualification.scenarios);
  const overlap = byId['LRQ-OVERLAP-ORDER']?.details
    || contract.change_application_integrity?.overlap_order
    || {};
  const background = byId['LRQ-BACKGROUND'] || null;
  const productionVisible = materiality.production_visible_value_race || { status: 'NOT_PROVEN' };
  const membership = materiality.assignment_membership_race || { status: 'NOT_PROVEN' };

  const unresolved = new Set(contract.missing_or_not_proven || []);
  if (!background || background.status === 'NOT_PROVEN') unresolved.add('LRQ-BACKGROUND');
  if (productionVisible.status !== 'OBSERVED') unresolved.add('LRQ-PRODUCTION-VISIBLE-VALUE-RACE');
  if (membership.status !== 'OBSERVED') unresolved.add('LRQ-OVERLAP-ASSIGNMENT');

  const nativeHostLimitations = [];
  if (overlap.transient_reversion === true) {
    nativeHostLimitations.push('OUT_OF_ORDER_STALE_REVERSION_REQUIRES_OWNER_TOLERANCE');
  }
  if (productionVisible.status === 'OBSERVED' && productionVisible.transient_reversion === true) {
    nativeHostLimitations.push('OUT_OF_ORDER_PRODUCTION_VISIBLE_SRWF_VALUE_STALE_REVERSION_REQUIRES_OWNER_TOLERANCE');
  }
  if (membership.status === 'OBSERVED' && membership.transient_membership_reversion === true) {
    nativeHostLimitations.push('OUT_OF_ORDER_ASSIGNMENT_MEMBERSHIP_STALE_REVERSION_REQUIRES_OWNER_TOLERANCE');
  }

  const gppIncompatibilities = contract.gpp_compatibility?.ok === false
    ? ['GPP_LIVE_REFRESH_COMPATIBILITY_FAILED']
    : [];

  const acceptanceSemanticsComplete = nativeHostLimitations.length === 0;
  const reduction = reduceQualificationState({
    unresolved: [...unresolved],
    nativeHostLimitations,
    gppIncompatibilities,
    acceptanceSemanticsComplete,
  });
  const falsification = runReducerFalsification();
  if (!falsification.ok) {
    throw new Error('Live Refresh mixed-state reducer falsification failed.');
  }

  const addedScenarios = [
    {
      id: 'LRQ-PRODUCTION-VISIBLE-VALUE-RACE',
      status: productionVisible.status,
      details: productionVisible,
    },
    {
      id: 'LRQ-OVERLAP-ASSIGNMENT',
      status: membership.status,
      details: membership,
    },
  ];
  const withoutAdded = (qualification.scenarios || []).filter(
    (scenario) => !addedScenarios.some((added) => added.id === scenario.id)
  );
  qualification.scenarios = [...withoutAdded, ...addedScenarios];

  contract.schema_version = '1.1.0';
  contract.request_lifecycle_model = {
    ...(contract.request_lifecycle_model || {}),
    out_of_order_observation: {
      ...(contract.request_lifecycle_model?.out_of_order_observation || {}),
      transient_reversion: overlap.transient_reversion ?? null,
      recovered_next_poll: overlap.recovered_next_poll ?? null,
      production_visible_value_transient_reversion: productionVisible.transient_reversion ?? null,
      production_visible_value_recovered_next_poll: productionVisible.recovered_next_poll ?? null,
      assignment_membership_transient_reversion: membership.transient_membership_reversion ?? null,
      assignment_membership_recovered_next_poll: membership.recovered_next_poll ?? null,
    },
  };
  contract.change_application_integrity = {
    ...(contract.change_application_integrity || {}),
    production_visible_value_race: productionVisible,
    overlap_assignment_membership: membership,
  };
  contract.acceptance_semantics = {
    temporary_stale_reversion: {
      observed: overlap.transient_reversion === true,
      recovered_next_poll: overlap.recovered_next_poll ?? null,
      owner_tolerance_authority: overlap.transient_reversion === true ? 'NOT_ESTABLISHED' : 'NOT_REQUIRED_FOR_OBSERVED_RESULT',
      judgment: overlap.transient_reversion === true ? 'OWNER_DECISION_REQUIRED' : 'NO_STALE_REVERSION_OBSERVED',
    },
    production_visible_srwf_value: {
      status: productionVisible.status,
      observed_stale_reversion: productionVisible.transient_reversion ?? null,
      recovered_next_poll: productionVisible.recovered_next_poll ?? null,
      owner_tolerance_authority: productionVisible.transient_reversion === true ? 'NOT_ESTABLISHED' : 'NOT_REQUIRED_FOR_OBSERVED_RESULT',
    },
    assignment_membership: {
      status: membership.status,
      observed_stale_reversion: membership.transient_membership_reversion ?? null,
      recovered_next_poll: membership.recovered_next_poll ?? null,
      owner_tolerance_authority: membership.transient_membership_reversion === true ? 'NOT_ESTABLISHED' : 'NOT_REQUIRED_FOR_OBSERVED_RESULT',
    },
  };
  contract.confirmed_findings = {
    native_host_limitations: reduction.native_host_limitations,
    gpp_incompatibilities: reduction.gpp_incompatibilities,
    observed_host_behavior: {
      original_overlap_order: overlap,
      production_visible_value_race: productionVisible,
      assignment_membership_race: membership,
    },
  };
  contract.unresolved = {
    missing_or_not_proven: reduction.unresolved,
    environment_limits: contract.not_proven || [
      'target-production equivalence',
      'other Gravity Flow/AG Grid versions',
      'server parallel execution under production PHP/web-server topology',
    ],
  };
  contract.reducer_falsification = falsification;
  contract.missing_or_not_proven = reduction.unresolved;
  contract.next_action_disposition = reduction.final_disposition;
  contract.final_disposition = reduction.final_disposition;
  contract.evidence_ceiling = 'REPRODUCIBLE_PINNED_RUNTIME_NOT_TARGET_PRODUCTION';

  qualification.contract = contract;
  fs.writeFileSync(qualificationPath, JSON.stringify(qualification, null, 2) + '\n');

  return {
    final_disposition: reduction.final_disposition,
    native_host_limitations: reduction.native_host_limitations,
    gpp_incompatibilities: reduction.gpp_incompatibilities,
    unresolved: reduction.unresolved,
    reducer_falsification: falsification,
  };
}
