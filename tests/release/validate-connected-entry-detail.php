<?php
// Independent connected Goal 5 acceptance. Reads only installed-ZIP and
// real administrator/native browser evidence; fails closed on missing stages.
if ( PHP_SAPI !== 'cli' ) exit( 1 );
$dir = rtrim( (string) ( $argv[1] ?? '' ), '/\\' );
if ( '' === $dir ) throw new RuntimeException( 'Evidence path required.' );
$read = static function ( $file ) use ( $dir ) {
    $path = $dir . '/' . $file . '.json';
    $value = is_file( $path ) ? json_decode( (string) file_get_contents( $path ), true ) : null;
    if ( ! is_array( $value ) ) throw new RuntimeException( 'GPP_CONNECTED_ENTRY_FAIL missing ' . $file );
    return $value;
};
$check = static function ( $ok, $why ) {
    if ( ! $ok ) throw new RuntimeException( 'GPP_CONNECTED_ENTRY_FAIL ' . $why );
};
$binding = static function ( $state, $slot ) {
    foreach ( (array) ( $state['binding']['artifact']['bindings'] ?? array() ) as $row ) {
        if ( ( $row['semantic_slot_key'] ?? null ) === $slot ) return $row;
    }
    return null;
};
$fixture = $read( 'behavioral-host-fixture' );
$zip = $read( 'artifact-identity' );
$before = $read( 'before-entry-setup' );
$adopted = $read( 'after-entry-setup' );
$rerun = $read( 'after-entry-rerun' );
$empty = $read( 'after-entry-empty' );
$stale = $read( 'after-entry-stale' );
$rebound = $read( 'after-entry-rebind' );
$requalified = $read( 'after-entry-requalification' );
$check( ( $zip['installed_tree_matches_zip'] ?? false ) === true
    && ( $zip['installed_plugin_dir_is_link'] ?? true ) === false
    && preg_match( '/^[a-f0-9]{64}$/', (string) ( $zip['zip_sha256'] ?? '' ) ) === 1,
    'unproved_zip_to_installed_plugin_identity' );
$check( empty( $before['visual']['entry_detail_activation'] ), 'entry_activated_before_admin_submission' );
$check( ( $adopted['visual']['entry_detail_activation']['profile_id'] ?? null ) === 'srwf.operations.entry-detail.v1',
    'real_entry_setup_did_not_activate' );
foreach ( array( $adopted, $rerun, $empty, $stale, $rebound, $requalified ) as $snapshot ) {
    foreach ( array( 'print_activation', 'inbox_activation' ) as $surface ) {
        $check( $snapshot['visual'][ $surface ] === $before['visual'][ $surface ], 'entry_modified_' . $surface );
    }
    $check( $snapshot['visual']['entry_detail_activation'] === $adopted['visual']['entry_detail_activation'],
        'entry_activation_changed_after_adoption' );
}
$check( $rerun['binding']['activation'] === $adopted['binding']['activation']
    && $rerun['binding']['artifact_hash'] === $adopted['binding']['artifact_hash'],
    'idempotent_admin_rerun_created_binding_churn' );
foreach ( array( 'entry.created_at' => array( 'gravity_forms.entry_meta', 'date_created' ),
                 'workflow.current_step' => array( 'gravity_flow.state', 'current_step' ),
                 'workflow.status' => array( 'gravity_flow.state', 'status' ) ) as $slot => $expected ) {
    $row = $binding( $adopted, $slot );
    $check( ( $row['state'] ?? null ) === 'PROVEN'
        && ( $row['source_ref']['type'] ?? null ) === $expected[0]
        && ( $row['source_ref'][ $expected[0] === 'gravity_forms.entry_meta' ? 'meta_key' : 'state_key' ] ?? null ) === $expected[1],
        'entry_stable_host_source_not_product_qualified_' . $slot );
}
$check( ( $adopted['binding']['artifact']['provenance']['producer'] ?? null )
    === 'Gravity Presentation Profiles Entry Detail stable host-source qualification',
    'stable_sources_not_product_adoption' );
$check( ( $binding( $adopted, 'student.first_name' )['source_ref']['field_id'] ?? null )
    == $fixture['fields']['first_name']['id']
    && ( $binding( $adopted, 'student.last_name' )['source_ref']['field_id'] ?? null )
    == $fixture['fields']['last_name']['id'], 'source_fields_not_real_admin_mapping' );
$check( ( $binding( $before, 'student.home_phone' )['state'] ?? null ) === 'UNBOUND',
    'empty_phone_was_not_unmapped_initially' );
$check( ( $binding( $empty, 'student.home_phone' )['source_ref']['field_id'] ?? null )
    == $fixture['fields']['empty_phone']['id'], 'empty_field_not_admin_mapped' );
