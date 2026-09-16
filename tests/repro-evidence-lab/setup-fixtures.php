<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\InboxSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    fwrite( STDERR, "WU21_ARTIFACT_DIR is required.\n" );
    exit( 1 );
}
wp_mkdir_p( $artifact_dir );

if ( ! class_exists( 'GFAPI' ) || ! class_exists( 'Gravity_Flow_API' ) ) {
    fwrite( STDERR, "Gravity Forms / Gravity Flow APIs are unavailable.\n" );
    exit( 1 );
}

$existing = get_option( 'gpp_wu21_fixture_manifest' );
if ( is_array( $existing ) && ! empty( $existing['entry_ids'] ) ) {
    file_put_contents( $artifact_dir . '/fixture-manifest.json', wp_json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
    echo "WU21 fixtures already exist.\n";
    return;
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) {
    throw new RuntimeException( 'Synthetic WU21 operator/viewer accounts must be provisioned by the pinned CI workflow.' );
}

function wu21_add_form( $title, $field_ids ) {
    $form = array(
        'title' => $title,
        'description' => 'Synthetic WU21/PR4 authentic Inbox evidence form.',
        'labelPlacement' => 'top_label',
        'fields' => array(
            array( 'id' => $field_ids['first_name'], 'label' => 'Student First Name', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => $field_ids['last_name'], 'label' => 'Student Last Name', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => $field_ids['photo'], 'label' => 'Student Photo', 'type' => 'fileupload', 'isRequired' => false ),
            array( 'id' => $field_ids['national_id'], 'label' => 'Synthetic National ID', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => $field_ids['grade_group'], 'label' => 'Grade / Group', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => $field_ids['school'], 'label' => 'School', 'type' => 'text', 'isRequired' => true ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    );
    $id = GFAPI::add_form( $form );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    return (int) $id;
}

$alpha_fields = array( 'first_name' => 1, 'photo' => 2, 'national_id' => 3, 'last_name' => 4, 'grade_group' => 5, 'school' => 6 );
$beta_fields  = array( 'first_name' => 7, 'last_name' => 8, 'photo' => 9, 'grade_group' => 10, 'national_id' => 11, 'school' => 12 );
$form_alpha = wu21_add_form( 'WU21 Alpha Form', $alpha_fields );
$form_beta  = wu21_add_form( 'WU21 Beta Form', $beta_fields );

function wu21_add_approval_step( $form_id, $name, $operator_id ) {
    $api = new Gravity_Flow_API( $form_id );
    $step_id = $api->add_step(
        array(
            'step_name' => $name,
            'step_type' => 'approval',
            'description' => 'Synthetic WU21 approval step.',
            'type' => 'select',
            'assignees' => array( 'user_id|' . (int) $operator_id ),
            'assignee_policy' => 'all',
            'instructions' => 'Synthetic review only.',
        )
    );
    if ( ! $step_id || is_wp_error( $step_id ) ) {
        throw new RuntimeException( 'Unable to create Gravity Flow approval step.' );
    }
    return (int) $step_id;
}

$step_alpha = wu21_add_approval_step( $form_alpha, 'WU21 Alpha Review', $operator->ID );
$step_beta  = wu21_add_approval_step( $form_beta, 'WU21 Beta Review', $operator->ID );

$uploads = wp_upload_dir();
$synthetic_dir = trailingslashit( $uploads['basedir'] ) . 'wu21-synthetic';
wp_mkdir_p( $synthetic_dir );
$png = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' );
file_put_contents( $synthetic_dir . '/alpha.png', $png );
file_put_contents( $synthetic_dir . '/beta.png', $png );
$alpha_photo = trailingslashit( $uploads['baseurl'] ) . 'wu21-synthetic/alpha.png';
$beta_photo  = trailingslashit( $uploads['baseurl'] ) . 'wu21-synthetic/beta.png';

$entry_ids = array();
$entry_records = array();
for ( $i = 0; $i < 25; $i++ ) {
    $is_alpha = 0 === $i % 2;
    $form_id = $is_alpha ? $form_alpha : $form_beta;
    $fields = $is_alpha ? $alpha_fields : $beta_fields;
    $prefix = $is_alpha ? 'Alpha' : 'Beta';
    $first_name = 'WU21 ' . $prefix;
    $last_name = sprintf( 'Student %02d', $i );
    $student_name = trim( $first_name . ' ' . $last_name );
    $national_id = sprintf( 'SYN-%s-%06d', $is_alpha ? 'A' : 'B', $i );
    $grade_group = 0 === $i
        ? 'پایه دوازدهم علوم تجربی — گروه آزمایشی با عنوان طولانی برای آزمون بازچینی متن'
        : ( $is_alpha ? 'پایه یازدهم — گروه آلفا' : 'پایه دهم — گروه بتا' );
    $school = 0 === $i
        ? 'دبیرستان نمونه دولتی استعدادهای درخشان شهید بهشتی منطقه آموزش و پرورش آزمایشی با نام طولانی'
        : ( $is_alpha ? 'دبیرستان آلفا' : 'دبیرستان بتا' );

    $entry = array(
        'form_id' => $form_id,
        'created_by' => (int) $operator->ID,
        (string) $fields['first_name'] => $first_name,
        (string) $fields['last_name'] => $last_name,
        (string) $fields['photo'] => $is_alpha ? $alpha_photo : $beta_photo,
        (string) $fields['national_id'] => $national_id,
        (string) $fields['grade_group'] => $grade_group,
        (string) $fields['school'] => $school,
    );
    $entry_id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $entry_id ) ) {
        throw new RuntimeException( $entry_id->get_error_message() );
    }

    $created = gmdate( 'Y-m-d H:i:s', strtotime( '2026-01-01 00:00:00 UTC' ) + ( $i * 60 ) );
    GFAPI::update_entry_property( $entry_id, 'date_created', $created );
    $api = new Gravity_Flow_API( $form_id );
    $api->process_workflow( $entry_id );
    $current = $api->get_current_step( GFAPI::get_entry( $entry_id ) );
    if ( ! $current ) {
        throw new RuntimeException( 'Workflow did not reach the synthetic approval step for entry ' . $entry_id );
    }

    $entry_ids[] = (int) $entry_id;
    $entry_records[] = array(
        'entry_id' => (int) $entry_id,
        'form_id' => $form_id,
        'first_name' => $first_name,
        'last_name' => $last_name,
        'student_name' => $student_name,
        'national_id' => $national_id,
        'grade_group' => $grade_group,
        'school' => $school,
        'date_created' => $created,
        'step_id' => (int) $current->get_id(),
        'step_name' => $current->get_name(),
    );
}

function wu21_binding_lifecycle_reader() {
    return new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array() )
    );
}

