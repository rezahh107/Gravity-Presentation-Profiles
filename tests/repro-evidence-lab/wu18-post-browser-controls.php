<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

function gpp_wu02_assert_qualified_summary( $summary ) {
    if ( ! is_array( $summary )
        || 'EVIDENCE_COMPLETE' !== ( $summary['status'] ?? null )
        || 'PASS' !== ( $summary['hard_gate_result'] ?? null )
        || 'QUALIFIED_FOR_PINNED_RUNTIME' !== ( $summary['disposition'] ?? null ) ) {
        throw new RuntimeException( 'WU02 Entry Detail visibility evidence did not qualify the pinned runtime.' );
    }
}

function gpp_wu02_summary_rejected( $summary ) {
    try {
        gpp_wu02_assert_qualified_summary( $summary );
    } catch ( RuntimeException $exception ) {
        return true;
    }

    return false;
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || empty( $manifest['transition'] ) || empty( $manifest['binding_state_sha256'] ) ) {
    throw new RuntimeException( 'WU18 post-browser control manifest unavailable.' );
}

// GPP-RP-WU-09 evidence-only qualification. The Node probe installs its
// temporary asset-delivery shim only for requests carrying gpp_wu09_probe,
// exercises the live WU18 HTTP runtime, then removes the shim.
$wu09_script = __DIR__ . '/wu09-entry-asset-reachability-browser.mjs';
$wu09_output = array();
$wu09_status = 0;
exec( 'node ' . escapeshellarg( $wu09_script ) . ' 2>&1', $wu09_output, $wu09_status );
$wu09_path = trailingslashit( $artifact_dir ) . 'wu09-entry-asset-reachability-qualification.json';
$wu09_evidence = is_file( $wu09_path ) ? json_decode( file_get_contents( $wu09_path ), true ) : null;
if ( 0 !== $wu09_status || ! is_array( $wu09_evidence ) || 'PASS' !== ( $wu09_evidence['status'] ?? null ) ) {
    throw new RuntimeException(
        'WU09 Entry Detail asset reachability qualification failed: ' . implode( "\n", array_slice( $wu09_output, -20 ) )
    );
}
if ( 'QUALIFIED_EARLY_REQUEST_GATED_CSS' !== ( $wu09_evidence['q2']['classification'] ?? null )
    || 'QUALIFIED_POST_ADMISSION_JS' !== ( $wu09_evidence['q3']['classification'] ?? null ) ) {
    throw new RuntimeException( 'WU09 asset-delivery candidates did not reach the required independent qualifications.' );
}
echo "WU09_ENTRY_ASSET_REACHABILITY_QUALIFICATION_PASS\n";

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

// Extend the same WU18 browser state with semantic Timeline qualification only
// after the existing transition/editor and Full Width geometry guards have run.
$timeline_semantic_script = __DIR__ . '/wu18-entry-detail-timeline-semantic-browser-control.mjs';
$timeline_semantic_output = array();
$timeline_semantic_status = 0;
exec( 'node ' . escapeshellarg( $timeline_semantic_script ) . ' 2>&1', $timeline_semantic_output, $timeline_semantic_status );
if ( 0 !== $timeline_semantic_status || empty( $timeline_semantic_output ) ) {
    throw new RuntimeException( 'Entry Detail Timeline semantic browser control failed: ' . implode( "\n", array_slice( $timeline_semantic_output, -16 ) ) );
}
$timeline_semantic_evidence = json_decode( end( $timeline_semantic_output ), true );
if ( ! is_array( $timeline_semantic_evidence )
    || 'PASS' !== ( isset( $timeline_semantic_evidence['status'] ) ? $timeline_semantic_evidence['status'] : null )
    || empty( $timeline_semantic_evidence['approval_proven'] )
    || empty( $timeline_semantic_evidence['transition_proven'] )
    || empty( $timeline_semantic_evidence['system_proven'] )
    || empty( $timeline_semantic_evidence['unknown_keyword_falsification_proven'] )
    || empty( $timeline_semantic_evidence['native_order_content_preserved'] )
    || empty( $timeline_semantic_evidence['desktop_medium_mobile_proven'] )
    || empty( $timeline_semantic_evidence['js_blocked_proven'] )
    || empty( $timeline_semantic_evidence['current_safe_isolation_proven'] ) ) {
    throw new RuntimeException( 'Entry Detail Timeline semantic browser evidence is incomplete.' );
}

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) $results = array();
$results['wu09_entry_asset_reachability_qualification'] = $wu09_evidence;
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
$results['entry_detail_timeline_semantic_browser_control'] = $timeline_semantic_evidence;
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_POST_BROWSER_USER_INPUT_FALLBACK_PASS\n";
echo "WU18_REAL_MAPPING_BROWSER_CONTROL_PASS\n";
echo "WU18_ENTRY_DETAIL_VISUAL_VARIANT_BROWSER_CONTROL_PASS\n";
echo "WU18_ENTRY_DETAIL_WORKFLOW_PANEL_RUNTIME_GUARD_PASS\n";
echo "WU18_ENTRY_DETAIL_TIMELINE_SEMANTIC_BROWSER_CONTROL_PASS\n";

