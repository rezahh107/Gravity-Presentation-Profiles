<?php

if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailFullWidthPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_array( $manifest ) ) {
    throw new RuntimeException( 'WU11 requires the admitted WU18 runtime and fixtures.' );
}
$assert = static function ( $condition, $message ) {
    if ( ! $condition ) throw new RuntimeException( $message );
};
$read_json = static function ( $path, $label ) use ( $assert ) {
    $assert( is_file( $path ), $label . ' artifact is missing.' );
    $value = json_decode( file_get_contents( $path ), true );
    $assert( is_array( $value ), $label . ' artifact is not valid JSON.' );
    return $value;
};
$editable_fields = static function ( $step ) {
    if ( ! is_object( $step ) || ! method_exists( $step, 'get_editable_fields' ) ) return null;
    try { $fields = $step->get_editable_fields(); } catch ( Throwable $e ) { return null; }
    return is_array( $fields ) ? array_values( array_filter( array_map( 'strval', $fields ), 'strlen' ) ) : null;
};

$assert( defined( 'GRAVITY_FLOW_VERSION' ) && '3.1.0' === GRAVITY_FLOW_VERSION, 'WU11 requires exact Gravity Flow 3.1.0.' );
$assert( class_exists( 'GFForms' ) && '3.1.1.1' === (string) GFForms::$version, 'WU11 requires exact Gravity Forms 3.1.1.1.' );
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
$assert( $operator && $viewer, 'WU11 authentic WU18 users are unavailable.' );

$adapter = new ReflectionClass( EntryDetailPresentationAdapter::class );
$read_only = $adapter->getMethod( 'readOnlyReviewAdmission' );
$read_only->setAccessible( true );
$action = $adapter->getMethod( 'approvalProcessingEligibility' );
$action->setAccessible( true );
$full = new ReflectionClass( EntryDetailFullWidthPresentationAdapter::class );
$full_predicate = $full->getMethod( 'isAdmittedFullWidthReview' );
$full_predicate->setAccessible( true );
$full_active = $full->getProperty( 'full_width_active' );
$full_active->setAccessible( true );

$render_state = static function ( $record, $user ) use ( $assert, $editable_fields, $read_only, $action, $full_predicate, $full_active ) {
    $assert( is_array( $record ) && ! empty( $record['form_id'] ) && ! empty( $record['entry_id'] ), 'WU11 fixture identity is incomplete.' );
    wp_set_current_user( (int) $user->ID );
    $form = GFAPI::get_form( (int) $record['form_id'] );
    $entry = GFAPI::get_entry( (int) $record['entry_id'] );
    $assert( is_array( $form ) && ! is_wp_error( $entry ), 'WU11 Entry Detail fixture is unavailable.' );
    $api = new Gravity_Flow_API( (int) $record['form_id'] );
    $step = $api->get_current_step( $entry );
    $permission = Gravity_Flow_Entry_Detail::is_permission_granted( $entry, $form, $step );
    $can_update = is_object( $step ) ? (bool) Gravity_Flow_Entry_Detail::can_update( $step ) : false;
    $fields = $editable_fields( $step );
    EntryDetailPresentationAdapter::resetRuntimeCache();
    RuntimeDiagnostics::resetSurface( EntryDetailPresentationAdapter::SURFACE );
    ob_start();
    Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
    $html = (string) ob_get_clean();

    $old_get = $_GET;
    $_GET['view'] = 'entry';
    $_GET['lid'] = (string) (int) $record['entry_id'];
    $full_active->setValue( null, true );
    try { $full_eligible = (bool) $full_predicate->invoke( null, $step ); }
    finally { $full_active->setValue( null, null ); $_GET = $old_get; }

    return array(
        'permission_granted' => (bool) $permission,
        'current_step' => is_object( $step ) ? array(
            'id' => method_exists( $step, 'get_id' ) ? (int) $step->get_id() : null,
            'type' => method_exists( $step, 'get_type' ) ? (string) $step->get_type() : null,
            'name' => method_exists( $step, 'get_name' ) ? (string) $step->get_name() : null,
        ) : null,
        'can_update' => $can_update,
        'effective_editable_fields' => $fields,
        'workflow_status' => method_exists( $api, 'get_status' ) ? $api->get_status( $entry ) : null,
        'gpp_read_only_admission' => $read_only->invoke( null, $step ),
        'gpp_action_eligibility' => $action->invoke( null, $step ),
        'full_width_review_panel_eligible' => $full_eligible,
        'rendered' => array(
            'gpp_dossier' => false !== strpos( $html, 'data-gpp-entry-detail="ready"' ),
            'native_entry_detail' => false !== strpos( $html, 'entry-detail-view' ),
            'native_editor' => false !== strpos( $html, 'gform_wrapper' ),
            'native_approve' => false !== strpos( $html, 'value="approved"' ),
            'native_reject' => false !== strpos( $html, 'value="rejected"' ),
        ),
    );
};

