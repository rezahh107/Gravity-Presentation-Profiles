<?php
/** Experimental native Inbox projection. No field reads or copied composition. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once __DIR__ . '/boundary.php';

function cellq_model() {
    return gravity_flow()->container()->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
}
/** Task Model shape is private and must be explicitly checked. */
function cellq_model_compatible( $model ) {
    return $model instanceof \Gravity_Flow\Gravity_Flow\Inbox\Models\Task
        && is_callable( array( $model, 'get_inbox_tasks' ) )
        && is_callable( array( $model, 'get_table_header_defs' ) );
}
/** Internal Task Model: only the exact pinned Gravity Flow host is admitted. */
function cellq_host_model() {
    if ( ! defined( 'GRAVITY_FLOW_VERSION' ) || '3.1.0' !== GRAVITY_FLOW_VERSION
        || ! function_exists( 'gravity_flow' )
        || ! class_exists( 'Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider' ) ) {
        return new WP_Error( 'ciq2_unsupported_host_version' );
    }
    try {
        $model = cellq_model();
    } catch ( Throwable $error ) {
        return new WP_Error( 'ciq2_native_task_service_unavailable' );
    }
    if ( ! cellq_model_compatible( $model ) ) {
        return new WP_Error( 'ciq2_native_task_contract_changed' );
    }
    return $model;
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
    $model = cellq_host_model();
    if ( is_wp_error( $model ) ) { return $model; }
    $contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract( $scope );
    try {
        $defs = $model->get_table_header_defs( cellq_args( $scope ) );
    } catch ( Throwable $error ) {
        return new WP_Error( 'ciq2_native_header_contract_changed' );
    }
    if ( ! is_array( $defs ) ) { return new WP_Error( 'ciq2_native_header_contract_changed' ); }
    $native = array();
    $batch_size = 40;
    $GLOBALS['cellq_task_model_paging'] = array();
    // Query the complete native task set in bounded pages. The per-entry
    // guard can optionally omit an individual denied row from presentation.
    for ( $offset = 0; $offset < count( $entries ); $offset += $batch_size ) {
        $GLOBALS['cellq_task_model_paging'][] = array( 'offset' => $offset, 'page_size' => $batch_size );
        try {
            $page = $model->get_inbox_tasks( cellq_args( $scope, $offset, $batch_size ) );
        } catch ( Throwable $error ) {
            return new WP_Error( 'ciq2_native_task_contract_changed' );
        }
        if ( ! is_array( $page ) || count( $page ) > $batch_size ) {
            return new WP_Error( 'ciq2_native_task_contract_changed' );
        }
        foreach ( $page as $row ) {
            if ( ! is_array( $row ) || ! isset( $row['id'] )
                || ! is_scalar( $row['id'] ) || ! ctype_digit( (string) $row['id'] ) ) {
                return new WP_Error( 'native_cell_identity_invalid' );
            }
            $id = (int) $row['id'];
            if ( $id < 1 || isset( $native[ $id ] ) ) { return new WP_Error( 'native_cell_identity_invalid' ); }
            $native[ $id ] = $row;
        }
    }
    $expected_ids = array();
    foreach ( $entries as $entry ) { $expected_ids[ (int) $entry['id'] ] = true; }
    if ( count( $native ) !== count( $entries ) || array_diff_key( $native, $expected_ids ) ) {
        return new WP_Error( 'native_cell_task_set_changed' );
    }
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

/** Validate a same-site native Detail link, including same-site customization filters. */
function cellq_native_detail_url_valid( $url, $form_id, $entry_id ) {
    if ( ! is_string( $url ) || '' === $url || $form_id < 1 || $entry_id < 1 ) { return false; }
    $parts = wp_parse_url( $url );
    if ( ! is_array( $parts ) || ! isset( $parts['scheme'], $parts['host'], $parts['query'] )
        || ! in_array( strtolower( $parts['scheme'] ), array( 'http', 'https' ), true )
        || isset( $parts['user'] ) || isset( $parts['pass'] ) ) { return false; }
    $allowed_origin = false;
    foreach ( array( home_url(), admin_url() ) as $origin_url ) {
        $origin = wp_parse_url( $origin_url );
        if ( ! is_array( $origin ) || ! isset( $origin['scheme'], $origin['host'] ) ) { continue; }
        $url_port = (int) ( $parts['port'] ?? ( 'https' === strtolower( $parts['scheme'] ) ? 443 : 80 ) );
        $origin_port = (int) ( $origin['port'] ?? ( 'https' === strtolower( $origin['scheme'] ) ? 443 : 80 ) );
        if ( strtolower( $parts['scheme'] ) === strtolower( $origin['scheme'] )
            && strtolower( $parts['host'] ) === strtolower( $origin['host'] )
            && $url_port === $origin_port ) { $allowed_origin = true; break; }
    }
    if ( ! $allowed_origin ) { return false; }
    parse_str( $parts['query'], $query );
    return isset( $query['id'], $query['lid'], $query['view'] )
        && is_scalar( $query['id'] ) && is_scalar( $query['lid'] )
        && ctype_digit( (string) $query['id'] ) && ctype_digit( (string) $query['lid'] )
        && (int) $query['id'] === $form_id && (int) $query['lid'] === $entry_id
        && 'entry' === $query['view'];
}

/** One admission gate for both initial cards and refreshed HTML. */
function cellq_admitted_card( $row ) {
    if ( ! is_array( $row ) || true !== ( $row['actionable'] ?? false )
        || 'CURRENT_HOST_QUALIFIED' !== ( $row['binding_state'] ?? null ) ) {
        return new WP_Error( 'ciq2_unqualified_required_binding' );
    }
    foreach ( array( 'student_name', 'national_id', 'school_grade' ) as $semantic ) {
        if ( ( $row['cell_status'][ $semantic ] ?? null ) !== 'NATIVE_PLAIN_CELL'
            || ! isset( $row['cells'][ $semantic ]['column_id'], $row['cells'][ $semantic ]['text'] )
            || ! is_string( $row['cells'][ $semantic ]['column_id'] )
            || '' === $row['cells'][ $semantic ]['column_id']
            || ! is_string( $row['cells'][ $semantic ]['text'] )
            || in_array( trim( $row['cells'][ $semantic ]['text'] ), array( '', '-', '—' ), true ) ) {
            return new WP_Error( 'ciq2_unqualified_required_value' );
        }
    }
    // FIFO A is meaningful only for a real, canonical Gravity Forms timestamp.
    $created = $row['date_created'] ?? null;
    $timestamp = is_string( $created ) ? DateTimeImmutable::createFromFormat(
        '!Y-m-d H:i:s', $created, new DateTimeZone( 'UTC' )
    ) : false;
    if ( false === $timestamp || $timestamp->format( 'Y-m-d H:i:s' ) !== $created ) {
        return new WP_Error( 'ciq2_unqualified_creation_timestamp' );
    }
    if ( ! isset( $row['form_id'], $row['id'] ) || ! cellq_native_detail_url_valid(
        $row['native_url'] ?? null, (int) $row['form_id'], (int) $row['id']
    ) ) {
        return new WP_Error( 'ciq2_unqualified_native_detail_url' );
    }
    return true;
}
