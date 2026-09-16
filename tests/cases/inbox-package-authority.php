<?php
/**
 * PRI-FND-001 falsification: Inbox setup must consume the canonical Operations
 * Package exactly as supplied by OperationsSetupService::packageArtifact().
 */

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;
use GravityPresentationProfiles\GravityForms\InboxSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeReadinessService;

Autoloader::register();

final class PriFnd001MemoryStateStore implements StateStore {
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

function pri_fnd_001_due_required( $artifact ) {
    foreach ( $artifact['semantic_slots'] as $slot ) {
        if ( 'workflow.due_at' !== $slot['semantic_slot_key'] ) {
            continue;
        }
        foreach ( $slot['surface_usage'] as $usage ) {
            if ( 'gravity_flow.inbox' === $usage['surface'] ) {
                return $usage['required'];
            }
        }
    }

    return null;
}

function pri_fnd_001_inbox_profile_id( $artifact ) {
    foreach ( $artifact['surface_profiles'] as $profile ) {
        if ( 'gravity_flow.inbox' === $profile['surface'] ) {
            return $profile['profile_id'];
        }
    }

    return null;
}

function pri_fnd_001_services_for_package( $package_path ) {
    $visual_store = new PriFnd001MemoryStateStore();
    $binding_store = new PriFnd001MemoryStateStore();
    $evidence_store = new PriFnd001MemoryStateStore();

    $operations = new OperationsSetupService(
        new VisualPackageLifecycle( $visual_store ),
        new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
        $package_path,
        'pri-fnd-001.example'
    );

    $inbox = new InboxSetupService(
        $operations,
        new VisualPackageLifecycle( $visual_store ),
        new InboxRuntimeReadinessService( $binding_store, $evidence_store, new GravityFormsFieldInventory() )
    );

    return array( $operations, $inbox );
}

$shipped_path = __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json';
list( $shipped_operations, $shipped_inbox ) = pri_fnd_001_services_for_package( $shipped_path );
$shipped = $shipped_operations->packageArtifact();

gpp_assert_same( '1.0.1', $shipped['package_version'], 'The shipped canonical Operations Package version must remain 1.0.1.' );
gpp_assert_same( false, pri_fnd_001_due_required( $shipped ), 'The shipped canonical Operations Package must keep workflow.due_at optional for Inbox.' );
gpp_assert_same( $shipped, $shipped_inbox->packageArtifact(), 'Inbox setup must return the real shipped canonical Operations Package unchanged.' );

$sentinel = $shipped;
$sentinel['package_version'] = '9.9.9';
foreach ( $sentinel['semantic_slots'] as &$slot ) {
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

$sentinel_path = tempnam( sys_get_temp_dir(), 'gpp-pri-fnd-001-' );
if ( false === $sentinel_path ) {
    gpp_fail( 'Unable to create sentinel Operations Package file.' );
}
register_shutdown_function(
    static function () use ( $sentinel_path ) {
        if ( is_file( $sentinel_path ) ) {
            unlink( $sentinel_path );
        }
    }
);
file_put_contents( $sentinel_path, json_encode( $sentinel, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );

list( $sentinel_operations, $sentinel_inbox ) = pri_fnd_001_services_for_package( $sentinel_path );
$canonical_sentinel = $sentinel_operations->packageArtifact();
$consumed_sentinel = $sentinel_inbox->packageArtifact();

gpp_assert_same( '9.9.9', $canonical_sentinel['package_version'], 'Sentinel must exercise a valid future canonical package version.' );
gpp_assert_same( true, pri_fnd_001_due_required( $canonical_sentinel ), 'Sentinel must exercise package-owned semantic content distinct from the current shipped package.' );
gpp_assert_same( $canonical_sentinel, $consumed_sentinel, 'Inbox setup must not rewrite canonical package-owned version or semantic declarations.' );

$identity = $sentinel_inbox->inboxProfileIdentity();
gpp_assert_same( $canonical_sentinel['package_id'], $identity['package_id'], 'Inbox identity must derive package_id from the canonical artifact.' );
gpp_assert_same( $canonical_sentinel['package_version'], $identity['package_version'], 'Inbox identity must derive package_version from the canonical artifact.' );
gpp_assert_same( pri_fnd_001_inbox_profile_id( $canonical_sentinel ), $identity['profile_id'], 'Inbox identity must derive profile_id from the canonical artifact.' );

echo "INBOX_PACKAGE_AUTHORITY_PASS\n";
