<?php

require_once __DIR__ . '/../helpers.php';

define( 'ABSPATH', __DIR__ . '/' );
$GLOBALS['gpp_axis_setting'] = null;
$GLOBALS['gpp_axis_inline'] = array();
$GLOBALS['gpp_axis_styles'] = array();
$GLOBALS['gpp_axis_locale'] = 'fa_IR';
$GLOBALS['gpp_axis_capable'] = true;
$GLOBALS['gpp_axis_pgr'] = null;

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {}
function esc_html__( $text, $domain = '' ) { return $text; }
function esc_attr__( $text, $domain = '' ) { return $text; }
function __( $text, $domain = '' ) { return $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function get_locale() { return $GLOBALS['gpp_axis_locale']; }
function is_admin() { return true; }
function wp_unslash( $v ) { return $v; }
function sanitize_key( $v ) { return strtolower( preg_replace( '/[^a-zA-Z0-9_-]/', '', $v ) ); }
function plugins_url( $path, $file ) { return '/plugins/gpp/' . $path; }
function wp_style_is( $handle, $state = 'enqueued' ) { return false; }
function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_axis_styles'][] = $handle;
}
function wp_add_inline_style( $handle, $css ) {
    $GLOBALS['gpp_axis_inline'][] = array( 'handle' => $handle, 'css' => $css );
    return true;
}

class GFCommon {
    public static function current_user_can_any( $capability ) {
        gpp_assert_same( 'gravityforms_edit_settings', $capability, 'Settings must check GF administration capability.' );
        return $GLOBALS['gpp_axis_capable'];
    }
}
class GFAddOn {
    public function get_plugin_setting( $key ) {
        gpp_assert_same( 'inbox_axis_ltr', $key, 'Only GPP Add-On settings may supply the axis preference.' );
        return $GLOBALS['gpp_axis_setting'];
    }
}
function pgr_gravity_flow_inbox_rtl_status() { return $GLOBALS['gpp_axis_pgr']; }

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

use GravityPresentationProfiles\GravityForms\AddOn;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxAxisIntervention;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

$set_adapter_ready = static function () {
    $ref = new ReflectionClass( InboxPresentationAdapter::class );
    $reached = $ref->getProperty( 'surface_reached' );
    $reached->setAccessible( true );
    $reached->setValue( null, true );
    $model_loaded = $ref->getProperty( 'model_loaded' );
    $model_loaded->setAccessible( true );
    $model_loaded->setValue( null, true );
    $model = $ref->getProperty( 'model' );
    $model->setAccessible( true );
    $model->setValue( null, new stdClass() );
};

// Missing setting must retain the exact existing-site Mode A CSS behavior.
$status = gpp_gravity_flow_inbox_axis_status();
gpp_assert_same( 'on', $status['requested'], 'Missing old plugin setting must default to ON.' );
gpp_assert_same( 'on', $status['effective'], 'Missing setting must preserve the legacy axis.' );
gpp_assert_same( 'not_observed', $status['grid_mode'], 'GPP PHP API must not invent initialized Grid mode.' );
gpp_assert_same( 1, substr_count( InboxAxisIntervention::css(), 'direction: ltr !important;' ), 'Admitted correction must have one CSS rule.' );
foreach ( array( '.ag-root-wrapper', '.ag-header-viewport', '.ag-center-cols-viewport', '.ag-body-horizontal-scroll-viewport' ) as $selector ) {
    gpp_assert_same( 1, substr_count( InboxAxisIntervention::css(), $selector ), 'Original node selector missing: ' . $selector );
}
$addon = AddOn::get_instance();
$sections = $addon->plugin_settings_fields();
$inbox = array_values( array_filter( $sections, static function( $s ) {return 'Operations Setup (Inbox)' === $s['title'];} ) );
gpp_assert_same( 1, count( $inbox ), 'Native GF Add-On settings section must be retained.' );
$settings = array_column( $inbox[0]['fields'], null, 'name' );
gpp_assert_same( 'select', $settings['inbox_axis_ltr']['type'], 'Axis control must use the existing native GF Add-On framework.' );
gpp_assert_same( 'on', $settings['inbox_axis_ltr']['default_value'], 'Settings UI must show ON for legacy installs.' );
gpp_assert_same( array( 'on', 'off' ), array_column( $settings['inbox_axis_ltr']['choices'], 'value' ), 'Only ON/OFF are admitted.' );

