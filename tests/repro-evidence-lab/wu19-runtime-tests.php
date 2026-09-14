<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierAssets;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu19_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) ) throw new RuntimeException( 'WU19 fixture manifest unavailable.' );
if ( ! class_exists( 'Gravity_Flow_Print_Entries' ) ) require_once gravity_flow()->get_base_path() . '/includes/pages/class-print-entries.php';

function wu19_assert( $condition, $message ) {
    if ( ! $condition ) throw new RuntimeException( $message );
}

function wu19_render_print( $entry_ids, $intent = true ) {
    $_GET['lid'] = implode( ',', array_map( 'intval', (array) $entry_ids ) );
    $_REQUEST['action'] = 'gravityflow_print_entries';
    if ( $intent ) $_GET['gpp_presentation'] = 'dossier'; else unset( $_GET['gpp_presentation'] );
    PrintDossierPresentationAdapter::resetRuntimeCache();
    ob_start();
    Gravity_Flow_Print_Entries::render();
    return ob_get_clean();
}

function wu19_xpath( $html ) {
    $dom = new DOMDocument();
    $previous = libxml_use_internal_errors( true );
    $dom->loadHTML( '<?xml encoding="utf-8" ?>' . $html );
    libxml_clear_errors();
    libxml_use_internal_errors( $previous );
    return new DOMXPath( $dom );
}

function wu19_text( DOMXPath $xpath, $query ) {
    $nodes = $xpath->query( $query );
    if ( ! $nodes || 0 === $nodes->length ) return null;
    return trim( $nodes->item( 0 )->textContent );
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) throw new RuntimeException( 'Pinned operator unavailable.' );
wp_set_current_user( $operator->ID );

$alpha = $manifest['alpha'];
$beta = $manifest['beta'];
$happy = wu19_render_print( array( $alpha['entry_id'] ) );
wu19_assert( false !== strpos( $happy, 'data-gpp-print-state="ready"' ), 'Canonical dossier did not reach ready state.' );
wu19_assert( 1 === substr_count( $happy, 'data-gpp-print-page="front"' ), 'Front page cardinality changed.' );
wu19_assert( 1 === substr_count( $happy, 'data-gpp-print-page="back"' ), 'Back page cardinality changed.' );
wu19_assert( 5 === substr_count( $happy, 'gpp-print-receipt-row' ), 'Receipt rows must remain exactly five.' );
wu19_assert( 6 === substr_count( $happy, 'gpp-print-cheque-row' ), 'Cheque rows must remain exactly six.' );
wu19_assert( false !== strpos( $happy, 'data-gpp-logo="razavi"' ) && false !== strpos( $happy, 'data-gpp-logo="kanoon"' ), 'Approved Front logos missing.' );
wu19_assert( false === strpos( $happy, 'data-gpp-logo="center"' ), 'Forbidden center logo appeared.' );
wu19_assert( false !== strpos( $happy, 'data-gpp-manual="front-stamp-signature"' ) && false !== strpos( $happy, 'data-gpp-manual="management-approval"' ), 'Manual approval regions missing.' );

$xpath = wu19_xpath( $happy );
$phone_2 = wu19_text( $xpath, '//*[@id="gpp-print-front"]//*[contains(concat(" ", normalize-space(@class), " "), " front-contact-fields ")]/*[2]//*[contains(concat(" ", normalize-space(@class), " "), " print-value ")]' );
wu19_assert( '' === $phone_2, 'UNBOUND Phone 2 must remain physically present and blank.' );
wu19_assert( $phone_2 !== $manifest['trap_values']['father_mobile'] && $phone_2 !== $manifest['trap_values']['mother_mobile'], 'Phone 2 fell back to a parent mobile.' );
$financial_date = wu19_text( $xpath, '//*[@id="gpp-print-back"]//*[contains(concat(" ", normalize-space(@class), " "), " date-field ")]//*[contains(concat(" ", normalize-space(@class), " "), " print-value ")]' );
wu19_assert( '' === $financial_date, 'UNBOUND financial date must remain blank.' );
$payment_checked = $xpath->query( '//*[@id="gpp-print-front"]//*[contains(concat(" ", normalize-space(@class), " "), " front-options ")][.//span[contains(normalize-space(.), "نحوهٔ پرداخت")]]//*[@data-gpp-checked="1"]' );
wu19_assert( $payment_checked && 0 === $payment_checked->length, 'Unproven payment mapping selected a plausible fallback.' );