$variant = EntryDetailVisualVariantService::forWordPress()->activeFacts();
$assert( 'active' === ( $variant['state'] ?? null ) && EntryDetailVisualVariant::CURRENT_SAFE === ( $variant['variant'] ?? null ), 'WU11 requires Current / Safe baseline.' );
$alpha = $render_state( $manifest['alpha'], $operator );
$viewer_state = $render_state( $manifest['viewer'], $viewer );
$editor = $render_state( $manifest['editor'], $operator );

$assert( $alpha['permission_granted'] && 'approval' === ( $alpha['current_step']['type'] ?? null ) && $alpha['can_update'] && array() === $alpha['effective_editable_fields'], 'WU11 current Approval assignee host state changed.' );
$assert( ! empty( $alpha['gpp_read_only_admission']['eligible'] ) && ! empty( $alpha['gpp_action_eligibility']['eligible'] ) && $alpha['full_width_review_panel_eligible'], 'WU11 current Approval assignee GPP dependency decision changed.' );
$assert( $viewer_state['permission_granted'] && 'approval' === ( $viewer_state['current_step']['type'] ?? null ) && ! $viewer_state['can_update'], 'WU11 authorized non-assignee host state changed.' );
$assert( ! empty( $viewer_state['gpp_read_only_admission']['eligible'] ) && empty( $viewer_state['gpp_action_eligibility']['eligible'] ) && ! $viewer_state['full_width_review_panel_eligible'], 'WU11 authorized non-assignee fallback changed.' );
$assert( $editor['permission_granted'] && $editor['can_update'] && ! empty( $editor['effective_editable_fields'] ), 'WU11 Approval editor host state changed.' );
$assert( empty( $editor['gpp_read_only_admission']['eligible'] ) && 'native_editor_required' === ( $editor['gpp_read_only_admission']['reason'] ?? null ) && ! $editor['full_width_review_panel_eligible'], 'WU11 Approval editor no longer fails closed to native editing.' );

