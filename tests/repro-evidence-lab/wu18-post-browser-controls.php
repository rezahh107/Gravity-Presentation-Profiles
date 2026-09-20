<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || empty( $manifest['transition'] ) || empty( $manifest['binding_state_sha256'] ) ) {
    throw new RuntimeException( 'WU18 post-browser control manifest unavailable.' );
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) throw new RuntimeException( 'Pinned WU18 operator unavailable.' );
wp_set_current_user( $operator->ID );

if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
}

$form_id = (int) $manifest['transition']['form_id'];
$entry_id = (int) $manifest['transition']['entry_id'];
$form = GFAPI::get_form( $form_id );
$entry = GFAPI::get_entry( $entry_id );
$api = new Gravity_Flow_API( $form_id );
$step = $api->get_current_step( $entry );

if ( ! is_array( $form ) || is_wp_error( $entry ) || ! $step ) {
    throw new RuntimeException( 'Transition Entry Detail runtime could not be reconstructed after browser submission.' );
}
if ( 'user_input' !== $step->get_type() ) {
    throw new RuntimeException( 'Browser Approval submission did not advance to the native User Input step.' );
}
if ( ! Gravity_Flow_Entry_Detail::is_permission_granted( $entry, $form, $step ) ) {
    throw new RuntimeException( 'Native User Input Entry Detail permission was not preserved for the assigned operator.' );
}
if ( ! Gravity_Flow_Entry_Detail::can_update( $step ) ) {
    throw new RuntimeException( 'Native User Input editability was not preserved for the assigned operator.' );
}

$binding_hash_after = hash( 'sha256', wp_json_encode( get_option( BindingSetLifecycle::OPTION_NAME ) ) );
if ( $binding_hash_after !== $manifest['binding_state_sha256'] ) {
    throw new RuntimeException( 'Workflow transition unexpectedly mutated/rebuilt the EnvironmentBindingSet.' );
}

EntryDetailPresentationAdapter::resetRuntimeCache();
ob_start();
Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
$html = ob_get_clean();
$trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );

if ( false !== strpos( $html, 'data-gpp-entry-detail="ready"' ) || false !== strpos( $html, 'data-gpp-native-table-suppression' ) ) {
    throw new RuntimeException( 'Active native User Input request incorrectly emitted GPP Review/suppression markup.' );
}
if ( false === strpos( $html, 'entry-detail-view' ) || false === strpos( $html, 'gform_wrapper' ) ) {
    throw new RuntimeException( 'Active User Input did not preserve the native Gravity Forms/Flow editor.' );
}

$binding_pass = false;
$suppression_skip = false;
$output_skip = false;
foreach ( isset( $trace['events'] ) && is_array( $trace['events'] ) ? $trace['events'] : array() as $event ) {
    if ( 'ENTRY_DETAIL_BINDING_READINESS' === $event['stage'] && 'PASS' === $event['result'] ) {
        $binding_pass = true;
    }
    if ( 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION' === $event['stage']
        && 'SKIP' === $event['result']
        && 'active_user_input_editing' === $event['reason_code'] ) {
        $suppression_skip = true;
    }
    if ( 'ENTRY_DETAIL_PRESENTATION_OUTPUT' === $event['stage']
        && 'SKIP' === $event['result']
        && 'active_user_input_editing' === $event['reason_code'] ) {
        $output_skip = true;
    }
}
if ( ! $binding_pass || ! $suppression_skip || ! $output_skip ) {
    throw new RuntimeException( 'User Input diagnostics did not distinguish structural readiness from editing fallback.' );
}

// Keep the existing real browser/plugin-settings mapping control in WU18. The
// target architecture changes presentation composition, not binding ownership.
$mapping_script = __DIR__ . '/wu18-mapping-browser-control.mjs';
$mapping_output = array();
$mapping_status = 0;
exec( 'node ' . escapeshellarg( $mapping_script ) . ' 2>&1', $mapping_output, $mapping_status );
if ( 0 !== $mapping_status || empty( $mapping_output ) ) {
    throw new RuntimeException( 'Real Entry Detail batch mapping browser control failed: ' . implode( "\n", array_slice( $mapping_output, -8 ) ) );
}
$mapping_evidence = json_decode( end( $mapping_output ), true );
if ( ! is_array( $mapping_evidence )
    || empty( $mapping_evidence['plugin_settings_panel_reached'] )
    || 0 !== (int) $mapping_evidence['nested_forms']
    || 409 !== (int) $mapping_evidence['stale_post_http_status'] ) {
    throw new RuntimeException( 'Real Entry Detail batch mapping browser evidence is incomplete.' );
}

