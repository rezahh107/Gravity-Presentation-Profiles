<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;

Autoloader::register();

final class GppPr25MemoryStore implements StateStore {
    private $state = null;
    public $commit_count = 0;
    public $before_commit_number = null;
    public $before_commit = null;

    public function load() {
        return $this->state;
    }

    public function resetCommitCount() {
        $this->commit_count = 0;
    }

    public function commit( $expected_revision, $next_state ) {
        $this->commit_count++;

        if ( null !== $this->before_commit_number && $this->commit_count === $this->before_commit_number && is_callable( $this->before_commit ) ) {
            $callback = $this->before_commit;
            $this->before_commit = null;
            $this->before_commit_number = null;
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

function gpp_pr25_expect_reason( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message );
        return;
    }

    gpp_fail( $message . ' (no LifecycleException was raised)' );
}

function gpp_pr25_context( $installation_id = 'pr25-test-installation', $form_id = 77, $surfaces = array( 'gravity_flow.inbox' ) ) {
    return array(
        'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation_id ),
        'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => (int) $form_id ),
        'entry_source_ref' => null,
        'surfaces' => $surfaces,
    );
}

function gpp_pr25_binding_artifact( $binding_set_id, $version, $context ) {
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => $binding_set_id,
        'binding_set_version' => $version,
        'context' => $context,
        'provenance' => array(
            'producer' => 'PR25 deterministic lifecycle test',
            'evidence_refs' => array( 'unit:pr25' ),
        ),
        'bindings' => array(
            array(
                'semantic_slot_key' => 'student.full_name',
                'state' => 'PROVEN',
                'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ),
                'evidence_refs' => array( 'unit:pr25' ),
            ),
            array(
                'semantic_slot_key' => 'student.national_id',
                'state' => 'PROVEN',
                'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ),
                'evidence_refs' => array( 'unit:pr25' ),
            ),
        ),
        'runtime_claims' => array(
            array(
                'semantic_slot_key' => 'student.full_name',
                'claim' => 'availability',
                'evidence_state' => 'PROVEN',
                'evidence_refs' => array( 'unit:pr25' ),
            ),
        ),
    );
}

function gpp_pr25_activation_request( $artifact, $expected = '__omitted__' ) {
    $request = array(
        'context' => $artifact['context'],
        'binding_set_id' => $artifact['binding_set_id'],
        'binding_set_version' => $artifact['binding_set_version'],
    );

    if ( '__omitted__' !== $expected ) {
        $request['expected_current_activation'] = $expected;
    }

    return $request;
}

function gpp_pr25_setup_service( $visual_store, $binding_store ) {
    return new OperationsSetupService(
        new VisualPackageLifecycle( $visual_store ),
        new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
        dirname( __DIR__, 2 ) . '/profiles/srwf/operations/operations-package-v1.json',
        'fixture.example'
    );
}

// ---------------------------------------------------------------------------
// PRI-FND-001: explicit null is a lifecycle-level compare-and-set contract.
// ---------------------------------------------------------------------------

$null_store = new GppPr25MemoryStore();
$null_lifecycle = new BindingSetLifecycle( $null_store, new EvidenceReferenceGate( array( 'unit:pr25' ) ) );
$null_context = gpp_pr25_context();
$null_v1 = gpp_pr25_binding_artifact( 'pr25.null.bindings', '1.0.0', $null_context );
$null_v2 = gpp_pr25_binding_artifact( 'pr25.null.bindings', '2.0.0', $null_context );
$null_lifecycle->import( $null_v1 );
$null_lifecycle->import( $null_v2 );

$activated = $null_lifecycle->activateIfCurrent( gpp_pr25_activation_request( $null_v1, null ) );
gpp_assert_same(
    array( 'binding_set_id' => 'pr25.null.bindings', 'binding_set_version' => '1.0.0' ),
    $activated,
    'Explicit null expected-current must activate an unactivated context.'
);
echo "PR25_NULL_EXPECTATION_SUCCESS_PASS\n";

$before_conflict = $null_lifecycle->resolve( $null_context );
gpp_pr25_expect_reason(
    'stale_binding_management_action',
    static function () use ( $null_lifecycle, $null_v2 ) {
        $null_lifecycle->activateIfCurrent( gpp_pr25_activation_request( $null_v2, null ) );
    },
    'Explicit null expected-current must fail closed when an activation already exists.'
);
gpp_assert_same( $before_conflict, $null_lifecycle->resolve( $null_context ), 'Null-expectation conflict must preserve the existing activation exactly.' );
echo "PR25_NULL_EXPECTATION_CONFLICT_PASS\n";

// Absence of an expectation remains distinct from explicit null: the conditional
// API still requires the key rather than silently interpreting omission as null.
gpp_pr25_expect_reason(
    'invalid_request_keys',
    static function () use ( $null_lifecycle, $null_v2 ) {
        $null_lifecycle->activateIfCurrent( gpp_pr25_activation_request( $null_v2 ) );
    },
    'Omitted expected-current must remain invalid for conditional activation.'
);

