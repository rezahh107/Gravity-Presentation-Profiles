<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$action = getenv( 'WU21_INBOX_V2_ACTION' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['forms'] ) || empty( $manifest['entry_records'] ) ) {
    throw new RuntimeException( 'WU21 fixture manifest is unavailable.' );
}

function gpp_wu21_v2_json( $value ) {
    echo wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}

function gpp_wu21_v2_form_for_id( $manifest, $form_id ) {
    foreach ( $manifest['forms'] as $form ) {
        if ( (int) $form['form_id'] === (int) $form_id ) {
            return $form;
        }
    }
    throw new RuntimeException( 'Synthetic form not found in WU21 manifest.' );
}

function gpp_wu21_v2_entry( $entry_id ) {
    $entry = GFAPI::get_entry( (int) $entry_id );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    return $entry;
}

function gpp_wu21_v2_set_field( $entry_id, $field_id, $value ) {
    $entry = gpp_wu21_v2_entry( $entry_id );
    $entry[ (string) $field_id ] = $value;
    $result = GFAPI::update_entry( $entry );
    if ( is_wp_error( $result ) ) {
        throw new RuntimeException( $result->get_error_message() );
    }
}

function gpp_wu21_v2_process_task( $form_id, $entry_id ) {
    $api = new Gravity_Flow_API( (int) $form_id );
    $api->process_workflow( (int) $entry_id );
    $entry = gpp_wu21_v2_entry( $entry_id );
    $step = $api->get_current_step( $entry );
    if ( ! $step ) {
        throw new RuntimeException( 'Synthetic qualification task did not reach an active Gravity Flow step.' );
    }
    return $step;
}

function gpp_wu21_v2_write_state( $state ) {
    update_option( 'gpp_wu21_inbox_v2_qualification', $state, false );
}

function gpp_wu21_v2_restore_q1( $state ) {
    if ( empty( $state['q1_originals'] ) || ! is_array( $state['q1_originals'] ) ) {
        return;
    }
    foreach ( $state['q1_originals'] as $row ) {
        if ( ! isset( $row['entry_id'], $row['field_id'], $row['value'] ) ) {
            continue;
        }
        gpp_wu21_v2_set_field( $row['entry_id'], $row['field_id'], $row['value'] );
    }
}

if ( 'q1-prepare' === $action || 'q2-enable' === $action ) {
    $form = $manifest['forms'][0];
    $state = array(
        'mode' => 'q2-enable' === $action ? 'q2' : 'q1',
        'form' => $form,
    );

    if ( 'q1-prepare' === $action ) {
        $candidate_ids = array();
        foreach ( $manifest['entry_records'] as $record ) {
            if ( (int) $record['form_id'] === (int) $form['form_id'] ) {
                $candidate_ids[] = (int) $record['entry_id'];
            }
            if ( count( $candidate_ids ) >= 3 ) {
                break;
            }
        }
        if ( count( $candidate_ids ) < 3 ) {
            throw new RuntimeException( 'Q1 requires three synthetic entries in the selected WU21 form.' );
        }
        $tokens = array( 'Q1_RAW_ZETA', 'Q1_RAW_ALPHA', 'Q1_RAW_UNSAFE' );
        $originals = array();
        foreach ( $candidate_ids as $index => $entry_id ) {
            $entry = gpp_wu21_v2_entry( $entry_id );
            $field_id = (string) $form['first_name_field_id'];
            $originals[] = array(
                'entry_id' => $entry_id,
                'field_id' => $field_id,
                'value' => isset( $entry[ $field_id ] ) ? (string) $entry[ $field_id ] : '',
            );
            gpp_wu21_v2_set_field( $entry_id, $field_id, $tokens[ $index ] );
        }
        $state['q1_originals'] = $originals;
        $state['q1_entry_ids'] = array(
            'zeta' => $candidate_ids[0],
            'alpha' => $candidate_ids[1],
            'unsafe' => $candidate_ids[2],
        );
    }

    gpp_wu21_v2_write_state( $state );
    gpp_wu21_v2_json( $state );
    return;
}

if ( 'q1-state' === $action ) {
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    $out = array( 'mode' => $state['mode'] ?? null, 'values' => array() );
    if ( isset( $state['form']['first_name_field_id'], $state['q1_entry_ids'] ) ) {
        $field_id = (string) $state['form']['first_name_field_id'];
        foreach ( $state['q1_entry_ids'] as $name => $entry_id ) {
            $entry = gpp_wu21_v2_entry( $entry_id );
            $out['values'][ $name ] = isset( $entry[ $field_id ] ) ? (string) $entry[ $field_id ] : null;
        }
    }
    gpp_wu21_v2_json( $out );
    return;
}

if ( 'q1-update' === $action ) {
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    if ( empty( $state['q1_entry_ids']['zeta'] ) || empty( $state['form']['first_name_field_id'] ) ) {
        throw new RuntimeException( 'Q1 state is not prepared.' );
    }
    $entry_id = (int) $state['q1_entry_ids']['zeta'];
    gpp_wu21_v2_set_field( $entry_id, $state['form']['first_name_field_id'], 'Q1_RAW_UPDATED' );
    gpp_wu21_v2_json( array( 'entry_id' => $entry_id, 'value' => 'Q1_RAW_UPDATED' ) );
    return;
}

