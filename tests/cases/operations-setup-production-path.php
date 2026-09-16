<?php
/**
 * Exercises the product setup path an operator reaches, not a private fixture.
 *
 * Every lifecycle mutation below goes through OperationsSetupService — the same
 * callable the Gravity Forms settings action invokes. Nothing here provisions
 * lifecycle state directly, so a pass means that path genuinely exists and is
 * state-safe. It does not prove anything about the target production site.
 */

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\AdminBindingEvidenceStore;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationModel;

Autoloader::register();

final class SetupMemoryStateStore implements StateStore {
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

final class SetupStubField {
    public $id;
    public $label;
    public $type;
    public $choices;

    public function __construct( $id, $label, $type, $choices = array() ) {
        $this->id      = $id;
        $this->label   = $label;
        $this->type    = $type;
        $this->choices = $choices;
    }

    public function get_value_entry_detail( $value, $currency = '', $use_text = false, $format = 'html', $media = 'screen' ) {
        if ( ! is_string( $currency ) ) {
            throw new \InvalidArgumentException( 'currency argument must be a currency code string' );
        }
        if ( ! $use_text ) {
            return (string) $value;
        }
        foreach ( $this->choices as $choice ) {
            if ( (string) $choice['value'] === (string) $value ) {
                return $choice['text'];
            }
        }
        return (string) $value;
    }
}

function wp_strip_all_tags( $value ) {
    return strip_tags( (string) $value );
}

final class GFAPI {
    public static $form = array();

    public static function get_form( $form_id ) {
        return (int) $form_id === (int) self::$form['id'] ? self::$form : false;
    }

    public static function get_field( $form, $field_id ) {
        foreach ( $form['fields'] as $field ) {
            if ( (string) $field->id === (string) $field_id ) {
                return $field;
            }
        }
        return null;
    }
}

GFAPI::$form = array(
    'id' => 77,
    'title' => 'Registration',
    'fields' => array(
        new SetupStubField( 11, 'First name', 'text' ),
        new SetupStubField( 12, 'Last name', 'text' ),
        new SetupStubField( 13, 'School', 'text' ),
        new SetupStubField( 14, 'Gender', 'radio', array(
            array( 'text' => 'دختر', 'value' => 'F' ),
            array( 'text' => 'پسر', 'value' => 'M' ),
        ) ),
        new SetupStubField( 15, 'Gender (revised)', 'radio', array(
            array( 'text' => 'دختر', 'value' => 'girl' ),
            array( 'text' => 'پسر', 'value' => 'boy' ),
        ) ),
    ),
);

$package_path = __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json';
gpp_assert_true( is_readable( $package_path ), 'The operations package must ship in a production-owned project path.' );

function setup_service( $visual_store, $binding_store ) {
    return new OperationsSetupService(
        new VisualPackageLifecycle( $visual_store ),
        new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
        __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json',
        'fixture.example'
    );
}

function setup_throws( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message );
        return;
    }
    gpp_fail( $message . ' (no LifecycleException was raised)' );
}

// ---------------------------------------------------------------------------
// First run: the product path creates every piece of state Print needs.
// ---------------------------------------------------------------------------

$visual_store  = new SetupMemoryStateStore();
$binding_store = new SetupMemoryStateStore();
$service       = setup_service( $visual_store, $binding_store );

$first = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $first['status'], 'A clean installation completes operations setup through the product path.' );
gpp_assert_same( 'installed', $first['steps']['package_import']['outcome'], 'The shipped operations package installs through the visual lifecycle.' );
gpp_assert_same( 'activated', $first['steps']['print_activation']['outcome'], 'Print presentation is adopted for the print.dossier surface.' );
gpp_assert_same( 'seeded', $first['steps']['binding_context']['outcome'], 'An environment binding context is created for the explicitly selected form.' );

$visual = new VisualPackageLifecycle( $visual_store );
gpp_assert_same( 'srwf.operations.print-dossier.v1', $visual->resolve( 'print.dossier' )['profile_id'], 'The activated Print profile is the shipped operations profile.' );

// Activation boundary: packaging a surface is not activating it.
gpp_assert_same( null, $visual->resolve( 'gravity_flow.inbox' ), 'Inbox stays unactivated in this batch even though it is packaged.' );
gpp_assert_same( null, $visual->resolve( 'gravity_flow.entry_detail' ), 'Entry Detail stays unactivated in this batch even though it is packaged.' );

// ---------------------------------------------------------------------------
// Seed semantics: complete destination catalog, zero guessed sources.
// ---------------------------------------------------------------------------

$bindings = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
$context  = $service->bindingContext( 77 );
$active   = $bindings->resolve( $context );
gpp_assert_true( null !== $active, 'The seeded binding context is active for the selected form.' );

