<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$base = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $base ) || empty( $base['forms'] ) || empty( $base['entry_records'] ) || empty( $base['installation_id'] ) ) {
    throw new RuntimeException( 'WU18 requires WU21 fixtures.' );
}

function wu18_form_meta( $base, $key ) {
    foreach ( $base['forms'] as $form ) {
        if ( $form['key'] === $key ) return $form;
    }
    throw new RuntimeException( 'Missing synthetic form: ' . $key );
}

function wu18_entry_for_form( $base, $form_id, $offset = 0 ) {
    $matches = array_values( array_filter( $base['entry_records'], static function ( $row ) use ( $form_id ) {
        return (int) $row['form_id'] === (int) $form_id;
    } ) );
    if ( ! isset( $matches[ $offset ] ) ) throw new RuntimeException( 'Missing synthetic entry offset.' );
    return $matches[ $offset ];
}

function wu18_extend_form( $form_id ) {
    $form = GFAPI::get_form( $form_id );
    if ( ! is_array( $form ) ) throw new RuntimeException( 'Unable to read synthetic form.' );

    $max = 0;
    foreach ( $form['fields'] as $field ) $max = max( $max, (int) $field->id );

    $specs = array(
        'student.father_name' => array( 'Father Name', 'text' ),
        'student.birth_date_jalali' => array( 'Birth Date Jalali', 'text' ),
        'student.gender' => array( 'Gender', 'text' ),
        'student.mobile' => array( 'Student Mobile', 'text' ),
        'student.home_phone' => array( 'Home Phone', 'text' ),
        'student.father_mobile' => array( 'Father Mobile', 'text' ),
        'student.mother_mobile' => array( 'Mother Mobile', 'text' ),
        'education.level' => array( 'Education Level', 'text' ),
        'education.graduation_status' => array( 'Graduation Status', 'text' ),
        'registration.center' => array( 'Registration Center', 'text' ),
        'documents.report_card' => array( 'Report Card', 'fileupload' ),
        'review.status' => array( 'Review Status', 'text' ),
        'review.reason' => array( 'Review Reason', 'textarea' ),
        'finance.status' => array( 'Finance Status', 'text' ),
        'finance.tuition_amount' => array( 'Tuition Amount', 'text' ),
        'finance.discount_amount' => array( 'Discount Amount', 'text' ),
        'finance.discount_title' => array( 'Discount Title', 'text' ),
        'finance.net_payable_amount' => array( 'Net Payable', 'text' ),
    );

    $map = array();
    foreach ( $specs as $slot => $spec ) {
        $max++;
        $map[ $slot ] = $max;
        $form['fields'][] = array(
            'id' => $max,
            'label' => 'WU18 ' . $spec[0],
            'type' => $spec[1],
            'isRequired' => false,
        );
    }

    $result = GFAPI::update_form( $form );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    return $map;
}

function wu18_field_map( $base_meta, $extended ) {
    return array_merge(
        array(
            'student.photo' => $base_meta['photo_field_id'],
            'student.first_name' => $base_meta['first_name_field_id'],
            'student.last_name' => $base_meta['last_name_field_id'],
            'student.national_id' => $base_meta['national_id_field_id'],
            'education.grade_group' => $base_meta['grade_group_field_id'],
            'school.name' => $base_meta['school_field_id'],
        ),
        $extended
    );
}

function wu18_clone_form( $source_form_id, $title ) {
    $form = GFAPI::get_form( $source_form_id );
    if ( ! is_array( $form ) ) {
        throw new RuntimeException( 'Unable to clone synthetic form.' );
    }
    unset( $form['id'] );
    $form['title'] = $title;
    $form['description'] = 'Dedicated WU18 Approval editor fixture.';
    $form_id = GFAPI::add_form( $form );
    if ( is_wp_error( $form_id ) || ! $form_id ) {
        throw new RuntimeException( is_wp_error( $form_id ) ? $form_id->get_error_message() : 'Unable to create dedicated WU18 editor form.' );
    }
    return (int) $form_id;
}

$alpha_form = wu18_form_meta( $base, 'alpha' );
$beta_form = wu18_form_meta( $base, 'beta' );
$alpha_fields = wu18_field_map( $alpha_form, wu18_extend_form( $alpha_form['form_id'] ) );
$beta_fields = wu18_field_map( $beta_form, wu18_extend_form( $beta_form['form_id'] ) );
$alpha_entry = wu18_entry_for_form( $base, $alpha_form['form_id'], 0 );
$negative_entry = wu18_entry_for_form( $base, $alpha_form['form_id'], 1 );
$transition_entry = wu18_entry_for_form( $base, $alpha_form['form_id'], 2 );
$viewer_entry = wu18_entry_for_form( $base, $alpha_form['form_id'], 3 );
$beta_entry = wu18_entry_for_form( $base, $beta_form['form_id'], 0 );

