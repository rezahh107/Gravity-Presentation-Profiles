<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
}

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();
$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_style_states'] = array();
$GLOBALS['gpp_is_admin'] = false;
$GLOBALS['gpp_is_singular'] = true;
$GLOBALS['gpp_queried_object'] = (object) array( 'post_content' => '' );

class WP_Block_Type_Registry {
    private static $instance;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function is_registered( $name ) {
        return InboxPresentationAdapter::NATIVE_BLOCK === $name;
    }
}

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function is_admin() {
    return (bool) $GLOBALS['gpp_is_admin'];
}

function is_singular() {
    return (bool) $GLOBALS['gpp_is_singular'];
}

function get_queried_object() {
    return $GLOBALS['gpp_queried_object'];
}

function shortcode_exists( $tag ) {
    return 'gravityflow' === $tag;
}

function get_shortcode_regex( $tagnames = null ) {
    unset( $tagnames );
    return '(\[?)(gravityflow)([^\]]*)(\/)?\](?:(.*?)\[\/\2\])?(\]?)';
}

function wp_html_split( $input ) {
    return preg_split(
        '/(<!--[\\s\\S]*?(?:-->|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>|$)|<[^>]*>)/',
        (string) $input,
        -1,
        PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY
    );
}

function shortcode_parse_atts( $text ) {
    $atts = array();
    if ( preg_match_all( '/([A-Za-z0-9_-]+)\s*=\s*["\']([^"\']*)["\']/', (string) $text, $matches, PREG_SET_ORDER ) ) {
        foreach ( $matches as $match ) {
            $atts[ strtolower( $match[1] ) ] = $match[2];
        }
    }
    return $atts;
}

function has_block( $name, $content = null ) {
    return is_string( $content ) && false !== strpos( $content, '<!-- wp:' . $name );
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_enqueued_styles'][] = array(
        'handle' => $handle,
        'src' => $src,
        'dependencies' => $dependencies,
        'version' => $version,
        'media' => $media,
    );
    $GLOBALS['gpp_style_states'][ $handle . ':enqueued' ] = true;
}

function wp_style_is( $handle, $status = 'enqueued' ) {
    return ! empty( $GLOBALS['gpp_style_states'][ $handle . ':' . $status ] );
}

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.invalid/wp-content/plugins/gravity-presentation-profiles/' . ltrim( (string) $path, '/' );
}

function wp_unslash( $value ) {
    return $value;
}

function sanitize_key( $key ) {
    return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
}

function did_action( $hook ) {
    unset( $hook );
    return 0;
}

Autoloader::register();

$adapter = new ReflectionClass( InboxPresentationAdapter::class );
$model_loaded = $adapter->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model = $adapter->getProperty( 'model' );
$model->setAccessible( true );
$surface_reached = $adapter->getProperty( 'surface_reached' );
$surface_reached->setAccessible( true );

$set_active_profile = static function ( $active ) use ( $model_loaded, $model ) {
    $model_loaded->setValue( null, true );
    $model->setValue( null, $active ? new stdClass() : null );
};
$reset_request = static function ( $content = '', $admin = false, $singular = true ) use ( $surface_reached ) {
    $surface_reached->setValue( null, false );
    $GLOBALS['gpp_enqueued_styles'] = array();
    $GLOBALS['gpp_style_states'] = array();
    $GLOBALS['gpp_is_admin'] = $admin;
    $GLOBALS['gpp_is_singular'] = $singular;
    $GLOBALS['gpp_queried_object'] = (object) array( 'post_content' => $content );
    $_GET = array();
};
$style_handles = static function () {
    return array_map(
        static function ( $style ) {
            return $style['handle'];
        },
        $GLOBALS['gpp_enqueued_styles']
    );
};

