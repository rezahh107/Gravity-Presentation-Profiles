<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required for WU18 fixtures.' );
}
wp_mkdir_p( $artifact_dir );

$existing = get_option( 'gpp_wu18_fixture_manifest' );
if ( is_array( $existing ) && ! empty( $existing['entry_ids'] ) ) {
    file_put_contents( $artifact_dir . '/wu18-fixture-manifest.json', wp_json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
    echo "WU18 fixtures already exist.\n";
    return;
}

if ( ! class_exists( 'GFAPI' ) || ! class_exists( 'Gravity_Flow_API' ) ) {
    throw new RuntimeException( 'Gravity Forms / Gravity Flow APIs are unavailable for WU18 fixtures.' );
}

function wu18_ensure_user( $login, $email, $password ) {
    $user = get_user_by( 'login', $login );
    if ( ! $user ) {
        $id = wp_create_user( $login, $password, $email );
        if ( is_wp_error( $id ) ) {
            throw new RuntimeException( $id->get_error_message() );
        }
        $user = get_user_by( 'id', $id );
    }
    if ( ! $user ) {
        throw new RuntimeException( 'Unable to provision WU18 synthetic user: ' . $login );
    }
    $user->set_role( 'subscriber' );
    $user->add_cap( 'gravityflow_inbox', true );
    return $user;
}

$operator = wu18_ensure_user( 'wu18_operator', 'wu18.operator@example.invalid', 'wu18-synthetic-operator-2026' );
$denied   = wu18_ensure_user( 'wu18_denied', 'wu18.denied@example.invalid', 'wu18-synthetic-denied-2026' );

$field_keys = array(
    'full_name',
    'photo',
    'national_id',
    'first_name',
    'last_name',
    'father_name',
    'birth_date',
    'gender',
    'mobile',
    'home_phone',
    'father_mobile',
    'mother_mobile',
    'education_level',
    'grade_group',
    'graduation_status',
    'school',
    'registration_center',
    'report_card',
    'review_status',
    'review_reason',
    'finance_status',
    'tuition_amount',
    'discount_amount',
    'discount_title',
    'net_payable_amount',
);

function wu18_field_map( $start ) {
    global $field_keys;
    $out = array();
    foreach ( $field_keys as $index => $key ) {
        $out[ $key ] = $start + $index;
    }
    return $out;
}

function wu18_add_form( $title, $map ) {
    $labels = array(
        'full_name' => 'Student Full Name',
        'photo' => 'Student Photo',
        'national_id' => 'National ID',
        'first_name' => 'First Name',
        'last_name' => 'Last Name',
        'father_name' => 'Father Name',
        'birth_date' => 'Birth Date Jalali',
        'gender' => 'Gender',
        'mobile' => 'Student Mobile',
        'home_phone' => 'Home Phone',
        'father_mobile' => 'Father Mobile',
        'mother_mobile' => 'Mother Mobile',
        'education_level' => 'Education Level',
        'grade_group' => 'Grade Group',
        'graduation_status' => 'Graduation Status',
        'school' => 'School',
        'registration_center' => 'Registration Center',
        'report_card' => 'Report Card',
        'review_status' => 'Review Status',
        'review_reason' => 'Review Reason',
        'finance_status' => 'Finance Status',
        'tuition_amount' => 'Tuition Amount',
        'discount_amount' => 'Discount Amount',
        'discount_title' => 'Discount Title',
        'net_payable_amount' => 'Net Payable Amount',
    );

    $fields = array();
    foreach ( $map as $key => $id ) {
        $fields[] = array(
            'id' => $id,
            'label' => $labels[ $key ],
            'type' => in_array( $key, array( 'photo', 'report_card' ), true ) ? 'fileupload' : 'text',
            'isRequired' => ! in_array( $key, array( 'photo', 'home_phone', 'father_mobile', 'mother_mobile', 'review_reason', 'discount_title' ), true ),
        );
    }

    $form_id = GFAPI::add_form(
        array(
            'title' => $title,
            'description' => 'Synthetic WU18 native Entry Detail evidence form.',
            'labelPlacement' => 'top_label',
            'fields' => $fields,
            'button' => array( 'type' => 'text', 'text' => 'Submit' ),
        )
    );
    if ( is_wp_error( $form_id ) ) {
        throw new RuntimeException( $form_id->get_error_message() );
    }
    return (int) $form_id;
}

function wu18_add_approval_step( $form_id, $name, $operator_id ) {
    $api = new Gravity_Flow_API( $form_id );
    $step_id = $api->add_step(
        array(
            'step_name' => $name,
            'step_type' => 'approval',
            'description' => 'Synthetic WU18 read-only Approval step.',
            'type' => 'select',
            'assignees' => array( 'user_id|' . (int) $operator_id ),
            'assignee_policy' => 'all',
            'editable_fields' => array(),
            'instructionsEnable' => '1',
            'instructionsValue' => 'Synthetic WU18 review instructions.',
            'note_mode' => 'hidden',
        )
    );
    if ( ! $step_id || is_wp_error( $step_id ) ) {
        throw new RuntimeException( 'Unable to create WU18 synthetic Approval step.' );
    }
    return (int) $step_id;
}

$map_alpha = wu18_field_map( 1 );
$map_beta  = wu18_field_map( 31 );
$form_alpha = wu18_add_form( 'WU18 Alpha Dossier', $map_alpha );
$form_beta  = wu18_add_form( 'WU18 Beta Dossier', $map_beta );
$step_alpha = wu18_add_approval_step( $form_alpha, 'WU18 Alpha Approval', $operator->ID );
$step_beta  = wu18_add_approval_step( $form_beta, 'WU18 Beta Approval', $operator->ID );

$uploads = wp_upload_dir();
$synthetic_dir = trailingslashit( $uploads['basedir'] ) . 'wu18-synthetic';
wp_mkdir_p( $synthetic_dir );
$png = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' );
file_put_contents( $synthetic_dir . '/alpha-photo.png', $png );
file_put_contents( $synthetic_dir . '/beta-photo.png', $png );
file_put_contents( $synthetic_dir . '/alpha-report.png', $png );
$pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
file_put_contents( $synthetic_dir . '/beta-report.pdf', $pdf );
$baseurl = trailingslashit( $uploads['baseurl'] ) . 'wu18-synthetic/';

function wu18_entry_values( $prefix, $map, $photo_url, $report_url ) {
    $values = array(
        'full_name' => 'WU18 ' . $prefix . ' Student',
        'photo' => $photo_url,
        'national_id' => 'WU18-' . strtoupper( substr( $prefix, 0, 1 ) ) . '-0012345678',
        'first_name' => 'Synthetic-' . $prefix . '-First',
        'last_name' => 'Synthetic-' . $prefix . '-Last',
        'father_name' => 'Synthetic Father',
        'birth_date' => '1400/01/02',
        'gender' => 'Synthetic Value',
        'mobile' => '09120000001',
        'home_phone' => '02100000001',
        'father_mobile' => '09120000002',
        'mother_mobile' => '09120000003',
        'education_level' => 'Synthetic Level',
        'grade_group' => 'Synthetic Grade Group',
        'graduation_status' => 'Synthetic Status',
        'school' => 'Synthetic School ' . $prefix,
        'registration_center' => 'Synthetic Center',
        'report_card' => $report_url,
        'review_status' => 'Synthetic Review',
        'review_reason' => 'Synthetic Review Reason',
        'finance_status' => 'Synthetic Finance',
        'tuition_amount' => '1000000',
        'discount_amount' => '100000',
        'discount_title' => 'Synthetic Discount',
        'net_payable_amount' => '900000',
    );

    $entry = array();
    foreach ( $values as $key => $value ) {
        $entry[ (string) $map[ $key ] ] = $value;
    }
    return $entry;
}

function wu18_add_entry( $form_id, $operator_id, $map, $prefix, $photo_url, $report_url, $created ) {
    $entry = array_merge(
        array( 'form_id' => $form_id, 'created_by' => (int) $operator_id ),
        wu18_entry_values( $prefix, $map, $photo_url, $report_url )
    );
    $entry_id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $entry_id ) ) {
        throw new RuntimeException( $entry_id->get_error_message() );
    }
    GFAPI::update_entry_property( $entry_id, 'date_created', $created );
    $api = new Gravity_Flow_API( $form_id );
    $api->process_workflow( $entry_id );
    $current = $api->get_current_step( GFAPI::get_entry( $entry_id ) );
    if ( ! $current || 'approval' !== $current->get_type() ) {
        throw new RuntimeException( 'WU18 entry did not reach the synthetic Approval step.' );
    }
    return (int) $entry_id;
}

