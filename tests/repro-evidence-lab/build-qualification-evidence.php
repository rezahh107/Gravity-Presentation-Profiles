<?php
$dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $dir || ! is_dir( $dir ) ) throw new RuntimeException( 'Qualification artifact directory unavailable.' );
function gppq_read_json( $dir, $name ) {
    $path = rtrim( $dir, '/\\' ) . DIRECTORY_SEPARATOR . $name;
    if ( ! is_file( $path ) ) throw new RuntimeException( 'Missing qualification input: ' . $name );
    $value = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $value ) ) throw new RuntimeException( 'Invalid JSON qualification input: ' . $name );
    return $value;
}
function gppq_result_status( $suite, $id ) {
    foreach ( $suite['results'] as $result ) if ( isset( $result['id'] ) && $id === $result['id'] ) return $result['status'];
    return 'MISSING';
}
$core = gppq_read_json( $dir, 'core-spine-results.json' );
$entry_visual = gppq_read_json( $dir, 'entry-visual-contract-results.json' );
$print_visual = gppq_read_json( $dir, 'print-visual-contract-results.json' );
$wu18_runtime = gppq_read_json( $dir, 'wu18-runtime-results.json' );
$wu18_browser = gppq_read_json( $dir, 'wu18-browser-results.json' );
$wu19_runtime = gppq_read_json( $dir, 'wu19-runtime-results.json' );
$wu19_browser = gppq_read_json( $dir, 'wu19-browser-results.json' );

$evidence = array(
    'schema_version' => '1.0.0',
    'repository_sha' => getenv( 'GITHUB_SHA' ) ?: null,
    'evidence_class' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'data_class' => 'SYNTHETIC_NON_PII',
    'focused_gates' => array(
        'wu21_wu17' => 'REUSED_SEPARATE_FOCUSED_GATE',
        'wu18' => 'REUSED_IN_SHARED_RUNTIME',
        'wu19' => 'REUSED_IN_SHARED_RUNTIME',
    ),
    'core_spine' => array(
        'happy_path' => gppq_result_status( $core, 'CORE-SPINE-001' ),
        'schema_drift' => gppq_result_status( $core, 'CORE-SPINE-002' ),
        'binding_ambiguity' => gppq_result_status( $core, 'CORE-SPINE-003' ),
        'permission_mutation' => gppq_result_status( $core, 'CORE-SPINE-004' ),
        'evidence_degradation' => gppq_result_status( $core, 'CORE-SPINE-005' ),
        'lifecycle_mutation' => gppq_result_status( $core, 'CORE-SPINE-006' ),
        'same_entry_continuity' => $core['same_entry_continuity'],
        'cross_surface_semantic_consistency' => $core['cross_surface_semantic_consistency'],
    ),
    'visual_contract' => array(
        'entry_desktop_C' => $entry_visual['surfaces']['entry_desktop_C'],
        'entry_mobile_D' => $entry_visual['surfaces']['entry_mobile_D'],
        'print_front_E' => $print_visual['surfaces']['print_front_E'],
        'print_back_F' => $print_visual['surfaces']['print_back_F'],
        'deliberate_entry_regression' => $entry_visual['deliberate_regression'],
        'deliberate_entry_old_gate_bypass' => $entry_visual['old_gate_bypass_regression'],
        'deliberate_print_regression' => $print_visual['deliberate_regression'],
    ),
    'owner_reference_sha256' => array(
        'html' => '666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81',
        'pdf' => '34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5',
    ),
    'focused_runtime_reuse' => array(
        'wu18_php_runtime' => ! empty( $wu18_runtime['shared_profile'] ) ? 'PASS' : 'FAIL',
        'wu18_browser' => count( array_filter( $wu18_browser['results'], static function ( $r ) { return 'PASS' !== $r['status']; } ) ) ? 'FAIL' : 'PASS',
        'wu19_php_runtime' => ! empty( $wu19_runtime['happy_ready'] ) ? 'PASS' : 'FAIL',
        'wu19_browser' => count( array_filter( $wu19_browser['results'], static function ( $r ) { return 'PASS' !== $r['status']; } ) ) ? 'FAIL' : 'PASS',
    ),
    'limits' => array(
        'target_production_equivalence' => 'NOT_PROVEN',
        'production_form_field_step_ids' => 'NOT_PROVEN',
        'production_server_theme_cache_cdn_permalink_interaction' => 'NOT_PROVEN',
        'real_site_plugin_license_configuration' => 'NOT_PROVEN',
        'physical_printer_margins_toner_driver_behavior' => 'NOT_PROVEN',
    ),
);

foreach ( $evidence['core_spine'] as $key => $status ) if ( 'PASS' !== $status ) throw new RuntimeException( 'Core Spine qualification is not fully PASS: ' . $key . '=' . $status );
foreach ( array( 'entry_desktop_C', 'entry_mobile_D', 'print_front_E', 'print_back_F' ) as $key ) if ( 'PASS' !== $evidence['visual_contract'][ $key ] ) throw new RuntimeException( 'Visual qualification is not fully PASS: ' . $key );
foreach ( array( 'deliberate_entry_regression', 'deliberate_entry_old_gate_bypass', 'deliberate_print_regression' ) as $key ) if ( 'REJECTED_AS_EXPECTED' !== $evidence['visual_contract'][ $key ] ) throw new RuntimeException( 'Deliberate visual regression proof missing: ' . $key );
foreach ( $evidence['focused_runtime_reuse'] as $key => $status ) if ( 'PASS' !== $status ) throw new RuntimeException( 'Focused gate reuse failed: ' . $key );

$json = json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
$forbidden = array( '0917', '0912', 'محمدرضا', 'علی رضایی' );
foreach ( $forbidden as $needle ) if ( false !== strpos( $json, $needle ) ) throw new RuntimeException( 'Machine-readable qualification evidence contains fixture-person detail: ' . $needle );
file_put_contents( rtrim( $dir, '/\\' ) . DIRECTORY_SEPARATOR . 'gpp-qualification.json', $json );
echo "GPP_QUALIFICATION_EVIDENCE_PASS\n";
