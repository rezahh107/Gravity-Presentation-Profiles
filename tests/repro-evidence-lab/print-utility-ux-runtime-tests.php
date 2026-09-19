<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

function gpp_print_utility_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu19_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || empty( $manifest['alpha']['entry_id'] ) || empty( $manifest['alpha']['form_id'] ) ) {
    throw new RuntimeException( 'WU19 Print utility fixture manifest unavailable.' );
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) {
    throw new RuntimeException( 'Pinned operator unavailable.' );
}
wp_set_current_user( $operator->ID );

$alpha = $manifest['alpha'];
$entry = GFAPI::get_entry( $alpha['entry_id'] );
$form = GFAPI::get_form( $alpha['form_id'] );
if ( is_wp_error( $entry ) || ! is_array( $form ) ) {
    throw new RuntimeException( 'Synthetic Print utility entry/form unavailable.' );
}

PrintDossierPresentationAdapter::resetRuntimeCache();
ob_start();
PrintDossierPresentationAdapter::renderPrintUtility( $form, $entry );
$html = ob_get_clean();

gpp_print_utility_assert( false !== strpos( $html, '<button' ), 'Print utility must render a semantic button.' );
gpp_print_utility_assert( false === strpos( $html, '<a ' ), 'Print utility must not render the historical javascript anchor.' );
gpp_print_utility_assert( false !== strpos( $html, 'type="button"' ), 'Print utility button type must be button.' );
gpp_print_utility_assert( false !== strpos( $html, 'data-gpp-dossier-print-button' ), 'Print utility enhancement marker missing.' );
gpp_print_utility_assert( false !== strpos( $html, 'aria-busy="false"' ), 'Idle busy state must be explicit.' );
gpp_print_utility_assert( false !== strpos( $html, 'aria-label="چاپ پرونده"' ), 'Idle accessible name must be stable.' );
gpp_print_utility_assert( false !== strpos( $html, 'role="status"' ) && false !== strpos( $html, 'aria-live="polite"' ), 'Busy live status contract missing.' );
gpp_print_utility_assert( false !== strpos( $html, '>چاپ پرونده</span>' ), 'Idle user-facing label mismatch.' );
gpp_print_utility_assert( false === strpos( $html, 'دو صفحهٔ A4' ), 'Primary button label must not include the A4-page count.' );
gpp_print_utility_assert( false !== strpos( $html, 'typeof printPage' ) && false !== strpos( $html, 'window.open' ), 'Progressive native/fallback dispatch is missing.' );

$dom = new DOMDocument();
$previous = libxml_use_internal_errors( true );
$dom->loadHTML( '<?xml encoding="utf-8" ?>' . $html );
libxml_clear_errors();
libxml_use_internal_errors( $previous );
$xpath = new DOMXPath( $dom );
$buttons = $xpath->query( '//*[@data-gpp-dossier-print-button]' );
gpp_print_utility_assert( $buttons && 1 === $buttons->length, 'Expected exactly one dossier Print button.' );
$url = $buttons->item( 0 )->getAttribute( 'data-gpp-dossier-print-url' );
gpp_print_utility_assert( false !== strpos( $url, 'admin-ajax.php' ), 'Print utility must keep the native admin-ajax endpoint.' );
gpp_print_utility_assert( false !== strpos( $url, 'action=gravityflow_print_entries' ), 'Print utility native Gravity Flow action changed.' );
gpp_print_utility_assert( false !== strpos( $url, 'lid=' . (int) $alpha['entry_id'] ), 'Print utility entry identity changed.' );
gpp_print_utility_assert( false !== strpos( $url, 'gpp_presentation=dossier' ), 'Print utility dossier presentation intent missing.' );

if ( function_exists( 'wp_dequeue_style' ) ) wp_dequeue_style( PrintDossierPresentationAdapter::UTILITY_STYLE_HANDLE );
if ( function_exists( 'wp_dequeue_script' ) ) wp_dequeue_script( PrintDossierPresentationAdapter::UTILITY_SCRIPT_HANDLE );
$_GET = array();
PrintDossierPresentationAdapter::enqueueUtilityAssets();
gpp_print_utility_assert( ! wp_style_is( PrintDossierPresentationAdapter::UTILITY_STYLE_HANDLE, 'enqueued' ), 'Print utility CSS leaked to unrelated route.' );
gpp_print_utility_assert( ! wp_script_is( PrintDossierPresentationAdapter::UTILITY_SCRIPT_HANDLE, 'enqueued' ), 'Print utility JS leaked to unrelated route.' );

