<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;

function esc_html__( $text, $domain = null ) { unset( $domain ); return $text; }
function __( $text, $domain = null ) { unset( $domain ); return $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }

class GFAddOn {
    public function get_form_settings( $form ) { unset( $form ); return array(); }
    public function init_frontend() {}
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
                    'binding_set_id' => 'srwf.operations.environment.f77',
                    'binding_set_version' => '1.0.0',
                    'form_id' => 77,
                    'form_title' => 'Registration Form',
                    'fields' => array(
                        '3' => array( 'field_id' => 3, 'label' => 'Replacement Name', 'type' => 'text', 'choices' => array() ),
                    ),
                    'artifact' => array( 'runtime_claims' => array() ),
                    'facts' => array(
                        array(
                            'semantic_slot_key' => 'student.first_name',
                            'meaning' => 'student given name',
                            'status' => BindingHealthEvaluator::STALE_SOURCE_MISSING,
                            'reason' => 'bound_field_missing',
                            'binding_state' => 'PROVEN',
                            'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ),
                            'runtime_claims' => array(),
                        ),
                        array(
                            'semantic_slot_key' => 'student.full_name',
                            'meaning' => 'presentation composition of authoritative first and last name',
                            'status' => BindingHealthEvaluator::UNMAPPED,
                            'reason' => 'binding_unbound',
                            'binding_state' => 'UNBOUND',
                            'source' => null,
                            'runtime_claims' => array(),
                        ),
                        array(
                            'semantic_slot_key' => 'workflow.approve_action',
                            'meaning' => 'native approval action availability',
                            'status' => BindingHealthEvaluator::EVIDENCE_NOT_PROVEN,
                            'reason' => 'binding_not_proven',
                            'binding_state' => 'NOT_PROVEN',
                            'source' => null,
                            'runtime_claims' => array(),
                        ),
                    ),
                ),
            ),
        );
    }

    public function managementCandidates() {
        return array(
            'repairs' => array(),
            'rollbacks' => array(
                array(
                    'context_key' => 'context-key',
                    'binding_set_id' => 'srwf.operations.environment.f77',
                    'binding_set_version' => '0.9.0',
                    'expected_binding_set_id' => 'srwf.operations.environment.f77',
                    'expected_binding_set_version' => '1.0.0',
                    'form_id' => 77,
                    'form_title' => 'Registration Form',
                ),
            ),
            'print_options' => array(),
        );
    }
}

final class GppBindingHealthAddonFakeRepair {
    public $repairs = array();
    public $unmaps = array();
    public $print_options = array();
    public $clears = array();
    public $rollbacks = array();
    public $stale_rollback = false;

    public function repairField( $request ) { $this->repairs[] = $request; return array( 'status' => 'REPAIRED_AND_ACTIVATED' ); }
    public function unmapField( $request ) { $this->unmaps[] = $request; return array( 'status' => 'UNMAPPED_AND_ACTIVATED' ); }
    public function confirmPrintOption( $request ) { $this->print_options[] = $request; return array( 'status' => 'PRINT_OPTION_CONFIRMED' ); }
    public function clearPrintOption( $request ) { $this->clears[] = $request; return array( 'status' => 'PRINT_OPTION_CLEARED' ); }

    public function rollback( $request ) {
        $this->rollbacks[] = $request;
        if ( $this->stale_rollback ) {
            throw new LifecycleException(
                'stale_binding_management_action',
                'The active binding changed after this action was prepared. Refresh the page and try again.'
            );
        }
        return array( 'status' => 'ROLLED_BACK' );
    }
}

final class GppBindingHealthAddonField {
    public $error = null;
    public function set_error( $message ) { $this->error = $message; }
}

