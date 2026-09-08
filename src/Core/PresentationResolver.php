<?php

namespace GravityPresentationProfiles\Core;

final class PresentationResolver {
    public function resolve( $settings, $registry ) {
        if ( ! is_array( $settings ) ) {
            $settings = array();
        }

        $enabled_value = isset( $settings['enabled'] ) ? $settings['enabled'] : null;
        $enabled       = in_array( $enabled_value, array( true, 1, '1' ), true );

        if ( ! $enabled ) {
            return RuntimeState::inactive( false, 'disabled' );
        }

        $profile_key = isset( $settings['profile'] ) && is_string( $settings['profile'] )
            ? trim( $settings['profile'] )
            : '';

        if ( '' === $profile_key ) {
            return RuntimeState::inactive( true, 'missing_profile' );
        }

        $profile = $registry->get( $profile_key );

        if ( null === $profile ) {
            return RuntimeState::inactive( true, 'unknown_profile' );
        }

        return RuntimeState::active( $profile );
    }
}
