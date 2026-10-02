<?php

final class PGR_Jalali_Presentation {
    public static $calls = 0;

    public static function format_datetime( DateTimeInterface $source, ?DateTimeZone $target_timezone = null ) {
        unset( $target_timezone );
        self::$calls++;
        return 'capability-only:' . $source->format( 'Y-m-d H:i:s' );
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;

Autoloader::register();

gpp_assert_true( ! defined( 'PGR_VERSION' ), 'Capability-only control must not provide version metadata.' );
$result = PersianGravityJalaliBridge::formatDateTime( new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) ) );

gpp_assert_same( 'capability-only:2026-03-20 20:30:00', $result['value'], 'Version metadata must not be required when the consumed public capability is compatible.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_APPLIED, $result['status'], 'Capability-only provider must be admitted.' );
gpp_assert_same( 1, PGR_Jalali_Presentation::$calls, 'Capability-only facade must be invoked exactly once.' );

echo "PERSIAN_GRAVITY_BRIDGE_CAPABILITY_ONLY_PASS\n";