$uploads = wp_upload_dir();
$dir = trailingslashit( $uploads['basedir'] ) . 'wu18-synthetic';
wp_mkdir_p( $dir );
file_put_contents( $dir . '/report-card.png', base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAABFaP0WAAAADUlEQVR42mNk+M/wHwAFgwJ/lKJmWQAAAABJRU5ErkJggg==' ) );
file_put_contents( $dir . '/report-card.pdf', "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids[3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox[0 0 200 200] >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n" );
$image_url = trailingslashit( $uploads['baseurl'] ) . 'wu18-synthetic/report-card.png';
$pdf_url = trailingslashit( $uploads['baseurl'] ) . 'wu18-synthetic/report-card.pdf';

function wu18_populate_entry( $entry_id, $fields, $prefix, $document_url ) {
    $values = array(
        'student.father_name' => $prefix . ' Father',
        'student.birth_date_jalali' => '۱۴۰۰/۰۱/۰۲',
        'student.gender' => 'دانش‌آموز',
        'student.mobile' => '09120000000',
        'student.home_phone' => '07130000000',
        'student.father_mobile' => '09121111111',
        'student.mother_mobile' => '09122222222',
        'education.level' => 'متوسطه',
        'education.graduation_status' => 'در حال تحصیل',
        'registration.center' => 'مرکز آزمایشی',
        'documents.report_card' => $document_url,
        'review.status' => 'در انتظار بررسی',
        'review.reason' => 'Synthetic host-owned review value',
        'finance.status' => 'در انتظار',
        'finance.tuition_amount' => '125000000',
        'finance.discount_amount' => '15000000',
        'finance.discount_title' => 'تخفیف مصوب آموزشی',
        'finance.net_payable_amount' => '110000000',
    );

    foreach ( $values as $slot => $value ) {
        $result = GFAPI::update_entry_field( $entry_id, $fields[ $slot ], $value );
        if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    }
}
wu18_populate_entry( $alpha_entry['entry_id'], $alpha_fields, 'Alpha', $image_url );
wu18_populate_entry( $negative_entry['entry_id'], $alpha_fields, 'Negative', $image_url );
wu18_populate_entry( $transition_entry['entry_id'], $alpha_fields, 'Transition', $image_url );
wu18_populate_entry( $viewer_entry['entry_id'], $alpha_fields, 'Viewer', $image_url );
wu18_populate_entry( $beta_entry['entry_id'], $beta_fields, 'Beta', $pdf_url );

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) throw new RuntimeException( 'Pinned WU18 users unavailable.' );
if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
    require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
}

function wu18_configure_read_only_approval( $form_id, $entry_id ) {
    $entry = GFAPI::get_entry( $entry_id );
    $api = new Gravity_Flow_API( (int) $form_id );
    $step = $api->get_current_step( $entry );
    if ( ! $step || 'approval' !== $step->get_type() ) {
        throw new RuntimeException( 'Pinned WU18 Review fixture did not expose Approval.' );
    }

    $meta = $step->get_feed_meta();
    $meta['editable_fields'] = array();
    $meta['instructionsEnable'] = '1';
    $meta['instructionsValue'] = 'Synthetic WU18 current-task instructions.';
    $meta['note_mode'] = 'optional';
    $meta['revertEnable'] = '1';
    gravity_flow()->update_feed_meta( $step->get_id(), $meta );
}

// Stable Review state: the base Alpha Approval already has no editable fields.
// We set only the native Review conveniences once during fixture construction,
// then later prove the host-effective state from a freshly resolved step.
wu18_configure_read_only_approval( $alpha_form['form_id'], $alpha_entry['entry_id'] );

$created_by_update = GFAPI::update_entry_property( $viewer_entry['entry_id'], 'created_by', (int) $viewer->ID );
if ( is_wp_error( $created_by_update ) ) {
    throw new RuntimeException( $created_by_update->get_error_message() );
}