// GPP-RP-WU-02: the PHP wrapper consumes one authoritative Node result. These
// deterministic controls exercise the exact fail-closed acceptance predicate
// before the real pinned-runtime evaluator is invoked.
$wu02_positive_control = false;
try {
    gpp_wu02_assert_qualified_summary( array(
        'status' => 'EVIDENCE_COMPLETE',
        'hard_gate_result' => 'PASS',
        'disposition' => 'QUALIFIED_FOR_PINNED_RUNTIME',
    ) );
    $wu02_positive_control = true;
} catch ( RuntimeException $exception ) {
    $wu02_positive_control = false;
}
$wu02_fail_control = gpp_wu02_summary_rejected( array(
    'status' => 'EVIDENCE_COMPLETE',
    'hard_gate_result' => 'FAIL',
    'disposition' => 'CONFIRMED_DEFECT',
) );
$wu02_not_proven_control = gpp_wu02_summary_rejected( array(
    'status' => 'EVIDENCE_COMPLETE',
    'hard_gate_result' => 'NOT_PROVEN',
    'disposition' => 'NOT_PROVEN',
) );
$wu02_malformed_control = gpp_wu02_summary_rejected( '{not-json' );
$wu02_missing_control = gpp_wu02_summary_rejected( array( 'status' => 'EVIDENCE_COMPLETE' ) );
if ( ! $wu02_positive_control
    || ! $wu02_fail_control
    || ! $wu02_not_proven_control
    || ! $wu02_malformed_control
    || ! $wu02_missing_control ) {
    throw new RuntimeException( 'WU02 fail-closed qualification summary controls failed.' );
}
echo "WU02_QUALIFICATION_POSITIVE_CONTROL_PASS\n";
echo "WU02_QUALIFICATION_FAIL_FALSIFICATION_PASS\n";
echo "WU02_QUALIFICATION_NOT_PROVEN_FALSIFICATION_PASS\n";
echo "WU02_QUALIFICATION_MALFORMED_MISSING_FALSIFICATION_PASS\n";

// Run after the existing WU18 controls. The qualification may mutate only
// ephemeral synthetic field values/conditional logic at this point.
$wu02_script = __DIR__ . '/wu02-entry-visibility-differential.mjs';
$wu02_output = array();
$wu02_status = 0;
exec( 'node ' . escapeshellarg( $wu02_script ) . ' 2>&1', $wu02_output, $wu02_status );
if ( 0 !== $wu02_status || empty( $wu02_output ) ) {
    throw new RuntimeException( 'WU02 Entry Detail visibility differential failed to produce evidence: ' . implode( "\n", array_slice( $wu02_output, -20 ) ) );
}
$wu02_summary = json_decode( end( $wu02_output ), true );
gpp_wu02_assert_qualified_summary( $wu02_summary );
echo "WU02_ENTRY_VISIBILITY_DIFFERENTIAL_QUALIFIED_FOR_PINNED_RUNTIME\n";

// WU11 consumes the already-authenticated WU18 browser transition, Timeline,
// and WU02 POST/complete evidence in one explicit host-dependency contract.
require __DIR__ . '/wu11-flow-dependency-contract.php';

// GPP-RP-WU-04: WU04 remains the sole semantic/classification authority. WU18
// validates the transport/evidence envelope, then accepts only the authoritative
// atomicity PASS terminal state before qualification may continue.
$consume_wu04_qualified_result = static function ( array $output, $status ) {
    if ( 0 !== (int) $status || empty( $output ) ) {
        throw new RuntimeException( 'WU04 GF settings atomicity qualification did not complete conclusively.' );
    }

    $summary = json_decode( end( $output ), true );
    if ( ! is_array( $summary ) ) {
        throw new RuntimeException( 'WU04 GF settings atomicity evidence summary is not a JSON object.' );
    }

    foreach ( array( 'status', 'disposition', 'hard_gate_result', 'artifact' ) as $field ) {
        if ( ! isset( $summary[ $field ] )
            || ! is_string( $summary[ $field ] )
            || '' === trim( $summary[ $field ] ) ) {
            throw new RuntimeException( 'WU04 GF settings atomicity conclusive envelope is structurally incomplete.' );
        }
    }

    if ( 'EVIDENCE_COMPLETE' !== $summary['status'] ) {
        throw new RuntimeException( 'WU04 GF settings atomicity evidence summary is inconclusive.' );
    }

    if ( ! is_file( $summary['artifact'] ) || ! is_readable( $summary['artifact'] ) ) {
        throw new RuntimeException( 'WU04 GF settings atomicity referenced evidence artifact is unavailable.' );
    }

    if ( 'ATOMICITY_PROVEN' !== $summary['disposition'] || 'PASS' !== $summary['hard_gate_result'] ) {
        throw new RuntimeException( 'WU04 GF settings atomicity evidence did not reach ATOMICITY_PROVEN/PASS.' );
    }

    return $summary;
};