function gpp_binding_health_field_by_name( $section, $name ) {
    if ( empty( $section['fields'] ) || ! is_array( $section['fields'] ) ) {
        return null;
    }
    foreach ( $section['fields'] as $field ) {
        if ( isset( $field['name'] ) && $name === $field['name'] ) {
            return $field;
        }
    }
    return null;
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
$binding_section = null;
foreach ( $sections as $section ) {
    if ( isset( $section['title'] ) && 'Mapping & Binding Health' === $section['title'] ) {
        $binding_section = $section;
        break;
    }
}
gpp_assert_true( is_array( $binding_section ), 'Existing Gravity Forms Add-On settings must contain Mapping & Binding Health.' );
$health_field = gpp_binding_health_field_by_name( $binding_section, 'binding_health' );
$entry_detail_mapping_field = gpp_binding_health_field_by_name( $binding_section, 'entry_detail_mapping' );
$rollback_field = gpp_binding_health_field_by_name( $binding_section, 'binding_management_action' );
gpp_assert_true( is_array( $health_field ), 'Binding health field must remain present by stable name.' );
gpp_assert_true( is_array( $entry_detail_mapping_field ), 'Entry Detail batch mapping field must coexist on the same Plugin Settings surface.' );
gpp_assert_true( is_array( $rollback_field ), 'Rollback field must remain present by stable name.' );
gpp_assert_same( 'gpp_binding_health', $health_field['type'], 'Mapping health must remain on the existing Add-On settings surface.' );
gpp_assert_same( 'gpp_entry_detail_mapping', $entry_detail_mapping_field['type'], 'Entry Detail mapping must use its dedicated embedded renderer.' );
gpp_assert_same( 'Binding history rollback', $rollback_field['label'], 'Global select must be rollback-only rather than the primary mapping workflow.' );
gpp_assert_same( array( $addon, 'validate_binding_management_action' ), $rollback_field['validation_callback'], 'Rollback must continue through the lifecycle-backed management validator.' );
gpp_assert_same( '', $rollback_field['choices'][0]['value'], 'Ordinary settings saves must default to no binding change.' );
gpp_assert_same( 'No rollback', $rollback_field['choices'][0]['label'], 'Rollback control must explicitly default to no rollback.' );
gpp_assert_true( false !== strpos( $rollback_field['choices'][1]['label'], 'binding version 0.9.0' ), 'Rollback UI must identify the exact immutable target version.' );

ob_start();
$addon->settings_gpp_binding_health( null );
$markup = ob_get_clean();
gpp_assert_true( false !== strpos( $markup, '<code>student.first_name</code>' ), 'Row UI must expose the exact stable semantic slot key.' );
gpp_assert_true( false !== strpos( $markup, 'student given name' ), 'Row UI must show the human-readable semantic meaning.' );
gpp_assert_true( false !== strpos( $markup, 'Stale / source missing' ), 'Health table must keep stale source identity visible.' );
gpp_assert_true( false !== strpos( $markup, 'Not mapped' ), 'Direct-field mapping row must expose explicit Not mapped.' );
gpp_assert_true( false !== strpos( $markup, 'Field 3 — Replacement Name (text)' ), 'Direct-field selector must show exact field ID, label and type without guessing.' );
gpp_assert_true( false !== strpos( $markup, 'Derived from' ) && false !== strpos( $markup, 'student.first_name</code> + <code>student.last_name' ), 'Derived full name must be presented as derivation rather than a field selector.' );
gpp_assert_true( false !== strpos( $markup, 'Managed by its host adapter' ), 'Host-managed workflow semantics must be clearly separated from GF field mapping.' );
gpp_assert_true( false === strpos( $markup, 'SECRET-PERSON-VALUE' ), 'Health UI must not display submitted personal values.' );

$field = new GppBindingHealthAddonField();
$_POST = array();
$addon->validate_binding_management_action( $field, '' );
gpp_assert_same( 0, count( $repair_fake->repairs ) + count( $repair_fake->unmaps ), 'Ordinary settings save with no selected row action must never mutate a binding.' );

$rollback_choice = $rollback_field['choices'][1];
$addon->validate_binding_management_action( $field, $rollback_choice['value'] );
gpp_assert_same( 1, count( $repair_fake->rollbacks ), 'Explicit rollback selection must reach the lifecycle-backed rollback service.' );
gpp_assert_same( '0.9.0', $repair_fake->rollbacks[0]['binding_set_version'], 'Rollback must target an exact immutable previously-authoritative version.' );
gpp_assert_same( '1.0.0', $repair_fake->rollbacks[0]['expected_binding_set_version'], 'Rollback must carry the exact active version current when rendered.' );

$repair_fake->stale_rollback = true;
$stale_field = new GppBindingHealthAddonField();
$addon->validate_binding_management_action( $stale_field, $rollback_choice['value'] );
gpp_assert_true( false !== strpos( (string) $stale_field->error, 'Refresh the page and try again.' ), 'Stale rollback rejection must surface refresh/retry guidance through settings UI.' );

gpp_assert_same( '', $addon->discard_binding_management_action( null, $rollback_choice['value'] ), 'Transient rollback choice must not become a second persisted mapping store.' );

echo "BINDING_HEALTH_ADDON_TESTS_PASS\n";
