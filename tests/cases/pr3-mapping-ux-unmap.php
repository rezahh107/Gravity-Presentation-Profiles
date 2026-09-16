<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;

function esc_html__( $text, $domain = null ) { unset( $domain ); return $text; }
function __( $text, $domain = null ) { unset( $domain ); return $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }

class GFAddOn {
    public function get_form_settings( $form ) { unset( $form ); return array(); }
    public function init_frontend() {}
}

final class GFAPI {
    public static $forms = array();

    public static function get_form( $form_id ) {
        return isset( self::$forms[ (string) $form_id ] ) ? self::$forms[ (string) $form_id ] : null;
    }

    public static function get_field( $form, $field_id ) {
        if ( ! is_array( $form ) || empty( $form['fields'] ) ) {
            return null;
        }
        $needle = (string) $field_id;
        foreach ( $form['fields'] as $field ) {
            if ( is_object( $field ) && (string) $field->id === $needle ) {
                return $field;
            }
        }
        return null;
    }
}

Autoloader::register();
require_once dirname( __DIR__, 2 ) . '/src/GravityForms/AddOn.php';

final class GppPr3MemoryStore implements StateStore {
    private $state = null;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

final class GppPr3SettingsField {
    public $error = null;
    public function set_error( $message ) { $this->error = $message; }
}

final class GppPr3RepairRecorder {
    public $repairs = array();
    public $unmaps = array();
    public $print_options = array();
    public $clears = array();
    public $rollbacks = array();

    public function repairField( $request ) { $this->repairs[] = $request; return array( 'status' => 'REPAIRED_AND_ACTIVATED' ); }
    public function unmapField( $request ) { $this->unmaps[] = $request; return array( 'status' => 'UNMAPPED_AND_ACTIVATED' ); }
    public function confirmPrintOption( $request ) { $this->print_options[] = $request; return array( 'status' => 'PRINT_OPTION_CONFIRMED' ); }
    public function clearPrintOption( $request ) { $this->clears[] = $request; return array( 'status' => 'PRINT_OPTION_CLEARED' ); }
    public function rollback( $request ) { $this->rollbacks[] = $request; return array( 'status' => 'ROLLED_BACK' ); }
}

final class GppPr3HealthFake {
    private $context;
    public function __construct( $context ) { $this->context = $context; }
    public function healthFacts() {
        return array( 'schema_version' => '1.0.0', 'contexts' => array( $this->context ) );
    }
    public function managementCandidates() {
        return array( 'repairs' => array(), 'rollbacks' => array(), 'print_options' => array() );
    }
}

function gpp_pr3_field( $id, $label, $type = 'text', $choices = array() ) {
    $field = new stdClass();
    $field->id = $id;
    $field->label = $label;
    $field->type = $type;
    $field->choices = $choices;
    return $field;
}

function gpp_pr3_choice( $text, $value ) {
    return array( 'text' => $text, 'value' => $value );
}

function gpp_pr3_initial_artifact() {
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.1.0',
        'binding_set_id' => 'srwf.operations.environment.f11',
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'pr3-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 11 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.entry_detail', 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'PR3 test fixture', 'evidence_refs' => array( 'unit:initial' ) ),
        'bindings' => array(
            array( 'semantic_slot_key' => 'student.photo', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 101 ), 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 101 ), 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 102 ), 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'student.gender', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 92 ), 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'student.full_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'workflow.approve_action', 'state' => 'NOT_PROVEN', 'source_ref' => null, 'evidence_refs' => array() ),
        ),
        'runtime_claims' => array(
            array( 'semantic_slot_key' => 'student.photo', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'student.gender', 'claim' => 'print_mapping', 'evidence_state' => 'NOT_PROVEN', 'evidence_refs' => array() ),
        ),
    );
}

function gpp_pr3_snapshot( $store ) {
    return ( new BindingSetLifecycle( $store, new EvidenceReferenceGate( array() ) ) )->snapshot();
}

function gpp_pr3_binding( $artifact, $slot ) {
    foreach ( $artifact['bindings'] as $binding ) {
        if ( $binding['semantic_slot_key'] === $slot ) {
            return $binding;
        }
    }
    gpp_fail( 'Missing binding for ' . $slot );
}

