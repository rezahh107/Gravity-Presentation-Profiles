<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationModel;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$flow_source = getenv( 'WU21_GRAVITYFLOW_SOURCE' );
if ( ! $artifact_dir || ! $flow_source ) {
    throw new RuntimeException( 'WU18 runtime tests require WU21 artifact/source environment.' );
}

$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_array( $manifest ) ) {
    throw new RuntimeException( 'WU18 fixture manifest is unavailable.' );
}

$results = array();
function wu18_runtime_test( $id, $name, $callback ) {
    global $results;
    try {
        $details = $callback();
        $results[] = array( 'id' => $id, 'name' => $name, 'status' => 'PASS', 'details' => $details );
    } catch ( Throwable $exception ) {
        $results[] = array(
            'id' => $id,
            'name' => $name,
            'status' => 'FAIL',
            'details' => array( 'error' => $exception->getMessage() ),
        );
    }
}
function wu18_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}
function wu18_active_binding_sets() {
    $lifecycle = new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate( array() )
    );
    $state = $lifecycle->snapshot();
    $active = array();
    foreach ( $state['activations'] as $context_key => $identity ) {
        $id = isset( $identity['binding_set_id'] ) ? $identity['binding_set_id'] : null;
        $version = isset( $identity['binding_set_version'] ) ? $identity['binding_set_version'] : null;
        if ( ! $id || ! $version || ! isset( $state['installed'][ $id ][ $version ] ) ) {
            continue;
        }
        $record = $state['installed'][ $id ][ $version ];
        if ( isset( $record['context_key'], $record['artifact'] ) && $record['context_key'] === $context_key ) {
            $active[] = $record['artifact'];
        }
    }
    return $active;
}
function wu18_model() {
    $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
    $profile = $visual->effectiveProfile( 'gravity_flow.entry_detail' );
    $activation = $visual->resolve( 'gravity_flow.entry_detail' );
    $snapshot = $visual->snapshot();
    wu18_assert( is_array( $profile ) && is_array( $activation ), 'Entry Detail visual activation is missing.' );
    $package = $snapshot['installed'][ $activation['package_id'] ][ $activation['package_version'] ]['artifact'];
    return new EntryDetailPresentationModel( $profile, wu18_active_binding_sets(), $package['semantic_slots'] );
}
function wu18_entry( $key ) {
    global $manifest;
    $entry = GFAPI::get_entry( (int) $manifest['forms'][ $key ]['entry_id'] );
    wu18_assert( is_array( $entry ), 'Synthetic WU18 entry unavailable: ' . $key );
    return $entry;
}
function wu18_step( $key, $entry ) {
    global $manifest;
    $api = new Gravity_Flow_API( (int) $manifest['forms'][ $key ]['form_id'] );
    $step = $api->get_current_step( $entry );
    wu18_assert( is_object( $step ), 'Synthetic WU18 current step unavailable: ' . $key );
    return $step;
}
function wu18_bound_source( EntryDetailPresentationModel $model, $entry, $slot ) {
    $resolved = $model->resolve( $entry, $slot );
    wu18_assert( ! empty( $resolved['resolved'] ) && ! empty( $resolved['source_ref'] ), 'Slot is not resolved: ' . $slot );
    return $resolved['source_ref'];
}

wu18_runtime_test( 'WU18-PHP-001', 'pinned Entry Detail hook executes only after native permission gate', function () use ( $flow_source ) {
    $path = $flow_source . '/includes/pages/class-entry-detail.php';
    $source = file_get_contents( $path );
    wu18_assert( is_string( $source ), 'Pinned Entry Detail source is unreadable.' );
    $permission = strpos( $source, "apply_filters( 'gravityflow_permission_granted_entry_detail'" );
    $deny_return = strpos( $source, 'return;', $permission );
    $before = strpos( $source, "do_action( 'gravityflow_entry_detail_content_before'" );
    wu18_assert( false !== $permission && false !== $deny_return && false !== $before && $permission < $deny_return && $deny_return < $before, 'Entry Detail hook is not demonstrably downstream of the native permission gate.' );
    return array( 'source' => 'includes/pages/class-entry-detail.php', 'ordering' => 'permission_gate_then_return_then_content_before' );
} );

