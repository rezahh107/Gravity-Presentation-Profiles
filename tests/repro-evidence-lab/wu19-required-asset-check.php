<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$manifest = get_option( 'gpp_wu19_fixture_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['alpha']['entry_id'] ) ) throw new RuntimeException( 'WU19 fixture unavailable.' );
if ( ! class_exists( 'Gravity_Flow_Print_Entries' ) ) require_once gravity_flow()->get_base_path() . '/includes/pages/class-print-entries.php';

$asset = WP_PLUGIN_DIR . '/gravity-presentation-profiles/assets/images/print/kanoon-approved.png';
$backup = $asset . '.wu19-missing';
if ( ! is_file( $asset ) ) throw new RuntimeException( 'Required Kanoon test asset missing before negative control.' );
if ( file_exists( $backup ) ) unlink( $backup );
if ( ! rename( $asset, $backup ) ) throw new RuntimeException( 'Could not stage required-asset negative control.' );

try {
    wp_set_current_user( get_user_by( 'login', 'bootstrap_admin' )->ID );
    $_GET['lid'] = (string) (int) $manifest['alpha']['entry_id'];
    $_GET['gpp_presentation'] = 'dossier';
    $_REQUEST['action'] = 'gravityflow_print_entries';
    PrintDossierPresentationAdapter::resetRuntimeCache();
    ob_start(); Gravity_Flow_Print_Entries::render(); $html = ob_get_clean();
    if ( false === strpos( $html, 'data-gpp-print-failure="required_asset_unavailable"' ) ) throw new RuntimeException( 'Missing required asset did not fail closed explicitly.' );
    if ( false !== strpos( $html, 'data-gpp-print-state="ready"' ) ) throw new RuntimeException( 'Missing required asset produced an approximate successful dossier.' );
} finally {
    if ( is_file( $backup ) && ! rename( $backup, $asset ) ) throw new RuntimeException( 'Could not restore required Print asset after negative control.' );
}

echo "WU19_REQUIRED_ASSET_FAILURE_PASS\n";
