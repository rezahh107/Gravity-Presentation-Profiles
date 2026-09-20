<?php

use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

$provider_url = 'https://github.com/rezahh107/PersianGravity/releases/download/v4.6.0/persian-gravityforms-4.6.0.zip';
$provider_sha256 = 'f54622809df6c99435fa9d80001efb26b0e8434ef6765001d8b9dbe1366d14d9';
$provider_size = 492173;
$provider_source_sha = 'd134c9ac81b177a32a3138f074fca3d1c1ebfae4';

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$tmp = download_url( $provider_url, 60 );
wu18_assert( ! is_wp_error( $tmp ) && is_string( $tmp ) && is_file( $tmp ), 'Could not download exact PersianGravity v4.6.0 release asset.' );
wu18_assert( $provider_size === filesize( $tmp ), 'PersianGravity v4.6.0 release asset size mismatch.' );
wu18_assert( $provider_sha256 === hash_file( 'sha256', $tmp ), 'PersianGravity v4.6.0 release asset SHA-256 mismatch.' );

$unzipped = unzip_file( $tmp, WP_PLUGIN_DIR );
@unlink( $tmp );
wu18_assert( true === $unzipped, 'Could not extract exact PersianGravity v4.6.0 release asset.' );

$provider_plugin = 'persian-gravityforms/persian-gravityforms.php';
wu18_assert( is_file( WP_PLUGIN_DIR . '/' . $provider_plugin ), 'Expected PersianGravity release plugin root was not extracted.' );
$activation = activate_plugin( $provider_plugin );
wu18_assert( ! is_wp_error( $activation ), 'Exact PersianGravity v4.6.0 package could not be activated.' );
wu18_assert( defined( 'PGR_VERSION' ) && '4.6.0' === PGR_VERSION, 'Activated PersianGravity package did not expose exact version 4.6.0.' );

$raw = '2026-03-20 20:30:00';
$native = GFCommon::format_date( $raw, false );
wu18_assert( is_string( $native ) && '' !== $native, 'Native Gravity Forms date presentation is unavailable.' );
wu18_assert( ! class_exists( 'PGR_Jalali_Presentation', false ), 'Jalali presentation facade loaded while the released module default is disabled.' );
wu18_assert( $native === PersianDateFormatter::formatDateTime( $raw ), 'Disabled exact provider module did not preserve native Gravity Forms presentation.' );

wu18_assert( function_exists( 'pgr_initialize_admin' ) && function_exists( 'pgr_initialize' ), 'Exact provider bootstrap functions are unavailable.' );
pgr_initialize_admin();
wu18_assert( class_exists( 'PGR_Module_Registry', false ), 'Exact provider module registry did not initialize.' );
wu18_assert( ! PGR_Module_Registry::is_enabled( 'jalali_presentation' ), 'Released jalali_presentation module default is not disabled.' );
wu18_assert( PGR_Module_Registry::set_enabled( 'jalali_presentation', true ), 'Could not enable exact provider jalali_presentation module in disposable lab.' );
pgr_initialize();
wu18_assert( PGR_Module_Registry::is_enabled( 'jalali_presentation' ), 'Exact provider jalali_presentation module did not remain enabled.' );
wu18_assert( class_exists( 'PGR_Jalali_Presentation', false ) && is_callable( array( 'PGR_Jalali_Presentation', 'format_datetime' ) ), 'Exact provider public Jalali facade did not load.' );

$old_timezone = get_option( 'timezone_string', '' );
$old_offset = get_option( 'gmt_offset', 0 );
update_option( 'timezone_string', 'Asia/Tehran' );
$source = new DateTimeImmutable( $raw, new DateTimeZone( 'UTC' ) );
$provider_value = PGR_Jalali_Presentation::format_datetime( $source );
$gpp_value = PersianDateFormatter::formatDateTime( $raw );
wu18_assert( '۱۴۰۵/۰۱/۰۱، ۰۰:۰۰' === $provider_value, 'Exact provider did not produce its qualified UTC-to-site-timezone boundary value.' );
wu18_assert( $provider_value === $gpp_value, 'GPP did not return the exact public provider output.' );
wu18_assert( $gpp_value === PersianDateFormatter::formatDateTime( $raw ), 'Exact provider-backed GPP rendering is not deterministic.' );
wu18_assert( $raw === '2026-03-20 20:30:00', 'Presentation mutated the authoritative source value.' );

$out_of_range = '1799-12-31 00:00:00';
$out_native = GFCommon::format_date( $out_of_range, false );
wu18_assert( null === PGR_Jalali_Presentation::format_datetime( new DateTimeImmutable( $out_of_range, new DateTimeZone( 'UTC' ) ) ), 'Exact provider did not return null outside its validated range.' );
wu18_assert( $out_native === PersianDateFormatter::formatDateTime( $out_of_range ), 'Provider null did not preserve native Gravity Forms presentation.' );

update_option( 'timezone_string', $old_timezone );
update_option( 'gmt_offset', $old_offset );

$bridge_result = PersianGravityJalaliBridge::formatDateTime( $source );
wu18_assert( PersianGravityJalaliBridge::STATUS_APPLIED === $bridge_result['status'], 'Exact provider application was not observable at the GPP bridge.' );

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = json_decode( file_get_contents( $results_path ), true );
wu18_assert( is_array( $results ), 'WU18 runtime evidence is unavailable for PersianGravity evidence append.' );
$results['persian_gravity_jalali_consumer'] = array(
    'provider_release' => 'v4.6.0',
    'provider_source_sha' => $provider_source_sha,
    'provider_asset_sha256' => $provider_sha256,
    'provider_asset_size' => $provider_size,
    'provider_version_runtime' => PGR_VERSION,
    'module_default_disabled_native_fallback' => true,
    'public_facade_callable_after_enable' => true,
    'utc_source_timezone' => $source->getTimezone()->getName(),
    'timezone_boundary_provider_value' => $provider_value,
    'gpp_matches_provider_exactly' => true,
    'provider_null_native_fallback' => true,
    'repeated_render_deterministic' => true,
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_PERSIANGRAVITY_RUNTIME_PASS\n";
