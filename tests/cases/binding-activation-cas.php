<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\GravityForms\BindingHealthService;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

Autoloader::register();

final class GppBindingCasMemoryStore implements StateStore {
    private $state = null;
    public $before_commit = null;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        if ( is_callable( $this->before_commit ) ) {
            $callback = $this->before_commit;
            $this->before_commit = null;
            $callback();
        }

        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }

        $this->state = $next_state;
        return true;
    }
}

if ( ! class_exists( 'GFAPI' ) ) {
    final class GFAPI {
        public static $forms = array();

        public static function get_form( $form_id ) {
            return isset( self::$forms[ (string) $form_id ] ) ? self::$forms[ (string) $form_id ] : null;
        }

        public static function get_field( $form, $field_id ) {
            if ( ! is_array( $form ) || empty( $form['fields'] ) ) {
                return null;
            }
            $parent_id = false !== strpos( (string) $field_id, '.' ) ? strstr( (string) $field_id, '.', true ) : (string) $field_id;
            foreach ( $form['fields'] as $field ) {
                if ( is_object( $field ) && (string) $field->id === $parent_id ) {
                    return $field;
                }
            }
            return null;
        }
    }
}

function gpp_cas_field( $id, $label, $type = 'text' ) {
    $field = new stdClass();
    $field->id = $id;
    $field->label = $label;
    $field->type = $type;
    return $field;
}

function gpp_cas_artifact( $version ) {
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => 'cas.bindings',
        'binding_set_version' => $version,
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'cas-test-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox' ),
        ),
        'provenance' => array( 'producer' => 'Binding activation CAS test', 'evidence_refs' => array( 'unit:cas' ) ),
        'bindings' => array(
            array(
                'semantic_slot_key' => 'student.full_name',
                'state' => 'PROVEN',
                'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ),
                'evidence_refs' => array( 'unit:cas' ),
            ),
            array(
                'semantic_slot_key' => 'student.national_id',
                'state' => 'PROVEN',
                'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ),
                'evidence_refs' => array( 'unit:cas' ),
            ),
        ),
        'runtime_claims' => array(
            array(
                'semantic_slot_key' => 'student.full_name',
                'claim' => 'availability',
                'evidence_state' => 'PROVEN',
                'evidence_refs' => array( 'unit:cas' ),
            ),
        ),
    );
}

function gpp_cas_activation_request( $artifact ) {
    return array(
        'context' => $artifact['context'],
        'binding_set_id' => $artifact['binding_set_id'],
        'binding_set_version' => $artifact['binding_set_version'],
    );
}

function gpp_cas_expect_reason( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message );
        return $exception;
    }
    gpp_fail( $message . ' (no exception)' );
}

function gpp_cas_active( BindingSetLifecycle $lifecycle, $context ) {
    $active = $lifecycle->resolve( $context );
    gpp_assert_true( is_array( $active ), 'Expected an active binding identity.' );
    return $active;
}

GFAPI::$forms['77'] = array(
    'id' => 77,
    'title' => 'Synthetic CAS Form',
    'fields' => array(
        gpp_cas_field( 1, 'Student Name' ),
        gpp_cas_field( 2, 'National ID' ),
        gpp_cas_field( 3, 'Replacement Student Name' ),
    ),
);

// Enforcement-boundary falsification: the lifecycle itself must reject a
// mismatched expected current activation without changing authority.
$boundary_store = new GppBindingCasMemoryStore();
$boundary = new BindingSetLifecycle( $boundary_store, new EvidenceReferenceGate( array( 'unit:cas' ) ) );
$v1 = gpp_cas_artifact( '1.0.0' );
$v2 = gpp_cas_artifact( '2.0.0' );
$v3 = gpp_cas_artifact( '3.0.0' );
foreach ( array( $v1, $v2, $v3 ) as $artifact ) {
    $boundary->import( $artifact );
}
$boundary->activate( gpp_cas_activation_request( $v1 ) );
gpp_cas_expect_reason(
    'stale_binding_management_action',
    static function () use ( $boundary, $v2, $v3 ) {
        $request = gpp_cas_activation_request( $v2 );
        $request['expected_current_activation'] = array(
            'binding_set_id' => $v3['binding_set_id'],
            'binding_set_version' => $v3['binding_set_version'],
        );
        $boundary->activateIfCurrent( $request );
    },
    'Conditional activation must reject an incorrect expected-current identity at the lifecycle boundary.'
);
gpp_assert_same( '1.0.0', gpp_cas_active( $boundary, $v1['context'] )['binding_set_version'], 'Boundary rejection must preserve the existing authoritative activation.' );
echo "BINDING_ACTIVATION_BOUNDARY_BYPASS_TEST_PASS\n";

