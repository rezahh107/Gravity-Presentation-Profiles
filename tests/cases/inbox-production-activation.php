<?php
/**
 * PR4 unit/integration boundary for explicit Inbox production setup.
 *
 * Host objects are synthetic, but every GPP state mutation is made through the
 * same production lifecycle/services used by the administrator surface.
 */

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;
use GravityPresentationProfiles\GravityForms\InboxSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationModel;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeReadinessService;

Autoloader::register();

final class Pr4MemoryStateStore implements StateStore {
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

final class Pr4Field {
    public $id;
    public $label;
    public $type;
    public $choices = array();
    public $inputs = null;
    public function __construct( $id, $label, $type = 'text' ) {
        $this->id = $id;
        $this->label = $label;
        $this->type = $type;
    }
}

final class GFAPI {
    public static $form;
    public static function get_form( $form_id ) {
        return (int) $form_id === (int) self::$form['id'] ? self::$form : false;
    }
    public static function get_field( $form, $field_id ) {
        $parent = is_string( $field_id ) && false !== strpos( $field_id, '.' ) ? strstr( $field_id, '.', true ) : $field_id;
        foreach ( $form['fields'] as $field ) {
            if ( (string) $field->id === (string) $parent ) {
                return $field;
            }
        }
        return null;
    }
    public static function get_entry( $entry_id ) {
        return array( 'id' => (int) $entry_id, 'form_id' => (int) self::$form['id'], 'date_created' => '2026-01-01 00:00:00' );
    }
}

final class Gravity_Flow_API {
    public function __construct( $form_id = 0 ) { unset( $form_id ); }
    public function get_current_step( $entry ) { unset( $entry ); return null; }
}

function wp_strip_all_tags( $value ) { return strip_tags( (string) $value ); }

GFAPI::$form = array(
    'id' => 77,
    'title' => 'PR4 Synthetic Operations Form',
    'fields' => array(
        new Pr4Field( 1, 'Photo', 'fileupload' ),
        new Pr4Field( 2, 'First name' ),
        new Pr4Field( 3, 'Last name' ),
        new Pr4Field( 4, 'National ID' ),
        new Pr4Field( 5, 'Grade / group' ),
        new Pr4Field( 6, 'School' ),
        new Pr4Field( 7, 'National ID replacement' ),
    ),
);

function pr4_operations_service( $visual_store, $binding_store ) {
    return new OperationsSetupService(
        new VisualPackageLifecycle( $visual_store ),
        new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
        __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json',
        'fixture.example'
    );
}

function pr4_inbox_service( $visual_store, $binding_store, $evidence_store ) {
    return new InboxSetupService(
        pr4_operations_service( $visual_store, $binding_store ),
        new VisualPackageLifecycle( $visual_store ),
        new InboxRuntimeReadinessService( $binding_store, $evidence_store, new GravityFormsFieldInventory() )
    );
}

function pr4_active_binding( $binding_store, $context ) {
    $lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
    $active = $lifecycle->resolve( $context );
    $snapshot = $lifecycle->snapshot();
    return array( $active, $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'] );
}

function pr4_map_field( BindingRepairService $repair, $binding_store, $context, $slot, $field_id ) {
    $lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
    $active = $lifecycle->resolve( $context );
    return $repair->repairField(
        array(
            'context_key' => $lifecycle->contextKey( $context ),
            'binding_set_id' => $active['binding_set_id'],
            'binding_set_version' => $active['binding_set_version'],
            'semantic_slot_key' => $slot,
            'field_id' => (string) $field_id,
        )
    );
}

$visual_store = new Pr4MemoryStateStore();
$binding_store = new Pr4MemoryStateStore();
$evidence_store = new Pr4MemoryStateStore();
$operations = pr4_operations_service( $visual_store, $binding_store );

$print_setup = $operations->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $print_setup['status'], 'Existing Print setup must complete before Inbox adoption.' );
$visual = new VisualPackageLifecycle( $visual_store );
$print_before = $visual->resolve( 'print.dossier' );
gpp_assert_same( '1.0.0', $print_before['package_version'], 'Existing Print activation remains on the legacy shipped package version.' );
gpp_assert_same( null, $visual->resolve( 'gravity_flow.inbox' ), 'Inbox must be inactive before the explicit Inbox action.' );

$context = $operations->bindingContext( 77 );
$repair = new BindingRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory() );
foreach ( array(
    'student.photo' => 1,
    'student.first_name' => 2,
    'student.last_name' => 3,
    'student.national_id' => 4,
    'education.grade_group' => 5,
    'school.name' => 6,
) as $slot => $field_id ) {
    $result = pr4_map_field( $repair, $binding_store, $context, $slot, $field_id );
    gpp_assert_same( 'REPAIRED_AND_ACTIVATED', $result['status'], 'Required mapped field must move through the existing repair lifecycle: ' . $slot );
}

