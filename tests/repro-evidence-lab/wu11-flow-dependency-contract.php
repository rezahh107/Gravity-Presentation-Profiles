<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailFullWidthPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

$wu11_artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$wu11_manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_string( $wu11_artifact_dir ) || '' === $wu11_artifact_dir || ! is_array( $wu11_manifest ) ) {
    throw new RuntimeException( 'WU11 requires the admitted WU18 runtime and fixture manifest.' );
}

$wu11_assert = static function ( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
};

$wu11_read_json = static function ( $file, $label ) use ( $wu11_assert ) {
    $wu11_assert( is_file( $file ), $label . ' artifact is missing.' );
    $decoded = json_decode( file_get_contents( $file ), true );
    $wu11_assert( is_array( $decoded ), $label . ' artifact is not valid JSON.' );
    return $decoded;
};

$wu11_assert( defined( 'GRAVITY_FLOW_VERSION' ) && '3.1.0' === GRAVITY_FLOW_VERSION, 'WU11 requires exact Gravity Flow 3.1.0.' );
$wu11_assert( class_exists( 'GFForms' ) && '3.1.1.1' === (string) GFForms::$version, 'WU11 requires exact Gravity Forms 3.1.1.1.' );
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
$wu11_assert( $operator && $viewer, 'WU11 authentic WU18 users are unavailable.' );

$adapter_reflection = new ReflectionClass( EntryDetailPresentationAdapter::class );
$read_only_method = $adapter_reflection->getMethod( 'readOnlyReviewAdmission' );
$read_only_method->setAccessible( true );
$action_method = $adapter_reflection->getMethod( 'approvalProcessingEligibility' );
$action_method->setAccessible( true );

$full_width_reflection = new ReflectionClass( EntryDetailFullWidthPresentationAdapter::class );
$full_width_predicate = $full_width_reflection->getMethod( 'isAdmittedFullWidthReview' );
$full_width_predicate->setAccessible( true );
$full_width_active = $full_width_reflection->getProperty( 'full_width_active' );
$full_width_active->setAccessible( true );

$wu11_effective_editable_fields = static function ( $step ) {
    if ( ! is_object( $step ) || ! method_exists( $step, 'get_editable_fields' ) ) {
        return null;
    }
    try {
        $fields = $step->get_editable_fields();
    } catch ( Throwable $exception ) {
        return null;
    }
    if ( ! is_array( $fields ) ) {
        return null;
    }
    return array_values( array_filter( array_map( 'strval', $fields ), 'strlen' ) );
};

$wu11_render = static function ( $form_id, $entry_id ) {
    $form = GFAPI::get_form( (int) $form_id );
    $entry = GFAPI::get_entry( (int) $entry_id );
    if ( ! is_array( $form ) || is_wp_error( $entry ) ) {
        throw new RuntimeException( 'WU11 Entry Detail render fixture is unavailable.' );
    }
    $api = new Gravity_Flow_API( (int) $form_id );
    $step = $api->get_current_step( $entry );
    EntryDetailPresentationAdapter::resetRuntimeCache();
    RuntimeDiagnostics::resetSurface( EntryDetailPresentationAdapter::SURFACE );
    ob_start();
    Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
    $html = ob_get_clean();
    return array(
        'html' => is_string( $html ) ? $html : '',
        'form' => $form,
        'entry' => $entry,
        'step' => $step,
        'workflow_status' => method_exists( $api, 'get_status' ) ? $api->get_status( $entry ) : null,
        'trace' => RuntimeDiagnostics::snapshot( EntryDetailPresentationAdapter::SURFACE ),
    );
};

