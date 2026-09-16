<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

function wp_unslash( $value ) {
    return $value;
}

function sanitize_key( $value ) {
    $value = strtolower( (string) $value );
    return preg_replace( '/[^a-z0-9_\-]/', '', $value );
}

$GLOBALS['gpp_pr2_registered_styles'] = array();

function wp_style_is( $handle, $status = 'enqueued' ) {
    unset( $status );
    return ! empty( $GLOBALS['gpp_pr2_registered_styles'][ $handle ] );
}

final class VazirFont_Loader {
    private static $instance = null;
    public $enqueue_calls = 0;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function enqueue_frontend_fonts() {
        $this->enqueue_calls++;
        $GLOBALS['gpp_pr2_registered_styles']['vazir-font-frontend'] = true;
    }
}

Autoloader::register();

$_GET = array( PrintDossierPresentationAdapter::INTENT_KEY => PrintDossierPresentationAdapter::INTENT_VALUE );
$_REQUEST = array( 'action' => 'gravityflow_print_entries' );

$loader = VazirFont_Loader::get_instance();
$styles = PrintDossierPresentationAdapter::includeVazirPrintStyle( array( 'gravityflow-print' ), array( 1 ) );
gpp_assert_same( 1, $loader->enqueue_calls, 'Dossier Print must delegate font delivery to the existing Vazir loader exactly when the host Print stylesheet seam is evaluated.' );
gpp_assert_true( in_array( 'gravityflow-print', $styles, true ), 'Existing Gravity Flow Print styles must be preserved.' );
gpp_assert_true( in_array( PrintDossierPresentationAdapter::VAZIR_STYLE_HANDLE, $styles, true ), 'Registered Vazir-owned delivery handle must be admitted to the Print stylesheet list.' );

$styles = PrintDossierPresentationAdapter::includeVazirPrintStyle( $styles, array( 1 ) );
gpp_assert_same( 1, count( array_keys( $styles, PrintDossierPresentationAdapter::VAZIR_STYLE_HANDLE, true ) ), 'Repeated host filter evaluation must not duplicate the Vazir delivery handle.' );

$_GET = array();
$_REQUEST = array( 'action' => 'gravityflow_print_entries' );
$before_non_dossier = $loader->enqueue_calls;
$native_styles = PrintDossierPresentationAdapter::includeVazirPrintStyle( array( 'gravityflow-print' ), array( 1 ) );
gpp_assert_same( array( 'gravityflow-print' ), $native_styles, 'Ordinary native Gravity Flow Print must not be changed without explicit GPP dossier intent.' );
gpp_assert_same( $before_non_dossier, $loader->enqueue_calls, 'Ordinary native Print must not trigger the Vazir bridge.' );

$css_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-print-dossier.css';
$css = file_get_contents( $css_path );
gpp_assert_true( is_string( $css ) && '' !== $css, 'Canonical dossier stylesheet must be readable.' );
gpp_assert_true( 1 === preg_match( "/--font:\\s*'Vazir'\\s*,\\s*Tahoma\\s*,\\s*Arial\\s*,\\s*sans-serif\\s*;/", $css ), 'Vazir must be the admitted primary Print family with safe local fallbacks.' );
gpp_assert_true( 0 === preg_match( '/--font:\\s*Tahoma\\b/', $css ), 'Tahoma must no longer be the primary dossier font family.' );
gpp_assert_true( false === stripos( $css, '@font-face' ), 'GPP Print CSS must not create a duplicate font-delivery subsystem.' );
gpp_assert_true( 0 === preg_match( '/https?:\\/\\//i', $css ), 'GPP Print CSS must not introduce an external-network font dependency.' );
gpp_assert_true( 0 === preg_match( '/\\.(?:woff2?|ttf|otf)(?:[?#\"\'\s]|$)/i', $css ), 'GPP Print CSS must not reference font binaries directly.' );

$production_roots = array(
    dirname( __DIR__, 2 ) . '/assets',
    dirname( __DIR__, 2 ) . '/src',
);
$bundled_fonts = array();
foreach ( $production_roots as $root ) {
    $iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ) );
    foreach ( $iterator as $file ) {
        if ( ! $file->isFile() ) {
            continue;
        }
        if ( preg_match( '/\\.(?:woff2?|ttf|otf)$/i', $file->getFilename() ) ) {
            $bundled_fonts[] = $file->getPathname();
        }
    }
}
gpp_assert_same( array(), $bundled_fonts, 'Production GPP source/assets must not bundle font binaries.' );

echo "PR2_PRINT_FONT_CONTRACT_PASS\n";
