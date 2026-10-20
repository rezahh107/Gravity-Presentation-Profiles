<?php
/**
 * WU21 post-baseline mixed-readiness acceptance fixture.
 *
 * Runs only after the baseline's exact 25-task/browser expectations have
 * completed. GPP state is changed exclusively by public product services.
 * Gravity Forms and Gravity Flow own all synthetic form/entry/workflow state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\InboxSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationModel;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $manifest ) || empty( $manifest['entry_records'] ) ) {
    throw new RuntimeException( 'Pinned WU21 baseline has not been established.' );
}
if ( get_option( 'gpp_wu21_mixed_readiness_fixture' ) ) {
    throw new RuntimeException( 'Mixed acceptance must start from a fresh post-baseline fixture.' );
}

function mixed_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}
function mixed_reader() {
    return new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
}
function mixed_active_artifacts() {
    $snapshot = mixed_reader()->snapshot();
    $artifacts = array();
    foreach ( $snapshot['activations'] as $context_key => $identity ) {
        $record = $snapshot['installed'][ $identity['binding_set_id'] ][ $identity['binding_set_version'] ] ?? null;
        if ( is_array( $record ) && $record['context_key'] === $context_key ) {
            $artifacts[] = $record['artifact'];
        }
    }
    return $artifacts;
}
function mixed_artifact( $form_id ) {
    foreach ( mixed_active_artifacts() as $artifact ) {
        if ( (int) $artifact['context']['form_source_ref']['form_id'] === (int) $form_id ) {
            return $artifact;
        }
    }
    return null;
}
function mixed_readiness( $entry, $profile, $declarations ) {
    $model = new InboxPresentationModel( $profile, mixed_active_artifacts(), $declarations );
    return $model->presentationReadiness( $entry );
}
function mixed_add_form( $label, $extra_id = null ) {
    $fields = array();
    foreach ( array( 'First', 'Last', 'Photo', 'ID', 'Grade', 'School' ) as $index => $name ) {
        $fields[] = array(
            'id' => $index + 1,
            'label' => 'Mixed ' . $name,
            'type' => 2 === $index ? 'fileupload' : 'text',
            'isRequired' => 2 !== $index,
        );
    }
    if ( null !== $extra_id ) {
        $fields[] = array( 'id' => $extra_id, 'label' => 'Alternative synthetic ID', 'type' => 'text' );
    }
    $result = GFAPI::add_form( array(
        'title' => 'WU21 Mixed ' . $label,
        'description' => 'Synthetic mixed-readiness test; no actual personal information.',
        'labelPlacement' => 'top_label',
        'fields' => $fields,
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    ) );
    mixed_assert( ! is_wp_error( $result ) && (int) $result > 0, 'Cannot create synthetic ' . $label . ' form.' );
    return (int) $result;
}
function mixed_add_entry( $form_id, $operator_id, $label, $missing = false, $step_label = null ) {
    $api = new Gravity_Flow_API( $form_id );
    $entry = array(
        'form_id' => $form_id,
        'created_by' => $operator_id,
        '1' => 'MIX-' . $label,
        '3' => '',
        '4' => 'SYN-MIX-' . $label,
        '5' => 'Synthetic Grade',
    );
    if ( ! $missing ) {
        $entry['2'] = 'Synthetic Last';
        $entry['6'] = 'Synthetic School';
    }
    $id = GFAPI::add_entry( $entry );
    mixed_assert( ! is_wp_error( $id ) && (int) $id > 0, 'GF entry insertion failed: ' . $label );
    $api->process_workflow( (int) $id );
    $step = $api->get_current_step( GFAPI::get_entry( (int) $id ) );
    mixed_assert( $step && $step->get_name() === 'Mixed ' . ( null === $step_label ? $label : $step_label ) . ' Review', 'Authentic approval assignment absent: ' . $label );
    return (int) $id;
}
function mixed_map( $repair, $operations, $form_id, $slot, $field_id ) {
    $context = $operations->bindingContext( $form_id );
    $reader = mixed_reader();
    $active = $reader->resolve( $context );
    mixed_assert( is_array( $active ), 'Product binding activation missing before mapping: ' . $slot );
    $result = $repair->repairField( array(
        'context_key' => $reader->contextKey( $context ),
        'binding_set_id' => $active['binding_set_id'],
        'binding_set_version' => $active['binding_set_version'],
        'semantic_slot_key' => $slot,
        'field_id' => (string) $field_id,
    ) );
    mixed_assert( in_array( $result['status'], array( 'REPAIRED_AND_ACTIVATED', 'UNCHANGED' ), true ), 'Product mapping failed: ' . $slot );
}
function mixed_inbox_rows( $user_id, $args = array() ) {
    // Fully enumerate the host-authorized native result. One page_size=100
    // request is not a completeness proof, even for a small synthetic fixture.
    $page_size = 1; // Two Ready Entries must force two native API pages.
    $ids = array();
    $total_expected = null;
    $pages = 0;
    for ( $offset = 0; $offset < 500; $offset += $page_size ) {
        $total = 0;
        $query = array_merge( array(
            'filter_key' => 'workflow_user_id_' . (int) $user_id,
            'user_id' => (int) $user_id,
        ), $args );
        $query['paging'] = array( 'offset' => $offset, 'page_size' => $page_size );
        $rows = Gravity_Flow_API::get_inbox_entries( $query, $total );
        mixed_assert( is_array( $rows ) && ! is_wp_error( $rows ), 'Native Inbox API enumeration failed at offset ' . $offset );
        mixed_assert( is_numeric( $total ) && (int) $total >= 0, 'Native Inbox API did not expose a usable total.' );
        if ( null === $total_expected ) {
            $total_expected = (int) $total;
        }
        mixed_assert( (int) $total === $total_expected, 'Native Inbox total changed during authoritative enumeration.' );
        mixed_assert( count( $rows ) <= $page_size, 'Native Inbox ignored the bounded paging contract.' );
        mixed_assert( count( $rows ) > 0 || $offset >= $total_expected, 'Native Inbox returned an incomplete page.' );
        ++$pages;
        foreach ( $rows as $row ) {
            $id = isset( $row['id'] ) ? (int) $row['id'] : 0;
            mixed_assert( $id > 0 && ! in_array( $id, $ids, true ), 'Native Inbox returned an invalid/duplicate Entry ID.' );
            if ( isset( $args['form_id'] ) ) {
                $entry = GFAPI::get_entry( $id );
                mixed_assert( is_array( $entry ) && (int) $entry['form_id'] === (int) $args['form_id'],
                    'Native Inbox form filter returned an Entry from another form.' );
            }
            $ids[] = $id;
        }
        if ( count( $ids ) >= $total_expected ) {
            break;
        }
    }
    mixed_assert( count( $ids ) === $total_expected, 'Native Inbox pagination was truncated or exceeded the announced total.' );
    return array(
        'total' => $total_expected,
        'ids' => $ids,
        'pages' => $pages,
        'page_size' => $page_size,
        'enumeration_complete' => true,
        'form_filter' => isset( $args['form_id'] ) ? (int) $args['form_id'] : null,
    );
}
function mixed_claim( $artifact, $slot ) {
    foreach ( $artifact['runtime_claims'] as $claim ) {
        if ( $slot === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
            return $claim;
        }
    }
    return null;
}

$operator = (int) $manifest['operator']['id'];
$viewer = (int) $manifest['viewer']['id'];
$operations = OperationsSetupService::forWordPress();
$repair = BindingRepairService::forWordPress();
$inbox = InboxSetupService::forWordPress();
$visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
$package = $inbox->packageArtifact();
$profile = $visual->effectiveProfile( 'gravity_flow.inbox' );
mixed_assert( is_array( $profile ) && $profile['surface'] === 'gravity_flow.inbox', 'The authentic global Inbox visual profile must already be active.' );

$ready_form = mixed_add_form( 'Ready', 7 );
$partial_form = mixed_add_form( 'Unproven' );
$unconfigured_form = mixed_add_form( 'Unconfigured' );
foreach ( array(
    $ready_form => 'Ready',
    $partial_form => 'Unproven',
    $unconfigured_form => 'Unconfigured',
) as $form_id => $label ) {
    $api = new Gravity_Flow_API( $form_id );
    $step = $api->add_step( array(
        'step_name' => 'Mixed ' . $label . ' Review',
        'step_type' => 'approval',
        'type' => 'select',
        'assignees' => array( 'user_id|' . $operator ),
        'assignee_policy' => 'all',
        'instructions' => 'Synthetic mixed-readiness review.',
    ) );
    mixed_assert( $step && ! is_wp_error( $step ), 'Unable to create authentic approval assignment: ' . $label );
}
$complete_id = mixed_add_entry( $ready_form, $operator, 'Ready' );
$missing_id = mixed_add_entry( $ready_form, $operator, 'Missing', true, 'Ready' );
$unproven_id = mixed_add_entry( $partial_form, $operator, 'Unproven' );
$unconfigured_id = mixed_add_entry( $unconfigured_form, $operator, 'Unconfigured' );

$print_before = $visual->resolve( 'print.dossier' );
$entry_before = $visual->resolve( 'gravity_flow.entry_detail' );
foreach ( array( $ready_form, $partial_form ) as $form_id ) {
    $result = $operations->initialize( array( 'form_id' => $form_id ) );
    mixed_assert( $result['status'] === OperationsSetupService::STATUS_COMPLETED, 'Operations Setup failed on synthetic form.' );
}
$mapping = array(
    'student.first_name' => 1,
    'student.last_name' => 2,
    'student.photo' => 3,
    'student.national_id' => 4,
    'education.grade_group' => 5,
    'school.name' => 6,
);
foreach ( $mapping as $slot => $field_id ) {
    mixed_map( $repair, $operations, $ready_form, $slot, $field_id );
    if ( 'school.name' !== $slot ) {
        mixed_map( $repair, $operations, $partial_form, $slot, $field_id );
    }
}
foreach ( array( $ready_form, $partial_form ) as $form_id ) {
    $result = $inbox->initialize( array( 'form_id' => $form_id ) );
    mixed_assert( $result['status'] === InboxSetupService::STATUS_COMPLETED, 'Inbox Setup failed: ' . $form_id );
}

$ready = mixed_readiness( GFAPI::get_entry( $complete_id ), $profile, $package['semantic_slots'] );
$missing = mixed_readiness( GFAPI::get_entry( $missing_id ), $profile, $package['semantic_slots'] );
$unproven = mixed_readiness( GFAPI::get_entry( $unproven_id ), $profile, $package['semantic_slots'] );
$unconfigured = mixed_readiness( GFAPI::get_entry( $unconfigured_id ), $profile, $package['semantic_slots'] );
mixed_assert( $ready['ready'] && $missing['ready'], 'Current readiness is source/configuration-level, not entry-value completeness.' );
mixed_assert( ! $unproven['ready'] && ! $unconfigured['ready'], 'Unproven/unconfigured form must fail semantic readiness.' );
mixed_assert( 'UNBOUND' === mixed_artifact( $partial_form )['bindings'][ array_search( 'school.name', array_column( mixed_artifact( $partial_form )['bindings'], 'semantic_slot_key' ), true ) ]['state'], 'Unproven form unexpectedly acquired a School binding.' );
mixed_assert( 'NOT_PROVEN' === mixed_claim( mixed_artifact( $partial_form ), 'school.name' )['evidence_state'], 'Missing School availability proof was incorrectly promoted.' );
mixed_assert( null === mixed_artifact( $unconfigured_form ), 'Unconfigured form received GPP state.' );

$ids = array( $complete_id, $missing_id, $unproven_id, $unconfigured_id );
$native_operator = mixed_inbox_rows( $operator );
$native_viewer = mixed_inbox_rows( $viewer );
$native_form = mixed_inbox_rows( $operator, array( 'form_id' => $ready_form ) );
mixed_assert( in_array( $complete_id, $native_form['ids'], true ) && in_array( $missing_id, $native_form['ids'], true ), 'Native assigned same-form entry missing.' );
mixed_assert( in_array( $complete_id, $native_operator['ids'], true ) && in_array( $missing_id, $native_operator['ids'], true ), 'GPP semantic readiness cannot remove native assigned entries.' );
mixed_assert( ! array_intersect( $ids, $native_viewer['ids'] ), 'Native permission boundary leaked a synthetic assigned entry to unassigned user.' );
$native_host_filter_limitations = array_values( array_diff( $ids, $native_operator['ids'] ) );
mixed_assert( $native_operator['enumeration_complete'] && $native_viewer['enumeration_complete']
    && $native_form['enumeration_complete'] && $native_form['pages'] > 1,
    'Native multi-page expected-ID enumeration not established.' );
$native_per_form = array();
foreach ( array( $ready_form, $partial_form, $unconfigured_form ) as $form_id ) {
    $native_per_form[ $form_id ] = mixed_inbox_rows( $operator, array( 'form_id' => $form_id ) );
}

// Independent Gravity Forms witnesses. Do not ask GPP's presentation adapter
// what these cells should contain; it is the behavior under test.
$source_witnesses = array();
foreach ( array(
    'complete' => $complete_id,
    'missing_required_values' => $missing_id,
    'unproven_form' => $unproven_id,
    'unconfigured_form' => $unconfigured_id,
) as $kind => $id ) {
    $entry = GFAPI::get_entry( $id );
    mixed_assert( is_array( $entry ) && (int) $entry['form_id'] > 0,
        'Cannot read authoritative Gravity Forms semantic witness.' );
    $source_witnesses[ $kind ] = array(
        'entry_id' => $id,
        'form_id' => (int) $entry['form_id'],
        'date_created' => (string) ( $entry['date_created'] ?? '' ),
        'first' => (string) ( $entry['1'] ?? '' ),
        'last' => (string) ( $entry['2'] ?? '' ),
        'school' => (string) ( $entry['6'] ?? '' ),
        'grade' => (string) ( $entry['5'] ?? '' ),
    );
}
mixed_assert( '' !== $source_witnesses['complete']['first']
    && '' !== $source_witnesses['complete']['last']
    && '' !== $source_witnesses['complete']['school']
    && '' !== $source_witnesses['complete']['grade'],
    'Complete Entry lacks source values needed to falsify composition.' );
mixed_assert( '' !== $source_witnesses['missing_required_values']['first']
    && '' === $source_witnesses['missing_required_values']['last']
    && '' === $source_witnesses['missing_required_values']['school']
    && '' !== $source_witnesses['missing_required_values']['grade'],
    'Incomplete Entry did not preserve the intended true missing-value witness.' );

$before_remap = mixed_artifact( $ready_form );
mixed_map( $repair, $operations, $ready_form, 'student.national_id', 7 );
$after_remap = mixed_artifact( $ready_form );
$stale = mixed_readiness( GFAPI::get_entry( $complete_id ), $profile, $package['semantic_slots'] );
mixed_assert( ! $stale['ready'], 'Remapping did not invalidate the source-bound availability proof.' );
mixed_assert( 'NOT_PROVEN' === mixed_claim( $after_remap, 'student.national_id' )['evidence_state'], 'Remap retained a PROVEN source claim.' );
mixed_assert( $before_remap['binding_set_version'] !== $after_remap['binding_set_version'], 'Remap did not advance immutable binding version.' );
$old_national = null;
foreach ( $before_remap['bindings'] as $item ) {
    if ( $item['semantic_slot_key'] === 'student.national_id' ) {
        $old_national = $item['source_ref'];
    }
}
mixed_assert( InboxRuntimeEvidence::availabilityRef( $before_remap, 'student.national_id', $old_national )
    !== InboxRuntimeEvidence::availabilityRef( $after_remap, 'student.national_id', array( 'type' => 'gravity_forms.field', 'field_id' => '7' ) ), 'Availability proof was not bound to exact version/source.' );
$requalification = $inbox->initialize( array( 'form_id' => $ready_form ) );
mixed_assert( $requalification['status'] === InboxSetupService::STATUS_COMPLETED
    && 'qualified' === $requalification['steps']['runtime_readiness']['outcome'], 'Legitimate product requalification did not complete.' );
$requalified = mixed_readiness( GFAPI::get_entry( $complete_id ), $profile, $package['semantic_slots'] );
mixed_assert( $requalified['ready'], 'New exact source proof did not restore semantic readiness.' );
mixed_assert( $visual->resolve( 'print.dossier' ) === $print_before
    && $visual->resolve( 'gravity_flow.entry_detail' ) === $entry_before, 'Inbox setup changed another operational surface.' );

foreach ( array( $ready_form, $partial_form, $unconfigured_form ) as $form_id ) {
    $entry = GFAPI::get_entry( $form_id === $ready_form ? $missing_id : ( $form_id === $partial_form ? $unproven_id : $unconfigured_id ) );
    $sentinel = 'NATIVE-MIXED-' . $form_id;
    mixed_assert( apply_filters( 'gravityflow_inbox_field_value', $sentinel, $form_id, 'date_created', $entry ) === $sentinel, 'GPP modified native Inbox value.' );
}
$native_markup = '<div class="gflow-inbox gflow-grid gflow-common" data-js="gflow-inbox"></div>';
InboxPresentationAdapter::resetRuntimeCache();
$wrapped = InboxPresentationAdapter::filterShortcodeInbox( $native_markup, array(), '' );
mixed_assert( strpos( $wrapped, 'data-gpp-inbox-surface="gravity_flow.inbox"' ) !== false
    && strpos( $wrapped, $native_markup ) !== false, 'Active global shell must preserve the untouched host tree.' );

// The production five-column native-filter adapter (distinct from the shell
// model) must admit only an exact, unambiguous, source-proven form context.
InboxTableHeaderPresentation::resetRuntimeCache();
$ready_header = InboxTableHeaderPresentation::initialGeometryContract( array( 'form_id' => $ready_form ) );
$unproven_header = InboxTableHeaderPresentation::initialGeometryContract( array( 'form_id' => $partial_form ) );
$unconfigured_header = InboxTableHeaderPresentation::initialGeometryContract( array( 'form_id' => $unconfigured_form ) );
$unscoped_header = InboxTableHeaderPresentation::initialGeometryContract( array() );
mixed_assert( is_array( $ready_header ) && count( $ready_header['column_ids'] ) === 5,
    'Production native-filter header did not admit the truly qualified Ready form.' );
mixed_assert( null === $unproven_header && null === $unconfigured_header && null === $unscoped_header,
    'Native-filter header admitted unproven, unconfigured or ambiguous form authority.' );

$form_scoped_page_id = wp_insert_post( array(
    'post_title' => 'WU21 Mixed Ready Form-Scoped Inbox',
    'post_status' => 'publish',
    'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $ready_form . '"]',
), true );
mixed_assert( ! is_wp_error( $form_scoped_page_id ) && (int) $form_scoped_page_id > 0, 'Authentic form-scoped native Inbox page could not be created.' );
$form_scoped_url = get_permalink( (int) $form_scoped_page_id );
mixed_assert( is_string( $form_scoped_url ) && '' !== $form_scoped_url, 'Native form-scoped Inbox URL unavailable.' );

$unready_scoped_pages = array();
foreach ( array( 'unproven' => $partial_form, 'unconfigured' => $unconfigured_form ) as $state => $form_id ) {
    $page_id = wp_insert_post( array(
        'post_title' => 'WU21 Mixed ' . $state . ' Form-Scoped Inbox',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[gravityflow page="inbox" form="' . $form_id . '"]',
    ), true );
    mixed_assert( ! is_wp_error( $page_id ) && (int) $page_id > 0, 'Authentic ' . $state . ' native Inbox page could not be created.' );
    $url = get_permalink( (int) $page_id );
    mixed_assert( is_string( $url ) && '' !== $url, 'Authentic ' . $state . ' Inbox URL unavailable.' );
    $unready_scoped_pages[ $state ] = array(
        'page_id' => (int) $page_id,
        'url' => $url,
        'form_id' => (int) $form_id,
        'entry_id' => 'unproven' === $state ? $unproven_id : $unconfigured_id,
    );
}

$results = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'evidence_kind' => 'PINNED_WU21_AUTHENTIC_GF_FLOW_POST_BASELINE',
    'forms' => array( 'ready' => $ready_form, 'unproven' => $partial_form, 'unconfigured' => $unconfigured_form ),
    'form_scoped' => array( 'page_id' => (int) $form_scoped_page_id, 'url' => $form_scoped_url, 'form_id' => $ready_form, 'entry_id' => $complete_id ),
    'form_scoped_unready' => $unready_scoped_pages,
    'entries' => array( 'complete' => $complete_id, 'missing_required_values' => $missing_id, 'unproven_form' => $unproven_id, 'unconfigured_form' => $unconfigured_id ),
    'semantic_readiness' => array( 'complete' => $ready, 'missing_values' => $missing, 'unproven' => $unproven, 'unconfigured' => $unconfigured, 'post_remap' => $stale, 'post_requalification' => $requalified ),
    'header_projection' => array( 'ready' => $ready_header, 'unproven' => $unproven_header, 'unconfigured' => $unconfigured_header, 'unscoped' => $unscoped_header ),
    'source_versions' => array( 'pre_remap' => $before_remap['binding_set_version'], 'invalidated' => $after_remap['binding_set_version'], 'requalified' => mixed_artifact( $ready_form )['binding_set_version'] ),
    'native_operator' => $native_operator,
    'native_viewer' => $native_viewer,
    'native_per_form' => $native_per_form,
    'source_witnesses' => $source_witnesses,
    'native_host_filter_limitations' => $native_host_filter_limitations,
    'native_shell' => 'ACTIVE_WITH_UNTOUCHED_HOST_MARKUP',
    'request_authorization' => 'NATIVE_GRAVITY_FLOW_ONLY',
    'entry_values' => 'NATIVE_ONLY_NOT_GPP_ENRICHED',
);
update_option( 'gpp_wu21_mixed_readiness_fixture', $results, false );
file_put_contents( $artifact_dir . '/inbox-mixed-readiness-php.json', wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo 'WU21_MIXED_READINESS_HOST_PASS ' . wp_json_encode( $results['semantic_readiness'] ) . "\n";
