<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\GravityForms\BindingHealthService;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

function esc_html__( $text, $domain = null ) { unset( $domain ); return $text; }
function __( $text, $domain = null ) { unset( $domain ); return $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }

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
        foreach ( $form['fields'] as $field ) {
            if ( is_object( $field ) && (string) $field->id === (string) $field_id ) {
                return $field;
            }
        }
        return null;
    }
}

Autoloader::register();
require_once dirname( __DIR__, 2 ) . '/src/GravityForms/AddOn.php';

final class GppPr2MemoryStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

final class GppPr2Field {
    public $error = null;
    public function set_error( $message ) { $this->error = $message; }
}

final class GppPr2RepairRecorder {
    public $repairs = array();
    public function repairField( $request ) { $this->repairs[] = $request; return array( 'status' => 'REPAIRED_AND_ACTIVATED' ); }
    public function confirmPrintOption( $request ) { unset( $request ); }
    public function rollback( $request ) { unset( $request ); }
}

final class GppPr2RenderedHealth {
    private $facts;
    public function __construct( $facts ) { $this->facts = $facts; }
    public function healthFacts() {
        return array(
            'schema_version' => '1.0.0',
            'contexts' => array(
                array(
                    'context_key' => 'pr2-context',
                    'binding_set_id' => 'pr2.delta',
                    'binding_set_version' => '1.0.1',
                    'form_id' => 77,
                    'form_title' => 'SRWF Registration',
                    'facts' => $this->facts,
                ),
            ),
        );
    }
}

function gpp_pr2_field( $id, $label, $type = 'text' ) {
    $field = new stdClass();
    $field->id = $id;
    $field->label = $label;
    $field->type = $type;
    return $field;
}

function gpp_pr2_set_private( $object, $property, $value ) {
    $reflection = new ReflectionProperty( get_class( $object ), $property );
    $reflection->setAccessible( true );
    $reflection->setValue( $object, $value );
}

function gpp_pr2_binding_section( $addon ) {
    foreach ( $addon->plugin_settings_fields() as $section ) {
        if ( isset( $section['title'] ) && 'Mapping & Binding Health' === $section['title'] ) {
            return $section;
        }
    }
    gpp_fail( 'Mapping & Binding Health section missing.' );
}

function gpp_pr2_find_choice( $choices, $slot, $field_id ) {
    foreach ( $choices as $choice ) {
        if ( false !== strpos( $choice['label'], $slot ) && false !== strpos( $choice['label'], 'Field ' . $field_id ) ) {
            return $choice;
        }
    }
    gpp_fail( 'Repair choice missing for ' . $slot . ' / Field ' . $field_id );
}

function gpp_pr2_binding_map( $artifact ) {
    $mapped = array();
    foreach ( $artifact['bindings'] as $binding ) {
        $mapped[ $binding['semantic_slot_key'] ] = $binding;
    }
    ksort( $mapped, SORT_STRING );
    return $mapped;
}

function gpp_pr2_candidate_binding() {
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => 'pr2.candidates',
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'pr2-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.entry_detail' ),
        ),
        'provenance' => array( 'producer' => 'PR2 candidate fixture', 'evidence_refs' => array() ),
        'bindings' => array(
            array( 'semantic_slot_key' => 'student.first_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'student.last_name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'student.photo', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'student.national_id', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
        ),
        'runtime_claims' => array(),
    );
}

GFAPI::$forms['77'] = array(
    'id' => 77,
    'title' => 'SRWF Registration',
    'fields' => array(
        gpp_pr2_field( 101, 'نام' ),
        gpp_pr2_field( 102, 'نام خانوادگی' ),
        gpp_pr2_field( 103, 'تصویر', 'fileupload' ),
        gpp_pr2_field( 104, 'کد ملی' ),
    ),
);

$binding_store = new GppPr2MemoryStore();
$visual_store = new GppPr2MemoryStore();
$candidate_artifact = gpp_pr2_candidate_binding();
$bindings = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
$bindings->import( $candidate_artifact );
$bindings->activate(
    array(
        'context' => $candidate_artifact['context'],
        'binding_set_id' => $candidate_artifact['binding_set_id'],
        'binding_set_version' => $candidate_artifact['binding_set_version'],
    )
);

