<?php

if ( PHP_SAPI !== 'cli' ) {
    fwrite( STDERR, "CLI only.\n" );
    exit( 2 );
}

$options = getopt( '', array( 'root:', 'released-version:' ) );
$root = isset( $options['root'] ) ? rtrim( $options['root'], '/\\' ) : getcwd();
$released_version = isset( $options['released-version'] ) ? (string) $options['released-version'] : '';

$fail = static function ( $message ) {
    fwrite( STDERR, 'GPP_RELEASE_CONTINUATION_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
};

if ( ! preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $released_version ) || '0.0.0' === $released_version ) {
    $fail( 'Released version must be a non-zero three-part production SemVer.' );
}

$entrypoint = $root . '/gravity-presentation-profiles.php';
$addon = $root . '/src/GravityForms/AddOn.php';
$changelog = $root . '/CHANGELOG.md';
foreach ( array( $entrypoint, $addon, $changelog ) as $path ) {
    if ( ! is_file( $path ) ) {
        $fail( 'Required source file is missing: ' . $path );
    }
}

$entrypoint_text = file_get_contents( $entrypoint );
$addon_text = file_get_contents( $addon );
$changelog_text = file_get_contents( $changelog );
if ( false === $entrypoint_text || false === $addon_text || false === $changelog_text ) {
    $fail( 'Unable to read one or more release source files.' );
}

if ( 1 !== preg_match( '/^\s*\*\s*Version:\s*' . preg_quote( $released_version, '/' ) . '\s*$/m', $entrypoint_text ) ) {
    $fail( 'Plugin header is not at the expected released version.' );
}
$addon_pattern = "/^\\s*protected\\s+\\\$_version\\s*=\\s*'" . preg_quote( $released_version, '/' ) . "';.*$/m";
if ( 1 !== preg_match( $addon_pattern, $addon_text ) ) {
    $fail( 'Gravity Forms Add-On mirror is not at the expected released version.' );
}
if ( false === strpos( $changelog_text, '## [' . $released_version . ']' ) ) {
    $fail( 'Released changelog section is missing.' );
}

$entrypoint_count = 0;
$next_entrypoint = preg_replace(
    '/(^\s*\*\s*Version:\s*)[^\r\n]+/m',
    '${1}0.0.0-dev',
    $entrypoint_text,
    1,
    $entrypoint_count
);
if ( 1 !== $entrypoint_count || null === $next_entrypoint ) {
    $fail( 'Expected exactly one plugin header version declaration.' );
}

$addon_count = 0;
$next_addon = preg_replace(
    "/(^\\s*protected\\s+\\\$_version\\s*=\\s*')[^']+('.*$)/m",
    '${1}0.0.0-dev${2}',
    $addon_text,
    1,
    $addon_count
);
if ( 1 !== $addon_count || null === $next_addon ) {
    $fail( 'Expected exactly one Gravity Forms Add-On version mirror.' );
}

if ( false === file_put_contents( $entrypoint, $next_entrypoint ) || false === file_put_contents( $addon, $next_addon ) ) {
    $fail( 'Unable to write development continuation version files.' );
}

fwrite( STDOUT, "GPP_RELEASE_DEVELOPMENT_CONTINUATION_PREPARED released={$released_version} next=0.0.0-dev\n" );