$wu11_host_state = static function ( $record, $user ) use ( $wu11_assert, $wu11_effective_editable_fields, $wu11_render, $read_only_method, $action_method, $full_width_predicate, $full_width_active ) {
    $wu11_assert( is_array( $record ) && ! empty( $record['form_id'] ) && ! empty( $record['entry_id'] ), 'WU11 host-state fixture identity is incomplete.' );
    wp_set_current_user( (int) $user->ID );

    $render = $wu11_render( (int) $record['form_id'], (int) $record['entry_id'] );
    $step = $render['step'];
    $permission = Gravity_Flow_Entry_Detail::is_permission_granted( $render['entry'], $render['form'], $step );
    $can_update = is_object( $step ) ? (bool) Gravity_Flow_Entry_Detail::can_update( $step ) : false;
    $editable_fields = $wu11_effective_editable_fields( $step );
    $read_only = $read_only_method->invoke( null, $step );
    $action = $action_method->invoke( null, $step );

    $old_get = $_GET;
    $_GET['view'] = 'entry';
    $_GET['lid'] = (string) (int) $record['entry_id'];
    $full_width_active->setValue( null, true );
    try {
        $full_width_eligible = (bool) $full_width_predicate->invoke( null, $step );
    } finally {
        $full_width_active->setValue( null, null );
        $_GET = $old_get;
    }

    $html = $render['html'];
    return array(
        'user_login' => (string) $user->user_login,
        'permission_granted' => (bool) $permission,
        'current_step' => is_object( $step )
            ? array(
                'id' => method_exists( $step, 'get_id' ) ? (int) $step->get_id() : null,
                'type' => method_exists( $step, 'get_type' ) ? (string) $step->get_type() : null,
                'name' => method_exists( $step, 'get_name' ) ? (string) $step->get_name() : null,
            )
            : null,
        'can_update' => $can_update,
        'effective_editable_fields' => $editable_fields,
        'workflow_status' => $render['workflow_status'],
        'gpp_read_only_admission' => $read_only,
        'gpp_action_eligibility' => $action,
        'full_width_review_panel_eligible_under_admitted_variant' => $full_width_eligible,
        'rendered' => array(
            'gpp_dossier' => false !== strpos( $html, 'data-gpp-entry-detail="ready"' ),
            'gpp_read_only_marker' => false !== strpos( $html, 'data-gpp-review-mode="read-only"' ),
            'native_entry_detail' => false !== strpos( $html, 'entry-detail-view' ),
            'native_form_editor' => false !== strpos( $html, 'gform_wrapper' ),
            'native_approve' => false !== strpos( $html, 'value="approved"' ),
            'native_reject' => false !== strpos( $html, 'value="rejected"' ),
        ),
    );
};

$variant_service = EntryDetailVisualVariantService::forWordPress();
$variant_facts = $variant_service->activeFacts();
$wu11_assert( 'active' === ( $variant_facts['state'] ?? null ) && EntryDetailVisualVariant::CURRENT_SAFE === ( $variant_facts['variant'] ?? null ), 'WU11 requires the WU18 Current / Safe baseline after existing controls.' );

$alpha = $wu11_host_state( $wu11_manifest['alpha'], $operator );
$viewer_state = $wu11_host_state( $wu11_manifest['viewer'], $viewer );
$editor = $wu11_host_state( $wu11_manifest['editor'], $operator );

$wu11_assert( true === $alpha['permission_granted'] && 'approval' === ( $alpha['current_step']['type'] ?? null ), 'WU11 current-assignee fixture is not an authorized Approval.' );
$wu11_assert( true === $alpha['can_update'] && array() === $alpha['effective_editable_fields'], 'WU11 current-assignee fixture does not expose the qualified no-editor can_update state.' );
$wu11_assert( ! empty( $alpha['gpp_read_only_admission']['eligible'] ) && ! empty( $alpha['gpp_action_eligibility']['eligible'] ), 'WU11 current-assignee GPP decisions do not match native host actionability.' );
$wu11_assert( true === $alpha['full_width_review_panel_eligible_under_admitted_variant'], 'WU11 Full Width review predicate rejected the authentic no-editor Approval assignee.' );
$wu11_assert( true === $alpha['rendered']['gpp_dossier'] && true === $alpha['rendered']['native_approve'] && true === $alpha['rendered']['native_reject'], 'WU11 current-assignee render lost GPP dossier or native Approval actions.' );

