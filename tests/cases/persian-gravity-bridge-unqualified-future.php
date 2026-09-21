<?php

define( 'PGR_VERSION', '4.7.0' );

final class PGR_Jalali_Presentation {
    public static $calls = 0;

    public static function format_datetime( DateTimeInterface $source, ?DateTimeZone $target_timezone = null ) {
        self::$calls++;
        return 'must-not-be-used';
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;

Autoloader::register();

$result = PersianGravityJalaliBridge::formatDateTime( new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) ) );
gpp_assert_same( null, $result['value'], 'Unqualified future provider version must not be consumed.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_PROVIDER_INCOMPATIBLE, $result['status'], 'Unqualified future provider version must fail closed observably.' );
gpp_assert_same( 0, PGR_Jalali_Presentation::$calls, 'Unqualified future facade must not be invoked.' );

echo "PERSIAN_GRAVITY_BRIDGE_UNQUALIFIED_FUTURE_PASS\n";
