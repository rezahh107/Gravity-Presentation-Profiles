<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

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
        unset( $form );
        return array();
    }
    public function init_frontend() {
    }
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

final class GppPr2Field {
    public $error = null;
    public function set_error( $message ) {
        $this->error = $message;
    }
}

final class GppPr2RepairRecorder {
    public $repairs = array();

    public function repairField( $request ) {
        $this->repairs[] = $request;
        return array( 'status' => 'REPAIRED_AND_ACTIVATED' );
    }

    public function confirmPrintOption( $request ) {
        unset( $request );
    }

    public function rollback( $request ) {
        unset( $request );
    }
}

final class GppPr2CandidateHealth {
    private $repairs;

    public function __construct( $repairs ) {
        $this->repairs = $repairs;
    }

    public function managementCandidates() {
        return array(
            'repairs' => $this->repairs,
            'print_options' => array(),
            'rollbacks' => array(),
        );
    }

    public function healthFacts() {
        return array( 'schema_version' => '1.0.0', 'contexts' => array() );
    }
}

final class GppPr2RenderedHealth {
    private $facts;

    public function __construct( $facts ) {
        $this->facts = $facts;
    }

    public function healthFacts() {
        return array(
            'schema_version' => '1.0.0',
            'contexts' => array(
                array(
                    'context_key' => 'pr2-context',
                    'binding_set_id' => 'pr2.bindings',
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

function gpp_pr2_repair_candidate( $slot, $meaning, $fields ) {
    return array(
        'context_key' => 'pr2-context',
        'binding_set_id' => 'pr2.bindings',
        'binding_set_version' => '1.0.0',
        'form_id' => 77,
        'form_title' => 'SRWF Registration',
        'semantic_slot_key' => $slot,
        'meaning' => $meaning,
        'status' => BindingHealthEvaluator::STALE_SOURCE_MISSING,
        'fields' => $fields,
    );
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

$fields = array(
    array( 'field_id' => 101, 'label' => 'نام', 'type' => 'text' ),
    array( 'field_id' => 102, 'label' => 'نام خانوادگی', 'type' => 'text' ),
    array( 'field_id' => 103, 'label' => 'تصویر', 'type' => 'fileupload' ),
    array( 'field_id' => 104, 'label' => 'کد ملی', 'type' => 'text' ),
);

$repairs = array(
    gpp_pr2_repair_candidate( 'student.first_name', 'student given name', $fields ),
    gpp_pr2_repair_candidate( 'student.last_name', 'student family name', $fields ),
    // Deliberately misleading descriptive text reproduces the old representation
    // hazard: the stable slot must still be visible and carried end-to-end.
    gpp_pr2_repair_candidate( 'student.photo', 'student given name', $fields ),
    gpp_pr2_repair_candidate( 'student.national_id', 'student national id', $fields ),
);

$addon = \GravityPresentationProfiles\GravityForms\AddOn::get_instance();
$recorder = new GppPr2RepairRecorder();
gpp_pr2_set_private( $addon, 'binding_health_service', new GppPr2CandidateHealth( $repairs ) );
gpp_pr2_set_private( $addon, 'binding_repair_service', $recorder );

$section = gpp_pr2_binding_section( $addon );
$action_field = $section['fields'][1];
$choices = $action_field['choices'];

$seen_values = array();
$representative = array(
    array( 'student.first_name', 101 ),
    array( 'student.last_name', 102 ),
    array( 'student.photo', 103 ),
    array( 'student.national_id', 104 ),
);

foreach ( $representative as $identity ) {
    $choice = gpp_pr2_find_choice( $choices, $identity[0], $identity[1] );
    gpp_assert_true( false !== strpos( $choice['label'], $identity[0] ), 'Rendered repair label must expose the exact stable semantic slot from its actionable payload.' );
    gpp_assert_true( false !== strpos( $choice['label'], 'Field ' . $identity[1] ), 'Rendered repair label must expose the exact actionable field identity.' );
    gpp_assert_true( ! isset( $seen_values[ $choice['value'] ] ), 'Distinct slot/field repair pairs must not collide on one actionable option value.' );
    $seen_values[ $choice['value'] ] = true;

    $field = new GppPr2Field();
    $before = count( $recorder->repairs );
    $addon->validate_binding_management_action( $field, stripslashes( trim( $choice['value'] ) ) );
    gpp_assert_same( null, $field->error, 'A rendered repair value must survive the Gravity Forms-style trim/unslash path.' );
    gpp_assert_same( $before + 1, count( $recorder->repairs ), 'Each representative rendered action must decode to exactly one repair call.' );
    $submitted = $recorder->repairs[ $before ];
    gpp_assert_same( $identity[0], $submitted['semantic_slot_key'], 'Visible semantic slot must equal submitted/decoded repair semantic slot.' );
    gpp_assert_same( $identity[1], $submitted['field_id'], 'Visible field identity must equal submitted/decoded repair field identity.' );
}

$photo_choice = gpp_pr2_find_choice( $choices, 'student.photo', 103 );
gpp_assert_true( false !== strpos( $photo_choice['label'], 'student.photo / student given name' ), 'Descriptive meaning text can never hide or substitute the stable slot identity in the rendered action.' );

$first_choice = gpp_pr2_find_choice( $choices, 'student.first_name', 101 );
$reordered = array_reverse( $repairs );
foreach ( $reordered as &$candidate ) {
    $candidate['fields'] = array_reverse( $candidate['fields'] );
}
unset( $candidate );
gpp_pr2_set_private( $addon, 'binding_health_service', new GppPr2CandidateHealth( $reordered ) );
$reordered_choices = gpp_pr2_binding_section( $addon )['fields'][1]['choices'];
$reordered_first = gpp_pr2_find_choice( $reordered_choices, 'student.first_name', 101 );
gpp_assert_same( $first_choice['value'], $reordered_first['value'], 'Candidate or field ordering must not change the meaning of an explicit slot/field action payload.' );

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
gpp_assert_true( false !== strpos( (string) $malformed_field->error, 'invalid' ), 'Incomplete repair payload must fail closed at the product decoder.' );
gpp_assert_same( $count_before_malformed, count( $recorder->repairs ), 'Malformed payload must never reach BindingRepairService.' );

echo "PR2_BINDING_OPTION_ROUND_TRIP_PASS\n";

GFAPI::$forms['77'] = array(
    'id' => 77,
    'title' => 'SRWF Registration',
    'fields' => array(
        gpp_pr2_field( 10, 'نام قدیمی' ),
        gpp_pr2_field( 20, 'نام خانوادگی' ),
        gpp_pr2_field( 40, 'کد ملی' ),
        gpp_pr2_field( 101, 'نام' ),
    ),
);

$initial = array(
    'artifact_type' => 'gpp.environment_binding_set',
    'schema_version' => '1.0.0',
    'binding_set_id' => 'pr2.bindings',
    'binding_set_version' => '1.0.0',
    'context' => array(
        'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'pr2-installation' ),
        'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
        'entry_source_ref' => null,
        'surfaces' => array( 'print.dossier' ),
    ),
    'provenance' => array( 'producer' => 'PR2 regression fixture', 'evidence_refs' => array( 'unit:pr2' ) ),
    'bindings' => array(
        array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 10 ), 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 20 ), 'evidence_refs' => array( 'unit:pr2' ) ),
        // Preserve the authentic bad target shape as evidence. Repairing first_name
        // must not silently reinterpret or migrate student.photo.
        array( 'semantic_slot_key' => 'student.photo', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 101 ), 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.national_id', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 40 ), 'evidence_refs' => array( 'unit:pr2' ) ),
    ),
    'runtime_claims' => array(
        array( 'semantic_slot_key' => 'student.first_name', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:pr2' ) ),
        array( 'semantic_slot_key' => 'student.photo', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:pr2' ) ),
    ),
);

$binding_store = new GppPr2MemoryStore();
$evidence_store = new GppPr2MemoryStore();
$lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:pr2' ) ) );
$lifecycle->import( $initial );
$lifecycle->activate(
    array(
        'context' => $initial['context'],
        'binding_set_id' => $initial['binding_set_id'],
        'binding_set_version' => $initial['binding_set_version'],
    )
);
$context_key = $lifecycle->contextKey( $initial['context'] );
$before_snapshot = $lifecycle->snapshot();
$before_artifact = $before_snapshot['installed']['pr2.bindings']['1.0.0']['artifact'];
$before_bindings = gpp_pr2_binding_map( $before_artifact );

$repair = new BindingRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory() );
$result = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => 'pr2.bindings',
        'binding_set_version' => '1.0.0',
        'semantic_slot_key' => 'student.first_name',
        'field_id' => 101,
    )
);
gpp_assert_same( '1.0.1', $result['binding_set_version'], 'Explicit repair must create the next immutable patch version.' );

$after_lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
$after_snapshot = $after_lifecycle->snapshot();
gpp_assert_true( isset( $after_snapshot['installed']['pr2.bindings']['1.0.0'] ), 'Previous immutable binding version must remain available for rollback.' );
gpp_assert_true( isset( $after_snapshot['installed']['pr2.bindings']['1.0.1'] ), 'Repair must install one new immutable binding version.' );
gpp_assert_same( '1.0.1', $after_snapshot['activations'][ $context_key ]['binding_set_version'], 'The exact repaired version must become active.' );
$after_artifact = $after_snapshot['installed']['pr2.bindings']['1.0.1']['artifact'];
$after_bindings = gpp_pr2_binding_map( $after_artifact );

$changed_slots = array();
foreach ( $before_bindings as $slot => $binding ) {
    if ( CanonicalJson::encode( $binding ) !== CanonicalJson::encode( $after_bindings[ $slot ] ) ) {
        $changed_slots[] = $slot;
    }
}
gpp_assert_same( array( 'student.first_name' ), $changed_slots, 'Complete before/after artifact delta must change exactly the selected semantic slot.' );
gpp_assert_same( 101, $after_bindings['student.first_name']['source_ref']['field_id'], 'Selected semantic slot must store the exact selected field identity.' );
gpp_assert_same( CanonicalJson::encode( $before_bindings['student.last_name'] ), CanonicalJson::encode( $after_bindings['student.last_name'] ), 'student.last_name must remain canonically unchanged.' );
gpp_assert_same( CanonicalJson::encode( $before_bindings['student.photo'] ), CanonicalJson::encode( $after_bindings['student.photo'] ), 'Existing corrupted student.photo evidence must remain untouched; no target-specific auto-migration is allowed.' );
gpp_assert_same( 101, $after_bindings['student.photo']['source_ref']['field_id'], 'Repairing student.first_name must not mutate the student.photo slot even when it already references Field 101.' );
gpp_assert_same( CanonicalJson::encode( $before_bindings['student.national_id'] ), CanonicalJson::encode( $after_bindings['student.national_id'] ), 'Unrelated national-id binding must remain canonically unchanged.' );

$claims = array();
foreach ( $after_artifact['runtime_claims'] as $claim ) {
    $claims[ $claim['semantic_slot_key'] . ':' . $claim['claim'] ] = $claim;
}
gpp_assert_same( 'NOT_PROVEN', $claims['student.first_name:availability']['evidence_state'], 'Repair must invalidate stale runtime proof for the selected semantic slot.' );
gpp_assert_same( array(), $claims['student.first_name:availability']['evidence_refs'], 'Invalidated selected-slot runtime proof must not retain stale evidence references.' );
gpp_assert_same( 'PROVEN', $claims['student.photo:availability']['evidence_state'], 'Unrelated runtime proof must remain unchanged.' );
gpp_assert_same( array( 'unit:pr2' ), $claims['student.photo:availability']['evidence_refs'], 'Unrelated runtime evidence references must remain unchanged.' );

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
gpp_assert_same( BindingHealthEvaluator::HEALTHY, $fact_map['student.first_name']['status'], 'Health after repair must evaluate the repaired first-name field as healthy.' );
gpp_assert_same( 101, $fact_map['student.first_name']['source']['field_id'], 'Health after repair must reflect Field 101 on the same repaired semantic slot.' );
gpp_assert_same( 101, $fact_map['student.photo']['source']['field_id'], 'Health must preserve the separate existing student.photo binding rather than moving it.' );

gpp_pr2_set_private( $addon, 'binding_health_service', new GppPr2RenderedHealth( $facts ) );
ob_start();
$addon->settings_gpp_binding_health( null );
$health_markup = ob_get_clean();
gpp_assert_true( false !== strpos( $health_markup, 'student.first_name' ), 'Rendered Health must expose the repaired stable semantic slot.' );
gpp_assert_true( false !== strpos( $health_markup, 'student.photo' ), 'Rendered Health must continue to expose the independent photo slot.' );
gpp_assert_true( false !== strpos( $health_markup, '<code>101</code>' ), 'Rendered Health must expose Field 101 as the current source identity after repair.' );

echo "PR2_BINDING_ARTIFACT_DELTA_PASS\n";
echo "PR2_BINDING_IDENTITY_TESTS_PASS\n";