function gpp_pr3_claim( $artifact, $slot, $claim_name ) {
    foreach ( $artifact['runtime_claims'] as $claim ) {
        if ( $claim['semantic_slot_key'] === $slot && $claim['claim'] === $claim_name ) {
            return $claim;
        }
    }
    gpp_fail( 'Missing runtime claim for ' . $slot . ' / ' . $claim_name );
}

function gpp_pr3_map( $claim ) {
    $map = array();
    foreach ( isset( $claim['print_option_map'] ) ? $claim['print_option_map'] : array() as $pair ) {
        $map[ $pair['canonical_option'] ] = $pair['host_raw_value'];
    }
    return $map;
}

function gpp_pr3_expect_reason( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message );
        return;
    }
    gpp_fail( $message . ' (no exception)' );
}

function gpp_pr3_set_private( $object, $property, $value ) {
    $reflection = new ReflectionProperty( get_class( $object ), $property );
    $reflection->setAccessible( true );
    $reflection->setValue( $object, $value );
}

function gpp_pr3_row( $markup, $slot ) {
    $quoted = preg_quote( $slot, '/' );
    if ( 1 !== preg_match( '/<tr data-gpp-semantic-slot="' . $quoted . '">(.*?)<\/tr>/s', $markup, $matches ) ) {
        gpp_fail( 'Rendered row missing for ' . $slot );
    }
    return $matches[1];
}

function gpp_pr3_mapping_control( $row ) {
    if ( 1 !== preg_match( '/<select name="gpp_binding_row\[([a-f0-9]{24})\]"[^>]*>(.*?)<\/select>/s', $row, $matches ) ) {
        gpp_fail( 'Mapping selector missing from direct-field row.' );
    }
    return array( $matches[1], $matches[2] );
}

function gpp_pr3_option_value( $select_markup, $label_fragment ) {
    $pattern = '/<option value="([^"]*)"[^>]*>[^<]*' . preg_quote( $label_fragment, '/' ) . '[^<]*<\/option>/u';
    if ( 1 !== preg_match( $pattern, $select_markup, $matches ) ) {
        gpp_fail( 'Option missing for label fragment: ' . $label_fragment );
    }
    return html_entity_decode( $matches[1], ENT_QUOTES, 'UTF-8' );
}

GFAPI::$forms['11'] = array(
    'id' => 11,
    'title' => 'SRWF Registration',
    'fields' => array(
        gpp_pr3_field( 101, 'نام' ),
        gpp_pr3_field( 102, 'نام خانوادگی' ),
        gpp_pr3_field( 103, 'نام جایگزین' ),
        gpp_pr3_field( 92, 'جنسیت', 'radio', array( gpp_pr3_choice( 'زن', 'F' ), gpp_pr3_choice( 'مرد', 'M' ) ) ),
        gpp_pr3_field( 93, 'جنسیت جدید', 'select', array( gpp_pr3_choice( 'دختر', 'female-new' ), gpp_pr3_choice( 'پسر', 'male-new' ) ) ),
    ),
);

$binding_store = new GppPr3MemoryStore();
$evidence_store = new GppPr3MemoryStore();
$initial = gpp_pr3_initial_artifact();
$lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:initial' ) ) );
$lifecycle->import( $initial );
$lifecycle->activate(
    array(
        'context' => $initial['context'],
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => $initial['binding_set_version'],
    )
);
$context_key = $lifecycle->contextKey( $initial['context'] );
$repair = new BindingRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory(), array( 'unit:initial' ) );

