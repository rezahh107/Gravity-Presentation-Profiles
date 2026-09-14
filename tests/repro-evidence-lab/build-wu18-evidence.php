<?php
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    fwrite( STDERR, "WU21_ARTIFACT_DIR required for WU18 evidence\n" );
    exit( 1 );
}

function wu18_read_json( $path ) {
    if ( ! is_file( $path ) ) {
        throw new RuntimeException( 'Missing WU18 evidence input: ' . $path );
    }
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) {
        throw new RuntimeException( 'Invalid WU18 evidence JSON: ' . $path );
    }
    return $data;
}
function wu18_status_map( $suites ) {
    $out = array();
    foreach ( $suites as $suite ) {
        foreach ( $suite['results'] as $test ) {
            $out[ $test['id'] ] = $test['status'];
        }
    }
    return $out;
}
function wu18_all_pass( $map, $ids ) {
    foreach ( $ids as $id ) {
        if ( ! isset( $map[ $id ] ) || 'PASS' !== $map[ $id ] ) {
            return false;
        }
    }
    return true;
}
function wu18_exact_ids( $suite, $expected, $label ) {
    if ( ! isset( $suite['results'] ) || ! is_array( $suite['results'] ) ) {
        throw new RuntimeException( $label . ' results missing.' );
    }
    $ids = array_map( static function ( $test ) { return isset( $test['id'] ) ? $test['id'] : null; }, $suite['results'] );
    $unique = array_values( array_unique( $ids ) );
    sort( $unique, SORT_STRING );
    sort( $expected, SORT_STRING );
    if ( count( $ids ) !== count( $unique ) || $unique !== $expected ) {
        throw new RuntimeException( $label . ' test ID set mismatch.' );
    }
}

$fixture = wu18_read_json( $artifact_dir . '/wu18-fixture-manifest.json' );
$runtime = wu18_read_json( $artifact_dir . '/wu18-runtime-results.json' );
$browser = wu18_read_json( $artifact_dir . '/wu18-browser-results.json' );
$expected_runtime = array_map( static function ( $i ) { return sprintf( 'WU18-PHP-%03d', $i ); }, range( 1, 10 ) );
$expected_browser = array_map( static function ( $i ) { return sprintf( 'WU18-BROWSER-%03d', $i ); }, range( 1, 10 ) );
wu18_exact_ids( $runtime, $expected_runtime, 'WU18 PHP/runtime' );
wu18_exact_ids( $browser, $expected_browser, 'WU18 browser/runtime' );

$map = wu18_status_map( array( $runtime, $browser ) );
$acceptance_refs = array(
    'AC-WU18-001' => array( 'WU18-BROWSER-001' ),
    'AC-WU18-002' => array( 'WU18-PHP-005', 'WU18-PHP-006', 'WU18-BROWSER-002', 'WU18-BROWSER-007' ),
    'AC-WU18-003' => array( 'WU18-PHP-006', 'WU18-PHP-007', 'WU18-BROWSER-002' ),
    'AC-WU18-004' => array( 'WU18-PHP-002', 'WU18-PHP-008', 'WU18-BROWSER-003', 'WU18-BROWSER-004' ),
    'AC-WU18-005' => array( 'WU18-PHP-002', 'WU18-BROWSER-005' ),
    'AC-WU18-006' => array( 'WU18-BROWSER-006' ),
    'AC-WU18-007' => array( 'WU18-PHP-009', 'WU18-BROWSER-008', 'WU18-BROWSER-009' ),
    'AC-WU18-008' => array( 'WU18-PHP-001', 'WU18-PHP-003', 'WU18-PHP-004', 'WU18-PHP-010', 'WU18-BROWSER-007', 'WU18-BROWSER-010' ),
);
$acceptance = array();
foreach ( $acceptance_refs as $id => $ids ) {
    $pass = wu18_all_pass( $map, $ids );
    $acceptance[ $id ] = array(
        'status' => $pass ? 'PASS' : 'NOT_PROVEN',
        'evidence_class' => $pass ? 'PROVEN_IN_REPRODUCIBLE_SIMULATION' : 'NOT_PROVEN',
        'evidence_refs' => $ids,
    );
}

$all_tests = array_merge( $runtime['results'], $browser['results'] );
$all_tests_pass = 0 === count( array_filter( $all_tests, static function ( $test ) { return 'PASS' !== $test['status']; } ) );
$all_acceptance_pass = 0 === count( array_filter( $acceptance, static function ( $criterion ) { return 'PASS' !== $criterion['status']; } ) );
$overall = $all_tests_pass && $all_acceptance_pass ? 'PASS' : 'FAIL';

$evidence = array(
    'artifact_type' => 'gpp.wu18.entry_detail_evidence',
    'schema_version' => '1.0.0',
    'work_unit_id' => 'WU-GPP-GF-ENTRY-FINAL-18',
    'environment_class' => 'REPRODUCIBLE_SIMULATION',
    'maximum_positive_evidence_class' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'overall_status' => $overall,
    'repository' => array(
        'full_name' => getenv( 'GITHUB_REPOSITORY' ),
        'head_sha' => getenv( 'GPP_WU21_REPOSITORY_SHA' ),
    ),
    'fixture_manifest' => $fixture,
    'runtime_results' => $runtime,
    'browser_results' => $browser,
    'acceptance_criteria' => $acceptance,
    'target_production_facts' => array(
        'form_ids' => 'UNBOUND',
        'field_ids' => 'UNBOUND',
        'workflow_step_ids' => 'UNBOUND',
        'page_route_ids' => 'UNBOUND',
        'entry_detail_action_availability' => 'NOT_PROVEN',
        'entry_detail_editability' => 'NOT_PROVEN',
        'report_card_file_representation' => 'UNBOUND',
        'entry_detail_binding_set' => 'UNBOUND'
    ),
    'production_equivalence' => array(
        'state' => 'NOT_PROVEN',
        'reason' => 'WU18 evidence uses version-pinned synthetic non-PII WordPress/Gravity Forms/Gravity Flow fixtures; no target-production read-back was performed.'
    ),
    'scope_exclusions' => array(
        'WU19 two-page A4 print composition',
        'WU20 final acceptance/release',
        'target-production binding discovery',
    ),
);

$canonical = $evidence;
ksort( $canonical, SORT_STRING );
$digest = hash( 'sha256', wp_json_encode( $canonical, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
$evidence['content_digest'] = array( 'algorithm' => 'sha256', 'value' => $digest );
file_put_contents(
    $artifact_dir . '/wu18-evidence.json',
    wp_json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo 'WU18_EVIDENCE_STATUS=' . $overall . "\n";
foreach ( $acceptance as $id => $criterion ) {
    echo $criterion['status'] . ' ' . $id . ' ' . implode( ',', $criterion['evidence_refs'] ) . "\n";
}
if ( 'PASS' !== $overall ) {
    exit( 1 );
}
