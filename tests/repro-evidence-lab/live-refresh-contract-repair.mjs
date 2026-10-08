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


function isTargetBoundObservation(race) {
  const surface = race?.target_surface;
  const binding = race?.value_binding;
  const expectedColumn = String(binding?.field_id ?? '');
  return race?.status === 'OBSERVED'
    && race.surface_role === 'AUTHENTIC_FRONTEND_SCOPED_SRWF_INBOX'
    && race.semantic_surface === 'student.national_id'
    && Number(race.route_page_id) > 0
    && typeof race.route === 'string' && race.route.length > 0
    && surface?.kind === 'AUTHENTIC_FRONTEND_SCOPED_SRWF_INBOX'
    && surface.is_five_column_projection === true
    && surface.native_grid_count === 1
    && surface.gpp_surface_count === 1
    && surface.headers?.length === 5
    && surface.headers.some(header => header.col_id === expectedColumn && header.label === 'کد ملی')
    && surface.column_defs?.some(column => column.field === expectedColumn)
    && binding?.semantic_slot === 'student.national_id'
    && binding.verified === true
    && Number(binding.form_id) > 0
    && Number(binding.form_id) === Number(surface.form_id)
    && expectedColumn !== ''
    && expectedColumn === String(race.production_column_id)
    && expectedColumn === String(binding.native_grid_field)
    && binding.source_before === race.old_cell_text?.trim()
    && binding.source_after === race.fresh_cell_text?.trim()
    && race.stale_cell_text_after_older_response?.trim() === binding.source_before
    && race.held_response_update_contains_entry === true
    && race.old_value_rendered === true
    && race.transient_reversion === true
    && race.recovered_next_poll === true;
}

function runScopeFalsification() {
  const admitted = {
    status: 'OBSERVED',
    surface_role: 'AUTHENTIC_FRONTEND_SCOPED_SRWF_INBOX',
    semantic_surface: 'student.national_id',
    route_page_id: 42,
    route: 'http://127.0.0.1/synthetic-scoped-inbox/',
    target_surface: {
      kind: 'AUTHENTIC_FRONTEND_SCOPED_SRWF_INBOX', form_id: 1, is_five_column_projection: true,
      native_grid_count: 1, gpp_surface_count: 1,
      headers: [{ col_id: 'id' }, { col_id: '1' }, { col_id: '3', label: 'کد ملی' }, { col_id: '6' }, { col_id: 'date_created' }],
      column_defs: [{ field: '3' }],
    },
    value_binding: {
      semantic_slot: 'student.national_id', form_id: 1, field_id: '3',
      native_grid_field: '3', source_before: 'OLD', source_after: 'NEW', verified: true,
    },
    production_column_id: '3', old_cell_text: 'OLD', fresh_cell_text: 'NEW',
    stale_cell_text_after_older_response: 'OLD', held_response_update_contains_entry: true,
    old_value_rendered: true, transient_reversion: true, recovered_next_poll: true,
  };
  const cases = [
    ['ADMITTED_BOUND_TARGET', admitted, true],
    ['GENERIC_ADMIN_CREATED_BY_CANNOT_PROVE_TARGET',
      { ...admitted, surface_role: 'NATIVE_WP_ADMIN', semantic_surface: 'created_by', production_column_id: 'created_by' }, false],
    ['UNBOUND_TARGET_COLUMN_CANNOT_PROVE_TARGET',
      { ...admitted, value_binding: { ...admitted.value_binding, verified: false } }, false],
    ['WRONG_GRID_COLUMN_CANNOT_PROVE_TARGET',
      { ...admitted, target_surface: { ...admitted.target_surface, column_defs: [{ field: 'created_by' }] } }, false],
    ['WRONG_VISIBLE_HEADER_CANNOT_PROVE_TARGET',
      { ...admitted, target_surface: { ...admitted.target_surface, headers: admitted.target_surface.headers.map(h => h.col_id === '3' ? { col_id: '3', label: 'ارسال‌کننده' } : h) } }, false],
    ['NO_STALE_TARGET_RENDER_CANNOT_PROVE_TARGET',
      { ...admitted, stale_cell_text_after_older_response: 'NEW' }, false],
  ];
  const results = cases.map(([id, value, expected]) => ({
    id, expected, actual: isTargetBoundObservation(value),
    pass: isTargetBoundObservation(value) === expected,
  }));
  return { ok: results.every(item => item.pass), results };
}

