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

gpp_assert_same( 1, count( $GLOBALS['gpp_actions'] ), 'Plugin load should register only the deferred gform_loaded bootstrap hook.' );
gpp_assert_same( 'gform_loaded', $GLOBALS['gpp_actions'][0][0], 'Bootstrap must defer Gravity Forms integration until gform_loaded.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Loading the plugin without Gravity Forms must not enqueue presentation assets.' );
gpp_assert_same( false, \GravityPresentationProfiles\Bootstrap::loadGravityFormsIntegration(), 'Missing Gravity Forms must fail closed without loading the add-on.' );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Graceful Gravity Forms absence must remain asset-inert.' );

echo "BOOTSTRAP_WITHOUT_GRAVITY_FORMS_PASS\n";
