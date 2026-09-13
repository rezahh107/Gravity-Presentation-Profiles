<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}
$action = getenv( 'WU21_CONTROL' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $manifest ) ) {
    throw new RuntimeException( 'WU21 fixture manifest is unavailable.' );
}
$form = $manifest['forms'][0];

function wu21_polling_event( $event ) {
    $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
    if ( ! $artifact_dir ) {
        return;
    }
    $event['observed_at_utc'] = gmdate( 'c' );
    file_put_contents(
        trailingslashit( $artifact_dir ) . 'polling-server-events.jsonl',
        wp_json_encode( $event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n",
        FILE_APPEND
    );
}

if ( 'add' === $action ) {
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['name_field_id'] => 'WU21 Refresh Student',
    );
    $id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    GFAPI::update_entry_property( $id, 'date_created', '2026-01-02 00:00:00' );
    $api = new Gravity_Flow_API( (int) $form['form_id'] );
    $api->process_workflow( $id );
    update_option( 'gpp_wu21_refresh_entry_id', (int) $id, false );

    $created_entry = GFAPI::get_entry( $id );
    $current_step = is_wp_error( $created_entry ) ? null : $api->get_current_step( $created_entry );
    $operator_id = (int) $manifest['operator']['id'];
    $total = 0;
    $assigned_entries = Gravity_Flow_API::get_inbox_entries(
        array(
            'filter_key' => 'workflow_user_id_' . $operator_id,
            'user_id' => $operator_id,
            'paging' => array( 'page_size' => 100 ),
        ),
        $total
    );
    $assigned_ids = array_map(
        function ( $candidate ) {
            return (int) $candidate['id'];
        },
        $assigned_entries
    );

    wu21_polling_event( array(
        'event' => 'mutation_add',
        'created_task_id' => (int) $id,
        'form_id' => (int) $form['form_id'],
        'created_by' => $operator_id,
        'current_step_id' => $current_step ? (int) $current_step->get_id() : null,
        'current_step_name' => $current_step ? (string) $current_step->get_name() : null,
        'assignment_filter_key' => 'workflow_user_id_' . $operator_id,
        'assignment_user_id' => $operator_id,
        'assignment_total' => (int) $total,
        'created_task_visible_to_assignment_query' => in_array( (int) $id, $assigned_ids, true ),
    ) );

    echo (int) $id;
    return;
}
if ( 'remove' === $action ) {
    $id = (int) get_option( 'gpp_wu21_refresh_entry_id' );
    if ( $id ) {
        GFAPI::delete_entry( $id );
        delete_option( 'gpp_wu21_refresh_entry_id' );
    }
    wu21_polling_event( array(
        'event' => 'mutation_remove',
        'created_task_id' => $id,
    ) );
    echo $id;
    return;
}
throw new RuntimeException( 'Unknown WU21_CONTROL action.' );
