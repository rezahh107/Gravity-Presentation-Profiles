<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_array( $manifest ) || empty( $manifest['alpha']['entry_id'] ) ) {
    throw new RuntimeException( 'WU09 qualification requires the established WU18 fixture manifest.' );
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) {
    throw new RuntimeException( 'WU09 qualification operator is unavailable.' );
}
wp_set_current_user( $operator->ID );

$flow_root = realpath( WP_PLUGIN_DIR . '/gravityflow' );
$gf_root = realpath( WP_PLUGIN_DIR . '/gravityforms' );
if ( ! is_string( $flow_root ) || ! is_string( $gf_root ) ) {
    throw new RuntimeException( 'Pinned Gravity package roots are unavailable.' );
}

$flow_version = get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) );
$gf_version = get_file_data( $gf_root . '/gravityforms.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== ( $flow_version['Version'] ?? null ) || '3.1.1.1' !== ( $gf_version['Version'] ?? null ) ) {
    throw new RuntimeException( 'Pinned Gravity runtime identity changed.' );
}

$container = Gravity_Flow::get_instance()->container();
$task_model = $container->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
$tasks = $task_model->get_inbox_tasks( array() );
if ( ! is_array( $tasks ) || empty( $tasks ) ) {
    throw new RuntimeException( 'Native Gravity Flow Inbox returned no tasks for request-shape qualification.' );
}

$entry_urls = array();
$alpha_url = null;
foreach ( $tasks as $task ) {
    if ( empty( $task['url_entry'] ) || ! is_string( $task['url_entry'] ) ) {
        continue;
    }

    $url = html_entity_decode( $task['url_entry'], ENT_QUOTES, 'UTF-8' );
    $parts = wp_parse_url( $url );
    parse_str( isset( $parts['query'] ) ? $parts['query'] : '', $query );
    $record = array(
        'path' => isset( $parts['path'] ) ? $parts['path'] : '',
        'page' => isset( $query['page'] ) ? (string) $query['page'] : '',
        'view' => isset( $query['view'] ) ? (string) $query['view'] : '',
        'id' => isset( $query['id'] ) ? (int) $query['id'] : 0,
        'lid' => isset( $query['lid'] ) ? (int) $query['lid'] : 0,
    );
    $entry_urls[] = $record;

    if ( (int) $manifest['alpha']['entry_id'] === $record['lid'] ) {
        $alpha_url = $record;
    }
}

if ( ! is_array( $alpha_url ) ) {
    throw new RuntimeException( 'Native task URL for the positive WU18 Entry Detail fixture was not found.' );
}
if ( '/wp-admin/admin.php' !== $alpha_url['path']
    || 'gravityflow-inbox' !== $alpha_url['page']
    || 'entry' !== $alpha_url['view']
    || (int) $manifest['alpha']['form_id'] !== $alpha_url['id']
    || (int) $manifest['alpha']['entry_id'] !== $alpha_url['lid'] ) {
    throw new RuntimeException( 'Native Gravity Flow task URL does not match the canonical admin Entry Detail route.' );
}

foreach ( $entry_urls as $record ) {
    if ( 'entry' === $record['view'] ) {
        if ( '/wp-admin/admin.php' !== $record['path'] || 'gravityflow-inbox' !== $record['page'] || $record['id'] < 1 || $record['lid'] < 1 ) {
            throw new RuntimeException( 'Pinned Gravity Flow emitted an Entry Detail task URL outside the canonical admin route shape.' );
        }
    }
}

$entry_detail_source = file_get_contents( $flow_root . '/includes/pages/class-entry-detail.php' );
$inbox_source = file_get_contents( $flow_root . '/includes/pages/class-inbox.php' );
$flow_source = file_get_contents( $flow_root . '/class-gravity-flow.php' );
if ( ! is_string( $entry_detail_source ) || ! is_string( $inbox_source ) || ! is_string( $flow_source ) ) {
    throw new RuntimeException( 'Pinned Gravity Flow route source could not be read.' );
}

$source_evidence = array(
    'entry_detail_permission_gate_present' => false !== strpos( $entry_detail_source, 'is_permission_granted' ),
    'entry_detail_content_hook_present' => false !== strpos( $entry_detail_source, 'gravityflow_entry_detail_content_before' ),
    'inbox_entry_view_token_present' => false !== strpos( $inbox_source, 'view=entry' ) || false !== strpos( $inbox_source, "'view' => 'entry'" ) || false !== strpos( $inbox_source, '"view" => "entry"' ),
    'gravityflow_shortcode_family_present' => false !== strpos( $flow_source, 'gravityflow_shortcode_' ),
);
if ( ! $source_evidence['entry_detail_permission_gate_present'] || ! $source_evidence['entry_detail_content_hook_present'] ) {
    throw new RuntimeException( 'Pinned Entry Detail permission/post-permission seam evidence changed.' );
}

$result = array(
    'status' => 'PASS',
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_flow' => $flow_version['Version'],
        'gravity_forms' => $gf_version['Version'],
    ),
    'native_task_entry_urls' => $entry_urls,
    'canonical_positive_route' => $alpha_url,
    'source_evidence' => $source_evidence,
    'conclusion' => array(
        'native_task_navigation_is_admin_entry_detail' => true,
        'permission_remains_host_owned' => true,
        'post_permission_dossier_seam_present' => true,
    ),
);

file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu09-entry-asset-runtime.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU09_ENTRY_ASSET_RUNTIME_ROUTE_PASS\n";
