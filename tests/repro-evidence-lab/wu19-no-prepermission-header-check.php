<?php
$root = dirname( __DIR__, 2 );
$adapter = file_get_contents( $root . '/src/SRWF/GravityFlow/PrintDossierPresentationAdapter.php' );
if ( false !== strpos( $adapter, "add_action( 'gravityflow_print_entry_header'" ) ) {
    fwrite( STDERR, "WU19_PREPERMISSION_HEADER_FAIL\n" );
    exit( 1 );
}
echo "WU19_PREPERMISSION_HEADER_PASS\n";