list( $mapped_activation, $mapped_artifact ) = pr4_active_binding( $binding_store, $context );
$full_name_binding = null;
foreach ( $mapped_artifact['bindings'] as $binding ) {
    if ( 'student.full_name' === $binding['semantic_slot_key'] ) {
        $full_name_binding = $binding;
        break;
    }
}
gpp_assert_same( 'UNBOUND', $full_name_binding['state'], 'student.full_name must never become a second mapped host source.' );
gpp_assert_same( null, $full_name_binding['source_ref'], 'student.full_name must remain source-less in the authoritative binding artifact.' );

$inbox = pr4_inbox_service( $visual_store, $binding_store, $evidence_store );
$inbox_package = $inbox->packageArtifact();
gpp_assert_same( '1.0.1', $inbox_package['package_version'], 'Inbox must consume the deterministic successor of the shipped Operations Package.' );
$due_required = null;
foreach ( $inbox_package['semantic_slots'] as $slot ) {
    if ( 'workflow.due_at' !== $slot['semantic_slot_key'] ) {
        continue;
    }
    foreach ( $slot['surface_usage'] as $usage ) {
        if ( 'gravity_flow.inbox' === $usage['surface'] ) {
            $due_required = $usage['required'];
        }
    }
}
gpp_assert_same( false, $due_required, 'Owner clarification must make workflow.due_at optional in the executable Inbox package contract.' );
$first = $inbox->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( InboxSetupService::STATUS_COMPLETED, $first['status'], 'Explicit Inbox setup should complete against the existing mapped environment.' );
gpp_assert_same( 'reused', $first['steps']['binding_context']['outcome'], 'Inbox must reuse the existing EnvironmentBindingSet instead of seeding another mapping state.' );
gpp_assert_same( 'activated', $first['steps']['inbox_activation']['outcome'], 'Explicit action activates the shipped Inbox profile.' );
gpp_assert_true( in_array( $first['steps']['runtime_readiness']['outcome'], array( 'qualified', 'already_qualified' ), true ), 'Explicit setup establishes source-bound runtime readiness.' );

$inbox_activation = $visual->resolve( 'gravity_flow.inbox' );
gpp_assert_same( 'srwf.operations.presentation', $inbox_activation['package_id'], 'Inbox uses the same Operations Package identity.' );
gpp_assert_same( '1.0.1', $inbox_activation['package_version'], 'Inbox uses the due-optional successor package version.' );
gpp_assert_same( 'srwf.operations.inbox.v1', $inbox_activation['profile_id'], 'Inbox adopts the admitted shipped profile.' );
gpp_assert_same( $print_before, $visual->resolve( 'print.dossier' ), 'Explicit Inbox setup must not modify the existing Print activation.' );

list( $qualified_activation, $qualified ) = pr4_active_binding( $binding_store, $context );
gpp_assert_same( $mapped_activation['binding_set_id'], $qualified_activation['binding_set_id'], 'Inbox qualification reuses the existing binding-set identity.' );
gpp_assert_true( $mapped_activation['binding_set_version'] !== $qualified_activation['binding_set_version'], 'Runtime proof publishes an immutable successor binding version.' );

$binding_by_slot = array();
foreach ( $qualified['bindings'] as $binding ) {
    $binding_by_slot[ $binding['semantic_slot_key'] ] = $binding;
}
gpp_assert_same( 'gravity_forms.entry_meta', $binding_by_slot['entry.created_at']['source_ref']['type'], 'entry.created_at uses the Gravity Forms entry-metadata adapter.' );
gpp_assert_same( 'date_created', $binding_by_slot['entry.created_at']['source_ref']['meta_key'], 'entry.created_at binds to authentic date_created metadata.' );
gpp_assert_same( 'gravity_flow.state', $binding_by_slot['workflow.current_step']['source_ref']['type'], 'workflow.current_step uses the Gravity Flow state adapter.' );
gpp_assert_same( 'current_step', $binding_by_slot['workflow.current_step']['source_ref']['state_key'], 'workflow.current_step binds to the admitted current-step seam.' );
gpp_assert_same( 'UNBOUND', $binding_by_slot['workflow.due_at']['state'], 'Optional Due remains unresolved when no authoritative source exists.' );
gpp_assert_same( null, $binding_by_slot['workflow.due_at']['source_ref'], 'Optional Due must not be fabricated.' );
gpp_assert_same( 'UNBOUND', $binding_by_slot['student.full_name']['state'], 'Full name remains a presentation derivation after qualification.' );

