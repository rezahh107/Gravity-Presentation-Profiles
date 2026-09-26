<?php
require_once __DIR__ . '/visual-diagnostics-manifest.php';
function check( $condition, $message ) { if ( ! $condition ) throw new RuntimeException( $message ); }
function expect_failure( $fn, $label ) {
    try { $fn(); } catch ( Throwable $e ) { return $e->getMessage(); }
    throw new RuntimeException( $label . ' unexpectedly passed.' );
}
function digest_for_manifest( $manifest ) {
    return hash( 'sha256', wu21_visual_manifest_canonical_json( array( 'visual_regression_diagnostics' => $manifest ) ) );
}
function put_json( $path, $data ) {
    $dir = dirname( $path ); if ( ! is_dir( $dir ) ) mkdir( $dir, 0777, true );
    file_put_contents( $path, json_encode( $data, JSON_UNESCAPED_SLASHES ) . "\n" );
}
$root = sys_get_temp_dir() . '/gpp-visual-digest-' . bin2hex( random_bytes( 8 ) );
$visual = $root . '/visual-regression-diagnostics';
mkdir( $visual, 0777, true );
try {
    put_json( $visual . '/manifest.json', array( 'status' => 'VISUAL_REGRESSION_WARNING' ) );
    put_json( $visual . '/matrix-j-browser-zoom.json', array( 'qualification_id' => 'GPP-INBOX-MATRIX-J-BROWSER-ZOOM-V1', 'status' => 'PROVEN' ) );
    put_json( $visual . '/empty-state-seam.json', array( 'qualification_id' => 'GPP-INBOX-EMPTY-STATE-SEAM-V1', 'status' => 'PROVEN' ) );
    put_json( $visual . '/shortcode-desktop/geometry.json', array( 'cards_per_visual_row' => 2 ) );
    file_put_contents( $visual . '/empty-state-native-grid-config.jsonl', "{\"route\":\"shortcode\"}\n" );
    file_put_contents( $visual . '/shortcode-desktop/reference.png', 'supplemental-image-not-bound' );

    $bound = wu21_visual_diagnostics_manifest( $root );
    $baseline_digest = digest_for_manifest( $bound );
    check( count( $bound['files'] ) === 5, 'Inclusion policy did not bind every JSON/JSONL proof file.' );
    wu21_assert_visual_diagnostics_manifest( $root, $bound );

    $mutations = array(
        'matrix-j-browser-zoom.json' => array( 'qualification_id' => 'GPP-INBOX-MATRIX-J-BROWSER-ZOOM-V1', 'status' => 'MUTATED' ),
        'empty-state-seam.json' => array( 'qualification_id' => 'GPP-INBOX-EMPTY-STATE-SEAM-V1', 'status' => 'MUTATED' ),
        'shortcode-desktop/geometry.json' => array( 'cards_per_visual_row' => 1 ),
    );
    foreach ( $mutations as $relative => $changed ) {
        $path = $visual . '/' . $relative;
        $original = file_get_contents( $path );
        put_json( $path, $changed );
        expect_failure( function () use ( $root, $bound ) { wu21_assert_visual_diagnostics_manifest( $root, $bound ); }, 'Mutation ' . $relative );
        $changed_manifest = wu21_visual_diagnostics_manifest( $root );
        check( ! hash_equals( $baseline_digest, digest_for_manifest( $changed_manifest ) ), 'Mutation did not change canonical identity: ' . $relative );
        file_put_contents( $path, $original );
        wu21_assert_visual_diagnostics_manifest( $root, $bound );
    }

    put_json( $visual . '/shortcode-desktop/new-proof.json', array( 'new' => true ) );
    expect_failure( function () use ( $root, $bound ) { wu21_assert_visual_diagnostics_manifest( $root, $bound ); }, 'New admitted machine-readable proof' );
    check( ! hash_equals( $baseline_digest, digest_for_manifest( wu21_visual_diagnostics_manifest( $root ) ) ), 'New admitted proof file did not change canonical identity.' );
    unlink( $visual . '/shortcode-desktop/new-proof.json' );
    wu21_assert_visual_diagnostics_manifest( $root, $bound );

    unlink( $visual . '/manifest.json' );
    expect_failure( function () use ( $root ) { wu21_visual_diagnostics_manifest( $root ); }, 'Required proof removal' );
    put_json( $visual . '/manifest.json', array( 'status' => 'VISUAL_REGRESSION_WARNING' ) );
    wu21_assert_visual_diagnostics_manifest( $root, $bound );

    $filename = 'wu21-repro-evidence-' . $baseline_digest . '.json';
    check( $filename === 'wu21-repro-evidence-' . digest_for_manifest( $bound ) . '.json', 'Content-addressed filename did not match recomputed canonical digest.' );
    echo "VISUAL_DIAGNOSTICS_DIGEST_FALSIFICATION_PASS unchanged_validates=true matrix_mutation_fails=true empty_mutation_fails=true generic_admitted_file_mutation_fails=true admitted_file_addition_fails=true required_removal_fails=true content_addressed_filename_matches=true\n";
} finally {
    $it = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
    foreach ( $it as $item ) { $item->isDir() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() ); }
    @rmdir( $root );
}
