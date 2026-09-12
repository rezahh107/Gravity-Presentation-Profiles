<?php
$repo = dirname( __DIR__, 2 );
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) { fwrite( STDERR, "WU21_ARTIFACT_DIR required\n" ); exit( 1 ); }
function read_json( $path ) {
    if ( ! is_file( $path ) ) { throw new RuntimeException( 'Missing required evidence input: ' . $path ); }
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) { throw new RuntimeException( 'Invalid JSON: ' . $path ); }
    return $data;
}
function canonicalize( $value ) {
    if ( ! is_array( $value ) ) return $value;
    $is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
    if ( $is_list ) return array_map( 'canonicalize', $value );
    ksort( $value, SORT_STRING );
    foreach ( $value as $k => $v ) $value[$k] = canonicalize( $v );
    return $value;
}
function canonical_json( $value ) { return json_encode( canonicalize( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); }
function status_map( $tests ) { $out = array(); foreach ( $tests as $t ) $out[$t['id']] = $t['status']; return $out; }
function all_pass( $map, $ids ) { foreach ( $ids as $id ) if ( ! isset( $map[$id] ) || 'PASS' !== $map[$id] ) return false; return true; }

$config = read_json( $repo . '/tests/repro-evidence-lab/lab-config.json' );
$runtime = read_json( $artifact_dir . '/runtime.json' );
$fixture = read_json( $artifact_dir . '/fixture-manifest.json' );
$php = read_json( $artifact_dir . '/php-results.json' );
$browser = read_json( $artifact_dir . '/browser-results.json' );
$tests = array_merge( $php['results'], $browser['results'] );
$map = status_map( $tests );
$groups = array(
    'native_inbox_behavior' => array( 'WU21-PHP-004','WU21-PHP-005','WU21-PHP-010','WU21-PHP-011','WU21-PHP-012','WU21-PHP-013','WU21-PHP-014','WU21-PHP-015','WU21-BROWSER-001','WU21-BROWSER-002','WU21-BROWSER-003','WU21-BROWSER-004','WU21-BROWSER-005','WU21-BROWSER-006' ),
    'semantic_binding' => array( 'WU21-PHP-003','WU21-PHP-006','WU21-PHP-007','WU21-PHP-008','WU21-PHP-009' ),
    'fail_closed' => array( 'WU21-PHP-005','WU21-PHP-006','WU21-PHP-008','WU21-PHP-016' ),
    'synthetic_privacy' => array( 'WU21-PHP-017' ),
    'source_backed_seams' => array( 'WU21-PHP-002','WU21-PHP-015' ),
);
$mechanics = array();
foreach ( $groups as $name => $ids ) {
    $pass = all_pass( $map, $ids );
    $mechanics[$name] = array(
        'state' => $pass ? 'PROVEN_IN_REPRODUCIBLE_SIMULATION' : 'NOT_PROVEN',
        'required_test_ids' => $ids,
    );
}
$all_tests_pass = count( array_filter( $tests, function ( $t ) { return 'PASS' !== $t['status']; } ) ) === 0;
$acceptance = array();
for ( $i = 1; $i <= 10; $i++ ) {
    $id = sprintf( 'AC-WU21-%03d', $i );
    $acceptance[$id] = array( 'status' => 'PASS', 'evidence_refs' => array() );
}
$acceptance['AC-WU21-001']['evidence_refs'] = array( 'runtime', 'configuration', 'environment', 'packages', 'workflow' );
$acceptance['AC-WU21-002']['evidence_refs'] = array( 'fixture_manifest', 'WU21-PHP-004', 'WU21-PHP-017' );
$acceptance['AC-WU21-003']['evidence_refs'] = array( 'source_backed_seams', 'WU21-PHP-002' );
$acceptance['AC-WU21-004']['evidence_refs'] = array_merge( $groups['native_inbox_behavior'] );
$acceptance['AC-WU21-005']['evidence_refs'] = array_merge( $groups['semantic_binding'] );
$acceptance['AC-WU21-006']['evidence_refs'] = array_merge( $groups['fail_closed'] );
$acceptance['AC-WU21-007']['evidence_refs'] = array( 'content_digest', 'runtime', 'tests', 'production_equivalence' );
$acceptance['AC-WU21-008']['evidence_refs'] = array( 'fixture_manifest', 'WU21-PHP-017' );
$acceptance['AC-WU21-009']['evidence_refs'] = array( 'mechanics' );
$acceptance['AC-WU21-010']['evidence_refs'] = array( 'production_equivalence', 'target_production_facts' );
if ( ! $all_tests_pass ) {
    foreach ( $acceptance as &$ac ) $ac['status'] = 'NOT_PROVEN';
    unset( $ac );
}

$evidence = array(
    'artifact_type' => 'gpp.reproducible_simulation_evidence',
    'schema_version' => '1.0.0',
    'work_unit_id' => $config['work_unit_id'],
    'run_id' => $config['run_id'],
    'environment_class' => 'REPRODUCIBLE_SIMULATION',
    'maximum_positive_evidence_class' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'overall_status' => $all_tests_pass ? 'PASS' : 'FAIL',
    'repository' => $runtime['repository'],
    'workflow' => array_merge( $runtime['workflow'], array( 'run_url' => $runtime['workflow']['server_url'] . '/' . $runtime['repository']['full_name'] . '/actions/runs/' . $runtime['workflow']['run_id'] ) ),
    'configuration' => $runtime['configuration'],
    'environment' => array(
        'wordpress' => array_merge( $config['wordpress'], $runtime['wordpress'] ),
        'php' => array_merge( $config['php'], $runtime['php'] ),
        'database' => array_merge( $config['database'], $runtime['database'] ),
        'browser' => $config['browser'],
        'wp_cli' => $config['wp_cli'],
    ),
    'packages' => array(
        'gravity_forms' => array_merge( $config['plugins']['gravity_forms'], $runtime['plugins']['gravity_forms'] ),
        'gravity_flow' => array_merge( $config['plugins']['gravity_flow'], $runtime['plugins']['gravity_flow'] ),
    ),
    'fixture_manifest' => $fixture,
    'source_backed_seams' => $config['source_backed_seams'],
    'tests' => $tests,
    'mechanics' => $mechanics,
    'acceptance_criteria' => $acceptance,
    'target_production_facts' => array(
        'form_ids' => 'UNBOUND',
        'field_ids' => 'UNBOUND',
        'workflow_step_ids' => 'UNBOUND',
        'page_route_ids' => 'UNBOUND',
        'plugin_license_configuration' => 'NOT_PROVEN',
        'cache_cdn_theme_server_configuration' => 'NOT_PROVEN'
    ),
    'production_equivalence' => array(
        'state' => 'NOT_PROVEN',
        'reason' => 'WU21 is a reproducible simulation only; no target-production read-back is performed.'
    ),
    'evidence_refs' => array(
        'config:tests/repro-evidence-lab/lab-config.json',
        'workflow:.github/workflows/wu21-repro-evidence-lab.yml',
        'fixture:synthetic-non-pii',
        'gravity-flow-package-sha256:' . $config['plugins']['gravity_flow']['sha256'],
        'gravity-forms-package-sha256:' . $config['plugins']['gravity_forms']['sha256']
    ),
);
$without_digest = $evidence;
$digest = hash( 'sha256', canonical_json( $without_digest ) );
$evidence['content_digest'] = array( 'algorithm' => 'sha256', 'value' => $digest );
$filename = 'wu21-repro-evidence-' . $digest . '.json';
file_put_contents( $artifact_dir . '/' . $filename, json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
file_put_contents( $artifact_dir . '/evidence-path.txt', $filename . "\n" );
file_put_contents( $artifact_dir . '/evidence-digest.txt', $digest . "\n" );
echo "evidence_file={$filename}\n";
echo "evidence_digest={$digest}\n";
