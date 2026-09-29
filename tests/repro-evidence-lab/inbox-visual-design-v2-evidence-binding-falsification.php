<?php
$repo = dirname( __DIR__, 2 );
$source_dir = getenv( 'WU21_ARTIFACT_DIR' );
$repository_head = getenv( 'GPP_WU21_REPOSITORY_SHA' );
if ( ! $source_dir || ! is_dir( $source_dir ) ) {
    fwrite( STDERR, "WU21_ARTIFACT_DIR required\n" );
    exit( 1 );
}
if ( ! is_string( $repository_head ) || 1 !== preg_match( '/^[0-9a-f]{40}$/', $repository_head ) ) {
    fwrite( STDERR, "GPP_WU21_REPOSITORY_SHA required\n" );
    exit( 1 );
}

function fail_test( $message ) {
    throw new RuntimeException( $message );
}
function assert_test( $condition, $message ) {
    if ( ! $condition ) fail_test( $message );
}
function read_fixture_json( $path ) {
    if ( ! is_file( $path ) ) fail_test( 'Missing fixture file: ' . $path );
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) fail_test( 'Invalid fixture JSON: ' . $path );
    return $data;
}
function write_fixture_json( $path, $data ) {
    $encoded = json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
    if ( false === $encoded || false === file_put_contents( $path, $encoded . "\n" ) ) {
        fail_test( 'Unable to write fixture JSON: ' . $path );
    }
}
function canonicalize_fixture( $value ) {
    if ( ! is_array( $value ) ) return $value;
    $is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
    if ( $is_list ) return array_map( 'canonicalize_fixture', $value );
    ksort( $value, SORT_STRING );
    foreach ( $value as $key => $item ) $value[ $key ] = canonicalize_fixture( $item );
    return $value;
}
function canonical_fixture_json( $value ) {
    return json_encode( canonicalize_fixture( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}
function remove_tree( $path ) {
    if ( ! file_exists( $path ) ) return;
    if ( is_file( $path ) || is_link( $path ) ) {
        unlink( $path );
        return;
    }
    $items = scandir( $path );
    if ( false === $items ) fail_test( 'Unable to scan temporary tree: ' . $path );
    foreach ( $items as $item ) {
        if ( '.' === $item || '..' === $item ) continue;
        remove_tree( $path . DIRECTORY_SEPARATOR . $item );
    }
    rmdir( $path );
}
function copy_tree( $source, $destination ) {
    if ( is_link( $source ) ) fail_test( 'Refusing symlink in falsification fixture: ' . $source );
    if ( is_file( $source ) ) {
        $parent = dirname( $destination );
        if ( ! is_dir( $parent ) && ! mkdir( $parent, 0777, true ) && ! is_dir( $parent ) ) fail_test( 'Unable to create fixture directory: ' . $parent );
        if ( ! copy( $source, $destination ) ) fail_test( 'Unable to copy fixture file: ' . $source );
        return;
    }
    if ( ! is_dir( $destination ) && ! mkdir( $destination, 0777, true ) && ! is_dir( $destination ) ) fail_test( 'Unable to create fixture directory: ' . $destination );
    $items = scandir( $source );
    if ( false === $items ) fail_test( 'Unable to scan source fixture: ' . $source );
    foreach ( $items as $item ) {
        if ( '.' === $item || '..' === $item ) continue;
        copy_tree( $source . DIRECTORY_SEPARATOR . $item, $destination . DIRECTORY_SEPARATOR . $item );
    }
}
function make_fixture( $source_dir, $root, $name ) {
    $target = $root . DIRECTORY_SEPARATOR . $name;
    copy_tree( $source_dir, $target );
    return $target;
}
function run_php_check( $script, $artifact_dir, $repository_head, $expect_success, $expected_fragment = null ) {
    $command = 'WU21_ARTIFACT_DIR=' . escapeshellarg( $artifact_dir )
        . ' GPP_WU21_REPOSITORY_SHA=' . escapeshellarg( $repository_head )
        . ' php ' . escapeshellarg( $script ) . ' 2>&1';
    $output = array();
    $code = 0;
    exec( $command, $output, $code );
    $text = implode( "\n", $output );
    if ( $expect_success && 0 !== $code ) {
        fail_test( basename( $script ) . ' unexpectedly failed: ' . $text );
    }
    if ( ! $expect_success && 0 === $code ) {
        fail_test( basename( $script ) . ' unexpectedly passed.' );
    }
    if ( null !== $expected_fragment && false === strpos( $text, $expected_fragment ) ) {
        fail_test( basename( $script ) . ' did not fail at the expected boundary. Expected fragment: ' . $expected_fragment . '; output: ' . $text );
    }
    return array( 'exit_code' => $code, 'output' => $text );
}
function set_browser_adjunct( $dir, $qualification ) {
    $path = $dir . '/browser-results.json';
    $browser = read_fixture_json( $path );
    $browser['inbox_visual_design_v2_qualification'] = $qualification;
    write_fixture_json( $path, $browser );
}
function master_evidence( $dir ) {
    $path_file = $dir . '/evidence-path.txt';
    if ( ! is_file( $path_file ) ) fail_test( 'Missing evidence-path.txt in fixture.' );
    $filename = trim( file_get_contents( $path_file ) );
    return read_fixture_json( $dir . '/' . $filename );
}
function expected_test_ids() {
    return array_merge(
        array_map( function ( $i ) { return sprintf( 'WU21-PHP-%03d', $i ); }, range( 1, 17 ) ),
        array_map( function ( $i ) { return sprintf( 'WU21-BROWSER-%03d', $i ); }, range( 1, 7 ) )
    );
}
function assert_test_ids( $master ) {
    $actual = array_map( function ( $test ) { return $test['id'] ?? null; }, $master['tests'] ?? array() );
    $expected = expected_test_ids();
    sort( $actual, SORT_STRING );
    sort( $expected, SORT_STRING );
    assert_test( $actual === $expected, 'Canonical WU21 PHP/browser result ID set changed.' );
}

$validator = $repo . '/tests/repro-evidence-lab/validate-evidence.php';
$builder = $repo . '/tests/repro-evidence-lab/build-evidence.php';
$qualification_path = $source_dir . '/inbox-visual-design-v2-qualification-evidence.json';
$qualification = read_fixture_json( $qualification_path );
$browser = read_fixture_json( $source_dir . '/browser-results.json' );
$master = master_evidence( $source_dir );
$baseline_filename = trim( file_get_contents( $source_dir . '/evidence-path.txt' ) );
$qualification_sha256 = hash_file( 'sha256', $qualification_path );
assert_test( false !== $qualification_sha256, 'Unable to hash baseline qualification evidence.' );
assert_test( 'FAIL' === ( $qualification['qualifications']['q1']['status'] ?? null ), 'Expected captured Q1 FAIL disposition was not preserved.' );
assert_test( 'CAPTURED' === ( $qualification['qualifications']['q1']['execution_status'] ?? null ), 'Baseline Q1 capture is incomplete.' );
assert_test( 'PASS' === ( $qualification['qualifications']['q2']['status'] ?? null ), 'Expected captured Q2 PASS disposition was not preserved.' );
assert_test( 'CAPTURED' === ( $qualification['qualifications']['q2']['execution_status'] ?? null ), 'Baseline Q2 capture is incomplete.' );
assert_test(
    hash_equals(
        hash( 'sha256', canonical_fixture_json( $qualification ) ),
        hash( 'sha256', canonical_fixture_json( $browser['inbox_visual_design_v2_qualification'] ?? null ) )
    ),
    'Baseline standalone/browser qualification evidence is not semantically identical.'
);
assert_test_ids( $master );
$baseline_digest = $master['content_digest']['value'] ?? null;
assert_test( is_string( $baseline_digest ) && 64 === strlen( $baseline_digest ), 'Baseline master digest unavailable.' );
$expected_ref = 'inbox-visual-design-v2-qualification-sha256:' . $qualification_sha256;
assert_test( in_array( $expected_ref, $master['evidence_refs'] ?? array(), true ), 'Baseline master evidence does not bind qualification SHA-256.' );
$baseline = run_php_check( $validator, $source_dir, $repository_head, true );

$temp_root = sys_get_temp_dir() . '/wu21-qualification-binding-' . bin2hex( random_bytes( 8 ) );
if ( ! mkdir( $temp_root, 0777, true ) && ! is_dir( $temp_root ) ) fail_test( 'Unable to create falsification root.' );
$results = array();
try {
    $dir = make_fixture( $source_dir, $temp_root, 'qualification-byte-mutation' );
    $q = read_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $q['qualifications']['q1']['flags']['rich_html_rendered'] = ! ( $q['qualifications']['q1']['flags']['rich_html_rendered'] ?? false );
    write_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json', $q );
    set_browser_adjunct( $dir, $q );
    $results['qualification_byte_mutation'] = run_php_check( $validator, $dir, $repository_head, false, 'qualification SHA-256 binding mismatch' );

    $dir = make_fixture( $source_dir, $temp_root, 'browser-adjunct-divergence' );
    $b = read_fixture_json( $dir . '/browser-results.json' );
    $b['inbox_visual_design_v2_qualification']['qualifications']['q1']['flags']['svg_rendered'] = ! ( $b['inbox_visual_design_v2_qualification']['qualifications']['q1']['flags']['svg_rendered'] ?? false );
    write_fixture_json( $dir . '/browser-results.json', $b );
    $results['browser_adjunct_divergence'] = run_php_check( $validator, $dir, $repository_head, false, 'standalone/browser qualification evidence diverged' );

    $dir = make_fixture( $source_dir, $temp_root, 'missing-qualification' );
    unlink( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $results['missing_qualification'] = run_php_check( $validator, $dir, $repository_head, false, 'Missing required evidence input' );

    $dir = make_fixture( $source_dir, $temp_root, 'stale-head' );
    $q = read_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $q['repository']['exact_head'] = str_repeat( '0', 40 );
    write_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json', $q );
    set_browser_adjunct( $dir, $q );
    $results['stale_head'] = run_php_check( $validator, $dir, $repository_head, false, 'qualification exact_head mismatch' );

    $dir = make_fixture( $source_dir, $temp_root, 'runtime-mismatch' );
    $q = read_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $q['runtime']['gravity_flow'] = '0.0.0-falsified';
    write_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json', $q );
    set_browser_adjunct( $dir, $q );
    $results['runtime_mismatch'] = run_php_check( $validator, $dir, $repository_head, false, 'runtime identity mismatch: gravity_flow' );

    $dir = make_fixture( $source_dir, $temp_root, 'invalid-disposition' );
    $q = read_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $q['qualifications']['q1']['status'] = 'UNKNOWN';
    write_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json', $q );
    set_browser_adjunct( $dir, $q );
    $results['invalid_disposition'] = run_php_check( $builder, $dir, $repository_head, false, 'qualification q1 disposition is invalid' );

    $dir = make_fixture( $source_dir, $temp_root, 'incomplete-capture' );
    $q = read_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $q['qualifications']['q1']['execution_status'] = 'NOT_CAPTURED';
    write_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json', $q );
    set_browser_adjunct( $dir, $q );
    $results['incomplete_capture'] = run_php_check( $builder, $dir, $repository_head, false, 'qualification q1 capture incomplete' );

    $dir = make_fixture( $source_dir, $temp_root, 'captured-not-proven' );
    $q = read_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    $q['qualifications']['q1']['status'] = 'NOT_PROVEN';
    write_fixture_json( $dir . '/inbox-visual-design-v2-qualification-evidence.json', $q );
    set_browser_adjunct( $dir, $q );
    $not_proven_qualification_sha256 = hash_file( 'sha256', $dir . '/inbox-visual-design-v2-qualification-evidence.json' );
    assert_test( false !== $not_proven_qualification_sha256 && $not_proven_qualification_sha256 !== $qualification_sha256, 'NOT_PROVEN qualification mutation did not change qualification SHA-256.' );
    $results['not_proven_rebuild'] = run_php_check( $builder, $dir, $repository_head, true );
    $not_proven_master = master_evidence( $dir );
    $not_proven_digest = $not_proven_master['content_digest']['value'] ?? null;
    $not_proven_filename = trim( file_get_contents( $dir . '/evidence-path.txt' ) );
    assert_test( is_string( $not_proven_digest ) && $not_proven_digest !== $baseline_digest, 'Rebuilding CAPTURED+NOT_PROVEN evidence did not change the canonical content digest.' );
    assert_test( $not_proven_filename !== $baseline_filename, 'Rebuilding CAPTURED+NOT_PROVEN evidence did not change the content-addressed filename.' );
    assert_test( 'wu21-repro-evidence-' . $not_proven_digest . '.json' === $not_proven_filename, 'CAPTURED+NOT_PROVEN rebuild filename is not content-addressed by the rebuilt digest.' );
    assert_test(
        in_array( 'inbox-visual-design-v2-qualification-sha256:' . $not_proven_qualification_sha256, $not_proven_master['evidence_refs'] ?? array(), true ),
        'CAPTURED+NOT_PROVEN rebuilt master does not bind its qualification SHA-256.'
    );
    assert_test_ids( $not_proven_master );
    $results['not_proven_validation'] = run_php_check( $validator, $dir, $repository_head, true );

    $summary = array(
        'status' => 'PASS',
        'qualification_sha256' => $qualification_sha256,
        'baseline_digest' => $baseline_digest,
        'standalone_browser_semantic_equality' => true,
        'baseline_q1_fail_accepted' => 'FAIL' === $qualification['qualifications']['q1']['status'] && 0 === $baseline['exit_code'],
        'baseline_q2_pass_accepted' => 'PASS' === $qualification['qualifications']['q2']['status'] && 0 === $baseline['exit_code'],
        'captured_not_proven_accepted' => 0 === $results['not_proven_rebuild']['exit_code'] && 0 === $results['not_proven_validation']['exit_code'],
        'not_proven_qualification_sha256' => $not_proven_qualification_sha256,
        'not_proven_digest' => $not_proven_digest,
        'not_proven_content_addressed_filename' => $not_proven_filename,
        'not_proven_rebuild_digest_changed' => $not_proven_digest !== $baseline_digest,
        'not_proven_rebuild_filename_changed' => $not_proven_filename !== $baseline_filename,
        'qualification_byte_mutation_rejected' => 0 !== $results['qualification_byte_mutation']['exit_code'],
        'browser_adjunct_divergence_rejected' => 0 !== $results['browser_adjunct_divergence']['exit_code'],
        'missing_qualification_rejected' => 0 !== $results['missing_qualification']['exit_code'],
        'stale_head_rejected' => 0 !== $results['stale_head']['exit_code'],
        'runtime_mismatch_rejected' => 0 !== $results['runtime_mismatch']['exit_code'],
        'invalid_disposition_rejected_by_builder' => 0 !== $results['invalid_disposition']['exit_code'],
        'incomplete_capture_rejected_by_builder' => 0 !== $results['incomplete_capture']['exit_code'],
        'canonical_test_id_set_unchanged' => true,
    );
    echo json_encode( $summary, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
    echo "PASS Inbox V2 qualification disposition/provenance falsification qualification_sha256={$qualification_sha256} baseline_digest={$baseline_digest} not_proven_sha256={$not_proven_qualification_sha256} not_proven_digest={$not_proven_digest}\n";
} finally {
    remove_tree( $temp_root );
}
