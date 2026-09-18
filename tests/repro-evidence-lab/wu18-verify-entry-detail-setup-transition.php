<?php
/** Verify retained state from the authentic Entry Detail settings submission. */
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$form_id = (int) getenv( 'WU18_SETUP_FORM_ID' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || $form_id <= 0 ) {
    fwrite( STDERR, "WU18 setup transition verification requires artifact directory and form id.\n" );
    exit( 1 );
}

$read = static function ( $name ) use ( $artifact_dir ) {
    $path = rtrim( $artifact_dir, '/\\' ) . '/' . $name;
    $value = json_decode( (string) file_get_contents( $path ), true );
    if ( ! is_array( $value ) ) {
        throw new RuntimeException( 'Invalid retained setup evidence: ' . $name );
    }
    return $value;
};

$before = $read( 'wu18-entry-detail-setup-before.json' );
$after = $read( 'wu18-entry-detail-setup-after.json' );
$rerun = file_exists( rtrim( $artifact_dir, '/\\' ) . '/wu18-entry-detail-setup-rerun.json' )
    ? $read( 'wu18-entry-detail-setup-rerun.json' )
    : null;
$context = $read( 'wu18-admin-settings-context.json' );
$errors = array();

$before_status = isset( $before['workflow_status']['state'] ) ? $before['workflow_status']['state'] : null;
$after_status = isset( $after['workflow_status']['state'] ) ? $after['workflow_status']['state'] : null;
$after_source = isset( $after['workflow_status']['source_ref'] ) ? $after['workflow_status']['source_ref'] : null;
if ( 'PROVEN' === $before_status ) $errors[] = 'before_workflow_status_already_proven';
if ( 'PROVEN' !== $after_status ) $errors[] = 'after_workflow_status_not_proven';
if ( ! is_array( $after_source ) || 'gravity_flow.state' !== ( $after_source['type'] ?? null ) || 'status' !== ( $after_source['state_key'] ?? null ) ) {
    $errors[] = 'workflow_status_source_mismatch';
}

$before_binding_version = $before['binding_activation']['binding_set_version'] ?? null;
$after_binding_version = $after['binding_activation']['binding_set_version'] ?? null;
if ( ! is_string( $before_binding_version ) || ! is_string( $after_binding_version ) || $before_binding_version === $after_binding_version ) {
    $errors[] = 'binding_version_did_not_advance';
}
if ( ( $before['binding_activation']['binding_set_id'] ?? null ) !== ( $after['binding_activation']['binding_set_id'] ?? null ) ) {
    $errors[] = 'binding_set_identity_changed';
}

$before_entry_detail = $before['active_profiles']['gravity_flow.entry_detail'] ?? null;
$after_entry_detail = $after['active_profiles']['gravity_flow.entry_detail'] ?? null;
if ( null !== $before_entry_detail ) $errors[] = 'entry_detail_was_active_before_setup';
if ( ! is_array( $after_entry_detail ) || 'srwf.operations.entry-detail.v1' !== ( $after_entry_detail['profile_id'] ?? null ) ) {
    $errors[] = 'entry_detail_not_activated';
}
foreach ( array( 'gravity_flow.inbox', 'print.dossier' ) as $surface ) {
    if ( ( $before['active_profiles'][ $surface ] ?? null ) !== ( $after['active_profiles'][ $surface ] ?? null ) ) {
        $errors[] = str_replace( '.', '_', $surface ) . '_activation_changed';
    }
}

