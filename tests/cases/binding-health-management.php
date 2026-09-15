<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\AdminBindingEvidenceStore;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\RepairBindingEvidenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\GravityForms\BindingHealthService;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

Autoloader::register();

final class GppBindingHealthMemoryStore implements StateStore {
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

function gpp_bh_field( $id, $label, $type = 'text' ) {
    $field = new stdClass();
    $field->id = $id;
    $field->label = $label;
    $field->type = $type;
    return $field;
}

function gpp_bh_binding() {
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => 'health.bindings',
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'health-test-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox' ),
        ),
        'provenance' => array( 'producer' => 'Binding health unit fixture', 'evidence_refs' => array( 'unit:initial' ) ),
        'bindings' => array(
            array( 'semantic_slot_key' => 'student.full_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ), 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'student.national_id', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ), 'evidence_refs' => array( 'unit:initial' ) ),
            array( 'semantic_slot_key' => 'school.name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
        ),
        'runtime_claims' => array(
            array( 'semantic_slot_key' => 'student.full_name', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:initial' ) ),
        ),
    );
}

function gpp_bh_fact( $facts, $slot ) {
    foreach ( $facts as $fact ) {
        if ( $fact['semantic_slot_key'] === $slot ) {
            return $fact;
        }
    }
    gpp_fail( 'Missing health fact for ' . $slot );
}

function gpp_bh_throws( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message );
        return;
    }
    gpp_fail( $message . ' (no exception)' );
}

GFAPI::$forms['77'] = array(
    'id' => 77,
    'title' => 'Synthetic Binding Health Form',
    'fields' => array(
        gpp_bh_field( 1, 'Student Name' ),
        gpp_bh_field( 2, 'National ID' ),
    ),
);

$binding_store = new GppBindingHealthMemoryStore();
$evidence_store = new GppBindingHealthMemoryStore();
$visual_store = new GppBindingHealthMemoryStore();
$initial = gpp_bh_binding();
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
$inventory_reader = new GravityFormsFieldInventory();
$evaluator = new BindingHealthEvaluator();
$meanings = array(
    'student.full_name' => 'student full name',
    'student.national_id' => 'student national id',
    'school.name' => 'school name',
);

$inventory = $inventory_reader->load( 77 );
$facts = $evaluator->evaluate( $initial, $meanings, $inventory );
gpp_assert_same( BindingHealthEvaluator::HEALTHY, gpp_bh_fact( $facts, 'student.full_name' )['status'], 'Existing field identity must be healthy.' );
gpp_assert_same( BindingHealthEvaluator::UNMAPPED, gpp_bh_fact( $facts, 'school.name' )['status'], 'UNBOUND semantic meaning must be explicitly unmapped.' );

GFAPI::$forms['77']['fields'][] = gpp_bh_field( 9, 'Student Name' );
$facts = $evaluator->evaluate( $initial, $meanings, $inventory_reader->load( 77 ) );
gpp_assert_same( BindingHealthEvaluator::HEALTHY, gpp_bh_fact( $facts, 'student.full_name' )['status'], 'Adding an unrelated or similar-looking field must not disturb a healthy binding.' );
gpp_assert_same( 1, gpp_bh_fact( $facts, 'student.full_name' )['source']['field_id'], 'Health must preserve the authoritative field identity instead of selecting a similar field.' );

GFAPI::$forms['77']['fields'][0]->label = 'Renamed Student Name';
$facts = $evaluator->evaluate( $initial, $meanings, $inventory_reader->load( 77 ) );
gpp_assert_same( BindingHealthEvaluator::HEALTHY, gpp_bh_fact( $facts, 'student.full_name' )['status'], 'A label-only rename must not invalidate the same authoritative field identity.' );

GFAPI::$forms['77']['fields'] = array(
    gpp_bh_field( 2, 'National ID' ),
    gpp_bh_field( 3, 'Student Name' ),
    gpp_bh_field( 9, 'Student Name Copy' ),
);
$facts = $evaluator->evaluate( $initial, $meanings, $inventory_reader->load( 77 ) );
$stale = gpp_bh_fact( $facts, 'student.full_name' );
gpp_assert_same( BindingHealthEvaluator::STALE_SOURCE_MISSING, $stale['status'], 'Deleting the bound field must produce stale/source-missing health.' );
gpp_assert_same( 1, $stale['source']['field_id'], 'A new similar-looking field must never replace the deleted authoritative identity automatically.' );

