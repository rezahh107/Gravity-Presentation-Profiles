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
    throw new RuntimeException( 'Native non-Approval Entry Detail permission was not preserved for the assigned operator.' );
}
if ( ! Gravity_Flow_Entry_Detail::can_update( $step ) ) {
    throw new RuntimeException( 'Native User Input editability was not preserved for the assigned operator.' );
}

$binding_hash_after = hash( 'sha256', wp_json_encode( get_option( BindingSetLifecycle::OPTION_NAME ) ) );
if ( $binding_hash_after !== $manifest['binding_state_sha256'] ) {
    throw new RuntimeException( 'Request-local workflow changes unexpectedly mutated/rebuilt the EnvironmentBindingSet.' );
}

$binding_state = get_option( BindingSetLifecycle::OPTION_NAME );
$stale_claim_observed = false;
if ( is_array( $binding_state )
    && ! empty( $binding_state['installed']['wu18.operations.alpha.transition.v1']['1.0.0']['artifact']['runtime_claims'] ) ) {
    foreach ( $binding_state['installed']['wu18.operations.alpha.transition.v1']['1.0.0']['artifact']['runtime_claims'] as $claim ) {
        if ( 'workflow.approve_action' === $claim['semantic_slot_key']
            && 'action_permission' === $claim['claim']
            && 'PROVEN' === $claim['evidence_state'] ) {
            $stale_claim_observed = true;
            break;
        }
    }
}
if ( ! $stale_claim_observed ) {
    throw new RuntimeException( 'Stale action_permission falsification claim disappeared before the non-Approval request control.' );
}

EntryDetailPresentationAdapter::resetRuntimeCache();
ob_start();
Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
$html = ob_get_clean();
$trace = RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' );

if ( false === strpos( $html, 'data-gpp-entry-detail="ready"' ) || false === strpos( $html, 'entry-detail-view' ) ) {
    throw new RuntimeException( 'Fresh authorized non-Approval request did not emit the GPP dossier alongside the native host grid.' );
}
if ( false === strpos( $html, 'data-gpp-host-editable="1"' ) ) {
    throw new RuntimeException( 'Fresh authorized User Input request did not preserve host editability independently of Approval eligibility.' );
}
if ( false === strpos( $html, 'data-gpp-actions-expected="0"' ) ) {
    throw new RuntimeException( 'Fresh authorized non-Approval request incorrectly expected Approval actions.' );
}

$binding_pass = false;
$eligibility_skip = false;
$output_pass = false;
foreach ( isset( $trace['events'] ) && is_array( $trace['events'] ) ? $trace['events'] : array() as $event ) {
    if ( 'ENTRY_DETAIL_BINDING_READINESS' === $event['stage'] && 'PASS' === $event['result'] ) {
        $binding_pass = true;
    }
    if ( 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY' === $event['stage']
        && 'SKIP' === $event['result']
        && 'current_step_not_approval' === $event['reason_code'] ) {
        $eligibility_skip = true;
    }
    if ( 'ENTRY_DETAIL_PRESENTATION_OUTPUT' === $event['stage']
        && 'PASS' === $event['result']
        && 'gpp_enhanced_entry_detail_emitted' === $event['reason_code'] ) {
        $output_pass = true;
    }
}
if ( ! $binding_pass || ! $eligibility_skip || ! $output_pass ) {
    throw new RuntimeException( 'Non-Approval diagnostics did not distinguish action ineligibility from dossier view admission.' );
}

// Authentic privacy/empty controls on the untouched beta fixture. The value is
// rendered through the real GF/Flow Entry Detail path, then the same field is
// hidden by Gravity Forms conditional logic consumed by Flow's native
// is_display_field() predicate. GPP must omit the semantic before reading it.
$beta_form_id = (int) $manifest['beta']['form_id'];
$beta_entry_id = (int) $manifest['beta']['entry_id'];
$home_field_id = (string) $manifest['beta']['fields']['student.home_phone'];
$national_field_id = (string) $manifest['beta']['fields']['student.national_id'];
$beta_form = GFAPI::get_form( $beta_form_id );
$beta_entry = GFAPI::get_entry( $beta_entry_id );
$beta_api = new Gravity_Flow_API( $beta_form_id );
$beta_step = $beta_api->get_current_step( $beta_entry );
if ( ! is_array( $beta_form ) || is_wp_error( $beta_entry ) || ! $beta_step ) {
    throw new RuntimeException( 'Beta privacy fixture is unavailable.' );
}
$home_field = GFAPI::get_field( $beta_form, $home_field_id );
if ( ! is_object( $home_field ) ) throw new RuntimeException( 'Beta home-phone field unavailable.' );
$original_conditional_logic = isset( $home_field->conditionalLogic ) ? $home_field->conditionalLogic : null;
$original_home_value = array_key_exists( $home_field_id, $beta_entry ) ? $beta_entry[ $home_field_id ] : null;

