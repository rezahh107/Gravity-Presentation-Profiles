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

$semantic_degradation = $results['decision_controls']['semantic_degradation'];
wu18_assert(
    null !== wu18_trace_event( $semantic_degradation, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ),
    'A data-semantic degradation was incorrectly classified as structural failure.'
);
wu18_assert(
    null !== wu18_trace_reason( $semantic_degradation, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.student.national_id.unmapped' ),
    'Semantic degradation trace did not identify the unresolved student.national_id slot.'
);
wu18_assert(
    null !== wu18_trace_event( $semantic_degradation, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY' ),
    'Structurally admitted semantic degradation did not continue to live Approval eligibility.'
);
wu18_assert(
    null !== wu18_trace_event( $semantic_degradation, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ),
    'Structurally admitted semantic degradation did not emit the GPP dossier.'
);

$non_assignee = $results['decision_controls']['authorized_non_assignee'];
$non_assignee_gate = wu18_trace_event( $non_assignee, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'SKIP' );
wu18_assert(
    null !== $non_assignee_gate && 'current_assignee_not_eligible' === $non_assignee_gate['reason_code'],
    'Authorized non-assignee trace did not record live request ineligibility.'
);
wu18_assert(
    null !== wu18_trace_event( $non_assignee, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ),
    'Authorized non-assignee did not retain the read-only enhanced presentation.'
);

$print_unavailable = $results['decision_controls']['print_unavailable'];
wu18_assert(
    null !== wu18_trace_event( $print_unavailable, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ),
    'Unavailable Print utility was incorrectly classified as structural failure.'
);
wu18_assert(
    null !== wu18_trace_reason( $print_unavailable, 'ENTRY_DETAIL_OPTIONAL_REGIONS', 'region.print.utility.unavailable' ),
    'Unavailable Print utility was not exposed as an optional-region degradation.'
);
wu18_assert(
    null !== wu18_trace_event( $print_unavailable, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ),
    'Unavailable Print utility incorrectly prevented Entry Detail presentation output.'
);

$results['runtime_decision_trace'] = array(
    'schema_version' => $success_trace['schema_version'],
    'status' => $success_trace['status'],
    'ordered_success_stages' => $success_stages,
    'semantic_degradation_distinct_from_structural_failure' => true,
    'request_ineligibility_distinct_from_view_authorization' => true,
    'optional_print_degradation_observed' => true,
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
echo "WU18_RUNTIME_DECISION_TRACE_PASS\n";
