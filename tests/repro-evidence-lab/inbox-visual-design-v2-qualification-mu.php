<?php
/**
 * INBOX_VISUAL_DESIGN_V2 qualification-only Gravity Flow extension.
 *
 * This file is copied into the disposable pinned WU21 runtime only for the
 * bounded qualification window after deferred P06 has completed. It is removed
 * again before the integrated visual-host stage, never ships through the
 * production bootstrap, and never owns Grid lifecycle/state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

const GPP_IVD2_OPTION = 'gpp_inbox_visual_design_v2_qualification';
const GPP_WU21_HEADER_AUTHORITY_QUERY = 'wu21_header_authority_probe';
const GPP_WU21_HEADER_AUTHORITY_OPTION = 'gpp_wu21_header_authority_probe_results';
const GPP_WU21_HEADER_RTL_QUERY = 'wu21_header_rtl_probe';

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
 * Q1 qualifies Gravity Flow's host rich-value path with a temporary probe
 * column. The production SRWF header projection intentionally removes every
 * non-target column, so leave that final projection out of Q1's disposable
 * capability window. Q1 still exercises the real Gravity Flow/AG Grid table,
 * field selection, search/sort/filter semantics, polling and entry navigation.
 * The option is disabled before Q2/Q4 and the real header qualification.
 */
function gpp_ivd2_q1_detach_final_header_projection() {
    if ( ! gpp_ivd2_q1_active() ) {
        return;
    }

    $header = 'GravityPresentationProfiles\\SRWF\\GravityFlow\\InboxTableHeaderPresentation';
    if ( ! class_exists( $header ) ) {
        return;
    }

    remove_filter( 'gravityflow_columns_inbox_table', array( $header, 'filterColumns' ), PHP_INT_MAX );
    remove_filter( 'gravityflow_inbox_field_value', array( $header, 'filterFieldValue' ), PHP_INT_MAX );
}
add_action( 'gform_loaded', 'gpp_ivd2_q1_detach_final_header_projection', 100 );

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

/**
 * Qualification-only RTL request probe.
 *
 * The WU21 fixture intentionally runs in an LTR WordPress locale. On this one
 * query-qualified request, switch only WordPress's presentation-direction
 * signal before shortcode rendering so production GPP sees the same is_rtl()
 * contract as an RTL Owner site. AG Grid itself is not reconfigured or patched.
 */
function gpp_wu21_header_rtl_probe_enabled() {
    return ! is_admin()
        && isset( $_GET[ GPP_WU21_HEADER_RTL_QUERY ] )
        && '1' === sanitize_key( wp_unslash( $_GET[ GPP_WU21_HEADER_RTL_QUERY ] ) );
}

function gpp_wu21_header_rtl_apply_wordpress_direction() {
    if ( ! gpp_wu21_header_rtl_probe_enabled() ) {
        return;
    }

    global $wp_locale;
    if ( is_object( $wp_locale ) ) {
        $wp_locale->text_direction = 'rtl';
    }
}
add_action( 'wp', 'gpp_wu21_header_rtl_apply_wordpress_direction', PHP_INT_MIN );

/**
 * Qualification-only form-authority probe.
 *
 * Register after production GPP has registered so the PHP_INT_MAX capture runs
 * after InboxTableHeaderPresentation::filterColumns(). The PHP_INT_MIN capture
 * records Gravity Flow's native column input before any presentation filter.
 * This observes the exact native hook contract without deriving authority from
 * shortcode, DOM, row or Grid state.
 */
function gpp_wu21_header_authority_probe_enabled() {
    return ! is_admin()
        && isset( $_GET[ GPP_WU21_HEADER_AUTHORITY_QUERY ] )
        && '1' === sanitize_key( wp_unslash( $_GET[ GPP_WU21_HEADER_AUTHORITY_QUERY ] ) );
}

function gpp_wu21_header_authority_form_arg( $args ) {
    if ( ! is_array( $args ) || ! array_key_exists( 'form_id', $args ) ) {
        return array( 'present' => false, 'value' => null );
    }

    $value = $args['form_id'];
    if ( is_array( $value ) ) {
        return array( 'present' => true, 'value' => array_values( $value ) );
    }
    if ( is_scalar( $value ) || null === $value ) {
        return array( 'present' => true, 'value' => $value );
    }

    return array( 'present' => true, 'value' => '__NON_SCALAR__' );
}

function gpp_wu21_header_authority_capture_before( $columns, $args ) {
    $GLOBALS['gpp_wu21_header_authority_before_queue'][] = array(
        'columns' => $columns,
        'form_id' => gpp_wu21_header_authority_form_arg( $args ),
    );
    return $columns;
}

function gpp_wu21_header_authority_capture_after( $columns, $args ) {
    $before = ! empty( $GLOBALS['gpp_wu21_header_authority_before_queue'] )
        ? array_shift( $GLOBALS['gpp_wu21_header_authority_before_queue'] )
        : array( 'columns' => null, 'form_id' => null );
    $events = get_option( GPP_WU21_HEADER_AUTHORITY_OPTION, array() );
    $events = is_array( $events ) ? $events : array();
    $events[] = array(
        'before_columns' => $before['columns'],
        'after_columns' => $columns,
        'before_form_id' => $before['form_id'],
        'after_form_id' => gpp_wu21_header_authority_form_arg( $args ),
    );
    update_option( GPP_WU21_HEADER_AUTHORITY_OPTION, $events, false );
    return $columns;
}

function gpp_wu21_header_authority_register_probe() {
    if ( ! gpp_wu21_header_authority_probe_enabled() ) {
        return;
    }

    $GLOBALS['gpp_wu21_header_authority_before_queue'] = array();
    add_filter( 'gravityflow_columns_inbox_table', 'gpp_wu21_header_authority_capture_before', PHP_INT_MIN, 2 );
    add_filter( 'gravityflow_columns_inbox_table', 'gpp_wu21_header_authority_capture_after', PHP_INT_MAX, 2 );
}
add_action( 'gform_loaded', 'gpp_wu21_header_authority_register_probe', 100 );