$entry_alpha = wu18_add_entry( $form_alpha, $operator->ID, $map_alpha, 'Alpha', $baseurl . 'alpha-photo.png', $baseurl . 'alpha-report.png', '2026-02-01 10:00:00' );
$entry_beta  = wu18_add_entry( $form_beta, $operator->ID, $map_beta, 'Beta', $baseurl . 'beta-photo.png', $baseurl . 'beta-report.pdf', '2026-02-02 11:00:00' );

function wu18_binding_set( $id, $form_id, $map, $photo_state ) {
    $proven = array( 'wu21:synthetic-fixture', 'wu21:reproducible-simulation' );
    $negative = array( 'wu21:fail-closed-negative-control' );
    $field_bindings = array(
        'student.photo' => array( 'photo', $photo_state ),
        'student.first_name' => array( 'first_name', 'PROVEN' ),
        'student.last_name' => array( 'last_name', 'PROVEN' ),
        'student.full_name' => array( 'full_name', 'PROVEN' ),
        'student.father_name' => array( 'father_name', 'PROVEN' ),
        'student.national_id' => array( 'national_id', 'PROVEN' ),
        'student.birth_date_jalali' => array( 'birth_date', 'PROVEN' ),
        'student.gender' => array( 'gender', 'PROVEN' ),
        'student.mobile' => array( 'mobile', 'PROVEN' ),
        'student.home_phone' => array( 'home_phone', 'PROVEN' ),
        'student.father_mobile' => array( 'father_mobile', 'PROVEN' ),
        'student.mother_mobile' => array( 'mother_mobile', 'PROVEN' ),
        'education.level' => array( 'education_level', 'PROVEN' ),
        'education.grade_group' => array( 'grade_group', 'PROVEN' ),
        'education.graduation_status' => array( 'graduation_status', 'PROVEN' ),
        'school.name' => array( 'school', 'PROVEN' ),
        'registration.center' => array( 'registration_center', 'PROVEN' ),
        'documents.report_card' => array( 'report_card', 'PROVEN' ),
        'review.status' => array( 'review_status', 'PROVEN' ),
        'review.reason' => array( 'review_reason', 'PROVEN' ),
        'finance.status' => array( 'finance_status', 'PROVEN' ),
        'finance.tuition_amount' => array( 'tuition_amount', 'PROVEN' ),
        'finance.discount_amount' => array( 'discount_amount', 'PROVEN' ),
        'finance.discount_title' => array( 'discount_title', 'PROVEN' ),
        'finance.net_payable_amount' => array( 'net_payable_amount', 'PROVEN' ),
    );

    $bindings = array();
    foreach ( $field_bindings as $slot => $spec ) {
        list( $field_key, $state ) = $spec;
        $bindings[] = array(
            'semantic_slot_key' => $slot,
            'state' => $state,
            'source_ref' => 'PROVEN' === $state ? array( 'type' => 'gravity_forms.field', 'field_id' => $map[ $field_key ] ) : null,
            'evidence_refs' => 'PROVEN' === $state ? $proven : $negative,
        );
    }

    $bindings[] = array( 'semantic_slot_key' => 'entry.created_at', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.current_step', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.instructions', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'instructions' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.approve_action', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.action', 'action_key' => 'approve' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.reject_action', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.action', 'action_key' => 'reject' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.timeline', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'timeline' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.status', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'status' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'navigation.backlink', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'backlink' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'print.utility', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => $negative );

    $claims = array();
    foreach ( $bindings as $binding ) {
        $claims[] = array(
            'semantic_slot_key' => $binding['semantic_slot_key'],
            'claim' => 'availability',
            'evidence_state' => 'PROVEN' === $binding['state'] ? 'PROVEN' : 'NOT_PROVEN',
            'evidence_refs' => 'PROVEN' === $binding['state'] ? $proven : $negative,
        );
    }
    foreach ( array( 'workflow.approve_action', 'workflow.reject_action' ) as $slot ) {
        $claims[] = array(
            'semantic_slot_key' => $slot,
            'claim' => 'action_permission',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => $proven,
        );
    }
    $claims[] = array(
        'semantic_slot_key' => 'student.mobile',
        'claim' => 'editability',
        'evidence_state' => 'NOT_PROVEN',
        'evidence_refs' => $negative,
    );

    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => $id,
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'wu21-sim-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.entry_detail' ),
        ),
        'provenance' => array( 'producer' => 'WU18 Evidence Lab synthetic fixture builder', 'evidence_refs' => $proven ),
        'bindings' => $bindings,
        'runtime_claims' => $claims,
    );
}

