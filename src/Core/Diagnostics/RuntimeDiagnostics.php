<?php

namespace GravityPresentationProfiles\Core\Diagnostics;

final class RuntimeDiagnostics {
    private static $traces = array();
    private static $flush_registered = false;
    private static $flushed = false;
    private static $event_keys = array();

    public static function record( $surface, $stage, $result, $reason_code = null, $fallback = null ) {
        $trace = self::traceObject( $surface );
        $recorded = $trace->record( $stage, $result, $reason_code, $fallback );
        if ( $recorded ) {
            self::registerFlush();
        }
        return $recorded;
    }

    public static function recordOnce( $surface, $stage, $result, $reason_code = null, $fallback = null ) {
        $key = implode( '|', array( $surface, $stage, $result, (string) $reason_code, (string) $fallback ) );
        if ( isset( self::$event_keys[ $key ] ) ) {
            return true;
        }
        if ( ! self::record( $surface, $stage, $result, $reason_code, $fallback ) ) {
            return false;
        }
        self::$event_keys[ $key ] = true;
        return true;
    }

    public static function recordException( $surface, $stage, $reason_code, $fallback, \Throwable $exception ) {
        $trace = self::traceObject( $surface );
        $recorded = $trace->record(
            $stage,
            RuntimeDecisionTrace::RESULT_FAIL,
            $reason_code,
            $fallback,
            RuntimeDecisionTrace::safeException( $exception )
        );
        if ( $recorded ) {
            self::registerFlush();
        }
        return $recorded;
    }

    public static function snapshot( $surface ) {
        return isset( self::$traces[ $surface ] ) ? self::$traces[ $surface ]->snapshot() : null;
    }

    public static function resetSurface( $surface ) {
        unset( self::$traces[ $surface ] );
        foreach ( array_keys( self::$event_keys ) as $key ) {
            if ( 0 === strpos( $key, $surface . '|' ) ) {
                unset( self::$event_keys[ $key ] );
            }
        }
        self::$flushed = false;
    }

    public static function flush() {
        if ( self::$flushed || ! function_exists( 'get_option' ) ) {
            return;
        }
        self::$flushed = true;
        try {
            $store = RuntimeIncidentStore::forWordPress();
            foreach ( self::$traces as $trace ) {
                $store->recordTrace( $trace->snapshot() );
            }
        } catch ( \Throwable $exception ) {
            // Diagnostics must never become an operational dependency. The
            // presentation/native fallback decision has already been made.
        }
    }

    private static function traceObject( $surface ) {
        if ( ! isset( self::$traces[ $surface ] ) ) {
            self::$traces[ $surface ] = new RuntimeDecisionTrace( $surface );
        }
        return self::$traces[ $surface ];
    }

    private static function registerFlush() {
        if ( self::$flush_registered || ! function_exists( 'get_option' ) ) {
            return;
        }
        self::$flush_registered = true;
        register_shutdown_function( array( __CLASS__, 'flush' ) );
    }
}
