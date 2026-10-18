<?php

namespace GravityPresentationProfiles\Core\Presentation;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

/**
 * Consumer-neutral, paint-only interpretation of schema 1.1 color preferences.
 *
 * Only immutable selected profile data and validated hex color tokens may
 * enter this projection. Consumers own selectors, properties and CSS emission.
 */
final class OperationalVisualPreferences {
    private const COLOR_PREFERENCES = array(
        'composition.surface_background',
        'sections.heading_text',
        'labels.text',
    );

    /** Return an ordered preference => safe #RRGGBB map, or an empty map. */
    public static function colors( $surface, $profile, $package ) {
        if ( ! is_string( $surface ) || ! is_array( $profile ) || ! is_array( $package )
            || ! isset( $package['schema_version'] ) || '1.1.0' !== $package['schema_version'] ) {
            return array();
        }

        try {
            VisualProfilePackage::validate( $package );
        } catch ( ContractViolation $exception ) {
            return array();
        }

        if ( ! isset( $profile['surface'], $profile['profile_id'], $profile['presentation'], $profile['token_refs'] )
            || $surface !== $profile['surface'] ) {
            return array();
        }

        // The profile must be exactly the immutable selected-surface record,
        // never an arbitrary caller-supplied projection.
        $selected = null;
        foreach ( $package['surface_profiles'] as $candidate ) {
            if ( $surface === $candidate['surface'] ) {
                $selected = $candidate;
                break;
            }
        }
        if ( null === $selected || $selected !== $profile ) {
            return array();
        }

        $colors = array();
        foreach ( self::COLOR_PREFERENCES as $preference ) {
            $parts = explode( '.', $preference );
            $reference = isset( $profile['presentation'][ $parts[0] ][ $parts[1] ] )
                ? $profile['presentation'][ $parts[0] ][ $parts[1] ] : null;
            if ( null === $reference ) {
                continue;
            }
            if ( ! is_string( $reference ) || ! in_array( $reference, $profile['token_refs'], true ) ) {
                return array();
            }
            $ref_parts = explode( '.', $reference );
            if ( 2 !== count( $ref_parts ) || 'colors' !== $ref_parts[0]
                || ! isset( $package['design_tokens']['colors'][ $ref_parts[1] ] ) ) {
                return array();
            }
            $color = $package['design_tokens']['colors'][ $ref_parts[1] ];
            if ( ! is_string( $color ) || ! preg_match( '/^#[0-9a-fA-F]{6}$/D', $color ) ) {
                return array();
            }
            $colors[ $preference ] = $color;
        }

        return $colors;
    }
}
