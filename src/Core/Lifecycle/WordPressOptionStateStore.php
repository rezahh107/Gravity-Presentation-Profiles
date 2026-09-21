<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

final class WordPressOptionStateStore implements StateStore {
    private static $active_guards = array();
    private static $preview_depth = 0;
    private static $preview_states = array();
    private $option_name;

    public function __construct( $option_name ) {
        if ( ! is_string( $option_name ) || '' === $option_name ) {
            throw new LifecycleException( 'invalid_option_name', 'Lifecycle option name must be non-empty.' );
        }

        $this->option_name = $option_name;
    }

    /**
     * Execute lifecycle code against request-local option snapshots.
     *
     * Every WordPressOptionStateStore created while this scope is active reads
     * from and commits to the same in-memory option map. This lets callers run
     * the exact production lifecycle/CAS logic as validation without persisting
     * canonical state. The outermost scope always discards its snapshots.
     */
    public static function preview( $callback ) {
        if ( ! is_callable( $callback ) ) {
            throw new LifecycleException( 'invalid_state_preview_callback', 'Lifecycle preview requires a callable.' );
        }

        $outermost = 0 === self::$preview_depth;
        if ( $outermost ) {
            self::$preview_states = array();
        }

        self::$preview_depth++;
        try {
            return call_user_func( $callback );
        } finally {
            self::$preview_depth--;
            if ( 0 === self::$preview_depth ) {
                self::$preview_states = array();
            }
        }
    }

    public static function isPreviewActive() {
        return self::$preview_depth > 0;
    }

    public function load() {
        if ( ! function_exists( 'get_option' ) ) {
            throw new LifecycleException( 'wordpress_option_api_unavailable', 'WordPress option API is unavailable.' );
        }

        if ( self::isPreviewActive() ) {
            if ( ! array_key_exists( $this->option_name, self::$preview_states ) ) {
                self::$preview_states[ $this->option_name ] = get_option( $this->option_name, null );
            }
            return self::$preview_states[ $this->option_name ];
        }

        return get_option( $this->option_name, null );
    }

    public function commit( $expected_revision, $next_state ) {
        if ( self::isPreviewActive() ) {
            $current = $this->load();
            $current_revision = is_array( $current ) && isset( $current['revision'] ) ? $current['revision'] : 0;
            if ( $current_revision !== $expected_revision ) {
                return false;
            }

            self::$preview_states[ $this->option_name ] = $next_state;
            return true;
        }

        global $wpdb;

        if ( ! function_exists( 'get_option' ) || ! function_exists( 'update_option' ) ) {
            throw new LifecycleException( 'wordpress_option_api_unavailable', 'WordPress option API is unavailable.' );
        }

        if (
            ! is_object( $wpdb ) ||
            ! method_exists( $wpdb, 'prepare' ) ||
            ! method_exists( $wpdb, 'get_var' )
        ) {
            return false;
        }

        $guard_key = $this->reentrancyGuardKey( $wpdb );
        if ( isset( self::$active_guards[ $guard_key ] ) ) {
            return false;
        }

        self::$active_guards[ $guard_key ] = true;
        $lock_acquired = false;
        $release_query = null;

        try {
            $lock_name = $this->advisoryLockName( $wpdb );
            if ( null === $lock_name ) {
                return false;
            }

            $acquire_query = $wpdb->prepare( 'SELECT GET_LOCK(%s, 0)', $lock_name );
            $release_query = $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock_name );
            if ( ! is_string( $acquire_query ) || ! is_string( $release_query ) ) {
                return false;
            }

            $acquired = $wpdb->get_var( $acquire_query );
            if ( 1 !== $acquired && '1' !== $acquired ) {
                return false;
            }

            $lock_acquired   = true;
            $current          = get_option( $this->option_name, null );
            $current_revision = is_array( $current ) && isset( $current['revision'] ) ? $current['revision'] : 0;

            if ( $current_revision !== $expected_revision ) {
                return false;
            }

            update_option( $this->option_name, $next_state, false );

            return get_option( $this->option_name, null ) === $next_state;
        } finally {
            try {
                if ( $lock_acquired && is_string( $release_query ) ) {
                    $wpdb->get_var( $release_query );
                }
            } finally {
                unset( self::$active_guards[ $guard_key ] );
            }
        }
    }

    private function reentrancyGuardKey( $wpdb ) {
        $site_prefix = isset( $wpdb->prefix ) && is_string( $wpdb->prefix ) ? $wpdb->prefix : '';
        $blog_id     = isset( $wpdb->blogid ) && ( is_int( $wpdb->blogid ) || is_string( $wpdb->blogid ) ) ? (string) $wpdb->blogid : '';
        $identity    = spl_object_hash( $wpdb ) . "\0" . $site_prefix . "\0" . $blog_id . "\0" . $this->option_name;

        return hash( 'sha256', $identity );
    }

    private function advisoryLockName( $wpdb ) {
        $database_name = $wpdb->get_var( 'SELECT DATABASE()' );
        if ( ! is_string( $database_name ) || '' === $database_name ) {
            return null;
        }

        $site_prefix = isset( $wpdb->prefix ) && is_string( $wpdb->prefix ) ? $wpdb->prefix : '';
        $blog_id     = isset( $wpdb->blogid ) && ( is_int( $wpdb->blogid ) || is_string( $wpdb->blogid ) ) ? (string) $wpdb->blogid : '';
        $identity    = $database_name . "\0" . $site_prefix . "\0" . $blog_id . "\0" . $this->option_name;

        return 'gpp:' . substr( hash( 'sha256', $identity ), 0, 60 );
    }
}