// Dedicated Approval editor fixture. The Approval step is created with its
// editable-field setting from the start, before any entry reaches the step.
// This avoids mutating an already-instantiated assignee snapshot.
$editor_form_id = wu18_clone_form( $beta_form['form_id'], 'WU18 Dedicated Approval Editor' );
$editor_fields = $beta_fields;
$editor_api = new Gravity_Flow_API( $editor_form_id );
$editor_step_id = $editor_api->add_step(
    array(
        'step_name' => 'WU18 Approval Editor',
        'step_type' => 'approval',
        'description' => 'Dedicated synthetic Approval editor fallback fixture.',
        'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $operator->ID ),
        'assignee_policy' => 'all',
        'editable_fields' => array( (string) $editor_fields['review.reason'] ),
        'instructionsEnable' => '1',
        'instructionsValue' => 'Synthetic WU18 editor instructions.',
        'note_mode' => 'optional',
        'revertEnable' => '0',
    )
);
if ( ! $editor_step_id || is_wp_error( $editor_step_id ) ) {
    throw new RuntimeException( 'Unable to create dedicated WU18 Approval editor step.' );
}

$beta_source_entry = GFAPI::get_entry( $beta_entry['entry_id'] );
if ( is_wp_error( $beta_source_entry ) ) {
    throw new RuntimeException( $beta_source_entry->get_error_message() );
}
$editor_entry_payload = array(
    'form_id' => $editor_form_id,
    'created_by' => (int) $operator->ID,
);
foreach ( $beta_source_entry as $key => $value ) {
    if ( 1 === preg_match( '/^\d+(?:\.\d+)?$/', (string) $key ) ) {
        $editor_entry_payload[ (string) $key ] = $value;
    }
}
$editor_entry_id = GFAPI::add_entry( $editor_entry_payload );
if ( is_wp_error( $editor_entry_id ) || ! $editor_entry_id ) {
    throw new RuntimeException( is_wp_error( $editor_entry_id ) ? $editor_entry_id->get_error_message() : 'Unable to create WU18 editor entry.' );
}
$editor_entry_id = (int) $editor_entry_id;
$editor_api->process_workflow( $editor_entry_id );

$alpha_api = new Gravity_Flow_API( (int) $alpha_form['form_id'] );
$follow_up_step_id = $alpha_api->add_step(
    array(
        'step_name' => 'WU18 Follow-up Input',
        'step_type' => 'user_input',
        'description' => 'Synthetic non-Approval follow-up for fresh-request eligibility falsification.',
        'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $operator->ID ),
        'assignee_policy' => 'all',
        'editable_fields' => array( (string) $alpha_fields['review.reason'] ),
        'instructionsEnable' => '1',
        'instructionsValue' => 'Synthetic follow-up input.',
    )
);
if ( ! $follow_up_step_id || is_wp_error( $follow_up_step_id ) ) {
    throw new RuntimeException( 'Unable to create WU18 User Input follow-up step.' );
}

// Read back host-effective state from freshly resolved steps. Feed/step settings
// are not accepted as proof: the native current-step API must expose the target.
wp_set_current_user( $operator->ID );
$alpha_fresh = ( new Gravity_Flow_API( (int) $alpha_form['form_id'] ) )->get_current_step( GFAPI::get_entry( $alpha_entry['entry_id'] ) );
if ( ! $alpha_fresh || 'approval' !== $alpha_fresh->get_type() || ! Gravity_Flow_Entry_Detail::can_update( $alpha_fresh ) ) {
    throw new RuntimeException( 'WU18 read-only Review fixture did not resolve as actionable native Approval.' );
}
$alpha_effective_editable = array_values( array_filter( array_map( 'strval', $alpha_fresh->get_editable_fields() ), 'strlen' ) );
if ( array() !== $alpha_effective_editable ) {
    throw new RuntimeException( 'WU18 read-only Review fixture has effective native editable fields.' );
}

$editor_fresh = ( new Gravity_Flow_API( $editor_form_id ) )->get_current_step( GFAPI::get_entry( $editor_entry_id ) );
if ( ! $editor_fresh || 'approval' !== $editor_fresh->get_type() || (int) $editor_fresh->get_id() !== (int) $editor_step_id || ! Gravity_Flow_Entry_Detail::can_update( $editor_fresh ) ) {
    throw new RuntimeException( 'WU18 editor fixture did not resolve as the dedicated actionable native Approval.' );
}
$editor_effective_editable = array_values( array_filter( array_map( 'strval', $editor_fresh->get_editable_fields() ), 'strlen' ) );
if ( ! in_array( (string) $editor_fields['review.reason'], $editor_effective_editable, true ) ) {
    throw new RuntimeException( 'WU18 editor fixture did not expose review.reason through effective host editability.' );
}

gravity_flow()->add_timeline_note( $alpha_entry['entry_id'], 'Synthetic dossier review opened.' );
gravity_flow()->add_timeline_note( $viewer_entry['entry_id'], 'Synthetic read-only viewer review opened.' );
gravity_flow()->add_timeline_note( $editor_entry_id, 'Synthetic editor fallback opened.' );

