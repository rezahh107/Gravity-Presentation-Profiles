<?php
/** Experimental read-only boundary. No routes, shortcode, UI, or workflow writes. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

function ciq_host_version_qualified( $version ) {
    return is_string( $version ) && '3.1.0' === $version;
}
function ciq_entries( $scope = array() ) {
    if ( ! ciq_host_version_qualified( defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null ) ) {
        return new WP_Error( 'ciq2_unsupported_host_version' );
    }
    if ( ! is_user_logged_in() ) { return new WP_Error( 'authentication_required' ); }
    // Server-owned identity and form scope. Never trust browser filter_key/user_id.
    $scope = array_intersect_key( $scope, array( 'form_id' => true ) );
    $entries = array();
    $expected = null;
    $batch_size = 40;
    // Explicit operational safety bound, not a hidden 500-task truncation.
    // A larger authorized Inbox fails closed rather than claiming a complete list.
    $max_tasks = 2000;
    $GLOBALS['ciq_query_paging'] = array();
    for ( $offset = 0; $offset < $max_tasks; $offset += $batch_size ) {
        $args = $scope;
        $args['paging'] = array( 'offset' => $offset, 'page_size' => $batch_size );
        $args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), $args ) );
        $total = 0;
        $page = Gravity_Flow_API::get_inbox_entries( $args, $total );
        $GLOBALS['ciq_query_paging'][] = array( 'offset' => $offset, 'page_size' => $batch_size );
        if ( is_wp_error( $page ) || ! is_array( $page ) || count( $page ) > $batch_size ) {
            return new WP_Error( 'host_query_failed' );
        }
        if ( null === $expected ) { $expected = (int) $total; }
        if ( $expected < 0 || $expected > $max_tasks || (int) $total !== $expected
            || ( empty( $page ) && $offset < $expected ) ) {
            return new WP_Error( 'unstable_or_incomplete_task_set' );
        }
        foreach ( $page as $entry ) {
            $id = (int) ( $entry['id'] ?? 0 );
            if ( $id < 1 || isset( $entries[ $id ] ) ) { return new WP_Error( 'invalid_identity' ); }
            $entries[ $id ] = $entry;
        }
        if ( count( $entries ) === $expected ) { return array_values( $entries ); }
    }
    return new WP_Error( 'task_set_bound_exceeded' );
}

function ciq_project( $entries, $skip_denied = false ) {
    if ( is_wp_error( $entries ) ) { return $entries; }
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    if ( ! is_callable( array( 'Gravity_Flow_Entry_Detail', 'is_permission_granted' ) ) ) {
        return new WP_Error( 'ciq2_native_detail_permission_contract_changed' );
    }
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
        if ( ! $allowed ) {
            if ( $skip_denied ) {
                // A single rejected entry is omitted only after the top-level
                // authenticated task query succeeded. Never leak its fields.
                error_log( 'CIQ_PROTOTYPE_ROW_OMITTED: native entry permission denied' );
                continue;
            }
            return new WP_Error( 'native_entry_access_denied' );
        }
        // Membership came from the host Inbox query; this independently
        // proves current Officer Approval-step actionability, not merely Detail access.
        $actionable = $step instanceof Gravity_Flow_Step_Approval
            && $step->is_active() && $step->is_user_assignee();
        $row = array( 'id' => (int) $entry['id'], 'form_id' => (int) $entry['form_id'],
            'step_id' => (int) $step->get_id(), 'actionable' => $actionable, 'fields' => array() );
        // Only the spike's mapped simple text fields on current assignee Approval
        // are qualified. No fallback for administrator, User Input, or unknown form.
        if ( (int) ( $fixture['form_id'] ?? 0 ) === (int) $entry['form_id']
            && $actionable && ! has_filter( 'gform_field_content' ) ) {
            foreach ( array( 1, 2, 3, 4 ) as $id ) {
                $field = GFFormsModel::get_field( $form, $id );
                if ( ! $field || 'text' !== $field->type ) { continue; }
                if ( Gravity_Flow_Common::is_display_field( $field, $step, $form, $entry )
                    && isset( $entry[ (string) $id ] ) && '' !== $entry[ (string) $id ] ) {
                    // Preserve native value masking as well as field visibility.
                    // Final arbitrary HTML transformations have no qualified text
                    // projection here; their presence omits fields above.
                    $value = Gravity_Flow_Entry_Detail::get_display_value(
                        RGFormsModel::get_lead_field_value( $entry, $field ), $field, $entry, $form
                    );
                    if ( is_string( $value ) && '' !== $value ) {
                        $row['fields'][ (string) $id ] = html_entity_decode( wp_strip_all_tags( $value ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
                    }
                }
            }
        }
        $rows[] = $row;
    }
    return $rows;
}
