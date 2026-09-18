<?php
/** Entry Detail setup must fail closed when another profile is authoritative. */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailRuntimeReadinessService;

Autoloader::register();

final class EntryDetailConflictMemoryStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) return false;
        $this->state = $next_state;
        return true;
    }
}

$visual_store = new EntryDetailConflictMemoryStore();
$binding_store = new EntryDetailConflictMemoryStore();
$evidence_store = new EntryDetailConflictMemoryStore();
$visual = new VisualPackageLifecycle( $visual_store );
$operations = new OperationsSetupService(
    $visual,
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
    __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json',
    'fixture.example'
);

$base = $operations->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $base['status'], 'Operations setup establishes Print and binding authority before the conflict control.' );

$foreign_package = json_decode( (string) file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
gpp_assert_true( is_array( $foreign_package ), 'Foreign visual package fixture must decode.' );
$visual->import( $foreign_package );
$visual->activate(
    array(
        'surface' => EntryDetailSetupService::SURFACE,
        'package_id' => $foreign_package['package_id'],
        'package_version' => $foreign_package['package_version'],
        'profile_id' => 'shared.entry_detail.v1',
    )
);

$foreign_before = $visual->resolve( EntryDetailSetupService::SURFACE );
$print_before = $visual->resolve( OperationsSetupService::PRINT_SURFACE );
$binding_before = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();

$service = new EntryDetailSetupService(
    $operations,
    $visual,
    new EntryDetailRuntimeReadinessService( $binding_store, $evidence_store )
);
$result = $service->initialize( array( 'form_id' => 77 ) );

gpp_assert_same( EntryDetailSetupService::STATUS_CONFLICT, $result['status'], 'A foreign Entry Detail activation must report conflict.' );
gpp_assert_same( array( 'entry_detail_activation' ), array_keys( $result['steps'] ), 'Activation conflict must terminate before source qualification or package mutation.' );
gpp_assert_same( 'conflict', $result['steps']['entry_detail_activation']['outcome'], 'Conflict uses the bounded setup outcome vocabulary.' );
gpp_assert_same( 'visual_activation_conflict', $result['steps']['entry_detail_activation']['reason'], 'Conflict exposes the bounded lifecycle reason code.' );
gpp_assert_same( $foreign_before, $visual->resolve( EntryDetailSetupService::SURFACE ), 'Foreign Entry Detail activation remains exactly authoritative.' );
gpp_assert_same( $print_before, $visual->resolve( OperationsSetupService::PRINT_SURFACE ), 'Entry Detail conflict leaves Print activation unchanged.' );
gpp_assert_same(
    $binding_before,
    ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot(),
    'Entry Detail conflict leaves binding authority completely unchanged.'
);

echo "ENTRY_DETAIL_SETUP_CONFLICT_TESTS_PASS\n";
