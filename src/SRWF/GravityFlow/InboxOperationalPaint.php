<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Presentation\OperationalVisualPreferences;

/**
 * SRWF native Inbox paint projection. Only these code-owned targets may be
 * changed by the validated, immutable operational schema 1.1 profile.
 */
final class InboxOperationalPaint {
    private const TARGETS = array(
        'composition.surface_background' => array( '.gpp-inbox-surface', '--gpp-inbox-canvas' ),
        'sections.heading_text' => array( '.gpp-inbox-surface__title', 'color' ),
        'labels.text' => array( '.gflow-inbox.gflow-grid.gflow-common .ag-header-cell', 'color' ),
    );

    public static function css( $profile, $package ) {
        $colors = OperationalVisualPreferences::colors( InboxPresentationAdapter::SURFACE, $profile, $package );
        $rules = array();
        foreach ( self::TARGETS as $preference => $target ) {
            if ( isset( $colors[ $preference ] ) ) {
                $rules[] = $target[0] . '{' . $target[1] . ':' . $colors[ $preference ] . ';}';
            }
        }
        return implode( "\n", $rules );
    }
}
