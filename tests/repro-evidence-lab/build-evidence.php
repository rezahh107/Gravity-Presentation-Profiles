<?php
$repo = dirname( __DIR__, 2 );
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) { fwrite( STDERR, "WU21_ARTIFACT_DIR required\n" ); exit( 1 ); }
require_once __DIR__ . '/visual-diagnostics-manifest.php';
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
function require_exact_test_ids( $suite, $expected, $label ) {
    if ( ! isset( $suite['results'] ) || ! is_array( $suite['results'] ) ) throw new RuntimeException( $label . ' results missing.' );
    $ids = array_map( function ( $t ) { return isset( $t['id'] ) ? $t['id'] : null; }, $suite['results'] );
    $unique = array_values( array_unique( $ids ) );
    sort( $unique, SORT_STRING );
    $expected_sorted = $expected;
    sort( $expected_sorted, SORT_STRING );
    if ( count( $ids ) !== count( $unique ) || $unique !== $expected_sorted ) throw new RuntimeException( $label . ' test ID set mismatch.' );
}
function require_inbox_v2_qualification_capture( $qualification ) {
    if ( 'gpp.inbox_visual_design_v2.qualification_batch_1_evidence' !== ( $qualification['artifact_type'] ?? null ) ) {
        throw new RuntimeException( 'Inbox V2 qualification artifact_type mismatch.' );
    }
    if ( '1.0.0' !== ( $qualification['schema_version'] ?? null ) ) {
        throw new RuntimeException( 'Inbox V2 qualification schema mismatch.' );
    }
    if ( 'PROVEN_IN_REPRODUCIBLE_RUNTIME' !== ( $qualification['evidence_ceiling'] ?? null ) ) {
        throw new RuntimeException( 'Inbox V2 qualification evidence ceiling mismatch.' );
    }
    foreach ( array( 'q1', 'q2', 'q4' ) as $id ) {
        $result = $qualification['qualifications'][ $id ] ?? null;
        if ( ! is_array( $result ) || 'CAPTURED' !== ( $result['execution_status'] ?? null ) ) {
            throw new RuntimeException( 'Inbox V2 qualification ' . $id . ' capture incomplete.' );
        }
        if ( ! in_array( $result['status'] ?? null, array( 'PASS', 'FAIL', 'NOT_PROVEN' ), true ) ) {
            throw new RuntimeException( 'Inbox V2 qualification ' . $id . ' disposition is invalid.' );
        }
    }
}
function require_inbox_v2_qualification_provenance( $qualification, $browser, $runtime, $repository_head ) {
    $adjunct = $browser['inbox_visual_design_v2_qualification'] ?? null;
    if ( ! is_array( $adjunct ) ) {
        throw new RuntimeException( 'Browser results are missing Inbox V2 qualification adjunct.' );
    }
    if ( ! hash_equals( hash( 'sha256', canonical_json( $qualification ) ), hash( 'sha256', canonical_json( $adjunct ) ) ) ) {
        throw new RuntimeException( 'Inbox V2 standalone/browser qualification evidence diverged.' );
    }
    require_inbox_v2_qualification_capture( $qualification );
    if ( ! $repository_head || ! preg_match( '/^[0-9a-f]{40}$/', $repository_head ) ) {
        throw new RuntimeException( 'Checked-out WU21 repository Head is unavailable.' );
    }
    if ( $repository_head !== ( $runtime['repository']['commit_sha'] ?? null ) ) {
        throw new RuntimeException( 'WU21 runtime repository Head mismatch.' );
    }
    if ( $repository_head !== ( $qualification['repository']['exact_head'] ?? null ) ) {
        throw new RuntimeException( 'Inbox V2 qualification exact_head mismatch.' );
    }
    if ( ( $runtime['repository']['full_name'] ?? null ) !== ( $qualification['repository']['full_name'] ?? null ) ) {
        throw new RuntimeException( 'Inbox V2 qualification repository identity mismatch.' );
    }
    $identity_pairs = array(
        'wordpress' => array( $qualification['runtime']['wordpress'] ?? null, $runtime['wordpress']['version'] ?? null ),
        'php' => array( $qualification['runtime']['php'] ?? null, $runtime['php']['version'] ?? null ),
        'gravity_forms' => array( $qualification['runtime']['gravity_forms'] ?? null, $runtime['plugins']['gravity_forms']['runtime_version'] ?? null ),
        'gravity_flow' => array( $qualification['runtime']['gravity_flow'] ?? null, $runtime['plugins']['gravity_flow']['runtime_version'] ?? null ),
    );
    foreach ( $identity_pairs as $label => $pair ) {
        if ( ! is_string( $pair[0] ) || '' === $pair[0] || $pair[0] !== $pair[1] ) {
            throw new RuntimeException( 'Inbox V2 qualification runtime identity mismatch: ' . $label );
        }
    }
}

