<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Presentation\OperationalVisualPreferences;

/** SRWF-owned, dossier-only color projection. Never paints native actions. */
final class EntryDetailOperationalPaint {
    private const TARGETS = array(
        'composition.surface_background' => array( '.gpp-entry-dossier', 'background-color' ),
        'sections.heading_text' => array(
            '.gpp-entry-dossier__header h1, .gpp-entry-dossier__section-title, .gpp-entry-dossier .gpp-entry-dossier__task-heading, #poststuff .gpp-entry-dossier .gpp-entry-dossier__task-heading',
            'color',
        ),
        'labels.text' => array( '.gpp-entry-dossier__fact dt', 'color' ),
    );

    public static function css( $profile, $package ) {
        $colors = OperationalVisualPreferences::colors( EntryDetailPresentationAdapter::SURFACE, $profile, $package );
        $rules = array();
        foreach ( self::TARGETS as $preference => $target ) {
            if ( isset( $colors[ $preference ] ) ) {
                $rules[] = $target[0] . '{' . $target[1] . ':' . $colors[ $preference ] . ';}';
            }
        }
        return implode( "\n", $rules );
    }
}
