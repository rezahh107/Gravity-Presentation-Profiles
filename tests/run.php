<?php

$cases = array(
    'bootstrap-without-gravity-forms.php',
    'core-resolution.php',
    'gravity-forms-addon.php',
    'binding-health-addon.php',
    'declarative-preference-presence.php',
    'srwf-registration-profile.php',
    'portable-profile-substrate.php',
    'portable-profile-package-v11.php',
    'semantic-binding-selected-identity.php',
    'reserved-extension-seam-version.php',
    'package-lifecycle.php',
    'binding-health-management.php',
    'binding-health-compound-input.php',
    'binding-activation-cas.php',
    'package-lifecycle-v11.php',
    'reserved-extension-seam-lifecycle.php',
    'package-lifecycle-deactivation.php',
    'wordpress-option-state-store.php',
    'inbox-presentation-model.php',
    'entry-detail-presentation-model.php',
    'print-dossier-presentation-model.php',
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