$config = read_json( $repo . '/tests/repro-evidence-lab/lab-config.json' );
$runtime = read_json( $artifact_dir . '/runtime.json' );
$fixture = read_json( $artifact_dir . '/fixture-manifest.json' );
$php = read_json( $artifact_dir . '/php-results.json' );
$browser = read_json( $artifact_dir . '/browser-results.json' );
$geometry = read_json( $artifact_dir . '/inbox-card-geometry.json' );
$qualification_path = $artifact_dir . '/inbox-visual-design-v2-qualification-evidence.json';
$qualification = read_json( $qualification_path );
$repository_head = getenv( 'GPP_WU21_REPOSITORY_SHA' );
require_inbox_v2_qualification_provenance( $qualification, $browser, $runtime, $repository_head );
$qualification_sha256 = hash_file( 'sha256', $qualification_path );
if ( false === $qualification_sha256 ) {
    throw new RuntimeException( 'Unable to hash Inbox V2 qualification evidence.' );
}
$visual_diagnostics = wu21_visual_diagnostics_manifest( $artifact_dir );
$expected_php_ids = array_map( function ( $i ) { return sprintf( 'WU21-PHP-%03d', $i ); }, range( 1, 17 ) );
$expected_browser_ids = array_map( function ( $i ) { return sprintf( 'WU21-BROWSER-%03d', $i ); }, range( 1, 7 ) );
require_exact_test_ids( $php, $expected_php_ids, 'PHP/runtime' );
require_exact_test_ids( $browser, $expected_browser_ids, 'Browser/runtime' );
$tests = array_merge( $php['results'], $browser['results'] );
$map = status_map( $tests );
$groups = array(
    'native_inbox_behavior' => array( 'WU21-PHP-004','WU21-PHP-005','WU21-PHP-010','WU21-PHP-011','WU21-PHP-012','WU21-PHP-013','WU21-PHP-014','WU21-PHP-015','WU21-BROWSER-001','WU21-BROWSER-002','WU21-BROWSER-003','WU21-BROWSER-004','WU21-BROWSER-005','WU21-BROWSER-006','WU21-BROWSER-007' ),
    'semantic_binding' => array( 'WU21-PHP-003','WU21-PHP-006','WU21-PHP-007','WU21-PHP-008','WU21-PHP-009' ),
    'fail_closed' => array( 'WU21-PHP-005','WU21-PHP-006','WU21-PHP-008','WU21-PHP-016' ),
    'synthetic_privacy' => array( 'WU21-PHP-017' ),
    'source_backed_seams' => array( 'WU21-PHP-002','WU21-PHP-015' ),
);
$mechanics = array();
foreach ( $groups as $name => $ids ) {
    $pass = all_pass( $map, $ids );
    $mechanics[$name] = array( 'state' => $pass ? 'PROVEN_IN_REPRODUCIBLE_SIMULATION' : 'NOT_PROVEN', 'required_test_ids' => $ids );
}
$all_tests_pass = count( array_filter( $tests, function ( $t ) { return 'PASS' !== $t['status']; } ) ) === 0;
$native_first_geometry_pass = 'PASS' === ( $geometry['status'] ?? null )
    && 'NATIVE_FIRST' === ( $geometry['architecture'] ?? null )
    && 'CARD_MODE' === ( $geometry['superseded_architecture'] ?? null );
$architecture_reset_proven = $all_tests_pass && $native_first_geometry_pass;
$architecture_reset = array(
    'state' => $architecture_reset_proven ? 'PROVEN_IN_REPRODUCIBLE_SIMULATION' : 'NOT_PROVEN',
    'mode' => 'NATIVE_FIRST',
    'superseded_mode' => 'CARD_MODE',
    'visual_golden_admission' => 'NOT_ATTEMPTED_OUT_OF_SCOPE',
    'geometry_artifact' => 'inbox-card-geometry.json',
    'required_evidence_refs' => array( 'WU21-PHP-006', 'WU21-PHP-007', 'WU21-BROWSER-001', 'WU21-BROWSER-003', 'WU21-BROWSER-005', 'WU21-BROWSER-006', 'WU21-BROWSER-007', 'visual_regression_diagnostics' ),
);

