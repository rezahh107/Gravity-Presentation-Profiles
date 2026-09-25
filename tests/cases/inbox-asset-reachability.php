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
$GLOBALS['gpp_registered_styles'] = array();
$GLOBALS['gpp_printed_actions'] = array();
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
    if ( '' === $src && isset( $GLOBALS['gpp_registered_styles'][ $handle ] ) ) {
        $GLOBALS['gpp_style_states'][ $handle . ':enqueued' ] = true;
        return;
    }
    $GLOBALS['gpp_enqueued_styles'][] = array(
        'handle' => $handle,
        'src' => $src,
        'dependencies' => $dependencies,
        'version' => $version,
        'media' => $media,
    );
    $GLOBALS['gpp_registered_styles'][ $handle ] = end( $GLOBALS['gpp_enqueued_styles'] );
    $GLOBALS['gpp_style_states'][ $handle . ':enqueued' ] = true;
}

function did_action( $hook ) {
    return isset( $GLOBALS['gpp_printed_actions'][ $hook ] ) ? $GLOBALS['gpp_printed_actions'][ $hook ] : 0;
}

function wp_print_styles( $handles = false ) {
    $GLOBALS['gpp_printed_actions']['wp_print_styles'] = did_action( 'wp_print_styles' ) + 1;
    $handles = false === $handles ? array_keys( $GLOBALS['gpp_registered_styles'] ) : $handles;
    foreach ( $handles as $handle ) {
        if ( ! isset( $GLOBALS['gpp_registered_styles'][ $handle ] ) || wp_style_is( $handle, 'done' ) ) {
            continue;
        }
        $style = $GLOBALS['gpp_registered_styles'][ $handle ];
        wp_print_styles( $style['dependencies'] );
        $GLOBALS['gpp_style_states'][ $handle . ':done' ] = true;
        echo '<link id="' . $handle . '-css" rel="stylesheet" href="' . $style['src'] . '?ver=' . $style['version'] . '" />';
    }
}

function wp_style_is( $handle, $status = 'enqueued' ) {
    $key = (string) $handle . ':' . (string) $status;
    return ! empty( $GLOBALS['gpp_style_states'][ $key ] );
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

function __( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
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
    $GLOBALS['gpp_registered_styles'] = array();
    $GLOBALS['gpp_printed_actions'] = array();
    $GLOBALS['gpp_is_admin'] = $admin;
    $GLOBALS['gpp_is_singular'] = $singular;
    $GLOBALS['gpp_queried_object'] = (object) array( 'post_content' => $content );
    $_GET = array();
    $_REQUEST = array();
};
$style_handles = static function () {
    return array_map(
        static function ( $style ) {
            return $style['handle'];
        },
        $GLOBALS['gpp_enqueued_styles']
    );
};
$assert_inbox_styles = static function ( $message ) use ( $style_handles ) {
    gpp_assert_same(
        array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE ),
        $style_handles(),
        $message
    );
};

InboxPresentationAdapter::register();
gpp_assert_same( 2, count( $GLOBALS['gpp_actions'] ), 'Inbox presentation must use both normal WordPress asset lifecycles.' );
gpp_assert_same( 'admin_enqueue_scripts', $GLOBALS['gpp_actions'][0][0], 'Admin Inbox delivery must stay on the admin asset lifecycle.' );
gpp_assert_same( 'wp_enqueue_scripts', $GLOBALS['gpp_actions'][1][0], 'Frontend Inbox delivery must be decided before head styles print.' );
gpp_assert_same( array( InboxPresentationAdapter::class, 'enqueueStyles' ), $GLOBALS['gpp_actions'][0][1], 'Admin enqueue must use the reachability-qualified asset method.' );
gpp_assert_same( array( InboxPresentationAdapter::class, 'enqueueStyles' ), $GLOBALS['gpp_actions'][1][1], 'Frontend enqueue must use the reachability-qualified asset method.' );
gpp_assert_same( 5, count( $GLOBALS['gpp_filters'] ), 'Inbox presentation must preserve native data/render seams and add only the admitted shared-config seam.' );
$shared_config_filters = array_values(
    array_filter(
        $GLOBALS['gpp_filters'],
        static function ( $filter ) {
            return 'gravityflow_js_config_shared' === $filter[0];
        }
    )
);
gpp_assert_same( 1, count( $shared_config_filters ), 'Exactly one GPP shared-config filter must be registered.' );
gpp_assert_same( array( InboxPresentationAdapter::class, 'filterSharedJsConfig' ), $shared_config_filters[0][1], 'Shared config must stay owned by the Inbox presentation adapter.' );
gpp_assert_same( 99, $shared_config_filters[0][2], 'GPP must run after Gravity Flow constructs native Inbox grid config.' );
gpp_assert_same( 1, $shared_config_filters[0][3], 'Shared config seam accepts only the native config payload.' );

