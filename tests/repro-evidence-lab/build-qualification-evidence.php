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
$repository_sha = trim( (string) shell_exec( 'git rev-parse HEAD 2>/dev/null' ) );
if ( 1 !== preg_match( '/^[0-9a-f]{40}$/', $repository_sha ) ) throw new RuntimeException( 'Exact checkout repository SHA unavailable.' );
$core = gppq_read_json( $dir, 'core-spine-results.json' );
$entry_visual = gppq_read_json( $dir, 'entry-visual-contract-results.json' );
$print_visual = gppq_read_json( $dir, 'print-visual-contract-results.json' );
$wu18_runtime = gppq_read_json( $dir, 'wu18-runtime-results.json' );
$wu18_browser = gppq_read_json( $dir, 'wu18-browser-results.json' );
$wu19_runtime = gppq_read_json( $dir, 'wu19-runtime-results.json' );
$wu19_browser = gppq_read_json( $dir, 'wu19-browser-results.json' );

$legacy_html_sha = '666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81';
$entry_vnext_sha = '1934967b81d82ee77c60ffd547dde6fa7c8a310dbde94556686bd3d515d62a69';
$print_pdf_sha = '34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5';
if ( empty( $entry_visual['authority']['sha256'] ) || $entry_vnext_sha !== $entry_visual['authority']['sha256'] ) {
    throw new RuntimeException( 'Entry Detail qualification did not use the current vNext Owner authority.' );
}
if ( empty( $print_visual['owner_reference_sha256'] ) || $print_pdf_sha !== $print_visual['owner_reference_sha256'] ) {
    throw new RuntimeException( 'Print qualification did not preserve the locked Print authority.' );
}

$evidence = array(
    'schema_version' => '1.0.0',
    'repository_sha' => $repository_sha,
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
        'print_content_variation' => isset( $print_visual['content_variation'] ) ? $print_visual['content_variation'] : 'MISSING',
        'deliberate_print_regression' => $print_visual['deliberate_regression'],
        'deliberate_print_management_regression' => isset( $print_visual['deliberate_management_regression'] ) ? $print_visual['deliberate_management_regression'] : 'MISSING',
    ),
    // Keep the historical html/pdf keys for consumers of the existing evidence
    // schema, while recording the current Entry Detail authority separately.
    'owner_reference_sha256' => array(
        'html' => $legacy_html_sha,
        'entry_vnext_html' => $entry_vnext_sha,
        'pdf' => $print_pdf_sha,
    ),
    'entry_detail_authority_supersession' => array(
        'scope' => 'gravity_flow.entry_detail',
        'superseded_html_sha256' => $legacy_html_sha,
        'current_html_sha256' => $entry_vnext_sha,
        'inbox_authority_changed' => false,
        'print_authority_changed' => false,
    ),
    'focused_runtime_reuse' => array(
        'wu18_php_runtime' => isset( $wu18_runtime['profile_id'], $wu18_runtime['runtime_decision_trace']['status'] )
            && 'srwf.operations.entry-detail.v1' === $wu18_runtime['profile_id']
            && 'PASS' === $wu18_runtime['runtime_decision_trace']['status'] ? 'PASS' : 'FAIL',
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
if ( 'PASS' !== $evidence['visual_contract']['print_content_variation'] ) throw new RuntimeException( 'Print content-variation structural invariance is not proven.' );
foreach ( array( 'deliberate_entry_regression', 'deliberate_entry_old_gate_bypass', 'deliberate_print_regression', 'deliberate_print_management_regression' ) as $key ) if ( 'REJECTED_AS_EXPECTED' !== $evidence['visual_contract'][ $key ] ) throw new RuntimeException( 'Deliberate visual regression proof missing: ' . $key );
foreach ( $evidence['focused_runtime_reuse'] as $key => $status ) if ( 'PASS' !== $status ) throw new RuntimeException( 'Focused gate reuse failed: ' . $key );

$json = json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
$forbidden = array( '0917', '0912', 'محمدرضا', 'علی رضایی' );
foreach ( $forbidden as $needle ) if ( false !== strpos( $json, $needle ) ) throw new RuntimeException( 'Machine-readable qualification evidence contains fixture-person detail: ' . $needle );
file_put_contents( rtrim( $dir, '/\\' ) . DIRECTORY_SEPARATOR . 'gpp-qualification.json', $json );
echo "GPP_QUALIFICATION_EVIDENCE_PASS\n";
