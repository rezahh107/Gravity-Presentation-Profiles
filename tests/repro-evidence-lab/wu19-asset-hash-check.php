<?php
$root = dirname( __DIR__, 2 );
$expected = array(
    'assets/images/print/razavi-complex-approved.png' => 'd9cd27599368d5f3342a8beac2b860b93275696ee6c1e5918d547201d2f8388d',
    'assets/images/print/kanoon-approved.png' => 'a6b17af013e8be32dd43fa3624fd6396d40e8da7baf8d2df8d3f2f974b002d2a',
);
foreach ( $expected as $relative => $hash ) {
    $path = $root . '/' . $relative;
    if ( ! is_readable( $path ) || hash_file( 'sha256', $path ) !== $hash ) {
        fwrite( STDERR, "WU19_ASSET_HASH_FAIL: {$relative}\n" );
        exit( 1 );
    }
}
echo "WU19_ASSET_HASH_PASS\n";
