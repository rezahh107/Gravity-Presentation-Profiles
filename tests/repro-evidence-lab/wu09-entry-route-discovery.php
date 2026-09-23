<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_array( $manifest ) || empty( $manifest['alpha']['form_id'] ) || empty( $manifest['alpha']['entry_id'] ) ) {
    throw new RuntimeException( 'WU09 route discovery requires WU18 fixtures and artifact directory.' );
}

$flow_root = realpath( WP_PLUGIN_DIR . '/gravityflow' );
$flow_main = $flow_root ? $flow_root . '/gravityflow.php' : '';
$gf_main = WP_PLUGIN_DIR . '/gravityforms/gravityforms.php';
$flow_data = is_file( $flow_main ) ? get_file_data( $flow_main, array( 'Version' => 'Version' ) ) : array();
$gf_data = is_file( $gf_main ) ? get_file_data( $gf_main, array( 'Version' => 'Version' ) ) : array();
if ( '3.1.0' !== ( $flow_data['Version'] ?? '' ) || '3.1.1.1' !== ( $gf_data['Version'] ?? '' ) ) {
    throw new RuntimeException( 'WU09 route discovery is not running against the pinned Gravity runtime.' );
}

wp_set_current_user( 1 );
$form_id = (int) $manifest['alpha']['form_id'];
$entry_id = (int) $manifest['alpha']['entry_id'];

$source_hits = array();
$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $flow_root, FilesystemIterator::SKIP_DOTS ) );
foreach ( $iterator as $file ) {
    if ( ! $file->isFile() || 'php' !== strtolower( $file->getExtension() ) ) {
        continue;
    }
    $path = $file->getPathname();
    $source = @file_get_contents( $path );
    if ( ! is_string( $source ) ) {
        continue;
    }
    if ( false === strpos( $source, 'gravityflow' ) || false === strpos( $source, 'entry' ) ) {
        continue;
    }
    foreach ( array(
        'add_shortcode' => 'add_shortcode',
        'page_entry' => "page='entry'",
        'page_entry_double' => 'page="entry"',
        'entry_detail_class' => 'Gravity_Flow_Entry_Detail',
        'shortcode_filter' => 'gravityflow_shortcode_',
    ) as $key => $needle ) {
        if ( false !== strpos( $source, $needle ) ) {
            $source_hits[] = array(
                'file' => ltrim( str_replace( $flow_root, '', $path ), '/\\' ),
                'signal' => $key,
            );
        }
    }
}

$page_id = wp_insert_post(
    array(
        'post_title' => 'WU09 Frontend Entry Route Probe',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[gravityflow page="entry"]',
    ),
    true
);
if ( is_wp_error( $page_id ) ) {
    throw new RuntimeException( 'Unable to create WU09 frontend route probe page: ' . $page_id->get_error_message() );
}
$permalink = get_permalink( $page_id );
if ( ! is_string( $permalink ) || '' === $permalink ) {
    throw new RuntimeException( 'Unable to resolve WU09 frontend route probe permalink.' );
}

$original_get = $_GET;
$original_request = $_REQUEST;
$probe_results = array();
$shapes = array(
    'id_lid' => array( 'id' => $form_id, 'lid' => $entry_id ),
    'view_id_lid' => array( 'view' => 'entry', 'id' => $form_id, 'lid' => $entry_id ),
);
foreach ( $shapes as $name => $query ) {
    $_GET = $query;
    $_REQUEST = $query;
    ob_start();
    try {
        $output = do_shortcode( '[gravityflow page="entry"]' );
    } catch ( Throwable $exception ) {
        ob_end_clean();
        $probe_results[ $name ] = array(
            'exception' => get_class( $exception ) . ': ' . $exception->getMessage(),
            'dossier' => false,
            'workflow_detail' => false,
            'entry_detail_view' => false,
            'length' => 0,
        );
        continue;
    }
    $buffer = ob_get_clean();
    $html = (string) $buffer . (string) $output;
    $probe_results[ $name ] = array(
        'exception' => null,
        'dossier' => false !== strpos( $html, 'data-gpp-entry-detail="ready"' ),
        'workflow_detail' => false !== strpos( $html, 'gravityflow_workflow_detail' ),
        'entry_detail_view' => false !== strpos( $html, 'entry-detail-view' ),
        'length' => strlen( $html ),
    );
}
$_GET = $original_get;
$_REQUEST = $original_request;

$supported_shape = null;
foreach ( $probe_results as $name => $result ) {
    if ( ! empty( $result['workflow_detail'] ) || ! empty( $result['entry_detail_view'] ) || ! empty( $result['dossier'] ) ) {
        $supported_shape = $name;
        break;
    }
}

$payload = array(
    'schema_version' => '1.0.0',
    'wordpress_version' => get_bloginfo( 'version' ),
    'gravity_flow_version' => $flow_data['Version'],
    'gravity_forms_version' => $gf_data['Version'],
    'gravityflow_shortcode_registered' => shortcode_exists( 'gravityflow' ),
    'source_hits' => $source_hits,
    'frontend_probe_page' => array(
        'page_id' => (int) $page_id,
        'url' => $permalink,
    ),
    'frontend_shortcode_probe' => $probe_results,
    'frontend_supported_shape' => $supported_shape,
);
update_option( 'gpp_wu09_entry_asset_qualification', $payload, false );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu09-entry-route-discovery.json',
    wp_json_encode( $payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo 'WU09_ENTRY_ROUTE_DISCOVERY_PASS frontend_shape=' . ( null === $supported_shape ? 'none' : $supported_shape ) . PHP_EOL;
