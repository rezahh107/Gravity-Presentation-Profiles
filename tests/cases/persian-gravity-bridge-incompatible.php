<?php

define( 'PGR_VERSION', '4.5.0' );

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
gpp_assert_same( null, $result['value'], 'Older provider version must not be consumed.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_PROVIDER_INCOMPATIBLE, $result['status'], 'Incompatible version must be observable.' );
gpp_assert_same( 0, PGR_Jalali_Presentation::$calls, 'Incompatible facade must not be invoked.' );

echo "PERSIAN_GRAVITY_BRIDGE_INCOMPATIBLE_PASS\n";
