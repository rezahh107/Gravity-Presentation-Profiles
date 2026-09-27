<?php
/**
 * Qualification-only source/runtime probe for the Owner-approved SRWF operator journey.
 * No production semantics are changed. This file runs only in the disposable pinned lab.
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
    'confirmation_prompt',
    'handleApprovalStepButtonClick',
    'gravityflow_approval_confirm_prompt_messages',
    'gravityflow_approval_new_status_step_',
    'gravityflow_approvals_',
    'revertEnable',
    'gravityflow_approval_revert_step_id',
    'revert_step',
    'next_step',
    'next step',
    'class Gravity_Flow_Step_User_Input',
    'function process',
    'workflow_final_status',
    'gravityflow_back_link_url_entry_detail',
);

$hits = array();
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
        $count = 0;
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
            $count++;
            if ( $count >= 30 ) {
                break;
            }
        }
    }
}

$classes = array(
    'Gravity_Flow_API',
    'Gravity_Flow_Entry_Detail',
    'Gravity_Flow_Step',
    'Gravity_Flow_Step_Approval',
    'Gravity_Flow_Step_User_Input',
);
$reflection = array();
foreach ( $classes as $class ) {
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
        if ( ! preg_match( '/action|status|process|next|revert|workflow|assignee|entry|step|setting/i', $method->getName() ) ) {
            continue;
        }
        $methods[] = array(
            'name' => $method->getName(),
            'visibility' => $method->isPublic() ? 'public' : ( $method->isProtected() ? 'protected' : 'private' ),
            'parameters' => array_map(
                static function ( ReflectionParameter $p ) {
                    return array(
                        'name' => $p->getName(),
                        'required' => ! $p->isOptional(),
                        'default' => $p->isDefaultValueAvailable() ? $p->getDefaultValue() : null,
                    );
                },
                $method->getParameters()
            ),
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

$form_id = GFAPI::add_form(
    array(
        'title' => 'SRWF Journey Host Capability Probe',
        'description' => 'Synthetic non-PII qualification fixture.',
        'fields' => array(
            array( 'id' => 1, 'label' => 'Synthetic Value', 'type' => 'text', 'isRequired' => false ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    )
);
if ( is_wp_error( $form_id ) || ! $form_id ) {
    throw new RuntimeException( 'Unable to create synthetic probe form.' );
}
$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) {
    throw new RuntimeException( 'Pinned synthetic operator is unavailable.' );
}
$api = new Gravity_Flow_API( (int) $form_id );
$user_input_id = $api->add_step(
    array(
        'step_name' => 'SRWF Probe User Input',
        'step_type' => 'user_input',
        'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $operator->ID ),
        'assignee_policy' => 'all',
        'editable_fields' => array( '1' ),
    )
);
$approval_id = $api->add_step(
    array(
        'step_name' => 'SRWF Probe Approval',
        'step_type' => 'approval',
        'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $operator->ID ),
        'assignee_policy' => 'all',
    )
);
if ( ! $user_input_id || ! $approval_id || is_wp_error( $user_input_id ) || is_wp_error( $approval_id ) ) {
    throw new RuntimeException( 'Unable to create synthetic probe steps.' );
}

$step_records = array();
foreach ( array( 'user_input' => (int) $user_input_id, 'approval' => (int) $approval_id ) as $key => $step_id ) {
    $step = $api->get_step( $step_id );
    if ( ! $step ) {
        throw new RuntimeException( 'Unable to resolve probe step: ' . $key );
    }
    $settings = method_exists( $step, 'get_settings' ) ? $step->get_settings() : array();
    $step_records[ $key ] = array(
        'id' => $step_id,
        'class' => get_class( $step ),
        'feed_meta' => $step->get_feed_meta(),
        'settings' => $settings,
        'actions' => method_exists( $step, 'get_actions' ) ? $step->get_actions() : array(),
    );
}

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
    'step_records' => $step_records,
);

wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'srwf-journey-host-source-probe.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "SRWF_JOURNEY_HOST_SOURCE_PROBE_PASS\n";