$binding_alpha = wu18_binding_set( 'wu18.sim.alpha.v1', $form_alpha, $map_alpha, 'PROVEN' );
$binding_beta  = wu18_binding_set( 'wu18.sim.beta.v1', $form_beta, $map_beta, 'NOT_PROVEN' );
EnvironmentBindingSet::validate( $binding_alpha );
EnvironmentBindingSet::validate( $binding_beta );

$visual_path = WP_PLUGIN_DIR . '/gravity-presentation-profiles/tests/fixtures/wu09-visual-package.json';
$visual_package = json_decode( file_get_contents( $visual_path ), true );
VisualProfilePackage::validate( $visual_package );
$entry_profile = ( new VisualProfileResolver( $visual_package ) )->resolve( 'gravity_flow.entry_detail' );
if ( ! is_array( $entry_profile ) || 'shared.entry_detail.v1' !== $entry_profile['profile_id'] ) {
    throw new RuntimeException( 'Shared Entry Detail profile identity changed unexpectedly.' );
}

$visual_lifecycle = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
$visual_lifecycle->import( $visual_package );
$visual_lifecycle->activate(
    array(
        'surface' => 'gravity_flow.entry_detail',
        'package_id' => $visual_package['package_id'],
        'package_version' => $visual_package['package_version'],
        'profile_id' => $entry_profile['profile_id'],
    )
);

