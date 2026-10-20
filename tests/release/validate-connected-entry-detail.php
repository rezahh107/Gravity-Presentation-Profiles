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
$stage_snapshots = array(
    'initial' => $adopted,
    'empty' => $empty,
    'stale' => $stale,
    'requalified' => $requalified,
);
$reports = array();
foreach ( array( 'initial', 'empty', 'stale', 'requalified' ) as $stage ) {
    $host = $read( 'connected-entry-host-' . $stage );
    $view = $read( 'connected-entry-' . $stage );
    $expected = $stage_snapshots[ $stage ];
    $check( ( $host['binding_identity'] ?? null ) === ( $expected['binding']['activation'] ?? null ),
        'host_binding_identity_not_connected_' . $stage );
    foreach ( array( 'entry.created_at', 'workflow.current_step', 'workflow.status',
        'student.first_name', 'student.last_name', 'student.home_phone' ) as $key ) {
        $source = $binding( $expected, $key );
        $seen = $host['binding_source_refs'][ $key ] ?? null;
        $check( is_array( $source ) && is_array( $seen )
            && ( $source['state'] ?? null ) === ( $seen['state'] ?? null )
            && ( $source['source_ref'] ?? null ) === ( $seen['source_ref'] ?? null ),
            'native_host_source_not_bound_to_lifecycle_' . $stage . '_' . $key );
    }
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
    $placeholder = array(
        'initial' => 'نگاشت نشده', 'empty' => 'ثبت نشده',
        'stale' => 'نگاشت معتبر نیست', 'requalified' => 'ثبت نشده',
    );
    $check( ( $view['host']['homePhone'] ?? null ) === $placeholder[ $stage ]
        && ( $view['host']['mobile'] ?? null ) === 'نگاشت نشده',
        'browser_did_not_witness_stage_specific_degradation_' . $stage );
    $native = $view['native'] ?? null;
    $actions = array_column( (array) ( $native['nativeActions'] ?? array() ), 'value' );
    $check( is_array( $native )
        && ( $native['nativeListPresent'] ?? false ) === true
        && ( $native['nativeListVisible'] ?? true ) === false
        && ( $native['statusCount'] ?? 0 ) === 1
        && ( $native['statusVisible'] ?? false ) === true
        && ( $native['statusInsideDossier'] ?? true ) === false
        && ( $native['nativeNonce'] ?? false ) === true
        && ( $native['nativeNote'] ?? false ) === true
        && ( $native['timelineVisible'] ?? false ) === true
        && ( $native['timelineInsideDossier'] ?? true ) === false
        && ( $native['nativePrint'] ?? false ) === true
        && ( $native['dossierPrint'] ?? 0 ) === 1
        && is_numeric( $native['overlap'] ?? null ) && $native['overlap'] < 1
        && count( $actions ) === 3
        && count( array_diff( array( 'approved', 'rejected', 'revert' ), $actions ) ) === 0
        && count( array_filter( (array) ( $native['nativeActions'] ?? array() ),
            static function ( $button ) { return ( $button['disabled'] ?? true ) === true; } ) ) === 0,
        'native_controls_or_suppression_unwitnessed_' . $stage );
    $check( ( $host['native_created_at'] ?? null ) === ( $fixture['expected_native_created_at'] ?? null )
        && is_string( $host['native_created_at'] ?? null ) && '' !== $host['native_created_at'],
        'date_creation_source_not_independently_witnessed_' . $stage );
    $check( ( $host['date_source'] ?? null ) === array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' )
        && ( $host['date_display_provenance'] ?? null ) === 'gfapi_date_created_via_existing_bound_host_value_reader'
        && is_string( $host['native_created_display'] ?? null ) && '' !== $host['native_created_display']
        && ( $view['host']['entryCreated'] ?? null ) === $host['native_created_display'],
        'displayed_creation_date_not_connected_to_host_date_provider_' . $stage );
    $status = $view['workflow_status_evidence'] ?? null;
    $check( is_array( $status )
        && ( $status['native_raw'] ?? null ) === $host['native_status']
        && ( $status['source'] ?? null ) === 'actual_native_browser_dom'
        && is_array( $status['candidates'] ?? null )
        && ( $status['inspection']['statusBoxPresent'] ?? false ) === true
        && ( $status['inspection']['source'] ?? null ) === 'native_status_box_visible_innerText'
        && is_int( $status['inspection']['nativeStatusLineCount'] ?? null )
        && $status['inspection']['nativeStatusLineCount'] === count( $status['candidates'] ),
        'native_status_inspection_evidence_missing_' . $stage );
    // The pinned native English Approval panel displays "Status: Pending".
    // The exact native status value is sourced from Gravity_Flow_API.
    if ( 'pending' === $host['native_status'] ) {
        $check( count( $status['candidates'] ) === 1,
            'pinned_native_visible_status_line_not_found_' . $stage );
    }
    if ( count( $status['candidates'] ) > 0 ) {
        $check( ( $status['result'] ?? null ) === 'COMPARABLE_VISIBLE_MATCH',
            'comparable_native_status_not_proven_' . $stage );
        foreach ( $status['candidates'] as $candidate ) {
            $check( ( $candidate['selector'] ?? null ) === '.gravityflow-status-box'
                && ( $candidate['label'] ?? null ) === 'Status'
                && is_string( $candidate['text'] ?? null )
                && strtolower( $candidate['text'] ) === strtolower( $host['native_status'] ),
                'native_visible_status_mismatch_' . $stage );
        }
    } else {
        $check( ( $status['result'] ?? null ) === 'NOT_PROVEN_VISIBLE_EQUIVALENCE',
            'unsupported_native_status_equivalence_claim_' . $stage );
    }
    $check( $view['host']['currentStep'] === $host['native_step_name']
        && $view['host']['first'] === $host['native_first_raw']
        && $view['host']['last'] === $host['native_last_raw'],
        'browser_not_reading_actual_host_values_' . $stage );
    $check( ( $host['phone_source_exists'] ?? null ) === ( $stage === 'empty' || $stage === 'requalified' ),
        'stale_source_or_rebound_status_inaccurate_' . $stage );
    $route = $view['native']['nativeRoute'] ?? '';
    $url = $view['native']['nativeUrl'] ?? '';
    $parts = is_string( $url ) ? parse_url( $url ) : false;
    $query = array();
    if ( is_array( $parts ) ) parse_str( $parts['query'] ?? '', $query );
    $check( is_string( $route ) && str_contains( $route, 'page=gravityflow-inbox' )
        && ( $query['page'] ?? null ) === 'gravityflow-inbox'
        && ( $query['view'] ?? null ) === 'entry'
        && (string) ( $query['id'] ?? '' ) === (string) $fixture['form_id']
        && (string) ( $query['lid'] ?? '' ) === (string) $fixture['entry_id'],
        'browser_not_at_native_entry_detail_route_' . $stage );
    $check( count( $view['viewports'] ) === 4
        && array_column( $view['viewports'], 'width' ) === array( 1440, 414, 390, 320 )
        && count( array_filter( $view['viewports'], static function ( $v ) {
            return ( $v['dossierVisible'] ?? false ) !== true
                || ! is_numeric( $v['regionScrollWidth'] ?? null )
                || ! is_numeric( $v['regionClientWidth'] ?? null )
                || $v['regionScrollWidth'] > $v['regionClientWidth'] + 3
                || ! is_numeric( $v['statusOverlap'] ?? null ) || $v['statusOverlap'] >= 1;
        } ) ) === 0
        && ( $view['text_200_percent']['dossierVisible'] ?? false ) === true
        && is_numeric( $view['text_200_percent']['overlap'] ?? null )
        && $view['text_200_percent']['overlap'] < 1
        && ( $view['text_200_percent']['fontSize'] ?? null ) !== '16px'
        && ( $view['keyboard_focus_native_control'] ?? false ) === true,
        'viewport_or_keyboard_evidence_missing_' . $stage );
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
$personal = array(
    'first_name' => $fixture['expected_first_name_value'],
    'last_name' => $fixture['expected_last_name_value'],
    'choice_raw' => $fixture['expected_choice']['host_raw_value'],
    'choice_display' => $fixture['expected_choice']['host_display_value'],
    'alternate_display' => $fixture['expected_alternate_choice']['host_display_value'],
);
$check( count( array_unique( array_values( $personal ) ) ) === count( $personal ),
    'native_personal_sentinels_must_be_distinct' );
foreach ( array( 'initial', 'empty', 'stale', 'requalified' ) as $stage ) {
    $host = $read( 'connected-entry-host-' . $stage );
    $check( ( $host['personal_sentinels'] ?? null ) === $personal,
        'disconnected_native_personal_sentinels_' . $stage );
}
$negative = $authorized['unauthorized_viewer'] ?? array();
$keys = array_keys( $personal );
$checked = $negative['tested_sentinel_keys'] ?? null;
$check( is_array( $checked ) && count( $checked ) === count( $keys )
    && count( array_diff( $keys, $checked ) ) === 0
    && count( array_diff( $checked, $keys ) ) === 0
    && ( $negative['sentinel_count'] ?? null ) === count( $keys )
    && ( $negative['surname_only_mutation_detected'] ?? false ) === true
    && ( $negative['source'] ?? null ) === 'native_http_403_full_dom_text_attributes_live_controls'
    && ( $negative['exposed_sentinel_keys'] ?? null ) === array(),
    'unauthorized_native_personal_coverage_missing' );
// The HTTP 403 is authority evidence, not merely a field written to a report.
$check( ( $negative['http_status'] ?? null ) === 403, 'native_denial_http_403_not_proven' );
$dom_scan = $negative['dom_scan'] ?? null;
$check( is_array( $dom_scan )
    && ( $dom_scan['coverage'] ?? null ) === array( 'text' => true, 'attributes' => true, 'controls' => true )
    && ( $dom_scan['initial'] ?? null ) === array()
    && ( $dom_scan['after_challenges'] ?? null ) === array(),
    'native_denial_dom_location_coverage_not_proven' );
$expected_probes = array(
    'attribute_only' => array( 'key' => 'choice_display', 'locations' => array( 'attributes' ) ),
    'input_value_only' => array( 'key' => 'choice_raw', 'locations' => array( 'controls' ) ),
    'textarea_value_only' => array( 'key' => 'alternate_display', 'locations' => array( 'controls' ) ),
    'surname_only' => array( 'key' => 'last_name', 'locations' => array( 'text' ) ),
);
foreach ( $expected_probes as $name => $result ) {
    $check( ( $dom_scan['negative_challenges'][ $name ] ?? null ) === array( $result ),
        'native_denial_dom_location_falsification_missing_' . $name );
}
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
