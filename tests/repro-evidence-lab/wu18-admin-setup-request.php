<?php
/**
 * Test-only HTTP harness for the production Entry Detail admin-post action.
 *
 * The disposable runtime copies this file to the WordPress document root. It
 * boots WordPress with WP_ADMIN=true, authenticates only the synthetic fixture
 * administrator in-process, creates the normal action nonce, then delegates to
 * wp-admin/admin-post.php. No production hook or bypass is added to GPP.
 */

if ( ! defined( 'WP_ADMIN' ) ) {
    define( 'WP_ADMIN', true );
}

$wp_path = getenv( 'WU21_WP_PATH' );
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$workspace = getenv( 'GITHUB_WORKSPACE' );
if ( ! is_string( $wp_path ) || '' === $wp_path
    || ! is_string( $artifact_dir ) || '' === $artifact_dir
    || ! is_string( $workspace ) || '' === $workspace ) {
    http_response_code( 500 );
    exit( 'runtime_not_configured' );
}

require rtrim( $wp_path, '/\\' ) . '/wp-load.php';
require rtrim( $workspace, '/\\' ) . '/tests/repro-evidence-lab/wu18-entry-detail-setup-state.php';

$form_id = isset( $_GET['form_id'] ) ? absint( $_GET['form_id'] ) : 0;
$expect = isset( $_GET['expect'] ) ? sanitize_key( wp_unslash( $_GET['expect'] ) ) : 'success';
$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( $form_id <= 0 || ! $operator || ! in_array( $expect, array( 'success', 'failure' ), true ) ) {
    http_response_code( 400 );
    exit( 'fixture_context_unavailable' );
}

$current_step_reflection = class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_current_step' )
    ? new ReflectionMethod( 'Gravity_Flow_API', 'get_current_step' )
    : null;
$status_reflection = class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_status' )
    ? new ReflectionMethod( 'Gravity_Flow_API', 'get_status' )
    : null;
$api_constructible = false;
try {
    if ( class_exists( 'Gravity_Flow_API' ) ) {
        new Gravity_Flow_API( $form_id );
        $api_constructible = true;
    }
} catch ( Throwable $exception ) {
    $api_constructible = false;
}

$facts = array(
    'schema_version' => '1.1.0',
    'request_context' => 'http_wp_admin_before_admin_post_dispatch',
    'expectation' => $expect,
    'selected_form_id' => $form_id,
    'gravity_flow_api_loaded' => class_exists( 'Gravity_Flow_API', false ),
    'gravity_flow_api_available' => class_exists( 'Gravity_Flow_API' ),
    'form_bound_api_constructible' => $api_constructible,
    'get_current_step' => null === $current_step_reflection ? null : array(
        'public' => $current_step_reflection->isPublic(),
        'static' => $current_step_reflection->isStatic(),
        'required_parameters' => $current_step_reflection->getNumberOfRequiredParameters(),
        'total_parameters' => $current_step_reflection->getNumberOfParameters(),
    ),
    'get_status' => null === $status_reflection ? null : array(
        'public' => $status_reflection->isPublic(),
        'static' => $status_reflection->isStatic(),
        'required_parameters' => $status_reflection->getNumberOfRequiredParameters(),
        'total_parameters' => $status_reflection->getNumberOfParameters(),
    ),
);
wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-admin-setup-context-' . $expect . '.json',
    wp_json_encode( $facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);

