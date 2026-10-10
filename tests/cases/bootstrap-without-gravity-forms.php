<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_enqueued_styles'] = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function wp_enqueue_style() {
    $GLOBALS['gpp_enqueued_styles'][] = func_get_args();
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

gpp_assert_same( 2, count( $GLOBALS['gpp_actions'] ), 'Bootstrap must register native translation-path setup and the deferred Gravity Forms callback.' );
gpp_assert_same( 'init', $GLOBALS['gpp_actions'][0][0], 'Translation path must be registered on WordPress init, not during plugin load.' );
gpp_assert_same( 1, $GLOBALS['gpp_actions'][0][2], 'Translation path registration must precede GF add-on settings construction.' );
gpp_assert_same( 'gform_loaded', $GLOBALS['gpp_actions'][1][0], 'Bootstrap must defer Gravity Forms integration until gform_loaded.' );
$GLOBALS['gpp_textdomain_registered'] = null;
function plugin_basename( $file ) { return basename( dirname( $file ) ) . '/' . basename( $file ); }
function load_plugin_textdomain( $domain, $deprecated, $relative_path ) {
    unset( $deprecated );
    $GLOBALS['gpp_textdomain_registered'] = array( $domain, $relative_path );
    return true;
}
call_user_func( $GLOBALS['gpp_actions'][0][1] );
gpp_assert_same(
    array( 'gravity-presentation-profiles', dirname( plugin_basename( GPP_PLUGIN_FILE ) ) . '/languages' ),
    $GLOBALS['gpp_textdomain_registered'],
    'Native init hook must register the bundled gettext directory without Gravity Forms present.'
);
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Loading the plugin without Gravity Forms must not enqueue presentation assets.' );
gpp_assert_same( false, \GravityPresentationProfiles\Bootstrap::loadGravityFormsIntegration(), 'Missing Gravity Forms must fail closed without loading the add-on.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Graceful Gravity Forms absence must remain asset-inert.' );

echo "BOOTSTRAP_WITHOUT_GRAVITY_FORMS_PASS\n";
