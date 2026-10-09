<?php
/**
 * MR-3 qualification-only: pinned native approval event/note source inventory.
 * Never loaded by production plugin. No source content is modified.
 */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$root = WP_PLUGIN_DIR . '/gravityflow';
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_readable( $root . '/gravityflow.php' ) ) {
    throw new RuntimeException( 'MR3_PINNED_HOST_MISSING' );
}
$meta = get_file_data( $root . '/gravityflow.php', array( 'version' => 'Version' ) );
if ( '3.1.0' !== (string) $meta['version'] ) { throw new RuntimeException( 'MR3_PINNED_VERSION_DRIFT' ); }
$files = array(
    'approval_php' => 'includes/steps/class-step-approval.php',
    'entry_detail_php' => 'includes/pages/class-entry-detail.php',
    'confirmation_js' => 'js/inbox.js',
);
$terms = array(
    'approval_php' => array( 'gravityflow_note', 'note_mode', 'required_if_rejected', 'gravityflow_above_approval_buttons', 'gravityflow_approval_note_label_workflow_detail', 'gravityflow_approval_new_status_step_', 'handleApprovalStepButtonClick', 'add_note', 'add_timeline_note' ),
    'entry_detail_php' => array( 'gravityflow_note', 'workflow_detail_status_box_actions', 'gravityflow_approval_new_status_step_', 'can_update' ),
    'confirmation_js' => array( 'handleApprovalStepButtonClick', 'confirm(', 'gravityflow_note', 'form.submit', 'return false' ),
);
$records = array();
foreach ( $files as $id => $relative ) {
    $path = $root . '/' . $relative;
    if ( ! is_readable( $path ) ) { throw new RuntimeException( 'MR3_SOURCE_NOT_READABLE:' . $relative ); }
    $lines = file( $path, FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) { throw new RuntimeException( 'MR3_SOURCE_READ_ERROR:' . $relative ); }
    $hits = array();
    foreach ( $terms[ $id ] as $term ) {
        $locations = array();
        foreach ( $lines as $index => $line ) {
            if ( false !== stripos( $line, $term ) ) {
                $locations[] = array(
                    'line' => $index + 1,
                    'context' => array_values( array_slice( $lines, max( 0, $index - 3 ), 9 ) ),
                );
                if ( count( $locations ) === 12 ) { break; }
            }
        }
        $hits[ $term ] = $locations;
    }
    $records[ $id ] = array(
        'path' => $relative, 'sha256' => hash_file( 'sha256', $path ),
        'line_count' => count( $lines ), 'matches' => $hits,
    );
}
$manifest = get_option( 'gpp_srwf_journey_host_manifest' );
$review = is_array( $manifest ) && ! empty( $manifest['form_id'] ) && ! empty( $manifest['steps']['review_id'] )
    ? ( new Gravity_Flow_API( (int) $manifest['form_id'] ) )->get_step( (int) $manifest['steps']['review_id'] ) : null;
$effective = $review ? $review->get_feed_meta() : array();
$result = array(
    'classification' => 'PINNED_SOURCE_SNAPSHOT_NOT_RUNTIME_ADMISSION',
    'host_version' => (string) $meta['version'],
    'host_main_sha256' => hash_file( 'sha256', $root . '/gravityflow.php' ),
    'fixture_note_mode' => rgar( $effective, 'note_mode' ),
    'fixture_confirmation_prompt' => rgar( $effective, 'confirmation_prompt' ),
    'files' => $records,
);
wp_mkdir_p( $artifact_dir );
file_put_contents( trailingslashit( $artifact_dir ) . 'srwf-mr3-source-contract.json', wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . "\n" );
echo "SRWF_MR3_PINNED_SOURCE_CAPTURED\n";