$before = gpp_wu18_entry_detail_setup_state( $expect . '-before' );
register_shutdown_function(
    static function () use ( $before, $form_id, $artifact_dir, $expect ) {
        $after = gpp_wu18_entry_detail_setup_state( $expect . '-after' );
        $errors = array();
        $before_status = $before['workflow_status']['state'] ?? null;
        $after_status = $after['workflow_status']['state'] ?? null;
        $before_binding_version = $before['binding_activation']['binding_set_version'] ?? null;
        $after_binding_version = $after['binding_activation']['binding_set_version'] ?? null;
        $before_entry_detail = $before['active_profiles']['gravity_flow.entry_detail'] ?? null;
        $after_entry_detail = $after['active_profiles']['gravity_flow.entry_detail'] ?? null;
        $diagnostic = $after['entry_detail_setup_diagnostic'] ?? null;

        foreach ( array( 'gravity_flow.inbox', 'print.dossier' ) as $surface ) {
            if ( ( $before['active_profiles'][ $surface ] ?? null ) !== ( $after['active_profiles'][ $surface ] ?? null ) ) {
                $errors[] = str_replace( '.', '_', $surface ) . '_activation_changed';
            }
        }

        if ( 'failure' === $expect ) {
            if ( 409 !== http_response_code() ) $errors[] = 'failure_http_status_not_409';
            if ( $before['binding_activation'] !== $after['binding_activation'] ) $errors[] = 'failure_changed_binding_activation';
            if ( $before['workflow_status'] !== $after['workflow_status'] ) $errors[] = 'failure_changed_workflow_status';
            if ( $before_entry_detail !== $after_entry_detail ) $errors[] = 'failure_changed_entry_detail_activation';
            if ( ! is_array( $diagnostic )
                || true !== ( $diagnostic['attempted'] ?? null )
                || $form_id !== ( $diagnostic['selected_form_id'] ?? null )
                || 'FAILED' !== ( $diagnostic['result'] ?? null )
                || 'binding_context' !== ( $diagnostic['step'] ?? null )
                || 'entry_detail_binding_context_missing' !== ( $diagnostic['reason_code'] ?? null )
                || null !== ( $diagnostic['binding_set'] ?? null )
                || null !== ( $diagnostic['entry_detail_activation'] ?? null ) ) {
                $errors[] = 'failure_diagnostic_missing_or_incorrect';
            }
        } else {
            $after_source = $after['workflow_status']['source_ref'] ?? null;
            if ( 'PROVEN' === $before_status ) $errors[] = 'before_workflow_status_already_proven';
            if ( 'PROVEN' !== $after_status ) $errors[] = 'after_workflow_status_not_proven';
            if ( ! is_array( $after_source ) || 'gravity_flow.state' !== ( $after_source['type'] ?? null ) || 'status' !== ( $after_source['state_key'] ?? null ) ) {
                $errors[] = 'workflow_status_source_mismatch';
            }
            if ( ! is_string( $before_binding_version ) || ! is_string( $after_binding_version ) || $before_binding_version === $after_binding_version ) {
                $errors[] = 'binding_version_did_not_advance';
            }
            if ( null !== $before_entry_detail ) $errors[] = 'entry_detail_was_active_before_setup';
            if ( ! is_array( $after_entry_detail ) || 'srwf.operations.entry-detail.v1' !== ( $after_entry_detail['profile_id'] ?? null ) ) {
                $errors[] = 'entry_detail_not_activated';
            }
            if ( ! is_array( $diagnostic )
                || true !== ( $diagnostic['attempted'] ?? null )
                || $form_id !== ( $diagnostic['selected_form_id'] ?? null )
                || 'COMPLETED' !== ( $diagnostic['result'] ?? null )
                || 'cross_surface_preservation' !== ( $diagnostic['step'] ?? null )
                || 'entry_detail_setup_completed' !== ( $diagnostic['reason_code'] ?? null ) ) {
                $errors[] = 'success_diagnostic_missing_or_incorrect';
            }
            if ( is_array( $diagnostic ) ) {
                if ( $after_binding_version !== ( $diagnostic['binding_set']['binding_set_version'] ?? null ) ) {
                    $errors[] = 'diagnostic_binding_identity_mismatch';
                }
                if ( 'srwf.operations.entry-detail.v1' !== ( $diagnostic['entry_detail_activation']['profile_id'] ?? null ) ) {
                    $errors[] = 'diagnostic_activation_identity_mismatch';
                }
            }

            $runtime = $after['runtime'] ?? array();
            foreach ( array(
                'wordpress_version' => '7.1.1',
                'php_version' => '8.3.33',
                'gravity_forms_version' => '3.1.1.1',
                'gravity_flow_version' => '3.1.0',
            ) as $key => $expected ) {
                if ( $expected !== ( $runtime[ $key ] ?? null ) ) {
                    $errors[] = 'runtime_' . $key . '_mismatch';
                }
            }
        }

        $transition = array(
            'schema_version' => '1.0.0',
            'expectation' => $expect,
            'selected_form_id' => $form_id,
            'http_status' => http_response_code(),
            'result' => empty( $errors ) ? 'PASS' : 'FAIL',
            'errors' => $errors,
            'before_binding_version' => $before_binding_version,
            'after_binding_version' => $after_binding_version,
            'workflow_status_before' => $before_status,
            'workflow_status_after' => $after_status,
            'entry_detail_before' => $before_entry_detail,
            'entry_detail_after' => $after_entry_detail,
            'inbox_preserved' => ( $before['active_profiles']['gravity_flow.inbox'] ?? null ) === ( $after['active_profiles']['gravity_flow.inbox'] ?? null ),
            'print_preserved' => ( $before['active_profiles']['print.dossier'] ?? null ) === ( $after['active_profiles']['print.dossier'] ?? null ),
            'support_diagnostic' => $diagnostic,
        );
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'wu18-entry-detail-setup-' . $expect . '-transition.json',
            wp_json_encode( $transition, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
        );

        if ( ! empty( $errors ) && ! headers_sent() ) {
            header_remove( 'Location' );
            http_response_code( 500 );
            echo 'entry_detail_setup_transition_failed';
        }
    }
);

wp_set_current_user( (int) $operator->ID );
$action = 'gpp_initialize_entry_detail_presentation';
$nonce = wp_create_nonce( $action );
$_POST = array(
    'action' => $action,
    '_wpnonce' => $nonce,
    'gpp_entry_detail_form_id' => $form_id,
);
$_REQUEST = $_POST;
$_SERVER['REQUEST_METHOD'] = 'POST';

require ABSPATH . 'wp-admin/admin-post.php';