$snapshot = $bindings->snapshot();
$artifact = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'];

$seed_states = array();
foreach ( $artifact['bindings'] as $binding ) {
    $seed_states[ $binding['semantic_slot_key'] ] = $binding;
}

gpp_assert_same( 53, count( $seed_states ), 'The seed preserves the complete semantic destination catalog.' );

foreach ( $artifact['bindings'] as $binding ) {
    gpp_assert_same( null, $binding['source_ref'], 'No seeded slot may carry a guessed source: ' . $binding['semantic_slot_key'] );
    gpp_assert_true(
        in_array( $binding['state'], array( 'UNBOUND', 'NOT_APPLICABLE' ), true ),
        'A seeded slot is UNBOUND, or NOT_APPLICABLE where the contract says so: ' . $binding['semantic_slot_key']
    );
}

gpp_assert_same( 'UNBOUND', $seed_states['student.first_name']['state'], 'A name field is never inferred from its label.' );
gpp_assert_same( 'UNBOUND', $seed_states['student.full_name']['state'], 'The derived full-name slot is seeded without a duplicate host source.' );
gpp_assert_same( 'NOT_APPLICABLE', $seed_states['print.manual_approval_signature_stamp_notes']['state'], 'Physical signature and stamp regions stay NOT_APPLICABLE.' );

$claimed = array();
foreach ( $artifact['runtime_claims'] as $claim ) {
    gpp_assert_same( 'print_mapping', $claim['claim'], 'Setup seeds only print_mapping claims in this batch.' );
    gpp_assert_same( 'NOT_PROVEN', $claim['evidence_state'], 'Every seeded runtime claim starts NOT_PROVEN: ' . $claim['semantic_slot_key'] );
    gpp_assert_same( array(), $claim['evidence_refs'], 'A NOT_PROVEN claim carries no evidence provenance.' );
    $claimed[] = $claim['semantic_slot_key'];
}

foreach ( PrintDossierPresentationModel::printMappingRequiredSlots() as $slot ) {
    gpp_assert_true( in_array( $slot, $claimed, true ), 'Every Print-mapping-required slot is seeded as an explicit unproven claim: ' . $slot );
}

// Deferred non-field runtime facts must stay absent rather than fabricated.
foreach ( array( 'availability', 'authorization', 'action_permission', 'editability', 'host_seam' ) as $deferred ) {
    foreach ( $artifact['runtime_claims'] as $claim ) {
        gpp_assert_true( $deferred !== $claim['claim'], 'Deferred runtime claim families are not invented by setup: ' . $deferred );
    }
}

// ---------------------------------------------------------------------------
// Re-run safety, after an explicit administrator repair.
// ---------------------------------------------------------------------------

$evidence_store = new SetupMemoryStateStore();
$repair         = new BindingRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory() );
$context_key    = $bindings->contextKey( $context );

$repaired = $repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $active['binding_set_id'],
        'binding_set_version' => $active['binding_set_version'],
        'semantic_slot_key' => 'student.first_name',
        'field_id' => '11',
    )
);
gpp_assert_same( 'REPAIRED_AND_ACTIVATED', $repaired['status'], 'Explicit field repair remains the only way a source is bound.' );

$rerun = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $rerun['status'], 'Re-running setup on an already-initialized installation succeeds.' );
gpp_assert_same( 'already_installed', $rerun['steps']['package_import']['outcome'], 'Re-importing identical package content is idempotent, not a conflict.' );
gpp_assert_same( 'already_active', $rerun['steps']['print_activation']['outcome'], 'A valid existing Print activation is preserved, not re-activated.' );
gpp_assert_same( 'already_bound', $rerun['steps']['binding_context']['outcome'], 'An existing binding context is preserved, not re-seeded.' );

$after      = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->resolve( $context );
$after_snap = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
$after_art  = $after_snap['installed'][ $after['binding_set_id'] ][ $after['binding_set_version'] ]['artifact'];

gpp_assert_same( $repaired['binding_set_version'], $after['binding_set_version'], 'The repaired binding version stays active across a setup re-run.' );

$preserved = null;
foreach ( $after_art['bindings'] as $binding ) {
    if ( 'student.first_name' === $binding['semantic_slot_key'] ) {
        $preserved = $binding;
    }
}
gpp_assert_same( 'PROVEN', $preserved['state'], 'A repaired mapping is never rolled back to the UNBOUND seed.' );
gpp_assert_same( '11', (string) $preserved['source_ref']['field_id'], 'The repaired source field survives the re-run.' );

// ---------------------------------------------------------------------------
// Conflict handling: a different existing activation is reported, not replaced.
// ---------------------------------------------------------------------------

$conflict_visual_store  = new SetupMemoryStateStore();
$conflict_binding_store = new SetupMemoryStateStore();
$conflict_service       = setup_service( $conflict_visual_store, $conflict_binding_store );

