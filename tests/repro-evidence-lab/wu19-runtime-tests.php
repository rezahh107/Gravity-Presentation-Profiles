<?php
require __DIR__ . '/wu19-runtime-tests-core.php';

$negative_trace = \GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics::snapshot( 'print.dossier' );
wu19_assert( is_array( $negative_trace ), 'Shared Print runtime decision trace was not emitted.' );
$missing_asset_observed = false;
foreach ( $negative_trace['events'] as $event ) {
    if ( 'PRINT_COMPOSITION_READY' === $event['stage']
        && 'FAIL' === $event['result']
        && 'required_asset_unavailable' === $event['reason_code']
        && 'dossier_not_rendered' === $event['fallback'] ) {
        $missing_asset_observed = true;
        break;
    }
}
wu19_assert( $missing_asset_observed, 'Required-asset fail-closed branch was not mapped into the shared Print decision model.' );

// Re-run the real production Print branch after the negative control restores
// the asset. This proves the shared trace follows actual branch execution and
// reaches ready composition without reconstructing a separate diagnosis.
$shared_ready_html = wu19_render_print( array( $alpha['entry_id'] ) );
wu19_assert( false !== strpos( $shared_ready_html, 'data-gpp-print-state="ready"' ), 'Positive shared-trace control did not execute the real ready Print branch.' );
$ready_trace = \GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics::snapshot( 'print.dossier' );
$ready_stages = array_column( $ready_trace['events'], 'stage' );
$expected_order = array(
    'PRINT_DOSSIER_REQUEST',
    'HOST_PRINT_CONTEXT_ADMITTED',
    'PRINT_PROFILE_RESOLVED',
    'PRINT_BINDINGS_EVALUATED',
    'PRINT_COMPOSITION_READY',
);
$previous_position = -1;
foreach ( $expected_order as $stage ) {
    $position = array_search( $stage, $ready_stages, true );
    wu19_assert( false !== $position && $position > $previous_position, 'Print shared runtime stages were not emitted in production decision order: ' . $stage );
    $previous_position = $position;
}
$ready_observed = false;
$blank_unproven_observed = false;
foreach ( $ready_trace['events'] as $event ) {
    if ( 'PRINT_COMPOSITION_READY' === $event['stage'] && 'PASS' === $event['result'] ) {
        $ready_observed = true;
    }
    if ( 'PRINT_BINDINGS_EVALUATED' === $event['stage']
        && 'SKIP' === $event['result']
        && 'blank_unproven_value' === $event['fallback'] ) {
        $blank_unproven_observed = true;
    }
}
wu19_assert( $ready_observed, 'Ready Print composition was not represented as shared PASS.' );
wu19_assert( $blank_unproven_observed, 'Existing manual/unproven blank behavior was not represented as a degraded shared decision.' );

$results_path = trailingslashit( $artifact_dir ) . 'wu19-runtime-results.json';
$results = json_decode( file_get_contents( $results_path ), true );
wu19_assert( is_array( $results ), 'WU19 result artifact became unreadable before diagnostics mapping.' );
$results['runtime_decision_trace'] = array(
    'negative_required_asset' => array(
        'status' => $negative_trace['status'],
        'fallback' => 'dossier_not_rendered',
    ),
    'ready_composition' => array(
        'status' => $ready_trace['status'],
        'ordered_stages' => $ready_stages,
        'ready_observed' => true,
        'blank_unproven_observed' => true,
    ),
);
file_put_contents( $results_path, wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU19_RUNTIME_DECISION_TRACE_PASS\n";