function sameMountRecoveryProven(membership) {
  const recovery = membership?.same_mount_recovery;
  const mounted = (snapshot) => snapshot?.document_identity_preserved === true
    && snapshot.grid_identity_preserved === true
    && snapshot.original_grid_connected === true
    && snapshot.native_grid_count === 1
    && snapshot.url_unchanged === true;
  return membership?.delayed_stale_add_visible === true
    && recovery?.status === 'OBSERVED'
    && recovery?.removed_by_first_native_poll_on_same_grid === true
    && recovery.identity_continuity === true
    && recovery.response?.status === 200
    && recovery.response.remove_contains_entry === true
    && recovery.response.shape?.remove.includes(String(membership.entry_id)) === true
    && mounted(recovery.grid_at_stale_add)
    && recovery.grid_at_stale_add.row_present === true
    && mounted(recovery.grid_after_recovery_poll)
    && recovery.grid_after_recovery_poll.row_present === false
    && mounted(recovery.grid_after_separate_navigation)
    && Array.isArray(recovery.main_frame_navigation_events)
    && recovery.main_frame_navigation_events.length === 0
    && membership.recovered_next_poll === true;
}

function falsifySameMountRecovery() {
  const mount = { document_identity_preserved: true, grid_identity_preserved: true,
    original_grid_connected: true, native_grid_count: 1, url_unchanged: true };
  const membership = {
    entry_id: 61, delayed_stale_add_visible: true, recovered_next_poll: true,
    same_mount_recovery: {
      status: 'OBSERVED', identity_continuity: true,
      removed_by_first_native_poll_on_same_grid: true,
      response: { status: 200, remove_contains_entry: true,
        shape: { add: [], update: [], remove: ['61'] } },
      grid_at_stale_add: { ...mount, row_present: true },
      grid_after_recovery_poll: { ...mount, row_present: false },
      grid_after_separate_navigation: { ...mount, row_present: false },
      main_frame_navigation_events: [],
    },
  };
  const cases = [
    ['SAME_MOUNT_NATIVE_REMOVE', membership, true],
    ['RELOAD_WITH_ABSENT_ROW_CANNOT_PROVE_RECOVERY',
      { ...membership, same_mount_recovery: { ...membership.same_mount_recovery,
        grid_after_recovery_poll: { ...mount, row_present: false, document_identity_preserved: false } } }, false],
    ['REMOUNTED_GRID_CANNOT_PROVE_RECOVERY',
      { ...membership, same_mount_recovery: { ...membership.same_mount_recovery,
        grid_after_recovery_poll: { ...mount, row_present: false, grid_identity_preserved: false } } }, false],
    ['NO_EXPLICIT_NATIVE_REMOVE_CANNOT_PROVE_RECOVERY',
      { ...membership, same_mount_recovery: { ...membership.same_mount_recovery,
        response: { status: 200, remove_contains_entry: false,
          shape: { add: [], remove: [], update: [] } } } }, false],
    ['NAVIGATION_IN_ORIGINAL_INBOX_CANNOT_PROVE_RECOVERY',
      { ...membership, same_mount_recovery: { ...membership.same_mount_recovery,
        main_frame_navigation_events: ['http://127.0.0.1/wp-admin/'] } }, false],
    ['ROW_NEVER_OBSERVED_STALE_CANNOT_PROVE_RECOVERY',
      { ...membership, same_mount_recovery: { ...membership.same_mount_recovery,
        grid_at_stale_add: { ...mount, row_present: false } } }, false],
  ];
  const results = cases.map(([id, input, expected]) => {
    const actual = sameMountRecoveryProven(input);
    return { id, expected, actual, pass: actual === expected };
  });
  return { ok: results.every(result => result.pass), results };
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
  const sameMountProven = sameMountRecoveryProven(membership);
  if ((membership.recovered_next_poll === true || membership.same_mount_recovery?.status === 'OBSERVED')
      && !sameMountProven) {
    throw new Error('Assignment recovery claims native same-mount success without explicit remove and Grid identity continuity.');
  }
  const sameMountFalsification = falsifySameMountRecovery();
  if (!sameMountFalsification.ok) throw new Error('Same-mount recovery falsification failed.');
  const targetProven = isTargetBoundObservation(productionVisible);
  if (productionVisible.status === 'OBSERVED' && !targetProven) {
    throw new Error('Broad target-SRWF claim contradicted by route, Grid and field evidence.');
  }
  const scopeFalsification = runScopeFalsification();
  if (!scopeFalsification.ok) {
    throw new Error('Live Refresh target-bound scope discriminator falsification failed.');
  }

  const unresolved = new Set(contract.missing_or_not_proven || []);
  if (!background || background.status === 'NOT_PROVEN') unresolved.add('LRQ-BACKGROUND');
  if (!targetProven) unresolved.add('LRQ-PRODUCTION-VISIBLE-VALUE-RACE');
  if (membership.status !== 'OBSERVED') unresolved.add('LRQ-OVERLAP-ASSIGNMENT');
  if (!sameMountProven) unresolved.add('LRQ-ASSIGNMENT-SAME-MOUNT-RECOVERY');
  if (membership.navigation_authorization?.assignment_specific_authorization !== 'OBSERVED_FRESH_HOST_AUTHORIZATION') {
    unresolved.add('LRQ-ASSIGNMENT-SPECIFIC-FRESH-AUTHORIZATION');
  }

  const nativeHostLimitations = [];
  if (overlap.transient_reversion === true) {
    nativeHostLimitations.push('OUT_OF_ORDER_STALE_REVERSION_REQUIRES_OWNER_TOLERANCE');
  }
  if (targetProven) {
    nativeHostLimitations.push('OUT_OF_ORDER_TARGET_BOUND_SRWF_NATIONAL_ID_STALE_REVERSION_REQUIRES_OWNER_TOLERANCE');
  }
  if (membership.status === 'OBSERVED' && membership.delayed_stale_add_visible === true
      && membership.row_visible_before_held_add === false) {
    nativeHostLimitations.push('OUT_OF_ORDER_DELAYED_STALE_ASSIGNMENT_ADD_REQUIRES_OWNER_TOLERANCE');
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

  contract.schema_version = '1.2.0';
  contract.target_surface_identity = {
    qualified: targetProven,
    semantic_column: 'student.national_id',
    route_page_id: productionVisible.route_page_id ?? null,
    form_id: productionVisible.target_surface?.form_id ?? null,
    column_id: productionVisible.production_column_id ?? null,
    column_binding: productionVisible.value_binding ?? null,
    five_column_projection: productionVisible.target_surface?.is_five_column_projection ?? false,
    synthetic_fixture_not_target_production: true,
    prior_admin_created_by_is_not_target_evidence: true,
  };
  contract.scope_falsification = scopeFalsification;
  contract.same_mount_recovery_falsification = sameMountFalsification;
  contract.request_lifecycle_model = {
    ...(contract.request_lifecycle_model || {}),
    out_of_order_observation: {
      ...(contract.request_lifecycle_model?.out_of_order_observation || {}),
      transient_reversion: overlap.transient_reversion ?? null,
      recovered_next_poll: overlap.recovered_next_poll ?? null,
      production_visible_value_transient_reversion: targetProven ? true : null,
      production_visible_value_recovered_next_poll: targetProven ? productionVisible.recovered_next_poll : null,
      assignment_membership_transient_reversion: membership.transient_membership_reversion ?? null,
      assignment_membership_delayed_stale_add: membership.delayed_stale_add_visible ?? null,
      assignment_membership_recovered_next_poll: sameMountProven ? true : null,
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
      status: targetProven ? 'OBSERVED' : 'NOT_PROVEN',
      observed_stale_reversion: targetProven ? true : null,
      recovered_next_poll: targetProven ? productionVisible.recovered_next_poll : null,
      owner_tolerance_authority: targetProven ? 'NOT_ESTABLISHED' : 'NOT_REQUIRED_FOR_OBSERVED_RESULT',
    },
    assignment_membership: {
      status: membership.status,
      observed_stale_reversion: membership.transient_membership_reversion ?? null,
      observed_delayed_stale_add: membership.delayed_stale_add_visible ?? null,
      was_previously_visible_and_removed: membership.row_visible_before_held_add === false ? false : null,
      recovered_next_poll: sameMountProven ? true : null,
      same_mount_recovery: sameMountProven ? 'OBSERVED' : 'NOT_PROVEN',
      owner_tolerance_authority: membership.delayed_stale_add_visible === true ? 'NOT_ESTABLISHED' : 'NOT_REQUIRED_FOR_OBSERVED_RESULT',
    },
  };
  contract.confirmed_findings = {
    native_host_limitations: reduction.native_host_limitations,
    gpp_incompatibilities: reduction.gpp_incompatibilities,
    observed_host_behavior: {
      original_overlap_order: overlap,
      production_visible_value_race: productionVisible,
      prior_native_admin_created_by_observation: materiality.historical_native_admin_created_by ?? null,
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
    scope_falsification: scopeFalsification,
    same_mount_recovery_falsification: sameMountFalsification,
    assignment_same_mount_recovery_proven: sameMountProven,
    target_column_qualified: targetProven,
  };
}