$package = json_decode( file_get_contents( dirname( __DIR__ ) . '/fixtures/wu09-visual-package.json' ), true );
foreach ( $package['semantic_slots'] as &$slot ) {
    if ( 'student.photo' === $slot['semantic_slot_key'] ) {
        // Valid but deliberately misleading descriptive metadata reproduces the
        // authentic failure mode: meaning text must never replace slot identity.
        $slot['meaning'] = 'student given name';
    }
}
unset( $slot );
$visual = new VisualPackageLifecycle( $visual_store );
$visual->import( $package );
$visual->activate(
    array(
        'surface' => 'gravity_flow.entry_detail',
        'package_id' => $package['package_id'],
        'package_version' => $package['package_version'],
        'profile_id' => 'shared.entry_detail.v1',
    )
);

$health_service = new BindingHealthService( $bindings, $visual, new GravityFormsFieldInventory(), new BindingHealthEvaluator() );
$candidates = $health_service->managementCandidates();
gpp_assert_same( 4, count( $candidates['repairs'] ), 'All four simultaneously available semantic slots must produce explicit repair candidates.' );
foreach ( $candidates['repairs'] as $candidate ) {
    gpp_assert_true(
        0 === strpos( $candidate['meaning'], $candidate['semantic_slot_key'] . ' / ' ),
        'Management candidate visible identity must be prefixed by the exact stable semantic slot carried by that candidate.'
    );
}

$addon = \GravityPresentationProfiles\GravityForms\AddOn::get_instance();
$recorder = new GppPr2RepairRecorder();
gpp_pr2_set_private( $addon, 'binding_health_service', $health_service );
gpp_pr2_set_private( $addon, 'binding_repair_service', $recorder );
$choices = gpp_pr2_binding_section( $addon )['fields'][1]['choices'];

$representative = array(
    array( 'student.first_name', 101 ),
    array( 'student.last_name', 102 ),
    array( 'student.photo', 103 ),
    array( 'student.national_id', 104 ),
);
$seen_values = array();
foreach ( $representative as $identity ) {
    $choice = gpp_pr2_find_choice( $choices, $identity[0], $identity[1] );
    gpp_assert_true( false !== strpos( $choice['label'], $identity[0] ), 'Rendered option must expose the exact actionable semantic slot.' );
    gpp_assert_true( false !== strpos( $choice['label'], 'Field ' . $identity[1] ), 'Rendered option must expose the exact actionable field ID.' );
    gpp_assert_true( ! isset( $seen_values[ $choice['value'] ] ), 'Distinct slot/field pairs must emit distinct actionable option values.' );
    $seen_values[ $choice['value'] ] = true;

    $field = new GppPr2Field();
    $before = count( $recorder->repairs );
    $addon->validate_binding_management_action( $field, stripslashes( trim( $choice['value'] ) ) );
    gpp_assert_same( null, $field->error, 'Rendered action must survive the Gravity Forms-style trim/unslash submission path.' );
    gpp_assert_same( $before + 1, count( $recorder->repairs ), 'Exactly one repair call must result from one explicit selected option.' );
    gpp_assert_same( $identity[0], $recorder->repairs[ $before ]['semantic_slot_key'], 'Visible slot must equal submitted/decoded/repaired slot.' );
    gpp_assert_same( $identity[1], $recorder->repairs[ $before ]['field_id'], 'Visible field must equal submitted/decoded/repaired field.' );
}

$photo_choice = gpp_pr2_find_choice( $choices, 'student.photo', 103 );
gpp_assert_true( false !== strpos( $photo_choice['label'], 'student.photo / student given name' ), 'Misleading descriptive metadata cannot hide or substitute stable student.photo identity.' );

$first_choice = gpp_pr2_find_choice( $choices, 'student.first_name', 101 );
GFAPI::$forms['77']['fields'] = array_reverse( GFAPI::$forms['77']['fields'] );
$reordered_choices = gpp_pr2_binding_section( $addon )['fields'][1]['choices'];
$reordered_first = gpp_pr2_find_choice( $reordered_choices, 'student.first_name', 101 );
gpp_assert_same( $first_choice['value'], $reordered_first['value'], 'Candidate/field ordering must not change the payload meaning of an exact slot/field pair.' );