$foreign = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$conflict_lifecycle = new VisualPackageLifecycle( $conflict_visual_store );
$conflict_lifecycle->import( $foreign );
$conflict_lifecycle->activate(
    array(
        'surface' => 'print.dossier',
        'package_id' => $foreign['package_id'],
        'package_version' => $foreign['package_version'],
        'profile_id' => 'shared.print.v1',
    )
);

$conflicted = $conflict_service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_CONFLICT, $conflicted['status'], 'A different existing Print activation makes setup report a conflict.' );
gpp_assert_same( 'conflict', $conflicted['steps']['print_activation']['outcome'], 'The conflicting step is named rather than reported as success.' );
gpp_assert_same( 'shared.print.v1', $conflict_lifecycle->resolve( 'print.dossier' )['profile_id'], 'The conflicting activation is left completely intact.' );

// The compare-and-set guard is what makes that non-destructive.
setup_throws(
    'visual_activation_conflict',
    static function () use ( $conflict_lifecycle, $foreign ) {
        $conflict_lifecycle->activateIfCurrent(
            array(
                'surface' => 'print.dossier',
                'package_id' => $foreign['package_id'],
                'package_version' => $foreign['package_version'],
                'profile_id' => 'shared.print.v1',
                'expected_current_activation' => null,
            )
        );
    },
    'Expecting an unactivated surface must fail when one is already active.'
);

setup_throws(
    'visual_activation_conflict',
    static function () use ( $conflict_lifecycle, $foreign ) {
        $conflict_lifecycle->activateIfCurrent(
            array(
                'surface' => 'print.dossier',
                'package_id' => $foreign['package_id'],
                'package_version' => $foreign['package_version'],
                'profile_id' => 'shared.print.v1',
                'expected_current_activation' => array(
                    'package_id' => $foreign['package_id'],
                    'package_version' => '9.9.9',
                    'profile_id' => 'shared.print.v1',
                ),
            )
        );
    },
    'A stale expected activation identity must be rejected.'
);

// ---------------------------------------------------------------------------
// An explicitly selected form is mandatory; nothing is auto-detected.
// ---------------------------------------------------------------------------

setup_throws(
    'setup_form_not_selected',
    static function () use ( $service ) {
        $service->initialize( array( 'form_id' => 0 ) );
    },
    'Setup must refuse to run without an explicitly selected form.'
);

setup_throws(
    'invalid_setup_request',
    static function () use ( $service ) {
        $service->initialize( array() );
    },
    'Setup must refuse a request that names no form at all.'
);

// ---------------------------------------------------------------------------
// Stale Print proof invalidation when the mapped source changes.
// ---------------------------------------------------------------------------

$proof_store    = new SetupMemoryStateStore();
$proof_evidence = new SetupMemoryStateStore();
$proof_bindings = new BindingSetLifecycle( $proof_store, new EvidenceReferenceGate( array( 'operator:gender-print-mapping' ) ) );

$proof_context = array(
    'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'fixture.example' ),
    'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
    'entry_source_ref' => null,
    'surfaces' => array( 'print.dossier' ),
);

$proven = array(
    'artifact_type' => 'gpp.environment_binding_set',
    'schema_version' => EnvironmentBindingSet::SCHEMA_VERSION_1_1,
    'binding_set_id' => 'srwf.operations.environment.f77',
    'binding_set_version' => '1.1.0',
    'context' => $proof_context,
    'provenance' => array( 'producer' => 'operator', 'evidence_refs' => array( 'operator:gender-print-mapping' ) ),
    'bindings' => array(
        array(
            'semantic_slot_key' => 'student.gender',
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 14 ),
            'evidence_refs' => array( 'operator:gender-print-mapping' ),
        ),
    ),
    'runtime_claims' => array(
        array(
            'semantic_slot_key' => 'student.gender',
            'claim' => 'print_mapping',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( 'operator:gender-print-mapping' ),
            'print_option_map' => array(
                array( 'canonical_option' => 'female', 'host_raw_value' => 'F' ),
                array( 'canonical_option' => 'male', 'host_raw_value' => 'M' ),
            ),
        ),
    ),
);

$proof_bindings->import( $proven );
$proof_bindings->activate(
    array(
        'context' => $proof_context,
        'binding_set_id' => $proven['binding_set_id'],
        'binding_set_version' => $proven['binding_set_version'],
    )
);

