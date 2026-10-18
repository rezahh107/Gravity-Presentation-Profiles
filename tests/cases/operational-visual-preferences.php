<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Presentation\OperationalVisualPreferences;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxOperationalPaint;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailOperationalPaint;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

Autoloader::register();

final class GppOperationalVisualMemoryStore implements StateStore {
    private $state = null;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

function gpp_operational_paint_css( $surface, $profile, $package ) {
    if ( 'gravity_flow.inbox' === $surface ) {
        return InboxOperationalPaint::css( $profile, $package );
    }
    if ( 'gravity_flow.entry_detail' === $surface ) {
        return EntryDetailOperationalPaint::css( $profile, $package );
    }
    return '';
}

function gpp_operational_css( $lifecycle, $surface ) {
    $activation = $lifecycle->resolve( $surface );
    if ( null === $activation ) {
        return '';
    }
    $artifact = $lifecycle->snapshot()['installed'][ $activation['package_id'] ][ $activation['package_version'] ]['artifact'];
    return gpp_operational_paint_css( $surface, $lifecycle->effectiveProfile( $surface ), $artifact );
}

function gpp_operational_activation( $package, $surface ) {
    foreach ( $package['surface_profiles'] as $profile ) {
        if ( $surface === $profile['surface'] ) {
            return array(
                'surface' => $surface,
                'package_id' => $package['package_id'],
                'package_version' => $package['package_version'],
                'profile_id' => $profile['profile_id'],
            );
        }
    }
    gpp_fail( 'Missing synthetic surface.' );
}

$fixture = json_decode( file_get_contents( __DIR__ . '/../fixtures/generic-operational-paint-v11.json' ), true );
gpp_assert_true( is_array( $fixture ) && VisualProfilePackage::validate( $fixture ), 'Real JSON fixture must satisfy schema 1.1.' );
$store = new GppOperationalVisualMemoryStore();
$lifecycle = new VisualPackageLifecycle( $store );
gpp_assert_same( 'INSTALLED_INACTIVE', $lifecycle->import( $fixture )['status'], 'Import must be inactive.' );
foreach ( $fixture['selected_surfaces'] as $surface ) {
    gpp_assert_same( null, $lifecycle->resolve( $surface ), 'Import must not implicitly activate a surface.' );
    gpp_assert_same( '', gpp_operational_css( $lifecycle, $surface ), 'Inactive surfaces must never acquire CSS.' );
    $lifecycle->activate( gpp_operational_activation( $fixture, $surface ) );
}
$inbox_css = gpp_operational_css( $lifecycle, 'gravity_flow.inbox' );
$detail_css = gpp_operational_css( $lifecycle, 'gravity_flow.entry_detail' );
gpp_assert_true( false !== strpos( $inbox_css, '.gpp-inbox-surface{--gpp-inbox-canvas:#F8EADD;}' ), 'Inbox background maps to consumed painted canvas variable.' );
gpp_assert_true( false !== strpos( $inbox_css, '.gpp-inbox-surface__title{color:#3050A0;}' ), 'Inbox heading maps to GPP-owned title paint.' );
gpp_assert_true( false !== strpos( $inbox_css, '.gflow-inbox.gflow-grid.gflow-common .ag-header-cell{color:#6C4422;}' ), 'Inbox label maps to native header text paint only.' );
gpp_assert_true( false !== strpos( $detail_css, '.gpp-entry-dossier{background-color:#E5FAFF;}' ), 'Entry Detail surface maps to dossier paint.' );
gpp_assert_true( false !== strpos( $detail_css, '.gpp-entry-dossier__fact dt{color:#987654;}' ), 'Entry Detail label maps to dossier fact paint.' );
gpp_assert_true( false !== strpos( $detail_css, 'color:#234567;' ), 'Entry Detail headings consume independently selected color.' );
gpp_assert_true( false === strpos( $inbox_css . $detail_css, 'form_id' ), 'Visual output cannot bind to form identity.' );
gpp_assert_same( '', gpp_operational_css( $lifecycle, 'print.dossier' ), 'Print remains excluded.' );

$old = json_decode( file_get_contents( __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json' ), true );
gpp_assert_same(
    '',
    gpp_operational_paint_css( 'gravity_flow.inbox', $old['surface_profiles'][0], $old ),
    'Schema 1.0 SRWF paint must remain exactly under existing CSS control.'
);
gpp_assert_same( '', gpp_operational_paint_css( 'print.dossier', $fixture['surface_profiles'][0], $fixture ), 'No print projection.' );
gpp_assert_same( '', gpp_operational_paint_css( 'gravity_flow.inbox', $fixture['surface_profiles'][0], $fixture ), 'Wrong surface/profile is rejected.' );

$successor = $fixture;
$successor['package_version'] = '1.0.1';
$successor['design_tokens']['colors']['inbox_surface'] = '#DDF7E3';
$successor['design_tokens']['colors']['detail_surface'] = '#F5E4D2';
gpp_assert_same( 'INSTALLED_INACTIVE', $lifecycle->import( $successor )['status'], 'Successor version must import inactive.' );
gpp_assert_same( $inbox_css, gpp_operational_css( $lifecycle, 'gravity_flow.inbox' ), 'Inactive successor cannot restyle the active Inbox.' );
$lifecycle->activate( gpp_operational_activation( $successor, 'gravity_flow.inbox' ) );
gpp_assert_true( false !== strpos( gpp_operational_css( $lifecycle, 'gravity_flow.inbox' ), '#DDF7E3' ), 'Explicit new version changes Inbox CSS.' );
gpp_assert_same( $detail_css, gpp_operational_css( $lifecycle, 'gravity_flow.entry_detail' ), 'Inbox activation must not mutate Entry Detail.' );
$lifecycle->rollback( gpp_operational_activation( $fixture, 'gravity_flow.inbox' ) );
gpp_assert_same( $inbox_css, gpp_operational_css( $lifecycle, 'gravity_flow.inbox' ), 'Rollback must restore byte-identical old Inbox paint.' );

$conflict = $fixture;
$conflict['design_tokens']['colors']['inbox_surface'] = '#123456';
try {
    $lifecycle->import( $conflict );
    gpp_fail( 'Version conflict unexpectedly admitted different content.' );
} catch ( LifecycleException $exception ) {
    gpp_assert_same( 'identity_version_conflict', $exception->reasonCode(), 'Immutable version conflict is explicit.' );
}
gpp_assert_same( $inbox_css, gpp_operational_css( $lifecycle, 'gravity_flow.inbox' ), 'Rejected conflicting bytes cannot change paint.' );

$invalid = $fixture;
$invalid['surface_profiles'][1]['presentation']['css'] = 'body { color: red }';
gpp_assert_same( '', gpp_operational_paint_css( 'gravity_flow.inbox', $invalid['surface_profiles'][1], $invalid ), 'Invalid package cannot project CSS.' );
try {
    $lifecycle->import( $invalid );
    gpp_fail( 'Unsupported schema key unexpectedly imported.' );
} catch ( LifecycleException $exception ) {
    gpp_assert_same( 'visual_contract_violation', $exception->reasonCode(), 'Unsupported property fails closed.' );
}

$partial = $fixture;
unset( $partial['surface_profiles'][1]['presentation']['labels'] );
gpp_assert_true( VisualProfilePackage::validate( $partial ), 'Absent optional preferences remain valid.' );
$partial_css = gpp_operational_paint_css( 'gravity_flow.inbox', $partial['surface_profiles'][1], $partial );
gpp_assert_true( false === strpos( $partial_css, '.ag-header-cell' ), 'Absent label token cannot generate native header declaration.' );
gpp_assert_same( '', gpp_operational_paint_css( 'gravity_flow.inbox', array(), $fixture ), 'Missing profile must fail closed.' );


gpp_assert_same(
    ".gpp-inbox-surface{--gpp-inbox-canvas:#F8EADD;}\n"
        . ".gpp-inbox-surface__title{color:#3050A0;}\n"
        . ".gflow-inbox.gflow-grid.gflow-common .ag-header-cell{color:#6C4422;}",
    $inbox_css,
    'Inbox projection must remain byte-identical to the previously admitted CSS.'
);
gpp_assert_same(
    ".gpp-entry-dossier{background-color:#E5FAFF;}\n"
        . ".gpp-entry-dossier__header h1, .gpp-entry-dossier__section-title, .gpp-entry-dossier .gpp-entry-dossier__task-heading, #poststuff .gpp-entry-dossier .gpp-entry-dossier__task-heading{color:#234567;}\n"
        . ".gpp-entry-dossier__fact dt{color:#987654;}",
    $detail_css,
    'Entry Detail projection must remain byte-identical to the previously admitted CSS.'
);
gpp_assert_same(
    array(
        'composition.surface_background' => '#F8EADD',
        'sections.heading_text' => '#3050A0',
        'labels.text' => '#6C4422',
    ),
    OperationalVisualPreferences::colors( 'gravity_flow.inbox', $fixture['surface_profiles'][1], $fixture ),
    'Core interprets only an ordered, validated color map without CSS concerns.'
);
$core_source = file_get_contents( __DIR__ . '/../../src/Core/Presentation/OperationalVisualPreferences.php' );
foreach ( array( '.gpp-', '.gflow-', '.ag-', '#poststuff', 'background-color', '--gpp-' ) as $consumer_detail ) {
    gpp_assert_true( false === strpos( $core_source, $consumer_detail ), 'Core must not own consumer selector/property: ' . $consumer_detail );
}

// Schema 1.1 permits a valid paint-only package with zero semantic slots.
// Its schema validity is distinct from current operational runtime admission.
$zero_slots = $fixture;
$zero_slots['semantic_slots'] = array();
foreach ( $zero_slots['surface_profiles'] as &$zero_profile ) {
    $zero_profile['semantic_slots'] = array();
}
unset( $zero_profile );
gpp_assert_true( VisualProfilePackage::validate( $zero_slots ), 'Schema 1.1 paint-only zero-slot package is valid.' );
gpp_assert_same( $inbox_css, InboxOperationalPaint::css( $zero_slots['surface_profiles'][1], $zero_slots ), 'Core can interpret zero-slot paint without changing operational readiness.' );
gpp_assert_same( $detail_css, EntryDetailOperationalPaint::css( $zero_slots['surface_profiles'][0], $zero_slots ), 'Detail zero-slot paint tokens are schema-valid.' );
$zero_snapshot = array(
    'installed' => array(
        $zero_slots['package_id'] => array(
            $zero_slots['package_version'] => array( 'artifact' => $zero_slots ),
        ),
    ),
);
$zero_activation = array(
    'package_id' => $zero_slots['package_id'],
    'package_version' => $zero_slots['package_version'],
    'profile_id' => $zero_slots['surface_profiles'][0]['profile_id'],
);
foreach ( array( InboxPresentationAdapter::class, EntryDetailPresentationAdapter::class ) as $adapter ) {
    $gate = new ReflectionMethod( $adapter, 'activeVisualPackage' );
    gpp_assert_same( null, $gate->invoke( null, $zero_snapshot, $zero_activation ), 'Operational runtime still rejects zero-slot package; do not silently weaken readiness.' );
}

$inbox_style = file_get_contents( __DIR__ . '/../../assets/css/srwf-gravity-flow-inbox.css' );
$detail_style = file_get_contents( __DIR__ . '/../../assets/css/srwf-gravity-flow-entry-detail.css' );
gpp_assert_true( false !== strpos( $inbox_style, 'background-color: var(--gpp-inbox-canvas);' ), 'Projected Inbox canvas property must affect real paint.' );
gpp_assert_true( false !== strpos( $detail_style, '.gpp-entry-dossier__fact dt' ), 'Projected label targets a real GPP-owned dossier label.' );
echo "GPP_OPERATIONAL_VISUAL_PREFERENCES_PASS\n";