$raw = strtr( $first_choice['value'], '-_', '+/' );
$padding = strlen( $raw ) % 4;
if ( $padding ) {
    $raw .= str_repeat( '=', 4 - $padding );
}
$incomplete = json_decode( base64_decode( $raw, true ), true );
unset( $incomplete['semantic_slot_key'] );
$malformed = rtrim( strtr( base64_encode( json_encode( $incomplete, JSON_UNESCAPED_SLASHES ) ), '+/', '-_' ), '=' );
$malformed_field = new GppPr2Field();
$count_before_malformed = count( $recorder->repairs );
$addon->validate_binding_management_action( $malformed_field, $malformed );
gpp_assert_true( false !== strpos( (string) $malformed_field->error, 'invalid' ), 'Malformed/incomplete payload must fail closed.' );
gpp_assert_same( $count_before_malformed, count( $recorder->repairs ), 'Malformed payload must not reach BindingRepairService.' );

echo "PR2_BINDING_OPTION_ROUND_TRIP_PASS\n";

GFAPI::$forms['77']['fields'] = array(
    gpp_pr2_field( 10, 'نام قدیمی' ),
    gpp_pr2_field( 20, 'نام خانوادگی' ),
    gpp_pr2_field( 40, 'کد ملی' ),
    gpp_pr2_field( 101, 'نام' ),
);

$delta_initial = array(
    'artifact_type' => 'gpp.environment_binding_set',
    'schema_version' => '1.0.0',
    'binding_set_id' => 'pr2.delta',
    'binding_set_version' => '1.0.0',
    'context' => array(
        'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'pr2-installation' ),
        'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
        'entry_source_ref' => null,
        'surfaces' => array( 'gravity_flow.entry_detail' ),
    ),
    'provenance' => array( 'producer' => 'PR2 delta fixture', 'evidence_refs' => array( 'unit:pr2' ) ),
    'bindings' => array(
        array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 10 ), 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 20 ), 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.photo', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 101 ), 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.national_id', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 40 ), 'evidence_refs' => array( 'unit:pr2' ) ),
    ),
    'runtime_claims' => array(
        array( 'semantic_slot_key' => 'student.first_name', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.photo', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:pr2' ) ),
    ),
);

$delta_binding_store = new GppPr2MemoryStore();
$delta_evidence_store = new GppPr2MemoryStore();
$delta_lifecycle = new BindingSetLifecycle( $delta_binding_store, new EvidenceReferenceGate( array( 'unit:pr2' ) ) );
$delta_lifecycle->import( $delta_initial );
$delta_lifecycle->activate(
    array(
        'context' => $delta_initial['context'],
        'binding_set_id' => $delta_initial['binding_set_id'],
        'binding_set_version' => $delta_initial['binding_set_version'],
    )
);
$context_key = $delta_lifecycle->contextKey( $delta_initial['context'] );
$before_snapshot = $delta_lifecycle->snapshot();
$before_artifact = $before_snapshot['installed']['pr2.delta']['1.0.0']['artifact'];
$before_bindings = gpp_pr2_binding_map( $before_artifact );

$repair = new BindingRepairService( $delta_binding_store, $delta_evidence_store, new GravityFormsFieldInventory() );
$result = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => 'pr2.delta',
        'binding_set_version' => '1.0.0',
        'semantic_slot_key' => 'student.first_name',
        'field_id' => 101,
    )
);
gpp_assert_same( '1.0.1', $result['binding_set_version'], 'Explicit repair must create the next immutable patch version.' );

$after_lifecycle = new BindingSetLifecycle( $delta_binding_store, new EvidenceReferenceGate( array() ) );
$after_snapshot = $after_lifecycle->snapshot();
gpp_assert_true( isset( $after_snapshot['installed']['pr2.delta']['1.0.0'] ), 'Previous immutable version must remain available for rollback.' );
gpp_assert_true( isset( $after_snapshot['installed']['pr2.delta']['1.0.1'] ), 'Repair must install exactly the new immutable version.' );
gpp_assert_same( '1.0.1', $after_snapshot['activations'][ $context_key ]['binding_set_version'], 'The repaired immutable version must become active.' );
$after_artifact = $after_snapshot['installed']['pr2.delta']['1.0.1']['artifact'];
$after_bindings = gpp_pr2_binding_map( $after_artifact );

