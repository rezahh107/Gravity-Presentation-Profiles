<?php
/** Verify the real Gravity Forms Add-On settings-save Entry Detail transition. */
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$form_id = (int) getenv( 'WU18_SETUP_FORM_ID' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || $form_id <= 0 ) {
    fwrite( STDERR, "WU18 native settings verification requires artifact directory and form id.\n" );
    exit( 1 );
}

$read = static function ( $name ) use ( $artifact_dir ) {
    $path = rtrim( $artifact_dir, '/\\' ) . '/' . $name;
    $value = json_decode( (string) file_get_contents( $path ), true );
    if ( ! is_array( $value ) ) {
        throw new RuntimeException( 'Invalid native settings evidence: ' . $name );
    }
    return $value;
};

$before = $read( 'wu18-entry-detail-setup-native-before.json' );
$after = $read( 'wu18-entry-detail-setup-native-after.json' );
$rerun = $read( 'wu18-entry-detail-setup-native-rerun.json' );
$context = $read( 'wu18-admin-settings-context.json' );
$errors = array();

$before_status = $before['workflow_status']['state'] ?? null;
$after_status = $after['workflow_status']['state'] ?? null;
$after_source = $after['workflow_status']['source_ref'] ?? null;
$before_binding = $before['binding_activation'] ?? null;
$after_binding = $after['binding_activation'] ?? null;
$rerun_binding = $rerun['binding_activation'] ?? null;
$before_entry_detail = $before['active_profiles']['gravity_flow.entry_detail'] ?? null;
$after_entry_detail = $after['active_profiles']['gravity_flow.entry_detail'] ?? null;
$rerun_entry_detail = $rerun['active_profiles']['gravity_flow.entry_detail'] ?? null;

if ( 'PROVEN' === $before_status ) $errors[] = 'before_workflow_status_already_proven';
if ( 'PROVEN' !== $after_status ) $errors[] = 'after_workflow_status_not_proven';
if ( ! is_array( $after_source )
    || 'gravity_flow.state' !== ( $after_source['type'] ?? null )
    || 'status' !== ( $after_source['state_key'] ?? null ) ) {
    $errors[] = 'workflow_status_source_mismatch';
}
if ( ! is_array( $before_binding ) || ! is_array( $after_binding )
    || ( $before_binding['binding_set_id'] ?? null ) !== ( $after_binding['binding_set_id'] ?? null )
    || ( $before_binding['binding_set_version'] ?? null ) === ( $after_binding['binding_set_version'] ?? null ) ) {
    $errors[] = 'binding_transition_invalid';
}
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
    if ( ( $after_binding['binding_set_version'] ?? null ) !== ( $diagnostic['binding_set']['binding_set_version'] ?? null ) ) {
        $errors[] = 'diagnostic_binding_identity_mismatch';
    }
    if ( 'srwf.operations.entry-detail.v1' !== ( $diagnostic['entry_detail_activation']['profile_id'] ?? null ) ) {
        $errors[] = 'diagnostic_activation_identity_mismatch';
    }
    foreach ( array( 'entry_id', 'user_id', 'message', 'exception', 'stack_trace' ) as $forbidden ) {
        if ( array_key_exists( $forbidden, $diagnostic ) ) $errors[] = 'diagnostic_forbidden_' . $forbidden;
    }
}

if ( $after_binding !== $rerun_binding ) $errors[] = 'rerun_binding_activation_changed';
if ( ( $after['workflow_status'] ?? null ) !== ( $rerun['workflow_status'] ?? null ) ) $errors[] = 'rerun_workflow_status_changed';
if ( $after_entry_detail !== $rerun_entry_detail ) $errors[] = 'rerun_entry_detail_activation_changed';
foreach ( array( 'gravity_flow.inbox', 'print.dossier' ) as $surface ) {
    if ( ( $after['active_profiles'][ $surface ] ?? null ) !== ( $rerun['active_profiles'][ $surface ] ?? null ) ) {
        $errors[] = 'rerun_' . str_replace( '.', '_', $surface ) . '_activation_changed';
    }
}
$rerun_diagnostic = $rerun['entry_detail_setup_diagnostic'] ?? null;
if ( ! is_array( $rerun_diagnostic )
    || 'COMPLETED' !== ( $rerun_diagnostic['result'] ?? null )
    || 'entry_detail_setup_completed' !== ( $rerun_diagnostic['reason_code'] ?? null ) ) {
    $errors[] = 'rerun_diagnostic_missing_or_incorrect';
}

if ( 'gravity_forms_addon_settings_current_screen' !== ( $context['request_context'] ?? null )
    || true !== ( $context['gravity_flow_api_available'] ?? null )
    || true !== ( $context['form_bound_api_constructible'] ?? null ) ) {
    $errors[] = 'settings_host_api_unavailable';
}
foreach ( array( 'get_current_step', 'get_status' ) as $method ) {
    $fact = $context[ $method ] ?? null;
    if ( ! is_array( $fact )
        || true !== ( $fact['public'] ?? null )
        || false !== ( $fact['static'] ?? null )
        || 1 !== ( $fact['required_parameters'] ?? null ) ) {
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

$result = array(
    'schema_version' => '1.0.0',
    'result' => empty( $errors ) ? 'PASS' : 'FAIL',
    'errors' => $errors,
    'form_id' => $form_id,
    'settings_owner' => 'gravity_forms_addon_settings_api',
    'before_binding_version' => $before_binding['binding_set_version'] ?? null,
    'after_binding_version' => $after_binding['binding_set_version'] ?? null,
    'workflow_status_before' => $before_status,
    'workflow_status_after' => $after_status,
    'entry_detail_before' => $before_entry_detail,
    'entry_detail_after' => $after_entry_detail,
    'inbox_preserved' => ( $before['active_profiles']['gravity_flow.inbox'] ?? null ) === ( $after['active_profiles']['gravity_flow.inbox'] ?? null ),
    'print_preserved' => ( $before['active_profiles']['print.dossier'] ?? null ) === ( $after['active_profiles']['print.dossier'] ?? null ),
    'rerun_idempotent' => $after_binding === $rerun_binding
        && ( $after['workflow_status'] ?? null ) === ( $rerun['workflow_status'] ?? null )
        && $after_entry_detail === $rerun_entry_detail,
    'support_diagnostic' => $diagnostic,
);
file_put_contents(
    rtrim( $artifact_dir, '/\\' ) . '/wu18-entry-detail-native-settings-transition.json',
    json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

if ( ! empty( $errors ) ) {
    fwrite( STDERR, implode( "\n", $errors ) . "\n" );
    exit( 1 );
}

echo "WU18_ENTRY_DETAIL_NATIVE_SETTINGS_TRANSITION_PASS\n";
