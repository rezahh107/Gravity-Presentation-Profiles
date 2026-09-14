<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu19_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) ) throw new RuntimeException( 'WU19 fixture manifest unavailable.' );
if ( ! class_exists( 'Gravity_Flow_Print_Entries' ) ) require_once gravity_flow()->get_base_path() . '/includes/pages/class-print-entries.php';

function wu19_assert( $condition, $message ) { if ( ! $condition ) throw new RuntimeException( $message ); }
function wu19_render_print( $entry_ids, $intent = true ) {
    $_GET['lid'] = implode( ',', array_map( 'intval', (array) $entry_ids ) );
    $_REQUEST['action'] = 'gravityflow_print_entries';
    if ( $intent ) $_GET['gpp_presentation'] = 'dossier'; else unset( $_GET['gpp_presentation'] );
    PrintDossierPresentationAdapter::resetRuntimeCache();
    ob_start();
    Gravity_Flow_Print_Entries::render();
    return ob_get_clean();
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) throw new RuntimeException( 'Pinned users unavailable.' );

wp_set_current_user( $operator->ID );
$happy = wu19_render_print( array( $manifest['happy']['entry_id'] ) );
wu19_assert( false !== strpos( $happy, 'data-gpp-print-state="ready"' ), 'Canonical dossier did not reach ready state.' );
wu19_assert( 1 === substr_count( $happy, 'data-gpp-print-page="front"' ), 'Front page cardinality changed.' );
wu19_assert( 1 === substr_count( $happy, 'data-gpp-print-page="back"' ), 'Back page cardinality changed.' );
wu19_assert( 5 === substr_count( $happy, 'gpp-print-receipt-row' ), 'Receipt rows must remain exactly five.' );
wu19_assert( 6 === substr_count( $happy, 'gpp-print-cheque-row' ), 'Cheque rows must remain exactly six.' );
wu19_assert( false !== strpos( $happy, 'data-gpp-logo="razavi"' ) && false !== strpos( $happy, 'data-gpp-logo="kanoon"' ), 'Approved Front logos missing.' );
wu19_assert( false === strpos( $happy, 'data-gpp-logo="center"' ), 'Forbidden center logo appeared.' );
wu19_assert( false !== strpos( $happy, 'data-gpp-manual="front-stamp-signature"' ) && false !== strpos( $happy, 'data-gpp-manual="management-approval"' ), 'Manual approval regions missing.' );
wu19_assert( false === strpos( $happy, $manifest['trap_values']['entry_created_at'] ), 'Financial date leaked from entry creation date.' );
wu19_assert( false === strpos( $happy, $manifest['trap_values']['father_mobile'] ) && false === strpos( $happy, $manifest['trap_values']['mother_mobile'] ), 'Phone 2 fell back to parent mobile.' );
wu19_assert( false === strpos( $happy, 'data-gpp-checked="1">✓</i>عادی' ) && false === strpos( $happy, 'data-gpp-checked="1">✓</i>نقد' ), 'Unproven option group selected a plausible fallback.' );
$trace = PrintDossierPresentationAdapter::lastDecisionTrace();
wu19_assert( ! empty( $trace ), 'Decision trace unavailable.' );
wu19_assert( in_array( array( 'stage' => 'PRINT_COMPOSITION_READY', 'outcome' => 'ready_two_pages' ), $trace, true ), 'ready_two_pages trace outcome missing.' );

$native = wu19_render_print( array( $manifest['happy']['entry_id'] ), false );
wu19_assert( false === strpos( $native, 'data-gpp-print-state=' ), 'Ordinary native Print was hijacked.' );
wu19_assert( false !== strpos( $native, 'entry-detail-view' ) || false !== strpos( $native, '<table' ), 'Native Print content disappeared without dossier intent.' );

$multi = wu19_render_print( array( $manifest['happy']['entry_id'], $manifest['second']['entry_id'] ) );
wu19_assert( false !== strpos( $multi, 'data-gpp-print-failure="unsupported_request_cardinality"' ), 'Multi-entry dossier request did not fail closed.' );
wu19_assert( false === strpos( $multi, 'data-gpp-print-state="ready"' ), 'Multi-entry request produced canonical dossiers.' );

$visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
$activation = $visual->resolve( 'print.dossier' );
$visual->deactivate( array( 'surface' => 'print.dossier' ) );
try {
    $inactive = wu19_render_print( array( $manifest['happy']['entry_id'] ) );
    wu19_assert( false !== strpos( $inactive, 'data-gpp-print-failure="profile_not_active"' ), 'Inactive Print profile did not fail explicitly.' );
    wu19_assert( false === strpos( $inactive, 'data-gpp-print-state="ready"' ), 'Inactive profile silently produced a dossier.' );
} finally {
    if ( is_array( $activation ) ) $visual->activate( array( 'surface' => 'print.dossier', 'package_id' => $activation['package_id'], 'package_version' => $activation['package_version'], 'profile_id' => $activation['profile_id'] ) );
}

wp_set_current_user( $viewer->ID );
$denied = wu19_render_print( array( $manifest['happy']['entry_id'] ) );
wu19_assert( false === strpos( $denied, 'data-gpp-print-state=' ), 'GPP composed dossier material after native permission denial.' );
wu19_assert( false === strpos( $denied, $manifest['happy']['full_name'] ), 'Entry data leaked through a pre-permission seam.' );
wp_set_current_user( $operator->ID );

$results = array(
    'suite' => 'WU19 native Print runtime',
    'gravity_flow' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
    'gravity_forms' => GFForms::$version,
    'happy_ready' => true,
    'native_print_regression' => true,
    'permission_recheck_denial' => true,
    'unsupported_multi_entry' => true,
    'inactive_profile_failure' => true,
    'receipt_rows' => 5,
    'cheque_rows' => 6,
);
file_put_contents( trailingslashit( $artifact_dir ) . 'wu19-runtime-results.json', wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU19_RUNTIME_PASS\n";
