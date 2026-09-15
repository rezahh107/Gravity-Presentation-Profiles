<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Diagnostics\RuntimeIncidentStore;

$artifact_dir = getenv( 'SRWF_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'SRWF_ARTIFACT_DIR is required.' );
}

$state = RuntimeIncidentStore::forWordPress()->snapshot();
$trace = isset( $state['recent_success']['gravity_forms.form'] ) ? $state['recent_success']['gravity_forms.form'] : null;
if ( ! is_array( $trace ) || 'PASS' !== $trace['status'] ) {
    throw new RuntimeException( 'Authentic Gravity Forms presentation did not persist a successful shared runtime trace.' );
}
$stages = array_column( $trace['events'], 'stage' );
$required = array( 'GF_PROFILE_SELECTION', 'GF_ASSET_READINESS', 'GF_PRESENTATION_APPLIED' );
foreach ( $required as $stage ) {
    if ( ! in_array( $stage, $stages, true ) ) {
        throw new RuntimeException( 'Authentic Gravity Forms trace missing shared stage: ' . $stage );
    }
}
$previous = 0;
foreach ( $trace['events'] as $event ) {
    if ( ! isset( $event['seq'] ) || ! is_int( $event['seq'] ) || $event['seq'] <= $previous ) {
        throw new RuntimeException( 'Authentic Gravity Forms trace ordering is invalid.' );
    }
    $previous = $event['seq'];
}

$encoded = wp_json_encode( $trace, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
foreach ( array( 'user_pass', 'Authorization', 'wp-content/uploads/' ) as $forbidden ) {
    if ( false !== stripos( $encoded, $forbidden ) ) {
        throw new RuntimeException( 'Authentic diagnostics trace contains forbidden request/payload material.' );
    }
}

file_put_contents(
    trailingslashit( $artifact_dir ) . 'runtime-diagnostics-results.json',
    wp_json_encode(
        array(
            'schema_version' => '1.0.0',
            'surface' => $trace['surface'],
            'status' => $trace['status'],
            'stages' => $stages,
            'ordered' => true,
            'payload_privacy_check' => 'PASS',
        ),
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    ) . "\n"
);
echo "SRWF_RUNTIME_DIAGNOSTICS_PASS\n";
