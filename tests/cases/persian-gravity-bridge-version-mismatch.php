<?php

define( 'PGR_VERSION', '4.8.0' );

final class PGR_Jalali_Presentation {
    public static $calls = array();

    public static function format_datetime( DateTimeInterface $source, ?DateTimeZone $target_timezone = null ) {
        self::$calls[] = array(
            'timestamp' => $source->getTimestamp(),
            'timezone' => $source->getTimezone()->getName(),
            'target_timezone' => null === $target_timezone ? null : $target_timezone->getName(),
        );

        return 'compatible-v48:' . $source->format( 'Y-m-d H:i:s' );
    }
}

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;

Autoloader::register();

$source = new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) );
$before = array( $source->getTimestamp(), $source->format( 'Y-m-d H:i:s' ), $source->getTimezone()->getName() );
$result = PersianGravityJalaliBridge::formatDateTime( $source );
$after = array( $source->getTimestamp(), $source->format( 'Y-m-d H:i:s' ), $source->getTimezone()->getName() );

gpp_assert_same( 'compatible-v48:2026-03-20 20:30:00', $result['value'], 'A compatible public facade must be admitted when provider version differs from the historical qualification.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_APPLIED, $result['status'], 'Compatible v4.8 facade must report applied presentation.' );
gpp_assert_same( 1, count( PGR_Jalali_Presentation::$calls ), 'Compatible v4.8 facade must be invoked exactly once.' );
gpp_assert_same( 'UTC', PGR_Jalali_Presentation::$calls[0]['timezone'], 'Bridge must pass the caller-qualified source timezone unchanged.' );
gpp_assert_same( null, PGR_Jalali_Presentation::$calls[0]['target_timezone'], 'Bridge must leave target/site timezone ownership to PersianGravity.' );
gpp_assert_same( $before, $after, 'Presentation must not mutate the authoritative source DateTime.' );

echo "PERSIAN_GRAVITY_BRIDGE_VERSION_MISMATCH_PASS\n";