$wu11_assert( true === $viewer_state['permission_granted'] && 'approval' === ( $viewer_state['current_step']['type'] ?? null ), 'WU11 authorized non-assignee fixture lost native Entry Detail permission.' );
$wu11_assert( false === $viewer_state['can_update'], 'WU11 authorized non-assignee unexpectedly gained native update eligibility.' );
$wu11_assert( ! empty( $viewer_state['gpp_read_only_admission']['eligible'] ) && empty( $viewer_state['gpp_action_eligibility']['eligible'] ), 'WU11 non-assignee must remain read-only without GPP action eligibility.' );
$wu11_assert( false === $viewer_state['full_width_review_panel_eligible_under_admitted_variant'], 'WU11 Full Width action panel must not admit an authorized non-assignee.' );
$wu11_assert( true === $viewer_state['rendered']['gpp_dossier'] && false === $viewer_state['rendered']['native_approve'] && false === $viewer_state['rendered']['native_reject'], 'WU11 authorized non-assignee render did not preserve read-only/no-action behavior.' );

$wu11_assert( true === $editor['permission_granted'] && 'approval' === ( $editor['current_step']['type'] ?? null ) && true === $editor['can_update'], 'WU11 Approval-editor fixture lost native actionability.' );
$wu11_assert( is_array( $editor['effective_editable_fields'] ) && ! empty( $editor['effective_editable_fields'] ), 'WU11 Approval-editor fixture has no effective editable fields.' );
$wu11_assert( empty( $editor['gpp_read_only_admission']['eligible'] ) && 'native_editor_required' === ( $editor['gpp_read_only_admission']['reason'] ?? null ), 'WU11 Approval-editor state did not conservatively retain the native editor.' );
$wu11_assert( false === $editor['full_width_review_panel_eligible_under_admitted_variant'], 'WU11 Full Width review panel must not replace an Approval editor.' );
$wu11_assert( false === $editor['rendered']['gpp_dossier'] && true === $editor['rendered']['native_form_editor'], 'WU11 Approval-editor render did not fall back to the native editor.' );

$wu18_runtime = $wu11_read_json( trailingslashit( $wu11_artifact_dir ) . 'wu18-runtime-results.json', 'WU18 runtime' );
$user_input = $wu18_runtime['post_browser_controls']['wu11_user_input_host_state'] ?? null;
$wu11_assert( is_array( $user_input ), 'WU11 User Input host snapshot is missing from WU18 post-browser controls.' );
$wu11_assert( true === ( $user_input['permission_granted'] ?? null ) && 'user_input' === ( $user_input['current_step']['type'] ?? null ) && true === ( $user_input['can_update'] ?? null ), 'WU11 authentic User Input host state is incomplete.' );
$wu11_assert( true === ( $wu18_runtime['post_browser_controls']['native_user_input_editor_preserved'] ?? null ), 'WU11 User Input native editor fallback was not preserved.' );
$wu11_assert( false === ( $wu18_runtime['post_browser_controls']['gpp_review_dossier_emitted'] ?? true ), 'WU11 User Input incorrectly emitted the GPP Review dossier.' );

$wu02 = $wu11_read_json( trailingslashit( $wu11_artifact_dir ) . 'gpp-rp-wu02-entry-visibility-differential.json', 'WU02 Entry visibility' );
$wu11_assert( 'PASS' === ( $wu02['hard_gate_result'] ?? null ) && 'QUALIFIED_FOR_PINNED_RUNTIME' === ( $wu02['disposition'] ?? null ), 'WU11 requires the existing WU02 pinned-runtime qualification.' );
$wu02_states = array();
foreach ( $wu02['states'] as $state ) {
    if ( isset( $state['state'] ) ) {
        $wu02_states[ $state['state'] ] = $state;
    }
}
foreach ( array( 'ordinary_post', 'complete_approved_post_response', 'no_current_step_complete_get' ) as $required_state ) {
    $wu11_assert( isset( $wu02_states[ $required_state ] ), 'WU11 is missing WU02 state ' . $required_state . '.' );
}

