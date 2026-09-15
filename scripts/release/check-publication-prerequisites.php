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

// Owner-approved release-license identity. These are checked mirrors of the
// existing decision; this checker remains the release prerequisite boundary.
$approved_license_spdx = 'GPL-2.0-or-later';
$approved_plugin_license = 'GPL v2 or later';
$approved_license_sha256 = '8272fab389a03e9ab3531c5f8d6f64ab711b91e82b2a1b145018dde314a26873';

$license = $root . '/LICENSE';
if ( ! is_file( $license ) || 0 === filesize( $license ) ) {
    $blockers[] = 'missing_license';
} elseif ( hash_file( 'sha256', $license ) !== $approved_license_sha256 ) {
    $blockers[] = 'license_identity_mismatch:source_bytes';
}

$composer_path = $root . '/composer.json';
$composer_license = null;
if ( is_file( $composer_path ) ) {
    $composer = json_decode( file_get_contents( $composer_path ), true );
    if ( is_array( $composer ) && isset( $composer['license'] ) && is_string( $composer['license'] ) ) {
        $composer_license = $composer['license'];
    }
}
if ( $composer_license !== $approved_license_spdx ) {
    $blockers[] = 'license_identity_mismatch:composer';
}

$compatibility = null;
$compatibility_path = $root . '/release/compatibility.json';
if ( ! is_file( $compatibility_path ) ) {
    $blockers[] = 'missing_compatibility_policy';
} else {
    $decoded = json_decode( file_get_contents( $compatibility_path ), true );
    $required = array( 'wordpress_min', 'php_min', 'gravity_forms_min', 'gravity_flow_min' );
    $resolved_floor = '/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){1,3}$/';
    if ( ! is_array( $decoded ) ) {
        $blockers[] = 'invalid_compatibility_policy';
    } else {
        $valid = true;
        foreach ( $required as $key ) {
            $value = isset( $decoded[ $key ] ) ? $decoded[ $key ] : null;
            if ( ! is_string( $value ) || 1 !== preg_match( $resolved_floor, $value ) ) {
                $blockers[] = 'invalid_compatibility_policy:' . $key;
                $valid = false;
            }
        }
        if ( $valid ) {
            $compatibility = array();
            foreach ( $required as $key ) {
                $compatibility[ $key ] = $decoded[ $key ];
            }
        }
    }
}

$entrypoint = $root . '/gravity-presentation-profiles.php';
$entrypoint_text = is_file( $entrypoint ) ? file_get_contents( $entrypoint ) : '';
$version = '';
if ( preg_match( '/^\s*\*\s*Version:\s*([^\r\n]+)/m', $entrypoint_text, $m ) ) {
    $version = trim( $m[1] );
}
if ( '0.0.0-dev' === $version ) {
    $facts[] = 'development_source_version';
} elseif ( ! preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $version ) || '0.0.0' === $version ) {
    $blockers[] = 'invalid_source_version_state';
} else {
    $facts[] = 'production_version_already_prepared';
    if ( 'publish' === $mode ) {
        $blockers[] = 'production_version_source_requires_recovery';
    }
}

$plugin_license = '';
if ( preg_match( '/^\s*\*\s*License:\s*([^\r\n]+)/mi', $entrypoint_text, $m ) ) {
    $plugin_license = trim( $m[1] );
}
if ( $plugin_license !== $approved_plugin_license ) {
    $blockers[] = 'license_identity_mismatch:plugin_header';
}

if ( is_array( $compatibility ) ) {
    $header_map = array(
        'wordpress_min' => 'Requires at least',
        'php_min' => 'Requires PHP',
    );
    foreach ( $header_map as $key => $label ) {
        $header_value = '';
        if ( preg_match( '/^\s*\*\s*' . preg_quote( $label, '/' ) . ':\s*([^\r\n]+)/mi', $entrypoint_text, $m ) ) {
            $header_value = trim( $m[1] );
        }
        if ( $header_value !== $compatibility[ $key ] ) {
            $blockers[] = 'compatibility_metadata_mismatch:' . $key;
        }
    }
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
    'compatibility' => $compatibility,
);
echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;

if ( 'publish' === $mode && ! empty( $blockers ) ) {
    exit( 1 );
}