// Interleaving falsification: another lifecycle writer commits after the
// expected-current comparison but before the outer commit. Revision CAS must
// reject the stale outer transition and it must not reload/retry on V3.
$boundary_store->before_commit = static function () use ( $boundary_store, $v3 ) {
    $concurrent = new BindingSetLifecycle( $boundary_store, new EvidenceReferenceGate( array( 'unit:cas' ) ) );
    $concurrent->activate( gpp_cas_activation_request( $v3 ) );
};
gpp_cas_expect_reason(
    'state_commit_failed',
    static function () use ( $boundary, $v1, $v2 ) {
        $request = gpp_cas_activation_request( $v2 );
        $request['expected_current_activation'] = array(
            'binding_set_id' => $v1['binding_set_id'],
            'binding_set_version' => $v1['binding_set_version'],
        );
        $boundary->activateIfCurrent( $request );
    },
    'Revision CAS must reject an interleaving write after expected-current comparison.'
);
gpp_assert_same( '3.0.0', gpp_cas_active( $boundary, $v1['context'] )['binding_set_version'], 'Interleaving CAS failure must preserve the concurrent newer activation.' );
echo "BINDING_ACTIVATION_INTERLEAVING_CAS_TEST_PASS\n";

// Repair-race falsification: start from V1; import the generated patch; then
// activate V2 from the evidence-store commit before the repair's final
// activation transition. The imported repair artifact/evidence may remain inert
// but must not overwrite V2.
$binding_store = new GppBindingCasMemoryStore();
$evidence_store = new GppBindingCasMemoryStore();
$binding_lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:cas' ) ) );
$binding_lifecycle->import( $v1 );
$binding_lifecycle->import( $v2 );
$binding_lifecycle->activate( gpp_cas_activation_request( $v1 ) );
$context_key = $binding_lifecycle->contextKey( $v1['context'] );
$evidence_store->before_commit = static function () use ( $binding_store, $v2 ) {
    $concurrent = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:cas' ) ) );
    $concurrent->activate( gpp_cas_activation_request( $v2 ) );
};
$repair = new BindingRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory() );
gpp_cas_expect_reason(
    'stale_binding_management_action',
    static function () use ( $repair, $context_key ) {
        $repair->repairField(
            array(
                'context_key' => $context_key,
                'binding_set_id' => 'cas.bindings',
                'binding_set_version' => '1.0.0',
                'semantic_slot_key' => 'student.full_name',
                'field_id' => 3,
            )
        );
    },
    'A repair generated from V1 must fail closed when V2 becomes authoritative before final activation.'
);
$post_race = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '2.0.0', $post_race['activations'][ $context_key ]['binding_set_version'], 'Stale repair must preserve newer V2 authority.' );
gpp_assert_true( isset( $post_race['installed']['cas.bindings']['1.0.1'] ), 'Late stale rejection may leave the generated repair candidate installed but inert.' );
gpp_assert_true( '1.0.1' !== $post_race['activations'][ $context_key ]['binding_set_version'], 'Generated stale repair candidate must not become authoritative.' );
echo "BINDING_REPAIR_RACE_FALSIFICATION_PASS\n";

// The rollback choice must capture both target and the activation current when
// that choice was generated.
$visual_store = new GppBindingCasMemoryStore();
$health_service = new BindingHealthService(
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
    new VisualPackageLifecycle( $visual_store ),
    new GravityFormsFieldInventory(),
    new BindingHealthEvaluator()
);
$candidates_v2 = $health_service->managementCandidates();
$rollback_v1_from_v2 = null;
foreach ( $candidates_v2['rollbacks'] as $candidate ) {
    if ( '1.0.0' === $candidate['binding_set_version'] ) {
        $rollback_v1_from_v2 = $candidate;
        break;
    }
}
gpp_assert_true( is_array( $rollback_v1_from_v2 ), 'V2 management snapshot must offer previously-authoritative V1 as rollback target.' );
gpp_assert_same( '2.0.0', $rollback_v1_from_v2['expected_binding_set_version'], 'Rollback candidate must carry the exact currently-active version used to generate the choice.' );

