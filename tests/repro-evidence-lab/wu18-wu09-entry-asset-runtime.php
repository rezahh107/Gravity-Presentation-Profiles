<?php
/**
 * WU09 evidence-only qualification setup.
 *
 * Reuses the existing pinned WU18 runtime and prepares request-shape fixtures
 * plus a disposable candidate asset lifecycle shim for browser qualification.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$base = get_option( 'gpp_wu21_fixture_manifest' );
$wu18 = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_array( $base ) || ! is_array( $wu18 ) ) {
    throw new RuntimeException( 'WU09 qualification requires the existing WU18/WU21 fixture runtime.' );
}

$gf = get_file_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', array( 'Version' => 'Version' ) );
$flow = get_file_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', array( 'Version' => 'Version' ) );
wu18_assert( '3.1.1.1' === (string) $gf['Version'], 'WU09 requires exact Gravity Forms 3.1.1.1.' );
wu18_assert( '3.1.0' === (string) $flow['Version'], 'WU09 requires exact Gravity Flow 3.1.0.' );

$entry_detail_source = WP_PLUGIN_DIR . '/gravityflow/includes/pages/class-entry-detail.php';
$flow_source = WP_PLUGIN_DIR . '/gravityflow/class-gravity-flow.php';
wu18_assert( is_readable( $entry_detail_source ) && is_readable( $flow_source ), 'WU09 pinned Gravity Flow source is unreadable.' );

$entry_detail_php = file_get_contents( $entry_detail_source );
$flow_php = file_get_contents( $flow_source );
wu18_assert(
    is_string( $entry_detail_php )
        && false !== strpos( $entry_detail_php, 'gravityflow_entry_detail_content_before' )
        && false !== strpos( $entry_detail_php, 'function entry_detail' ),
    'WU09 post-permission Entry Detail seam changed in pinned Gravity Flow.'
);
wu18_assert(
    is_string( $flow_php ) && false !== strpos( $flow_php, 'gravityflow_shortcode_' ),
    'WU09 Gravity Flow shortcode dispatch source is unavailable.'
);

function gpp_wu09_create_page( $title, $content ) {
    $id = wp_insert_post(
        array(
            'post_title' => $title,
            'post_status' => 'publish',
            'post_type' => 'page',
            'post_content' => $content,
        ),
        true
    );
    if ( is_wp_error( $id ) || (int) $id < 1 ) {
        throw new RuntimeException( is_wp_error( $id ) ? $id->get_error_message() : 'Unable to create WU09 page fixture.' );
    }
    $url = get_permalink( $id );
    if ( ! is_string( $url ) || '' === $url ) {
        throw new RuntimeException( 'Unable to resolve WU09 page fixture URL.' );
    }
    return array( 'page_id' => (int) $id, 'url' => $url, 'content' => $content );
}

$inbox_shortcode_page = array(
    'page_id' => (int) $base['frontend_inbox_page_id'],
    'url' => (string) $base['frontend_inbox_url'],
    'content' => (string) get_post_field( 'post_content', (int) $base['frontend_inbox_page_id'] ),
);
wu18_assert(
    false !== strpos( $inbox_shortcode_page['content'], '[gravityflow page="inbox"]' ),
    'WU09 authentic frontend Inbox shortcode fixture changed.'
);

$status_shortcode_page = gpp_wu09_create_page( 'WU09 Frontend Status Entry Detail', '[gravityflow page="status"]' );
$unrelated_frontend_page = gpp_wu09_create_page( 'WU09 Unrelated Frontend', '<p>WU09 unrelated frontend control.</p>' );

$registry = WP_Block_Type_Registry::get_instance();
$inbox_block_page = null;
if ( is_object( $registry ) && method_exists( $registry, 'is_registered' ) && $registry->is_registered( 'gravityflow/inbox' ) ) {
    $inbox_block_page = gpp_wu09_create_page( 'WU09 Frontend Inbox Block Entry Detail', '<!-- wp:gravityflow/inbox /-->' );
}

$status_block_registered = is_object( $registry ) && method_exists( $registry, 'is_registered' ) && $registry->is_registered( 'gravityflow/status' );

$status_block_page = $status_block_registered
    ? gpp_wu09_create_page( 'WU09 Frontend Status Block Entry Detail', '<!-- wp:gravityflow/status /-->' )
    : null;

$candidate_source = __DIR__ . '/wu18-wu09-entry-asset-candidate.php';
$mu_target = WPMU_PLUGIN_DIR . '/gpp-wu09-entry-asset-candidate.php';
wu18_assert( is_readable( $candidate_source ), 'WU09 candidate shim source is missing.' );
wu18_assert( is_dir( WPMU_PLUGIN_DIR ) || wp_mkdir_p( WPMU_PLUGIN_DIR ), 'WU09 mu-plugin directory is unavailable.' );
wu18_assert( copy( $candidate_source, $mu_target ), 'WU09 candidate shim could not be installed into the disposable runtime.' );

$qualification = array(
    'schema_version' => '1.0.0',
    'work_unit' => 'GPP-RP-WU-09-ENTRY-ASSET-REACHABILITY-REPAIR',
    'mode' => 'EVIDENCE_ONLY_NO_PRODUCTION_CHANGE',
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => (string) $gf['Version'],
        'gravity_flow' => (string) $flow['Version'],
    ),
    'host_source' => array(
        'entry_detail_file' => 'includes/pages/class-entry-detail.php',
        'entry_detail_sha256' => hash_file( 'sha256', $entry_detail_source ),
        'gravity_flow_main_sha256' => hash_file( 'sha256', $flow_source ),
        'post_permission_hook_present' => true,
        'shortcode_dispatch_present' => true,
    ),
    'production_baseline' => array(
        'style_handle' => EntryDetailPresentationAdapter::STYLE_HANDLE,
        'script_handle' => EntryDetailPresentationAdapter::SCRIPT_HANDLE,
        'current_base_gate' => 'active_model_only',
        'server_admission_markers' => array(
            'data-gpp-entry-detail=ready',
            'data-gpp-review-mode=read-only',
            'data-gpp-native-table-suppression=read-only-review',
        ),
    ),
    'frontend_fixtures' => array(
        'inbox_shortcode' => $inbox_shortcode_page,
        'status_shortcode' => $status_shortcode_page,
        'inbox_block' => $inbox_block_page,
        'status_block_registered' => $status_block_registered,
        'status_block' => $status_block_page,
        'unrelated' => $unrelated_frontend_page,
    ),
    'admin_entry' => array(
        'form_id' => (int) $wu18['alpha']['form_id'],
        'entry_id' => (int) $wu18['alpha']['entry_id'],
    ),
    'candidate_shim' => array(
        'path' => 'tests/repro-evidence-lab/wu18-wu09-entry-asset-candidate.php',
        'mu_target' => $mu_target,
        'production_files_modified' => false,
    ),
);

update_option( 'gpp_wu09_entry_asset_qualification', $qualification, false );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu09-entry-asset-qualification.json',
    wp_json_encode( $qualification, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU09_ENTRY_ASSET_QUALIFICATION_SETUP_PASS\n";