$_GET['page'] = 'gravityflow-inbox';
$set_adapter_ready();
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( 1, count( $GLOBALS['gpp_axis_inline'] ), 'ON must emit the four-axis CSS once.' );
gpp_assert_same( InboxAxisIntervention::css(), $GLOBALS['gpp_axis_inline'][0]['css'], 'Mode A CSS must be byte-identical to approved declaration.' );
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( 1, count( $GLOBALS['gpp_axis_inline'] ), 'Repeated style enqueue must not duplicate the rule.' );

// Switching OFF must not emit ANY GPP-owned physical-axis CSS.
$GLOBALS['gpp_axis_setting'] = 'off';
InboxPresentationAdapter::resetRuntimeCache();
$set_adapter_ready();
$GLOBALS['gpp_axis_inline'] = array();
InboxPresentationAdapter::enqueueStyles();
gpp_assert_same( array(), $GLOBALS['gpp_axis_inline'], 'OFF must not emit LTR-axis CSS.' );
gpp_assert_same( 'off', gpp_gravity_flow_inbox_axis_status()['effective'], 'Public GPP status must report OFF.' );
gpp_assert_same( 2, count( array_slice( $GLOBALS['gpp_axis_styles'], -2 ) ), 'OFF must still enqueue the normal Inbox styles.' );

// Invalid persisted value: report UNKNOWN but do not accidentally remove prior CSS.
$GLOBALS['gpp_axis_setting'] = 'tampered';
gpp_assert_same( 'unknown', gpp_gravity_flow_inbox_axis_status()['requested'], 'Malformed settings must be explicit UNKNOWN.' );
gpp_assert_same( 'on', gpp_gravity_flow_inbox_axis_status()['effective'], 'Malformed settings must preserve the shipped axis.' );
$probe = new class {
    public $error = null;
    public function set_error( $msg ) { $this->error = $msg; }
};
$addon->validate_inbox_axis_setting( $probe, 'tampered' );
gpp_assert_true( is_string( $probe->error ) && '' !== $probe->error, 'Tampered value must be rejected before GF saves.' );
$probe->error = null;
$addon->validate_inbox_axis_setting( $probe, 'off' );
gpp_assert_same( null, $probe->error, 'Valid OFF must be accepted.' );

$GLOBALS['gpp_axis_setting'] = 'on';
$GLOBALS['gpp_axis_pgr'] = array( 'api_version'=>1, 'capability'=>'supported', 'requested'=>'on', 'host'=>'admitted', 'grid_mode'=>'not_observed', 'request_rtl'=>true );
gpp_assert_same( 'incompatible', InboxAxisIntervention::compatibilityFacts()['compatibility'], 'Both ON, admitted host, Persian site must warn.' );
ob_start();
$addon->settings_gpp_inbox_axis_compatibility( null );
$html = ob_get_clean();
gpp_assert_true( false !== strpos( $html, 'data-gpp-inbox-axis-compatibility="incompatible"' ), 'Persistent GPP incompatibility warning missing.' );
gpp_assert_true( false !== strpos( $html, '<details>' ) && false !== strpos( $html, 'role="img"' ) && false !== strpos( $html, 'aria-label=' ), 'Accessible details and diagram text missing.' );

$GLOBALS['gpp_axis_setting'] = 'off';
gpp_assert_same( 'unknown', InboxAxisIntervention::compatibilityFacts()['compatibility'], 'GPP OFF must not inherit the ON/ON incompatible label.' );
$GLOBALS['gpp_axis_setting'] = 'on';
$GLOBALS['gpp_axis_locale'] = 'en_US';
gpp_assert_same( 'unknown', InboxAxisIntervention::compatibilityFacts()['compatibility'], 'Non-Persian site must not be classified as proven affected.' );
$GLOBALS['gpp_axis_locale'] = 'fa_IR';
$GLOBALS['gpp_axis_pgr']['host'] = 'unsupported';
gpp_assert_same( 'unknown', InboxAxisIntervention::compatibilityFacts()['compatibility'], 'Wrong Flow host is not proven affected.' );
$GLOBALS['gpp_axis_pgr'] = array( 'api_version'=>99, 'capability'=>'supported', 'requested'=>'on', 'host'=>'admitted' );
gpp_assert_same( 'unsupported', InboxAxisIntervention::compatibilityFacts()['pgr']['capability'], 'Unknown PGR contract version cannot masquerade as supported.' );
$GLOBALS['gpp_axis_capable'] = false;
ob_start();
$addon->settings_gpp_inbox_axis_compatibility( null );
$denied = ob_get_clean();
gpp_assert_same( '', $denied, 'Low privilege caller must not receive the admin-only warning panel.' );
echo "GPP_INBOX_AXIS_INDEPENDENT_SWITCH_PASS\n";