function wu21_map_field_through_product( BindingRepairService $repair, OperationsSetupService $operations, $form_id, $slot, $field_id ) {
    $context = $operations->bindingContext( $form_id );
    $lifecycle = wu21_binding_lifecycle_reader();
    $active = $lifecycle->resolve( $context );
    if ( ! is_array( $active ) ) {
        throw new RuntimeException( 'Active operations binding context missing before field repair.' );
    }
    $result = $repair->repairField(
        array(
            'context_key' => $lifecycle->contextKey( $context ),
            'binding_set_id' => $active['binding_set_id'],
            'binding_set_version' => $active['binding_set_version'],
            'semantic_slot_key' => $slot,
            'field_id' => (string) $field_id,
        )
    );
    if ( ! in_array( $result['status'], array( 'REPAIRED_AND_ACTIVATED', 'UNCHANGED' ), true ) ) {
        throw new RuntimeException( 'Production mapping path did not activate semantic ' . $slot );
    }
}

$operations = OperationsSetupService::forWordPress();
$repair = BindingRepairService::forWordPress();
$inbox_setup = InboxSetupService::forWordPress();

foreach ( array(
    array( 'form_id' => $form_alpha, 'fields' => $alpha_fields ),
    array( 'form_id' => $form_beta, 'fields' => $beta_fields ),
) as $configured ) {
    $form_id = (int) $configured['form_id'];
    $setup = $operations->initialize( array( 'form_id' => $form_id ) );
    if ( OperationsSetupService::STATUS_COMPLETED !== $setup['status'] ) {
        throw new RuntimeException( 'Operations setup did not complete for synthetic form ' . $form_id );
    }

    foreach ( array(
        'student.photo' => $configured['fields']['photo'],
        'student.first_name' => $configured['fields']['first_name'],
        'student.last_name' => $configured['fields']['last_name'],
        'student.national_id' => $configured['fields']['national_id'],
        'education.grade_group' => $configured['fields']['grade_group'],
        'school.name' => $configured['fields']['school'],
    ) as $slot => $field_id ) {
        wu21_map_field_through_product( $repair, $operations, $form_id, $slot, $field_id );
    }

    $inbox_result = $inbox_setup->initialize( array( 'form_id' => $form_id ) );
    if ( InboxSetupService::STATUS_COMPLETED !== $inbox_result['status'] ) {
        throw new RuntimeException( 'Explicit Inbox product setup did not complete for synthetic form ' . $form_id );
    }
}