$trace = PrintDossierPresentationAdapter::lastDecisionTrace();
wu19_assert( ! empty( $trace ), 'Decision trace unavailable.' );
wu19_assert( in_array( array( 'stage' => 'HOST_PRINT_CONTEXT_ADMITTED', 'outcome' => 'post_permission_seam_reached' ), $trace, true ), 'Post-permission admission trace missing.' );
wu19_assert( in_array( array( 'stage' => 'PRINT_BINDINGS_EVALUATED', 'outcome' => 'binding_not_proven' ), $trace, true ), 'Manual/unbound blank reason missing.' );
wu19_assert( in_array( array( 'stage' => 'PRINT_COMPOSITION_READY', 'outcome' => 'ready_two_pages' ), $trace, true ), 'ready_two_pages trace outcome missing.' );

$native = wu19_render_print( array( $alpha['entry_id'] ), false );
wu19_assert( false === strpos( $native, 'data-gpp-print-state=' ), 'Ordinary native Print was hijacked.' );
wu19_assert( false !== strpos( $native, '<form' ), 'Native Print content disappeared without dossier intent.' );

$multi = wu19_render_print( array( $alpha['entry_id'], $beta['entry_id'] ) );
wu19_assert( false !== strpos( $multi, 'data-gpp-print-failure="unsupported_request_cardinality"' ), 'Multi-entry dossier request did not fail closed.' );
wu19_assert( false === strpos( $multi, 'data-gpp-print-state="ready"' ), 'Multi-entry request produced canonical dossiers.' );

$visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
$activation = $visual->resolve( 'print.dossier' );
$visual->deactivate( array( 'surface' => 'print.dossier' ) );
try {
    $inactive = wu19_render_print( array( $alpha['entry_id'] ) );
    wu19_assert( false !== strpos( $inactive, 'data-gpp-print-failure="profile_not_active"' ), 'Inactive Print profile did not fail explicitly.' );
    wu19_assert( false === strpos( $inactive, 'data-gpp-print-state="ready"' ), 'Inactive profile silently produced a dossier.' );
} finally {
    if ( is_array( $activation ) ) {
        $visual->activate( array(
            'surface' => 'print.dossier',
            'package_id' => $activation['package_id'],
            'package_version' => $activation['package_version'],
            'profile_id' => $activation['profile_id'],
        ) );
    }
}

$asset_paths = PrintDossierAssets::paths();
wu19_assert( isset( $asset_paths['razavi'] ) && is_readable( $asset_paths['razavi'] ), 'Razavi asset precondition missing.' );
$missing_path = $asset_paths['razavi'] . '.wu19-missing';
wu19_assert( rename( $asset_paths['razavi'], $missing_path ), 'Unable to induce required asset failure.' );
try {
    $missing_asset = wu19_render_print( array( $alpha['entry_id'] ) );
    wu19_assert( false !== strpos( $missing_asset, 'data-gpp-print-failure="required_asset_unavailable"' ), 'Missing indispensable asset did not fail closed.' );
    wu19_assert( false === strpos( $missing_asset, 'data-gpp-print-state="ready"' ), 'Missing asset produced an approximate successful dossier.' );
} finally {
    if ( is_file( $missing_path ) ) rename( $missing_path, $asset_paths['razavi'] );
}
wu19_assert( PrintDossierAssets::isReady(), 'Approved assets were not restored after negative control.' );

$results = array(
    'suite' => 'WU19 native Print runtime',
    'gravity_flow' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
    'gravity_forms' => GFForms::$version,
    'happy_ready' => true,
    'native_print_regression' => true,
    'unsupported_multi_entry' => true,
    'inactive_profile_failure' => true,
    'required_asset_failure' => true,
    'manual_unproven_blank' => true,
    'semantic_traps' => true,
    'receipt_rows' => 5,
    'cheque_rows' => 6,
);
file_put_contents( trailingslashit( $artifact_dir ) . 'wu19-runtime-results.json', wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU19_RUNTIME_PASS\n";
