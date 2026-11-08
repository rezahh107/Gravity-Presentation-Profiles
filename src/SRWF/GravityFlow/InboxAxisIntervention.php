<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\GravityForms\AddOn;

/**
 * Independent GPP presentation-axis preference (not Gravity Flow enableRtl).
 *
 * Only the existing Gravity Forms Add-On Framework settings are authoritative.
 * Missing values preserve the shipped four-node LTR correction. Neither this
 * class nor its public status function reads or writes PersianGravity options.
 */
final class InboxAxisIntervention {
    const SETTING = 'inbox_axis_ltr';

    public static function status() {
        $requested = 'unknown';

        if ( class_exists( 'GFAddOn', false ) && class_exists( 'GravityPresentationProfiles\\GravityForms\\AddOn' ) ) {
            $addon = AddOn::get_instance();
            if ( is_object( $addon ) && is_callable( array( $addon, 'get_plugin_setting' ) ) ) {
                try {
                    $value = $addon->get_plugin_setting( self::SETTING );
                    if ( null === $value || '' === $value || false === $value || 'on' === $value ) {
                        $requested = 'on'; // Migration-free default for existing installations.
                    } elseif ( 'off' === $value ) {
                        $requested = 'off';
                    }
                } catch ( \Throwable $exception ) {
                    $requested = 'unknown';
                }
            }
        }

        return array(
            'api_version' => 1,
            'capability' => 'supported',
            'requested' => $requested,
            // UNKNOWN never silently removes a previously shipped axis rule.
            'effective' => 'off' === $requested ? 'off' : 'on',
            'scope' => 'gravity_flow.inbox_1',
            'grid_mode' => 'not_observed',
        );
    }

    public static function enabled() {
        return 'on' === self::status()['effective'];
    }

    /**
     * Only these four historical physical-axis participants are admitted.
     * Deliberately emitted with the existing presentation handle only when ON.
     */
    public static function css() {
        return '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-root-wrapper,' . "\n"
            . '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-header-viewport,' . "\n"
            . '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-center-cols-viewport,' . "\n"
            . '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport {' . "\n"
            . '    direction: ltr !important;' . "\n"
            . '}' . "\n";
    }

    /**
     * Read only the documented PGR v1 seam. This is request configuration,
     * never an observation of a constructed native AG Grid.
     */
    public static function compatibilityFacts() {
        $axis = self::status();
        $pgr = array( 'capability' => 'unavailable', 'requested' => 'unknown', 'host' => 'unknown' );
        if ( function_exists( 'pgr_gravity_flow_inbox_rtl_status' ) ) {
            try {
                $candidate = pgr_gravity_flow_inbox_rtl_status();
                if ( is_array( $candidate ) && 1 === ( $candidate['api_version'] ?? null )
                    && 'supported' === ( $candidate['capability'] ?? null )
                    && in_array( $candidate['requested'] ?? null, array( 'on', 'off', 'unknown' ), true )
                    && in_array( $candidate['host'] ?? null, array( 'admitted', 'absent', 'unsupported', 'unknown' ), true ) ) {
                    $pgr = array(
                        'capability' => 'supported',
                        'requested' => $candidate['requested'],
                        'host' => $candidate['host'],
                    );
                } else {
                    $pgr['capability'] = 'unsupported';
                }
            } catch ( \Throwable $exception ) {
                $pgr['capability'] = 'unknown';
            }
        }

        $site_locale = function_exists( 'get_locale' ) ? get_locale() : null;
        $affected = 'on' === $axis['effective']
            && 'supported' === $pgr['capability']
            && 'on' === $pgr['requested']
            && 'admitted' === $pgr['host']
            && 'fa_IR' === $site_locale;

        return array(
            'axis' => $axis,
            'pgr' => $pgr,
            'site_locale' => is_string( $site_locale ) ? $site_locale : 'unknown',
            'grid_mode' => 'not_observed',
            // This verdict is scoped to native Inbox 1 fa_IR Frontend and
            // exact historical pinned identities; no broader compatibility claim.
            'compatibility' => $affected ? 'incompatible' : 'unknown',
            'evidence' => $affected ? 'PGR_PR114@311c2f5d_GPP_MAIN@a159e22c_FLOW_3.1.0_FRONTEND_FA_IR' : 'none_for_this_combination',
        );
    }
}
