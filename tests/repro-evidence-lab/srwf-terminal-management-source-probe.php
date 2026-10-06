<?php
/**
 * Qualification-only source/runtime probe for native terminal management.
 *
 * This file records bounded evidence from the exact installed Gravity Flow
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
$gf_root   = WP_PLUGIN_DIR . '/gravityforms';
if ( ! is_dir( $flow_root ) || ! is_dir( $gf_root ) ) {
    throw new RuntimeException( 'Pinned Gravity packages are unavailable.' );
}

$flow = get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) );
$gf   = get_file_data( $gf_root . '/gravityforms.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $flow['Version'] || '3.1.1.1' !== (string) $gf['Version'] ) {
    throw new RuntimeException( 'Pinned Gravity package identity changed.' );
}

$needles = array(
    'Admin Actions',
    'gravityflow_admin_actions',
    'restart_workflow',
    'restart workflow',
    'restart_step',
    'restart step',
    'cancel_workflow',
    'cancel workflow',
    'send_to_step',
    'send to step',
    'workflow_detail_status_box',
    'gravityflow-status-box',
    'current_user_can',
    'is_permission_granted',
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
    if ( ! in_array( $ext, array( 'php', 'js' ), true ) ) {
        continue;
    }
    $lines = @file( $file->getPathname(), FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        continue;
    }
    $relative = ltrim( str_replace( $flow_root, '', $file->getPathname() ), '/\\' );
    foreach ( $needles as $needle ) {
        foreach ( $lines as $index => $line ) {
            if ( false === stripos( $line, $needle ) ) {
                continue;
            }
            $start = max( 0, $index - 8 );
            $end   = min( count( $lines ) - 1, $index + 14 );
            $snippet = array();
            for ( $i = $start; $i <= $end; $i++ ) {
                $snippet[] = array( 'line' => $i + 1, 'text' => rtrim( $lines[ $i ] ) );
            }
            $hits[ $needle ][] = array(
                'file' => $relative,
                'line' => $index + 1,
                'snippet' => $snippet,
            );
            if ( count( $hits[ $needle ] ) >= 16 ) {
                break;
            }
        }
    }
}

if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
}
$reflection = array();
foreach ( array( 'Gravity_Flow_Entry_Detail', 'Gravity_Flow_API' ) as $class ) {
    if ( ! class_exists( $class ) ) {
        $reflection[ $class ] = array( 'exists' => false );
        continue;
    }
    $rc = new ReflectionClass( $class );
    $methods = array();
    foreach ( $rc->getMethods() as $method ) {
        if ( $method->getDeclaringClass()->getName() !== $class ) {
            continue;
        }
        if ( ! preg_match( '/admin|action|restart|cancel|send|step|status|process|permission|workflow/i', $method->getName() ) ) {
            continue;
        }
        $methods[] = array(
            'name' => $method->getName(),
            'visibility' => $method->isPublic() ? 'public' : ( $method->isProtected() ? 'protected' : 'private' ),
            'file' => $method->getFileName() ? ltrim( str_replace( $flow_root, '', $method->getFileName() ), '/\\' ) : null,
            'start_line' => $method->getStartLine(),
            'end_line' => $method->getEndLine(),
        );
    }
    $reflection[ $class ] = array(
        'exists' => true,
        'file' => $rc->getFileName() ? ltrim( str_replace( $flow_root, '', $rc->getFileName() ), '/\\' ) : null,
        'methods' => $methods,
    );
}

$admin = get_user_by( 'login', 'bootstrap_admin' );
$negative = get_user_by( 'login', 'srwf_participant' );
if ( ! $admin || ! $negative ) {
    throw new RuntimeException( 'Synthetic qualification users are unavailable.' );
}

$capability_names = array(
    'gravityflow_admin_actions',
    'gravityflow_status_view_all',
    'gravityflow_status_view_own',
    'gravityflow_inbox',
    'gform_full_access',
);
$capability_matrix = array();
foreach ( array( 'admin' => $admin, 'negative_control' => $negative ) as $label => $user ) {
    wp_set_current_user( (int) $user->ID );
    $record = array( 'user_id' => (int) $user->ID );
    foreach ( $capability_names as $capability ) {
        $record[ $capability ] = current_user_can( $capability );
    }
    $capability_matrix[ $label ] = $record;
}
wp_set_current_user( 0 );

$result = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'scope' => 'QUALIFICATION_ONLY',
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => (string) $gf['Version'],
        'gravity_flow' => (string) $flow['Version'],
    ),
    'package_identity' => array(
        'gravity_flow_main_sha256' => hash_file( 'sha256', $flow_root . '/gravityflow.php' ),
    ),
    'source_hits' => $hits,
    'reflection' => $reflection,
    'capability_matrix' => $capability_matrix,
);

wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'srwf-terminal-management-source-probe.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "SRWF_TERMINAL_MANAGEMENT_SOURCE_PROBE_CAPTURED\n";