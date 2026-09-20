<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;

/**
 * WU18 Timeline semantic probe/guard.
 *
 * This deliberately runs inside the existing pinned WordPress + Gravity Flow
 * evidence path so event semantics are derived from the qualified host rather
 * than from guessed DOM text. Only synthetic fixture values and machine
 * metadata are recorded.
 */

if ( ! isset( $artifact_dir, $manifest ) || ! is_array( $manifest ) || empty( $manifest['alpha'] ) ) {
    throw new RuntimeException( 'WU18 Timeline semantic runtime context is unavailable.' );
}

$alpha_entry = GFAPI::get_entry( (int) $manifest['alpha']['entry_id'] );
if ( is_wp_error( $alpha_entry ) ) {
    throw new RuntimeException( $alpha_entry->get_error_message() );
}

$notes = Gravity_Flow_Common::get_timeline_notes( $alpha_entry );
if ( ! is_array( $notes ) || array() === $notes ) {
    throw new RuntimeException( 'WU18 native Timeline notes are unavailable.' );
}

$note_facts = array();
foreach ( $notes as $note ) {
    if ( ! is_object( $note ) ) {
        continue;
    }
    $note_facts[] = array(
        'id' => isset( $note->id ) ? (int) $note->id : null,
        'note_type' => isset( $note->note_type ) ? (string) $note->note_type : null,
        'sub_type' => isset( $note->sub_type ) ? (string) $note->sub_type : null,
        'user_id' => isset( $note->user_id ) ? (string) $note->user_id : null,
        'user_name' => isset( $note->user_name ) ? (string) $note->user_name : null,
        'value' => isset( $note->value ) ? (string) $note->value : null,
    );
}

$method_source = static function ( $class, $method_name ) {
    if ( ! class_exists( $class ) ) {
        return array( 'class' => $class, 'method' => $method_name, 'exists' => false, 'lines' => array() );
    }
    $reflection = new ReflectionClass( $class );
    if ( ! $reflection->hasMethod( $method_name ) ) {
        return array( 'class' => $class, 'method' => $method_name, 'exists' => false, 'lines' => array() );
    }
    $method = $reflection->getMethod( $method_name );
    $file = $method->getFileName();
    if ( ! is_string( $file ) || ! is_file( $file ) ) {
        return array( 'class' => $class, 'method' => $method_name, 'exists' => true, 'lines' => array() );
    }
    $source = file( $file, FILE_IGNORE_NEW_LINES );
    $selected = array();
    for ( $line = $method->getStartLine(); $line <= $method->getEndLine(); $line++ ) {
        if ( ! isset( $source[ $line - 1 ] ) ) {
            continue;
        }
        $text = trim( $source[ $line - 1 ] );
        foreach ( array( 'add_timeline_note', 'Approved', 'Sent to step', 'user_id', 'user_name', 'log_activity', 'log_event', 'log_value', 'step_id' ) as $needle ) {
            if ( false !== strpos( $text, $needle ) ) {
                $selected[] = array( 'line' => $line, 'text' => $text );
                break;
            }
        }
    }
    return array(
        'class' => $class,
        'method' => $method_name,
        'exists' => true,
        'file' => basename( $file ),
        'start_line' => $method->getStartLine(),
        'end_line' => $method->getEndLine(),
        'lines' => $selected,
    );
};

$sources = array(
    $method_source( 'Gravity_Flow_API', 'add_timeline_note' ),
    $method_source( 'Gravity_Flow_API', 'send_to_step' ),
    $method_source( 'Gravity_Flow_API', 'log_activity' ),
    $method_source( 'Gravity_Flow_Step_Approval', 'add_status_update_note' ),
    $method_source( 'Gravity_Flow_Step_Approval', 'process_assignee_status' ),
);

$workflow_submitted = null;
$synthetic_control = null;
foreach ( $notes as $note ) {
    $value = isset( $note->value ) ? trim( (string) $note->value ) : '';
    if ( 'Workflow Submitted' === $value ) {
        $workflow_submitted = $note;
    }
    if ( 'Synthetic dossier review opened.' === $value ) {
        $synthetic_control = $note;
    }
}

wu18_assert( is_object( $workflow_submitted ), 'Authentic Workflow Submitted Timeline event is missing from the pinned fixture.' );
wu18_assert( is_object( $synthetic_control ), 'Synthetic human-visible unknown Timeline control is missing from the pinned fixture.' );

$reflection = new ReflectionClass( EntryDetailTimelineSemanticPresentation::class );
$classify = $reflection->getMethod( 'classify' );
$classify->setAccessible( true );
$steps = ( new Gravity_Flow_API( (int) $manifest['alpha']['form_id'] ) )->get_steps();
if ( ! is_array( $steps ) ) {
    $steps = array();
}

$system_result = $classify->invoke( null, $workflow_submitted, $steps );
$unknown_result = $classify->invoke( null, $synthetic_control, $steps );

wu18_assert( is_array( $system_result ) && 'system' === $system_result['family'], 'Authentic Workflow Submitted event did not classify as system.' );
wu18_assert( is_array( $unknown_result ) && 'unknown' === $unknown_result['family'], 'Unmapped synthetic Timeline event did not remain neutral/unknown.' );

// Falsification: a human-looking note that contains tempting semantic keywords
// must remain unknown. This proves the classifier is not a broad keyword parser.
$misleading = clone $synthetic_control;
$misleading->value = 'Synthetic note says Approved. Sent to step: Review, but is not a proven host event.';
$misleading_result = $classify->invoke( null, $misleading, $steps );
wu18_assert( is_array( $misleading_result ) && 'unknown' === $misleading_result['family'], 'Misleading keyword Timeline note was falsely classified.' );

$probe = array(
    'schema_version' => '1.0.0',
    'gravity_flow_version' => defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : null,
    'notes' => $note_facts,
    'selected_host_method_source' => $sources,
    'classification_probe' => array(
        'workflow_submitted' => $system_result,
        'native_unknown' => $unknown_result,
        'misleading_keyword_falsification' => $misleading_result,
    ),
);

file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-timeline-semantic-probe.json',
    wp_json_encode( $probe, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_TIMELINE_SEMANTIC_PROBE_PASS\n";
