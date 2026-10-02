<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;

$assert = static function ( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
};

$provider_url = 'https://github.com/rezahh107/PersianGravity/releases/download/v4.8.0/persian-gravityforms-4.8.0.zip';
$provider_sha256 = 'a050a4c5eaa87b9b3e8a216d83dcf08cf8af5aa887648ba7d0e98d04ce41a3ea';
$provider_size = 511680;
$facade_blob_sha = '335dc59850dcbef8fe62dc28beae26bf0302c9b3';

require_once ABSPATH . 'wp-admin/includes/file.php';

$assert( ! defined( 'PGR_VERSION' ), 'Current-provider capability probe requires isolated provider metadata.' );
$assert( ! class_exists( 'PGR_Jalali_Presentation', false ), 'Current-provider facade unexpectedly loaded before isolated probe.' );
$assert( function_exists( 'WP_Filesystem' ) && WP_Filesystem(), 'WordPress filesystem could not initialize for current-provider capability probe.' );

$tmp = download_url( $provider_url, 60 );
$assert( ! is_wp_error( $tmp ) && is_string( $tmp ) && is_file( $tmp ), 'Could not download PersianGravity v4.8.0 release asset.' );
$assert( $provider_size === filesize( $tmp ), 'PersianGravity v4.8.0 release asset size mismatch.' );
$assert( $provider_sha256 === hash_file( 'sha256', $tmp ), 'PersianGravity v4.8.0 release asset SHA-256 mismatch.' );

$extract_root = trailingslashit( sys_get_temp_dir() ) . 'gpp-pgr-v48-' . getmypid();
wp_mkdir_p( $extract_root );

$cleanup = static function ( $path ) use ( &$cleanup ) {
    if ( ! is_dir( $path ) ) {
        return;
    }
    $items = scandir( $path );
    if ( ! is_array( $items ) ) {
        return;
    }
    foreach ( $items as $item ) {
        if ( '.' === $item || '..' === $item ) {
            continue;
        }
        $target = $path . DIRECTORY_SEPARATOR . $item;
        if ( is_dir( $target ) ) {
            $cleanup( $target );
        } elseif ( is_file( $target ) ) {
            @unlink( $target );
        }
    }
    @rmdir( $path );
};

try {
    $unzipped = unzip_file( $tmp, $extract_root );
    $assert( true === $unzipped, 'Could not extract PersianGravity v4.8.0 release asset.' );

    $provider_root = trailingslashit( $extract_root ) . 'persian-gravityforms';
    $converter = $provider_root . '/includes/class-pgr-gregorian-jalali-converter.php';
    $facade = $provider_root . '/includes/class-pgr-jalali-presentation.php';

    $assert( is_file( $converter ) && is_readable( $converter ), 'PersianGravity v4.8.0 converter source is unavailable.' );
    $assert( is_file( $facade ) && is_readable( $facade ), 'PersianGravity v4.8.0 public facade source is unavailable.' );

    $facade_source = file_get_contents( $facade );
    $assert( is_string( $facade_source ), 'PersianGravity v4.8.0 public facade source could not be read.' );
    $git_blob = sha1( 'blob ' . strlen( $facade_source ) . "\0" . $facade_source );
    $assert( $facade_blob_sha === $git_blob, 'PersianGravity v4.8.0 public facade Git blob identity changed.' );

    require_once $converter;
    require_once $facade;

    define( 'PGR_VERSION', '4.8.0' );

    $assert( class_exists( 'PGR_Jalali_Presentation', false ), 'PersianGravity v4.8.0 public facade did not load.' );
    $assert( is_callable( array( 'PGR_Jalali_Presentation', 'format_datetime' ) ), 'PersianGravity v4.8.0 format_datetime capability is not callable.' );

    $method = new ReflectionMethod( 'PGR_Jalali_Presentation', 'format_datetime' );
    $parameters = $method->getParameters();
    $return_type = $method->getReturnType();

    $assert( isset( $parameters[0] ) && $parameters[0]->hasType(), 'Current provider lost the typed source parameter.' );
    $assert( 'DateTimeInterface' === (string) $parameters[0]->getType(), 'Current provider source parameter is no longer DateTimeInterface.' );
    $assert( isset( $parameters[1] ) && $parameters[1]->isOptional() && $parameters[1]->hasType(), 'Current provider target timezone parameter contract changed.' );
    $assert( '?DateTimeZone' === (string) $parameters[1]->getType(), 'Current provider target timezone type changed.' );
    $assert( $return_type instanceof ReflectionNamedType && 'string' === $return_type->getName() && $return_type->allowsNull(), 'Current provider nullable-string result contract changed.' );

    $old_timezone = get_option( 'timezone_string', '' );
    $old_offset = get_option( 'gmt_offset', 0 );
    update_option( 'timezone_string', 'Asia/Tehran' );

    try {
        $source = new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) );
        $source_before = array( $source->getTimestamp(), $source->format( 'Y-m-d H:i:s' ), $source->getTimezone()->getName() );

        $result = PersianGravityJalaliBridge::formatDateTime( $source );
        $assert( PersianGravityJalaliBridge::STATUS_APPLIED === $result['status'], 'GPP rejected the compatible v4.8.0 public capability.' );
        $assert( '۱۴۰۵/۰۱/۰۱، ۰۰:۰۰' === $result['value'], 'GPP did not return the real v4.8.0 facade output at the UTC/site-timezone boundary.' );

        $source_after = array( $source->getTimestamp(), $source->format( 'Y-m-d H:i:s' ), $source->getTimezone()->getName() );
        $assert( $source_before === $source_after, 'Current-provider presentation mutated the authoritative source DateTime.' );

        $out_of_range = PersianGravityJalaliBridge::formatDateTime(
            new DateTimeImmutable( '1799-12-31 00:00:00', new DateTimeZone( 'UTC' ) )
        );
        $assert( null === $out_of_range['value'], 'Current provider out-of-range result must not fabricate Jalali output.' );
        $assert( PersianGravityJalaliBridge::STATUS_PROVIDER_NATIVE_FALLBACK === $out_of_range['status'], 'Current provider null result must preserve native fallback semantics.' );
    } finally {
        update_option( 'timezone_string', $old_timezone );
        update_option( 'gmt_offset', $old_offset );
    }

    $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
    if ( is_string( $artifact_dir ) && '' !== $artifact_dir ) {
        wp_mkdir_p( $artifact_dir );
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'wu18-persiangravity-v48-capability.json',
            wp_json_encode(
                array(
                    'schema_version' => '1.0.0',
                    'provider_release' => 'v4.8.0',
                    'provider_asset_sha256' => $provider_sha256,
                    'provider_asset_size' => $provider_size,
                    'public_facade_git_blob_sha1' => $facade_blob_sha,
                    'runtime_version_identity' => PGR_VERSION,
                    'facade_callable' => true,
                    'source_parameter' => (string) $parameters[0]->getType(),
                    'target_timezone_parameter' => (string) $parameters[1]->getType(),
                    'nullable_string_result' => true,
                    'gpp_capability_admitted_despite_version_mismatch' => true,
                    'raw_source_unchanged' => true,
                    'null_result_native_fallback' => true,
                ),
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            ) . "\n"
        );
    }
} finally {
    @unlink( $tmp );
    $cleanup( $extract_root );
}

echo "WU18_PERSIANGRAVITY_V48_CAPABILITY_PASS\n";
