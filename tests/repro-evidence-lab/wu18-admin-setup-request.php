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
if ( ! is_string( $wp_path ) || '' === $wp_path || ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    http_response_code( 500 );
    exit( 'runtime_not_configured' );
}

require rtrim( $wp_path, '/\\' ) . '/wp-load.php';

$form_id = isset( $_GET['form_id'] ) ? absint( $_GET['form_id'] ) : 0;
$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( $form_id <= 0 || ! $operator ) {
    http_response_code( 400 );
    exit( 'fixture_context_unavailable' );
}

$facts = array(
    'schema_version' => '1.0.0',
    'request_context' => 'http_wp_admin_before_admin_post_dispatch',
    'gravity_flow_api_loaded' => class_exists( 'Gravity_Flow_API', false ),
    'gravity_flow_api_available' => class_exists( 'Gravity_Flow_API' ),
    'get_current_step_available' => class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_current_step' ),
    'get_status_available' => class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_status' ),
);
wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-admin-setup-context.json',
    wp_json_encode( $facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
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