$assert_wu04_rejected = static function ( array $output, $status ) use ( $consume_wu04_qualified_result ) {
    try {
        $consume_wu04_qualified_result( $output, $status );
    } catch ( RuntimeException $exception ) {
        return;
    }
    throw new RuntimeException( 'WU04 qualification falsification unexpectedly accepted an invalid result.' );
};

$wu04_positive_summary = array(
    'status' => 'EVIDENCE_COMPLETE',
    'disposition' => 'ATOMICITY_PROVEN',
    'hard_gate_result' => 'PASS',
    'artifact' => $results_path,
);
$wu04_positive_control = false;
try {
    $consume_wu04_qualified_result( array( wp_json_encode( $wu04_positive_summary ) ), 0 );
    $wu04_positive_control = true;
} catch ( RuntimeException $exception ) {
    $wu04_positive_control = false;
}
if ( ! $wu04_positive_control ) {
    throw new RuntimeException( 'WU04 qualification positive control rejected ATOMICITY_PROVEN/PASS.' );
}

$assert_wu04_rejected( array(), 0 );
$assert_wu04_rejected( array( 'not-json' ), 0 );
$assert_wu04_rejected(
    array( wp_json_encode( $wu04_positive_summary ) ),
    2
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => 'CONFIRMED_PARTIAL_MUTATION_DEFECT',
        'hard_gate_result' => 'FAIL',
        'artifact' => $results_path,
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_INCONCLUSIVE',
        'disposition' => 'NOT_PROVEN',
        'hard_gate_result' => 'NOT_PROVEN',
        'artifact' => $results_path,
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => 'NOT_PROVEN',
        'hard_gate_result' => 'NOT_PROVEN',
        'artifact' => $results_path,
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => 'ATOMICITY_PROVEN',
        'hard_gate_result' => 'PASS',
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => array( 'not-a-scalar' ),
        'hard_gate_result' => 'PASS',
        'artifact' => $results_path,
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => 'ATOMICITY_PROVEN',
        'hard_gate_result' => 'PASS',
        'artifact' => $results_path . '.missing',
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => 'ATOMICITY_PROVEN',
        'hard_gate_result' => 'FAIL',
        'artifact' => $results_path,
    ) ) ),
    0
);
$assert_wu04_rejected(
    array( wp_json_encode( array(
        'status' => 'EVIDENCE_COMPLETE',
        'disposition' => 'CONFIRMED_PARTIAL_MUTATION_DEFECT',
        'hard_gate_result' => 'PASS',
        'artifact' => $results_path,
    ) ) ),
    0
);
echo "WU04_GF_SETTINGS_ATOMICITY_QUALIFICATION_POSITIVE_CONTROL_PASS\n";
echo "WU04_GF_SETTINGS_ATOMICITY_DEFECT_FAIL_FALSIFICATION_PASS\n";
echo "WU04_GF_SETTINGS_ATOMICITY_FAIL_CLOSED_CONTROLS_PASS\n";

// Run after the existing WU18 controls and WU02 qualification. WU04 may mutate
// only its own ephemeral synthetic settings fixtures at this point.
$wu04_script = __DIR__ . '/wu04-gf-settings-atomicity.mjs';
$wu04_output = array();
$wu04_status = 0;
exec( 'node ' . escapeshellarg( $wu04_script ) . ' 2>&1', $wu04_output, $wu04_status );
try {
    $wu04_summary = $consume_wu04_qualified_result( $wu04_output, $wu04_status );
} catch ( RuntimeException $exception ) {
    throw new RuntimeException(
        $exception->getMessage() . ' Output: ' . implode( "\n", array_slice( $wu04_output, -16 ) ),
        0,
        $exception
    );
}
echo "WU04_GF_SETTINGS_ATOMICITY_PROVEN_PASS\n";