$diagnostic = $after['entry_detail_setup_diagnostic'] ?? null;
if ( ! is_array( $diagnostic )
    || true !== ( $diagnostic['attempted'] ?? null )
    || $form_id !== ( $diagnostic['selected_form_id'] ?? null )
    || 'COMPLETED' !== ( $diagnostic['result'] ?? null )
    || 'cross_surface_preservation' !== ( $diagnostic['step'] ?? null )
    || 'entry_detail_setup_completed' !== ( $diagnostic['reason_code'] ?? null ) ) {
    $errors[] = 'success_diagnostic_missing_or_incorrect';
}
if ( is_array( $diagnostic ) ) {
    if ( $after_binding_version !== ( $diagnostic['binding_set']['binding_set_version'] ?? null ) ) {
        $errors[] = 'diagnostic_binding_identity_mismatch';
    }
    if ( 'srwf.operations.entry-detail.v1' !== ( $diagnostic['entry_detail_activation']['profile_id'] ?? null ) ) {
        $errors[] = 'diagnostic_activation_identity_mismatch';
    }
    foreach ( array( 'entry_id', 'user_id', 'message', 'exception', 'stack_trace' ) as $forbidden ) {
        if ( array_key_exists( $forbidden, $diagnostic ) ) $errors[] = 'diagnostic_forbidden_' . $forbidden;
    }
}

if ( 'gravity_forms_addon_settings_current_screen' !== ( $context['request_context'] ?? null )
    || true !== ( $context['gravity_flow_api_available'] ?? null )
    || true !== ( $context['form_bound_api_constructible'] ?? null ) ) {
    $errors[] = 'settings_host_api_unavailable';
}
foreach ( array( 'get_current_step', 'get_status' ) as $method ) {
    $fact = $context[ $method ] ?? null;
    if ( ! is_array( $fact ) || true !== ( $fact['public'] ?? null ) || false !== ( $fact['static'] ?? null ) || 1 !== ( $fact['required_parameters'] ?? null ) ) {
        $errors[] = 'settings_host_api_contract_' . $method;
    }
}

$runtime = $after['runtime'] ?? array();
foreach ( array(
    'wordpress_version' => '7.1.1',
    'php_version' => '8.3.33',
    'gravity_forms_version' => '3.1.1.1',
    'gravity_flow_version' => '3.1.0',
) as $key => $expected ) {
    if ( $expected !== ( $runtime[ $key ] ?? null ) ) $errors[] = 'runtime_' . $key . '_mismatch';
}

$rerun_idempotent = null;
if ( is_array( $rerun ) ) {
    $rerun_idempotent = ( $rerun['binding_activation'] ?? null ) === ( $after['binding_activation'] ?? null )
        && ( $rerun['active_profiles'] ?? null ) === ( $after['active_profiles'] ?? null )
        && 'PROVEN' === ( $rerun['workflow_status']['state'] ?? null );
    if ( ! $rerun_idempotent ) $errors[] = 'setup_rerun_not_idempotent';
}

$result = array(
    'schema_version' => '1.1.0',
    'result' => empty( $errors ) ? 'PASS' : 'FAIL',
    'errors' => $errors,
    'before_binding_version' => $before_binding_version,
    'after_binding_version' => $after_binding_version,
    'workflow_status_before' => $before_status,
    'workflow_status_after' => $after_status,
    'entry_detail_before' => $before_entry_detail,
    'entry_detail_after' => $after_entry_detail,
    'inbox_preserved' => ( $before['active_profiles']['gravity_flow.inbox'] ?? null ) === ( $after['active_profiles']['gravity_flow.inbox'] ?? null ),
    'print_preserved' => ( $before['active_profiles']['print.dossier'] ?? null ) === ( $after['active_profiles']['print.dossier'] ?? null ),
    'settings_host_api_available' => true === ( $context['gravity_flow_api_available'] ?? null ),
    'settings_host_api_loaded_before_autoload_check' => true === ( $context['gravity_flow_api_loaded_before_autoload_check'] ?? null ),
    'rerun_idempotent' => $rerun_idempotent,
    'support_diagnostic' => $diagnostic,
);

file_put_contents(
    rtrim( $artifact_dir, '/\\' ) . '/wu18-entry-detail-setup-transition.json',
    json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

if ( ! empty( $errors ) ) {
    fwrite( STDERR, implode( "\n", $errors ) . "\n" );
    exit( 1 );
}
echo "WU18_ENTRY_DETAIL_SETTINGS_TRANSITION_PASS\n";
