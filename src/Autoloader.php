<?php

namespace GravityPresentationProfiles;

final class Autoloader {
    const PREFIX = 'GravityPresentationProfiles\\';

    public static function register() {
        spl_autoload_register( array( __CLASS__, 'load' ) );
    }

    public static function load( $class ) {
        if ( 0 !== strpos( $class, self::PREFIX ) ) {
            return;
        }

        $relative = substr( $class, strlen( self::PREFIX ) );
        $file     = __DIR__ . '/' . str_replace( '\\', '/', $relative ) . '.php';

        if ( is_readable( $file ) ) {
            require_once $file;
        }
    }
}
