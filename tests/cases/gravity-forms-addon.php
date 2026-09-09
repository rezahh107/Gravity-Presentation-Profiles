<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();
$GLOBALS['gpp_enqueued_styles'] = array();

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

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . ltrim( $path, '/' );
}

function plugin_dir_path( $file ) {
    return dirname( $file ) . '/';
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_enqueued_styles'][] = array(
        'handle'       => $handle,
        'src'          => $src,
        'dependencies' => $dependencies,
        'version'      => $version,
        'media'        => $media,
    );
}

class GFForms {
    public static $framework_included = false;

    public static function include_addon_framework() {
        self::$framework_included = true;
    }
}

class GFAddOn {
    public static $registered = array();

    public static function register( $class ) {
        self::$registered[] = $class;
    }

    public function init_frontend() {
    }

    public function get_form_settings( $form ) {
        return isset( $form[ $this->_slug ] ) && is_array( $form[ $this->_slug ] )
            ? $form[ $this->_slug ]
            : array();
    }
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

gpp_assert_same( 1, count( $GLOBALS['gpp_actions'] ), 'Plugin bootstrap should defer registration through gform_loaded.' );
$bootstrap_callback = $GLOBALS['gpp_actions'][0][1];
gpp_assert_same( true, call_user_func( $bootstrap_callback ), 'Gravity Forms availability should load and register the add-on.' );
gpp_assert_same( true, GFForms::$framework_included, 'Bootstrap should ask Gravity Forms to include its Add-On Framework.' );
gpp_assert_same( array( 'GravityPresentationProfiles\\GravityForms\\AddOn' ), GFAddOn::$registered, 'Exactly the GPP add-on class should register.' );

$addon_class = GFAddOn::$registered[0];
gpp_assert_true( method_exists( $addon_class, 'get_instance' ), 'Registered GFAddOn must expose the documented singleton accessor.' );
$addon = $addon_class::get_instance();
gpp_assert_same( $addon, $addon_class::get_instance(), 'GFAddOn singleton accessor must return the same instance.' );
$sections = $addon->form_settings_fields( array( 'id' => 17 ) );
$fields   = $sections[0]['fields'];

gpp_assert_same( 'enabled', $fields[0]['name'], 'Form settings must expose the canonical enable setting.' );
gpp_assert_same( 'checkbox', $fields[0]['type'], 'Enable setting must use a Gravity Forms checkbox field.' );
gpp_assert_same( 'profile', $fields[1]['name'], 'Form settings must expose the canonical profile setting.' );
gpp_assert_same( 'select', $fields[1]['type'], 'Profile setting must use a Gravity Forms select field.' );

$profile_values = array();
foreach ( $fields[1]['choices'] as $choice ) {
    $profile_values[] = $choice['value'];
}
gpp_assert_true( in_array( 'srwf-registration', $profile_values, true ), 'The profile selector must offer srwf-registration.' );

$addon->init_frontend();
$frontend_action_hooks = array_map( function ( $item ) { return $item[0]; }, $GLOBALS['gpp_actions'] );
$frontend_filter_hooks = array_map( function ( $item ) { return $item[0]; }, $GLOBALS['gpp_filters'] );
gpp_assert_true( in_array( 'gform_enqueue_scripts', $frontend_action_hooks, true ), 'Frontend integration must use the documented per-form enqueue hook.' );
gpp_assert_true( in_array( 'gform_form_tag', $frontend_filter_hooks, true ), 'Frontend integration must derive semantic classes through the documented form-tag filter.' );

$valid_form = array(
    'id' => 17,
    'gravity-presentation-profiles' => array(
        'enabled' => '1',
        'profile' => 'srwf-registration',
    ),
);
$disabled_form = array(
    'id' => 18,
    'gravity-presentation-profiles' => array(
        'enabled' => '0',
        'profile' => 'srwf-registration',
    ),
);
$unknown_form = array(
    'id' => 19,
    'gravity-presentation-profiles' => array(
        'enabled' => '1',
        'profile' => 'unknown-profile',
    ),
);

$GLOBALS['gpp_enqueued_styles'] = array();
$addon->enqueue_form_assets( $disabled_form, false );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Disabled forms must enqueue no GPP styles.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$addon->enqueue_form_assets( $unknown_form, false );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Unknown profiles must enqueue no GPP styles.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$addon->enqueue_form_assets( $valid_form, false );
gpp_assert_same( 2, count( $GLOBALS['gpp_enqueued_styles'] ), 'Valid enabled forms must enqueue Base + selected-profile styles.' );
gpp_assert_same( 'gpp-base', $GLOBALS['gpp_enqueued_styles'][0]['handle'], 'Base style should enqueue first.' );
gpp_assert_same( 'gpp-profile-srwf-registration', $GLOBALS['gpp_enqueued_styles'][1]['handle'], 'Selected profile style should enqueue second.' );
gpp_assert_same( array( 'gpp-base' ), $GLOBALS['gpp_enqueued_styles'][1]['dependencies'], 'Selected profile style should depend on Base.' );

$plain_tag = "<form method='post'>";
$valid_tag = $addon->add_form_state_classes( $plain_tag, $valid_form );
$disabled_tag = $addon->add_form_state_classes( $plain_tag, $disabled_form );
$unknown_tag = $addon->add_form_state_classes( $plain_tag, $unknown_form );
gpp_assert_true( false !== strpos( $valid_tag, 'gpp-enabled' ), 'Enabled valid forms must receive derived semantic state.' );
gpp_assert_true( false !== strpos( $valid_tag, 'gpp-profile-srwf-registration' ), 'Enabled valid forms must receive only their selected profile class.' );
gpp_assert_same( $plain_tag, $disabled_tag, 'Disabled forms must receive no GPP semantic class.' );
gpp_assert_same( $plain_tag, $unknown_tag, 'Unknown profiles must receive no GPP semantic class.' );

echo "GRAVITY_FORMS_ADDON_PASS\n";
