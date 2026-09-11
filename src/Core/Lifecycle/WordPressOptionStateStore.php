<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

final class WordPressOptionStateStore implements StateStore {
    private $option_name;
    private $lock_name;

    public function __construct( $option_name ) {
        if ( ! is_string( $option_name ) || '' === $option_name ) {
            throw new LifecycleException( 'invalid_option_name', 'Lifecycle option name must be non-empty.' );
        }

        $this->option_name = $option_name;
        $this->lock_name   = $option_name . '_lock';
    }

    public function load() {
        if ( ! function_exists( 'get_option' ) ) {
            throw new LifecycleException( 'wordpress_option_api_unavailable', 'WordPress option API is unavailable.' );
        }

        return get_option( $this->option_name, null );
    }

    public function commit( $expected_revision, $next_state ) {
        if (
            ! function_exists( 'get_option' ) ||
            ! function_exists( 'add_option' ) ||
            ! function_exists( 'update_option' ) ||
            ! function_exists( 'delete_option' )
        ) {
            throw new LifecycleException( 'wordpress_option_api_unavailable', 'WordPress option API is unavailable.' );
        }

        if ( ! add_option( $this->lock_name, '1', '', false ) ) {
            return false;
        }

        try {
            $current          = get_option( $this->option_name, null );
            $current_revision = is_array( $current ) && isset( $current['revision'] ) ? $current['revision'] : 0;

            if ( $current_revision !== $expected_revision ) {
                return false;
            }

            update_option( $this->option_name, $next_state, false );

            return get_option( $this->option_name, null ) === $next_state;
        } finally {
            delete_option( $this->lock_name );
        }
    }
}