$ordinary_post = $wu02_states['ordinary_post'];
$approved_post = $wu02_states['complete_approved_post_response'];
$complete_get = $wu02_states['no_current_step_complete_get'];
$stale_state_proven = true === ( $approved_post['authentic_native_approve_control'] ?? false )
    && true === ( $approved_post['host_context_before']['can_update'] ?? false )
    && null === ( $approved_post['host_context_after']['current_step'] ?? null )
    && false === ( $approved_post['host_context_after']['can_update'] ?? true )
    && null === ( $complete_get['host_context']['current_step'] ?? null )
    && false === ( $complete_get['host_context']['can_update'] ?? true );
$wu11_assert( $stale_state_proven, 'WU11 authentic Approval POST did not prove fresh post-transition can_update/current-step state.' );
$wu11_assert( 'PASS' === ( $ordinary_post['hard_gate_result'] ?? null ) && 'POST' === ( $ordinary_post['request_method'] ?? null ), 'WU11 ordinary POST control is not qualified.' );

$timeline_browser = $wu11_read_json( trailingslashit( $wu11_artifact_dir ) . 'wu18-timeline-semantic-browser.json', 'WU18 Timeline browser' );
$timeline_probe = $wu11_read_json( trailingslashit( $wu11_artifact_dir ) . 'wu18-timeline-semantic-probe.json', 'WU18 Timeline semantic probe' );
$wu11_assert( 'PASS' === ( $timeline_browser['status'] ?? null ), 'WU11 requires the existing authentic Timeline browser qualification.' );
foreach ( array( 'approval_proven', 'transition_proven', 'system_proven', 'unknown_keyword_falsification_proven', 'native_order_content_preserved', 'desktop_medium_mobile_proven', 'current_safe_isolation_proven' ) as $gate ) {
    $wu11_assert( true === ( $timeline_browser[ $gate ] ?? null ), 'WU11 existing Timeline evidence gate failed: ' . $gate );
}

wp_set_current_user( (int) $operator->ID );
$timeline_record = $wu11_manifest['transition'];
$timeline_form = GFAPI::get_form( (int) $timeline_record['form_id'] );
$timeline_entry = GFAPI::get_entry( (int) $timeline_record['entry_id'] );
$timeline_api = new Gravity_Flow_API( (int) $timeline_record['form_id'] );
$timeline_step = $timeline_api->get_current_step( $timeline_entry );
$wu11_assert( is_array( $timeline_form ) && ! is_wp_error( $timeline_entry ), 'WU11 authentic Timeline fixture is unavailable.' );

ob_start();
Gravity_Flow_Entry_Detail::entry_detail( $timeline_form, $timeline_entry, $timeline_step, array( 'show_header' => false ) );
$native_timeline_html = ob_get_clean();
$wu11_assert( is_string( $native_timeline_html ) && false !== strpos( $native_timeline_html, 'gravityflow-timeline' ), 'WU11 authentic native Timeline HTML is unavailable.' );

$notes = Gravity_Flow_Common::get_timeline_notes( $timeline_entry );
$steps = $timeline_api->get_steps();
$wu11_assert( is_array( $notes ) && ! empty( $notes ) && is_array( $steps ), 'WU11 native Timeline notes/steps are unavailable.' );

$timeline_reflection = new ReflectionClass( EntryDetailTimelineSemanticPresentation::class );
$classify_method = $timeline_reflection->getMethod( 'classify' );
$classify_method->setAccessible( true );
$date_method = $timeline_reflection->getMethod( 'timelineDatePresentation' );
$date_method->setAccessible( true );
$decorate_method = $timeline_reflection->getMethod( 'decorateNativeTimeline' );
$decorate_method->setAccessible( true );

$events = array();
foreach ( $notes as $note ) {
    $event = $classify_method->invoke( null, $note, $steps );
    $event['date_presentation'] = $date_method->invoke( null, $note );
    $events[] = $event;
}

