<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationModel;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$flow_source = getenv( 'WU21_GRAVITYFLOW_SOURCE' );
if ( ! $artifact_dir || ! $flow_source ) {
    throw new RuntimeException( 'WU18 runtime tests require WU21 artifact/source environment.' );
}
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    require_once $flow_source . '/includes/pages/class-entry-detail.php';
}

$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_array( $manifest ) ) {
    throw new RuntimeException( 'WU18 fixture manifest is unavailable.' );
}

$results = array();
function wu18_rt_test( $id, $name, $callback ) {
    global $results;
    try {
        $results[] = array( 'id' => $id, 'name' => $name, 'status' => 'PASS', 'details' => $callback() );
    } catch ( Throwable $exception ) {
        $results[] = array( 'id' => $id, 'name' => $name, 'status' => 'FAIL', 'details' => array( 'error' => $exception->getMessage() ) );
    }
}
function wu18_rt_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}
function wu18_rt_active_bindings() {
    $lifecycle = new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
    $state = $lifecycle->snapshot();
    $active = array();
    foreach ( $state['activations'] as $context_key => $identity ) {
        if ( ! isset( $identity['binding_set_id'], $identity['binding_set_version'] ) ) {
            continue;
        }
        $id = $identity['binding_set_id'];
        $version = $identity['binding_set_version'];
        if ( ! isset( $state['installed'][ $id ][ $version ] ) ) {
            continue;
        }
        $record = $state['installed'][ $id ][ $version ];
        if ( isset( $record['context_key'], $record['artifact'] ) && $record['context_key'] === $context_key ) {
            $active[] = $record['artifact'];
        }
    }
    return $active;
}
function wu18_rt_model() {
    $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
    $profile = $visual->effectiveProfile( 'gravity_flow.entry_detail' );
    $activation = $visual->resolve( 'gravity_flow.entry_detail' );
    $snapshot = $visual->snapshot();
    wu18_rt_assert( is_array( $profile ) && is_array( $activation ), 'Entry Detail visual activation is missing.' );
    $package = $snapshot['installed'][ $activation['package_id'] ][ $activation['package_version'] ]['artifact'];
    return new EntryDetailPresentationModel( $profile, wu18_rt_active_bindings(), $package['semantic_slots'] );
}
function wu18_rt_entry( $key ) {
    global $manifest;
    $entry = GFAPI::get_entry( (int) $manifest['forms'][ $key ]['entry_id'] );
    wu18_rt_assert( is_array( $entry ), 'Synthetic WU18 entry unavailable: ' . $key );
    return $entry;
}
function wu18_rt_step( $key, $entry ) {
    global $manifest;
    $api = new Gravity_Flow_API( (int) $manifest['forms'][ $key ]['form_id'] );
    $step = $api->get_current_step( $entry );
    wu18_rt_assert( is_object( $step ), 'Synthetic WU18 current step unavailable: ' . $key );
    return $step;
}
function wu18_rt_source( EntryDetailPresentationModel $model, $entry, $slot ) {
    $resolved = $model->resolve( $entry, $slot );
    wu18_rt_assert( ! empty( $resolved['resolved'] ) && ! empty( $resolved['source_ref'] ), 'Slot is not resolved: ' . $slot );
    return $resolved['source_ref'];
}

wu18_rt_test( 'WU18-PHP-001', 'pinned Entry Detail presentation hook is downstream of native permission denial', function () use ( $flow_source ) {
    $source = file_get_contents( $flow_source . '/includes/pages/class-entry-detail.php' );
    $permission = strpos( $source, "apply_filters( 'gravityflow_permission_granted_entry_detail'" );
    $denied = strpos( $source, 'if ( ! $permission_granted )', $permission );
    $deny_return = strpos( $source, 'return;', $denied );
    $before = strpos( $source, "do_action( 'gravityflow_entry_detail_content_before'" );
    wu18_rt_assert( false !== $permission && false !== $denied && false !== $deny_return && false !== $before, 'Pinned permission/hook source markers are missing.' );
    wu18_rt_assert( $permission < $denied && $denied < $deny_return && $deny_return < $before, 'Presentation hook is not demonstrably downstream of permission denial.' );
    return array( 'source' => 'Gravity Flow 3.1.0 class-entry-detail.php', 'ordering' => 'permission_filter -> denial return -> content_before' );
} );