// Make V3 authoritative after the choice was generated, then submit the stale
// V2-based rollback choice. It must not overwrite V3.
$binding_lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:cas' ) ) );
$binding_lifecycle->import( $v3 );
$binding_lifecycle->activate( gpp_cas_activation_request( $v3 ) );
gpp_cas_expect_reason(
    'stale_binding_management_action',
    static function () use ( $repair, $rollback_v1_from_v2 ) {
        $repair->rollback(
            array(
                'context_key' => $rollback_v1_from_v2['context_key'],
                'binding_set_id' => $rollback_v1_from_v2['binding_set_id'],
                'binding_set_version' => $rollback_v1_from_v2['binding_set_version'],
                'expected_binding_set_id' => $rollback_v1_from_v2['expected_binding_set_id'],
                'expected_binding_set_version' => $rollback_v1_from_v2['expected_binding_set_version'],
            )
        );
    },
    'A rollback choice generated under V2 must fail closed after V3 becomes authoritative.'
);
$post_stale_rollback = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '3.0.0', $post_stale_rollback['activations'][ $context_key ]['binding_set_version'], 'Stale rollback must preserve newer V3 authority.' );
echo "BINDING_STALE_ROLLBACK_FALSIFICATION_PASS\n";

// Positive rollback control from the still-current V3 activation.
$candidates_v3 = $health_service->managementCandidates();
$fresh_rollback_v1 = null;
foreach ( $candidates_v3['rollbacks'] as $candidate ) {
    if ( '1.0.0' === $candidate['binding_set_version'] ) {
        $fresh_rollback_v1 = $candidate;
        break;
    }
}
gpp_assert_true( is_array( $fresh_rollback_v1 ), 'Fresh V3 management snapshot must offer V1 rollback target.' );
$repair->rollback(
    array(
        'context_key' => $fresh_rollback_v1['context_key'],
        'binding_set_id' => $fresh_rollback_v1['binding_set_id'],
        'binding_set_version' => $fresh_rollback_v1['binding_set_version'],
        'expected_binding_set_id' => $fresh_rollback_v1['expected_binding_set_id'],
        'expected_binding_set_version' => $fresh_rollback_v1['expected_binding_set_version'],
    )
);
$post_positive_rollback = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '1.0.0', $post_positive_rollback['activations'][ $context_key ]['binding_set_version'], 'A fresh rollback generated against the still-current activation must reactivate the exact target.' );
echo "BINDING_POSITIVE_ROLLBACK_CONTROL_PASS\n";

// Positive repair control after rollback. The stale repair left 1.0.1 inert, so
// the deterministic next immutable patch is 1.0.2.
$result = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => 'cas.bindings',
        'binding_set_version' => '1.0.0',
        'semantic_slot_key' => 'student.full_name',
        'field_id' => 3,
    )
);
gpp_assert_same( '1.0.2', $result['binding_set_version'], 'Fresh repair must skip the already-installed inert stale candidate and create the next immutable patch version.' );
$post_positive_repair = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '1.0.2', $post_positive_repair['activations'][ $context_key ]['binding_set_version'], 'Fresh repair from the actual current version must activate its new immutable patch.' );
$repaired_artifact = $post_positive_repair['installed']['cas.bindings']['1.0.2']['artifact'];
$repaired_full_name = null;
$repaired_national_id = null;
foreach ( $repaired_artifact['bindings'] as $binding ) {
    if ( 'student.full_name' === $binding['semantic_slot_key'] ) {
        $repaired_full_name = $binding;
    }
    if ( 'student.national_id' === $binding['semantic_slot_key'] ) {
        $repaired_national_id = $binding;
    }
}
gpp_assert_same( 3, $repaired_full_name['source_ref']['field_id'], 'Fresh repair must preserve the exact administrator-selected replacement field identity.' );
gpp_assert_same( CanonicalJson::encode( $v1['bindings'][1] ), CanonicalJson::encode( $repaired_national_id ), 'Unchanged binding rows must remain canonically unchanged.' );
gpp_assert_same( 'NOT_PROVEN', $repaired_artifact['runtime_claims'][0]['evidence_state'], 'Repaired-slot PROVEN runtime claims must remain invalidated.' );
gpp_assert_same( array(), $repaired_artifact['runtime_claims'][0]['evidence_refs'], 'Invalidated repaired-slot runtime evidence must remain empty.' );
echo "BINDING_POSITIVE_REPAIR_CONTROL_PASS\n";

echo "BINDING_ACTIVATION_CAS_TESTS_PASS\n";
