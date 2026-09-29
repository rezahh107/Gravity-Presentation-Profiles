<?php
/**
 * INBOX_VISUAL_DESIGN_V2 qualification-only adapter.
 *
 * Loaded only by the disposable WU21 evidence lab. It uses documented Gravity
 * Flow Inbox filters to exercise the existing value/cell lifecycle. It does not
 * register an AG Grid renderer, own Grid state, decorate post-render DOM, or ship
 * with the production plugin runtime.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

function gpp_wu21_inbox_v2_qualification_state() {
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    return is_array( $state ) ? $state : array();
}

function gpp_wu21_inbox_v2_qualification_mode() {
    $state = gpp_wu21_inbox_v2_qualification_state();
    return isset( $state['mode'] ) && is_string( $state['mode'] ) ? $state['mode'] : 'none';
}

function gpp_wu21_inbox_v2_qualification_form() {
    $state = gpp_wu21_inbox_v2_qualification_state();
    return isset( $state['form'] ) && is_array( $state['form'] ) ? $state['form'] : array();
}

add_filter(
    'gravityflow_inbox_filter',
    static function ( $filter ) {
        $mode = gpp_wu21_inbox_v2_qualification_mode();
        if ( ! in_array( $mode, array( 'q1', 'q2' ), true ) ) {
            return $filter;
        }
        $form = gpp_wu21_inbox_v2_qualification_form();
        if ( empty( $form['form_id'] ) ) {
            return $filter;
        }
        return array( 'form_id' => (int) $form['form_id'] );
    },
    999
);

add_filter(
    'gravityflow_inbox_fields',
    static function ( $field_ids ) {
        $mode = gpp_wu21_inbox_v2_qualification_mode();
        if ( ! in_array( $mode, array( 'q1', 'q2' ), true ) ) {
            return $field_ids;
        }
        $form = gpp_wu21_inbox_v2_qualification_form();
        $ids = array();
        foreach ( array( 'first_name_field_id', 'school_field_id', 'grade_group_field_id' ) as $key ) {
            if ( isset( $form[ $key ] ) ) {
                $ids[] = (string) $form[ $key ];
            }
        }
        return $ids ? $ids : $field_ids;
    },
    999
);

add_filter(
    'gravityflow_inbox_field_value',
    static function ( $value, $form_id, $field_id, $entry ) {
        if ( 'q1' !== gpp_wu21_inbox_v2_qualification_mode() ) {
            return $value;
        }
        $form = gpp_wu21_inbox_v2_qualification_form();
        if ( empty( $form['form_id'] ) || empty( $form['first_name_field_id'] ) ) {
            return $value;
        }
        if ( (int) $form_id !== (int) $form['form_id'] || (string) $field_id !== (string) $form['first_name_field_id'] ) {
            return $value;
        }

        $raw = '';
        if ( is_array( $entry ) && isset( $entry[ (string) $field_id ] ) ) {
            $raw = (string) $entry[ (string) $field_id ];
        }

        $presentations = array(
            'Q1_RAW_ZETA' => '<span class="gpp-q1-rich" data-gpp-q1="zeta"><svg data-gpp-q1-svg="zeta" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="4"></circle></svg><strong>AAA Visible Rich Zeta</strong><small> · School · Grade</small></span>',
            'Q1_RAW_ALPHA' => '<span class="gpp-q1-rich" data-gpp-q1="alpha"><svg data-gpp-q1-svg="alpha" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><rect x="1" y="1" width="8" height="8"></rect></svg><strong>ZZZ Visible Rich Alpha</strong><small> · School · Grade</small></span>',
            'Q1_RAW_UPDATED' => '<span class="gpp-q1-rich" data-gpp-q1="updated"><svg data-gpp-q1-svg="updated" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1 5h8"></path></svg><strong>Updated Visible Rich</strong><small> · School · Grade</small></span>',
            'Q1_RAW_ADD' => '<span class="gpp-q1-rich" data-gpp-q1="add"><svg data-gpp-q1-svg="add" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M5 1v8M1 5h8"></path></svg><strong>Added Visible Rich</strong><small> · School · Grade</small></span>',
            // Deliberately hostile canaries. They run only in this disposable,
            // synthetic lab and exist to observe whether the host value path
            // constrains script/event-handler content before browser execution.
            'Q1_RAW_UNSAFE' => '<span data-gpp-q1="unsafe">Unsafe Probe</span><img src="x-gpp-q1-invalid" onerror="window.__GPP_Q1_EVENT_EXECUTED=(window.__GPP_Q1_EVENT_EXECUTED||0)+1"><script>window.__GPP_Q1_SCRIPT_EXECUTED=(window.__GPP_Q1_SCRIPT_EXECUTED||0)+1</script>',
        );

        return isset( $presentations[ $raw ] ) ? $presentations[ $raw ] : $value;
    },
    999,
    4
);