wu18_rt_test( 'WU18-PHP-002', 'pinned host source exposes native dossier regions actions and file lifecycle', function () use ( $flow_source ) {
    $detail = file_get_contents( $flow_source . '/includes/pages/class-entry-detail.php' );
    $flow = file_get_contents( $flow_source . '/class-gravity-flow.php' );
    $approval = file_get_contents( $flow_source . '/includes/steps/class-step-approval.php' );
    $file_field = file_get_contents( WP_PLUGIN_DIR . '/gravityforms/includes/fields/class-gf-field-fileupload.php' );
    foreach ( array( 'gravityflow-instructions', 'entry-detail-view', 'detail-view-print', 'gravityflow-timeline', 'gravityflow-back-link-container' ) as $needle ) {
        wu18_rt_assert( false !== strpos( $detail, $needle ), 'Missing native Entry Detail marker: ' . $needle );
    }
    wu18_rt_assert( false !== strpos( $flow, 'gravityflow-status-box-container' ), 'Native status/action box source marker is missing.' );
    foreach ( array( 'gravityflow_approve_label_workflow_detail', 'gravityflow_reject_label_workflow_detail', 'value="approved"', 'value="rejected"' ) as $needle ) {
        wu18_rt_assert( false !== strpos( $approval, $needle ), 'Missing native Approval marker: ' . $needle );
    }
    wu18_rt_assert( false !== strpos( $file_field, 'function to_array' ) && false !== strpos( $file_field, 'function get_download_url' ), 'Pinned Gravity Forms file lifecycle API is unavailable.' );
    return array( 'regions' => true, 'approval_actions' => true, 'file_lifecycle' => true );
} );

wu18_rt_test( 'WU18-PHP-003', 'shared profile stays fixed while two forms use different semantic bindings', function () {
    $model = wu18_rt_model();
    $alpha = wu18_rt_entry( 'alpha' );
    $beta = wu18_rt_entry( 'beta' );
    $alpha_source = wu18_rt_source( $model, $alpha, 'student.full_name' );
    $beta_source = wu18_rt_source( $model, $beta, 'student.full_name' );
    wu18_rt_assert( 'shared.entry_detail.v1' === $model->profileId(), 'Shared Entry Detail profile changed.' );
    wu18_rt_assert( (string) $alpha_source['field_id'] !== (string) $beta_source['field_id'], 'Form-local semantic bindings were not independently exercised.' );
    return array( 'profile_id' => $model->profileId(), 'alpha_field' => $alpha_source['field_id'], 'beta_field' => $beta_source['field_id'] );
} );

wu18_rt_test( 'WU18-PHP-004', 'required semantics are ready and optional NOT_PROVEN media fails closed locally', function () {
    $model = wu18_rt_model();
    $alpha = wu18_rt_entry( 'alpha' );
    $beta = wu18_rt_entry( 'beta' );
    wu18_rt_assert( $model->isPresentationReady( $alpha ) && $model->isPresentationReady( $beta ), 'Synthetic dossiers are not both ready.' );
    $beta_photo = $model->resolve( $beta, 'student.photo' );
    wu18_rt_assert( empty( $beta_photo['resolved'] ) && 'NOT_PROVEN' === $beta_photo['state'], 'Optional photo did not fail closed locally.' );
    return array( 'alpha_ready' => true, 'beta_ready' => true, 'beta_photo' => 'NOT_PROVEN' );
} );

wu18_rt_test( 'WU18-PHP-005', 'PROVEN semantic source does not imply editability', function () {
    $model = wu18_rt_model();
    $entry = wu18_rt_entry( 'alpha' );
    wu18_rt_assert( ! empty( $model->resolve( $entry, 'student.mobile' )['resolved'] ), 'Student mobile source is not PROVEN.' );
    wu18_rt_assert( ! $model->runtimeClaimIsProven( $entry, 'student.mobile', 'editability' ), 'Semantic binding incorrectly granted editability.' );
    return array( 'source' => 'PROVEN', 'editability' => 'NOT_PROVEN' );
} );