// Deterministic revision-CAS interleaving. The outer transition observes no
// activation, then a second lifecycle writer activates V2 immediately before
// the outer store commit. No sleeps, threads or scheduler assumptions are used.
$cas_store = new GppPr25MemoryStore();
$cas_lifecycle = new BindingSetLifecycle( $cas_store, new EvidenceReferenceGate( array( 'unit:pr25' ) ) );
$cas_context = gpp_pr25_context( 'pr25-cas-installation' );
$cas_v1 = gpp_pr25_binding_artifact( 'pr25.cas.bindings', '1.0.0', $cas_context );
$cas_v2 = gpp_pr25_binding_artifact( 'pr25.cas.bindings', '2.0.0', $cas_context );
$cas_lifecycle->import( $cas_v1 );
$cas_lifecycle->import( $cas_v2 );
$cas_store->resetCommitCount();
$cas_store->before_commit_number = 1;
$cas_store->before_commit = static function () use ( $cas_store, $cas_v2 ) {
    $concurrent = new BindingSetLifecycle( $cas_store, new EvidenceReferenceGate( array( 'unit:pr25' ) ) );
    $concurrent->activate( gpp_pr25_activation_request( $cas_v2 ) );
};

gpp_pr25_expect_reason(
    'state_commit_failed',
    static function () use ( $cas_lifecycle, $cas_v1 ) {
        $cas_lifecycle->activateIfCurrent( gpp_pr25_activation_request( $cas_v1, null ) );
    },
    'Revision CAS must reject an interleaving activation after the null expectation was checked.'
);
gpp_assert_same(
    array( 'binding_set_id' => 'pr25.cas.bindings', 'binding_set_version' => '2.0.0' ),
    $cas_lifecycle->resolve( $cas_context ),
    'Revision-CAS rejection must preserve the concurrent authoritative activation.'
);
echo "PR25_NULL_EXPECTATION_REVISION_CAS_PASS\n";

// Operations Setup race at the lifecycle enforcement boundary. The setup seed
// is imported first. During the seed activation commit, a concurrent lifecycle
// writer makes a different installed binding authoritative. The stale setup
// activation must fail CAS and must not overwrite it.
$setup_race_visual_store = new GppPr25MemoryStore();
$setup_race_binding_store = new GppPr25MemoryStore();
$setup_race_context = gpp_pr25_context(
    'fixture.example',
    77,
    array( 'gravity_flow.inbox', 'gravity_flow.entry_detail', 'print.dossier' )
);
$foreign_binding = gpp_pr25_binding_artifact( 'pr25.concurrent.authority', '9.0.0', $setup_race_context );
$foreign_lifecycle = new BindingSetLifecycle( $setup_race_binding_store, new EvidenceReferenceGate( array( 'unit:pr25' ) ) );
$foreign_lifecycle->import( $foreign_binding );
$setup_race_binding_store->resetCommitCount();
$setup_race_binding_store->before_commit_number = 2;
$setup_race_binding_store->before_commit = static function () use ( $setup_race_binding_store, $foreign_binding ) {
    $concurrent = new BindingSetLifecycle( $setup_race_binding_store, new EvidenceReferenceGate( array( 'unit:pr25' ) ) );
    $concurrent->activate( gpp_pr25_activation_request( $foreign_binding ) );
};

$setup_race_service = gpp_pr25_setup_service( $setup_race_visual_store, $setup_race_binding_store );
$setup_race_result = $setup_race_service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_FAILED, $setup_race_result['status'], 'A revision-CAS collision during initial binding activation must fail setup closed.' );
gpp_assert_same( 'failed', $setup_race_result['steps']['binding_context']['outcome'], 'The binding step must report the lifecycle CAS failure truthfully.' );
gpp_assert_same( 'state_commit_failed', $setup_race_result['steps']['binding_context']['reason'], 'The deterministic interleaving must be rejected specifically by revision CAS.' );
$setup_race_active = ( new BindingSetLifecycle( $setup_race_binding_store, new EvidenceReferenceGate( array( 'unit:pr25' ) ) ) )->resolve( $setup_race_context );
gpp_assert_same(
    array( 'binding_set_id' => 'pr25.concurrent.authority', 'binding_set_version' => '9.0.0' ),
    $setup_race_active,
    'Operations Setup must leave the concurrently established authoritative activation untouched.'
);
echo "PR25_OPERATIONS_SETUP_BINDING_RACE_PASS\n";

// ---------------------------------------------------------------------------
// PRI-FND-002: prerequisite conflicts stop all dependent setup mutation.
// ---------------------------------------------------------------------------

$package_path = dirname( __DIR__, 2 ) . '/profiles/srwf/operations/operations-package-v1.json';
$operations_package = json_decode( (string) file_get_contents( $package_path ), true );
gpp_assert_true( is_array( $operations_package ), 'Operations package fixture must decode.' );