$timeline_pattern = '~(<div class="gravityflow-note-body-wrap"><div class="gravityflow-note-body">.*?<div class="gravityflow-note-body">)(.*?)(</div></div></div>)~s';
$native_event_count = preg_match_all( $timeline_pattern, $native_timeline_html, $native_event_matches );
$wu11_assert( is_int( $native_event_count ) && $native_event_count === count( $events ) && $native_event_count > 0, 'WU11 authentic Timeline DOM/event count contract changed.' );
$baseline_decorated = $decorate_method->invoke( null, $native_timeline_html, $events );
$wu11_assert( is_string( $baseline_decorated ) && $baseline_decorated !== $native_timeline_html && false !== strpos( $baseline_decorated, 'gpp-timeline-event' ), 'WU11 authentic Timeline baseline did not receive semantic presentation.' );

$missing_event_html = preg_replace( $timeline_pattern, '', $native_timeline_html, 1, $missing_replacements );
$wu11_assert( 1 === $missing_replacements && $missing_event_html === $decorate_method->invoke( null, $missing_event_html, $events ), 'WU11 missing native Timeline event did not fail closed to unchanged host output.' );

$extra_event_html = preg_replace( $timeline_pattern, '$0$0', $native_timeline_html, 1, $extra_replacements );
$wu11_assert( 1 === $extra_replacements && $extra_event_html === $decorate_method->invoke( null, $extra_event_html, $events ), 'WU11 extra native Timeline event did not fail closed to unchanged host output.' );

$wrapper_drift_html = preg_replace( '/class="gravityflow-note-body-wrap"/', 'class="gravityflow-note-body-wrap-v2"', $native_timeline_html, 1, $wrapper_replacements );
$wu11_assert( 1 === $wrapper_replacements && $wrapper_drift_html === $decorate_method->invoke( null, $wrapper_drift_html, $events ), 'WU11 Timeline wrapper/nesting drift did not fail closed to unchanged host output.' );

$meta_match = array();
$wu11_assert( 1 === preg_match( '~<div class="gravityflow-note-meta">.*?</div>~s', $native_timeline_html, $meta_match ), 'WU11 authentic Timeline meta node is unavailable.' );
$meta_drift_node = str_replace( 'gravityflow-note-meta', 'gravityflow-note-meta-v2', $meta_match[0] );
$meta_drift_html = preg_replace( '~<div class="gravityflow-note-meta">.*?</div>~s', $meta_drift_node, $native_timeline_html, 1, $meta_replacements );
$meta_drift_decorated = $decorate_method->invoke( null, $meta_drift_html, $events );
$wu11_assert( 1 === $meta_replacements && is_string( $meta_drift_decorated ) && false !== strpos( $meta_drift_decorated, $meta_drift_node ), 'WU11 Timeline meta drift did not preserve the native meta node.' );
$wu11_assert( false !== strpos( $meta_drift_decorated, 'gpp-timeline-event' ), 'WU11 Timeline meta-only drift unexpectedly disabled otherwise-safe semantic siblings.' );

$repo_head = null;
$workspace = getenv( 'GITHUB_WORKSPACE' );
if ( is_string( $workspace ) && '' !== $workspace ) {
    $repo_head = trim( (string) shell_exec( 'git -C ' . escapeshellarg( $workspace ) . ' rev-parse HEAD 2>/dev/null' ) );
}

