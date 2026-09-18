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
gpp_assert_same( true, call_user_func( $gform_loaded[0][1] ), 'Gravity Forms bootstrap should register the GPP add-on.' );
gpp_assert_same( array( 'GravityPresentationProfiles\\GravityForms\\AddOn' ), GFAddOn::$registered, 'GPP should still register exactly one add-on class.' );

$addon_class = GFAddOn::$registered[0];
$addon = $addon_class::get_instance();
$sections = $addon->plugin_settings_fields();
$entry_detail = null;
foreach ( $sections as $section ) {
    if ( isset( $section['title'] ) && 'Operations Setup (Entry Detail)' === $section['title'] ) {
        $entry_detail = $section;
        break;
    }
}

gpp_assert_true( is_array( $entry_detail ), 'Entry Detail setup must be rendered by the native GF Add-On plugin-settings lifecycle.' );
gpp_assert_same( 1, count( $entry_detail['fields'] ), 'Entry Detail setup should expose one explicit transient action field.' );
$field = $entry_detail['fields'][0];
gpp_assert_same( 'entry_detail_setup_action', $field['name'], 'Entry Detail settings action name must be stable.' );
gpp_assert_same( 'select', $field['type'], 'Entry Detail setup must use a native Settings API select field.' );
gpp_assert_same( array( $addon, 'validate_entry_detail_setup_action' ), $field['validation_callback'], 'Entry Detail setup must run through the GF settings-save validation callback.' );
gpp_assert_same( array( $addon, 'discard_entry_detail_setup_action' ), $field['save_callback'], 'Entry Detail setup action must never persist as ordinary plugin settings state.' );
gpp_assert_same( '', $addon->discard_entry_detail_setup_action( null, 'form:11' ), 'Entry Detail action value must be discarded after processing.' );

$hooks = array_map(
    static function ( $item ) {
        return $item[0];
    },
    $GLOBALS['gpp_actions']
);
gpp_assert_true( in_array( 'admin_post_gpp_initialize_entry_detail_presentation', $hooks, true ), 'Legacy explicit admin-post endpoint should remain available.' );
gpp_assert_true( ! in_array( 'admin_notices', $hooks, true ), 'Entry Detail setup UI must not depend on the admin_notices lifecycle.' );

echo "ENTRY_DETAIL_SETTINGS_CONTRACT_PASS\n";