// Negative control 1: same package identity/version, structurally valid, but
// different content. Import conflict may append its own audit fact, but it must
// not activate Print and must not touch binding authority downstream.
$package_conflict_visual_store = new GppPr25MemoryStore();
$package_conflict_binding_store = new GppPr25MemoryStore();
$package_conflict_visual = new VisualPackageLifecycle( $package_conflict_visual_store );
$conflicting_package = $operations_package;
$conflicting_package['provenance']['producer'] .= ' / conflicting-content-control';
$conflicting_import = $package_conflict_visual->import( $conflicting_package );
gpp_assert_same( 'INSTALLED_INACTIVE', $conflicting_import['status'], 'Conflicting-content control must itself be a structurally valid package.' );
$package_conflict_before_visual = $package_conflict_visual->snapshot();
$package_conflict_before_binding = ( new BindingSetLifecycle( $package_conflict_binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( null, $package_conflict_visual->resolve( 'print.dossier' ), 'Package-conflict precondition must start with Print unactivated.' );

$package_conflict_service = gpp_pr25_setup_service( $package_conflict_visual_store, $package_conflict_binding_store );
$package_conflict_result = $package_conflict_service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_CONFLICT, $package_conflict_result['status'], 'Same identity/version with different package content must report setup conflict.' );
gpp_assert_same( array( 'package_import' ), array_keys( $package_conflict_result['steps'] ), 'Package conflict must terminate orchestration before Print and binding steps execute.' );
gpp_assert_same( 'conflict', $package_conflict_result['steps']['package_import']['outcome'], 'Package import conflict must retain canonical setup outcome vocabulary.' );
gpp_assert_same( null, $package_conflict_visual->resolve( 'print.dossier' ), 'Package import conflict must not newly activate Print.' );
$package_conflict_after_visual = $package_conflict_visual->snapshot();
$package_conflict_after_binding = ( new BindingSetLifecycle( $package_conflict_binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
$package_id = $operations_package['package_id'];
$package_version = $operations_package['package_version'];
gpp_assert_same(
    $package_conflict_before_visual['installed'][ $package_id ][ $package_version ]['content_hash'],
    $package_conflict_after_visual['installed'][ $package_id ][ $package_version ]['content_hash'],
    'Package conflict must preserve the already-installed conflicting package bytes as authority.'
);
gpp_assert_same( $package_conflict_before_visual['activations'], $package_conflict_after_visual['activations'], 'Package conflict must leave visual activation authority unchanged.' );
gpp_assert_same( $package_conflict_before_binding, $package_conflict_after_binding, 'Package conflict must leave binding lifecycle state completely untouched downstream.' );
echo "PR25_PACKAGE_CONFLICT_FAIL_CLOSED_PASS\n";

// Negative control 2: an unrelated valid Print profile is already authoritative.
// Package import may legitimately complete, but the Print conflict must stop
// binding-context creation/activation entirely.
$foreign_visual_store = new GppPr25MemoryStore();
$foreign_binding_store = new GppPr25MemoryStore();
$foreign_visual = new VisualPackageLifecycle( $foreign_visual_store );
$foreign_package = json_decode( (string) file_get_contents( dirname( __DIR__ ) . '/fixtures/wu09-visual-package.json' ), true );
gpp_assert_true( is_array( $foreign_package ), 'Foreign Print package fixture must decode.' );
$foreign_visual->import( $foreign_package );
$foreign_visual->activate(
    array(
        'surface' => 'print.dossier',
        'package_id' => $foreign_package['package_id'],
        'package_version' => $foreign_package['package_version'],
        'profile_id' => 'shared.print.v1',
    )
);
$foreign_activation_before = $foreign_visual->resolve( 'print.dossier' );
$foreign_binding_before = ( new BindingSetLifecycle( $foreign_binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();

$foreign_service = gpp_pr25_setup_service( $foreign_visual_store, $foreign_binding_store );
$foreign_result = $foreign_service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_CONFLICT, $foreign_result['status'], 'Foreign Print activation must report setup conflict.' );
gpp_assert_same( array( 'package_import', 'print_activation' ), array_keys( $foreign_result['steps'] ), 'Print activation conflict must terminate orchestration before binding-context setup.' );
gpp_assert_true( in_array( $foreign_result['steps']['package_import']['outcome'], array( 'installed', 'already_installed' ), true ), 'Package prerequisite may legitimately complete before the Print conflict.' );
gpp_assert_same( 'conflict', $foreign_result['steps']['print_activation']['outcome'], 'Foreign Print activation must retain canonical conflict outcome.' );
gpp_assert_same( $foreign_activation_before, $foreign_visual->resolve( 'print.dossier' ), 'Foreign Print activation must remain exactly authoritative after setup conflict.' );
$foreign_binding_after = ( new BindingSetLifecycle( $foreign_binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( $foreign_binding_before, $foreign_binding_after, 'Print activation conflict must not create, import or activate any downstream binding context.' );
gpp_assert_same( null, ( new BindingSetLifecycle( $foreign_binding_store, new EvidenceReferenceGate( array() ) ) )->resolve( $foreign_service->bindingContext( 77 ) ), 'No binding activation may appear after the failed Print prerequisite.' );
echo "PR25_FOREIGN_PRINT_FAIL_CLOSED_PASS\n";

echo "PR25_ROOT_REPAIR_TESTS_PASS\n";
