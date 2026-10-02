<?php

define( 'PGR_VERSION', '4.8.0' );

final class PGR_Jalali_Presentation {
    public static $calls = 0;

    public static function unrelated_method() {
        self::$calls++;
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

Autoloader::register();

$source = new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) );
$result = PersianGravityJalaliBridge::formatDateTime( $source );

gpp_assert_same( null, $result['value'], 'Missing required format_datetime capability must produce no override.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_CAPABILITY_UNAVAILABLE, $result['status'], 'Missing required callable must fail closed at the capability boundary.' );
gpp_assert_same( 0, PGR_Jalali_Presentation::$calls, 'An unrelated provider method must never be invoked.' );
gpp_assert_same( '2026-03-20 20:30:00', PersianDateFormatter::formatDateTime( '2026-03-20 20:30:00' ), 'Missing callable must preserve native date presentation.' );

echo "PERSIAN_GRAVITY_BRIDGE_NONCALLABLE_PASS\n";
