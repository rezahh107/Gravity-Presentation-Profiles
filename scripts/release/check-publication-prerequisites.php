<?php

if ( PHP_SAPI !== 'cli' ) {
    fwrite( STDERR, "CLI only.\n" );
    exit( 2 );
}

$options = getopt( '', array( 'root:', 'mode:' ) );
$root = isset( $options['root'] ) ? rtrim( $options['root'], '/\\' ) : getcwd();
$mode = isset( $options['mode'] ) ? (string) $options['mode'] : 'dry-run';
if ( ! in_array( $mode, array( 'dry-run', 'publish' ), true ) ) {
    fwrite( STDERR, "Unsupported mode.\n" );
    exit( 2 );
}

$blockers = array();
$facts = array();
$license = $root . '/LICENSE';
if ( ! is_file( $license ) || 0 === filesize( $license ) ) {
    $blockers[] = 'missing_license';
}

$compatibility_path = $root . '/release/compatibility.json';
if ( ! is_file( $compatibility_path ) ) {
    $blockers[] = 'missing_compatibility_policy';
} else {
    $compatibility = json_decode( file_get_contents( $compatibility_path ), true );
    $required = array( 'wordpress_min', 'php_min', 'gravity_forms_min', 'gravity_flow_min' );
    if ( ! is_array( $compatibility ) ) {
        $blockers[] = 'invalid_compatibility_policy';
    } else {
        foreach ( $required as $key ) {
            if ( empty( $compatibility[ $key ] ) || ! is_string( $compatibility[ $key ] ) ) {
                $blockers[] = 'invalid_compatibility_policy:' . $key;
            }
        }
    }
}

$entrypoint = $root . '/gravity-presentation-profiles.php';
$version = '';
if ( is_file( $entrypoint ) && preg_match( '/^\s*\*\s*Version:\s*([^\r\n]+)/m', file_get_contents( $entrypoint ), $m ) ) {
    $version = trim( $m[1] );
}
if ( '0.0.0-dev' === $version ) {
    $facts[] = 'development_source_version';
} elseif ( ! preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $version ) || '0.0.0' === $version ) {
    $blockers[] = 'invalid_source_version_state';
} else {
    $facts[] = 'production_version_already_prepared';
}

$changelog = $root . '/CHANGELOG.md';
if ( ! is_file( $changelog ) || false === strpos( file_get_contents( $changelog ), '## [Unreleased]' ) ) {
    $blockers[] = 'missing_unreleased_changelog';
}

$result = array(
    'schema_version' => '1.0.0',
    'mode' => $mode,
    'publication_ready' => empty( $blockers ),
    'blockers' => array_values( array_unique( $blockers ) ),
    'facts' => $facts,
);
echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;

if ( 'publish' === $mode && ! empty( $blockers ) ) {
    exit( 1 );
}
