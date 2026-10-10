<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

\GravityPresentationProfiles\Autoloader::register();

$GLOBALS['gpp_help_test_locale'] = 'en_US';
function determine_locale() { return $GLOBALS['gpp_help_test_locale']; }
function esc_html__( $string, $domain ) { return $string; }

function gpp_help_render( $locale ) {
    $GLOBALS['gpp_help_test_locale'] = $locale;
    ob_start();
    \GravityPresentationProfiles\GravityForms\InPluginHelp::render();
    return ob_get_clean();
}

$en = gpp_help_render( 'en_US' );
$fa = gpp_help_render( 'fa_IR' );
gpp_assert_true( strpos( $en, 'data-gpp-help-locale="en_US"' ) !== false, 'English help must select bundled English content.' );
gpp_assert_true( strpos( $fa, 'data-gpp-help-locale="fa_IR"' ) !== false, 'Persian help must select bundled Persian content.' );
gpp_assert_true( strpos( $en, 'dir="ltr"' ) !== false && strpos( $fa, 'dir="rtl"' ) !== false, 'Language direction must follow the chosen locale.' );

preg_match_all( '/<summary id="(gpp-help-[a-z-]+)">/', $en, $a );
preg_match_all( '/<summary id="(gpp-help-[a-z-]+)">/', $fa, $b );
gpp_assert_same( $a[1], $b[1], 'Both guides must expose exactly the same topic identifiers.' );
gpp_assert_same( 17, count( $a[1] ), 'Every inventoried help topic must be shipped.' );
foreach ( $a[1] as $id ) {
    gpp_assert_true( strpos( $en, 'href="#' . $id . '"' ) !== false && strpos( $fa, 'href="#' . $id . '"' ) !== false, 'Topic navigation must use real local anchors.' );
}
gpp_assert_true( strpos( $en, '<code dir="ltr">' ) !== false && strpos( $fa, '<code dir="ltr">' ) !== false, 'Mixed-direction technical identifiers must preserve LTR direction.' );
gpp_assert_true( strpos( $fa, 'بستر نگاشت' ) !== false && strpos( $en, 'binding' ) !== false, 'Both language documents must explain operational bindings.' );
gpp_assert_same( $en, gpp_help_render( 'de_DE' ), 'Unshipped locale must use truthful English fallback.' );

$root = dirname( __DIR__, 2 );
$catalog = $root . '/languages/gravity-presentation-profiles-fa_IR.mo';
gpp_assert_true( is_readable( $catalog ), 'Compiled Persian MO must be present in repository sources.' );
$raw = file_get_contents( $catalog );
$header = unpack( 'Vmagic/Vrevision/Vcount/Vorig/Vtrans/Vhash_size/Vhash_off', substr( $raw, 0, 28 ) );
gpp_assert_same( 0x950412de, $header['magic'], 'MO binary must be a valid little-endian gettext file.' );
gpp_assert_true( $header['count'] >= 180, 'Admin gettext catalog should cover actual shipped UI, not only a couple of labels.' );
$entries = array();
for ( $i = 0; $i < $header['count']; $i++ ) {
    $id_row = unpack( 'Vlength/Voffset', substr( $raw, $header['orig'] + $i * 8, 8 ) );
    $val_row = unpack( 'Vlength/Voffset', substr( $raw, $header['trans'] + $i * 8, 8 ) );
    $key = substr( $raw, $id_row['offset'], $id_row['length'] );
    $value = substr( $raw, $val_row['offset'], $val_row['length'] );
    $entries[ $key ] = $value;
}
foreach ( array( 'Declarative Profile Packages', 'Profile Package JSON', 'Product Guide', 'In-plugin help', 'Save Entry Detail mappings', 'Current / Safe — stable design' ) as $key ) {
    gpp_assert_true( isset( $entries[ $key ] ) && preg_match( '/[\x{0600}-\x{06FF}]/u', $entries[ $key ] ), 'MO must contain real Persian translation for ' . $key );
}
gpp_assert_true( strpos( $entries[''], 'charset=UTF-8' ) !== false, 'MO must declare UTF-8.' );

echo "IN_PLUGIN_HELP_LOCALIZATION_PASS\n";