$operations = OperationsSetupService::forWordPress();
$visual_package = $operations->packageArtifact();
$profile = ( new VisualProfileResolver( $visual_package ) )->resolve( 'gravity_flow.entry_detail' );
if ( ! is_array( $profile ) || 'srwf.operations.entry-detail.v1' !== $profile['profile_id'] ) {
    throw new RuntimeException( 'Current Operations Entry Detail profile identity changed.' );
}

$entry_setup = EntryDetailSetupService::forWordPress();
foreach ( array( $alpha_form['form_id'], $beta_form['form_id'] ) as $form_id ) {
    $adoption = $entry_setup->initialize( array( 'form_id' => (int) $form_id ) );
    if ( EntryDetailSetupService::STATUS_COMPLETED !== $adoption['status'] ) {
        throw new RuntimeException( 'Current Operations Entry Detail product adoption failed for form ' . (int) $form_id );
    }
}

function wu18_binding_set( $id, $installation_id, $form_id, $fields, $entry_ref, $package, $negative_required = false ) {
    $proven = array( 'wu18:current-operations-package', 'wu18:pinned-runtime' );
    $bindings = array();

    foreach ( $package['semantic_slots'] as $declaration ) {
        $slot = $declaration['semantic_slot_key'];
        $required = false;
        foreach ( $declaration['surface_usage'] as $usage ) {
            if ( 'gravity_flow.entry_detail' === $usage['surface'] && true === $usage['required'] ) {
                $required = true;
                break;
            }
        }
        if ( ! $required ) continue;

        $kind = OperationsBindingManagementPolicy::entryDetailReadinessKind( $slot );
        $source = null;
        $state = 'UNBOUND';

        if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_DIRECT_SOURCE === $kind ) {
            if ( ! isset( $fields[ $slot ] ) ) throw new RuntimeException( 'WU18 missing direct field fixture for ' . $slot );
            $source = array( 'type' => 'gravity_forms.field', 'field_id' => $fields[ $slot ] );
            $state = $negative_required && 'student.national_id' === $slot ? 'NOT_PROVEN' : 'PROVEN';
            if ( 'PROVEN' !== $state ) $source = null;
        } elseif ( OperationsBindingManagementPolicy::ENTRY_DETAIL_STABLE_HOST_SOURCE === $kind ) {
            if ( 'entry.created_at' === $slot ) $source = array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' );
            if ( 'workflow.current_step' === $slot ) $source = array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' );
            if ( 'workflow.status' === $slot ) $source = array( 'type' => 'gravity_flow.state', 'state_key' => 'status' );
            $state = is_array( $source ) ? 'PROVEN' : 'NOT_PROVEN';
        }

        $bindings[] = array(
            'semantic_slot_key' => $slot,
            'state' => $state,
            'source_ref' => $source,
            'evidence_refs' => 'PROVEN' === $state ? $proven : array(),
        );
    }

    // Falsification input: stale request-local claims may exist in historical
    // artifacts, but production admission must ignore them completely.
    $claims = array(
        array(
            'semantic_slot_key' => 'workflow.approve_action',
            'claim' => 'action_permission',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( 'wu18:stale-action-permission' ),
        ),
        array(
            'semantic_slot_key' => 'workflow.reject_action',
            'claim' => 'action_permission',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( 'wu18:stale-action-permission' ),
        ),
        array(
            'semantic_slot_key' => 'workflow.instructions',
            'claim' => 'availability',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( 'wu18:stale-region-presence' ),
        ),
        array(
            'semantic_slot_key' => 'workflow.timeline',
            'claim' => 'availability',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( 'wu18:stale-region-presence' ),
        ),
        array(
            'semantic_slot_key' => 'navigation.backlink',
            'claim' => 'availability',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array( 'wu18:stale-region-presence' ),
        ),
    );

    return array(
        'artifact_type' => EnvironmentBindingSet::ARTIFACT_TYPE,
        'schema_version' => EnvironmentBindingSet::SCHEMA_VERSION_1_1,
        'binding_set_id' => $id,
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation_id ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => (int) $form_id ),
            'entry_source_ref' => array( 'type' => 'gravity_forms.entry', 'entry_id' => (int) $entry_ref ),
            'surfaces' => array( 'gravity_flow.entry_detail' ),
        ),
        'provenance' => array(
            'producer' => 'WU18 current Operations Package Evidence Lab fixture',
            'evidence_refs' => array_merge( $proven, array( 'wu18:stale-action-permission', 'wu18:stale-region-presence' ) ),
        ),
        'bindings' => $bindings,
        'runtime_claims' => $claims,
    );
}

