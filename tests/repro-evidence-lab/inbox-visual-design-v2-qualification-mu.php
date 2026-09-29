<?php
/**
 * INBOX_VISUAL_DESIGN_V2 qualification-only Gravity Flow extension.
 *
 * This file is copied into the disposable pinned WU21 runtime only for the
 * bounded qualification window. It is removed again before deferred P06 and
 * integrated visual-host stages, never ships through the production bootstrap,
 * and never owns Grid lifecycle/state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

const GPP_IVD2_OPTION = 'gpp_inbox_visual_design_v2_qualification';

function gpp_ivd2_q1_config() {
    $config = get_option( GPP_IVD2_OPTION, array() );
    return is_array( $config ) ? $config : array();
}

function gpp_ivd2_q1_active() {
    $config = gpp_ivd2_q1_config();
    return ! empty( $config['q1_enabled'] )
        && ! empty( $config['form_id'] )
        && ! empty( $config['probe_field_id'] );
}

/**
 * Restrict only the controlled Q1 window to one synthetic form so the documented
 * admin field-column seam has one unambiguous field schema. Q2/Q4 run after this
 * option is disabled and therefore observe the ordinary multi-form native Inbox.
 */
function gpp_ivd2_q1_inbox_filter( $filter ) {
    if ( ! gpp_ivd2_q1_active() ) {
        return $filter;
    }

    $config = gpp_ivd2_q1_config();
    return array( 'form_id' => (int) $config['form_id'] );
}
add_filter( 'gravityflow_inbox_filter', 'gpp_ivd2_q1_inbox_filter', 1000, 1 );

/** Use Gravity Flow's documented field-column selection seam; no renderer API. */
function gpp_ivd2_q1_inbox_fields( $field_ids ) {
    if ( ! gpp_ivd2_q1_active() ) {
        return $field_ids;
    }

    $config = gpp_ivd2_q1_config();
    $field_ids = is_array( $field_ids ) ? $field_ids : array();
    $field_ids[] = (string) (int) $config['probe_field_id'];
    return array_values( array_unique( $field_ids ) );
}
add_filter( 'gravityflow_inbox_fields', 'gpp_ivd2_q1_inbox_fields', 1000, 1 );

/**
 * Probe only the documented display-value filter. Raw Gravity Forms entry values
 * remain plain synthetic strings and are never rewritten into presentation HTML.
 */
function gpp_ivd2_q1_inbox_field_value( $value, $form_id, $field_id, $entry ) {
    if ( ! gpp_ivd2_q1_active() ) {
        return $value;
    }

    $config = gpp_ivd2_q1_config();
    if ( (int) $form_id !== (int) $config['form_id'] || (string) $field_id !== (string) $config['probe_field_id'] ) {
        return $value;
    }

    $raw = is_array( $entry ) && isset( $entry[ (string) $field_id ] )
        ? (string) $entry[ (string) $field_id ]
        : (string) $value;

    if ( 'IVD2_RAW_A' === $raw ) {
        return '<span data-ivd2-rich="benign"><strong>IVD2 Visible Zulu</strong><svg data-ivd2-svg="benign" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6"></circle></svg></span>';
    }

    if ( 'IVD2_RAW_Z' === $raw ) {
        return '<span data-ivd2-rich="unsafe"><strong>IVD2 Visible Alpha</strong></span>'
            . '<script data-ivd2-unsafe-script>window.__GPP_IVD2_UNSAFE=(window.__GPP_IVD2_UNSAFE||0)+1000</script>'
            . '<img data-ivd2-unsafe-img src="/ivd2-intentionally-missing.png" onerror="window.__GPP_IVD2_UNSAFE=(window.__GPP_IVD2_UNSAFE||0)+1">'
            . '<svg data-ivd2-unsafe-svg viewBox="0 0 16 16" onload="window.__GPP_IVD2_UNSAFE=(window.__GPP_IVD2_UNSAFE||0)+100"><circle cx="8" cy="8" r="5"></circle></svg>';
    }

    if ( 'IVD2_RAW_A_UPDATED' === $raw ) {
        return '<span data-ivd2-rich="updated"><strong>IVD2 Visible Updated</strong><svg data-ivd2-svg="updated" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><rect x="3" y="3" width="10" height="10"></rect></svg></span>';
    }

    if ( 'IVD2_RAW_NEW' === $raw ) {
        return '<span data-ivd2-rich="added"><strong>IVD2 Visible Added</strong><svg data-ivd2-svg="added" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 8h10M8 3v10"></path></svg></span>';
    }

    return $value;
}
add_filter( 'gravityflow_inbox_field_value', 'gpp_ivd2_q1_inbox_field_value', 1000, 4 );
