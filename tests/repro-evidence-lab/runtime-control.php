<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

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

function wu17_binding_lifecycle() {
    return new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array( 'wu21:synthetic-fixture', 'wu21:reproducible-simulation' ) )
    );
}

function wu17_reset_presentation_cache() {
    InboxPresentationAdapter::resetRuntimeCache();
}

function wu17_find_form_binding_artifact( $state, $form_id ) {
    foreach ( $state['installed'] as $versions ) {
        foreach ( $versions as $record ) {
            if ( isset( $record['artifact']['context']['form_source_ref']['form_id'] )
                && (int) $record['artifact']['context']['form_source_ref']['form_id'] === (int) $form_id ) {
                return $record['artifact'];
            }
        }
    }
    throw new RuntimeException( 'Active fixture binding artifact not found for form.' );
}

function wu17_backup_binding_state( $option_name ) {
    $state = get_option( BindingSetLifecycle::OPTION_NAME );
    if ( ! is_array( $state ) ) {
        throw new RuntimeException( 'Binding lifecycle state unavailable.' );
    }
    if ( false !== get_option( $option_name, false ) ) {
        throw new RuntimeException( 'WU17 scenario backup already exists: ' . $option_name );
    }
    update_option( $option_name, $state, false );
    return $state;
}

function wu17_restore_binding_state( $option_name ) {
    $backup = get_option( $option_name, false );
    if ( ! is_array( $backup ) ) {
        throw new RuntimeException( 'WU17 scenario backup is missing: ' . $option_name );
    }
    update_option( BindingSetLifecycle::OPTION_NAME, $backup, false );
    delete_option( $option_name );
    wu17_reset_presentation_cache();
}

if ( 'add' === $action ) {
    $entry = array(
        'form_id' => (int) $form['form_id'],
        'created_by' => (int) $manifest['operator']['id'],
        (string) $form['name_field_id'] => 'WU21 Refresh Student',
        (string) $form['national_id_field_id'] => 'SYN-A-REFRESH',
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

if ( 'zero-bindings-on' === $action ) {
    $state = wu17_backup_binding_state( 'gpp_wu17_zero_bindings_backup' );
    $state['activations'] = array();
    update_option( BindingSetLifecycle::OPTION_NAME, $state, false );
    wu17_reset_presentation_cache();
    echo 'zero-bindings-on';
    return;
}
if ( 'zero-bindings-off' === $action ) {
    wu17_restore_binding_state( 'gpp_wu17_zero_bindings_backup' );
    echo 'zero-bindings-off';
    return;
}

if ( 'required-not-proven-on' === $action ) {
    $state = wu17_backup_binding_state( 'gpp_wu17_required_not_proven_backup' );
    $candidate = wu17_find_form_binding_artifact( $state, (int) $manifest['forms'][0]['form_id'] );
    $candidate['binding_set_id'] = 'wu17.sim.alpha.required-not-proven';
    foreach ( $candidate['bindings'] as &$binding ) {
        if ( 'student.national_id' === $binding['semantic_slot_key'] ) {
            $binding['state'] = 'NOT_PROVEN';
            $binding['source_ref'] = null;
            $binding['evidence_refs'] = array( 'wu21:fail-closed-negative-control' );
        }
    }
    unset( $binding );
    foreach ( $candidate['runtime_claims'] as &$claim ) {
        if ( 'student.national_id' === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
            $claim['evidence_state'] = 'NOT_PROVEN';
            $claim['evidence_refs'] = array( 'wu21:fail-closed-negative-control' );
        }
    }
    unset( $claim );

    $lifecycle = wu17_binding_lifecycle();
    $lifecycle->import( $candidate );
    $lifecycle->activate(
        array(
            'context' => $candidate['context'],
            'binding_set_id' => $candidate['binding_set_id'],
            'binding_set_version' => $candidate['binding_set_version'],
        )
    );
    wu17_reset_presentation_cache();
    echo 'required-not-proven-on';
    return;
}
if ( 'required-not-proven-off' === $action ) {
    wu17_restore_binding_state( 'gpp_wu17_required_not_proven_backup' );
    echo 'required-not-proven-off';
    return;
}

if ( 'ambiguous-environment-on' === $action ) {
    $state = wu17_backup_binding_state( 'gpp_wu17_ambiguous_environment_backup' );
    $candidate = wu17_find_form_binding_artifact( $state, (int) $manifest['forms'][0]['form_id'] );
    $candidate['binding_set_id'] = 'wu17.sim.alpha.ambiguous';
    $candidate['context']['installation_source_ref']['installation_id'] = 'wu17-ambiguous-installation';

    $lifecycle = wu17_binding_lifecycle();
    $lifecycle->import( $candidate );
    $lifecycle->activate(
        array(
            'context' => $candidate['context'],
            'binding_set_id' => $candidate['binding_set_id'],
            'binding_set_version' => $candidate['binding_set_version'],
        )
    );
    wu17_reset_presentation_cache();
    echo 'ambiguous-environment-on';
    return;
}
if ( 'ambiguous-environment-off' === $action ) {
    wu17_restore_binding_state( 'gpp_wu17_ambiguous_environment_backup' );
    echo 'ambiguous-environment-off';
    return;
}

if ( 'add-unbound' === $action ) {
    if ( false !== get_option( 'gpp_wu17_unbound_fixture', false ) ) {
        throw new RuntimeException( 'WU17 unbound fixture already exists.' );
    }
    $unbound_form = array(
        'title' => 'WU17 Unbound Form',
        'description' => 'Synthetic WU17 native-fallback negative control.',
        'labelPlacement' => 'top_label',
        'fields' => array(
            array( 'id' => 1, 'label' => 'Student Name', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => 2, 'label' => 'Student Photo', 'type' => 'fileupload', 'isRequired' => false ),
            array( 'id' => 3, 'label' => 'Synthetic National ID', 'type' => 'text', 'isRequired' => true ),
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
            'description' => 'Synthetic WU17 unbound approval step.',
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
            '1' => 'WU17 Unbound Student',
            '3' => 'SYN-U-000001',
        )
    );
    if ( is_wp_error( $entry_id ) ) {
        GFAPI::delete_form( (int) $form_id );
        throw new RuntimeException( $entry_id->get_error_message() );
    }
    GFAPI::update_entry_property( $entry_id, 'date_created', '2026-01-03 00:00:00' );
    $api->process_workflow( $entry_id );
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