// B + C: explicit unmap changes only the requested slot and leaves the previous
// immutable artifact installed byte-for-canonical-byte.
$unmap = $repair->unmapField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => '1.0.0',
        'semantic_slot_key' => 'student.photo',
    )
);
gpp_assert_same( 'UNMAPPED_AND_ACTIVATED', $unmap['status'], 'Explicit unmap must activate a new immutable binding version.' );
gpp_assert_same( '1.0.1', $unmap['binding_set_version'], 'Explicit unmap must advance the patch version.' );
$snapshot = gpp_pr3_snapshot( $binding_store );
$unmapped_artifact = $snapshot['installed'][ $initial['binding_set_id'] ]['1.0.1']['artifact'];
$photo = gpp_pr3_binding( $unmapped_artifact, 'student.photo' );
gpp_assert_same( 'UNBOUND', $photo['state'], 'Explicit unmap must produce UNBOUND state.' );
gpp_assert_same( null, $photo['source_ref'], 'Explicit unmap must clear source_ref.' );
gpp_assert_same( array(), $photo['evidence_refs'], 'Explicit unmap must clear source evidence.' );
gpp_assert_same( 101, gpp_pr3_binding( $unmapped_artifact, 'student.first_name' )['source_ref']['field_id'], 'Unmapping photo must preserve first_name → Field 101.' );
gpp_assert_same( 102, gpp_pr3_binding( $unmapped_artifact, 'student.last_name' )['source_ref']['field_id'], 'Unmapping photo must preserve last_name → Field 102.' );
gpp_assert_same( 'NOT_PROVEN', gpp_pr3_claim( $unmapped_artifact, 'student.photo', 'availability' )['evidence_state'], 'Unmapping must invalidate runtime proof tied to the removed source.' );
gpp_assert_same( CanonicalJson::encode( $initial ), CanonicalJson::encode( $snapshot['installed'][ $initial['binding_set_id'] ]['1.0.0']['artifact'] ), 'Previous immutable binding artifact must remain installed and unchanged.' );

// E: selecting the exact current mapping is a real no-op at the service boundary.
$installed_before_noop = count( $snapshot['installed'][ $initial['binding_set_id'] ] );
$noop = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => '1.0.1',
        'semantic_slot_key' => 'student.first_name',
        'field_id' => 101,
    )
);
gpp_assert_same( 'UNCHANGED', $noop['status'], 'Reapplying an identical mapping must be a no-op.' );
$after_noop = gpp_pr3_snapshot( $binding_store );
gpp_assert_same( $installed_before_noop, count( $after_noop['installed'][ $initial['binding_set_id'] ] ), 'No-op mapping must not create an unnecessary immutable version.' );
gpp_assert_same( '1.0.1', $after_noop['activations'][ $context_key ]['binding_set_version'], 'No-op mapping must preserve the active version.' );

// D: a stale settings view cannot overwrite a newer activation.
gpp_pr3_expect_reason(
    'repair_activation_changed',
    static function () use ( $repair, $context_key, $initial ) {
        $repair->unmapField(
            array(
                'context_key' => $context_key,
                'binding_set_id' => $initial['binding_set_id'],
                'binding_set_version' => '1.0.0',
                'semantic_slot_key' => 'student.first_name',
            )
        );
    },
    'Stale expected activation must fail closed before any replacement can become active.'
);
gpp_assert_same( '1.0.1', gpp_pr3_snapshot( $binding_store )['activations'][ $context_key ]['binding_set_version'], 'Stale unmap must not replace the newer active binding version.' );

// A: changing first_name cannot touch photo or last_name.
$changed = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => '1.0.1',
        'semantic_slot_key' => 'student.first_name',
        'field_id' => 103,
    )
);
gpp_assert_same( '1.0.2', $changed['binding_set_version'], 'Changing one mapping must publish one new immutable version.' );
$changed_artifact = gpp_pr3_snapshot( $binding_store )['installed'][ $initial['binding_set_id'] ]['1.0.2']['artifact'];
gpp_assert_same( 103, gpp_pr3_binding( $changed_artifact, 'student.first_name' )['source_ref']['field_id'], 'first_name must use exactly the selected replacement field.' );
gpp_assert_same( 'UNBOUND', gpp_pr3_binding( $changed_artifact, 'student.photo' )['state'], 'Changing first_name must not remap photo.' );
gpp_assert_same( 102, gpp_pr3_binding( $changed_artifact, 'student.last_name' )['source_ref']['field_id'], 'Changing first_name must not alter last_name.' );

