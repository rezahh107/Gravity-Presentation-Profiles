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
use GravityPresentationProfiles\SRWF\GravityFlow\InboxFieldPresentationResolver;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}

$existing = get_option( 'gpp_pr32_human_display_fixture' );
if ( is_array( $existing ) && ! empty( $existing['entry_id'] ) ) {
    file_put_contents( $artifact_dir . '/pr32-human-display-fixture.json', wp_json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
    return;
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $operator ) {
    throw new RuntimeException( 'WU21 bootstrap operator is unavailable.' );
}

$form = array(
    'title' => 'PR32 Human Display Form',
    'description' => 'Synthetic authentic Gravity Forms display/media fixture.',
    'labelPlacement' => 'top_label',
    'fields' => array(
        array( 'id' => 1, 'label' => 'Student First Name', 'type' => 'text', 'isRequired' => true ),
        array( 'id' => 2, 'label' => 'Student Photo', 'type' => 'fileupload', 'isRequired' => false, 'multipleFiles' => false, 'allowedExtensions' => 'jpg,jpeg,png,gif,webp' ),
        array( 'id' => 3, 'label' => 'National ID', 'type' => 'text', 'isRequired' => true ),
        array( 'id' => 4, 'label' => 'Student Last Name', 'type' => 'text', 'isRequired' => true ),
        array(
            'id' => 5,
            'label' => 'Grade / Group',
            'type' => 'select',
            'isRequired' => true,
            'choices' => array(
                array( 'text' => 'پایه سوم انسانی', 'value' => '3', 'isSelected' => false ),
                array( 'text' => 'پایه چهارم تجربی', 'value' => '4', 'isSelected' => false ),
            ),
        ),
        array(
            'id' => 6,
            'label' => 'School',
            'type' => 'select',
            'isRequired' => true,
            'choices' => array(
                array( 'text' => 'دبیرستان فرهنگ', 'value' => '168', 'isSelected' => false ),
                array( 'text' => 'دبیرستان نمونه', 'value' => '169', 'isSelected' => false ),
            ),
        ),
        array( 'id' => 7, 'label' => 'Multi Photo Probe', 'type' => 'fileupload', 'isRequired' => false, 'multipleFiles' => true, 'allowedExtensions' => 'jpg,jpeg,png,gif,webp' ),
    ),
    'button' => array( 'type' => 'text', 'text' => 'Submit' ),
);
$form_id = GFAPI::add_form( $form );
if ( is_wp_error( $form_id ) ) {
    throw new RuntimeException( $form_id->get_error_message() );
}
$form_id = (int) $form_id;

$api = new Gravity_Flow_API( $form_id );
$step_id = $api->add_step(
    array(
        'step_name' => 'PR32 Human Display Review',
        'step_type' => 'approval',
        'description' => 'Synthetic PR32 Inbox qualification step.',
        'type' => 'select',
        'assignees' => array( 'user_id|' . (int) $operator->ID ),
        'assignee_policy' => 'all',
        'instructions' => 'Synthetic review only.',
    )
);
if ( ! $step_id || is_wp_error( $step_id ) ) {
    throw new RuntimeException( 'Unable to create PR32 Gravity Flow approval step.' );
}

$uploads = wp_upload_dir();
$dir = trailingslashit( $uploads['basedir'] ) . 'wu21-pr32';
wp_mkdir_p( $dir );
$png = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' );
file_put_contents( $dir . '/student.png', $png );
file_put_contents( $dir . '/student-alt.png', $png );
$photo_url = trailingslashit( $uploads['baseurl'] ) . 'wu21-pr32/student.png';
$photo_alt_url = trailingslashit( $uploads['baseurl'] ) . 'wu21-pr32/student-alt.png';

$entry = array(
    'form_id' => $form_id,
    'created_by' => (int) $operator->ID,
    '1' => 'زهرا',
    '2' => $photo_url,
    '3' => '0012345678',
    '4' => 'رضایی',
    '5' => '3',
    '6' => '168',
    '7' => wp_json_encode( array( $photo_url, $photo_alt_url ), JSON_UNESCAPED_SLASHES ),
);
$entry_id = GFAPI::add_entry( $entry );
if ( is_wp_error( $entry_id ) ) {
    throw new RuntimeException( $entry_id->get_error_message() );
}
$entry_id = (int) $entry_id;
GFAPI::update_entry_property( $entry_id, 'date_created', '2026-02-01 12:34:56' );
$api->process_workflow( $entry_id );
$stored_entry = GFAPI::get_entry( $entry_id );
if ( is_wp_error( $stored_entry ) ) {
    throw new RuntimeException( $stored_entry->get_error_message() );
}

$operations = OperationsSetupService::forWordPress();
$repair = BindingRepairService::forWordPress();
$setup = $operations->initialize( array( 'form_id' => $form_id ) );
if ( OperationsSetupService::STATUS_COMPLETED !== $setup['status'] ) {
    throw new RuntimeException( 'PR32 Operations setup did not complete.' );
}

$lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array() )
);
$context = $operations->bindingContext( $form_id );
foreach ( array(
    'student.photo' => 2,
    'student.first_name' => 1,
    'student.last_name' => 4,
    'student.national_id' => 3,
    'education.grade_group' => 5,
    'school.name' => 6,
) as $slot => $field_id ) {
    $active = $lifecycle->resolve( $context );
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
        throw new RuntimeException( 'Unable to map PR32 semantic ' . $slot );
    }
}