$acceptance = array();
for ( $i = 1; $i <= 10; $i++ ) $acceptance[sprintf( 'AC-WU21-%03d', $i )] = array( 'status' => 'PASS', 'evidence_refs' => array() );
$acceptance['AC-WU21-001']['evidence_refs'] = array( 'runtime', 'configuration', 'environment', 'packages', 'workflow' );
$acceptance['AC-WU21-002']['evidence_refs'] = array( 'fixture_manifest', 'WU21-PHP-004', 'WU21-PHP-017' );
$acceptance['AC-WU21-003']['evidence_refs'] = array( 'source_backed_seams', 'WU21-PHP-002' );
$acceptance['AC-WU21-004']['evidence_refs'] = array_merge( $groups['native_inbox_behavior'] );
$acceptance['AC-WU21-005']['evidence_refs'] = array_merge( $groups['semantic_binding'] );
$acceptance['AC-WU21-006']['evidence_refs'] = array_merge( $groups['fail_closed'] );
$acceptance['AC-WU21-007']['evidence_refs'] = array( 'content_digest', 'runtime', 'tests', 'architecture_reset', 'visual_regression_diagnostics', 'production_equivalence' );
$acceptance['AC-WU21-008']['evidence_refs'] = array( 'fixture_manifest', 'WU21-PHP-017' );
$acceptance['AC-WU21-009']['evidence_refs'] = array( 'mechanics', 'architecture_reset' );
$acceptance['AC-WU21-010']['evidence_refs'] = array( 'production_equivalence', 'target_production_facts' );
if ( ! $architecture_reset_proven ) {
    foreach ( $acceptance as &$ac ) $ac['status'] = 'NOT_PROVEN';
    unset( $ac );
}

$evidence = array(
    'artifact_type' => 'gpp.reproducible_simulation_evidence',
    'schema_version' => '1.1.0',
    'work_unit_id' => $config['work_unit_id'],
    'run_id' => $config['run_id'],
    'environment_class' => 'REPRODUCIBLE_SIMULATION',
    'maximum_positive_evidence_class' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'overall_status' => $architecture_reset_proven ? 'PASS' : 'FAIL',
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
    'architecture_reset' => $architecture_reset,
    'native_first_geometry' => $geometry,
    'visual_regression_diagnostics' => $visual_diagnostics,
    'acceptance_criteria' => $acceptance,
    'target_production_facts' => array(
        'form_ids' => 'UNBOUND', 'field_ids' => 'UNBOUND', 'workflow_step_ids' => 'UNBOUND', 'page_route_ids' => 'UNBOUND',
        'plugin_license_configuration' => 'NOT_PROVEN', 'cache_cdn_theme_server_configuration' => 'NOT_PROVEN'
    ),
    'production_equivalence' => array( 'state' => 'NOT_PROVEN', 'reason' => 'WU21 is a reproducible simulation only; no target-production read-back is performed.' ),
    'evidence_refs' => array(
        'config:tests/repro-evidence-lab/lab-config.json',
        'workflow:.github/workflows/wu21-repro-evidence-lab.yml',
        'fixture:synthetic-non-pii',
        'architecture:native-first',
        'geometry:inbox-card-geometry.json-legacy-filename-native-first-content',
        'visual-diagnostics:recursive-json-jsonl-png-sha256-manifest',
        'inbox-visual-design-v2-qualification-sha256:' . $qualification_sha256,
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
echo "qualification_evidence_sha256={$qualification_sha256}\n";
echo "evidence_file={$filename}\n";
echo "evidence_digest={$digest}\n";

if ( '1' !== getenv( 'WU21_BINDING_FALSIFICATION_ACTIVE' ) ) {
    putenv( 'WU21_BINDING_FALSIFICATION_ACTIVE=1' );
    $command = 'php ' . escapeshellarg( __DIR__ . '/inbox-visual-design-v2-evidence-binding-falsification.php' ) . ' 2>&1';
    $output = array();
    $exit_code = 0;
    exec( $command, $output, $exit_code );
    foreach ( $output as $line ) echo $line . "\n";
    if ( 0 !== $exit_code ) {
        throw new RuntimeException( 'Inbox V2 qualification evidence binding falsification failed.' );
    }
}
