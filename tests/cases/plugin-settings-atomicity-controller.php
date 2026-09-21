<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\GravityForms\AddOn;
use GravityPresentationProfiles\GravityForms\PluginSettingsAtomicityController;

$GLOBALS['gpp_atomicity_actions'] = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_atomicity_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}
function is_admin() { return true; }
function sanitize_key( $value ) { return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $value ) ); }
function wp_unslash( $value ) { return $value; }
function esc_html__( $value ) { return $value; }
function __( $value ) { return $value; }

final class AtomicityField {
    public $name;
    public $error = null;
    public function __construct( $name ) { $this->name = $name; }
    public function set_error( $message ) { $this->error = $message; }
}

final class AtomicityCommitRecorder {
    public static $calls = array();
    public static function mutate( $field, $value ) {
        self::$calls[] = array( 'name' => $field->name, 'value' => $value );
    }
}

class GFAddOn {
    public static $registered = array();
    protected $atomicity_fields = array();
    protected $atomicity_renderer;

    public static function register( $class ) { self::$registered[] = $class; }
    public function __construct() {
        $this->atomicity_renderer = (object) array( 'ready' => true );
        foreach ( array( 'operations_setup_action', 'entry_detail_setup_action' ) as $name ) {
            $this->atomicity_fields[ $name ] = array(
                'name' => $name,
                'validation_callback' => array( 'AtomicityCommitRecorder', 'mutate' ),
                'save_callback' => static function () { return ''; },
            );
        }
    }
    public function get_settings_renderer() { return $this->atomicity_renderer; }
    public function get_field( $name, $settings ) { unset( $settings ); return isset( $this->atomicity_fields[ $name ] ) ? $this->atomicity_fields[ $name ] : null; }
    public function replace_field( $name, $field, $settings ) { unset( $settings ); $this->atomicity_fields[ $name ] = $field; return array(); }
    public function atomicityField( $name ) { return $this->atomicity_fields[ $name ]; }
}

Autoloader::register();

$_GET['page'] = 'gf_settings';
$_GET['subview'] = 'gravity-presentation-profiles';

$addon = AddOn::get_instance();
PluginSettingsAtomicityController::rewireRenderer();

$operation = $addon->atomicityField( 'operations_setup_action' );
$sibling = $addon->atomicityField( 'entry_detail_setup_action' );
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'validateFormAction' ),
    $operation['validation_callback'],
    'Lifecycle command validation must be replaced by the read-only atomicity validator.'
);
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'commitValidatedAction' ),
    $operation['save_callback'],
    'Lifecycle mutation must be moved to the Settings save callback.'
);

gpp_assert_same( array(), AtomicityCommitRecorder::$calls, 'Renderer rewiring must not execute lifecycle mutation.' );

$operation_field = new AtomicityField( 'operations_setup_action' );
$sibling_field = new AtomicityField( 'entry_detail_setup_action' );
PluginSettingsAtomicityController::validateFormAction( $operation_field, 'form:42' );
PluginSettingsAtomicityController::validateFormAction( $sibling_field, 'invalid-sibling' );
gpp_assert_same( null, $operation_field->error, 'Valid lifecycle command must pass read-only validation.' );
gpp_assert_true( is_string( $sibling_field->error ) && false !== strpos( $sibling_field->error, 'Entry Detail' ), 'Invalid sibling must remain a Gravity Forms field error.' );
gpp_assert_same( array(), AtomicityCommitRecorder::$calls, 'Validation phase must remain mutation-free even when a valid lifecycle command is present.' );

// The host Settings renderer does not invoke save callbacks after a globally
// rejected validation pass. Model the accepted boundary explicitly here: only
// the valid transaction reaches the save callback.
PluginSettingsAtomicityController::commitValidatedAction( $operation_field, 'form:42' );
PluginSettingsAtomicityController::commitValidatedAction( $operation_field, 'form:42' );
gpp_assert_same( 1, count( AtomicityCommitRecorder::$calls ), 'One accepted command must commit exactly once per request.' );
gpp_assert_same( 'form:42', AtomicityCommitRecorder::$calls[0]['value'], 'Commit must preserve the exact validated command value.' );

echo "PLUGIN_SETTINGS_ATOMICITY_CONTROLLER_PASS\n";