$claims = array();
foreach ( $qualified['runtime_claims'] as $claim ) {
    if ( 'availability' === $claim['claim'] ) {
        $claims[ $claim['semantic_slot_key'] ] = $claim;
    }
    gpp_assert_true( 'authorization' !== $claim['claim'], 'Inbox runtime proof must never grant request authorization.' );
}
foreach ( array( 'student.photo', 'student.first_name', 'student.last_name', 'student.national_id', 'education.grade_group', 'school.name', 'entry.created_at', 'workflow.current_step' ) as $slot ) {
    gpp_assert_same( 'PROVEN', $claims[ $slot ]['evidence_state'], 'Required source availability must be PROVEN after qualification: ' . $slot );
    $expected = InboxRuntimeEvidence::availabilityRef( $qualified, $slot, $binding_by_slot[ $slot ]['source_ref'] );
    gpp_assert_true( in_array( $expected, $claims[ $slot ]['evidence_refs'], true ), 'Availability proof must be bound to exact source and binding version: ' . $slot );
}
gpp_assert_true( ! isset( $claims['workflow.due_at'] ), 'Optional unresolved Due must not receive invented availability proof.' );
gpp_assert_true( ! isset( $claims['student.full_name'] ), 'Derived full name must not receive duplicate direct-source availability proof.' );

$second = $inbox->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( InboxSetupService::STATUS_COMPLETED, $second['status'], 'Compatible Inbox setup rerun must be idempotent.' );
gpp_assert_same( 'already_active', $second['steps']['inbox_activation']['outcome'], 'Compatible Inbox activation is preserved.' );
gpp_assert_same( 'already_qualified', $second['steps']['runtime_readiness']['outcome'], 'Source-bound runtime evidence is not republished when still exact.' );
gpp_assert_same( $print_before, $visual->resolve( 'print.dossier' ), 'Idempotent Inbox rerun still leaves Print unchanged.' );

$remap = pr4_map_field( $repair, $binding_store, $context, 'student.national_id', 7 );
gpp_assert_same( 'REPAIRED_AND_ACTIVATED', $remap['status'], 'A source remap must use the existing mapping lifecycle.' );
list( $remapped_activation, $remapped ) = pr4_active_binding( $binding_store, $context );
$national_claim = null;
foreach ( $remapped['runtime_claims'] as $claim ) {
    if ( 'student.national_id' === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
        $national_claim = $claim;
        break;
    }
}
gpp_assert_same( 'NOT_PROVEN', $national_claim['evidence_state'], 'Changing the mapped source invalidates its previous runtime availability proof.' );

$successor = $inbox->packageArtifact();
$profile = null;
foreach ( $successor['surface_profiles'] as $candidate ) {
    if ( 'gravity_flow.inbox' === $candidate['surface'] ) {
        $profile = $candidate;
        break;
    }
}
$stale_model = new InboxPresentationModel( $profile, array( $remapped ), $successor['semantic_slots'] );
$stale_decision = $stale_model->presentationReadiness( array( 'id' => 9001, 'form_id' => 77 ) );
gpp_assert_true( ! $stale_decision['ready'], 'A binding-version change must make copied old runtime evidence stale until requalification.' );

$requalified = $inbox->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( InboxSetupService::STATUS_COMPLETED, $requalified['status'], 'Explicit Inbox rerun requalifies the remapped source.' );
gpp_assert_same( 'qualified', $requalified['steps']['runtime_readiness']['outcome'], 'Source change requires a new exact runtime qualification.' );
list( $requalified_activation, $requalified_artifact ) = pr4_active_binding( $binding_store, $context );
$ready_model = new InboxPresentationModel( $profile, array( $requalified_artifact ), $successor['semantic_slots'] );
gpp_assert_true( $ready_model->isPresentationReady( array( 'id' => 9001, 'form_id' => 77 ) ), 'Requalified exact source/version evidence restores configuration readiness.' );

$conflict_visual_store = new Pr4MemoryStateStore();
$conflict_binding_store = new Pr4MemoryStateStore();
$conflict_evidence_store = new Pr4MemoryStateStore();
$conflict_operations = pr4_operations_service( $conflict_visual_store, $conflict_binding_store );
$conflict_operations->initialize( array( 'form_id' => 77 ) );
$foreign = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$foreign_visual = new VisualPackageLifecycle( $conflict_visual_store );
$foreign_visual->import( $foreign );
$foreign_visual->activate(
    array(
        'surface' => 'gravity_flow.inbox',
        'package_id' => $foreign['package_id'],
        'package_version' => $foreign['package_version'],
        'profile_id' => 'shared.inbox.v1',
    )
);
$conflict_before = ( new BindingSetLifecycle( $conflict_binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
$conflict_service = pr4_inbox_service( $conflict_visual_store, $conflict_binding_store, $conflict_evidence_store );
$conflicted = $conflict_service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( InboxSetupService::STATUS_CONFLICT, $conflicted['status'], 'A different active Inbox profile must fail closed.' );
gpp_assert_same( 'shared.inbox.v1', $foreign_visual->resolve( 'gravity_flow.inbox' )['profile_id'], 'Conflicting Inbox activation remains untouched.' );
$conflict_after = ( new BindingSetLifecycle( $conflict_binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( $conflict_before, $conflict_after, 'Conflict preflight must not mutate EnvironmentBindingSet state.' );

gpp_assert_same( '1.0.0', $print_before['package_version'], 'PR4 must not silently migrate existing Print activation.' );

echo "INBOX_PRODUCTION_ACTIVATION_PASS\n";
