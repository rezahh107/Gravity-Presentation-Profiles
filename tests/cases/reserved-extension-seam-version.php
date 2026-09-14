<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

Autoloader::register();

function gpp_seam_fixture( $path ) {
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid visual-package fixture: ' . $path );
    }

    return $data;
}

function gpp_seam_expect_violation( $package, $message ) {
    try {
        VisualProfilePackage::validate( $package );
    } catch ( ContractViolation $exception ) {
        return;
    }

    gpp_fail( $message );
}

$v1 = gpp_seam_fixture( __DIR__ . '/../fixtures/wu09-visual-package.json' );
$v11 = gpp_seam_fixture( dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json' );

// Positive controls: both supported schemas retain the exact documented inert seam.
gpp_assert_same(
    array( 'version' => '1.0.0', 'state' => 'INERT' ),
    $v1['reserved_extension_seam'],
    'Schema 1.0 fixture must carry the exact canonical Reserved Extension Seam.'
);
gpp_assert_same(
    array( 'version' => '1.0.0', 'state' => 'INERT' ),
    $v11['reserved_extension_seam'],
    'Schema 1.1 Registration package must carry the exact canonical Reserved Extension Seam.'
);
gpp_assert_true( VisualProfilePackage::validate( $v1 ), 'Schema 1.0 exact Reserved Extension Seam must validate.' );
gpp_assert_true( VisualProfilePackage::validate( $v11 ), 'Schema 1.1 exact Reserved Extension Seam must validate.' );

// Every unsupported seam version fails independently in each supported visual-package schema.
foreach ( array( '1.0.1', '2.0.0' ) as $unsupported_version ) {
    $bad = $v1;
    $bad['reserved_extension_seam']['version'] = $unsupported_version;
    gpp_seam_expect_violation(
        $bad,
        'Schema 1.0 must reject unsupported Reserved Extension Seam version ' . $unsupported_version . '.'
    );

    $bad = $v11;
    $bad['reserved_extension_seam']['version'] = $unsupported_version;
    gpp_seam_expect_violation(
        $bad,
        'Schema 1.1 must reject unsupported Reserved Extension Seam version ' . $unsupported_version . '.'
    );
}

// Existing inertness controls remain fail closed in both schemas.
foreach ( array( $v1, $v11 ) as $package ) {
    $bad = $package;
    $bad['reserved_extension_seam']['payload'] = 'forbidden';
    gpp_seam_expect_violation( $bad, 'Reserved Extension Seam must reject additional keys.' );

    $bad = $package;
    $bad['reserved_extension_seam']['state'] = 'ACTIVE';
    gpp_seam_expect_violation( $bad, 'Reserved Extension Seam must reject any non-INERT state.' );

    $bad = $package;
    $bad['unknown_root'] = 'forbidden';
    gpp_seam_expect_violation( $bad, 'Unknown visual-package root keys must remain rejected.' );

    $bad = $package;
    $bad['schema_version'] = '9.9.9';
    gpp_seam_expect_violation( $bad, 'Unknown visual schema versions must remain rejected.' );
}

$bad = $v11;
$bad['surface_profiles'][0]['presentation']['unknown_preference'] = 'forbidden';
gpp_seam_expect_violation( $bad, 'Unknown schema 1.1 presentation keys must remain rejected.' );

echo "GPP_RESERVED_EXTENSION_SEAM_VERSION_TESTS_PASS\n";
