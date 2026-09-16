<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;

Autoloader::register();

final class LegacyPrintCompatStateStore implements StateStore {
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

$visual_store  = new LegacyPrintCompatStateStore();
$binding_store = new LegacyPrintCompatStateStore();
$visual        = new VisualPackageLifecycle( $visual_store );
$bindings      = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
$service       = new OperationsSetupService(
    $visual,
    $bindings,
    __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json',
    'fixture.example'
);

$current = $service->packageArtifact();
gpp_assert_same( '1.0.1', $current['package_version'], 'Regression fixture must exercise the current successor package.' );

$legacy = $current;
$legacy['package_version'] = '1.0.0';
foreach ( $legacy['semantic_slots'] as &$slot ) {
    if ( 'workflow.due_at' !== $slot['semantic_slot_key'] ) {
        continue;
    }

    foreach ( $slot['surface_usage'] as &$usage ) {
        if ( 'gravity_flow.inbox' === $usage['surface'] ) {
            $usage['required'] = true;
        }
    }
    unset( $usage );
}
unset( $slot );

$visual->import( $legacy );
$visual->activate(
    array(
        'surface' => OperationsSetupService::PRINT_SURFACE,
        'package_id' => $legacy['package_id'],
        'package_version' => $legacy['package_version'],
        'profile_id' => 'srwf.operations.print-dossier.v1',
    )
);

$before = $visual->resolve( OperationsSetupService::PRINT_SURFACE );
gpp_assert_same( '1.0.0', $before['package_version'], 'Legacy Print activation must be established before the rerun.' );

$readiness = $service->readiness( 77 );
gpp_assert_same(
    'active_operations_profile',
    $readiness['print_surface_activation'],
    'The known predecessor Print activation remains compatible with the Operations profile.'
);

$result = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same(
    OperationsSetupService::STATUS_COMPLETED,
    $result['status'],
    'Operations setup rerun must accept the compatible legacy Print activation.'
);
gpp_assert_same(
    'already_active',
    $result['steps']['print_activation']['outcome'],
    'Operations setup must preserve rather than upgrade the compatible legacy Print activation.'
);
gpp_assert_same(
    $before,
    $visual->resolve( OperationsSetupService::PRINT_SURFACE ),
    'Operations setup rerun must leave the legacy Print activation unchanged.'
);

echo "OPERATIONS_SETUP_LEGACY_PRINT_COMPAT_PASS\n";