$contract = array(
    'schema_version' => '1.0.0',
    'work_unit' => 'GPP-RP-WU-11-FLOW-DEPENDENCY-REGRESSION',
    'problems' => array( 'P-16', 'P-17' ),
    'claim_ceiling' => 'QUALIFIED_FOR_PINNED_RUNTIME',
    'repository_head' => $repo_head,
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => (string) GFForms::$version,
        'gravity_forms_package_sha256' => getenv( 'WU21_GF_SHA256' ) ?: null,
        'gravity_flow' => GRAVITY_FLOW_VERSION,
        'gravity_flow_package_sha256' => getenv( 'WU21_FLOW_SHA256' ) ?: null,
    ),
    'p16' => array(
        'consumers' => array(
            'EntryDetailPresentationAdapter::readOnlyReviewAdmission',
            'EntryDetailPresentationAdapter::approvalProcessingEligibility',
            'EntryDetailPresentationAdapter::canRelabelAction via approvalProcessingEligibility',
            'EntryDetailFullWidthPresentationAdapter::isAdmittedFullWidthReview',
        ),
        'matrix' => array(
            'current_approval_assignee_no_editable_fields' => $alpha,
            'authorized_non_assignee' => $viewer_state,
            'read_only_viewer' => array_merge( $viewer_state, array( 'same_authentic_fixture_as' => 'authorized_non_assignee' ) ),
            'approval_with_editable_fields' => $editor,
            'active_user_input' => $user_input,
            'ordinary_post' => $ordinary_post,
            'authentic_approval_action_post' => $approved_post,
            'completed_no_current_step_get' => $complete_get,
        ),
        'degraded_seam_falsification' => array(
            'repository_native_test' => 'tests/cases/gravity-flow-host-dependency-regressions.php',
            'can_update_unavailable' => 'FAIL_CLOSED',
            'can_update_throwing' => 'FAIL_CLOSED',
            'null_current_step' => 'FAIL_CLOSED',
            'non_approval_step' => 'FAIL_CLOSED',
        ),
        'post_stale_state_proven' => $stale_state_proven,
        'classification' => 'EXISTING_DEPENDENCY_QUALIFIED',
        'production_change_required' => false,
    ),
    'p17' => array(
        'host_seams' => array(
            'gravityflow_timeline_notes',
            'Gravity_Flow_Common::get_timeline_notes',
            'Gravity_Flow_Common::get_timeline_note_step',
            '.gravityflow-note-body-wrap > .gravityflow-note-body > .gravityflow-note-body',
            '.gravityflow-note-meta',
        ),
        'authentic_browser_reuse' => array(
            'status' => $timeline_browser['status'],
            'approval_proven' => $timeline_browser['approval_proven'],
            'transition_proven' => $timeline_browser['transition_proven'],
            'system_proven' => $timeline_browser['system_proven'],
            'unknown_keyword_falsification_proven' => $timeline_browser['unknown_keyword_falsification_proven'],
            'native_order_content_preserved' => $timeline_browser['native_order_content_preserved'],
            'desktop_medium_mobile_proven' => $timeline_browser['desktop_medium_mobile_proven'],
            'current_safe_isolation_proven' => $timeline_browser['current_safe_isolation_proven'],
        ),
        'structural_falsification' => array(
            'authentic_event_count' => $native_event_count,
            'event_count_matches_notes' => true,
            'missing_native_event' => 'UNCHANGED_NATIVE_FALLBACK',
            'extra_native_event' => 'UNCHANGED_NATIVE_FALLBACK',
            'wrapper_nesting_drift' => 'UNCHANGED_NATIVE_FALLBACK',
            'meta_structure_drift' => 'NATIVE_META_PRESERVED_SEMANTIC_LAYER_SAFE_DATE_DECORATION_SKIPPED_FOR_DRIFTED_NODE',
        ),
        'semantic_probe_source' => basename( trailingslashit( $wu11_artifact_dir ) . 'wu18-timeline-semantic-probe.json' ),
        'classification' => 'REGRESSION_TEST_ONLY_HARDENING',
        'production_change_required' => false,
    ),
);

$wu11_serialized_contract = wp_json_encode( $contract, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
file_put_contents(
    trailingslashit( $wu11_artifact_dir ) . 'wu11-flow-dependency-contract.json',
    $wu11_serialized_contract
);
$wu18_runtime['wu11_flow_dependency_contract'] = $contract;
file_put_contents(
    trailingslashit( $wu11_artifact_dir ) . 'wu18-runtime-results.json',
    wp_json_encode( $wu18_runtime, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU11_FLOW_DEPENDENCY_CONTRACT_PASS\n";