$inbox = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $form_id ) );
if ( InboxSetupService::STATUS_COMPLETED !== $inbox['status'] ) {
    throw new RuntimeException( 'PR32 Inbox setup did not complete.' );
}

$stored_form = GFAPI::get_form( $form_id );
$grade_field = GFAPI::get_field( $stored_form, 5 );
$school_field = GFAPI::get_field( $stored_form, 6 );
$photo_field = GFAPI::get_field( $stored_form, 2 );
$multi_field = GFAPI::get_field( $stored_form, 7 );
if ( ! is_object( $grade_field ) || ! is_object( $school_field ) || ! is_object( $photo_field ) || ! is_object( $multi_field ) ) {
    throw new RuntimeException( 'Authentic Gravity Forms fields are unavailable.' );
}

$resolver = new InboxFieldPresentationResolver();
$grade = $resolver->resolveText( array( 'type' => 'gravity_forms.field', 'field_id' => 5 ), $stored_form, $stored_entry );
$school = $resolver->resolveText( array( 'type' => 'gravity_forms.field', 'field_id' => 6 ), $stored_form, $stored_entry );
$photo = $resolver->resolvePhoto( array( 'type' => 'gravity_forms.field', 'field_id' => 2 ), $stored_form, $stored_entry );
$multi_photo = $resolver->resolvePhoto( array( 'type' => 'gravity_forms.field', 'field_id' => 7 ), $stored_form, $stored_entry );

if ( '3' !== (string) $grade['raw'] || 'پایه سوم انسانی' !== $grade['display_text'] ) {
    throw new RuntimeException( 'Authentic Gravity Forms grade display semantics did not resolve raw 3 to its host label.' );
}
if ( '168' !== (string) $school['raw'] || 'دبیرستان فرهنگ' !== $school['display_text'] ) {
    throw new RuntimeException( 'Authentic Gravity Forms school display semantics did not resolve raw 168 to its host label.' );
}
if ( 'resolved' !== $photo['status'] || empty( $photo['url'] ) ) {
    throw new RuntimeException( 'Authentic single-file Gravity Forms photo did not resolve.' );
}
if ( 'multiple_files_selection_unproven' !== $multi_photo['status'] || null !== $multi_photo['url'] ) {
    throw new RuntimeException( 'Authentic multi-file ambiguity was not preserved as unresolved.' );
}

$base_manifest = get_option( 'gpp_wu21_fixture_manifest' );
$manifest = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'form_id' => $form_id,
    'entry_id' => $entry_id,
    'frontend_inbox_url' => isset( $base_manifest['frontend_inbox_url'] ) ? $base_manifest['frontend_inbox_url'] : null,
    'raw_grade' => '3',
    'display_grade' => 'پایه سوم انسانی',
    'raw_school' => '168',
    'display_school' => 'دبیرستان فرهنگ',
    'national_id' => '0012345678',
    'student_name' => 'زهرا رضایی',
    'photo_url' => $photo_url,
    'photo_resolution' => $photo,
    'multi_photo_resolution' => $multi_photo,
    'host_fields' => array(
        'grade' => array( 'class' => get_class( $grade_field ), 'type' => $grade_field->get_input_type() ),
        'school' => array( 'class' => get_class( $school_field ), 'type' => $school_field->get_input_type() ),
        'photo' => array(
            'class' => get_class( $photo_field ),
            'type' => $photo_field->get_input_type(),
            'multipleFiles' => ! empty( $photo_field->multipleFiles ),
            'storageType' => isset( $photo_field->storageType ) ? $photo_field->storageType : null,
            'raw_value' => $stored_entry['2'],
        ),
        'multi_photo' => array(
            'class' => get_class( $multi_field ),
            'type' => $multi_field->get_input_type(),
            'multipleFiles' => ! empty( $multi_field->multipleFiles ),
            'storageType' => isset( $multi_field->storageType ) ? $multi_field->storageType : null,
            'raw_value' => $stored_entry['7'],
        ),
    ),
);
update_option( 'gpp_pr32_human_display_fixture', $manifest, false );
file_put_contents( $artifact_dir . '/pr32-human-display-fixture.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );

echo "PR32_HUMAN_DISPLAY_FIXTURE_READY\n";