// Test-only seam adapters consume a read-only mirror of the artifacts produced
// by the real product path. This option is not used to provision production GPP.
$binding_reader = wu21_binding_lifecycle_reader();
$binding_snapshot = $binding_reader->snapshot();
$active_binding_artifacts = array();
$binding_set_ids = array();
foreach ( $binding_snapshot['activations'] as $context_key => $identity ) {
    $id = $identity['binding_set_id'];
    $version = $identity['binding_set_version'];
    if ( empty( $binding_snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
        continue;
    }
    $record = $binding_snapshot['installed'][ $id ][ $version ];
    if ( $record['context_key'] !== $context_key ) {
        continue;
    }
    $active_binding_artifacts[] = $record['artifact'];
    $binding_set_ids[] = $id;
}
update_option( 'gpp_wu21_binding_sets', $active_binding_artifacts, false );

$frontend_page_id = wp_insert_post(
    array(
        'post_title' => 'WU21 Frontend Inbox',
        'post_status' => 'publish',
        'post_type' => 'page',
        'post_content' => '[gravityflow page="inbox"]',
    ),
    true
);
if ( is_wp_error( $frontend_page_id ) ) {
    throw new RuntimeException( $frontend_page_id->get_error_message() );
}
$frontend_inbox_url = get_permalink( $frontend_page_id );
if ( ! is_string( $frontend_inbox_url ) || '' === $frontend_inbox_url ) {
    throw new RuntimeException( 'Frontend Gravity Flow Inbox URL could not be created.' );
}

InboxPresentationAdapter::resetRuntimeCache();

$manifest = array(
    'schema_version' => '1.2.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'installation_id' => OperationsSetupService::hostInstallationId(),
    'operator' => array( 'id' => (int) $operator->ID, 'login' => $operator->user_login, 'email_domain' => 'example.invalid' ),
    'viewer' => array( 'id' => (int) $viewer->ID, 'login' => $viewer->user_login, 'email_domain' => 'example.invalid' ),
    'forms' => array(
        array(
            'key' => 'alpha',
            'form_id' => $form_alpha,
            'name_field_id' => $alpha_fields['first_name'],
            'first_name_field_id' => $alpha_fields['first_name'],
            'last_name_field_id' => $alpha_fields['last_name'],
            'photo_field_id' => $alpha_fields['photo'],
            'national_id_field_id' => $alpha_fields['national_id'],
            'grade_group_field_id' => $alpha_fields['grade_group'],
            'school_field_id' => $alpha_fields['school'],
            'step_id' => $step_alpha,
        ),
        array(
            'key' => 'beta',
            'form_id' => $form_beta,
            'name_field_id' => $beta_fields['first_name'],
            'first_name_field_id' => $beta_fields['first_name'],
            'last_name_field_id' => $beta_fields['last_name'],
            'photo_field_id' => $beta_fields['photo'],
            'national_id_field_id' => $beta_fields['national_id'],
            'grade_group_field_id' => $beta_fields['grade_group'],
            'school_field_id' => $beta_fields['school'],
            'step_id' => $step_beta,
        ),
    ),
    'entry_ids' => $entry_ids,
    'entry_records' => $entry_records,
    'base_entry_count' => count( $entry_ids ),
    'surface_profile_id' => 'srwf.operations.inbox.v1',
    'operations_package_version' => '1.0.1',
    'optional_capabilities' => array( 'workflow.due_at' => 'UNBOUND' ),
    'binding_set_ids' => array_values( array_unique( $binding_set_ids ) ),
    'frontend_inbox_page_id' => (int) $frontend_page_id,
    'frontend_inbox_url' => $frontend_inbox_url,
);
update_option( 'gpp_wu21_fixture_manifest', $manifest, false );
file_put_contents( $artifact_dir . '/fixture-manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU21/PR4 authentic product fixtures created: {$form_alpha}, {$form_beta}; entries=" . count( $entry_ids ) . "\n";
