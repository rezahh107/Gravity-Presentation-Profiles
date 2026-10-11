<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Portable\VisualProfilePackageV11;

/**
 * Build an inactive, portable schema-1.1 successor. This class does not persist
 * settings, change form selection or mutate the original installed artifact.
 */
final class VerifiedColorSuccessor {
    private const EDITABLE = array(
        'surface_background' => array( 'composition', 'surface_background' ),
        'control_border' => array( 'controls', 'border' ),
        'submit_background' => array( 'primary_action', 'background' ),
    );

    public static function editable() {
        return self::EDITABLE;
    }

    public static function colors( $resolution ) {
        self::requireEditableSource( $resolution );
        $artifact = $resolution['artifact'];
        $profile = $resolution['profile'];
        $result = array();
        foreach ( self::EDITABLE as $key => $path ) {
            $ref = isset( $profile['presentation'][ $path[0] ][ $path[1] ] )
                ? $profile['presentation'][ $path[0] ][ $path[1] ] : null;
            $parts = is_string( $ref ) ? explode( '.', $ref, 2 ) : array();
            $result[ $key ] = 2 === count( $parts ) && 'colors' === $parts[0]
                && isset( $artifact['design_tokens']['colors'][ $parts[1] ] )
                    ? $artifact['design_tokens']['colors'][ $parts[1] ] : null;
        }
        return $result;
    }

    public static function build( $resolution, $expected_hash, $new_version, $changes ) {
        self::requireEditableSource( $resolution );
        if ( ! is_string( $expected_hash ) || ! hash_equals( $resolution['content_hash'], $expected_hash ) ) {
            throw new \InvalidArgumentException( 'Source profile changed; reopen the editor.' );
        }
        if (
            ! is_string( $new_version ) ||
            ! preg_match( '/^[0-9]+\.[0-9]+\.[0-9]+$/D', $new_version ) ||
            version_compare( $new_version, $resolution['package_version'], '<=' )
        ) {
            throw new \InvalidArgumentException( 'Enter a newer x.y.z package version.' );
        }
        if ( ! is_array( $changes ) || array() === $changes ) {
            throw new \InvalidArgumentException( 'Choose at least one supported color to change.' );
        }
        foreach ( $changes as $key => $value ) {
            if (
                ! isset( self::EDITABLE[ $key ] ) ||
                ! is_string( $value ) ||
                1 !== preg_match( '/^#[0-9a-fA-F]{6}$/D', $value )
            ) {
                throw new \InvalidArgumentException( 'Unsupported color control or invalid #RRGGBB value.' );
            }
        }

        $artifact = $resolution['artifact'];
        $artifact['package_version'] = $new_version;
        // Old evidence refers to the immutable source, not to the new colors.
        $artifact['provenance'] = array(
            'producer' => 'GPP bounded administrator color successor',
            'evidence_refs' => array(),
        );

        foreach ( self::EDITABLE as $key => $path ) {
            if ( ! array_key_exists( $key, $changes ) ) {
                continue;
            }
            $token = 'gpp_editor_' . $key;
            $suffix = 1;
            while ( isset( $artifact['design_tokens']['colors'][ $token ] ) ) {
                $token = 'gpp_editor_' . $key . '_' . $suffix++;
            }
            $reference = 'colors.' . $token;
            $artifact['design_tokens']['colors'][ $token ] = strtoupper( $changes[ $key ] );
            $artifact['surface_profiles'][0]['presentation'][ $path[0] ][ $path[1] ] = $reference;
            $artifact['surface_profiles'][0]['token_refs'][] = $reference;
        }

        // The existing schema validator remains the only artifact authority.
        VisualProfilePackageV11::validate( $artifact );
        return $artifact;
    }

    private static function requireEditableSource( $resolution ) {
        if (
            ! is_array( $resolution ) ||
            ! isset( $resolution['schema_version'], $resolution['artifact'], $resolution['profile'], $resolution['content_hash'] ) ||
            VisualProfilePackageV11::SCHEMA_VERSION !== $resolution['schema_version'] ||
            array( 'gravity_forms.form' ) !== $resolution['artifact']['selected_surfaces'] ||
            1 !== count( $resolution['artifact']['surface_profiles'] ) ||
            'gravity_forms.form' !== $resolution['profile']['surface']
        ) {
            throw new \InvalidArgumentException( 'Only standalone Schema 1.1 Gravity Forms profiles can be edited.' );
        }
    }
}
