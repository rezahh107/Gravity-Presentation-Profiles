<?php
/** Experimental read-only boundary. No routes, shortcode, UI, or workflow writes. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

function ciq_entries( $scope = array() ) {
    if ( ! is_user_logged_in() ) { return new WP_Error( 'authentication_required' ); }
    // Scope is server-owned. Never pass request parameters, identity, or filter_key.
    $scope = array_intersect_key( $scope, array( 'form_id' => true ) );
    $entries = array();
    $expected = null;
    for ( $offset = 0; $offset < 500; ++$offset ) {
        $args = $scope;
        $args['paging'] = array( 'offset' => $offset, 'page_size' => 1 );
        // This is the same argument extension point used by the native Task Model.
        $args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), $args ) );
        $total = 0;
        $page = Gravity_Flow_API::get_inbox_entries( $args, $total );
        if ( is_wp_error( $page ) || ! is_array( $page ) || count( $page ) > 1 ) {
            return new WP_Error( 'host_query_failed' );
        }
        if ( null === $expected ) { $expected = (int) $total; }
        if ( (int) $total !== $expected || ( empty( $page ) && $offset < $expected ) ) {
            return new WP_Error( 'unstable_or_incomplete_task_set' );
        }
        foreach ( $page as $entry ) {
            $id = (int) $entry['id'];
            if ( $id < 1 || isset( $entries[ $id ] ) ) { return new WP_Error( 'invalid_identity' ); }
            $entries[ $id ] = $entry;
        }
        if ( count( $entries ) === $expected ) { return array_values( $entries ); }
    }
    return new WP_Error( 'task_set_bound_exceeded' );
}

function ciq_project( $entries ) {
    if ( is_wp_error( $entries ) ) { return $entries; }
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $fixture = get_option( 'ciq_fixture', array() );
    $rows = array();
    foreach ( $entries as $entry ) {
        $api = new Gravity_Flow_API( (int) $entry['form_id'] );
        $step = $api->get_current_step( $entry );
        $form = GFAPI::get_form( (int) $entry['form_id'] );
        if ( ! $form || ! $step ) { return new WP_Error( 'current_task_not_proven' ); }
        // Mirror the native pre-render lifecycle, then CALL host permission logic.
        $form = apply_filters( 'gform_pre_render', $form, false, null );
        $form = apply_filters( 'gform_pre_render_' . $form['id'], $form, false, null );
        $allowed = Gravity_Flow_Entry_Detail::is_permission_granted( $entry, $form, $step );
        $allowed = apply_filters( 'gravityflow_permission_granted_entry_detail', $allowed, $entry, $form, $step );
        if ( ! $allowed ) { return new WP_Error( 'native_entry_access_denied' ); }
        $row = array( 'id' => (int) $entry['id'], 'form_id' => (int) $entry['form_id'],
            'step_id' => (int) $step->get_id(), 'fields' => array() );
        // Only the spike's mapped simple text fields on current assignee Approval
        // are qualified. No fallback for administrator, User Input, or unknown form.
        if ( (int) ( $fixture['form_id'] ?? 0 ) === (int) $entry['form_id']
            && $step instanceof Gravity_Flow_Step_Approval && $step->is_user_assignee() ) {
            foreach ( array( 1, 2, 3, 4 ) as $id ) {
                $field = GFFormsModel::get_field( $form, $id );
                if ( ! $field || 'text' !== $field->type ) { continue; }
                if ( Gravity_Flow_Common::is_display_field( $field, $step, $form, $entry )
                    && isset( $entry[ (string) $id ] ) && '' !== $entry[ (string) $id ] ) {
                    $row['fields'][ (string) $id ] = (string) $entry[ (string) $id ];
                }
            }
        }
        $rows[] = $row;
    }
    return $rows;
}