// H: explicit raw→canonical choice confirmation uses only real host choices.
$female = $repair->confirmPrintOption(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => '1.0.2',
        'semantic_slot_key' => 'student.gender',
        'canonical_option' => 'female',
        'host_raw_value' => 'F',
    )
);
gpp_assert_same( 'PRINT_OPTION_CONFIRMED', $female['status'], 'A real host choice must be confirmable as one admitted canonical Print option.' );
$male = $repair->confirmPrintOption(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => $female['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'canonical_option' => 'male',
        'host_raw_value' => 'M',
    )
);
$choice_artifact = gpp_pr3_snapshot( $binding_store )['installed'][ $initial['binding_set_id'] ][ $male['binding_set_version'] ]['artifact'];
gpp_assert_same( array( 'female' => 'F', 'male' => 'M' ), gpp_pr3_map( gpp_pr3_claim( $choice_artifact, 'student.gender', 'print_mapping' ) ), 'Choice proof must preserve explicit real raw values for both canonical gender options.' );

// "Not confirmed" is first-class: removing one confirmation preserves the other,
// and removing the final confirmation returns the claim to NOT_PROVEN.
$cleared = $repair->clearPrintOption(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => $male['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'canonical_option' => 'female',
    )
);
$clear_artifact = gpp_pr3_snapshot( $binding_store )['installed'][ $initial['binding_set_id'] ][ $cleared['binding_set_version'] ]['artifact'];
gpp_assert_same( array( 'male' => 'M' ), gpp_pr3_map( gpp_pr3_claim( $clear_artifact, 'student.gender', 'print_mapping' ) ), 'Clearing one canonical option must preserve the unrelated confirmed option.' );

// Reconfirm female so source-change invalidation proves a non-empty map is reset.
$reconfirmed = $repair->confirmPrintOption(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => $cleared['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'canonical_option' => 'female',
        'host_raw_value' => 'F',
    )
);

// I: changing the source invalidates previous Print-option proof and map.
$gender_change = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => $reconfirmed['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'field_id' => 93,
    )
);
$gender_changed_artifact = gpp_pr3_snapshot( $binding_store )['installed'][ $initial['binding_set_id'] ][ $gender_change['binding_set_version'] ]['artifact'];
$gender_claim = gpp_pr3_claim( $gender_changed_artifact, 'student.gender', 'print_mapping' );
gpp_assert_same( 'NOT_PROVEN', $gender_claim['evidence_state'], 'Changing a choice source must invalidate the old Print mapping proof.' );
gpp_assert_true( ! isset( $gender_claim['print_option_map'] ), 'Changing a choice source must remove the old raw→canonical option map.' );

// F + G: management policy keeps derived and host-owned non-field semantics out
// of the arbitrary Gravity Forms field inventory.
gpp_assert_same( OperationsBindingManagementPolicy::DERIVED, OperationsBindingManagementPolicy::kind( 'student.full_name' ), 'student.full_name must remain a derived management row.' );
gpp_assert_same( array( 'student.first_name', 'student.last_name' ), OperationsBindingManagementPolicy::derivationComponents( 'student.full_name' ), 'Full-name derivation must identify its authoritative components.' );
gpp_assert_same( OperationsBindingManagementPolicy::HOST_MANAGED, OperationsBindingManagementPolicy::kind( 'workflow.approve_action' ), 'Gravity Flow action semantics must not be offered as arbitrary Gravity Forms fields.' );

