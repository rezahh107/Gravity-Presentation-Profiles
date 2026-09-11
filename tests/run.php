<?php

$cases = array(
    'bootstrap-without-gravity-forms.php',
    'core-resolution.php',
    'gravity-forms-addon.php',
    'srwf-registration-profile.php',
    'portable-profile-substrate.php',
    'package-lifecycle.php',
    'package-lifecycle-deactivation.php',
    'wordpress-option-state-store.php',
);

foreach ( $cases as $case ) {
    $path    = __DIR__ . '/cases/' . $case;
    $command = escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( $path );

    passthru( $command, $exit_code );

    if ( 0 !== $exit_code ) {
        fwrite( STDERR, 'GPP_CORE_TESTS_FAIL: ' . $case . PHP_EOL );
        exit( $exit_code );
    }
}

echo "GPP_CORE_TESTS_PASS\n";