wu18_rt_test( 'WU18-PHP-006', 'operator context is a native read-only Approval assignment', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    $entry = wu18_rt_entry( 'alpha' );
    $step = wu18_rt_step( 'alpha', $entry );
    wu18_rt_assert( 'approval' === $step->get_type(), 'Current step is not Approval.' );
    wu18_rt_assert( Gravity_Flow_Entry_Detail::can_update( $step ), 'Operator is not the current native assignee.' );
    wu18_rt_assert( array() === $step->get_editable_fields(), 'Native step exposes editable fields unexpectedly.' );
    wu18_rt_assert( empty( $step->revertEnable ), 'Native Approval exposes Revert unexpectedly.' );
    wu18_rt_assert( ! empty( $step->instructionsEnable ) && ! empty( $step->instructionsValue ), 'Native current-step instructions are unavailable.' );
    wu18_rt_assert( ! GFAPI::current_user_can_any( 'gravityflow_workflow_detail_admin_actions' ), 'Operator unexpectedly owns broader admin transitions.' );
    return array( 'approval' => true, 'assignee' => true, 'editable_fields' => 0, 'revert' => false, 'instructions' => true );
} );

wu18_rt_test( 'WU18-PHP-007', 'Approval action permission remains a separate proven runtime claim', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    $model = wu18_rt_model();
    $entry = wu18_rt_entry( 'alpha' );
    wu18_rt_assert( $model->runtimeClaimIsProven( $entry, 'workflow.approve_action', 'action_permission' ), 'Approve action permission is not independently PROVEN.' );
    wu18_rt_assert( $model->runtimeClaimIsProven( $entry, 'workflow.reject_action', 'action_permission' ), 'Reject action permission is not independently PROVEN.' );
    return array( 'approve' => 'PROVEN', 'reject' => 'PROVEN' );
} );

wu18_rt_test( 'WU18-PHP-008', 'image and non-image documents use real bound Gravity Forms file fields', function () {
    $model = wu18_rt_model();
    $out = array();
    foreach ( array( 'alpha', 'beta' ) as $key ) {
        $entry = wu18_rt_entry( $key );
        $form = GFAPI::get_form( (int) $entry['form_id'] );
        $source = wu18_rt_source( $model, $entry, 'documents.report_card' );
        $field = GFAPI::get_field( $form, $source['field_id'] );
        wu18_rt_assert( is_object( $field ) && 'fileupload' === $field->type, 'Report-card source is not a native fileupload field: ' . $key );
        $raw = $entry[ (string) $source['field_id'] ];
        $files = $field->to_array( $raw );
        wu18_rt_assert( 1 === count( $files ), 'Host file representation did not normalize one file: ' . $key );
        $safe = $field->get_download_url( $files[0], false, (int) $entry['id'] );
        wu18_rt_assert( is_string( $safe ) && '' !== $safe, 'Gravity Forms safe download URL is unavailable: ' . $key );
        $type = wp_check_filetype( (string) parse_url( $files[0], PHP_URL_PATH ) );
        $out[ $key ] = array( 'mime' => $type['type'], 'safe_download_url' => true );
    }
    wu18_rt_assert( 0 === strpos( (string) $out['alpha']['mime'], 'image/' ), 'Alpha fixture is not host-recognized image media.' );
    wu18_rt_assert( 0 !== strpos( (string) $out['beta']['mime'], 'image/' ), 'Beta fixture should exercise non-image media.' );
    return $out;
} );

wu18_rt_test( 'WU18-PHP-009', 'native Entry Detail permission denies an unassigned user', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['denied_user']['id'] );
    $entry = wu18_rt_entry( 'alpha' );
    $form = GFAPI::get_form( (int) $entry['form_id'] );
    $step = wu18_rt_step( 'alpha', $entry );
    wu18_rt_assert( ! Gravity_Flow_Entry_Detail::can_update( $step ), 'Denied user unexpectedly became current assignee.' );
    wu18_rt_assert( ! Gravity_Flow_Entry_Detail::is_permission_granted( $entry, $form, $step ), 'Native Entry Detail authorization granted an unassigned user.' );
    return array( 'assignee' => false, 'permission_granted' => false );
} );

wu18_rt_test( 'WU18-PHP-010', 'production adapter contains no synthetic target identity selection', function () {
    $root = WP_PLUGIN_DIR . '/gravity-presentation-profiles/';
    $combined = file_get_contents( $root . 'src/SRWF/GravityFlow/EntryDetailPresentationAdapter.php' ) . "\n" . file_get_contents( $root . 'src/SRWF/GravityFlow/EntryDetailPresentationModel.php' );
    foreach ( array( 'WU18 Alpha', 'WU18 Beta', 'wu18.sim.', 'wu21-sim-installation', 'wu18-native-dossier' ) as $needle ) {
        wu18_rt_assert( false === strpos( $combined, $needle ), 'Production code leaked synthetic target identity: ' . $needle );
    }
    return array( 'selection' => 'shared surface profile + typed environment binding' );
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
