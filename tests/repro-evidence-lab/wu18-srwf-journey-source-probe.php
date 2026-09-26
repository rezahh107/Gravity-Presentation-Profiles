<?php
/**
 * Qualification-only exact-source probe for the Owner-approved SRWF operator journey.
 * No product behavior is changed; this records bounded Gravity Flow 3.1.0 source facts.
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
    throw new RuntimeException( 'Pinned Gravity Flow source is unavailable.' );
}
$version = get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) ( $version['Version'] ?? '' ) ) {
    throw new RuntimeException( 'Expected exact Gravity Flow 3.1.0 qualification fixture.' );
}

$requires = array(
    $flow_root . '/includes/steps/class-step.php',
    $flow_root . '/includes/steps/class-step-approval.php',
    $flow_root . '/includes/steps/class-step-user-input.php',
    $flow_root . '/includes/pages/class-entry-detail.php',
);
foreach ( $requires as $file ) {
    if ( is_file( $file ) ) {
        require_once $file;
    }
}

$method_source = static function ( $class, $method ) use ( $flow_root ) {
    if ( ! class_exists( $class ) ) {
        return array( 'class_exists' => false );
    }
    $rc = new ReflectionClass( $class );
    if ( ! $rc->hasMethod( $method ) ) {
        return array( 'class_exists' => true, 'method_exists' => false );
    }
    $rm = $rc->getMethod( $method );
    $file = $rm->getFileName();
    if ( ! is_string( $file ) || ! is_readable( $file ) ) {
        return array( 'class_exists' => true, 'method_exists' => true, 'source_available' => false );
    }
    $lines = file( $file, FILE_IGNORE_NEW_LINES );
    $body = array();
    for ( $line = $rm->getStartLine(); $line <= $rm->getEndLine(); $line++ ) {
        if ( isset( $lines[ $line - 1 ] ) ) {
            $body[] = array( 'line' => $line, 'text' => rtrim( $lines[ $line - 1 ] ) );
        }
    }
    return array(
        'class_exists' => true,
        'method_exists' => true,
        'source_available' => true,
        'file' => ltrim( str_replace( $flow_root, '', $file ), '/\\' ),
        'start_line' => $rm->getStartLine(),
        'end_line' => $rm->getEndLine(),
        'body' => $body,
    );
};

$methods = array(
    'Gravity_Flow_Step_Approval::get_settings' => array( 'Gravity_Flow_Step_Approval', 'get_settings' ),
    'Gravity_Flow_Step_Approval::maybe_process_status_update' => array( 'Gravity_Flow_Step_Approval', 'maybe_process_status_update' ),
    'Gravity_Flow_Step_Approval::process_assignee_status' => array( 'Gravity_Flow_Step_Approval', 'process_assignee_status' ),
    'Gravity_Flow_Step_Approval::process_revert_status' => array( 'Gravity_Flow_Step_Approval', 'process_revert_status' ),
    'Gravity_Flow_Step_Approval::get_status_update_feedback' => array( 'Gravity_Flow_Step_Approval', 'get_status_update_feedback' ),
    'Gravity_Flow_Step_Approval::workflow_detail_status_box_actions' => array( 'Gravity_Flow_Step_Approval', 'workflow_detail_status_box_actions' ),
    'Gravity_Flow_Step_User_Input::get_settings' => array( 'Gravity_Flow_Step_User_Input', 'get_settings' ),
    'Gravity_Flow_Step_User_Input::maybe_process_status_update' => array( 'Gravity_Flow_Step_User_Input', 'maybe_process_status_update' ),
    'Gravity_Flow_Step_User_Input::process_assignee_status' => array( 'Gravity_Flow_Step_User_Input', 'process_assignee_status' ),
    'Gravity_Flow_Step_User_Input::get_status_update_feedback' => array( 'Gravity_Flow_Step_User_Input', 'get_status_update_feedback' ),
    'Gravity_Flow_Step::get_next_step_id' => array( 'Gravity_Flow_Step', 'get_next_step_id' ),
    'Gravity_Flow_Step::get_next_step' => array( 'Gravity_Flow_Step', 'get_next_step' ),
    'Gravity_Flow_Step::end' => array( 'Gravity_Flow_Step', 'end' ),
    'Gravity_Flow_Entry_Detail::maybe_display_back_link' => array( 'Gravity_Flow_Entry_Detail', 'maybe_display_back_link' ),
);
$method_sources = array();
foreach ( $methods as $key => $pair ) {
    $method_sources[ $key ] = $method_source( $pair[0], $pair[1] );
}

$needles = array(
    'handleApprovalStepButtonClick',
    'confirmation_prompt',
    'gravityflow_approval_confirm_prompt_messages',
    'gravityflow_approval_new_status_step_',
    'revertEnable',
    'revertStep',
    'revert_step',
    'next_step',
    'nextStep',
    'gravityflow_back_link_url_entry_detail',
    'approval_confirmation',
    'rejection_confirmation',
    'revert_confirmation',
    'user_input_confirmation',
    'confirm(',
    'window.confirm',
);
$occurrences = array_fill_keys( $needles, array() );
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator( $flow_root, FilesystemIterator::SKIP_DOTS )
);
foreach ( $iterator as $file ) {
    if ( ! $file->isFile() || ! in_array( strtolower( $file->getExtension() ), array( 'php', 'js' ), true ) ) {
        continue;
    }
    $path = $file->getPathname();
    $lines = @file( $path, FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        continue;
    }
    foreach ( $lines as $index => $line ) {
        foreach ( $needles as $needle ) {
            if ( false === strpos( $line, $needle ) || count( $occurrences[ $needle ] ) >= 20 ) {
                continue;
            }
            $start = max( 0, $index - 5 );
            $end = min( count( $lines ) - 1, $index + 8 );
            $snippet = array();
            for ( $i = $start; $i <= $end; $i++ ) {
                $snippet[] = array( 'line' => $i + 1, 'text' => rtrim( $lines[ $i ] ) );
            }
            $occurrences[ $needle ][] = array(
                'file' => ltrim( str_replace( $flow_root, '', $path ), '/\\' ),
                'line' => $index + 1,
                'snippet' => $snippet,
            );
        }
    }
}

$result = array(
    'schema_version' => '1.0.0',
    'purpose' => 'SRWF_OPERATOR_JOURNEY_HOST_CAPABILITY_SOURCE_PROBE',
    'evidence_class_ceiling' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'gravity_flow_version' => '3.1.0',
    'gravity_flow_package_sha256' => getenv( 'WU21_FLOW_SHA256' ) ?: null,
    'method_sources' => $method_sources,
    'occurrences' => $occurrences,
);
wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-srwf-journey-source-probe.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
echo "WU18_SRWF_JOURNEY_SOURCE_PROBE_PASS\n";
