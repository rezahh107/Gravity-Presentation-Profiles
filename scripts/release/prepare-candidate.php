<?php

if ( PHP_SAPI !== 'cli' ) {
    fwrite( STDERR, "CLI only.\n" );
    exit( 2 );
}

$options = getopt( '', array( 'root:', 'version:', 'date:' ) );
$root    = isset( $options['root'] ) ? rtrim( $options['root'], '/\\' ) : getcwd();
$version = isset( $options['version'] ) ? (string) $options['version'] : '';
$date    = isset( $options['date'] ) ? (string) $options['date'] : gmdate( 'Y-m-d' );

$fail = static function ( $message ) {
    fwrite( STDERR, 'GPP_RELEASE_PREPARE_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
};

if ( ! preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $version ) || '0.0.0' === $version ) {
    $fail( 'Release version must be a non-zero three-part production SemVer.' );
}
if ( 1 !== preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
    $fail( 'Release date must use YYYY-MM-DD.' );
}

$entrypoint = $root . '/gravity-presentation-profiles.php';
$addon      = $root . '/src/GravityForms/AddOn.php';
$changelog  = $root . '/CHANGELOG.md';
foreach ( array( $entrypoint, $addon, $changelog ) as $path ) {
    if ( ! is_file( $path ) ) {
        $fail( 'Required source file is missing: ' . $path );
    }
}

$replaceOne = static function ( $path, $pattern, $replacement, $label ) use ( $fail ) {
    $contents = file_get_contents( $path );
    if ( false === $contents ) {
        $fail( 'Cannot read ' . $label . '.' );
    }
    $count = 0;
    $next = preg_replace( $pattern, $replacement, $contents, 1, $count );
    if ( 1 !== $count || null === $next ) {
        $fail( 'Expected exactly one ' . $label . ' declaration.' );
    }
    if ( false === file_put_contents( $path, $next ) ) {
        $fail( 'Cannot write ' . $label . '.' );
    }
};

$replaceOne(
    $entrypoint,
    '/(^\s*\*\s*Version:\s*)[^\r\n]+/m',
    '${1}' . $version,
    'plugin header version'
);
$addon_pattern = <<<'REGEX'
/(^\s*protected\s+\$_version\s*=\s*')[^']+('.*$)/m
REGEX;
$replaceOne(
    $addon,
    $addon_pattern,
    '${1}' . $version . '${2}',
    'Gravity Forms Add-On version mirror'
);

$text = file_get_contents( $changelog );
if ( false === $text ) {
    $fail( 'Cannot read CHANGELOG.md.' );
}
if ( false !== strpos( $text, '## [' . $version . ']' ) ) {
    $fail( 'CHANGELOG.md already contains this release version.' );
}

$unreleased = '## [Unreleased]';
$start = strpos( $text, $unreleased );
if ( false === $start ) {
    $fail( 'CHANGELOG.md has no [Unreleased] section.' );
}
$body_start = $start + strlen( $unreleased );
$next_heading = strpos( $text, "\n## [", $body_start );
$body_end = false === $next_heading ? strlen( $text ) : $next_heading + 1;
$body = trim( substr( $text, $body_start, $body_end - $body_start ) );
if ( '' === $body || 1 !== preg_match( '/^###\s+(Added|Changed|Fixed|Removed|Security)\s*$/m', $body ) || 1 !== preg_match( '/^\s*-\s+\S+/m', $body ) ) {
    $fail( 'The [Unreleased] section has no releasable categorized change content.' );
}
if ( false !== stripos( $body, 'Pending before first release' ) ) {
    $fail( 'The [Unreleased] section still contains a first-release pending block.' );
}

$prefix = substr( $text, 0, $start );
$suffix = false === $next_heading ? '' : substr( $text, $body_end );
$prepared = rtrim( $prefix ) . "\n\n## [Unreleased]\n\n## [{$version}] - {$date}\n\n{$body}\n";
if ( '' !== trim( $suffix ) ) {
    $prepared .= "\n" . ltrim( $suffix );
}
if ( false === file_put_contents( $changelog, $prepared ) ) {
    $fail( 'Cannot write prepared CHANGELOG.md.' );
}

fwrite( STDOUT, "GPP_RELEASE_CANDIDATE_PREPARED version={$version} date={$date}\n" );