$native_grid_options = array(
    'columnDefs' => array( array( 'field' => InboxPresentationAdapter::CARD_COLUMN ) ),
    'rowData' => array( array( 'id' => 1 ) ),
    'pagination' => true,
    'paginationPageSize' => 20,
    'searchArgs' => array( 'page' => 'inbox' ),
    'suppressCellSelection' => true,
);
$secondary_grid_options = $native_grid_options;
$secondary_grid_options['rowData'] = array( array( 'id' => 2 ) );
$secondary_grid_options['paginationPageSize'] = 5;
$unrelated_grid_options = array(
    'columnDefs' => array(),
    'rowData' => array(),
    'pagination' => true,
    'paginationPageSize' => 20,
    'rowBuffer' => 11,
);
$shared_config = array(
    'site_url' => 'https://example.invalid',
    'grids' => array(
        'inbox_default' => array( 'grid_options' => $native_grid_options, 'fetch_enabled' => true ),
        'inbox_secondary' => array( 'grid_options' => $secondary_grid_options, 'fetch_enabled' => false ),
        'unrelated_shape' => array( 'grid_options' => $unrelated_grid_options, 'sentinel' => 'keep' ),
    ),
    'unrelated_config' => array( 'rowBuffer' => 7 ),
);

$set_active_profile( true );
$reset_request( '[gravityflow page="inbox"]' );
$filtered_config = InboxPresentationAdapter::filterSharedJsConfig( $shared_config );
gpp_assert_same( InboxPresentationAdapter::CARD_MODE_ROW_BUFFER, $filtered_config['grids']['inbox_default']['grid_options']['rowBuffer'], 'Admitted native Inbox grid must receive the proven rowBuffer.' );
gpp_assert_same( InboxPresentationAdapter::CARD_MODE_ROW_BUFFER, $filtered_config['grids']['inbox_secondary']['grid_options']['rowBuffer'], 'Every native Inbox grid in the admitted shared payload must receive the same proven rowBuffer.' );
$expected_primary = $native_grid_options;
$expected_primary['rowBuffer'] = InboxPresentationAdapter::CARD_MODE_ROW_BUFFER;
$expected_secondary = $secondary_grid_options;
$expected_secondary['rowBuffer'] = InboxPresentationAdapter::CARD_MODE_ROW_BUFFER;
gpp_assert_same( $expected_primary, $filtered_config['grids']['inbox_default']['grid_options'], 'Applying rowBuffer must preserve all existing native grid options.' );
gpp_assert_same( $expected_secondary, $filtered_config['grids']['inbox_secondary']['grid_options'], 'Applying rowBuffer must preserve secondary native grid options.' );
gpp_assert_same( $shared_config['grids']['unrelated_shape'], $filtered_config['grids']['unrelated_shape'], 'A non-Inbox-shaped grid entry must remain unchanged.' );
gpp_assert_same( $shared_config['unrelated_config'], $filtered_config['unrelated_config'], 'Unrelated shared configuration must remain unchanged.' );

$set_active_profile( false );
$reset_request( '[gravityflow page="inbox"]' );
gpp_assert_same( $shared_config, InboxPresentationAdapter::filterSharedJsConfig( $shared_config ), 'Inactive Inbox presentation must leave native shared config untouched.' );

$set_active_profile( true );
$reset_request( '<p>Unrelated page.</p>' );
gpp_assert_same( $shared_config, InboxPresentationAdapter::filterSharedJsConfig( $shared_config ), 'Active profile on a non-Inbox request must not change Gravity Flow config.' );

$reset_request( '[gravityflow page="inbox"]' );
$malformed_grids = array( 'grids' => 'not-an-array', 'sentinel' => true );
gpp_assert_same( $malformed_grids, InboxPresentationAdapter::filterSharedJsConfig( $malformed_grids ), 'Malformed grid config must fail closed without false repair state.' );
gpp_assert_same( 'not-an-array', InboxPresentationAdapter::filterSharedJsConfig( 'not-an-array' ), 'Malformed shared payload must pass through unchanged.' );

$set_active_profile( true );
$reset_request();
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'An active Inbox profile alone must not deliver Inbox styles.' );

$reset_request( '<p>Unrelated page.</p>' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'An unrelated singular frontend page must not receive Inbox styles.' );

$reset_request( '[gravityflow page="inbox"]' );
$GLOBALS['gpp_style_states']['global-styles:enqueued'] = true;
InboxPresentationAdapter::enqueueStyles();
$assert_inbox_styles( 'An exact current-page Gravity Flow Inbox shortcode must qualify early style delivery.' );
gpp_assert_same(
    array( 'global-styles' ),
    $GLOBALS['gpp_enqueued_styles'][0]['dependencies'],
    'When WordPress global styles are active, Inbox presentation must print after the host layout cascade.'
);