// J + UI: render exact row identities, submit the row token + selected encoded
// action, and prove the service request keeps the same semantic slot end-to-end.
$ui_artifact = $choice_artifact;
$ui_context = array(
    'context_key' => 'ui-context',
    'binding_set_id' => 'srwf.operations.environment.f11',
    'binding_set_version' => '7.2.0',
    'form_id' => 11,
    'form_title' => 'SRWF Registration',
    'fields' => array(
        '101' => array( 'field_id' => 101, 'label' => 'نام', 'type' => 'text', 'choices' => array() ),
        '102' => array( 'field_id' => 102, 'label' => 'نام خانوادگی', 'type' => 'text', 'choices' => array() ),
        '103' => array( 'field_id' => 103, 'label' => 'نام جایگزین', 'type' => 'text', 'choices' => array() ),
        '92' => array( 'field_id' => 92, 'label' => 'جنسیت', 'type' => 'radio', 'choices' => array( gpp_pr3_choice( 'زن', 'F' ), gpp_pr3_choice( 'مرد', 'M' ) ) ),
    ),
    'artifact' => $ui_artifact,
    'facts' => array(
        array( 'semantic_slot_key' => 'student.first_name', 'meaning' => 'student given name', 'status' => 'healthy', 'reason' => null, 'binding_state' => 'PROVEN', 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 101, 'label' => 'نام', 'field_type' => 'text' ), 'runtime_claims' => array() ),
        array( 'semantic_slot_key' => 'student.photo', 'meaning' => 'authoritative student image or media', 'status' => 'healthy', 'reason' => null, 'binding_state' => 'PROVEN', 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 101, 'label' => 'نام', 'field_type' => 'text' ), 'runtime_claims' => array() ),
        array( 'semantic_slot_key' => 'student.last_name', 'meaning' => 'student family name', 'status' => 'healthy', 'reason' => null, 'binding_state' => 'PROVEN', 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 102, 'label' => 'نام خانوادگی', 'field_type' => 'text' ), 'runtime_claims' => array() ),
        array( 'semantic_slot_key' => 'student.gender', 'meaning' => 'canonical gender value', 'status' => 'healthy', 'reason' => null, 'binding_state' => 'PROVEN', 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 92, 'label' => 'جنسیت', 'field_type' => 'radio' ), 'runtime_claims' => array() ),
        array( 'semantic_slot_key' => 'student.full_name', 'meaning' => 'presentation composition of authoritative first and last name', 'status' => 'unmapped', 'reason' => 'binding_unbound', 'binding_state' => 'UNBOUND', 'source' => null, 'runtime_claims' => array() ),
        array( 'semantic_slot_key' => 'workflow.approve_action', 'meaning' => 'native approval action availability', 'status' => 'evidence_not_proven', 'reason' => 'binding_not_proven', 'binding_state' => 'NOT_PROVEN', 'source' => null, 'runtime_claims' => array() ),
    ),
);
$addon = \GravityPresentationProfiles\GravityForms\AddOn::get_instance();
$recorder = new GppPr3RepairRecorder();
gpp_pr3_set_private( $addon, 'binding_health_service', new GppPr3HealthFake( $ui_context ) );
gpp_pr3_set_private( $addon, 'binding_repair_service', $recorder );

$binding_section = null;
foreach ( $addon->plugin_settings_fields() as $section ) {
    if ( isset( $section['title'] ) && 'Mapping & Binding Health' === $section['title'] ) {
        $binding_section = $section;
        break;
    }
}
gpp_assert_true( is_array( $binding_section ), 'Mapping & Binding Health settings section must remain present.' );
gpp_assert_same( 'Binding history rollback', $binding_section['fields'][1]['label'], 'Global field must be history rollback, not the primary mapping workflow.' );
gpp_assert_same( 'No rollback', $binding_section['fields'][1]['choices'][0]['label'], 'Rollback control must default to no binding change.' );

ob_start();
$addon->settings_gpp_binding_health( null );
$markup = ob_get_clean();
$first_row = gpp_pr3_row( $markup, 'student.first_name' );
list( $first_token, $first_select ) = gpp_pr3_mapping_control( $first_row );
gpp_assert_true( 0 === strpos( preg_replace( '/^\s*/', '', $first_select ), '<option' ), 'Direct-field mapping control must begin with an explicit option.' );
gpp_assert_true( false !== strpos( $first_select, '>Not mapped</option>' ), 'First direct-field mapping option must support explicit Not mapped.' );
gpp_assert_true( false !== strpos( $first_select, 'Field 101 — نام (text)</option>' ), 'Mapping must show exact current Field ID, label and type.' );
gpp_assert_true( false !== strpos( $first_select, 'Field 101 — نام (text)</option>' ) && false !== strpos( $first_select, 'selected' ), 'Current valid mapping must be selected.' );
gpp_assert_true( false !== strpos( $first_row, 'Type <code>text</code>' ), 'Current source detail must show the Gravity Forms field type.' );

