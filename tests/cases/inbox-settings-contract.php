<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_actions'] = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    unset( $hook, $callback, $priority, $accepted_args );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function __( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function esc_html( $text ) {
    return (string) $text;
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

class GFAPI {
    public static function get_forms() {
        return array(
            array( 'id' => 11, 'title' => 'SRWF Form 11' ),
            array( 'id' => 12, 'title' => 'Other Operations Form' ),
        );
    }
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

$bootstrap = null;
foreach ( $GLOBALS['gpp_actions'] as $action ) {
    if ( 'gform_loaded' === $action[0] ) {
        $bootstrap = $action[1];
        break;
    }
}
gpp_assert_true( is_callable( $bootstrap ), 'Plugin bootstrap must expose its Gravity Forms integration through gform_loaded.' );
gpp_assert_same( true, call_user_func( $bootstrap ), 'Gravity Forms integration must load successfully.' );

gpp_assert_same(
    array( 'GravityPresentationProfiles\\GravityForms\\AddOn' ),
    GFAddOn::$registered,
    'GPP must register exactly one GFAddOn implementation.'
);

foreach ( $GLOBALS['gpp_actions'] as $action ) {
    gpp_assert_true(
        'admin_post_gpp_initialize_inbox_presentation' !== $action[0],
        'Inbox setup must not retain the parallel admin-post mutation endpoint.'
    );
    if ( 'admin_notices' === $action[0] && is_array( $action[1] ) ) {
        gpp_assert_true(
            'GravityPresentationProfiles\\GravityForms\\InboxSetupAdminController' !== $action[1][0],
            'Inbox setup must not depend on an admin_notices mutation UI.'
        );
    }
}

$addon_class = GFAddOn::$registered[0];
$addon = $addon_class::get_instance();
$sections = $addon->plugin_settings_fields();

$print_index = null;
$inbox_index = null;
foreach ( $sections as $index => $section ) {
    if ( 'Operations Setup (Print)' === $section['title'] ) {
        $print_index = $index;
    }
    if ( 'Operations Setup (Inbox)' === $section['title'] ) {
        $inbox_index = $index;
    }
}

gpp_assert_true( null !== $print_index, 'The real GF plugin settings contract must retain a dedicated Print section.' );
gpp_assert_true( null !== $inbox_index, 'The real GF plugin settings contract must expose a dedicated Inbox section.' );
gpp_assert_same( $print_index + 1, $inbox_index, 'Inbox setup must appear immediately after Print setup.' );

$print_fields = array();
foreach ( $sections[ $print_index ]['fields'] as $field ) {
    $print_fields[ $field['name'] ] = $field;
}
$inbox_fields = array();
foreach ( $sections[ $inbox_index ]['fields'] as $field ) {
    $inbox_fields[ $field['name'] ] = $field;
}

gpp_assert_true( isset( $print_fields['operations_setup_action'] ), 'Print setup action must remain present.' );
gpp_assert_same(
    array( $addon, 'validate_operations_setup_action' ),
    $print_fields['operations_setup_action']['validation_callback'],
    'Print must keep its existing Print-only mutation callback.'
);

gpp_assert_true( isset( $inbox_fields['inbox_setup_action'] ), 'Inbox section must expose a first-class settings action.' );
gpp_assert_same( 'select', $inbox_fields['inbox_setup_action']['type'], 'Inbox setup must use the supported GF Settings select field.' );
gpp_assert_same(
    array( $addon, 'validate_inbox_setup_action' ),
    $inbox_fields['inbox_setup_action']['validation_callback'],
    'Inbox settings action must route through the dedicated settings validation seam.'
);
gpp_assert_same(
    array( $addon, 'discard_inbox_setup_action' ),
    $inbox_fields['inbox_setup_action']['save_callback'],
    'Inbox action selector must not become a second persistent settings store.'
);
gpp_assert_true(
    $print_fields['operations_setup_action']['validation_callback'] !== $inbox_fields['inbox_setup_action']['validation_callback'],
    'Print and Inbox must remain separate explicit operator actions.'
);

$choice_values = array_column( $inbox_fields['inbox_setup_action']['choices'], 'value' );
gpp_assert_true( in_array( '', $choice_values, true ), 'Inbox action must default to no mutation.' );
gpp_assert_true( in_array( 'form:11', $choice_values, true ), 'Inbox action must expose exact SRWF Form 11 selection.' );
gpp_assert_true( in_array( 'form:12', $choice_values, true ), 'Inbox action must expose exact real-form identities without guessing.' );

gpp_assert_true( isset( $inbox_fields['inbox_setup_feedback'] ), 'Inbox section must expose bounded in-settings feedback.' );
gpp_assert_same( 'gpp_inbox_setup_feedback', $inbox_fields['inbox_setup_feedback']['type'], 'Inbox feedback must render through the GF settings contract.' );

echo "INBOX_SETTINGS_CONTRACT_PASS\n";
