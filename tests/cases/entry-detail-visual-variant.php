<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

Autoloader::register();

final class EntryVariantMemoryStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) return false;
        $this->state = $next_state;
        return true;
    }
}

function entry_variant_profile_identity( $artifact, $surface ) {
    foreach ( $artifact['surface_profiles'] as $profile ) {
        if ( $surface === $profile['surface'] ) {
            return array(
                'package_id' => $artifact['package_id'],
                'package_version' => $artifact['package_version'],
                'profile_id' => $profile['profile_id'],
            );
        }
    }
    return null;
}

function entry_variant_throws( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message . ' reason' );
        return;
    }
    gpp_fail( $message );
}

$visual_store = new EntryVariantMemoryStore();
$binding_store = new EntryVariantMemoryStore();
$visual = new VisualPackageLifecycle( $visual_store );
$bindings = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) );
$operations = new OperationsSetupService(
    $visual,
    $bindings,
    dirname( __DIR__, 2 ) . '/profiles/srwf/operations/operations-package-v1.json',
    'variant-fixture-installation'
);
$service = new EntryDetailVisualVariantService( $visual, $operations );
$base = $operations->packageArtifact();
$visual->import( $base );

$inbox = entry_variant_profile_identity( $base, 'gravity_flow.inbox' );
$current = entry_variant_profile_identity( $base, EntryDetailVisualVariant::SURFACE );
$print = entry_variant_profile_identity( $base, 'print.dossier' );
foreach ( array(
    'gravity_flow.inbox' => $inbox,
    EntryDetailVisualVariant::SURFACE => $current,
    'print.dossier' => $print,
) as $surface => $identity ) {
    $visual->activate(
        array(
            'surface' => $surface,
            'package_id' => $identity['package_id'],
            'package_version' => $identity['package_version'],
            'profile_id' => $identity['profile_id'],
        )
    );
}