$proof_repair = new BindingRepairService( $proof_store, $proof_evidence, new GravityFormsFieldInventory(), array( 'operator:gender-print-mapping' ) );
$moved = $proof_repair->repairField(
    array(
        'context_key' => $proof_bindings->contextKey( $proof_context ),
        'binding_set_id' => $proven['binding_set_id'],
        'binding_set_version' => $proven['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'field_id' => '15',
    )
);

$moved_snapshot = $proof_bindings->snapshot();
$moved_artifact = $moved_snapshot['installed'][ $moved['binding_set_id'] ][ $moved['binding_set_version'] ]['artifact'];
$moved_claim    = $moved_artifact['runtime_claims'][0];

gpp_assert_same( 'NOT_PROVEN', $moved_claim['evidence_state'], 'Changing the mapped source invalidates the Print proof that depended on it.' );
gpp_assert_same( array(), $moved_claim['evidence_refs'], 'Invalidated proof keeps no evidence provenance.' );
gpp_assert_true( ! array_key_exists( 'print_option_map', $moved_claim ), 'The option map describing the previous field raw values is dropped with the proof.' );

// ---------------------------------------------------------------------------
// Full operator loop on the state this setup path created: map the choice
// field, confirm what one real host value means for Print, and prove the
// canonical option is then selected from the stored raw value.
// ---------------------------------------------------------------------------

$loop_repair  = new BindingRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory() );
$loop_current = $bindings->resolve( $context );

$gender_bound = $loop_repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $loop_current['binding_set_id'],
        'binding_set_version' => $loop_current['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'field_id' => '14',
    )
);

// Binding the field must not, by itself, make the Print meaning proven.
$package_artifact = $service->packageArtifact();
$print_profile    = null;
foreach ( $package_artifact['surface_profiles'] as $candidate ) {
    if ( 'print.dossier' === $candidate['surface'] ) {
        $print_profile = $candidate;
    }
}

$entry = array( 'id' => 5001, 'form_id' => 77, '11' => 'زهرا', '12' => 'رضایی', '14' => 'F' );

function setup_print_options( $binding_store, $context, $print_profile, $package_artifact, $entry ) {
    $lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
    $active    = $lifecycle->resolve( $context );
    $snapshot  = $lifecycle->snapshot();
    $artifact  = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'];
    $model     = new PrintDossierPresentationModel( $print_profile, array( $artifact ), $package_artifact['semantic_slots'] );

    return ( new GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierValueResolver( $model ) )
        ->resolve( GFAPI::$form, $entry, new GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierDecisionTrace() );
}

$before_confirmation = setup_print_options( $binding_store, $context, $print_profile, $package_artifact, $entry );
gpp_assert_true( ! $before_confirmation['options']['female'], 'Binding a choice field does not by itself prove what its values mean for Print.' );

$confirmed = $loop_repair->confirmPrintOption(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $gender_bound['binding_set_id'],
        'binding_set_version' => $gender_bound['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'canonical_option' => 'female',
        'host_raw_value' => 'F',
    )
);
gpp_assert_same( 'PRINT_OPTION_CONFIRMED', $confirmed['status'], 'Print option confirmation is its own explicit operation.' );

$after_confirmation = setup_print_options( $binding_store, $context, $print_profile, $package_artifact, $entry );
gpp_assert_true( $after_confirmation['options']['female'], 'The confirmed raw value selects its canonical Print option.' );
gpp_assert_true( ! $after_confirmation['options']['male'], 'An unconfirmed canonical option stays unselected.' );

// A value the bound field does not define cannot be confirmed.
setup_throws(
    'print_option_value_not_in_form',
    static function () use ( $loop_repair, $context_key, $confirmed ) {
        $loop_repair->confirmPrintOption(
            array(
                'context_key' => $context_key,
                'binding_set_id' => $confirmed['binding_set_id'],
                'binding_set_version' => $confirmed['binding_set_version'],
                'semantic_slot_key' => 'student.gender',
                'canonical_option' => 'male',
                'host_raw_value' => 'not-a-real-choice',
            )
        );
    },
    'A raw value absent from the form choices must be rejected rather than recorded.'
);

// Moving the mapping to a different field invalidates the proof that described
// the previous field, and the canonical option stops being selected.
$moved_gender = $loop_repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => $confirmed['binding_set_id'],
        'binding_set_version' => $confirmed['binding_set_version'],
        'semantic_slot_key' => 'student.gender',
        'field_id' => '15',
    )
);
gpp_assert_same( 'REPAIRED_AND_ACTIVATED', $moved_gender['status'], 'The source may be moved to a different explicit field.' );

$after_move = setup_print_options( $binding_store, $context, $print_profile, $package_artifact, array( 'id' => 5001, 'form_id' => 77, '15' => 'girl' ) );
gpp_assert_true( ! $after_move['options']['female'], 'Print proof tied to the previous mapping is no longer treated as valid.' );
gpp_assert_true( ! $after_move['options']['male'], 'No canonical option is selected until the new source is confirmed again.' );

echo "OPERATIONS_SETUP_PRODUCTION_PATH_PASS\n";
