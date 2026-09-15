<?php
require __DIR__ . '/wu18-runtime-tests-core.php';

$decision_trace = \GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );
wu18_assert( is_array( $decision_trace ), 'Shared Entry Detail runtime decision trace was not emitted by production branches.' );
$decision_stages = array_column( $decision_trace['events'], 'stage' );
$expected_order = array(
    'ENTRY_DETAIL_HOST_SEAM',
    'ENTRY_DETAIL_PROFILE_RESOLUTION',
    'ENTRY_DETAIL_BINDING_READINESS',
    'ENTRY_DETAIL_PRESENTATION_OUTPUT',
);
$previous_position = -1;
foreach ( $expected_order as $stage ) {
    $position = array_search( $stage, $decision_stages, true );
    wu18_assert( false !== $position && $position > $previous_position, 'Entry Detail shared runtime stages were not emitted in actual production decision order: ' . $stage );
    $previous_position = $position;
}
$has_native_fallback = false;
foreach ( $decision_trace['events'] as $event ) {
    if ( 'ENTRY_DETAIL_BINDING_READINESS' === $event['stage']
        && 'FAIL' === $event['result']
        && 'native_gravity_flow_entry_detail' === $event['fallback'] ) {
        $has_native_fallback = true;
        break;
    }
}
wu18_assert( $has_native_fallback, 'Negative Entry Detail fixture did not emit the observed fail-closed native fallback decision.' );

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = json_decode( file_get_contents( $results_path ), true );
wu18_assert( is_array( $results ), 'WU18 result artifact became unreadable before diagnostics mapping.' );
$results['runtime_decision_trace'] = array(
    'schema_version' => $decision_trace['schema_version'],
    'status' => $decision_trace['status'],
    'ordered_stages' => $decision_stages,
    'native_fallback_observed' => true,
);
file_put_contents( $results_path, wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18_RUNTIME_DECISION_TRACE_PASS\n";
