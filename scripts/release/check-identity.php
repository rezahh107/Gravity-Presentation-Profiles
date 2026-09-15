<?php

$options = getopt( '', array( 'approved:', 'qualified:', 'artifact:', 'tag:', 'release:' ) );
$names = array( 'approved', 'qualified', 'artifact', 'tag', 'release' );
$values = array();
foreach ( $names as $name ) {
    $value = isset( $options[ $name ] ) ? strtolower( (string) $options[ $name ] ) : '';
    if ( ! preg_match( '/^[0-9a-f]{40}$/', $value ) ) {
        fwrite( STDERR, 'GPP_RELEASE_IDENTITY_FAIL: invalid ' . $name . ' SHA.' . PHP_EOL );
        exit( 1 );
    }
    $values[ $name ] = $value;
}
if ( 1 !== count( array_unique( array_values( $values ) ) ) ) {
    fwrite( STDERR, 'GPP_RELEASE_IDENTITY_FAIL: approved/qualified/artifact/tag/release source identities differ.' . PHP_EOL );
    fwrite( STDERR, json_encode( $values, JSON_UNESCAPED_SLASHES ) . PHP_EOL );
    exit( 1 );
}
echo 'GPP_RELEASE_IDENTITY_PASS source=' . $values['approved'] . PHP_EOL;
