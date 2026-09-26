<?php
/**
 * Qualification-only source/runtime inventory for the Owner-approved SRWF
 * operator journey. This file records host capabilities from the pinned
 * Gravity Flow package; it does not change workflow/product semantics.
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

$flow_version = (string) get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) )['Version'];
$gf_version   = (string) get_file_data( $gf_root . '/gravityforms.php', array( 'Version' => 'Version' ) )['Version'];
if ( '3.1.0' !== $flow_version || '3.1.1.1' !== $gf_version ) {
    throw new RuntimeException( 'Pinned Gravity host identity changed.' );
}

$user_input_file = $flow_root . '/includes/steps/class-step-user-input.php';
if ( ! class_exists( 'Gravity_Flow_Step_User_Input' ) && is_readable( $user_input_file ) ) {
    require_once $user_input_file;
}

$source_for_method = static function ( $class, $method ) use ( $flow_root ) {
    if ( ! class_exists( $class ) ) {
        return array( 'exists' => false, 'class' => $class, 'method' => $method );
    }
    $rc = new ReflectionClass( $class );
    if ( ! $rc->hasMethod( $method ) ) {
        return array( 'exists' => false, 'class' => $class, 'method' => $method );
    }
    $rm = $rc->getMethod( $method );
    $file = $rm->getFileName();
    if ( ! is_string( $file ) || ! is_readable( $file ) ) {
        return array( 'exists' => true, 'source_readable' => false, 'class' => $class, 'method' => $method );
    }
    $lines = file( $file, FILE_IGNORE_NEW_LINES );
    $body = array();
    for ( $line = $rm->getStartLine(); $line <= $rm->getEndLine(); $line++ ) {
        if ( isset( $lines[ $line - 1 ] ) ) {
            $body[] = array( 'line' => $line, 'text' => rtrim( $lines[ $line - 1 ] ) );
        }
    }
    return array(
        'exists' => true,
        'source_readable' => true,
        'class' => $class,
        'method' => $method,
        'declaring_class' => $rm->getDeclaringClass()->getName(),
        'visibility' => $rm->isPublic() ? 'public' : ( $rm->isProtected() ? 'protected' : 'private' ),
        'file' => ltrim( str_replace( $flow_root, '', $file ), '/\\' ),
        'start_line' => $rm->getStartLine(),
        'end_line' => $rm->getEndLine(),
        'body' => $body,
    );
};

$method_names = array(
    'Gravity_Flow_Step_Approval' => array(
        'get_status_config',
        'get_settings',
        'maybe_process_status_update',
        'process_assignee_status',
        'process_revert_status',
        'status_evaluation',
        'update_status',
        'maybe_perform_post_action',
        'workflow_detail_status_box_actions',
    ),
    'Gravity_Flow_Step_User_Input' => array(
        'get_status_config',
        'get_settings',
        'process',
        'workflow_detail_status_box_actions',
        'entry_detail_status_box',
    ),
    'Gravity_Flow_Step' => array(
        'get_status_config',
        'get_destination',
        'get_next_step',
        'process',
        'end',
    ),
    'Gravity_Flow_API' => array(
        'get_current_step',
        'get_status',
        'get_timeline',
        'process_workflow',
        'send_to_step',
    ),
    'Gravity_Flow_Entry_Detail' => array(
        'entry_detail',
        'maybe_display_back_link',
        'can_update',
    ),
);

$methods = array();
foreach ( $method_names as $class => $names ) {
    foreach ( $names as $name ) {
        $methods[ $class . '::' . $name ] = $source_for_method( $class, $name );
    }
}

$class_methods = array();
foreach ( array( 'Gravity_Flow_Step_Approval', 'Gravity_Flow_Step_User_Input', 'Gravity_Flow_Step' ) as $class ) {
    if ( ! class_exists( $class ) ) {
        $class_methods[ $class ] = array( 'exists' => false );
        continue;
    }
    $rc = new ReflectionClass( $class );
    $items = array();
    foreach ( $rc->getMethods() as $rm ) {
        if ( $rm->getDeclaringClass()->getName() !== $class ) {
            continue;
        }
        $items[] = array(
            'name' => $rm->getName(),
            'visibility' => $rm->isPublic() ? 'public' : ( $rm->isProtected() ? 'protected' : 'private' ),
            'file' => $rm->getFileName() ? ltrim( str_replace( $flow_root, '', $rm->getFileName() ), '/\\' ) : null,
            'start_line' => $rm->getStartLine(),
            'end_line' => $rm->getEndLine(),
        );
    }
    usort( $items, static function ( $a, $b ) { return strcmp( $a['name'], $b['name'] ); } );
    $class_methods[ $class ] = array( 'exists' => true, 'methods' => $items );
}

$needles = array(
    'confirmation_prompt',
    'handleApprovalStepButtonClick',
    'gravityflow_approval_new_status_step_',
    'gravityflow_approvals_',
    'revertEnable',
    'revert',
    'destination_approved',
    'destination_rejected',
    'destination_revert',
    'next_step',
    'workflow_final_status',
    'gravityflow_back_link_url_entry_detail',
);
$occurrences = array();
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator( $flow_root, FilesystemIterator::SKIP_DOTS )
);
foreach ( $iterator as $file ) {
    if ( ! $file->isFile() || ! in_array( strtolower( $file->getExtension() ), array( 'php', 'js' ), true ) ) {
        continue;
    }
    $lines = @file( $file->getPathname(), FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        continue;
    }
    $relative = ltrim( str_replace( $flow_root, '', $file->getPathname() ), '/\\' );
    foreach ( $lines as $index => $line ) {
        foreach ( $needles as $needle ) {
            if ( false === strpos( $line, $needle ) ) {
                continue;
            }
            if ( count( $occurrences[ $needle ] ?? array() ) >= 30 ) {
                continue;
            }
            $start = max( 0, $index - 5 );
            $end = min( count( $lines ) - 1, $index + 12 );
            $snippet = array();
            for ( $i = $start; $i <= $end; $i++ ) {
                $snippet[] = array( 'line' => $i + 1, 'text' => rtrim( $lines[ $i ] ) );
            }
            $occurrences[ $needle ][] = array(
                'file' => $relative,
                'line' => $index + 1,
                'snippet' => $snippet,
            );
        }
    }
}

$inventory = array(
    'schema_version' => '1.0.0',
    'evidence_class' => 'PINNED_SOURCE_AND_RUNTIME_INVENTORY',
    'qualification_only' => true,
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => $gf_version,
        'gravity_flow' => $flow_version,
        'gravity_flow_package_sha256' => hash_file( 'sha256', $flow_root . '/gravityflow.php' ),
    ),
    'methods' => $methods,
    'class_methods' => $class_methods,
    'occurrences' => $occurrences,
);

wp_mkdir_p( $artifact_dir );
$standalone = trailingslashit( $artifact_dir ) . 'wu18-operator-journey-source-capabilities.json';
file_put_contents( $standalone, wp_json_encode( $inventory, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );

$runtime_results = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$existing = is_file( $runtime_results ) ? json_decode( file_get_contents( $runtime_results ), true ) : array();
if ( ! is_array( $existing ) ) {
    $existing = array();
}
$existing['operator_journey_source_capabilities'] = $inventory;
file_put_contents( $runtime_results, wp_json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );

echo "WU18_OPERATOR_JOURNEY_SOURCE_QUALIFICATION_PASS\n";