$repair_value = gpp_pr3_option_value( $first_select, 'Field 103' );
$_POST = array( 'gpp_binding_row_action' => $first_token, 'gpp_binding_row' => array( $first_token => $repair_value ) );
$settings_field = new GppPr3SettingsField();
$addon->validate_binding_management_action( $settings_field, '' );
gpp_assert_same( null, $settings_field->error, 'Valid row submission must pass settings validation.' );
gpp_assert_same( 1, count( $recorder->repairs ), 'Exactly one row Apply must cause exactly one repair request.' );
gpp_assert_same( 'student.first_name', $recorder->repairs[0]['semantic_slot_key'], 'Rendered row, submitted payload and mutated semantic slot must remain identical.' );
gpp_assert_same( 103, $recorder->repairs[0]['field_id'], 'Rendered field selection and repair payload must retain exact Field ID.' );
gpp_assert_same( 0, count( $recorder->unmaps ), 'Changing first_name row must not submit photo/other row operations.' );

$photo_row = gpp_pr3_row( $markup, 'student.photo' );
list( $photo_token, $photo_select ) = gpp_pr3_mapping_control( $photo_row );
$unmap_value = gpp_pr3_option_value( $photo_select, 'Not mapped' );
$_POST = array( 'gpp_binding_row_action' => $photo_token, 'gpp_binding_row' => array( $photo_token => $unmap_value ) );
$photo_field = new GppPr3SettingsField();
$addon->validate_binding_management_action( $photo_field, '' );
gpp_assert_same( null, $photo_field->error, 'Explicit Not mapped row action must validate.' );
gpp_assert_same( 'student.photo', $recorder->unmaps[0]['semantic_slot_key'], 'Explicit unmap must retain exact student.photo row identity.' );

gpp_assert_true( false === strpos( gpp_pr3_row( $markup, 'student.full_name' ), '<select' ), 'Derived student.full_name must not render a Gravity Forms field selector.' );
gpp_assert_true( false !== strpos( gpp_pr3_row( $markup, 'student.full_name' ), 'student.first_name</code> + <code>student.last_name' ), 'Derived row must explain its authoritative component semantics.' );
gpp_assert_true( false === strpos( gpp_pr3_row( $markup, 'workflow.approve_action' ), '<select' ), 'Gravity Flow action semantics must not render an arbitrary Gravity Forms field selector.' );

$gender_row = gpp_pr3_row( $markup, 'student.gender' );
gpp_assert_true( false !== strpos( $gender_row, 'Print choice meaning' ), 'Choice-backed direct field must expose Print mapping beside its semantic row.' );
gpp_assert_true( false !== strpos( $gender_row, '<code>female</code>' ) && false !== strpos( $gender_row, '<code>male</code>' ), 'Choice UX must use canonical option identities from the Print contract.' );
gpp_assert_true( false !== strpos( $gender_row, 'Not confirmed' ), 'Each canonical Print option must explicitly support Not confirmed.' );
gpp_assert_true( false !== strpos( $gender_row, 'زن — raw: F' ) && false !== strpos( $gender_row, 'مرد — raw: M' ), 'Choice UX must use real host choice text and raw values from the authoritative form inventory.' );

if ( 1 !== preg_match( '/<code>male<\/code> →\s*<select name="gpp_binding_row\[([a-f0-9]{24})\]"[^>]*>(.*?)<\/select>/su', $gender_row, $male_matches ) ) {
    gpp_fail( 'Male canonical Print mapping control missing.' );
}
$male_ui_value = gpp_pr3_option_value( $male_matches[2], 'raw: M' );
$_POST = array( 'gpp_binding_row_action' => $male_matches[1], 'gpp_binding_row' => array( $male_matches[1] => $male_ui_value ) );
$male_field = new GppPr3SettingsField();
$addon->validate_binding_management_action( $male_field, '' );
gpp_assert_same( null, $male_field->error, 'Exact canonical choice row payload must validate.' );
gpp_assert_same( 1, count( $recorder->print_options ), 'Applying one canonical choice must emit exactly one Print confirmation request.' );
gpp_assert_same( 'student.gender', $recorder->print_options[0]['semantic_slot_key'], 'Choice row must retain exact semantic-slot identity.' );
gpp_assert_same( 'male', $recorder->print_options[0]['canonical_option'], 'Choice row must retain exact canonical option identity.' );
gpp_assert_same( 'M', $recorder->print_options[0]['host_raw_value'], 'Choice row must retain exact real host raw value without guessing.' );

$_POST = array();
echo "PR3_MAPPING_UX_UNMAP_TESTS_PASS\n";
