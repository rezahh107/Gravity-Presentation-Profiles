<?php

define( 'PGR_VERSION', '4.6.0' );

final class PGR_Jalali_Presentation {
    public static $calls = array();
    public static $mode = 'value';

    public static function format_datetime( DateTimeInterface $source, ?DateTimeZone $target_timezone = null ) {
        self::$calls[] = array(
            'timestamp' => $source->getTimestamp(),
            'timezone' => $source->getTimezone()->getName(),
            'target_timezone' => null === $target_timezone ? null : $target_timezone->getName(),
        );

        if ( 'throw' === self::$mode ) {
            throw new RuntimeException( 'synthetic provider failure' );
        }
        if ( 'null' === self::$mode || (int) $source->format( 'Y' ) < 1800 || $source > new DateTimeImmutable( '2124-03-19 23:59:59', new DateTimeZone( 'UTC' ) ) ) {
            return null;
        }

        return 'provider:' . $source->format( 'Y-m-d H:i:s' );
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

Autoloader::register();

$raw = '2026-03-20 20:30:00';
$display = PersianDateFormatter::formatDateTime( $raw );
gpp_assert_same( 'provider:2026-03-20 20:30:00', $display, 'Supported qualified UTC source must use the public provider output exactly.' );
gpp_assert_same( 'UTC', PGR_Jalali_Presentation::$calls[0]['timezone'], 'String source must be constructed with explicit UTC semantics.' );
gpp_assert_same( null, PGR_Jalali_Presentation::$calls[0]['target_timezone'], 'GPP must omit the target timezone so PersianGravity applies the WordPress site timezone contract.' );

$repeat = PersianDateFormatter::formatDateTime( $raw );
gpp_assert_same( $display, $repeat, 'Repeated presentation must be deterministic.' );

PGR_Jalali_Presentation::$mode = 'null';
gpp_assert_same( $raw, PersianDateFormatter::formatDateTime( $raw ), 'Provider null must preserve native source presentation.' );

PGR_Jalali_Presentation::$mode = 'value';
gpp_assert_same( '1799-12-31 00:00:00', PersianDateFormatter::formatDateTime( '1799-12-31 00:00:00' ), 'Out-of-range provider fallback must preserve native presentation.' );
$before_jalali_calls = count( PGR_Jalali_Presentation::$calls );
gpp_assert_same( '۱۴۰۵/۰۱/۰۱', PersianDateFormatter::formatDateTime( '۱۴۰۵/۰۱/۰۱' ), 'Already-presented Jalali text must remain native.' );
gpp_assert_same( $before_jalali_calls, count( PGR_Jalali_Presentation::$calls ), 'Already-Jalali-looking text must never reach the Gregorian provider facade.' );

PGR_Jalali_Presentation::$mode = 'throw';
gpp_assert_same( $raw, PersianDateFormatter::formatDateTime( $raw ), 'Provider exception must preserve native output without escaping the optional boundary.' );

PGR_Jalali_Presentation::$mode = 'value';
$timestamp = 1774038600;
$instant_display = PersianDateFormatter::formatDateTime( $timestamp );
gpp_assert_true( 0 === strpos( $instant_display, 'provider:' ), 'Qualified Unix instant must use the provider facade.' );
$last_call = PGR_Jalali_Presentation::$calls[ count( PGR_Jalali_Presentation::$calls ) - 1 ];
gpp_assert_same( $timestamp, $last_call['timestamp'], 'Unix instant must preserve the authoritative epoch value.' );

$bridge = PersianGravityJalaliBridge::formatDateTime( new DateTimeImmutable( $raw, new DateTimeZone( 'UTC' ) ) );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_APPLIED, $bridge['status'], 'Successful provider application must be explicit.' );

echo "PERSIAN_GRAVITY_BRIDGE_PROVIDER_PASS\n";