$changed_slots = array();
foreach ( $before_bindings as $slot => $binding ) {
    if ( CanonicalJson::encode( $binding ) !== CanonicalJson::encode( $after_bindings[ $slot ] ) ) {
        $changed_slots[] = $slot;
    }
}
gpp_assert_same( array( 'student.first_name' ), $changed_slots, 'Complete artifact delta must change exactly the selected semantic slot.' );
gpp_assert_same( 101, $after_bindings['student.first_name']['source_ref']['field_id'], 'Selected slot must store exactly selected Field 101.' );
gpp_assert_same( CanonicalJson::encode( $before_bindings['student.last_name'] ), CanonicalJson::encode( $after_bindings['student.last_name'] ), 'student.last_name must remain unchanged.' );
gpp_assert_same( CanonicalJson::encode( $before_bindings['student.photo'] ), CanonicalJson::encode( $after_bindings['student.photo'] ), 'Observed corrupted student.photo state must remain untouched; no target-specific migration is allowed.' );
gpp_assert_same( 101, $after_bindings['student.photo']['source_ref']['field_id'], 'Repairing first_name must not mutate student.photo even when both reference Field 101 afterward.' );
gpp_assert_same( CanonicalJson::encode( $before_bindings['student.national_id'] ), CanonicalJson::encode( $after_bindings['student.national_id'] ), 'Unrelated national-id binding must remain unchanged.' );

$claims = array();
foreach ( $after_artifact['runtime_claims'] as $claim ) {
    $claims[ $claim['semantic_slot_key'] . ':' . $claim['claim'] ] = $claim;
}
gpp_assert_same( 'NOT_PROVEN', $claims['student.first_name:availability']['evidence_state'], 'Selected-slot runtime proof must be invalidated.' );
gpp_assert_same( array(), $claims['student.first_name:availability']['evidence_refs'], 'Invalidated selected-slot proof must not retain stale refs.' );
gpp_assert_same( 'PROVEN', $claims['student.photo:availability']['evidence_state'], 'Unrelated photo proof must remain unchanged.' );
gpp_assert_same( array( 'unit:pr2' ), $claims['student.photo:availability']['evidence_refs'], 'Unrelated proof refs must remain unchanged.' );

$meanings = array(
    'student.first_name' => 'student given name',
    'student.last_name' => 'student family name',
    'student.photo' => 'authoritative student image/media',
    'student.national_id' => 'student national id',
);
$inventory = ( new GravityFormsFieldInventory() )->load( 77 );
$facts = ( new BindingHealthEvaluator() )->evaluate( $after_artifact, $meanings, $inventory );
$fact_map = array();
foreach ( $facts as $fact ) {
    $fact_map[ $fact['semantic_slot_key'] ] = $fact;
}
gpp_assert_same( BindingHealthEvaluator::HEALTHY, $fact_map['student.first_name']['status'], 'Health must evaluate repaired first_name as healthy.' );
gpp_assert_same( 101, $fact_map['student.first_name']['source']['field_id'], 'Health must reflect Field 101 on repaired first_name.' );
gpp_assert_same( 101, $fact_map['student.photo']['source']['field_id'], 'Health must preserve independent student.photo -> Field 101 state.' );

gpp_pr2_set_private( $addon, 'binding_health_service', new GppPr2RenderedHealth( $facts ) );
ob_start();
$addon->settings_gpp_binding_health( null );
$health_markup = ob_get_clean();
gpp_assert_true( false !== strpos( $health_markup, 'student.first_name' ), 'Rendered Health must expose repaired stable semantic slot.' );
gpp_assert_true( false !== strpos( $health_markup, 'student.photo' ), 'Rendered Health must continue to expose independent photo slot.' );
gpp_assert_true( false !== strpos( $health_markup, '<code>101</code>' ), 'Rendered Health must expose the repaired/current Field 101 identity.' );

echo "PR2_BINDING_ARTIFACT_DELTA_PASS\n";
echo "PR2_BINDING_IDENTITY_TESTS_PASS\n";
