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
    public $validation_callback;
    public $save_callback;
    public $error = null;

    public function __construct( $name, $validation_callback = null, $save_callback = null ) {
        $this->name = $name;
        $this->validation_callback = $validation_callback;
        $this->save_callback = $save_callback;
    }

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
            $this->atomicity_fields[ $name ] = new AtomicityField(
                $name,
                array( 'AtomicityCommitRecorder', 'mutate' ),
                static function () { return ''; }
            );
        }
    }
    public function get_settings_renderer() { return $this->atomicity_renderer; }
    public function get_field( $name, $settings ) { unset( $settings ); return isset( $this->atomicity_fields[ $name ] ) ? $this->atomicity_fields[ $name ] : null; }
    public function atomicityField( $name ) { return $this->atomicity_fields[ $name ]; }
}

Autoloader::register();

$_GET['page'] = 'gf_settings';
$_GET['subview'] = 'gravity-presentation-profiles';

$addon = AddOn::get_instance();
PluginSettingsAtomicityController::rewireRenderer();

$operation = $addon->atomicityField( 'operations_setup_action' );
$sibling = $addon->atomicityField( 'entry_detail_setup_action' );
gpp_assert_true( is_object( $operation ), 'Prepared Gravity Forms settings fields are objects.' );
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'validateFormAction' ),
    $operation->validation_callback,
    'Lifecycle command validation must be replaced on the prepared field object by the read-only atomicity validator.'
);
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'commitValidatedAction' ),
    $operation->save_callback,
    'Lifecycle mutation must be moved to the prepared field object save callback.'
);
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'validateFormAction' ),
    $sibling->validation_callback,
    'Sibling command field must be rewired through the same prepared-object seam.'
);

gpp_assert_same( array(), AtomicityCommitRecorder::$calls, 'Renderer rewiring must not execute lifecycle mutation.' );

PluginSettingsAtomicityController::validateFormAction( $operation, 'form:42' );
PluginSettingsAtomicityController::validateFormAction( $sibling, 'invalid-sibling' );
gpp_assert_same( null, $operation->error, 'Valid lifecycle command must pass read-only validation.' );
gpp_assert_true( is_string( $sibling->error ) && false !== strpos( $sibling->error, 'Entry Detail' ), 'Invalid sibling must remain a Gravity Forms field error.' );
gpp_assert_same( array(), AtomicityCommitRecorder::$calls, 'Validation phase must remain mutation-free even when a valid lifecycle command is present.' );

// Exact Gravity Forms 3.1.1.1 Settings::process_postback() invokes field
// save callbacks only after validate() returns true for the whole renderer. A
// rejected sibling therefore never reaches this boundary. Model only the
// accepted branch here; WU-04 authentic browser evidence proves the host order.
PluginSettingsAtomicityController::commitValidatedAction( $operation, 'form:42' );
PluginSettingsAtomicityController::commitValidatedAction( $operation, 'form:42' );
gpp_assert_same( 1, count( AtomicityCommitRecorder::$calls ), 'One accepted command must commit exactly once per request.' );
gpp_assert_same( 'form:42', AtomicityCommitRecorder::$calls[0]['value'], 'Commit must preserve the exact validated command value.' );

echo "PLUGIN_SETTINGS_ATOMICITY_CONTROLLER_PASS\n";
