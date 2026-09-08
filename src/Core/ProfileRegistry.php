<?php

namespace GravityPresentationProfiles\Core;

use InvalidArgumentException;

final class ProfileRegistry {
    private $profiles = array();

    public function register( $profile ) {
        if ( ! $profile instanceof ProfileDefinition ) {
            throw new InvalidArgumentException( 'Profiles must be ProfileDefinition instances.' );
        }

        $key = $profile->key();

        if ( '' === $key || 1 !== preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $key ) ) {
            throw new InvalidArgumentException( 'Profile keys must be non-empty lowercase slugs.' );
        }

        if ( isset( $this->profiles[ $key ] ) ) {
            throw new InvalidArgumentException( 'Duplicate profile key: ' . $key );
        }

        $this->profiles[ $key ] = $profile;
    }

    public function get( $key ) {
        $key = (string) $key;

        return isset( $this->profiles[ $key ] ) ? $this->profiles[ $key ] : null;
    }

    public function all() {
        return array_values( $this->profiles );
    }
}
