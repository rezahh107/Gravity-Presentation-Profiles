<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || empty( $manifest['operator']['id'] ) ) {
    throw new RuntimeException( 'P06 runtime qualification requires the admitted WU21 fixtures.' );
}

wp_set_current_user( (int) $manifest['operator']['id'] );

function p06_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}

function p06_reset_styles() {
    foreach ( array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE ) as $handle ) {
        wp_dequeue_style( $handle );
    }
    InboxPresentationAdapter::resetRuntimeCache();
}

function p06_inbox_styles_enqueued() {
    return wp_style_is( InboxPresentationAdapter::STYLE_HANDLE, 'enqueued' )
        && wp_style_is( InboxPresentationAdapter::NATIVE_STYLE_HANDLE, 'enqueued' );
}

function p06_callback_file( $callback ) {
    try {
        if ( is_array( $callback ) && 2 === count( $callback ) ) {
            $reflection = new ReflectionMethod( $callback[0], $callback[1] );
            return $reflection->getFileName();
        }
        if ( $callback instanceof Closure ) {
            $reflection = new ReflectionFunction( $callback );
            return $reflection->getFileName();
        }
        if ( is_string( $callback ) && false !== strpos( $callback, '::' ) ) {
            list( $class, $method ) = explode( '::', $callback, 2 );
            $reflection = new ReflectionMethod( $class, $method );
            return $reflection->getFileName();
        }
        if ( is_string( $callback ) && function_exists( $callback ) ) {
            $reflection = new ReflectionFunction( $callback );
            return $reflection->getFileName();
        }
        if ( is_object( $callback ) && method_exists( $callback, '__invoke' ) ) {
            $reflection = new ReflectionMethod( $callback, '__invoke' );
            return $reflection->getFileName();
        }
    } catch ( ReflectionException $exception ) {
        return null;
    }
    return null;
}

function p06_create_page( $title, $content ) {
    $id = wp_insert_post(
        array(
            'post_title' => $title,
            'post_status' => 'publish',
            'post_type' => 'page',
            'post_content' => $content,
        ),
        true
    );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    $url = get_permalink( $id );
    if ( ! is_string( $url ) || '' === $url ) {
        throw new RuntimeException( 'Unable to create P06 frontend fixture URL.' );
    }
    return array( 'page_id' => (int) $id, 'url' => $url );
}

$flow_root = realpath( WP_PLUGIN_DIR . '/gravityflow' );
p06_assert( is_string( $flow_root ) && '' !== $flow_root, 'Pinned Gravity Flow source root is unavailable.' );

$registry = WP_Block_Type_Registry::get_instance()->get_all_registered();
$flow_blocks = array();
$inbox_block = null;
$inbox_block_output = null;

foreach ( $registry as $name => $type ) {
    if ( ! is_object( $type ) || ! is_callable( $type->render_callback ) ) {
        continue;
    }
    $file = p06_callback_file( $type->render_callback );
    $real_file = is_string( $file ) ? realpath( $file ) : false;
    if ( ! is_string( $real_file ) || 0 !== strpos( $real_file, $flow_root . DIRECTORY_SEPARATOR ) ) {
        continue;
    }

    $flow_blocks[] = array( 'name' => $name, 'callback_file' => $real_file );
    p06_reset_styles();
    try {
        $output = do_blocks( '<!-- wp:' . $name . ' /-->' );
    } catch ( Throwable $exception ) {
        continue;
    }

    if ( is_string( $output )
        && false !== strpos( $output, 'gflow-inbox gflow-grid gflow-common' )
        && false !== strpos( $output, 'data-js="gflow-inbox"' ) ) {
        $inbox_block = $name;
        $inbox_block_output = $output;
        break;
    }
}

p06_assert( is_string( $inbox_block ) && '' !== $inbox_block, 'Exact Gravity Flow 3.1.0 registered block set did not expose an authentic Inbox block render.' );
p06_assert( is_string( $inbox_block_output ) && '' !== $inbox_block_output, 'Authentic Inbox block output was not captured.' );
p06_assert( p06_inbox_styles_enqueued(), 'Authentic native Inbox block render did not enqueue both GPP Inbox styles.' );

