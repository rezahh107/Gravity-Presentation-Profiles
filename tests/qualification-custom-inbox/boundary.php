<?php
/** Experimental read-only boundary. No routes, shortcode, UI, or workflow writes. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

function ciq_host_version_qualified( $version ) {
    return is_string( $version ) && '3.1.0' === $version;
}
/**
 * Public, documented Inbox membership read. Default 40-row batches are the
 * historical PR169 path; Inbox 2 passes max+1 so a complete set comes from a
 * single host statement instead of an offset scan (not an atomic snapshot).
 */
function ciq_entries( $scope = array(), $batch_size = 40 ) {
    if ( ! ciq_host_version_qualified( defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null ) ) {
        return new WP_Error( 'ciq2_unsupported_host_version' );
    }
    if ( ! is_user_logged_in() ) { return new WP_Error( 'authentication_required' ); }
    // Server-owned identity and form scope. Never trust browser filter_key/user_id.
    $scope = array_intersect_key( $scope, array( 'form_id' => true ) );
    $entries = array();
    $expected = null;
    // Explicit operational safety bound, not a hidden 500-task truncation.
    // A larger authorized Inbox fails closed rather than claiming a complete list.
    $max_tasks = 2000;
    $batch_size = (int) $batch_size;
    if ( $batch_size < 1 || $batch_size > $max_tasks + 1 ) {
        return new WP_Error( 'host_query_failed' );
    }
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
        if ( $expected > $max_tasks ) { return new WP_Error( 'task_set_bound_exceeded' ); }
        if ( $expected < 0 || (int) $total !== $expected
            || ( empty( $page ) && $offset < $expected ) ) {
            return new WP_Error( 'unstable_or_incomplete_task_set' );
        }
        // A host `gravityflow_inbox_paging` filter that shrinks the page would make
        // the next offset skip tasks. Detect it instead of reporting a partial set.
        if ( count( $page ) < min( $batch_size, $expected - $offset ) ) {
            return new WP_Error( 'host_page_size_reduced' );
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

/**
 * Legacy PR169/PR170 callers retain their native Entry Detail permission and
 * optional field-projection checks. Inbox 2 requests `$native_selection` to
 * consume ONLY entries selected by the authenticated Native Inbox query; its
 * visible cells are independently provided by the Native Task Model and
 * reconciled by exact task ID in cellq_rows().
 *
 * Native Inbox list visibility does NOT depend on Entry Detail permission.
 * Leave Detail authorization to the native Detail route and actions.
 */
function ciq_project( $entries, $skip_denied = false, $with_fields = true, $native_selection = false ) {
    if ( is_wp_error( $entries ) ) { return $entries; }
    if ( $native_selection ) {
        // List selection is already constrained by the authenticated native
        // Gravity Flow Inbox. Do not call Entry Detail authorization, step
        // eligibility or Detail-only pre_render filters on this card path.
        $rows = array();
        foreach ( $entries as $entry ) {
            if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
                return new WP_Error( 'invalid_identity' );
            }
            $rows[] = array(
                'id' => (int) $entry['id'],
                'form_id' => (int) $entry['form_id'],
                'step_id' => (int) ( $entry['workflow_step'] ?? 0 ),
                'fields' => array(),
            );
        }
        return $rows;
    }
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
        if ( ! $form ) { return new WP_Error( 'current_task_not_proven' ); }
        if ( ! $step ) { return new WP_Error( 'current_task_not_proven' ); }
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
        // Legacy PR169/PR170 contract: membership came from the host Inbox query;
        // this independently proves current Officer Approval-step actionability.
        $actionable = $step instanceof Gravity_Flow_Step_Approval
            && $step->is_active() && $step->is_user_assignee();
        $row = array( 'id' => (int) $entry['id'], 'form_id' => (int) $entry['form_id'],
            'step_id' => (int) $step->get_id(), 'actionable' => $actionable, 'fields' => array() );
        // Only the spike's mapped simple text fields on current assignee Approval
        // are qualified. No fallback for administrator, User Input, or unknown form.
        if ( $with_fields && (int) ( $fixture['form_id'] ?? 0 ) === (int) $entry['form_id']
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