$reset_request( '<!-- [gravityflow page="inbox"] -->' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'A Gravity Flow Inbox shortcode inside an HTML comment must not qualify Inbox style delivery.' );

$reset_request( '<![CDATA[ [gravityflow page="inbox"] ]]>' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'A Gravity Flow Inbox shortcode inside CDATA must not qualify Inbox style delivery.' );

$reset_request( '[[gravityflow page="inbox"]]' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'An escaped shortcode must not qualify Inbox style delivery.' );

$reset_request( '[gravityflow page="entry"]' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'A non-Inbox Gravity Flow shortcode must not qualify Inbox styles.' );

$reset_request( '<!-- wp:gravityflow/inbox /-->' );
InboxPresentationAdapter::enqueueStyles();
$assert_inbox_styles( 'The exact registered native Inbox block in current post content must qualify early style delivery.' );

$lookalike = '<div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div>';
$reset_request( '<!-- wp:html -->' . $lookalike . '<!-- /wp:html -->' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Native-looking markup inside an unrelated block must not qualify early style delivery.' );
$returned = InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => 'core/html' ) );
gpp_assert_same( $lookalike, $returned, 'Block qualification must never alter host output.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Lookalike block render must not independently qualify style delivery.' );

$reset_request( '<p>Dynamic host render.</p>' );
$returned = InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK ) );
gpp_assert_same( $lookalike, $returned, 'Authentic native block reachability must preserve host output.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Authentic block pre-render must not enqueue styles ahead of the WordPress asset lifecycle.' );
InboxPresentationAdapter::enqueueStyles();
$assert_inbox_styles( 'The exact registered native Inbox block render seam must qualify delivery when the asset lifecycle runs.' );

$reset_request( '<p>Dynamic shortcode host render.</p>' );
$native_shortcode = '<div class="gravityflow_wrap"><div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div></div>';
$wrapped = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Authentic shortcode pre-render must not enqueue styles ahead of the WordPress asset lifecycle.' );
InboxPresentationAdapter::enqueueStyles();
$assert_inbox_styles( 'The authentic Gravity Flow Inbox shortcode render seam must qualify delivery when the asset lifecycle runs.' );
gpp_assert_true( false !== strpos( $wrapped, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Authentic active shortcode Inbox must retain admitted composition.' );

// The asset hook and head printing have completed before dynamically rendered Inbox output.
$reset_request( '<p>Dynamic shortcode host render.</p>' );
InboxPresentationAdapter::enqueueStyles();
ob_start();
wp_print_styles();
ob_end_clean();
$late_shortcode = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
gpp_assert_same( 1, substr_count( $late_shortcode, 'id="' . InboxPresentationAdapter::STYLE_HANDLE . '-css"' ), 'Late shortcode must emit one presentation link.' );
gpp_assert_same( 1, substr_count( $late_shortcode, 'id="' . InboxPresentationAdapter::NATIVE_STYLE_HANDLE . '-css"' ), 'Late shortcode must emit one native link.' );
gpp_assert_true( strpos( $late_shortcode, '-css"' ) < strpos( $late_shortcode, 'data-gpp-inbox-surface=' ), 'Late shortcode CSS must precede Inbox output.' );
gpp_assert_true( strpos( $late_shortcode, 'id="' . InboxPresentationAdapter::STYLE_HANDLE . '-css"' ) < strpos( $late_shortcode, 'id="' . InboxPresentationAdapter::NATIVE_STYLE_HANDLE . '-css"' ), 'Late native projection must follow presentation CSS.' );
gpp_assert_true( false !== strpos( $late_shortcode, '?ver=' . substr( hash_file( 'sha256', dirname( GPP_PLUGIN_FILE ) . '/assets/css/srwf-gravity-flow-inbox.css' ), 0, 16 ) ), 'Late presentation must retain content-derived version.' );
$second_shortcode = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
gpp_assert_same( 0, substr_count( $second_shortcode, '-css"' ), 'Second Inbox shortcode must not duplicate links.' );

$reset_request( '<p>Dynamic block host render.</p>' );
InboxPresentationAdapter::enqueueStyles();
ob_start();
wp_print_styles();
ob_end_clean();
$late_block = InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK ) );
gpp_assert_same( 1, substr_count( $late_block, 'id="' . InboxPresentationAdapter::STYLE_HANDLE . '-css"' ), 'Late registered native block must emit one presentation link.' );
gpp_assert_same( 1, substr_count( $late_block, 'id="' . InboxPresentationAdapter::NATIVE_STYLE_HANDLE . '-css"' ), 'Late registered native block must emit one native link.' );
gpp_assert_true( strpos( $late_block, '-css"' ) < strpos( $late_block, $lookalike ), 'Late block CSS must precede its output.' );
gpp_assert_same( $lookalike, InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK ) ), 'Second Inbox block must not duplicate links.' );

