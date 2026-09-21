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

$executable_php_source = static function ( $source_text ) {
    $executable = '';
    foreach ( token_get_all( $source_text ) as $token ) {
        if ( is_array( $token ) && ( T_COMMENT === $token[0] || T_DOC_COMMENT === $token[0] ) ) {
            continue;
        }
        $executable .= is_array( $token ) ? $token[1] : $token;
    }
    return $executable;
};

$formatter_source = file_get_contents( dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/PersianDateFormatter.php' );
$bridge_source = file_get_contents( dirname( __DIR__, 2 ) . '/src/Core/Presentation/PersianGravityJalaliBridge.php' );
$formatter_executable = $executable_php_source( $formatter_source );
$consumer_executable = $formatter_executable . $executable_php_source( $bridge_source );

gpp_assert_true( false === strpos( $formatter_executable, 'strtotime(' ), 'Consumer must not use ambiguous strtotime() parsing.' );
gpp_assert_true( false === strpos( $formatter_executable, 'gregorianToJalali' ), 'GPP must not retain its duplicate calendar engine.' );
gpp_assert_true( false === strpos( $consumer_executable, 'PGR_Gregorian_Jalali_Converter' ), 'GPP must not call PersianGravity converter internals.' );
gpp_assert_true( false === strpos( $consumer_executable, 'Asia/Tehran' ) && false === strpos( $consumer_executable, '+03:30' ), 'Consumer must not hard-code the target site timezone.' );

echo "PERSIAN_GRAVITY_BRIDGE_ABSENT_PASS\n";
