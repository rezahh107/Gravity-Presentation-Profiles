<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

Autoloader::register();

$source = new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) );
$result = PersianGravityJalaliBridge::formatDateTime( $source );
gpp_assert_same( null, $result['value'], 'Absent PersianGravity must produce no Jalali override.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_PROVIDER_UNAVAILABLE, $result['status'], 'Absent provider state must be explicit.' );

gpp_assert_same( '2026-03-20 20:30:00', PersianDateFormatter::formatDateTime( '2026-03-20 20:30:00' ), 'Absent provider must retain the authoritative raw UTC value when no host formatter is available.' );
gpp_assert_same( 'not-a-date', PersianDateFormatter::formatDateTime( 'not-a-date' ), 'Malformed source must remain native and must not be guessed.' );
gpp_assert_same( null, PersianDateFormatter::timestamp( '2026-03-20 20:30:00' ), 'Timestamp helper must not parse date strings.' );
gpp_assert_same( '۱۴۰۵/۰۱/۰۱', PersianDateFormatter::formatDateTime( '۱۴۰۵/۰۱/۰۱' ), 'Already-presented Jalali-looking text must remain untouched rather than being heuristically converted.' );

$formatter_source = file_get_contents( dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/PersianDateFormatter.php' );
$bridge_source = file_get_contents( dirname( __DIR__, 2 ) . '/src/Core/Presentation/PersianGravityJalaliBridge.php' );
gpp_assert_true( false === strpos( $formatter_source, 'strtotime(' ), 'Consumer must not use ambiguous strtotime() parsing.' );
gpp_assert_true( false === strpos( $formatter_source, 'gregorianToJalali' ), 'GPP must not retain its duplicate calendar engine.' );
gpp_assert_true( false === strpos( $formatter_source . $bridge_source, 'PGR_Gregorian_Jalali_Converter' ), 'GPP must not call PersianGravity converter internals.' );
gpp_assert_true( false === strpos( $formatter_source . $bridge_source, 'Asia/Tehran' ) && false === strpos( $formatter_source . $bridge_source, '+03:30' ), 'Consumer must not hard-code the target site timezone.' );

echo "PERSIAN_GRAVITY_BRIDGE_ABSENT_PASS\n";