$block_result = array(
    'block_name' => $inbox_block,
    'native_markers' => true,
    'presentation_style_enqueued' => wp_style_is( InboxPresentationAdapter::STYLE_HANDLE, 'enqueued' ),
    'native_style_enqueued' => wp_style_is( InboxPresentationAdapter::NATIVE_STYLE_HANDLE, 'enqueued' ),
);

p06_reset_styles();
$lookalike_markup = '<div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div>';
$lookalike_output = do_blocks( '<!-- wp:html -->' . $lookalike_markup . '<!-- /wp:html -->' );
p06_assert( false !== strpos( $lookalike_output, 'data-js="gflow-inbox"' ), 'Lookalike control did not render its test marker.' );
p06_assert( ! wp_style_is( InboxPresentationAdapter::STYLE_HANDLE, 'enqueued' ), 'Lookalike block markup independently enqueued the presentation stylesheet.' );
p06_assert( ! wp_style_is( InboxPresentationAdapter::NATIVE_STYLE_HANDLE, 'enqueued' ), 'Lookalike block markup independently enqueued the native projection stylesheet.' );

p06_reset_styles();
$shortcode_output = do_shortcode( '[gravityflow page="inbox"]' );
p06_assert( false !== strpos( $shortcode_output, 'data-js="gflow-inbox"' ), 'Authentic frontend Inbox shortcode did not render the native target.' );
p06_assert( false !== strpos( $shortcode_output, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Active authentic frontend Inbox shortcode did not retain the admitted GPP wrapper.' );
p06_assert( p06_inbox_styles_enqueued(), 'Authentic frontend Inbox shortcode did not enqueue both GPP Inbox styles.' );

$visual_option = VisualPackageLifecycle::OPTION_NAME;
$visual_backup = get_option( $visual_option );
$visual = new VisualPackageLifecycle( new WordPressOptionStateStore( $visual_option ) );
$visual->deactivate( array( 'surface' => InboxPresentationAdapter::SURFACE ) );
p06_assert( null === $visual->resolve( InboxPresentationAdapter::SURFACE ), 'Inbox visual profile remained active after the exact-runtime negative-control deactivation.' );

try {
    p06_reset_styles();
    $inactive_shortcode = do_shortcode( '[gravityflow page="inbox"]' );
    p06_assert( false !== strpos( $inactive_shortcode, 'data-js="gflow-inbox"' ), 'Inactive-profile control lost the native Gravity Flow Inbox.' );
    p06_assert( false === strpos( $inactive_shortcode, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Inactive-profile control still emitted the GPP Inbox wrapper.' );
    p06_assert( ! wp_style_is( InboxPresentationAdapter::STYLE_HANDLE, 'enqueued' ), 'Inactive authentic Inbox enqueued the presentation stylesheet.' );
    p06_assert( ! wp_style_is( InboxPresentationAdapter::NATIVE_STYLE_HANDLE, 'enqueued' ), 'Inactive authentic Inbox enqueued the native projection stylesheet.' );
} finally {
    update_option( $visual_option, $visual_backup, false );
    InboxPresentationAdapter::resetRuntimeCache();
}

$block_page = p06_create_page( 'P06 Authentic Inbox Block', '<!-- wp:' . $inbox_block . ' /-->' );
$lookalike_page = p06_create_page( 'P06 Lookalike Inbox Block', '<!-- wp:html -->' . $lookalike_markup . '<!-- /wp:html -->' );
$unrelated_page = p06_create_page( 'P06 Unrelated Frontend', '<!-- wp:paragraph --><p>P06 unrelated frontend control.</p><!-- /wp:paragraph -->' );

$fixture = array(
    'schema_version' => '1.0.0',
    'gravity_flow_root' => $flow_root,
    'registered_gravity_flow_blocks' => $flow_blocks,
    'inbox_block' => $block_result,
    'authentic_block_page' => $block_page,
    'lookalike_page' => $lookalike_page,
    'unrelated_page' => $unrelated_page,
);
update_option( 'gpp_p06_fixture_manifest', $fixture, false );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'p06-runtime-results.json',
    wp_json_encode(
        array(
            'status' => 'PASS',
            'authentic_block' => $block_result,
            'lookalike_block_styles_enqueued' => false,
            'shortcode_styles_enqueued' => true,
            'inactive_profile_native_fallback' => true,
            'fixture' => $fixture,
        ),
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    ) . "\n"
);

echo 'P06_ASSET_REACHABILITY_RUNTIME_PASS block=' . $inbox_block . PHP_EOL;