wu18_runtime_test( 'WU18-PHP-002', 'pinned source exposes admitted native regions actions and file lifecycle', function () use ( $flow_source ) {
    $detail = file_get_contents( $flow_source . '/includes/pages/class-entry-detail.php' );
    $approval = file_get_contents( $flow_source . '/includes/steps/class-step-approval.php' );
    $file_field = file_get_contents( WP_PLUGIN_DIR . '/gravityforms/includes/fields/class-gf-field-fileupload.php' );
    foreach ( array( 'gravityflow-instructions', 'entry-detail-view', 'gravityflow-status-box-container', 'detail-view-print', 'gravityflow-timeline', 'gravityflow-back-link-container' ) as $needle ) {
        wu18_assert( false !== strpos( $detail, $needle ), 'Missing native Entry Detail source marker: ' . $needle );
    }
    foreach ( array( 'gravityflow_approve_label_workflow_detail', 'gravityflow_reject_label_workflow_detail', "value=\"approved\"", "value=\"rejected\"" ) as $needle ) {
        wu18_assert( false !== strpos( $approval, $needle ), 'Missing native Approval source marker: ' . $needle );
    }
    wu18_assert( false !== strpos( $file_field, 'function to_array' ) && false !== strpos( $file_field, 'function get_download_url' ), 'Pinned Gravity Forms fileupload lifecycle methods are unavailable.' );
    return array( 'native_regions' => true, 'native_approval' => true, 'host_file_api' => true );
} );

wu18_runtime_test( 'WU18-PHP-003', 'shared Entry Detail profile resolves independently from form-local bindings', function () {
    $model = wu18_model();
    $alpha = wu18_entry( 'alpha' );
    $beta = wu18_entry( 'beta' );
    wu18_assert( 'shared.entry_detail.v1' === $model->profileId(), 'Shared Entry Detail profile changed.' );
    $alpha_name = wu18_bound_source( $model, $alpha, 'student.full_name' );
    $beta_name = wu18_bound_source( $model, $beta, 'student.full_name' );
    wu18_assert( (string) $alpha_name['field_id'] !== (string) $beta_name['field_id'], 'Synthetic forms did not exercise distinct semantic field bindings.' );
    return array( 'profile_id' => $model->profileId(), 'alpha_name_field' => $alpha_name['field_id'], 'beta_name_field' => $beta_name['field_id'] );
} );

wu18_runtime_test( 'WU18-PHP-004', 'required dossier semantics are ready while optional NOT_PROVEN photo fails closed locally', function () {
    $model = wu18_model();
    $alpha = wu18_entry( 'alpha' );
    $beta = wu18_entry( 'beta' );
    wu18_assert( $model->isPresentationReady( $alpha ), 'Alpha dossier is not presentation-ready.' );
    wu18_assert( $model->isPresentationReady( $beta ), 'Beta dossier should remain ready with optional photo NOT_PROVEN.' );
    $beta_photo = $model->resolve( $beta, 'student.photo' );
    wu18_assert( empty( $beta_photo['resolved'] ) && 'NOT_PROVEN' === $beta_photo['state'], 'Optional Beta photo did not fail closed.' );
    return array( 'alpha_ready' => true, 'beta_ready' => true, 'beta_photo' => 'NOT_PROVEN' );
} );

wu18_runtime_test( 'WU18-PHP-005', 'semantic source proof alone never grants editability', function () {
    $model = wu18_model();
    $alpha = wu18_entry( 'alpha' );
    wu18_assert( ! empty( $model->resolve( $alpha, 'student.mobile' )['resolved'] ), 'Synthetic student.mobile source is not resolved.' );
    wu18_assert( ! $model->runtimeClaimIsProven( $alpha, 'student.mobile', 'editability' ), 'Semantic binding incorrectly implied editability.' );
    return array( 'source' => 'PROVEN', 'editability' => 'NOT_PROVEN' );
} );

wu18_runtime_test( 'WU18-PHP-006', 'operator runtime is authentic read-only Approval context', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    $entry = wu18_entry( 'alpha' );
    $step = wu18_step( 'alpha', $entry );
    wu18_assert( 'approval' === $step->get_type(), 'Current step is not native Approval.' );
    wu18_assert( Gravity_Flow_Entry_Detail::can_update( $step ), 'Synthetic operator is not the current native assignee.' );
    wu18_assert( array() === $step->get_editable_fields(), 'Native current step exposes editable fields unexpectedly.' );
    wu18_assert( empty( $step->revertEnable ), 'Native Approval exposes Revert unexpectedly.' );
    wu18_assert( ! empty( $step->instructionsEnable ) && ! empty( $step->instructionsValue ), 'Native instructions are unavailable.' );
    wu18_assert( ! GFAPI::current_user_can_any( 'gravityflow_workflow_detail_admin_actions' ), 'Synthetic operator unexpectedly owns broader admin transitions.' );
    return array( 'step_type' => 'approval', 'can_update' => true, 'editable_fields' => 0, 'revert' => false, 'instructions' => true );
} );