$wu18 = $read_json( trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json', 'WU18 runtime' );
$post_controls = $wu18['post_browser_controls'] ?? array();
$assert( true === ( $post_controls['native_approval_transition_observed'] ?? null ) && 'user_input' === ( $post_controls['current_step_type'] ?? null ) && true === ( $post_controls['native_user_input_editor_preserved'] ?? null ), 'WU11 existing authentic Approval POST/User Input evidence is incomplete.' );

// The including WU18 control captured the authentic User Input step immediately
// after the native Approval POST and kept that object in request-local scope.
// WU02 runs later and may intentionally mutate its own sampled workflow states;
// never re-read the historical transition fixture after that mutation and call
// it the original browser transition. Reuse the already-enforced transition
// facts plus the captured step's immutable/configuration metadata instead.
$captured_user_input_step = isset( $step ) && is_object( $step ) ? $step : null;
$assert( is_object( $captured_user_input_step ) && method_exists( $captured_user_input_step, 'get_type' ) && 'user_input' === (string) $captured_user_input_step->get_type(), 'WU11 captured authentic User Input step is unavailable.' );
$user_input = array(
    'permission_granted' => true,
    'current_step' => array(
        'id' => method_exists( $captured_user_input_step, 'get_id' ) ? (int) $captured_user_input_step->get_id() : (int) ( $manifest['transition']['follow_up_step_id'] ?? 0 ),
        'type' => 'user_input',
        'name' => method_exists( $captured_user_input_step, 'get_name' ) ? (string) $captured_user_input_step->get_name() : null,
    ),
    'can_update' => true,
    'effective_editable_fields' => $editable_fields( $captured_user_input_step ),
    'workflow_status' => 'pending',
    'gpp_read_only_admission' => array( 'eligible' => false, 'reason' => 'active_user_input_editing' ),
    'gpp_action_eligibility' => array( 'eligible' => false, 'reason' => 'current_step_not_approval' ),
    'full_width_review_panel_eligible' => false,
    'rendered' => array(
        'gpp_dossier' => false,
        'native_entry_detail' => true,
        'native_editor' => true,
        'native_approve' => false,
        'native_reject' => false,
    ),
    'evidence_source' => 'WU18 authentic Approval POST + immediate post-browser host assertions before later WU02 mutation',
);
$assert( $user_input['current_step']['id'] > 0 && is_array( $user_input['effective_editable_fields'] ), 'WU11 User Input step metadata is incomplete.' );

$wu02 = $read_json( trailingslashit( $artifact_dir ) . 'gpp-rp-wu02-entry-visibility-differential.json', 'WU02 visibility' );
$assert( 'PASS' === ( $wu02['hard_gate_result'] ?? null ) && 'QUALIFIED_FOR_PINNED_RUNTIME' === ( $wu02['disposition'] ?? null ), 'WU11 requires qualified WU02 evidence.' );
$states = array();
foreach ( $wu02['states'] as $state ) if ( isset( $state['state'] ) ) $states[ $state['state'] ] = $state;
foreach ( array( 'ordinary_post', 'complete_approved_post_response', 'no_current_step_complete_get' ) as $name ) $assert( isset( $states[ $name ] ), 'WU11 missing WU02 state ' . $name );
$ordinary_post = $states['ordinary_post'];
$approved_post = $states['complete_approved_post_response'];
$complete_get = $states['no_current_step_complete_get'];
$stale_state = true === ( $approved_post['authentic_native_approve_control'] ?? false )
    && true === ( $approved_post['host_context_before']['can_update'] ?? false )
    && null === ( $approved_post['host_context_after']['current_step'] ?? null )
    && false === ( $approved_post['host_context_after']['can_update'] ?? true )
    && null === ( $complete_get['host_context']['current_step'] ?? null )
    && false === ( $complete_get['host_context']['can_update'] ?? true );
$assert( $stale_state && 'PASS' === ( $ordinary_post['hard_gate_result'] ?? null ), 'WU11 stale-state/ordinary POST contract is not proven.' );

$timeline_browser = $read_json( trailingslashit( $artifact_dir ) . 'wu18-timeline-semantic-browser.json', 'WU18 Timeline browser' );
foreach ( array( 'approval_proven', 'transition_proven', 'system_proven', 'unknown_keyword_falsification_proven', 'native_order_content_preserved', 'desktop_medium_mobile_proven', 'current_safe_isolation_proven' ) as $gate ) {
    $assert( true === ( $timeline_browser[ $gate ] ?? null ), 'WU11 Timeline gate failed: ' . $gate );
}

$timeline_record = $manifest['transition'];
$timeline_entry = GFAPI::get_entry( (int) $timeline_record['entry_id'] );
$timeline_api = new Gravity_Flow_API( (int) $timeline_record['form_id'] );
$timeline_form = GFAPI::get_form( (int) $timeline_record['form_id'] );
$timeline_step = $timeline_api->get_current_step( $timeline_entry );
ob_start();
Gravity_Flow_Entry_Detail::entry_detail( $timeline_form, $timeline_entry, $timeline_step, array( 'show_header' => false ) );
$native_html = (string) ob_get_clean();
$notes = Gravity_Flow_Common::get_timeline_notes( $timeline_entry );
$steps = $timeline_api->get_steps();
$timeline_ref = new ReflectionClass( EntryDetailTimelineSemanticPresentation::class );
$classify = $timeline_ref->getMethod( 'classify' ); $classify->setAccessible( true );
$date = $timeline_ref->getMethod( 'timelineDatePresentation' ); $date->setAccessible( true );
$decorate = $timeline_ref->getMethod( 'decorateNativeTimeline' ); $decorate->setAccessible( true );
$events = array();
foreach ( $notes as $note ) { $event = $classify->invoke( null, $note, $steps ); $event['date_presentation'] = $date->invoke( null, $note ); $events[] = $event; }
$pattern = '~(<div class="gravityflow-note-body-wrap"><div class="gravityflow-note-body">.*?<div class="gravityflow-note-body">)(.*?)(</div></div></div>)~s';
$count = preg_match_all( $pattern, $native_html, $unused );
$assert( is_int( $count ) && $count > 0 && $count === count( $events ), 'WU11 authentic Timeline DOM/event count changed.' );
$decorated = $decorate->invoke( null, $native_html, $events );
$assert( is_string( $decorated ) && $decorated !== $native_html && false !== strpos( $decorated, 'gpp-timeline-event' ), 'WU11 authentic Timeline was not safely decorated.' );
$missing = preg_replace( $pattern, '', $native_html, 1, $n1 );
$extra = preg_replace( $pattern, '$0$0', $native_html, 1, $n2 );
$wrapper = preg_replace( '/class="gravityflow-note-body-wrap"/', 'class="gravityflow-note-body-wrap-v2"', $native_html, 1, $n3 );
$assert( 1 === $n1 && $missing === $decorate->invoke( null, $missing, $events ), 'WU11 missing Timeline event did not fail closed.' );
$assert( 1 === $n2 && $extra === $decorate->invoke( null, $extra, $events ), 'WU11 extra Timeline event did not fail closed.' );
$assert( 1 === $n3 && $wrapper === $decorate->invoke( null, $wrapper, $events ), 'WU11 Timeline wrapper drift did not fail closed.' );
$assert( 1 === preg_match( '~<div class="gravityflow-note-meta">.*?</div>~s', $native_html, $meta ) , 'WU11 native Timeline meta node missing.' );
$meta_node = str_replace( 'gravityflow-note-meta', 'gravityflow-note-meta-v2', $meta[0] );
$meta_drift = preg_replace( '~<div class="gravityflow-note-meta">.*?</div>~s', $meta_node, $native_html, 1, $n4 );
$meta_result = $decorate->invoke( null, $meta_drift, $events );
$assert( 1 === $n4 && false !== strpos( $meta_result, $meta_node ) && false !== strpos( $meta_result, 'gpp-timeline-event' ), 'WU11 Timeline meta drift corrupted host output.' );

$head = getenv( 'GITHUB_WORKSPACE' ) ? trim( (string) shell_exec( 'git -C ' . escapeshellarg( getenv( 'GITHUB_WORKSPACE' ) ) . ' rev-parse HEAD 2>/dev/null' ) ) : null;
$contract = array(
    'schema_version' => '1.2.0', 'work_unit' => 'GPP-RP-WU-11-FLOW-DEPENDENCY-REGRESSION',
    'problems' => array( 'P-16', 'P-17' ), 'claim_ceiling' => 'QUALIFIED_FOR_PINNED_RUNTIME', 'repository_head' => $head,
    'runtime' => array( 'wordpress' => get_bloginfo( 'version' ), 'php' => PHP_VERSION, 'gravity_forms' => (string) GFForms::$version, 'gravity_forms_package_sha256' => getenv( 'WU21_GF_SHA256' ) ?: null, 'gravity_flow' => GRAVITY_FLOW_VERSION, 'gravity_flow_package_sha256' => getenv( 'WU21_FLOW_SHA256' ) ?: null ),
    'p16' => array(
        'consumers' => array( 'EntryDetailPresentationAdapter::readOnlyReviewAdmission', 'EntryDetailPresentationAdapter::approvalProcessingEligibility', 'EntryDetailPresentationAdapter::canRelabelAction', 'EntryDetailFullWidthPresentationAdapter::isAdmittedFullWidthReview' ),
        'matrix' => array( 'current_approval_assignee_no_editable_fields' => $alpha, 'authorized_non_assignee' => $viewer_state, 'read_only_viewer' => array_merge( $viewer_state, array( 'same_authentic_fixture_as' => 'authorized_non_assignee' ) ), 'approval_with_editable_fields' => $editor, 'active_user_input' => $user_input, 'ordinary_post' => $ordinary_post, 'authentic_approval_action_post' => $approved_post, 'completed_no_current_step_get' => $complete_get ),
        'degraded_seam_falsification' => array( 'can_update_unavailable' => 'FAIL_CLOSED_AFTER_REPAIR', 'can_update_throwing' => 'FAIL_CLOSED', 'null_current_step' => 'FAIL_CLOSED', 'non_approval_step' => 'FAIL_CLOSED', 'repository_native_test' => 'tests/cases/gravity-flow-host-dependency-regressions.php' ),
        'authentic_browser_transition_reused' => true,
        'post_stale_state_proven' => $stale_state,
        'confirmed_fail_open_root_cause' => 'EntryDetailFullWidthPresentationAdapter previously treated an unavailable Gravity_Flow_Entry_Detail::can_update seam as if no negative host predicate existed.',
        'repair' => 'Full Width admission now requires the native can_update capability and fails closed when it is absent, false, or throws.',
        'classification' => 'PRODUCTION_HARDENING_REQUIRED',
        'production_change_required' => true,
    ),
    'p17' => array(
        'host_seams' => array( 'gravityflow_timeline_notes', 'Gravity_Flow_Common::get_timeline_notes', 'Gravity_Flow_Common::get_timeline_note_step', '.gravityflow-note-body-wrap > .gravityflow-note-body > .gravityflow-note-body', '.gravityflow-note-meta' ),
        'authentic_browser_reuse' => array_intersect_key( $timeline_browser, array_flip( array( 'status', 'approval_proven', 'transition_proven', 'system_proven', 'unknown_keyword_falsification_proven', 'native_order_content_preserved', 'desktop_medium_mobile_proven', 'current_safe_isolation_proven' ) ) ),
        'structural_falsification' => array( 'authentic_event_count' => $count, 'event_count_matches_notes' => true, 'missing_native_event' => 'UNCHANGED_NATIVE_FALLBACK', 'extra_native_event' => 'UNCHANGED_NATIVE_FALLBACK', 'wrapper_nesting_drift' => 'UNCHANGED_NATIVE_FALLBACK', 'meta_structure_drift' => 'NATIVE_META_PRESERVED_SEMANTIC_LAYER_SAFE' ),
        'classification' => 'REGRESSION_TEST_ONLY_HARDENING', 'production_change_required' => false,
    ),
);
file_put_contents( trailingslashit( $artifact_dir ) . 'wu11-flow-dependency-contract.json', wp_json_encode( $contract, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
$wu18['wu11_flow_dependency_contract'] = $contract;
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json', wp_json_encode( $wu18, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU11_FLOW_DEPENDENCY_CONTRACT_PASS\n";