// Reuse the existing WU18 browser/runtime environment for the optional visual
// variant. This preserves the workflow configuration file while making Full
// Width a mandatory part of the same exact-Head qualification path.
$variant_script = __DIR__ . '/wu18-entry-detail-variant-browser-control.mjs';
$variant_output = array();
$variant_status = 0;
exec( 'node ' . escapeshellarg( $variant_script ) . ' 2>&1', $variant_output, $variant_status );
if ( 0 !== $variant_status || empty( $variant_output ) ) {
    throw new RuntimeException( 'Entry Detail visual variant browser control failed: ' . implode( "\n", array_slice( $variant_output, -12 ) ) );
}
$variant_evidence = json_decode( end( $variant_output ), true );
if ( ! is_array( $variant_evidence )
    || 'PASS' !== ( isset( $variant_evidence['status'] ) ? $variant_evidence['status'] : null )
    || empty( $variant_evidence['settings_selector_reached'] )
    || empty( $variant_evidence['stale_action_conflict_proven'] )
    || empty( $variant_evidence['css_only_grid_proven'] )
    || empty( $variant_evidence['js_blocked_proven'] ) ) {
    throw new RuntimeException( 'Entry Detail visual variant browser evidence is incomplete.' );
}

// PRI-FND-001: static declarations are not sufficient regression evidence for
// the host-cascade failure class. Require a second authentic Playwright control
// to assert the target-calibrated computed Full Width workflow-panel values and
// to prove that a synthetic 12px/44px host override is rejected by that guard.
$panel_guard_script = __DIR__ . '/wu18-entry-detail-workflow-panel-runtime-guard.mjs';
$panel_guard_output = array();
$panel_guard_status = 0;
exec( 'node ' . escapeshellarg( $panel_guard_script ) . ' 2>&1', $panel_guard_output, $panel_guard_status );
if ( 0 !== $panel_guard_status || empty( $panel_guard_output ) ) {
    throw new RuntimeException( 'Entry Detail workflow-panel computed-style guard failed: ' . implode( "\n", array_slice( $panel_guard_output, -12 ) ) );
}
$panel_guard_evidence = json_decode( end( $panel_guard_output ), true );
if ( ! is_array( $panel_guard_evidence )
    || 'PASS' !== ( isset( $panel_guard_evidence['status'] ) ? $panel_guard_evidence['status'] : null )
    || empty( $panel_guard_evidence['computed_style_guard_proven'] )
    || empty( $panel_guard_evidence['original_defect_falsification_proven'] )
    || empty( $panel_guard_evidence['current_safe_44_proven'] )
    || empty( $panel_guard_evidence['medium_narrow_proven'] )
    || empty( $panel_guard_evidence['js_blocked_proven'] )
    || empty( $panel_guard_evidence['lifecycle_preservation_proven'] ) ) {
    throw new RuntimeException( 'Entry Detail workflow-panel computed-style evidence is incomplete.' );
}

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) $results = array();
$results['post_browser_controls'] = array(
    'native_approval_transition_observed' => true,
    'current_step_type' => $step->get_type(),
    'gpp_review_dossier_emitted' => false,
    'suppression_marker_emitted' => false,
    'native_user_input_editor_preserved' => true,
    'binding_state_unchanged_by_workflow_transition' => true,
    'diagnostics' => array(
        'structural_readiness' => 'PASS',
        'native_table_suppression' => 'SKIP:active_user_input_editing',
        'presentation' => 'SKIP:active_user_input_editing',
    ),
);
$results['real_mapping_browser_control'] = $mapping_evidence;
$results['entry_detail_visual_variant_browser_control'] = $variant_evidence;
$results['entry_detail_workflow_panel_runtime_guard'] = $panel_guard_evidence;
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_POST_BROWSER_USER_INPUT_FALLBACK_PASS\n";
echo "WU18_REAL_MAPPING_BROWSER_CONTROL_PASS\n";
echo "WU18_ENTRY_DETAIL_VISUAL_VARIANT_BROWSER_CONTROL_PASS\n";
echo "WU18_ENTRY_DETAIL_WORKFLOW_PANEL_RUNTIME_GUARD_PASS\n";
