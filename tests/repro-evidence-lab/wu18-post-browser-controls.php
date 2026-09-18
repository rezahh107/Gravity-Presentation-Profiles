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
    throw new RuntimeException( 'Fresh authorized non-Approval request did not emit the read-only GPP dossier alongside the native host grid.' );
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

$results_path = trailingslashit( $artifact_dir ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) $results = array();
$results['post_browser_controls'] = array(
    'native_approval_transition_observed' => true,
    'current_step_type' => $step->get_type(),
    'read_only_gpp_dossier_emitted' => true,
    'native_entry_detail_grid_preserved_pre_composition' => true,
    'binding_state_unchanged' => true,
    'stale_action_permission_claim_present_but_powerless' => true,
    'diagnostics' => array(
        'structural_readiness' => 'PASS',
        'approval_processing_eligibility' => 'SKIP:current_step_not_approval',
        'presentation' => 'PASS:gpp_enhanced_entry_detail_emitted',
    ),
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_POST_BROWSER_CONTROLS_PASS\n";