wu18_runtime_test( 'WU18-PHP-007', 'Approval action permission stays independently proven', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    $model = wu18_model();
    $entry = wu18_entry( 'alpha' );
    wu18_assert( $model->runtimeClaimIsProven( $entry, 'workflow.approve_action', 'action_permission' ), 'Approve action permission claim is not PROVEN.' );
    wu18_assert( $model->runtimeClaimIsProven( $entry, 'workflow.reject_action', 'action_permission' ), 'Reject action permission claim is not PROVEN.' );
    return array( 'approve' => 'PROVEN', 'reject' => 'PROVEN' );
} );

wu18_runtime_test( 'WU18-PHP-008', 'bound image and non-image documents use authentic Gravity Forms file representation', function () {
    $model = wu18_model();
    $out = array();
    foreach ( array( 'alpha', 'beta' ) as $key ) {
        $entry = wu18_entry( $key );
        $form = GFAPI::get_form( (int) $entry['form_id'] );
        $source = wu18_bound_source( $model, $entry, 'documents.report_card' );
        $field = GFAPI::get_field( $form, $source['field_id'] );
        wu18_assert( is_object( $field ) && 'fileupload' === $field->type, 'Bound report-card field is not host fileupload: ' . $key );
        $raw = $entry[ (string) $source['field_id'] ];
        $files = $field->to_array( $raw );
        wu18_assert( 1 === count( $files ), 'Host fileupload did not normalize one synthetic file: ' . $key );
        $url = $field->get_download_url( $files[0], false, (int) $entry['id'] );
        wu18_assert( is_string( $url ) && '' !== $url, 'Host safe download URL unavailable: ' . $key );
        $type = wp_check_filetype( (string) parse_url( $files[0], PHP_URL_PATH ) );
        $out[ $key ] = array( 'mime' => $type['type'], 'safe_download_url' => true );
    }
    wu18_assert( 0 === strpos( $out['alpha']['mime'], 'image/' ), 'Alpha report card is not an authentic image representation.' );
    wu18_assert( 0 !== strpos( (string) $out['beta']['mime'], 'image/' ), 'Beta report card should exercise non-image representation.' );
    return $out;
} );

wu18_runtime_test( 'WU18-PHP-009', 'native Entry Detail authorization denies an unassigned user', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['denied_user']['id'] );
    $entry = wu18_entry( 'alpha' );
    $form = GFAPI::get_form( (int) $entry['form_id'] );
    $step = wu18_step( 'alpha', $entry );
    wu18_assert( ! Gravity_Flow_Entry_Detail::can_update( $step ), 'Denied user unexpectedly became current assignee.' );
    wu18_assert( ! Gravity_Flow_Entry_Detail::is_permission_granted( $entry, $form, $step ), 'Native Entry Detail permission gate granted unassigned user access.' );
    return array( 'can_update' => false, 'permission_granted' => false );
} );

wu18_runtime_test( 'WU18-PHP-010', 'production Entry Detail code contains no synthetic or target form field step page identity', function () {
    $adapter = file_get_contents( WP_PLUGIN_DIR . '/gravity-presentation-profiles/src/SRWF/GravityFlow/EntryDetailPresentationAdapter.php' );
    $model = file_get_contents( WP_PLUGIN_DIR . '/gravity-presentation-profiles/src/SRWF/GravityFlow/EntryDetailPresentationModel.php' );
    $combined = $adapter . "\n" . $model;
    foreach ( array( 'WU18 Alpha', 'WU18 Beta', 'wu18.sim.', 'wu21-sim-installation', 'field_id => 1', 'form_id => 1', 'step_id => 1', 'page_id => 1' ) as $needle ) {
        wu18_assert( false === strpos( $combined, $needle ), 'Production code contains synthetic/target identity: ' . $needle );
    }
    return array( 'identity_selection' => 'surface_profile_plus_environment_binding_only' );
} );

wp_set_current_user( 0 );
file_put_contents(
    $artifact_dir . '/wu18-runtime-results.json',
    wp_json_encode( array( 'suite' => 'WU18 pinned native runtime', 'results' => $results ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

foreach ( $results as $result ) {
    echo $result['status'] . ' ' . $result['id'] . ' ' . $result['name'] . "\n";
}
if ( count( array_filter( $results, static function ( $result ) { return 'PASS' !== $result['status']; } ) ) > 0 ) {
    exit( 1 );
}
