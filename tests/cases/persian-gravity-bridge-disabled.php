<?php

define( 'PGR_VERSION', '4.6.0' );

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

Autoloader::register();

$source = new DateTimeImmutable( '2026-03-20 20:30:00', new DateTimeZone( 'UTC' ) );
$result = PersianGravityJalaliBridge::formatDateTime( $source );
gpp_assert_same( null, $result['value'], 'A disabled presentation module exposes no Jalali override.' );
gpp_assert_same( PersianGravityJalaliBridge::STATUS_CAPABILITY_UNAVAILABLE, $result['status'], 'Loaded provider with unavailable facade must fail closed.' );
gpp_assert_same( '2026-03-20 20:30:00', PersianDateFormatter::formatDateTime( '2026-03-20 20:30:00' ), 'Disabled provider capability must preserve native date text.' );

echo "PERSIAN_GRAVITY_BRIDGE_DISABLED_PASS\n";
