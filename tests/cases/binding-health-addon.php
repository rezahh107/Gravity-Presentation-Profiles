<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return $text;
}
function __( $text, $domain = null ) {
    unset( $domain );
    return $text;
}
function esc_html( $text ) {
    return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

class GFAddOn {
    public function get_form_settings( $form ) {
        return array();
    }
    public function init_frontend() {
    }
}

Autoloader::register();
require_once dirname( __DIR__, 2 ) . '/src/GravityForms/AddOn.php';

final class GppBindingHealthAddonFakeHealth {
    public function healthFacts() {
        return array(
            'schema_version' => '1.0.0',
            'contexts' => array(
                array(
                    'context_key' => 'context-key',
                    'binding_set_id' => 'health.bindings',
                    'binding_set_version' => '1.0.0',
                    'form_id' => 77,
                    'form_title' => 'Registration Form',
                    'fields' => array(
                        '3' => array( 'field_id' => 3, 'label' => 'Replacement Name', 'type' => 'text' ),
                    ),
                    'facts' => array(
                        array(
                            'semantic_slot_key' => 'student.full_name',
                            'meaning' => 'student full name',
                            'status' => BindingHealthEvaluator::STALE_SOURCE_MISSING,
                            'reason' => 'bound_field_missing',
                            'binding_state' => 'PROVEN',
                            'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ),
                            'runtime_claims' => array(),
                        ),
                    ),
                ),
            ),
        );
    }

    public function managementCandidates() {
        return array(
            'repairs' => array(
                array(
                    'context_key' => 'context-key',
                    'binding_set_id' => 'health.bindings',
                    'binding_set_version' => '1.0.0',
                    'form_id' => 77,
                    'form_title' => 'Registration Form',
                    'semantic_slot_key' => 'student.full_name',
                    'meaning' => 'student full name',
                    'status' => BindingHealthEvaluator::STALE_SOURCE_MISSING,
                    'fields' => array(
                        array( 'field_id' => 3, 'label' => 'Replacement Name', 'type' => 'text' ),
                    ),
                ),
            ),
            'rollbacks' => array(
                array(
                    'context_key' => 'context-key',
                    'binding_set_id' => 'health.bindings',
                    'binding_set_version' => '0.9.0',
                    'expected_binding_set_id' => 'health.bindings',
                    'expected_binding_set_version' => '1.0.0',
                    'form_id' => 77,
                    'form_title' => 'Registration Form',
                ),
            ),
        );
    }
}

final class GppBindingHealthAddonFakeRepair {
    public $repairs = array();
    public $rollbacks = array();

    public function repairField( $request ) {
        $this->repairs[] = $request;
        return array( 'status' => 'REPAIRED_AND_ACTIVATED' );
    }

    public function rollback( $request ) {
        $this->rollbacks[] = $request;
        return array( 'status' => 'ROLLED_BACK' );
    }
}

final class GppBindingHealthAddonField {
    public $error = null;
    public function set_error( $message ) {
        $this->error = $message;
    }
}

$addon = \GravityPresentationProfiles\GravityForms\AddOn::get_instance();
$health_fake = new GppBindingHealthAddonFakeHealth();
$repair_fake = new GppBindingHealthAddonFakeRepair();
foreach ( array( 'binding_health_service' => $health_fake, 'binding_repair_service' => $repair_fake ) as $property => $value ) {
    $reflection = new ReflectionProperty( get_class( $addon ), $property );
    $reflection->setAccessible( true );
    $reflection->setValue( $addon, $value );
}

$sections = $addon->plugin_settings_fields();
gpp_assert_same( 'Mapping & Binding Health', $sections[1]['title'], 'Existing Gravity Forms Add-On settings must contain the Mapping & Binding Health management surface.' );
$health_field = $sections[1]['fields'][0];
$action_field = $sections[1]['fields'][1];
gpp_assert_same( 'gpp_binding_health', $health_field['type'], 'Health must render through the existing Add-On settings surface.' );
gpp_assert_same( array( $addon, 'validate_binding_management_action' ), $action_field['validation_callback'], 'Repair must execute only when an explicit settings action is selected and saved.' );
gpp_assert_same( '', $action_field['choices'][0]['value'], 'Ordinary settings saves must default to no binding change.' );
gpp_assert_true( false !== strpos( $action_field['choices'][1]['label'], 'student full name' ), 'Repair choice must lead with authoritative semantic meaning.' );
gpp_assert_true( false !== strpos( $action_field['choices'][1]['label'], 'Replacement Name' ), 'Repair choice must identify the real current host field by label.' );
gpp_assert_true( false !== strpos( $action_field['choices'][1]['label'], 'Field 3' ), 'Technical field ID may appear only as secondary detail.' );

ob_start();
$addon->settings_gpp_binding_health( null );
$markup = ob_get_clean();
gpp_assert_true( false !== strpos( $markup, 'student full name' ), 'Health table must show human-readable authoritative semantic meaning.' );
gpp_assert_true( false !== strpos( $markup, 'Stale / source missing' ), 'Health table must make stale source identity visible to a non-technical administrator.' );
gpp_assert_true( false !== strpos( $markup, 'Field ID' ), 'Technical source identity must remain available as secondary diagnostic detail.' );
gpp_assert_true( false === strpos( $markup, 'SECRET-PERSON-VALUE' ), 'Health UI must not display submitted personal values.' );

$field = new GppBindingHealthAddonField();
$addon->validate_binding_management_action( $field, '' );
gpp_assert_same( 0, count( $repair_fake->repairs ), 'Saving settings with no selected action must never repair a binding.' );

$addon->validate_binding_management_action( $field, $action_field['choices'][1]['value'] );
gpp_assert_same( null, $field->error, 'A valid explicit repair selection must reach the repair service without UI validation error.' );
gpp_assert_same( 1, count( $repair_fake->repairs ), 'Exactly one explicit selected repair must execute.' );
gpp_assert_same( 'student.full_name', $repair_fake->repairs[0]['semantic_slot_key'], 'Repair action must retain exact canonical semantic-slot identity.' );
gpp_assert_same( 3, $repair_fake->repairs[0]['field_id'], 'Repair action must retain exactly the administrator-selected current field identity.' );
gpp_assert_same( '', $addon->discard_binding_management_action( null, $action_field['choices'][1]['value'] ), 'Transient repair choice must not become a second persisted mapping store.' );

$rollback_choice = end( $action_field['choices'] );
$addon->validate_binding_management_action( $field, $rollback_choice['value'] );
gpp_assert_same( 1, count( $repair_fake->rollbacks ), 'Explicit rollback selection must reach the lifecycle-backed rollback service.' );
gpp_assert_same( '0.9.0', $repair_fake->rollbacks[0]['binding_set_version'], 'Rollback must target an exact immutable previously-authoritative version.' );
gpp_assert_same( 'health.bindings', $repair_fake->rollbacks[0]['expected_binding_set_id'], 'Rollback action must carry the binding-set identity that was active when the choice was generated.' );
gpp_assert_same( '1.0.0', $repair_fake->rollbacks[0]['expected_binding_set_version'], 'Rollback action must carry the exact active version that was current when the choice was generated.' );

echo "BINDING_HEALTH_ADDON_TESTS_PASS\n";