InboxPresentationAdapter::register();
gpp_assert_same( 2, count( $GLOBALS['gpp_actions'] ), 'Inbox presentation must use normal admin/frontend asset lifecycles.' );
gpp_assert_same( 2, count( $GLOBALS['gpp_filters'] ), 'Native-first Inbox must register render reachability filters only.' );
gpp_assert_same( 'gravityflow_shortcode_inbox', $GLOBALS['gpp_filters'][0][0], 'Shortcode seam must remain native Gravity Flow authority.' );
gpp_assert_same( 'render_block', $GLOBALS['gpp_filters'][1][0], 'Block seam must remain WordPress render authority.' );

$registered_hooks = array_map(
    static function ( $filter ) {
        return $filter[0];
    },
    $GLOBALS['gpp_filters']
);
foreach ( array( 'gravityflow_columns_inbox_table', 'gravityflow_inbox_field_value', 'gravityflow_js_config_shared' ) as $retired_hook ) {
    gpp_assert_true( ! in_array( $retired_hook, $registered_hooks, true ), 'Native-first reset must not own host Grid data/config seam: ' . $retired_hook );
}

$set_active_profile( true );
$reset_request();
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Profile activation alone must not leak Inbox styles.' );

$reset_request( '[gravityflow page="inbox"]' );
$GLOBALS['gpp_style_states']['global-styles:enqueued'] = true;
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same(
    array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE ),
    $style_handles(),
    'Exact current-page Inbox shortcode must qualify both bounded presentation styles.'
);
gpp_assert_same( array( 'global-styles' ), $GLOBALS['gpp_enqueued_styles'][0]['dependencies'], 'Active WordPress global styles must precede GPP shell paint.' );

$reset_request( '<!-- [gravityflow page="inbox"] -->' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Commented shortcode must not qualify Inbox style delivery.' );

$reset_request( '<!-- wp:gravityflow/inbox /-->' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same(
    array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE ),
    $style_handles(),
    'Registered native Inbox block in current post content must qualify style delivery.'
);

$lookalike = '<div class="gflow-inbox gflow-grid gflow-common" data-js="gflow-inbox"></div>';
$reset_request( '<!-- wp:html -->' . $lookalike . '<!-- /wp:html -->' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Native-looking markup in an unrelated block must not qualify early delivery.' );
gpp_assert_same( $lookalike, InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => 'core/html' ) ), 'Lookalike block output must remain untouched.' );

$reset_request( '', true );
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same(
    array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE ),
    $style_handles(),
    'Exact native admin Inbox list request must qualify styles.'
);

$reset_request( '', true );
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Entry Detail must not receive Inbox styles.' );

$native_shortcode = '<div class="gravityflow_wrap"><div class="gflow-inbox gflow-grid gflow-common" data-js="gflow-inbox"></div></div>';
$set_active_profile( true );
$reset_request( '<p>Dynamic render.</p>' );
$wrapped = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
gpp_assert_true( false !== strpos( $wrapped, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Active authentic Inbox should receive the GPP-owned page shell.' );
gpp_assert_true( false !== strpos( $wrapped, '<header class="gpp-inbox-surface__header" dir="rtl">' ), 'RTL must be bounded to the GPP-owned Persian header.' );
gpp_assert_true( false === strpos( $wrapped, 'data-gpp-inbox-surface="gravity_flow.inbox" dir="rtl"' ), 'GPP must not impose RTL on the native Grid subtree.' );
gpp_assert_same( 1, substr_count( $wrapped, $native_shortcode ), 'Native Inbox markup must remain one unchanged subtree inside the shell.' );

$set_active_profile( false );
$reset_request( '<p>Dynamic render.</p>' );
gpp_assert_same( $native_shortcode, InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' ), 'Readiness loss must fail safe to native Gravity Flow output.' );

$source = file_get_contents( dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/InboxPresentationAdapter.php' );
gpp_assert_true( false === strpos( $source, 'gpp_case_card' ), 'Production adapter must not require the superseded card column.' );
gpp_assert_true( false === strpos( $source, 'rowBuffer' ), 'Production adapter must not tune AG Grid row materialization for Card Mode.' );

echo "INBOX_ASSET_REACHABILITY_PASS\n";
