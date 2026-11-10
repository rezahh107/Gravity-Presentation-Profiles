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
        $pgr = array( 'capability' => 'unavailable', 'requested' => 'unknown', 'host' => 'unknown', 'request_rtl' => null );
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
                        'request_rtl' => is_bool( $candidate['request_rtl'] ?? null ) ? $candidate['request_rtl'] : null,
                    );
                } else {
                    $pgr['capability'] = 'unsupported';
                }
            } catch ( \Throwable $exception ) {
                $pgr['capability'] = 'unknown';
            }
        }

        $site_locale = function_exists( 'get_locale' ) ? get_locale() : null;
        $admitted = 'supported' === $pgr['capability'] && 'admitted' === $pgr['host'];
        $frontend_fa = 'fa_IR' === $site_locale;
        $admin_fa = true === $pgr['request_rtl'];
        $problem = 'none';

        // Historical, version-scoped real browser evidence from the exact
        // GPP d0c6e21 × PGR #114 × Flow 3.1.0 four-state laboratory. The
        // site/admin language scopes differ; PHP does not observe Grid mode.
        if ( $admitted ) {
            if ( 'on' === $pgr['requested'] && $frontend_fa ) {
                $problem = 'on' === $axis['effective'] ? 'rtl_with_ltr_axis' : 'rtl_column_order_without_axis';
            } elseif ( 'off' === $pgr['requested'] && $frontend_fa && 'off' === $axis['effective'] ) {
                $problem = 'ltr_grid_without_axis';
            } elseif ( $admin_fa && 'off' === $pgr['requested'] ) {
                $problem = 'native_admin_mobile_scroll';
            } elseif ( $admin_fa && 'on' === $pgr['requested'] ) {
                $problem = 'native_admin_mobile_touch';
            }
        }

        return array(
            'axis' => $axis,
            'pgr' => $pgr,
            'site_locale' => is_string( $site_locale ) ? $site_locale : 'unknown',
            'grid_mode' => 'not_observed',
            'problem' => $problem,
            // 'incompatible' is only the historically demonstrated two-ON
            // CSS/RTL conflict. Other proven failures receive a separate
            // classification, not an invented shared root cause.
            'compatibility' => 'rtl_with_ltr_axis' === $problem
                ? 'incompatible' : ( 'none' === $problem ? 'unknown' : 'known_failure' ),
            'evidence' => 'none' === $problem
                ? 'none_for_this_combination'
                : 'G014_FOURSTATE_RUN_42467871825__PGR_311c2f5d__GPP_d0c6e21__FLOW_3.1.0__GF_3.1.1.1__WP_6.8.3__CHROMIUM_140.0.7339.16',
        );
    }
}