if ( 'q1-add' === $action ) {
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    if ( empty( $state['form'] ) ) {
        throw new RuntimeException( 'Q1 state is not prepared.' );
    }
    $form = $state['form'];
    $seed = gpp_wu21_v2_entry( (int) $manifest['entry_records'][0]['entry_id'] );
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['first_name_field_id'] => 'Q1_RAW_ADD',
        (string) $form['last_name_field_id'] => 'Qualification Add',
        (string) $form['photo_field_id'] => isset( $seed[ (string) $form['photo_field_id'] ] ) ? $seed[ (string) $form['photo_field_id'] ] : '',
        (string) $form['national_id_field_id'] => 'SYN-Q1-ADD',
        (string) $form['grade_group_field_id'] => 'پایه آزمایشی Q1',
        (string) $form['school_field_id'] => 'دبیرستان آزمایشی Q1',
    );
    $entry_id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $entry_id ) ) {
        throw new RuntimeException( $entry_id->get_error_message() );
    }
    GFAPI::update_entry_property( $entry_id, 'date_created', '2026-01-04 00:00:00' );
    gpp_wu21_v2_process_task( $form['form_id'], $entry_id );
    $state['q1_added_entry_id'] = (int) $entry_id;
    gpp_wu21_v2_write_state( $state );
    gpp_wu21_v2_json( array( 'entry_id' => (int) $entry_id ) );
    return;
}

if ( 'q1-cleanup' === $action ) {
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    if ( is_array( $state ) ) {
        gpp_wu21_v2_restore_q1( $state );
        if ( ! empty( $state['q1_added_entry_id'] ) ) {
            GFAPI::delete_entry( (int) $state['q1_added_entry_id'] );
        }
    }
    delete_option( 'gpp_wu21_inbox_v2_qualification' );
    gpp_wu21_v2_json( array( 'cleaned' => true ) );
    return;
}

if ( 'q2-disable' === $action ) {
    delete_option( 'gpp_wu21_inbox_v2_qualification' );
    gpp_wu21_v2_json( array( 'mode' => 'none' ) );
    return;
}

if ( 'q4-update' === $action ) {
    $entry_id = (int) getenv( 'WU21_TARGET_ENTRY_ID' );
    if ( $entry_id <= 0 ) {
        throw new RuntimeException( 'WU21_TARGET_ENTRY_ID is required for q4-update.' );
    }
    $entry = gpp_wu21_v2_entry( $entry_id );
    $form = gpp_wu21_v2_form_for_id( $manifest, $entry['form_id'] );
    $field_id = (string) $form['first_name_field_id'];
    $original = isset( $entry[ $field_id ] ) ? (string) $entry[ $field_id ] : '';
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    if ( ! is_array( $state ) ) {
        $state = array();
    }
    $state['mode'] = 'q4';
    $state['q4_original'] = array( 'entry_id' => $entry_id, 'field_id' => $field_id, 'value' => $original );
    gpp_wu21_v2_write_state( $state );
    $updated = $original . ' Q4U';
    gpp_wu21_v2_set_field( $entry_id, $field_id, $updated );
    gpp_wu21_v2_json( array( 'entry_id' => $entry_id, 'updated_value' => $updated ) );
    return;
}

if ( 'q4-add' === $action ) {
    $form = $manifest['forms'][0];
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['first_name_field_id'] => 'WU21 Q4 Add',
        (string) $form['last_name_field_id'] => 'Synthetic',
        (string) $form['national_id_field_id'] => 'SYN-Q4-ADD',
        (string) $form['grade_group_field_id'] => 'پایه آزمایشی Q4',
        (string) $form['school_field_id'] => 'دبیرستان آزمایشی Q4',
    );
    $entry_id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $entry_id ) ) {
        throw new RuntimeException( $entry_id->get_error_message() );
    }
    GFAPI::update_entry_property( $entry_id, 'date_created', '2026-01-05 00:00:00' );
    gpp_wu21_v2_process_task( $form['form_id'], $entry_id );
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    if ( ! is_array( $state ) ) {
        $state = array();
    }
    $state['mode'] = 'q4';
    $state['q4_added_entry_id'] = (int) $entry_id;
    gpp_wu21_v2_write_state( $state );
    gpp_wu21_v2_json( array( 'entry_id' => (int) $entry_id ) );
    return;
}

if ( 'q4-cleanup' === $action ) {
    $state = get_option( 'gpp_wu21_inbox_v2_qualification', array() );
    if ( is_array( $state ) && ! empty( $state['q4_original'] ) ) {
        $row = $state['q4_original'];
        gpp_wu21_v2_set_field( $row['entry_id'], $row['field_id'], $row['value'] );
    }
    if ( is_array( $state ) && ! empty( $state['q4_added_entry_id'] ) ) {
        GFAPI::delete_entry( (int) $state['q4_added_entry_id'] );
    }
    delete_option( 'gpp_wu21_inbox_v2_qualification' );
    gpp_wu21_v2_json( array( 'cleaned' => true ) );
    return;
}

throw new RuntimeException( 'Unknown WU21_INBOX_V2_ACTION.' );