$binding_lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array( 'wu21:synthetic-fixture', 'wu21:reproducible-simulation' ) )
);
foreach ( array( $binding_alpha, $binding_beta ) as $binding ) {
    $binding_lifecycle->import( $binding );
    $binding_lifecycle->activate(
        array(
            'context' => $binding['context'],
            'binding_set_id' => $binding['binding_set_id'],
            'binding_set_version' => $binding['binding_set_version'],
        )
    );
}
EntryDetailPresentationAdapter::resetRuntimeCache();

$page_id = wp_insert_post(
    array(
        'post_title' => 'WU18 Native Dossier',
        'post_name' => 'wu18-native-dossier',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[gravityflow page="inbox" back_link="true" sidebar="true"]',
    ),
    true
);
if ( is_wp_error( $page_id ) ) {
    throw new RuntimeException( $page_id->get_error_message() );
}
$page_url = get_permalink( $page_id );
if ( ! is_string( $page_url ) || '' === $page_url ) {
    throw new RuntimeException( 'Unable to resolve WU18 native dossier page URL.' );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'installation_id' => 'wu21-sim-installation',
    'operator' => array( 'id' => (int) $operator->ID, 'login' => $operator->user_login, 'password' => 'wu18-synthetic-operator-2026', 'email_domain' => 'example.invalid' ),
    'denied_user' => array( 'id' => (int) $denied->ID, 'login' => $denied->user_login, 'password' => 'wu18-synthetic-denied-2026', 'email_domain' => 'example.invalid' ),
    'page' => array( 'id' => (int) $page_id, 'url' => $page_url, 'slug' => 'wu18-native-dossier' ),
    'forms' => array(
        'alpha' => array( 'form_id' => $form_alpha, 'step_id' => $step_alpha, 'entry_id' => $entry_alpha, 'field_map' => $map_alpha, 'report_file' => 'alpha-report.png', 'report_kind' => 'image' ),
        'beta' => array( 'form_id' => $form_beta, 'step_id' => $step_beta, 'entry_id' => $entry_beta, 'field_map' => $map_beta, 'report_file' => 'beta-report.pdf', 'report_kind' => 'non_image', 'photo_binding_state' => 'NOT_PROVEN' ),
    ),
    'entry_ids' => array( $entry_alpha, $entry_beta ),
    'surface_profile_id' => 'shared.entry_detail.v1',
    'binding_set_ids' => array( 'wu18.sim.alpha.v1', 'wu18.sim.beta.v1' ),
    'target_production_equivalence' => 'NOT_PROVEN',
);
update_option( 'gpp_wu18_fixture_manifest', $manifest, false );
file_put_contents( $artifact_dir . '/wu18-fixture-manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18 native Entry Detail fixtures created: entries={$entry_alpha},{$entry_beta}; page={$page_id}\n";
