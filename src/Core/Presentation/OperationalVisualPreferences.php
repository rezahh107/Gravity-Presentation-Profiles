<?php

namespace GravityPresentationProfiles\Core\Presentation;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

/**
 * Closed, paint-only projection of existing schema 1.1 operational preferences.
 *
 * No selectors or CSS are accepted from package data. The host still owns
 * workflow, layout and native state; schema 1.0 remains visually unchanged.
 */
final class OperationalVisualPreferences {
    private const PAINT = array(
        'gravity_flow.inbox' => array(
            'composition.surface_background' => array( '.gpp-inbox-surface', '--gpp-inbox-canvas' ),
            'sections.heading_text' => array( '.gpp-inbox-surface__title', 'color' ),
            'labels.text' => array( '.gflow-inbox.gflow-grid.gflow-common .ag-header-cell', 'color' ),
        ),
        'gravity_flow.entry_detail' => array(
            'composition.surface_background' => array( '.gpp-entry-dossier', 'background-color' ),
            'sections.heading_text' => array(
                '.gpp-entry-dossier__header h1, .gpp-entry-dossier__section-title, .gpp-entry-dossier .gpp-entry-dossier__task-heading, #poststuff .gpp-entry-dossier .gpp-entry-dossier__task-heading',
                'color',
            ),
            'labels.text' => array( '.gpp-entry-dossier__fact dt', 'color' ),
        ),
    );

    public static function css( $surface, $profile, $package ) {
        if ( ! isset( self::PAINT[ $surface ] ) || ! is_array( $profile ) || ! is_array( $package )
            || ! isset( $package['schema_version'] ) || '1.1.0' !== $package['schema_version'] ) {
            return '';
        }

        try {
            VisualProfilePackage::validate( $package );
        } catch ( ContractViolation $exception ) {
            return '';
        }

        if ( ! isset( $profile['surface'], $profile['profile_id'], $profile['presentation'], $profile['token_refs'] )
            || $surface !== $profile['surface'] ) {
            return '';
        }

        // A profile must be the exact immutable selected-surface record from the
        // validated package, not an ad-hoc projection supplied by a caller.
        $selected = null;
        foreach ( $package['surface_profiles'] as $candidate ) {
            if ( $surface === $candidate['surface'] ) {
                $selected = $candidate;
                break;
            }
        }
        if ( null === $selected || $selected !== $profile ) {
            return '';
        }

        $rules = array();
        foreach ( self::PAINT[ $surface ] as $preference => $target ) {
            $parts = explode( '.', $preference );
            $reference = isset( $profile['presentation'][ $parts[0] ][ $parts[1] ] )
                ? $profile['presentation'][ $parts[0] ][ $parts[1] ] : null;
            if ( null === $reference ) {
                continue;
            }
            if ( ! is_string( $reference ) || ! in_array( $reference, $profile['token_refs'], true ) ) {
                return '';
            }
            $ref_parts = explode( '.', $reference );
            if ( 2 !== count( $ref_parts ) || 'colors' !== $ref_parts[0]
                || ! isset( $package['design_tokens']['colors'][ $ref_parts[1] ] ) ) {
                return '';
            }
            $color = $package['design_tokens']['colors'][ $ref_parts[1] ];
            if ( ! is_string( $color ) || ! preg_match( '/^#[0-9a-fA-F]{6}$/D', $color ) ) {
                return '';
            }
            $rules[] = $target[0] . '{' . $target[1] . ':' . $color . ';}';
        }

        return implode( "\n", $rules );
    }
}
