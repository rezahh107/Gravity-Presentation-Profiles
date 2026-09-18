<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

class GFForms {
    public static function include_addon_framework() {
    }
}

class GFAddOn {
    public static $registered = array();
    public static function register( $class ) {
        self::$registered[] = $class;
    }
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

$gform_loaded = array_values(
    array_filter(
        $GLOBALS['gpp_actions'],
        static function ( $item ) {
            return 'gform_loaded' === $item[0];
        }
    )
);
gpp_assert_same( 1, count( $gform_loaded ), 'Expected one Gravity Forms bootstrap callback.' );
gpp_assert_same( true, call_user_func( $gform_loaded[0][1] ), 'Gravity Forms bootstrap should register GPP integration.' );

$action_hooks = array_map(
    static function ( $item ) {
        return $item[0];
    },
    $GLOBALS['gpp_actions']
);
$filter_hooks = array_map(
    static function ( $item ) {
        return $item[0];
    },
    $GLOBALS['gpp_filters']
);

gpp_assert_true( ! in_array( 'admin_notices', $action_hooks, true ), 'Entry Detail mapping UI must not depend on admin_notices.' );
gpp_assert_true( in_array( 'admin_post_gpp_entry_detail_mapping_save', $action_hooks, true ), 'Entry Detail mapping save must have one explicit admin-post boundary.' );
gpp_assert_true( ! in_array( 'gform_addon_app_settings_menu_gravity-presentation-profiles', $filter_hooks, true ), 'Entry Detail mapping must not attach to the unrelated GF App Settings lifecycle.' );

$root = dirname( __DIR__, 2 );
$addon_source = file_get_contents( $root . '/src/GravityForms/AddOn.php' );
$controller_source = file_get_contents( $root . '/src/GravityForms/EntryDetailMappingAdminController.php' );

gpp_assert_true( false !== strpos( $addon_source, "'type'  => 'gpp_entry_detail_mapping'" ) || false !== strpos( $addon_source, "'type' => 'gpp_entry_detail_mapping'" ), 'Plugin Settings fields must contain the Entry Detail batch mapping renderer.' );
gpp_assert_true( false !== strpos( $addon_source, 'settings_gpp_entry_detail_mapping' ), 'The GPP Add-On must expose the custom Plugin Settings field callback.' );
gpp_assert_true( false !== strpos( $addon_source, 'EntryDetailMappingAdminController::renderEmbedded' ), 'The Plugin Settings callback must delegate to the bounded Entry Detail mapping controller.' );
gpp_assert_true( false === strpos( $controller_source, '<form' ), 'Embedded mapping UI must not create a nested form inside the GF settings form.' );
gpp_assert_true( false !== strpos( $controller_source, 'formaction=' ), 'The mapping button must cross the dedicated admin-post boundary without hijacking unrelated GF settings persistence.' );
gpp_assert_true( false !== strpos( $controller_source, 'gpp_entry_detail_context_token' ), 'Each mapping save must identify exactly one revalidated binding context.' );

echo "ENTRY_DETAIL_MAPPING_SETTINGS_SEAM_PASS\n";
