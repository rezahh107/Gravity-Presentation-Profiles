<?php
/**
 * INBOX_VISUAL_DESIGN_V2 qualification-only Flow value-path probe.
 *
 * This module is loaded only by the disposable WU21 MU-plugin. It does not ship
 * in production and deliberately uses only Gravity Flow's existing column/value
 * filters. No AG Grid renderer/config registry, MutationObserver or DOM patch
 * loop is introduced.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

final class GPP_Inbox_Visual_Design_V2_Lab_Probe {
    const OPTION = 'gpp_inbox_visual_design_v2_q1_enabled';
    const FIELD_ID = '50';

    public static function boot() {
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'columns' ), 90, 2 );
        add_filter( 'gravityflow_inbox_field_value', array( __CLASS__, 'value' ), 90, 4 );
    }

    private static function enabled() {
        return '1' === (string) get_option( self::OPTION, '0' );
    }

    public static function columns( $columns, $args = array() ) {
        unset( $args );
        if ( ! self::enabled() || ! is_array( $columns ) ) {
            return $columns;
        }
        $columns[ self::FIELD_ID ] = 'Q1 Rich Probe';
        return $columns;
    }

    public static function value( $value, $form_id, $field_id, $entry ) {
        unset( $form_id );
        if ( ! self::enabled() || self::FIELD_ID !== (string) $field_id || ! is_array( $entry ) ) {
            return $value;
        }

        $raw = isset( $entry[ self::FIELD_ID ] ) ? (string) $entry[ self::FIELD_ID ] : '';
        $display = self::display_value( $raw );
        $candidate = '<span data-gpp-q1-rich="1" data-gpp-q1-raw-sha256="' . esc_attr( hash( 'sha256', $raw ) ) . '">'
            . '<svg data-gpp-q1-svg="1" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><path d="M1 1h6v6H1z"></path></svg>'
            . '<strong data-gpp-q1-display="1">' . esc_html( $display ) . '</strong>'
            . '<span data-gpp-q1-meta="1"> · semantic</span>';

        if ( false !== strpos( $raw, 'UNSAFE' ) ) {
            $candidate .= '<script>window.__gppQ1Unsafe=(window.__gppQ1Unsafe||0)+1</script>'
                . '<img src="x-invalid-q1" onerror="window.__gppQ1Unsafe=(window.__gppQ1Unsafe||0)+1">'
                . '<span onclick="window.__gppQ1Unsafe=(window.__gppQ1Unsafe||0)+1">unsafe-handler</span>';
        }
        $candidate .= '</span>';

        $allowed = array(
            'span' => array(
                'data-gpp-q1-rich' => true,
                'data-gpp-q1-raw-sha256' => true,
                'data-gpp-q1-meta' => true,
                'data-gpp-q1-display' => true,
            ),
            'strong' => array( 'data-gpp-q1-display' => true ),
            'svg' => array(
                'data-gpp-q1-svg' => true,
                'viewbox' => true,
                'aria-hidden' => true,
                'focusable' => true,
            ),
            'path' => array( 'd' => true ),
        );

        return wp_kses( $candidate, $allowed );
    }

    private static function display_value( $raw ) {
        if ( preg_match( '/^Q1-RAW-(\d{2})$/', $raw, $match ) ) {
            return sprintf( 'Q1-DISPLAY-%02d', 99 - (int) $match[1] );
        }
        if ( false !== strpos( $raw, 'UNSAFE' ) ) {
            return 'Q1-DISPLAY-UNSAFE';
        }
        if ( false !== strpos( $raw, 'UPDATED' ) ) {
            return 'Q1-DISPLAY-UPDATED';
        }
        if ( false !== strpos( $raw, 'ADDED' ) ) {
            return 'Q1-DISPLAY-ADDED';
        }
        return 'Q1-DISPLAY-' . sanitize_text_field( $raw );
    }
}

add_action( 'plugins_loaded', array( 'GPP_Inbox_Visual_Design_V2_Lab_Probe', 'boot' ), 40 );