$check( $empty['binding']['activation'] !== $rerun['binding']['activation'],
    'mapping_change_failed_to_create_new_immutable_version' );
$check( $stale['binding']['activation'] === $empty['binding']['activation']
    && $stale['binding']['artifact_hash'] === $empty['binding']['artifact_hash'],
    'host_source_retirement_mutated_gpp_binding' );
$check( ( $binding( $rebound, 'student.home_phone' )['source_ref']['field_id'] ?? null )
    == $fixture['fields']['replacement_empty_phone']['id'], 'source_rebind_not_submitted_by_admin' );
$check( $rebound['binding']['activation'] !== $empty['binding']['activation']
    && $requalified['binding']['activation'] === $rebound['binding']['activation'],
    'requalification_lost_admin_source_change_or_created_churn' );
$identity = array();
foreach ( array( $before, $adopted, $empty, $rebound ) as $snapshot ) {
    $a = $snapshot['binding']['activation'];
    $version = $a['binding_set_version'] ?? null;
    $hash = $snapshot['binding']['artifact_hash'] ?? null;
    $check( is_string( $version ) && is_string( $hash ) && ! isset( $identity[ $version ] ),
        'immutable_version_collision' );
    $identity[ $version ] = $hash;
}
foreach ( $identity as $version => $hash ) {
    $check( ( $requalified['binding']['installed_artifact_hashes'][ $version ] ?? null ) === $hash,
        'immutable_binding_history_was_rewritten' );
}
$reports = array();
foreach ( array( 'initial', 'empty', 'stale', 'requalified' ) as $stage ) {
    $host = $read( 'connected-entry-host-' . $stage );
    $view = $read( 'connected-entry-' . $stage );
    $check( $host['stage'] === $stage && $view['stage'] === $stage
        && ( $view['connected'] ?? false ) === true, 'wrong_stage_or_unconnected_browser_' . $stage );
    $check( $host['native_step_type'] === 'approval'
        && $host['native_step_id'] === $fixture['native_authority']['approval_step_id']
        && $host['native_editable_fields'] === array()
        && ! empty( $host['native_status'] )
        && ! empty( $host['native_created_at'] ), 'native_host_truth_missing_' . $stage );
    $check( $host['native_first_raw'] === $fixture['expected_first_name_value']
        && $host['native_last_raw'] === $fixture['expected_last_name_value'],
        'host_value_witness_missing_' . $stage );
    $check( $view['host']['currentStep'] === $host['native_step_name']
        && $view['host']['first'] === $host['native_first_raw']
        && $view['host']['last'] === $host['native_last_raw'],
        'browser_not_reading_actual_host_values_' . $stage );
    $check( ( $host['phone_source_exists'] ?? null ) === ( $stage === 'empty' || $stage === 'requalified' ),
        'stale_source_or_rebound_status_inaccurate_' . $stage );
    $check( count( $view['viewports'] ) === 4 && ( $view['keyboard_focus_native_control'] ?? false ) === true,
        'responsive_or_keyboard_acceptance_missing_' . $stage );
    $reports[ $stage ] = array(
        'binding_identity' => $host['binding_identity'],
        'phone_field_state' => $view['host']['homePhone'],
        'native_step' => $host['native_step_name'],
        'native_status' => $host['native_status'],
    );
}
$authorized = $read( 'connected-entry-requalified' );
$check( ( $authorized['unauthorized_viewer']['no_dossier'] ?? false )
    && ( $authorized['unauthorized_viewer']['no_workflow_action'] ?? false )
    && ( $authorized['unauthorized_viewer']['no_host_value'] ?? false ),
    'unauthorized_user_did_not_fail_closed' );
foreach ( array( 'finance.tuition_amount', 'finance.discount_amount', 'finance.net_payable_amount' ) as $slot ) {
    $check( ( $binding( $requalified, $slot )['state'] ?? null ) === 'UNBOUND', 'finance_lock_violation_' . $slot );
}
$result = array(
    'verdict' => 'CONNECTED_ENTRY_DETAIL_PINNED_RUNTIME_PASS',
    'scope' => 'installed_zip_to_gf_admin_to_binding_to_native_gravity_flow_entry_to_rendered_dossier',
    'zip_sha256' => $zip['zip_sha256'],
    'stages' => $reports,
    'native_authorization' => 'positive_admin_and_negative_subscriber_browser',
    'owner_site' => 'NOT_PROVEN',
    'frontend_shortcode_and_native_block' => 'NOT_EXERCISED_IN_THIS_GATE',
    'user_input_and_terminal_management' => 'EXISTING_SEPARATE_GATES',
    'finance' => 'UNBOUND',
);
file_put_contents( $dir . '/connected-entry-acceptance.json', json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . PHP_EOL );
echo 'GPP_CONNECTED_ENTRY_ACCEPTANCE_PASS' . PHP_EOL;
