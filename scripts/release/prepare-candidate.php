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

$entrypoint_text = file_get_contents( $entrypoint );
$addon_text      = file_get_contents( $addon );
$changelog_text  = file_get_contents( $changelog );
if ( false === $entrypoint_text || false === $addon_text || false === $changelog_text ) {
    $fail( 'Unable to read one or more release source files.' );
}

// Validate every precondition before mutating any source file. A rejected
// release preparation must leave the working tree byte-for-byte unchanged.
if ( false !== strpos( $changelog_text, '## [' . $version . ']' ) ) {
    $fail( 'CHANGELOG.md already contains this release version.' );
}
$unreleased = '## [Unreleased]';
$start = strpos( $changelog_text, $unreleased );
if ( false === $start ) {
    $fail( 'CHANGELOG.md has no [Unreleased] section.' );
}
$body_start = $start + strlen( $unreleased );
$next_heading = strpos( $changelog_text, "\n## [", $body_start );
$body_end = false === $next_heading ? strlen( $changelog_text ) : $next_heading + 1;
$body = trim( substr( $changelog_text, $body_start, $body_end - $body_start ) );
if ( '' === $body || 1 !== preg_match( '/^###\s+(Added|Changed|Fixed|Removed|Security)\s*$/m', $body ) || 1 !== preg_match( '/^\s*-\s+\S+/m', $body ) ) {
    $fail( 'The [Unreleased] section has no releasable categorized change content.' );
}
if ( false !== stripos( $body, 'Pending before first release' ) ) {
    $fail( 'The [Unreleased] section still contains a first-release pending block.' );
}

$entrypoint_count = 0;
$next_entrypoint = preg_replace(
    '/(^\s*\*\s*Version:\s*)[^\r\n]+/m',
    '${1}' . $version,
    $entrypoint_text,
    1,
    $entrypoint_count
);
if ( 1 !== $entrypoint_count || null === $next_entrypoint ) {
    $fail( 'Expected exactly one plugin header version declaration.' );
}

$addon_pattern = <<<'REGEX'
/(^\s*protected\s+\$_version\s*=\s*')[^']+('.*$)/m
REGEX;
$addon_count = 0;
$next_addon = preg_replace(
    $addon_pattern,
    '${1}' . $version . '${2}',
    $addon_text,
    1,
    $addon_count
);
if ( 1 !== $addon_count || null === $next_addon ) {
    $fail( 'Expected exactly one Gravity Forms Add-On version mirror.' );
}

$prefix = substr( $changelog_text, 0, $start );
$suffix = false === $next_heading ? '' : substr( $changelog_text, $body_end );
$next_changelog = rtrim( $prefix ) . "\n\n## [Unreleased]\n\n## [{$version}] - {$date}\n\n{$body}\n";
if ( '' !== trim( $suffix ) ) {
    $next_changelog .= "\n" . ltrim( $suffix );
}

$writes = array(
    $entrypoint => $next_entrypoint,
    $addon      => $next_addon,
    $changelog  => $next_changelog,
);
foreach ( $writes as $path => $contents ) {
    if ( false === file_put_contents( $path, $contents ) ) {
        $fail( 'Cannot write prepared release source file: ' . $path );
    }
}

fwrite( STDOUT, "GPP_RELEASE_CANDIDATE_PREPARED version={$version} date={$date}\n" );