$_GET = array(
    'view' => 'entry',
    'lid' => (string) $alpha['entry_id'],
);
PrintDossierPresentationAdapter::enqueueUtilityAssets();
gpp_print_utility_assert( wp_style_is( PrintDossierPresentationAdapter::UTILITY_STYLE_HANDLE, 'enqueued' ), 'Entry Detail did not enqueue dedicated Print utility CSS.' );
gpp_print_utility_assert( wp_script_is( PrintDossierPresentationAdapter::UTILITY_SCRIPT_HANDLE, 'enqueued' ), 'Entry Detail did not enqueue dedicated Print utility JS.' );

$styles = wp_styles();
$scripts = wp_scripts();
$style = isset( $styles->registered[ PrintDossierPresentationAdapter::UTILITY_STYLE_HANDLE ] ) ? $styles->registered[ PrintDossierPresentationAdapter::UTILITY_STYLE_HANDLE ] : null;
$script = isset( $scripts->registered[ PrintDossierPresentationAdapter::UTILITY_SCRIPT_HANDLE ] ) ? $scripts->registered[ PrintDossierPresentationAdapter::UTILITY_SCRIPT_HANDLE ] : null;
gpp_print_utility_assert( $style && false !== strpos( $style->src, 'assets/css/srwf-gravity-flow-print-utility.css' ), 'Dedicated Print utility stylesheet path mismatch.' );
gpp_print_utility_assert( $script && false !== strpos( $script->src, 'assets/js/srwf-gravity-flow-print-utility.js' ), 'Dedicated Print utility script path mismatch.' );
gpp_print_utility_assert( ! empty( $style->ver ) && ! empty( $script->ver ), 'Print utility assets must use repository cache-busting versions.' );

// The optional Full Width variant is presentation-only. It must reuse the
// existing PR44/PR47 Print ownership boundary rather than creating another
// native-Print suppression rule or a parallel Print affordance.
$plugin_root = defined( 'GPP_PLUGIN_FILE' ) ? dirname( GPP_PLUGIN_FILE ) : '';
$entry_css_path = $plugin_root . '/assets/css/srwf-gravity-flow-entry-detail.css';
$full_width_css_path = $plugin_root . '/assets/css/srwf-gravity-flow-entry-detail-full-width.css';
$entry_css = is_readable( $entry_css_path ) ? file_get_contents( $entry_css_path ) : false;
$full_width_css = is_readable( $full_width_css_path ) ? file_get_contents( $full_width_css_path ) : false;
gpp_print_utility_assert( is_string( $entry_css ) && is_string( $full_width_css ), 'Entry Detail Print-boundary stylesheets must be readable.' );
gpp_print_utility_assert(
    false !== strpos( $entry_css, '.detail-view-print' )
        && false !== strpos( $entry_css, '.gpp-entry-print-utility[data-gpp-print-utility="dossier"]' ),
    'Existing dual-marker native Print suppression contract changed.'
);
gpp_print_utility_assert(
    false === strpos( $full_width_css, '.detail-view-print' ),
    'Full Width must not create a second native Print suppression architecture.'
);
gpp_print_utility_assert(
    false === strpos( $full_width_css, 'printPage(' ) && false === strpos( $full_width_css, 'gravityflow_print_entries' ),
    'Full Width CSS must not own Print dispatch behavior.'
);

$results = array(
    'suite' => 'GPP Print utility UX runtime',
    'semantic_button' => true,
    'native_print_action_preserved' => true,
    'dossier_intent_preserved' => true,
    'progressive_fallback_present' => true,
    'idle_aria_busy' => false,
    'dedicated_assets_scoped' => true,
    'full_width_reuses_existing_print_boundary' => true,
    'style_handle' => PrintDossierPresentationAdapter::UTILITY_STYLE_HANDLE,
    'script_handle' => PrintDossierPresentationAdapter::UTILITY_SCRIPT_HANDLE,
);
file_put_contents(
    trailingslashit( $artifact_dir ) . 'print-utility-ux-runtime-results.json',
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "PRINT_UTILITY_UX_RUNTIME_PASS\n";
