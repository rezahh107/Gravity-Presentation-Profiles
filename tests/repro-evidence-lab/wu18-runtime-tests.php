<?php
require __DIR__ . '/wu18-runtime-tests-core.php';

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = json_decode( file_get_contents( $results_path ), true );
wu18_assert( is_array( $results ) && ! empty( $results['decision_controls'] ), 'WU18 decision-control evidence artifact is unavailable.' );

$success_trace = $results['decision_controls']['success'];
wu18_assert( is_array( $success_trace ), 'Successful Entry Detail decision trace was not captured.' );
$success_stages = array_column( $success_trace['events'], 'stage' );
$expected_order = array(
    'ENTRY_DETAIL_HOST_SEAM',
    'ENTRY_DETAIL_PROFILE_RESOLUTION',
    'ENTRY_DETAIL_BINDING_READINESS',
    'ENTRY_DETAIL_APPROVAL_ELIGIBILITY',
    'ENTRY_DETAIL_PRESENTATION_OUTPUT',
);
$previous_position = -1;
foreach ( $expected_order as $stage ) {
    $position = array_search( $stage, $success_stages, true );
    wu18_assert(
        false !== $position && $position > $previous_position,
        'Successful Entry Detail shared runtime stages were not emitted in production decision order: ' . $stage
    );
    $previous_position = $position;
}

$structural = $results['decision_controls']['structural_failure'];
$structural_failure = wu18_trace_event( $structural, 'ENTRY_DETAIL_BINDING_READINESS', 'FAIL' );
wu18_assert(
    null !== $structural_failure && 0 === strpos( $structural_failure['reason_code'], 'semantic.student.national_id.' ),
    'Structural trace did not identify the first failed semantic key.'
);
wu18_assert(
    null === wu18_trace_event( $structural, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY' ),
    'Structural failure incorrectly proceeded to live Approval eligibility.'
);

$non_assignee = $results['decision_controls']['authorized_non_assignee'];
$non_assignee_gate = wu18_trace_event( $non_assignee, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'SKIP' );
wu18_assert(
    null !== $non_assignee_gate && 'current_assignee_not_eligible' === $non_assignee_gate['reason_code'],
    'Authorized non-assignee trace did not record live request ineligibility.'
);

$non_approval = $results['decision_controls']['non_approval'];
$non_approval_gate = wu18_trace_event( $non_approval, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'SKIP' );
wu18_assert(
    null !== $non_approval_gate && 'current_step_not_approval' === $non_approval_gate['reason_code'],
    'Non-Approval trace did not record distinct live request ineligibility.'
);

$print_unavailable = $results['decision_controls']['print_unavailable'];
$print_failure = wu18_trace_event( $print_unavailable, 'ENTRY_DETAIL_BINDING_READINESS', 'FAIL' );
wu18_assert(
    null !== $print_failure && 0 === strpos( $print_failure['reason_code'], 'semantic.print.utility.' ),
    'Required Print capability failure was not visible in shared Entry Detail diagnostics.'
);

$results['runtime_decision_trace'] = array(
    'schema_version' => $success_trace['schema_version'],
    'status' => $success_trace['status'],
    'ordered_success_stages' => $success_stages,
    'first_failed_semantic_observed' => true,
    'request_ineligibility_distinct_from_binding_failure' => true,
    'native_fallback_observed' => true,
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
echo "WU18_RUNTIME_DECISION_TRACE_PASS\n";
