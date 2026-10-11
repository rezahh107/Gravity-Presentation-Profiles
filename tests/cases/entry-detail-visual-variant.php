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

// This unit exercises WordPress gettext calls using the exact shipped MO data;
// real user-locale switching and HTML controls are covered in the WU21 browser.
$GLOBALS['gpp_variant_test_locale'] = 'en_US';
$GLOBALS['gpp_variant_test_catalog'] = array();
$mo = file_get_contents( dirname( __DIR__, 2 ) . '/languages/gravity-presentation-profiles-fa_IR.mo' );
$header = unpack( 'Vmagic/Vrevision/Vcount/Vorig/Vtrans/Vhash_size/Vhash_off', substr( $mo, 0, 28 ) );
gpp_assert_same( 0x950412de, $header['magic'], 'Variant gettext fixture needs a valid compiled MO.' );
for ( $i = 0; $i < $header['count']; $i++ ) {
    $id = unpack( 'Vlength/Voffset', substr( $mo, $header['orig'] + 8 * $i, 8 ) );
    $translation = unpack( 'Vlength/Voffset', substr( $mo, $header['trans'] + 8 * $i, 8 ) );
    $GLOBALS['gpp_variant_test_catalog'][ substr( $mo, $id['offset'], $id['length'] ) ] = substr( $mo, $translation['offset'], $translation['length'] );
}
function __( $source, $domain ) {
    if ( 'gravity-presentation-profiles' !== $domain || 'fa_IR' !== $GLOBALS['gpp_variant_test_locale'] ) {
        return $source;
    }
    return isset( $GLOBALS['gpp_variant_test_catalog'][ $source ] )
        ? $GLOBALS['gpp_variant_test_catalog'][ $source ]
        : $source;
}



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
gpp_assert_same( 'Current / Safe — stable design — active', $choices[0]['label'], 'English admin active design must not contain a Persian suffix.' );
gpp_assert_same( 'Full Width — expanded design', $choices[1]['label'], 'English admin inactive design must remain correctly labeled.' );
gpp_assert_same( '', $choices[0]['value'], 'Active choice is a no-op and must not persist a second visual state.' );
gpp_assert_true( '' !== $choices[1]['value'], 'Inactive Full Width choice must carry a bounded CAS command.' );

// Labels are presentation data only. Locale changes must not affect encoded
// activation commands, current identity, or the no-op sentinel.
$en_choices = $choices;
$before_locale_switch = $visual->snapshot();
$GLOBALS['gpp_variant_test_locale'] = 'fa_IR';
$fa_choices = $service->settingsChoices();
gpp_assert_same( 'Current / Safe — طرح فعلی و پایدار — فعال', $fa_choices[0]['label'], 'Persian admin must show the localized active-state suffix.' );
gpp_assert_same( 'Full Width — طرح جدید تمام‌عرض', $fa_choices[1]['label'], 'Persian admin must show the localized alternative design.' );
gpp_assert_same( '', $fa_choices[0]['value'], 'Persian active selection must stay no-op.' );
gpp_assert_same( $en_choices[1]['value'], $fa_choices[1]['value'], 'Locale switching must not change the bounded CAS command.' );
gpp_assert_same( $before_locale_switch, $visual->snapshot(), 'Switching admin locale must not mutate visual lifecycle state.' );
gpp_assert_same( EntryDetailVisualVariantService::STATUS_NO_CHANGE, $service->applySettingsValue( $fa_choices[0]['value'] )['status'], 'Persian active choice must remain a no-op.' );

// An unactivated state is safely read-only and must be human-readable in both locales.
$unknown_visual = new VisualPackageLifecycle( new EntryVariantMemoryStore() );
$unknown_service = new EntryDetailVisualVariantService( $unknown_visual, $operations );
gpp_assert_same( 'not_active', $unknown_service->activeFacts()['state'], 'Missing activation fixture must be genuinely unresolved.' );
$fa_unknown = $unknown_service->settingsChoices();
gpp_assert_same( 1, count( $fa_unknown ), 'Unrecognized selector must expose one non-mutating choice.' );
gpp_assert_same( '', $fa_unknown[0]['value'], 'Unknown activation cannot submit an action.' );
gpp_assert_same( 'طرح فعال جزئیات پرونده شناخته نشد — بدون تغییر نمایش', $fa_unknown[0]['label'], 'Unknown activation needs translated safe feedback.' );
$GLOBALS['gpp_variant_test_locale'] = 'en_US';
$en_unknown = $unknown_service->settingsChoices();
gpp_assert_same( 'Active Entry Detail design is not recognized — no visual change', $en_unknown[0]['label'], 'English unresolved state must be readable.' );
gpp_assert_same( $unknown_visual->snapshot(), $unknown_visual->snapshot(), 'Reading unknown activation must not write state.' );

foreach ( array(
    'The settings action could not be validated safely. Refresh the page and try again.',
    'The active Entry Detail design changed after this settings action was prepared. The newer activation was left unchanged.',
    'The selected Entry Detail design action is invalid. Refresh the page and try again.',
) as $message ) {
    gpp_assert_true( isset( $GLOBALS['gpp_variant_test_catalog'][ $message ] ) && preg_match( '/[\\x{0600}-\\x{06FF}]/u', $GLOBALS['gpp_variant_test_catalog'][ $message ] ), 'Shipped catalog must cover backend error: ' . $message );
}

echo "ENTRY_DETAIL_VISUAL_VARIANT_PASS\n";