$reset_request( '[gravityflow page="inbox"]' );
$GLOBALS['gpp_style_states']['global-styles:enqueued'] = true;
$GLOBALS['gpp_style_states']['global-styles:done'] = true;
$GLOBALS['gpp_style_states']['wp-theme:registered'] = true;
InboxPresentationAdapter::enqueueStyles();
ob_start();
wp_print_styles();
$head_styles = ob_get_clean();
gpp_assert_same( 1, substr_count( $head_styles, 'id="' . InboxPresentationAdapter::STYLE_HANDLE . '-css"' ), 'Early head path must print the presentation link once.' );
gpp_assert_same( 1, substr_count( $head_styles, 'id="' . InboxPresentationAdapter::NATIVE_STYLE_HANDLE . '-css"' ), 'Early head path must print the native link once.' );
gpp_assert_same( 0, substr_count( InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' ), '-css"' ), 'An early head delivery must not repeat styles at render.' );
gpp_assert_same( array( 'global-styles', 'wp-theme' ), $GLOBALS['gpp_registered_styles'][ InboxPresentationAdapter::STYLE_HANDLE ]['dependencies'], 'Host styles must precede presentation CSS when available.' );

$reset_request( '<p>Unrelated.</p>' );
InboxPresentationAdapter::enqueueStyles();
ob_start();
wp_print_styles();
ob_end_clean();
gpp_assert_same( $lookalike, InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => 'core/html' ) ), 'Late unrelated block must emit no styles.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Late unrelated block must not enqueue styles.' );
$unrelated_shortcode = '<p>Unrelated shortcode output.</p>';
gpp_assert_same( $unrelated_shortcode, InboxPresentationAdapter::filterShortcodeInbox( $unrelated_shortcode, array(), '' ), 'Late unrelated shortcode output must not emit styles.' );

$set_active_profile( false );
$reset_request();
InboxPresentationAdapter::enqueueStyles();
ob_start();
wp_print_styles();
ob_end_clean();
gpp_assert_same( $native_shortcode, InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' ), 'Late inactive shortcode must remain native without styles.' );
gpp_assert_same( $lookalike, InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK ) ), 'Late inactive block must remain native without styles.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Late inactive profile must not enqueue Inbox styles.' );
$set_active_profile( true );

$reset_request( '', true );
InboxPresentationAdapter::enqueueStyles();
ob_start();
wp_print_styles();
ob_end_clean();
gpp_assert_same( 0, substr_count( InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' ), '-css"' ), 'Admin render must not deliver frontend Inbox styles.' );
gpp_assert_same( $lookalike, InboxPresentationAdapter::filterFrontendBlock( $lookalike, array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK ) ), 'Admin block must not deliver frontend Inbox styles.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Admin render seam must not enqueue Inbox styles outside the admin list route.' );

$reset_request( '', true );
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueStyles();
$assert_inbox_styles( 'The exact native admin Inbox list request must receive both styles.' );

$reset_request( '', true );
$_GET = array( 'page' => 'gravityflow-inbox', 'view' => 'entry', 'lid' => '42' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Gravity Flow Entry Detail must not receive Inbox presentation styles.' );

$reset_request( '', true );
$_GET = array( 'page' => 'gf_settings' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Unrelated wp-admin requests must not receive Inbox presentation styles.' );

$reset_request( '', true );
$_GET = array( 'action' => 'gravityflow_print_entries', 'lid' => '42', 'gpp_presentation' => 'dossier' );
$_REQUEST = array( 'action' => 'gravityflow_print_entries' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Gravity Flow Print requests must not receive Inbox presentation styles.' );

$set_active_profile( false );
$reset_request( '[gravityflow page="inbox"]' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Inactive authentic frontend Inbox must not receive GPP Inbox styles.' );
$native_inactive = InboxPresentationAdapter::filterShortcodeInbox( $native_shortcode, array(), '' );
gpp_assert_same( $native_shortcode, $native_inactive, 'Inactive frontend Inbox must remain native and unwrapped.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Inactive shortcode reachability must not deliver GPP Inbox styles.' );

$reset_request( '', true );
$_GET = array( 'page' => 'gravityflow-inbox' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Inactive authentic admin Inbox must remain native without GPP Inbox styles.' );

echo "INBOX_ASSET_REACHABILITY_PASS\n";
