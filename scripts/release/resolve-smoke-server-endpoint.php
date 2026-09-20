<?php

declare(strict_types=1);

if ( 2 !== $argc ) {
    fwrite( STDERR, "Usage: resolve-smoke-server-endpoint.php <base-url>\n" );
    exit( 2 );
}

$url = parse_url( $argv[1] );
if ( ! is_array( $url ) || 'http' !== ( $url['scheme'] ?? null ) || empty( $url['host'] ) ) {
    fwrite( STDERR, "Smoke BASE_URL must be a valid local HTTP URL.\n" );
    exit( 1 );
}

$port = $url['port'] ?? 80;
if ( ! is_int( $port ) || $port < 1 || $port > 65535 ) {
    fwrite( STDERR, "Smoke BASE_URL has an invalid port.\n" );
    exit( 1 );
}

printf( "%s\t%d\n", $url['host'], $port );
