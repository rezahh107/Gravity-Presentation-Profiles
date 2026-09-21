<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\AddOn;
use GravityPresentationProfiles\GravityForms\PluginSettingsAtomicityController;

$GLOBALS['gpp_atomicity_actions'] = array();
$GLOBALS['gpp_atomicity_options'] = array(
    'gpp_atomicity_test' => array( 'revision' => 0, 'value' => 0 ),
);

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_atomicity_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}
function is_admin() { return true; }
function sanitize_key( $value ) { return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $value ) ); }
function wp_unslash( $value ) { return $value; }
function esc_html__( $value ) { return $value; }
function __( $value ) { return $value; }
function get_option( $name, $default = null ) {
    return array_key_exists( $name, $GLOBALS['gpp_atomicity_options'] ) ? $GLOBALS['gpp_atomicity_options'][ $name ] : $default;
}
function update_option( $name, $value, $autoload = null ) {
    unset( $autoload );
    $GLOBALS['gpp_atomicity_options'][ $name ] = $value;
    return true;
}

final class AtomicityWpdb {
    public $prefix = 'wp_';
    public $blogid = 1;
    public function prepare( $query, $value ) { return $query . '|' . $value; }
    public function get_var( $query ) {
        if ( 'SELECT DATABASE()' === $query ) return 'gpp_atomicity';
        if ( 0 === strpos( $query, 'SELECT GET_LOCK' ) ) return 1;
        if ( 0 === strpos( $query, 'SELECT RELEASE_LOCK' ) ) return 1;
        return null;
    }
}
$GLOBALS['wpdb'] = new AtomicityWpdb();

final class AtomicityField {
    public $name;
    public $validation_callback;
    public $save_callback;
    private $error = '';

    public function __construct( $name, $validation_callback = null, $save_callback = null ) {
        $this->name = $name;
        $this->validation_callback = $validation_callback;
        $this->save_callback = $save_callback;
    }

    public function set_error( $message ) { $this->error = (string) $message; }
    public function get_error() { return $this->error; }
}

final class AtomicityCommitRecorder {
    public static $calls = array();

    public static function mutate( $field, $value ) {
        self::$calls[] = array(
            'name' => $field->name,
            'value' => $value,
            'preview' => WordPressOptionStateStore::isPreviewActive(),
        );

        if ( 'invalid-sibling' === $value ) {
            $field->set_error( 'Sibling business validation rejected the transaction.' );
            return;
        }

        $store = new WordPressOptionStateStore( 'gpp_atomicity_test' );
        $state = $store->load();
        $expected_revision = $state['revision'];
        $state['revision']++;
        $state['value']++;
        if ( ! $store->commit( $expected_revision, $state ) ) {
            throw new RuntimeException( 'Atomicity test StateStore commit failed.' );
        }
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
    array( PluginSettingsAtomicityController::class, 'validateWithoutCommit' ),
    $operation->validation_callback,
    'Lifecycle command validation must execute through the isolated lifecycle preview.'
);
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'commitValidatedAction' ),
    $operation->save_callback,
    'Lifecycle mutation must remain deferred to the prepared field save callback.'
);
gpp_assert_same(
    array( PluginSettingsAtomicityController::class, 'validateWithoutCommit' ),
    $sibling->validation_callback,
    'Sibling command field must use the same isolated preview boundary.'
);

gpp_assert_same( array(), AtomicityCommitRecorder::$calls, 'Renderer rewiring must not execute lifecycle logic.' );

PluginSettingsAtomicityController::validateWithoutCommit( $operation, 'form:42' );
PluginSettingsAtomicityController::validateWithoutCommit( $sibling, 'invalid-sibling' );
gpp_assert_same( '', $operation->get_error(), 'Valid lifecycle command must pass exact callback validation.' );
gpp_assert_true( false !== strpos( $sibling->get_error(), 'Sibling business validation' ), 'Business validation error must remain on the authentic field object.' );
gpp_assert_same(
    array( 'revision' => 0, 'value' => 0 ),
    $GLOBALS['gpp_atomicity_options']['gpp_atomicity_test'],
    'Validation preview must discard lifecycle commits even when the exact callback performs writes.'
);
gpp_assert_same( false, WordPressOptionStateStore::isPreviewActive(), 'Preview scope must always close after validation.' );
gpp_assert_same( 2, count( AtomicityCommitRecorder::$calls ), 'Both exact callbacks must execute during validation.' );
gpp_assert_same( true, AtomicityCommitRecorder::$calls[0]['preview'], 'Valid command validation must execute inside preview.' );
gpp_assert_same( true, AtomicityCommitRecorder::$calls[1]['preview'], 'Rejected sibling validation must execute inside preview.' );

// Exact Gravity Forms 3.1.1.1 Settings::process_postback() reaches save callbacks
// only when every field validates. Model only the accepted transaction here.
PluginSettingsAtomicityController::commitValidatedAction( $operation, 'form:42' );
PluginSettingsAtomicityController::commitValidatedAction( $operation, 'form:42' );
gpp_assert_same(
    array( 'revision' => 1, 'value' => 1 ),
    $GLOBALS['gpp_atomicity_options']['gpp_atomicity_test'],
    'One globally accepted settings transaction must persist the intended lifecycle mutation exactly once.'
);
gpp_assert_same( 3, count( AtomicityCommitRecorder::$calls ), 'Duplicate save-callback invocation must not duplicate mutation.' );
gpp_assert_same( false, AtomicityCommitRecorder::$calls[2]['preview'], 'Accepted commit must execute against real StateStore state.' );

echo "PLUGIN_SETTINGS_ATOMICITY_CONTROLLER_PASS\n";