$bindings = array(
    wu18_binding_set( 'wu18.operations.alpha.v1', $base['installation_id'], $alpha_form['form_id'], $alpha_fields, $alpha_entry['entry_id'], $visual_package ),
    wu18_binding_set( 'wu18.operations.beta.v1', $base['installation_id'], $beta_form['form_id'], $beta_fields, $beta_entry['entry_id'], $visual_package ),
    wu18_binding_set( 'wu18.operations.editor.v1', $base['installation_id'], $editor_form_id, $editor_fields, $editor_entry_id, $visual_package ),
    wu18_binding_set( 'wu18.operations.alpha.negative.v1', $base['installation_id'], $alpha_form['form_id'], $alpha_fields, $negative_entry['entry_id'], $visual_package, true ),
    wu18_binding_set( 'wu18.operations.alpha.transition.v1', $base['installation_id'], $alpha_form['form_id'], $alpha_fields, $transition_entry['entry_id'], $visual_package ),
    wu18_binding_set( 'wu18.operations.alpha.viewer.v1', $base['installation_id'], $alpha_form['form_id'], $alpha_fields, $viewer_entry['entry_id'], $visual_package ),
);

foreach ( $bindings as $binding ) EnvironmentBindingSet::validate( $binding );
$binding_lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array(
        'wu21:synthetic-fixture',
        'wu21:reproducible-simulation',
        'wu21:fail-closed-negative-control',
        'wu18:current-operations-package',
        'wu18:pinned-runtime',
        'wu18:negative-control',
        'wu18:stale-action-permission',
        'wu18:stale-region-presence',
    ) )
);
foreach ( $bindings as $binding ) {
    $binding_lifecycle->import( $binding );
    $binding_lifecycle->activate( array(
        'context' => $binding['context'],
        'binding_set_id' => $binding['binding_set_id'],
        'binding_set_version' => $binding['binding_set_version'],
    ) );
}

EntryDetailPresentationAdapter::resetRuntimeCache();
PrintDossierPresentationAdapter::resetRuntimeCache();

$binding_state_sha256 = hash( 'sha256', wp_json_encode( get_option( BindingSetLifecycle::OPTION_NAME ) ) );

$manifest = array(
    'schema_version' => '3.2.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'package_id' => $visual_package['package_id'],
    'package_version' => $visual_package['package_version'],
    'profile_id' => 'srwf.operations.entry-detail.v1',
    'legacy_profile_excluded' => 'shared.entry_detail.v1',
    'binding_state_sha256' => $binding_state_sha256,
    'alpha' => array(
        'form_id' => (int) $alpha_form['form_id'],
        'entry_id' => (int) $alpha_entry['entry_id'],
        'fields' => $alpha_fields,
        'document_kind' => 'image',
        'expected_effective_editable_fields' => array(),
    ),
    'editor' => array(
        'form_id' => $editor_form_id,
        'entry_id' => $editor_entry_id,
        'step_id' => (int) $editor_step_id,
        'fields' => $editor_fields,
        'editable_field_id' => (string) $editor_fields['review.reason'],
    ),
    'beta' => array(
        'form_id' => (int) $beta_form['form_id'],
        'entry_id' => (int) $beta_entry['entry_id'],
        'fields' => $beta_fields,
        'document_kind' => 'pdf',
    ),
    'negative' => array(
        'form_id' => (int) $alpha_form['form_id'],
        'entry_id' => (int) $negative_entry['entry_id'],
    ),
    'viewer' => array(
        'form_id' => (int) $alpha_form['form_id'],
        'entry_id' => (int) $viewer_entry['entry_id'],
        'expected_user_login' => 'wu21_viewer',
    ),
    'transition' => array(
        'form_id' => (int) $alpha_form['form_id'],
        'entry_id' => (int) $transition_entry['entry_id'],
        'follow_up_step_id' => (int) $follow_up_step_id,
    ),
    'fixture_state_proof' => array(
        'read_only_review' => array(
            'step_type' => 'approval',
            'operator_can_update' => true,
            'effective_editable_fields' => $alpha_effective_editable,
        ),
        'approval_editor' => array(
            'step_type' => 'approval',
            'step_id' => (int) $editor_step_id,
            'operator_can_update' => true,
            'effective_editable_fields' => $editor_effective_editable,
        ),
    ),
);
update_option( 'gpp_wu18_fixture_manifest', $manifest, false );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-fixture-manifest.json',
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
echo "WU18 stable read-only/editor/User-Input fixtures ready.\n";
