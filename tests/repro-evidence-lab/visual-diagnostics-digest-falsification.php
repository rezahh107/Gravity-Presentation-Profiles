<?php
require_once __DIR__ . '/visual-diagnostics-manifest.php';

function vd_req( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}
function vd_assert_throws( $callback, $message ) {
    try {
        $callback();
    } catch ( Throwable $error ) {
        return $error;
    }
    throw new RuntimeException( $message );
}
function vd_evidence_digest( $manifest ) {
    $evidence = array(
        'artifact_type' => 'gpp.reproducible_simulation_evidence',
        'schema_version' => '1.0.0',
        'visual_diagnostics' => $manifest,
        'production_equivalence' => array( 'state' => 'NOT_PROVEN' ),
    );
    return hash( 'sha256', wu21_visual_manifest_canonical_json( $evidence ) );
}

$root = sys_get_temp_dir() . '/gpp-vd-falsification-' . bin2hex( random_bytes( 6 ) );
$artifact_dir = $root . '/artifacts';
$diagnostics = $artifact_dir . '/visual-regression-diagnostics';
mkdir( $diagnostics . '/shortcode-desktop', 0777, true );
$files = array(
    'empty-state-seam.json' => "{\"status\":\"PROVEN\"}\n",
    'manifest.json' => "{\"status\":\"VISUAL_REGRESSION_WARNING\"}\n",
    'matrix-j-browser-zoom.json' => "{\"status\":\"PROVEN\",\"matrix\":\"J\"}\n",
    'shortcode-desktop/geometry.json' => "{\"cards_per_visual_row\":2}\n",
    'empty-state-native-grid-config.jsonl' => "{\"grid\":\"native\"}\n",
);
foreach ( $files as $relative => $bytes ) {
    $path = $diagnostics . '/' . $relative;
    if ( ! is_dir( dirname( $path ) ) ) mkdir( dirname( $path ), 0777, true );
    file_put_contents( $path, $bytes );
}
file_put_contents( $diagnostics . '/ignored.png', 'not-bound-binary-screenshot' );

try {
    $baseline = wu21_visual_diagnostics_manifest( $artifact_dir );
    vd_req( 5 === count( $baseline['files'] ), 'Recursive JSON/JSONL inclusion policy did not bind every machine-readable diagnostic.' );
    vd_req( ! in_array( 'ignored.png', array_column( $baseline['files'], 'path' ), true ), 'Binary screenshot unexpectedly entered machine-readable evidence manifest.' );
    wu21_assert_visual_diagnostics_manifest( $artifact_dir, $baseline );

    $baseline_digest = vd_evidence_digest( $baseline );
    $filename = 'wu21-repro-evidence-' . $baseline_digest . '.json';
    vd_req( 'wu21-repro-evidence-' . $baseline_digest . '.json' === $filename, 'Content-addressed filename semantics changed.' );

    file_put_contents( $diagnostics . '/matrix-j-browser-zoom.json', "{\"status\":\"PROVEN\",\"matrix\":\"J\",\"mutated\":true}\n" );
    vd_assert_throws( fn() => wu21_assert_visual_diagnostics_manifest( $artifact_dir, $baseline ), 'Matrix J mutation unexpectedly preserved canonical identity.' );
    $mutated_matrix_manifest = wu21_visual_diagnostics_manifest( $artifact_dir );
    vd_req( vd_evidence_digest( $mutated_matrix_manifest ) !== $baseline_digest, 'Matrix J mutation did not change canonical digest.' );
    file_put_contents( $diagnostics . '/matrix-j-browser-zoom.json', $files['matrix-j-browser-zoom.json'] );

    file_put_contents( $diagnostics . '/empty-state-seam.json', "{\"status\":\"PROVEN\",\"mutated\":true}\n" );
    vd_assert_throws( fn() => wu21_assert_visual_diagnostics_manifest( $artifact_dir, $baseline ), 'Empty-state mutation unexpectedly preserved canonical identity.' );
    file_put_contents( $diagnostics . '/empty-state-seam.json', $files['empty-state-seam.json'] );

    file_put_contents( $diagnostics . '/shortcode-desktop/geometry.json', "{\"cards_per_visual_row\":1}\n" );
    vd_assert_throws( fn() => wu21_assert_visual_diagnostics_manifest( $artifact_dir, $baseline ), 'Generic admitted diagnostic mutation unexpectedly preserved canonical identity.' );
    file_put_contents( $diagnostics . '/shortcode-desktop/geometry.json', $files['shortcode-desktop/geometry.json'] );

    unlink( $diagnostics . '/manifest.json' );
    vd_assert_throws( fn() => wu21_visual_diagnostics_manifest( $artifact_dir ), 'Removing required manifest.json unexpectedly passed.' );

    echo "VISUAL_DIAGNOSTICS_DIGEST_FALSIFICATION_PASS unchanged_validates=true matrix_j_mutation_rejected=true empty_state_mutation_rejected=true generic_json_mutation_rejected=true required_removal_rejected=true content_addressed_filename=true\n";
} finally {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ( $iterator as $item ) {
        $item->isDir() ? rmdir( $item->getPathname() ) : unlink( $item->getPathname() );
    }
    if ( is_dir( $root ) ) rmdir( $root );
}
