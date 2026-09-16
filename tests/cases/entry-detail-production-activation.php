<?php
/** PR5 boundary for explicit Entry Detail profile adoption. */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeReadinessService;

Autoloader::register();

final class Pr5MemoryStateStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) return false;
        $this->state = $next_state;
        return true;
    }
}

$visual_store = new Pr5MemoryStateStore();
$binding_store = new Pr5MemoryStateStore();
$evidence_store = new Pr5MemoryStateStore();
$visual = new VisualPackageLifecycle( $visual_store );
$operations = new OperationsSetupService(
    $visual,
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
    __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json',
    'fixture.example'
);

$base = $operations->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $base['status'], 'Operations setup establishes the authoritative binding context first.' );
$print_before = $visual->resolve( 'print.dossier' );
gpp_assert_same( null, $visual->resolve( 'gravity_flow.entry_detail' ), 'Entry Detail starts inactive.' );

$service = new EntryDetailSetupService(
    $operations,
    $visual,
    new InboxRuntimeReadinessService( $binding_store, $evidence_store, new GravityFormsFieldInventory() )
);
$first = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( EntryDetailSetupService::STATUS_COMPLETED, $first['status'], 'Explicit Entry Detail adoption completes when the existing binding context is present.' );
gpp_assert_same( 'reused', $first['steps']['binding_context']['outcome'], 'Entry Detail reuses the existing EnvironmentBindingSet.' );
gpp_assert_same( 'activated', $first['steps']['entry_detail_activation']['outcome'], 'The shipped Entry Detail profile is explicitly activated.' );
gpp_assert_same( 'not_proven', $first['steps']['runtime_readiness']['outcome'], 'Activation must not invent Entry Detail runtime evidence.' );
gpp_assert_same( $print_before, $visual->resolve( 'print.dossier' ), 'Entry Detail adoption preserves Print activation.' );

$activation = $visual->resolve( 'gravity_flow.entry_detail' );
gpp_assert_same( 'srwf.operations.presentation', $activation['package_id'], 'Entry Detail uses the shipped Operations Package.' );
gpp_assert_same( 'srwf.operations.entry-detail.v1', $activation['profile_id'], 'Entry Detail adopts the shipped surface profile.' );

$second = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( EntryDetailSetupService::STATUS_COMPLETED, $second['status'], 'Entry Detail adoption is idempotent.' );
gpp_assert_same( 'already_active', $second['steps']['entry_detail_activation']['outcome'], 'Idempotent rerun preserves the same activation.' );
gpp_assert_same( 'not_proven', $second['steps']['runtime_readiness']['outcome'], 'Rerun still does not fabricate runtime proof.' );

echo "ENTRY_DETAIL_PRODUCTION_ACTIVATION_TESTS_PASS\n";
