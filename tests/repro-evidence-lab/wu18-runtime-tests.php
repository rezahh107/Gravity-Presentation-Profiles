<?php
require __DIR__ . '/wu18-runtime-tests-core.php';

$host_inventory_path = trailingslashit( $artifact_dir ) . 'wu18-host-seam-inventory.json';
if ( ! is_file( $host_inventory_path ) ) {
    require __DIR__ . '/inspect-wu18-host-seams.php';
}
wu18_assert( is_file( $host_inventory_path ), 'WU18 exact-host seam inventory could not be produced for reusable runtime qualification.' );

require __DIR__ . '/wu18-prepare-inbox-provider-fixture.php';
require __DIR__ . '/wu18-persiangravity-runtime.php';
require __DIR__ . '/wu18-formatter-contract.php';
require __DIR__ . '/wu18-timeline-semantic-runtime.php';

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
    'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION',
);
$previous_position = -1;
foreach ( $expected_order as $stage ) {
    $position = array_search( $stage, $success_stages, true );
    wu18_assert(
        false !== $position && $position > $previous_position,
        'Successful Entry Detail runtime stages were not emitted in production decision order: ' . $stage
    );
    $previous_position = $position;
}

$suppression_pass = wu18_trace_reason( $success_trace, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'server_admitted_read_only_gpp_review' );
wu18_assert( null !== $suppression_pass && 'PASS' === $suppression_pass['result'], 'Successful Review did not record server-side suppression admission.' );
wu18_assert(
    'marker_emitted_css_suppression_expected_not_browser_proven' === $suppression_pass['fallback'],
    'Server diagnostic incorrectly claimed browser/CSS execution proof.'
);

$semantic_degradation = $results['decision_controls']['semantic_degradation'];
wu18_assert( null !== wu18_trace_event( $semantic_degradation, 'ENTRY_DETAIL_BINDING_READINESS', 'PASS' ), 'A data-semantic degradation was incorrectly classified as structural failure.' );
wu18_assert( null !== wu18_trace_reason( $semantic_degradation, 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS', 'semantic.student.national_id.unmapped' ), 'Semantic degradation trace did not identify UNMAPPED student.national_id.' );
wu18_assert( null !== wu18_trace_reason( $semantic_degradation, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'server_admitted_read_only_gpp_review' ), 'Semantic degradation incorrectly disabled duplicate-table suppression.' );
wu18_assert( null !== wu18_trace_event( $semantic_degradation, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ), 'Semantic degradation incorrectly removed the dossier.' );

$non_assignee = $results['decision_controls']['authorized_non_assignee'];
$non_assignee_gate = wu18_trace_event( $non_assignee, 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', 'SKIP' );
wu18_assert( null !== $non_assignee_gate && 'current_assignee_not_eligible' === $non_assignee_gate['reason_code'], 'Authorized non-assignee trace did not record live action ineligibility.' );
wu18_assert( null !== wu18_trace_event( $non_assignee, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'PASS' ), 'Authorized non-assignee did not retain read-only dossier presentation.' );
wu18_assert( null !== wu18_trace_reason( $non_assignee, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'server_admitted_read_only_gpp_review' ), 'Authorized non-assignee did not retain server suppression eligibility.' );

$editor = $results['decision_controls']['native_editor_required'];
wu18_assert( null !== wu18_trace_reason( $editor, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'native_editor_required' ), 'Approval editor fallback reason missing.' );
wu18_assert( null !== wu18_trace_reason( $editor, 'ENTRY_DETAIL_PRESENTATION_OUTPUT', 'native_editor_required' ), 'Approval editor presentation SKIP reason missing.' );

$structural = $results['decision_controls']['structural_fallback'];
wu18_assert( null !== wu18_trace_event( $structural, 'ENTRY_DETAIL_BINDING_READINESS', 'FAIL' ), 'Structural fallback did not fail structural readiness.' );
wu18_assert( null !== wu18_trace_reason( $structural, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'structural_readiness_not_satisfied' ), 'Structural fallback suppression reason missing.' );

$inactive = $results['decision_controls']['profile_inactive'];
wu18_assert( null !== wu18_trace_reason( $inactive, 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', 'profile_inactive' ), 'Inactive-profile suppression reason missing.' );

$results['runtime_decision_trace'] = array(
    'schema_version' => $success_trace['schema_version'],
    'status' => $success_trace['status'],
    'ordered_success_stages' => $success_stages,
    'semantic_degradation_distinct_from_structural_failure' => true,
    'request_action_ineligibility_distinct_from_view_authorization' => true,
    'server_marker_distinct_from_browser_css_proof' => true,
    'native_editor_forces_native_fallback' => true,
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_RUNTIME_DECISION_TRACE_PASS\n";
