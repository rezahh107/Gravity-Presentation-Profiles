<?php
/**
 * Evidence only: inspect exact installed native Gravity Flow Save Progress source.
 * This file never updates the step, entry, filter or production code.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$root = WP_PLUGIN_DIR . '/gravityflow';
$artifacts = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_dir( $root ) || ! is_dir( $artifacts ) ) {
    throw new RuntimeException( 'Pinned source/artifact boundary unavailable.' );
}
$version = get_file_data( $root . '/gravityflow.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $version['Version'] ) {
    throw new RuntimeException( 'Gravity Flow 3.1.0 pin mismatch.' );
}
$files = array(
    'includes/steps/class-step-user-input.php',
    'includes/pages/class-entry-detail.php',
);
$report = array(
    'gravity_flow_version' => $version['Version'],
    'gravity_forms_version' => defined( 'GFForms::version' ) ? GFForms::version : ( defined( 'GF_VERSION' ) ? GF_VERSION : null ),
    'files' => array(),
);
foreach ( $files as $path ) {
    $absolute = $root . '/' . $path;
    if ( ! is_file( $absolute ) ) {
        throw new RuntimeException( 'Pinned host source missing: ' . $path );
    }
    $lines = file( $absolute, FILE_IGNORE_NEW_LINES );
    $hits = array();
    foreach ( $lines as $i => $line ) {
        if ( false === stripos( $line, 'save_progress' )
            && false === stripos( $line, 'save progress' )
            && false === stripos( $line, 'submit_buttons' )
            && false === stripos( $line, 'submit buttons' ) ) {
            continue;
        }
        $context = array();
        for ( $j = max( 0, $i - 8 ); $j <= min( count( $lines ) - 1, $i + 9 ); $j++ ) {
            $context[] = array( 'line' => $j + 1, 'source' => $lines[$j] );
        }
        $hits[] = array( 'line' => $i + 1, 'context' => $context );
    }
    $report['files'][$path] = array( 'sha256' => hash_file( 'sha256', $absolute ), 'matches' => $hits );
}
$file = $artifacts . '/srwf-pr149-save-progress-source.json';
file_put_contents( $file, wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
echo 'PR149_NATIVE_SAVE_PROGRESS_SOURCE_CAPTURED source_matches=' . array_sum( array_map( static function( $x ) { return count( $x['matches'] ); }, $report['files'] ) ) . PHP_EOL;