$repair = new BindingRepairService( $binding_store, $evidence_store, $inventory_reader );
$result = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => 'health.bindings',
        'binding_set_version' => '1.0.0',
        'semantic_slot_key' => 'student.full_name',
        'field_id' => 3,
    )
);
gpp_assert_same( '1.0.1', $result['binding_set_version'], 'Explicit repair must create a new deterministic immutable patch version.' );
$post_repair = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '1.0.1', $post_repair['activations'][ $context_key ]['binding_set_version'], 'Explicit repair must activate the new version.' );
gpp_assert_true( isset( $post_repair['installed']['health.bindings']['1.0.0'] ), 'Repair must retain the previous immutable version for rollback.' );
$new_artifact = $post_repair['installed']['health.bindings']['1.0.1']['artifact'];
$new_full_name = null;
$new_national = null;
foreach ( $new_artifact['bindings'] as $binding ) {
    if ( 'student.full_name' === $binding['semantic_slot_key'] ) {
        $new_full_name = $binding;
    }
    if ( 'student.national_id' === $binding['semantic_slot_key'] ) {
        $new_national = $binding;
    }
}
gpp_assert_same( 3, $new_full_name['source_ref']['field_id'], 'Repair must use exactly the administrator-selected replacement field.' );
gpp_assert_true( 0 === strpos( $new_full_name['evidence_refs'][0], 'gpp-admin-binding:' ), 'Repaired binding must carry bounded administrator-confirmation evidence.' );
gpp_assert_same(
    CanonicalJson::encode( $initial['bindings'][1] ),
    CanonicalJson::encode( $new_national ),
    'Unrelated healthy mappings must remain canonically unchanged by repair.'
);
gpp_assert_same( 'NOT_PROVEN', $new_artifact['runtime_claims'][0]['evidence_state'], 'Repair must not recycle old runtime evidence for a new source.' );
gpp_assert_same( array(), $new_artifact['runtime_claims'][0]['evidence_refs'], 'Runtime evidence invalidated by repair must not retain stale evidence refs.' );

$repaired_facts = $evaluator->evaluate( $new_artifact, $meanings, $inventory_reader->load( 77 ) );
gpp_assert_same( BindingHealthEvaluator::HEALTHY, gpp_bh_fact( $repaired_facts, 'student.full_name' )['status'], 'Re-evaluation after activation must see the explicitly selected real field as healthy.' );
gpp_assert_true( false === strpos( json_encode( $repaired_facts ), 'SECRET-PERSON-VALUE' ), 'Health facts must contain no submitted field values or PII.' );

$before_invalid = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_bh_throws(
    'repair_field_missing',
    static function () use ( $repair, $context_key ) {
        $repair->repairField(
            array(
                'context_key' => $context_key,
                'binding_set_id' => 'health.bindings',
                'binding_set_version' => '1.0.1',
                'semantic_slot_key' => 'student.full_name',
                'field_id' => 999,
            )
        );
    },
    'Invalid repair must reject a non-existent Gravity Forms field.'
);
$after_invalid = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( $before_invalid['activations'], $after_invalid['activations'], 'Failed repair must leave the previous authoritative activation intact.' );

$repair->rollback(
    array(
        'context_key' => $context_key,
        'binding_set_id' => 'health.bindings',
        'binding_set_version' => '1.0.0',
    )
);
$post_rollback = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '1.0.0', $post_rollback['activations'][ $context_key ]['binding_set_version'], 'Rollback must reactivate an exact previously-authoritative immutable version.' );

$malicious = $new_artifact;
$malicious['binding_set_version'] = '1.0.2';
foreach ( $malicious['bindings'] as &$binding ) {
    if ( 'student.full_name' === $binding['semantic_slot_key'] ) {
        $binding['evidence_refs'] = $new_full_name['evidence_refs'];
    }
}
unset( $binding );
$admin_store = new AdminBindingEvidenceStore( $evidence_store );
$malicious_lifecycle = new BindingSetLifecycle(
    $binding_store,
    new RepairBindingEvidenceGate( $admin_store, $malicious, $initial, new EvidenceReferenceGate( array() ) )
);
$malicious_lifecycle->import( $malicious );
gpp_bh_throws(
    'proven_evidence_not_admitted',
    static function () use ( $malicious_lifecycle, $malicious ) {
        $malicious_lifecycle->activate(
            array(
                'context' => $malicious['context'],
                'binding_set_id' => $malicious['binding_set_id'],
                'binding_set_version' => $malicious['binding_set_version'],
            )
        );
    },
    'Administrator evidence must be bound to the exact repaired artifact identity/version and source.'
);

$visual = new VisualPackageLifecycle( $visual_store );
$visual_package = json_decode( file_get_contents( dirname( __DIR__ ) . '/fixtures/wu09-visual-package.json' ), true );
$visual->import( $visual_package );
$visual->activate(
    array(
        'surface' => 'gravity_flow.inbox',
        'package_id' => $visual_package['package_id'],
        'package_version' => $visual_package['package_version'],
        'profile_id' => 'shared.inbox.v1',
    )
);
$health_service = new BindingHealthService(
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
    $visual,
    $inventory_reader,
    $evaluator
);
$health_output = $health_service->healthFacts();
gpp_assert_same( '1.0.0', $health_output['schema_version'], 'Diagnostics-ready binding health facts must use an explicit small schema.' );
gpp_assert_true( ! isset( $health_output['entries'] ), 'Health output must not contain submitted entry data.' );
gpp_assert_true( false === strpos( json_encode( $health_output ), 'SECRET-PERSON-VALUE' ), 'Diagnostics-ready health output must remain non-PII.' );

echo "BINDING_HEALTH_MANAGEMENT_TESTS_PASS\n";
