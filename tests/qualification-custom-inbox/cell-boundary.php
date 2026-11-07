<?php
/** Experimental native Inbox projection. No field reads or copied composition. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once __DIR__ . '/boundary.php';

function cellq_model() {
    return gravity_flow()->container()->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
}
function cellq_args( $scope = array(), $offset = 0, $page_size = 1 ) {
    $fixture = get_option( 'cellq_fixture', array() );
    return array_merge( array_intersect_key( $scope, array( 'form_id' => true ) ), array(
        'paging' => array( 'offset' => $offset, 'page_size' => $page_size ),
        'is_shortcode' => true,
        'context_key' => '',
        'detail_base_url' => add_query_arg( array( 'page' => 'gravityflow-inbox', 'view' => 'entry' ), $fixture['native_url'] ?? '' ),
    ) );
}
function cellq_text( $value ) {
    // The admitted GPP columns are plain text. Do not guess rich HTML or object
    // semantics. HTML entities are decoded once, exactly as the native span's
    // innerHTML boundary does, and the independent renderer must escape again.
    if ( ! is_string( $value ) && ! is_numeric( $value ) ) { return null; }
    $value = (string) $value;
    if ( preg_match( '/<[a-z\/!][\s\S]*>/i', $value ) ) { return null; }
    return html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
}
function cellq_rows( $scope = array(), $skip_denied = false ) {
    $entries = ciq_entries( $scope );
    $metadata = ciq_project( $entries, $skip_denied ); // Preserve PR169 entry guard and all task predicates.
    if ( is_wp_error( $metadata ) ) { return $metadata; }
    $contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract( $scope );
    $defs = cellq_model()->get_table_header_defs( cellq_args( $scope ) );
    $native = array();
    $batch_size = 40;
    $GLOBALS['cellq_task_model_paging'] = array();
    // Query the complete native task set in bounded pages. The per-entry
    // guard can optionally omit an individual denied row from presentation.
    for ( $offset = 0; $offset < count( $entries ); $offset += $batch_size ) {
        $GLOBALS['cellq_task_model_paging'][] = array( 'offset' => $offset, 'page_size' => $batch_size );
        foreach ( cellq_model()->get_inbox_tasks( cellq_args( $scope, $offset, $batch_size ) ) as $row ) {
            $id = (int) ( $row['id'] ?? 0 );
            if ( $id < 1 || isset( $native[ $id ] ) ) { return new WP_Error( 'native_cell_identity_invalid' ); }
            $native[ $id ] = $row;
        }
    }
    if ( count( $native ) !== count( $entries ) ) { return new WP_Error( 'native_cell_task_set_changed' ); }
    $created = array();
    foreach ( $entries as $entry ) { $created[ (int) $entry['id'] ] = (string) ( $entry['date_created'] ?? '' ); }
    $keys = null === $contract ? array() : array(
        'student_name' => $contract['column_ids'][1],
        'national_id' => $contract['column_ids'][2],
        'school_grade' => $contract['column_ids'][3],
    );
    foreach ( $metadata as &$row ) {
        if ( ! isset( $native[ $row['id'] ] ) ) { return new WP_Error( 'native_cell_task_set_changed' ); }
        $row['date_created'] = $created[ $row['id'] ] ?? '';
        $row['cells'] = array(); $row['cell_status'] = array();
        $row['native_url'] = $native[ $row['id'] ]['url_entry'] ?? '';
        $row['binding_state'] = null === $contract ? 'NO_QUALIFIED_FORM_PROJECTION' : 'CURRENT_HOST_QUALIFIED';
        foreach ( $keys as $semantic => $column ) {
            $def = null;
            foreach ( $defs as $candidate ) {
                if ( (string) ( $candidate['field'] ?? '' ) === (string) $column ) { $def = $candidate; break; }
            }
            $display_key = $def['displayKey'] ?? null;
            if ( ! is_string( $display_key ) || ! array_key_exists( $display_key, $native[ $row['id'] ] ) ) {
                $row['cell_status'][ $semantic ] = 'MISSING_NATIVE_DISPLAY_KEY'; continue;
            }
            $text = cellq_text( $native[ $row['id'] ][ $display_key ] );
            if ( null === $text ) { $row['cell_status'][ $semantic ] = 'UNQUALIFIED_NATIVE_VALUE_SHAPE'; continue; }
            $row['cells'][ $semantic ] = array( 'column_id' => (string) $column, 'text' => $text );
            $row['cell_status'][ $semantic ] = 'NATIVE_PLAIN_CELL';
        }
    }
    unset( $row );
    return $metadata;
}