// One real lifecycle binding context is present so visual switching can prove
// that it does not touch EnvironmentBindingSet state.
$setup = $operations->initialize( array( 'form_id' => 11 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $setup['status'], 'Operations setup fixture must complete.' );
$binding_before = $bindings->snapshot();
$inbox_before = $visual->resolve( 'gravity_flow.inbox' );
$print_before = $visual->resolve( 'print.dossier' );

$facts = $service->activeFacts();
gpp_assert_same( 'active', $facts['state'], 'Current / Safe must resolve as a known active variant.' );
gpp_assert_same( EntryDetailVisualVariant::CURRENT_SAFE, $facts['variant'], 'Current / Safe must be the initial variant.' );
gpp_assert_same( $current, $facts['activation'], 'Current / Safe identity must remain the exact operations-package activation.' );

$full = $service->fullWidthArtifact();
gpp_assert_same( '1.1.0', $full['schema_version'], 'Full Width must use the selected-surface package contract.' );
gpp_assert_same( array( EntryDetailVisualVariant::SURFACE ), $full['selected_surfaces'], 'Full Width package must select Entry Detail only.' );
gpp_assert_same( 1, count( $full['surface_profiles'] ), 'Full Width package must contain exactly one profile.' );
gpp_assert_same( EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID, $full['surface_profiles'][0]['profile_id'], 'Full Width profile identity must be stable.' );
gpp_assert_same( $current['profile_id'], EntryDetailVisualVariant::CURRENT_SAFE_PROFILE_ID, 'Current / Safe profile identity must stay stable.' );

$current_profile = null;
foreach ( $base['surface_profiles'] as $profile ) {
    if ( EntryDetailVisualVariant::SURFACE === $profile['surface'] ) $current_profile = $profile;
}
gpp_assert_true( is_array( $current_profile ), 'Current Entry Detail profile must exist.' );
gpp_assert_same( $current_profile['semantic_slots'], $full['surface_profiles'][0]['semantic_slots'], 'Full Width must preserve the exact Entry Detail semantic slot list.' );

$base_slot_contract = array();
foreach ( $base['semantic_slots'] as $slot ) {
    foreach ( $slot['surface_usage'] as $usage ) {
        if ( EntryDetailVisualVariant::SURFACE === $usage['surface'] ) {
            $base_slot_contract[ $slot['semantic_slot_key'] ] = array( $slot['meaning'], $usage['required'] );
        }
    }
}
$full_slot_contract = array();
foreach ( $full['semantic_slots'] as $slot ) {
    $full_slot_contract[ $slot['semantic_slot_key'] ] = array( $slot['meaning'], $slot['surface_usage'][0]['required'] );
}
gpp_assert_same( $base_slot_contract, $full_slot_contract, 'Full Width semantic meaning and requiredness must exactly match Current / Safe.' );

$to_full = $service->switchVariant(
    array(
        'target_variant' => EntryDetailVisualVariant::FULL_WIDTH,
        'expected_current_activation' => $current,
    )
);
gpp_assert_same( EntryDetailVisualVariantService::STATUS_COMPLETED, $to_full['status'], 'Current → Full Width must complete.' );
gpp_assert_same( $service->fullWidthIdentity(), $visual->resolve( EntryDetailVisualVariant::SURFACE ), 'Only Full Width Entry Detail must become active.' );
gpp_assert_same( $inbox_before, $visual->resolve( 'gravity_flow.inbox' ), 'Inbox activation must not change.' );
gpp_assert_same( $print_before, $visual->resolve( 'print.dossier' ), 'Print activation must not change.' );
gpp_assert_same( $binding_before, $bindings->snapshot(), 'EnvironmentBindingSet state must not change.' );

$snapshot = $visual->snapshot();
gpp_assert_true( isset( $snapshot['installed'][ $current['package_id'] ][ $current['package_version'] ] ), 'Current / Safe package must remain installed.' );
gpp_assert_true( isset( $snapshot['installed'][ EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID ][ EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION ] ), 'Full Width package must be installed independently.' );
gpp_assert_same( 1, count( $snapshot['installed'][ EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID ][ EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION ]['artifact']['surface_profiles'] ), 'No duplicate same-surface profile may be introduced.' );

entry_variant_throws(
    'visual_activation_conflict',
    static function () use ( $service, $current ) {
        $service->switchVariant(
            array(
                'target_variant' => EntryDetailVisualVariant::CURRENT_SAFE,
                'expected_current_activation' => $current,
            )
        );
    },
    'A stale settings action must not overwrite the newer Entry Detail activation.'
);
gpp_assert_same( $service->fullWidthIdentity(), $visual->resolve( EntryDetailVisualVariant::SURFACE ), 'Stale switch conflict must preserve Full Width.' );

$to_safe = $service->switchVariant(
    array(
        'target_variant' => EntryDetailVisualVariant::CURRENT_SAFE,
        'expected_current_activation' => $service->fullWidthIdentity(),
    )
);
gpp_assert_same( EntryDetailVisualVariantService::STATUS_COMPLETED, $to_safe['status'], 'Full Width → Current / Safe must complete.' );
gpp_assert_same( $current, $visual->resolve( EntryDetailVisualVariant::SURFACE ), 'Rollback must restore the exact original Entry Detail activation.' );
gpp_assert_same( $inbox_before, $visual->resolve( 'gravity_flow.inbox' ), 'Rollback must leave Inbox unchanged.' );
gpp_assert_same( $print_before, $visual->resolve( 'print.dossier' ), 'Rollback must leave Print unchanged.' );
gpp_assert_same( $binding_before, $bindings->snapshot(), 'Rollback must leave EnvironmentBindingSet unchanged.' );

$choices = $service->settingsChoices();
gpp_assert_same( 2, count( $choices ), 'Known activation must expose exactly two Owner choices.' );
gpp_assert_true( false !== strpos( $choices[0]['label'], 'Current / Safe' ) && false !== strpos( $choices[0]['label'], 'طرح فعلی و پایدار' ), 'Current / Safe label must be Owner-readable.' );
gpp_assert_true( false !== strpos( $choices[1]['label'], 'Full Width' ) && false !== strpos( $choices[1]['label'], 'طرح جدید تمام‌عرض' ), 'Full Width label must be Owner-readable.' );
gpp_assert_same( '', $choices[0]['value'], 'Active choice is a no-op and must not persist a second visual state.' );
gpp_assert_true( '' !== $choices[1]['value'], 'Inactive Full Width choice must carry a bounded CAS command.' );

echo "ENTRY_DETAIL_VISUAL_VARIANT_PASS\n";