$render_beta = static function () use ( $beta_form_id, $beta_entry_id ) {
    $form = GFAPI::get_form( $beta_form_id );
    $entry = GFAPI::get_entry( $beta_entry_id );
    $api = new Gravity_Flow_API( $beta_form_id );
    $step = $api->get_current_step( $entry );
    EntryDetailPresentationAdapter::resetRuntimeCache();
    ob_start();
    Gravity_Flow_Entry_Detail::entry_detail( $form, $entry, $step, array( 'show_header' => false ) );
    $html = ob_get_clean();
    return array( $html, RuntimeDiagnostics::snapshot( 'gravity_flow.entry_detail' ) );
};

$empty_result = GFAPI::update_entry_field( $beta_entry_id, $home_field_id, '' );
if ( is_wp_error( $empty_result ) ) throw new RuntimeException( $empty_result->get_error_message() );
list( $empty_html, $empty_trace ) = $render_beta();
if ( 1 !== preg_match( '/data-gpp-slot="student\.home_phone"[^>]*>.*?<dd>\s*ثبت نشده\s*<\/dd>/su', $empty_html ) ) {
    throw new RuntimeException( 'Mapped-visible empty home phone was not distinguished as ثبت نشده.' );
}

$hidden_sentinel = 'WU18-HIDDEN-SENTINEL-DO-NOT-RENDER';
$secret_result = GFAPI::update_entry_field( $beta_entry_id, $home_field_id, $hidden_sentinel );
if ( is_wp_error( $secret_result ) ) throw new RuntimeException( $secret_result->get_error_message() );
$beta_form = GFAPI::get_form( $beta_form_id );
foreach ( $beta_form['fields'] as $field ) {
    if ( (string) $field->id !== $home_field_id ) continue;
    $field->conditionalLogic = array(
        'actionType' => 'show',
        'logicType' => 'all',
        'rules' => array(
            array(
                'fieldId' => $national_field_id,
                'operator' => 'is',
                'value' => '__wu18_never_matches__',
            ),
        ),
    );
}
$update_form = GFAPI::update_form( $beta_form );
if ( is_wp_error( $update_form ) ) throw new RuntimeException( $update_form->get_error_message() );
list( $hidden_html, $hidden_trace ) = $render_beta();
if ( false !== strpos( $hidden_html, $hidden_sentinel ) ) {
    throw new RuntimeException( 'Flow-hidden field value leaked through Entry Detail output.' );
}
if ( false !== strpos( $hidden_html, 'data-gpp-slot="student.home_phone"' ) ) {
    throw new RuntimeException( 'Flow-hidden semantic rendered a GPP placeholder/value instead of being omitted.' );
}
$host_hidden_diagnostic = false;
foreach ( isset( $hidden_trace['events'] ) && is_array( $hidden_trace['events'] ) ? $hidden_trace['events'] : array() as $event ) {
    if ( 'ENTRY_DETAIL_SEMANTIC_COMPLETENESS' === $event['stage']
        && 'semantic.student.home_phone.host_hidden' === $event['reason_code'] ) {
        $host_hidden_diagnostic = true;
        break;
    }
}
if ( ! $host_hidden_diagnostic ) {
    throw new RuntimeException( 'Flow-hidden semantic was not recorded with privacy-safe host_hidden diagnostics.' );
}

// Restore the synthetic host fixture before the mapping lifecycle control.
$beta_form = GFAPI::get_form( $beta_form_id );
foreach ( $beta_form['fields'] as $field ) {
    if ( (string) $field->id === $home_field_id ) $field->conditionalLogic = $original_conditional_logic;
}
$restore_form = GFAPI::update_form( $beta_form );
if ( is_wp_error( $restore_form ) ) throw new RuntimeException( $restore_form->get_error_message() );
$restore_value = GFAPI::update_entry_field( $beta_entry_id, $home_field_id, $original_home_value );
if ( is_wp_error( $restore_value ) ) throw new RuntimeException( $restore_value->get_error_message() );

// Exercise the Owner-facing batch mapper through the real browser/plugin-settings
// form and its dedicated admin-post boundary. This runs only after the request-
// local workflow transition control above has proved that Flow did not mutate the
// shared EnvironmentBindingSet.
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

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) $results = array();
$results['post_browser_controls'] = array(
    'native_approval_transition_observed' => true,
    'current_step_type' => $step->get_type(),
    'gpp_dossier_emitted' => true,
    'native_user_input_editability_preserved' => true,
    'approval_actions_not_expected' => true,
    'native_entry_detail_grid_preserved_pre_composition' => true,
    'binding_state_unchanged_by_workflow_transition' => true,
    'stale_action_permission_claim_present_but_powerless' => true,
    'mapped_empty_distinct_from_unmapped' => true,
    'flow_hidden_value_not_exposed' => true,
    'flow_hidden_placeholder_omitted' => true,
    'host_hidden_diagnostic_privacy_safe' => true,
    'diagnostics' => array(
        'structural_readiness' => 'PASS',
        'approval_processing_eligibility' => 'SKIP:current_step_not_approval',
        'presentation' => 'PASS:gpp_enhanced_entry_detail_emitted',
    ),
);
$results['real_mapping_browser_control'] = $mapping_evidence;
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_POST_BROWSER_CONTROLS_PASS\n";
echo "WU18_FLOW_HIDDEN_PRIVACY_CONTROL_PASS\n";
echo "WU18_REAL_MAPPING_BROWSER_CONTROL_PASS\n";
