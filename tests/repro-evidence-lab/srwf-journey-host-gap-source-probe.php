<?php
/**
 * Qualification-only source probe for the SRWF operator-journey gap-closure pass.
 *
 * The probe records bounded source evidence from the exact installed Gravity Flow
 * package. It does not mutate workflow, entry or presentation state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}

$flow_root = WP_PLUGIN_DIR . '/gravityflow';
if ( ! is_dir( $flow_root ) ) {
    throw new RuntimeException( 'Pinned Gravity Flow package is unavailable.' );
}

$flow = get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $flow['Version'] ) {
    throw new RuntimeException( 'Pinned Gravity Flow package identity changed.' );
}

$needles = array(
    // Inbox Settings / browser notifications.
    'gflow-grid__button--settings',
    'Notification.requestPermission',
    'Notification.permission',
    'localStorage',
    'sessionStorage',
    'notifications',
    'notification',
    'permission',
    // Approval note/action sequencing.
    'workflow_detail_status_box_actions',
    'gravityflow_note',
    'note_mode',
    'required_if_rejected',
    'handleApprovalStepButtonClick',
    'validate_status_update',
    // Native Print permission/request lifecycle.
    'gravityflow_print_entries',
    'print_entries',
    'is_permission_granted',
    'gravityflow_print_entry_footer',
    // Entry Detail lifecycle / User Input ownership.
    'gform_pre_render',
    'get_editable_fields',
    'is_display_field',
    'gravityflow_entry_detail_content_before',
    // Inbox pager/AG Grid host geometry clues.
    'ag-paging-panel',
    'pagination',
);

$hits = array_fill_keys( $needles, array() );
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator( $flow_root, FilesystemIterator::SKIP_DOTS )
);

foreach ( $iterator as $file ) {
    if ( ! $file->isFile() ) {
        continue;
    }
    $ext = strtolower( $file->getExtension() );
    if ( ! in_array( $ext, array( 'php', 'js', 'css' ), true ) ) {
        continue;
    }
    $lines = @file( $file->getPathname(), FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        continue;
    }
    $relative = ltrim( str_replace( $flow_root, '', $file->getPathname() ), '/\\' );
    foreach ( $needles as $needle ) {
        $count = 0;
        foreach ( $lines as $index => $line ) {
            if ( false === stripos( $line, $needle ) ) {
                continue;
            }
            $start = max( 0, $index - 6 );
            $end = min( count( $lines ) - 1, $index + 12 );
            $snippet = array();
            for ( $i = $start; $i <= $end; $i++ ) {
                $snippet[] = array( 'line' => $i + 1, 'text' => rtrim( $lines[ $i ] ) );
            }
            $hits[ $needle ][] = array(
                'file' => $relative,
                'line' => $index + 1,
                'snippet' => $snippet,
            );
            $count++;
            if ( $count >= 40 ) {
                break;
            }
        }
    }
}

$result = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SOURCE_ONLY_NO_PII',
    'scope' => 'QUALIFICATION_ONLY',
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_flow' => (string) $flow['Version'],
    ),
    'package_identity' => array(
        'gravity_flow_main_sha256' => hash_file( 'sha256', $flow_root . '/gravityflow.php' ),
    ),
    'source_hits' => $hits,
);

wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'srwf-journey-host-gap-source-probe.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "SRWF_JOURNEY_HOST_GAP_SOURCE_PROBE_PASS\n";
