<?php

$options = getopt( '', array( 'intent:', 'first-version:', 'tags-json:' ) );
$intent = isset( $options['intent'] ) ? (string) $options['intent'] : '';
$first  = isset( $options['first-version'] ) ? (string) $options['first-version'] : '';
$tags_path = isset( $options['tags-json'] ) ? (string) $options['tags-json'] : '';

$fail = static function ( $message ) {
    fwrite( STDERR, 'GPP_RELEASE_VERSION_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
};
$isVersion = static function ( $version ) {
    return is_string( $version ) && preg_match( '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/', $version ) && '0.0.0' !== $version;
};

$tags = array();
if ( '' !== $tags_path ) {
    $decoded = json_decode( file_get_contents( $tags_path ), true );
    if ( ! is_array( $decoded ) ) {
        $fail( 'Tags JSON is invalid.' );
    }
    foreach ( $decoded as $tag ) {
        $name = is_array( $tag ) && isset( $tag['name'] ) ? (string) $tag['name'] : '';
        if ( preg_match( '/^v(.+)$/', $name, $m ) && $isVersion( $m[1] ) ) {
            $tags[] = $m[1];
        }
    }
}

usort( $tags, static function ( $a, $b ) { return version_compare( $b, $a ); } );
$latest = isset( $tags[0] ) ? $tags[0] : null;

if ( null === $latest ) {
    if ( 'first' !== $intent ) {
        $fail( 'No prior production release exists; first release requires explicit first intent.' );
    }
    if ( ! $isVersion( $first ) ) {
        $fail( 'First release requires an explicit non-zero production SemVer.' );
    }
    echo $first . PHP_EOL;
    exit( 0 );
}

if ( 'first' === $intent ) {
    $fail( 'First-release intent is invalid after a production tag exists.' );
}
if ( ! in_array( $intent, array( 'patch', 'minor', 'major' ), true ) ) {
    $fail( 'Release intent must be patch, minor, major, or first.' );
}
list( $major, $minor, $patch ) = array_map( 'intval', explode( '.', $latest ) );
if ( 'patch' === $intent ) {
    ++$patch;
} elseif ( 'minor' === $intent ) {
    ++$minor;
    $patch = 0;
} else {
    ++$major;
    $minor = 0;
    $patch = 0;
}
printf( "%d.%d.%d\n", $major, $minor, $patch );
