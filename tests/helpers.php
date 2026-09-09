<?php

function gpp_fail( $message ) {
    fwrite( STDERR, 'FAIL: ' . $message . PHP_EOL );
    exit( 1 );
}

function gpp_assert_true( $condition, $message ) {
    if ( ! $condition ) {
        gpp_fail( $message );
    }
}

function gpp_assert_same( $expected, $actual, $message ) {
    if ( $expected !== $actual ) {
        gpp_fail(
            $message . PHP_EOL .
            'Expected: ' . var_export( $expected, true ) . PHP_EOL .
            'Actual:   ' . var_export( $actual, true )
        );
    }
}
