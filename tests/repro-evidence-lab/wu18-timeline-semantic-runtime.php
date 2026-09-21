<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;

/**
 * WU18 Timeline semantic/date probe/guard.
 *
 * This deliberately runs inside the existing pinned WordPress + Gravity Flow
 * evidence path so event semantics and date ownership are derived from the
 * qualified host rather than guessed DOM text. Only synthetic fixture values
 * and machine metadata are recorded.
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
    $step = method_exists( 'Gravity_Flow_Common', 'get_timeline_note_step' )
        ? Gravity_Flow_Common::get_timeline_note_step( $note )
        : false;
    $note_facts[] = array(
        'id' => isset( $note->id ) ? (int) $note->id : null,
        'note_type' => isset( $note->note_type ) ? (string) $note->note_type : null,
        'sub_type' => isset( $note->sub_type ) ? (string) $note->sub_type : null,
        'user_id' => isset( $note->user_id ) ? (string) $note->user_id : null,
        'user_name' => isset( $note->user_name ) ? (string) $note->user_name : null,
        'value' => isset( $note->value ) ? (string) $note->value : null,
        'date_created' => isset( $note->date_created ) ? (string) $note->date_created : null,
        'properties' => array_values( array_keys( get_object_vars( $note ) ) ),
        'resolved_step' => is_object( $step )
            ? array(
                'class' => get_class( $step ),
                'id' => method_exists( $step, 'get_id' ) ? (int) $step->get_id() : null,
                'type' => method_exists( $step, 'get_type' ) ? (string) $step->get_type() : null,
                'name' => method_exists( $step, 'get_name' ) ? (string) $step->get_name() : null,
            )
            : null,
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
        foreach ( array( 'add_timeline_note', 'Approved', 'Sent to step', 'note_type', 'sub_type', 'user_id', 'user_name', 'log_activity', 'log_event', 'log_value', 'step_id', 'date_created', 'current_time', 'add_note', 'get_lead_notes', 'format_date' ) as $needle ) {
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
    $method_source( 'Gravity_Flow', 'add_timeline_note' ),
    $method_source( 'GFFormsModel', 'add_note' ),
    $method_source( 'Gravity_Flow_API', 'send_to_step' ),
    $method_source( 'Gravity_Flow_API', 'log_activity' ),
    $method_source( 'Gravity_Flow', 'log_activity' ),
    $method_source( 'Gravity_Flow_Step_Approval', 'add_status_update_note' ),
    $method_source( 'Gravity_Flow_Step_Approval', 'process_assignee_status' ),
    $method_source( 'Gravity_Flow_Common', 'get_timeline_notes' ),
    $method_source( 'Gravity_Flow_Common', 'get_timeline_note_step' ),
    $method_source( 'Gravity_Flow_Entry_Detail', 'get_note_body' ),
    $method_source( 'Gravity_Flow_Entry_Detail', 'get_note_header' ),
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

wu18_assert( defined( 'GRAVITY_FLOW_VERSION' ) && '3.1.0' === GRAVITY_FLOW_VERSION, 'Timeline date qualification requires exact Gravity Flow 3.1.0.' );
wu18_assert( is_object( $workflow_submitted ), 'Authentic Workflow Submitted Timeline event is missing from the pinned fixture.' );
wu18_assert( is_object( $synthetic_control ), 'Synthetic human-visible unknown Timeline control is missing from the pinned fixture.' );
foreach ( $notes as $note ) {
    wu18_assert( isset( $note->date_created ) && is_string( $note->date_created ), 'Native Timeline note is missing raw date_created.' );
    wu18_assert( 1 === preg_match( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D', $note->date_created ), 'Native Timeline date_created shape is not the qualified host datetime shape.' );
}
wu18_assert( (string) $alpha_entry['date_created'] === (string) $workflow_submitted->date_created, 'Workflow Submitted Timeline timestamp is not the authoritative entry date_created value.' );

$source_evidence = wp_json_encode( $sources, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
wu18_assert( false !== strpos( $source_evidence, 'get_lead_notes' ), 'Gravity Flow Timeline source did not prove native Gravity Forms note retrieval.' );
wu18_assert( false !== strpos( $source_evidence, '$note->date_created' ), 'Gravity Flow Entry Detail did not prove raw note date_created reaches the native header formatter.' );
wu18_assert( false !== strpos( $source_evidence, 'format_date' ), 'Gravity Flow did not prove its native date presentation is downstream of raw note date_created.' );

$host_inventory_path = trailingslashit( $artifact_dir ) . 'wu18-host-seam-inventory.json';
$host_inventory = is_file( $host_inventory_path ) ? json_decode( file_get_contents( $host_inventory_path ), true ) : null;
wu18_assert( is_array( $host_inventory ), 'Pinned WU18 host seam inventory is unavailable for Timeline UTC qualification.' );
wu18_assert( '3.1.0' === (string) ( $host_inventory['gravity_flow_version'] ?? '' ), 'Timeline UTC qualification is not bound to exact Gravity Flow 3.1.0 evidence.' );
$host_inventory_evidence = wp_json_encode( $host_inventory, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
wu18_assert( false !== strpos( $host_inventory_evidence, "'date_created' => current_time( 'mysql', true )," ), 'Pinned host seam inventory did not prove Gravity Flow activity timestamps use UTC WordPress time.' );

$reflection = new ReflectionClass( EntryDetailTimelineSemanticPresentation::class );
$classify = $reflection->getMethod( 'classify' );
$classify->setAccessible( true );
$date_presentation = $reflection->getMethod( 'timelineDatePresentation' );
$date_presentation->setAccessible( true );
$steps = ( new Gravity_Flow_API( (int) $manifest['alpha']['form_id'] ) )->get_steps();
if ( ! is_array( $steps ) ) {
    $steps = array();
}

$system_result = $classify->invoke( null, $workflow_submitted, $steps );
$unknown_result = $classify->invoke( null, $synthetic_control, $steps );

wu18_assert( is_array( $system_result ) && 'system' === $system_result['family'], 'Authentic Workflow Submitted event did not classify as system.' );
wu18_assert( is_array( $unknown_result ) && 'unknown' === $unknown_result['family'], 'Unmapped synthetic Timeline event did not remain neutral/unknown.' );

$workflow_submitted_jalali = $date_presentation->invoke( null, $workflow_submitted );
$synthetic_control_jalali = $date_presentation->invoke( null, $synthetic_control );
wu18_assert( is_string( $workflow_submitted_jalali ) && '' !== $workflow_submitted_jalali, 'Qualified Workflow Submitted raw timestamp did not receive provider-backed Jalali presentation.' );
wu18_assert( is_string( $synthetic_control_jalali ) && '' !== $synthetic_control_jalali, 'Qualified native Gravity Flow note raw timestamp did not receive provider-backed Jalali presentation.' );

// Falsification: a human-looking note that contains tempting semantic keywords
// must remain unknown. This proves the classifier is not a broad keyword parser.
$misleading = clone $synthetic_control;
$misleading->value = 'Synthetic note says Approved. Sent to step: Review, but is not a proven host event.';
$misleading_result = $classify->invoke( null, $misleading, $steps );
wu18_assert( is_array( $misleading_result ) && 'unknown' === $misleading_result['family'], 'Misleading keyword Timeline note was falsely classified.' );

$malformed_date = clone $synthetic_control;
$malformed_date->date_created = 'not-a-qualified-host-date';
wu18_assert( null === $date_presentation->invoke( null, $malformed_date ), 'Malformed Timeline raw timestamp did not fail closed to native presentation.' );

$integration_trace = RuntimeDiagnostics::snapshot( 'integration.persian_gravity' );
wu18_assert( is_array( $integration_trace ) && ! empty( $integration_trace['events'] ), 'Provider-backed Timeline application was not observable in GPP diagnostics.' );

$probe = array(
    'schema_version' => '1.2.0',
    'gravity_flow_version' => GRAVITY_FLOW_VERSION,
    'timeline_date_contract' => array(
        'raw_property' => 'note.date_created',
        'source_timezone' => 'UTC',
        'visible_text_parsed' => false,
        'workflow_submitted_matches_entry_date_created' => true,
        'native_note_creation_utc_source_proven' => true,
        'provider_backed_system_event' => $workflow_submitted_jalali,
        'provider_backed_native_note' => $synthetic_control_jalali,
        'malformed_raw_source_native_fallback' => true,
    ),
    'notes' => $note_facts,
    'selected_host_method_source' => $sources,
    'classification_probe' => array(
        'workflow_submitted' => $system_result,
        'native_unknown' => $unknown_result,
        'misleading_keyword_falsification' => $misleading_result,
    ),
    'integration_diagnostics' => $integration_trace,
);

$probe_path = trailingslashit( $artifact_dir ) . 'wu18-timeline-semantic-probe.json';
file_put_contents(
    $probe_path,
    wp_json_encode( $probe, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) {
    $results = array();
}
$results['timeline_semantic_probe'] = $probe;
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_TIMELINE_SEMANTIC_PROBE_PASS\n";
