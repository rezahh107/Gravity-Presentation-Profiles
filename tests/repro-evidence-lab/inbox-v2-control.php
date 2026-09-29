<?php
/**
 * Fixed-action controller for INBOX_VISUAL_DESIGN_V2 disposable WU21 fixtures.
 * No production path loads this file.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$action = (string) getenv( 'GPP_INBOX_V2_ACTION' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $manifest ) ) {
    throw new RuntimeException( 'WU21 fixture manifest unavailable.' );
}

function gpp_inbox_v2_process_task( $form_id, $entry_id ) {
    $api = new Gravity_Flow_API( (int) $form_id );
    $api->process_workflow( (int) $entry_id );
    $entry = GFAPI::get_entry( (int) $entry_id );
    if ( is_wp_error( $entry ) || ! $api->get_current_step( $entry ) ) {
        throw new RuntimeException( 'Synthetic task did not reach an active Gravity Flow step.' );
    }
}

switch ( $action ) {
    case 'q1_setup':
        foreach ( $manifest['forms'] as $form_record ) {
            $form = GFAPI::get_form( (int) $form_record['form_id'] );
            $exists = false;
            foreach ( $form['fields'] as $field ) {
                if ( '50' === (string) $field->id ) {
                    $exists = true;
                    break;
                }
            }
            if ( ! $exists ) {
                $form['fields'][] = GF_Fields::create( array( 'type' => 'text', 'id' => 50, 'label' => 'Q1 Rich Probe' ) );
                $result = GFAPI::update_form( $form );
                if ( is_wp_error( $result ) ) {
                    throw new RuntimeException( $result->get_error_message() );
                }
            }
        }
        $i = 0;
        foreach ( $manifest['entry_records'] as $record ) {
            $entry = GFAPI::get_entry( (int) $record['entry_id'] );
            if ( is_wp_error( $entry ) ) {
                throw new RuntimeException( $entry->get_error_message() );
            }
            $entry['50'] = 0 === $i ? 'Q1-UNSAFE' : sprintf( 'Q1-RAW-%02d', $i );
            $result = GFAPI::update_entry( $entry );
            if ( is_wp_error( $result ) ) {
                throw new RuntimeException( $result->get_error_message() );
            }
            ++$i;
        }
        update_option( 'gpp_inbox_visual_design_v2_q1_enabled', '1', false );
        echo wp_json_encode( array( 'forms' => array_column( $manifest['forms'], 'form_id' ), 'entries' => count( $manifest['entry_records'] ) ) );
        break;

    case 'q1_cleanup':
        update_option( 'gpp_inbox_visual_design_v2_q1_enabled', '0', false );
        $entry_id = absint( getenv( 'GPP_INBOX_V2_ENTRY_ID' ) );
        if ( $entry_id ) {
            GFAPI::delete_entry( $entry_id );
        }
        echo 'OK';
        break;

    case 'q1_update':
        $entry_id = absint( getenv( 'GPP_INBOX_V2_ENTRY_ID' ) );
        $entry = GFAPI::get_entry( $entry_id );
        if ( is_wp_error( $entry ) ) {
            throw new RuntimeException( $entry->get_error_message() );
        }
        $entry['50'] = 'Q1-UPDATED';
        $result = GFAPI::update_entry( $entry );
        if ( is_wp_error( $result ) ) {
            throw new RuntimeException( $result->get_error_message() );
        }
        echo $entry_id;
        break;

    case 'q1_add':
        $form = $manifest['forms'][0];
        $entry = array(
            'form_id' => (int) $form['form_id'],
            'created_by' => (int) $manifest['operator']['id'],
            (string) $form['first_name_field_id'] => 'Q1 Added',
            (string) $form['last_name_field_id'] => 'Student',
            (string) $form['national_id_field_id'] => 'SYN-Q1-ADDED',
            (string) $form['grade_group_field_id'] => 'پایه آزمایشی',
            (string) $form['school_field_id'] => 'مدرسه آزمایشی',
            '50' => 'Q1-ADDED',
        );
        $entry_id = GFAPI::add_entry( $entry );
        if ( is_wp_error( $entry_id ) ) {
            throw new RuntimeException( $entry_id->get_error_message() );
        }
        GFAPI::update_entry_property( $entry_id, 'date_created', '2025-12-31 23:59:00' );
        gpp_inbox_v2_process_task( $form['form_id'], $entry_id );
        echo (int) $entry_id;
        break;

    case 'q1_raw_snapshot':
        $ids = json_decode( (string) getenv( 'GPP_INBOX_V2_ENTRY_IDS' ), true );
        if ( ! is_array( $ids ) ) {
            throw new RuntimeException( 'Entry ID list is invalid.' );
        }
        $out = array();
        foreach ( $ids as $id ) {
            $entry = GFAPI::get_entry( (int) $id );
            if ( ! is_wp_error( $entry ) ) {
                $out[ (string) (int) $id ] = isset( $entry['50'] ) ? (string) $entry['50'] : '';
            }
        }
        echo wp_json_encode( $out );
        break;

    case 'q4_update':
        $entry_id = absint( getenv( 'GPP_INBOX_V2_ENTRY_ID' ) );
        GFAPI::update_entry_property( $entry_id, 'date_created', '2026-01-01 00:30:30' );
        echo $entry_id;
        break;

    case 'q4_add':
        $form = $manifest['forms'][0];
        $entry = array(
            'form_id' => (int) $form['form_id'],
            'created_by' => (int) $manifest['operator']['id'],
            (string) $form['first_name_field_id'] => 'Q4 Added',
            (string) $form['last_name_field_id'] => 'Student',
            (string) $form['national_id_field_id'] => 'SYN-Q4-ADDED',
            (string) $form['grade_group_field_id'] => 'پایه آزمایشی',
            (string) $form['school_field_id'] => 'مدرسه آزمایشی',
        );
        $entry_id = GFAPI::add_entry( $entry );
        if ( is_wp_error( $entry_id ) ) {
            throw new RuntimeException( $entry_id->get_error_message() );
        }
        GFAPI::update_entry_property( $entry_id, 'date_created', '2025-01-01 00:00:00' );
        gpp_inbox_v2_process_task( $form['form_id'], $entry_id );
        echo (int) $entry_id;
        break;

    case 'delete_entry':
        $entry_id = absint( getenv( 'GPP_INBOX_V2_ENTRY_ID' ) );
        if ( $entry_id ) {
            GFAPI::delete_entry( $entry_id );
        }
        echo $entry_id;
        break;

    default:
        throw new RuntimeException( 'Unknown GPP_INBOX_V2_ACTION.' );
}
