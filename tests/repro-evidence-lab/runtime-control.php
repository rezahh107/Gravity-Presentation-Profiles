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

function wu21_process_task( $form_id, $entry_id ) {
    $api = new Gravity_Flow_API( (int) $form_id );
    $api->process_workflow( (int) $entry_id );
    $entry = GFAPI::get_entry( (int) $entry_id );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    $step = $api->get_current_step( $entry );
    if ( ! $step ) {
        throw new RuntimeException( 'Synthetic task did not reach an active Gravity Flow step.' );
    }
    return $step;
}

if ( 'add' === $action ) {
    $seed_entry = GFAPI::get_entry( (int) $manifest['entry_records'][0]['entry_id'] );
    if ( is_wp_error( $seed_entry ) ) {
        throw new RuntimeException( $seed_entry->get_error_message() );
    }
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['first_name_field_id'] => 'WU21 Refresh',
        (string) $form['last_name_field_id'] => 'Student',
        (string) $form['photo_field_id'] => isset( $seed_entry[ (string) $form['photo_field_id'] ] ) ? $seed_entry[ (string) $form['photo_field_id'] ] : '',
        (string) $form['national_id_field_id'] => 'SYN-A-REFRESH',
        (string) $form['grade_group_field_id'] => 'پایه دوازدهم — گروه بازآوری',
        (string) $form['school_field_id'] => 'دبیرستان بازآوری آزمایشی',
    );
    $id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    GFAPI::update_entry_property( $id, 'date_created', '2026-01-02 00:00:00' );
    $current_step = wu21_process_task( $form['form_id'], $id );
    update_option( 'gpp_wu21_refresh_entry_id', (int) $id, false );

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
    $assigned_ids = array_map( static function ( $candidate ) { return (int) $candidate['id']; }, $assigned_entries );
    wu21_polling_event(
        array(
            'event' => 'mutation_add',
            'created_task_id' => (int) $id,
            'form_id' => (int) $form['form_id'],
            'created_by' => $operator_id,
            'current_step_id' => (int) $current_step->get_id(),
            'current_step_name' => (string) $current_step->get_name(),
            'assignment_total' => (int) $total,
            'created_task_visible_to_assignment_query' => in_array( (int) $id, $assigned_ids, true ),
        )
    );
    echo (int) $id;
    return;
}

if ( 'remove' === $action ) {
    $id = (int) get_option( 'gpp_wu21_refresh_entry_id' );
    if ( $id ) {
        GFAPI::delete_entry( $id );
        delete_option( 'gpp_wu21_refresh_entry_id' );
    }
    wu21_polling_event( array( 'event' => 'mutation_remove', 'created_task_id' => $id ) );
    echo $id;
    return;
}

if ( 'add-unbound' === $action ) {
    if ( false !== get_option( 'gpp_wu17_unbound_fixture', false ) ) {
        throw new RuntimeException( 'WU17 unbound fixture already exists.' );
    }
    $unbound_form = array(
        'title' => 'WU17 Unbound Form',
        'description' => 'Synthetic authentic host task with deliberately no GPP binding context.',
        'labelPlacement' => 'top_label',
        'fields' => array(
            array( 'id' => 1, 'label' => 'First Name', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => 2, 'label' => 'Last Name', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => 3, 'label' => 'National ID', 'type' => 'text', 'isRequired' => true ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    );
    $form_id = GFAPI::add_form( $unbound_form );
    if ( is_wp_error( $form_id ) ) {
        throw new RuntimeException( $form_id->get_error_message() );
    }
    $api = new Gravity_Flow_API( (int) $form_id );
    $step_id = $api->add_step(
        array(
            'step_name' => 'WU17 Unbound Review',
            'step_type' => 'approval',
            'description' => 'Synthetic unbound task for native fallback evidence.',
            'type' => 'select',
            'assignees' => array( 'user_id|' . (int) $manifest['operator']['id'] ),
            'assignee_policy' => 'all',
            'instructions' => 'Synthetic native-fallback evidence only.',
        )
    );
    if ( ! $step_id || is_wp_error( $step_id ) ) {
        GFAPI::delete_form( (int) $form_id );
        throw new RuntimeException( 'Unable to create WU17 unbound Gravity Flow step.' );
    }
    $entry_id = GFAPI::add_entry(
        array(
            'form_id' => (int) $form_id,
            'created_by' => (int) $manifest['operator']['id'],
            '1' => 'WU17 Unbound',
            '2' => 'Student',
            '3' => 'SYN-U-000001',
        )
    );
    if ( is_wp_error( $entry_id ) ) {
        GFAPI::delete_form( (int) $form_id );
        throw new RuntimeException( $entry_id->get_error_message() );
    }
    GFAPI::update_entry_property( $entry_id, 'date_created', '2026-01-03 00:00:00' );
    $api->process_workflow( $entry_id );
    $current = $api->get_current_step( GFAPI::get_entry( $entry_id ) );
    if ( ! $current ) {
        GFAPI::delete_entry( (int) $entry_id );
        GFAPI::delete_form( (int) $form_id );
        throw new RuntimeException( 'Unbound host task did not reach the approval step.' );
    }
    update_option(
        'gpp_wu17_unbound_fixture',
        array( 'form_id' => (int) $form_id, 'entry_id' => (int) $entry_id, 'step_id' => (int) $step_id ),
        false
    );
    echo (int) $entry_id;
    return;
}

if ( 'remove-unbound' === $action ) {
    $fixture = get_option( 'gpp_wu17_unbound_fixture', false );
    if ( is_array( $fixture ) ) {
        if ( ! empty( $fixture['entry_id'] ) ) {
            GFAPI::delete_entry( (int) $fixture['entry_id'] );
        }
        if ( ! empty( $fixture['form_id'] ) ) {
            GFAPI::delete_form( (int) $fixture['form_id'] );
        }
        delete_option( 'gpp_wu17_unbound_fixture' );
    }
    echo is_array( $fixture ) && isset( $fixture['entry_id'] ) ? (int) $fixture['entry_id'] : 0;
    return;
}

throw new RuntimeException( 'Unknown WU21_CONTROL action.' );
