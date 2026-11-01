<?php
/** Synthetic filters and diagnostics only. Never installed on the Owner site. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
function cellq_trace( $event, $form, $field, $value = null ) {
    $GLOBALS['cellq_trace'][] = array( 'event' => $event, 'user' => get_current_user_id(), 'form' => (int) $form,
        'field' => (string) $field, 'value_hash' => hash( 'sha256', wp_json_encode( $value ) ) );
}
function cellq_target( $form ) {
    $f = get_option( 'cellq_fixture', array() );
    return (int) $form === (int) ( $f['form_id'] ?? 0 );
}
add_action( 'wp_loaded', static function () {
    add_filter( 'gform_entries_field_value', static function ( $v, $form, $field, $entry ) {
        if ( ! cellq_target( $form ) ) { return $v; }
        cellq_trace( 'entries_list_filter', $form, $field, $v );
        return 'list_mask' === get_option( 'cellq_mode' ) && (string) $field === '4' ? 'CQ_LIST_MASKED' : $v;
    }, 17, 4 );
    add_filter( 'gravityflow_inbox_field_value', static function ( $v, $form, $field, $entry ) {
        if ( ! cellq_target( $form ) ) { return $v; }
        cellq_trace( 'inbox_before_gpp', $form, $field, $v );
        return 'early_mask' === get_option( 'cellq_mode' ) && (string) $field === '1' ? 'CQ_EARLY_MASK' : $v;
    }, 20, 4 );
    // Register after GPP, at its final priority, to test an effective final mask.
    add_filter( 'gravityflow_inbox_field_value', static function ( $v, $form, $field, $entry ) {
        if ( ! cellq_target( $form ) ) { return $v; }
        $mode = get_option( 'cellq_mode', 'baseline' );
        cellq_trace( 'inbox_after_gpp', $form, $field, $v );
        if ( 'final_mask' === $mode && (string) $field === '4' ) { return 'CQ_FINAL_MASKED'; }
        if ( 'opaque' === $mode && (string) $field === '6' ) { return array( 'unqualified' => 'CQ_OPAQUE' ); }
        if ( 'content_participating' === $mode && (string) $field === '4' ) {
            return apply_filters( 'gform_field_content', $v, GFAPI::get_field( $form, 4 ), '', $entry['id'], $form );
        }
        return $v;
    }, PHP_INT_MAX, 4 );
    add_filter( 'gform_entry_field_value', static function ( $v, $field, $entry, $form ) {
        if ( ! cellq_target( $form['id'] ) ) { return $v; }
        cellq_trace( 'entry_detail_value', $form['id'], $field->id, $v );
        return 'detail_mask' === get_option( 'cellq_mode' ) && (int) $field->id === 1 ? 'CQ_DETAIL_ONLY_MASK' : $v;
    }, 17, 4 );
    add_filter( 'gform_field_content', static function ( $content, $field, $value, $entry_id, $form ) {
        if ( ! cellq_target( $form ) ) { return $content; }
        cellq_trace( 'field_content', $form, $field->id, $content );
        $mode = get_option( 'cellq_mode' );
        if ( 'content_participating' === $mode && (int) $field->id === 4 ) { return 'CQ_CONTENT_MASKED'; }
        if ( 'content_unrelated' === $mode ) { return 'CQ_DETAIL_CONTENT_ONLY'; }
        return $content;
    }, 30, 5 );
    add_filter( 'gravityflow_permission_granted_entry_detail', static function ( $allowed, $entry ) {
        return cellq_target( $entry['form_id'] ) && 'deny_entry' === get_option( 'cellq_mode' ) ? false : $allowed;
    }, 20, 2 );
} );
