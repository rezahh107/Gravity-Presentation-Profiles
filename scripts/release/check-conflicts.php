<?php

$options = getopt( '', array( 'version:', 'source-sha:', 'tags-json:', 'releases-json:' ) );
$version = isset( $options['version'] ) ? (string) $options['version'] : '';
$source  = isset( $options['source-sha'] ) ? (string) $options['source-sha'] : '';
$tags_path = isset( $options['tags-json'] ) ? (string) $options['tags-json'] : '';
$releases_path = isset( $options['releases-json'] ) ? (string) $options['releases-json'] : '';

$fail = static function ( $message ) {
    fwrite( STDERR, 'GPP_RELEASE_CONFLICT_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
};
if ( ! preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $version ) || '0.0.0' === $version ) {
    $fail( 'Invalid production version.' );
}
if ( ! preg_match( '/^[0-9a-f]{40}$/', $source ) ) {
    $fail( 'Invalid source SHA.' );
}
$tag_name = 'v' . $version;
$zip_name = 'gravity-presentation-profiles-' . $version . '.zip';
$sha_name = $zip_name . '.sha256';

$tags = '' === $tags_path ? array() : json_decode( file_get_contents( $tags_path ), true );
$releases = '' === $releases_path ? array() : json_decode( file_get_contents( $releases_path ), true );
if ( ! is_array( $tags ) || ! is_array( $releases ) ) {
    $fail( 'Conflict inventory JSON is invalid.' );
}

foreach ( $tags as $tag ) {
    if ( is_array( $tag ) && ( $tag['name'] ?? null ) === $tag_name ) {
        $sha = $tag['commit']['sha'] ?? '';
        $fail( 'Production tag already exists' . ( $sha ? ' at ' . $sha : '' ) . '.' );
    }
}
foreach ( $releases as $release ) {
    if ( ! is_array( $release ) ) {
        continue;
    }
    if ( ( $release['tag_name'] ?? null ) === $tag_name ) {
        $fail( 'GitHub Release already exists for this version.' );
    }
    foreach ( (array) ( $release['assets'] ?? array() ) as $asset ) {
        $name = is_array( $asset ) ? (string) ( $asset['name'] ?? '' ) : '';
        if ( $name === $zip_name || $name === $sha_name ) {
            $fail( 'Conflicting release asset filename already exists: ' . $name );
        }
    }
}

echo "GPP_RELEASE_CONFLICT_CHECK_PASS version={$version} source={$source}\n";
