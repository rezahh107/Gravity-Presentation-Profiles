<?php

require __DIR__ . '/gravity-forms-addon.php';

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;

if ( ! function_exists( 'esc_attr' ) ) {
    function esc_attr( $text ) {
        return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
    }
}

if ( ! function_exists( 'esc_textarea' ) ) {
    function esc_textarea( $text ) {
        return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
    }
}

final class GppDecodedJsonSettings {
    public function get_input_name_prefix() {
        return '_gform_setting';
    }
}

final class GppDecodedJsonTextareaField {
    public $name = 'visual_profile_package_json';
    public $settings;
    private $value;

    public function __construct( $value ) {
        $this->value = $value;
        $this->settings = new GppDecodedJsonSettings();
    }

    public function get_value() {
        return $this->value;
    }

    public function get_description() {
        return '<p>Package JSON</p>';
    }

    public function get_container_classes() {
        return 'gform-settings-input__container';
    }

    public function get_attributes() {
        return array(
            "id='visual_profile_package_json'",
            "class='large'",
            "rows='4'",
        );
    }

    public function get_error_icon() {
        return '<span class="error-icon">!</span>';
    }
}

$decoded_visual_store  = new GppAddonMemoryStateStore();
$decoded_binding_store = new GppAddonMemoryStateStore();
$decoded_visual        = new VisualPackageLifecycle( $decoded_visual_store );
$decoded_workflow      = new SettingsLifecycleWorkflow(
    $decoded_visual,
    new BindingSetLifecycle( $decoded_binding_store, new EvidenceReferenceGate( array() ) )
);
$decoded_workflow_property = new ReflectionProperty( get_class( $addon ), 'visual_workflow' );
$decoded_workflow_property->setAccessible( true );
$decoded_workflow_property->setValue( $addon, $decoded_workflow );

$decoded_canonical = json_decode(
    file_get_contents( dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json' ),
    true
);
gpp_assert_true( is_array( $decoded_canonical ), 'Fixture must decode the same way Gravity Forms Settings::get_posted_values() decodes valid JSON.' );

$decoded_probe = new GppAddonSettingsField();
$addon->validate_visual_package_import( $decoded_probe, $decoded_canonical );
gpp_assert_same( null, $decoded_probe->error, 'GF-decoded valid package JSON must import through the existing lifecycle callback.' );
$decoded_snapshot = $decoded_visual->snapshot();
gpp_assert_true(
    isset( $decoded_snapshot['installed']['srwf.registration.presentation']['1.1.0'] ),
    'GF-decoded valid package JSON must install the exact package/version.'
);

$decoded_invalid = $decoded_canonical;
$decoded_invalid['schema_version'] = '9.9.9';
$before_decoded_invalid = $decoded_visual->snapshot();
$decoded_invalid_probe = new GppAddonSettingsField();
$addon->validate_visual_package_import( $decoded_invalid_probe, $decoded_invalid );
gpp_assert_true( is_string( $decoded_invalid_probe->error ) && '' !== $decoded_invalid_probe->error, 'GF-decoded invalid package JSON must remain visibly rejected.' );
gpp_assert_same( $before_decoded_invalid, $decoded_visual->snapshot(), 'Rejected GF-decoded package JSON must create zero lifecycle mutation.' );

$decoded_field = new GppDecodedJsonTextareaField( $decoded_invalid );
$decoded_markup = $addon->settings_visual_profile_package_json( $decoded_field );
gpp_assert_true( false !== strpos( $decoded_markup, 'name="_gform_setting_visual_profile_package_json"' ), 'Decoded postback renderer must preserve the native Gravity Forms settings input name.' );
gpp_assert_true( false !== strpos( $decoded_markup, '&quot;schema_version&quot;:&quot;9.9.9&quot;' ), 'Decoded postback renderer must convert the array back to editable escaped JSON.' );
gpp_assert_true( false === strpos( $decoded_markup, '>Array<' ), 'Decoded postback renderer must never pass an array to textarea escaping.' );

$decoded_sections = $addon->plugin_settings_fields();
$decoded_import_field = $decoded_sections[0]['fields'][0];
gpp_assert_same( array( $addon, 'settings_visual_profile_package_json' ), $decoded_import_field['callback'], 'Only the package JSON textarea must opt into decoded-postback rendering.' );

echo "GRAVITY_FORMS_JSON_SETTINGS_COMPAT_PASS\n";
