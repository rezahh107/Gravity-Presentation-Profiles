<?php
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\InboxSetupService;

$prior = get_option( 'ciq_fixture' );
if ( ! get_option( 'ciq_gate_b_passed' ) || ! $prior ) { throw new RuntimeException( 'PR169 baseline must pass first' ); }
$form = GFAPI::add_form( array( 'title' => 'CQ native cell fixture', 'fields' => array(
    array( 'id' => 1, 'type' => 'text', 'label' => 'نام' ),
    array( 'id' => 2, 'type' => 'text', 'label' => 'نام خانوادگی' ),
    array( 'id' => 3, 'type' => 'fileupload', 'label' => 'عکس' ),
    array( 'id' => 4, 'type' => 'text', 'label' => 'کد ملی آزمایشی' ),
    array( 'id' => 5, 'type' => 'select', 'label' => 'پایه', 'enableChoiceValue' => true, 'choices' => array(
        array( 'text' => 'دهم — گروه آزمایشی', 'value' => 'grade_code_10' ) ) ),
    array( 'id' => 6, 'type' => 'select', 'label' => 'مدرسه', 'enableChoiceValue' => true, 'choices' => array(
        array( 'text' => 'مدرسه «آفتاب» & نوآوری', 'value' => 'school_code_A' ) ) ),
    array( 'id' => 7, 'type' => 'text', 'label' => 'شناسهٔ جایگزین' ),
    array( 'id' => 9, 'type' => 'text', 'label' => 'فیلد محرمانهٔ خارج از Inbox' ),
), 'button' => array( 'type' => 'text', 'text' => 'Submit' ) ) );
if ( is_wp_error( $form ) ) { throw new RuntimeException( 'Synthetic form creation failed' ); }
$api = new Gravity_Flow_API( $form );
$step = $api->add_step( array( 'step_name' => 'CQ Assigned Review', 'step_type' => 'approval', 'type' => 'select',
    'assignees' => array( 'user_id|' . $prior['officer'], 'user_id|' . $prior['admin'] ), 'assignee_policy' => 'all',
    'display_fields_mode' => 'selected_fields', 'display_fields_selected' => array( '1', '2', '5', '6' ) ) );
$next = $api->add_step( array( 'step_name' => 'CQ Next Role', 'step_type' => 'approval', 'type' => 'select',
    'assignees' => array( 'role|author' ), 'assignee_policy' => 'all', 'display_fields_mode' => 'all_fields' ) );
if ( ! $step || ! $next || is_wp_error( $step ) || is_wp_error( $next ) ) { throw new RuntimeException( 'Synthetic steps failed' ); }
$operations = OperationsSetupService::forWordPress();
$repair = BindingRepairService::forWordPress();
$result = $operations->initialize( array( 'form_id' => $form ) );
if ( $result['status'] !== OperationsSetupService::STATUS_COMPLETED ) { throw new RuntimeException( 'Real operations setup failed' ); }
foreach ( array( 'student.first_name' => 1, 'student.last_name' => 2, 'student.photo' => 3, 'student.national_id' => 4,
    'education.grade_group' => 5, 'school.name' => 6 ) as $slot => $field ) {
    $reader = new BindingSetLifecycle( new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ), new EvidenceReferenceGate( array() ) );
    $context = $operations->bindingContext( $form ); $active = $reader->resolve( $context );
    $r = $repair->repairField( array( 'context_key' => $reader->contextKey( $context ), 'binding_set_id' => $active['binding_set_id'],
        'binding_set_version' => $active['binding_set_version'], 'semantic_slot_key' => $slot, 'field_id' => (string) $field ) );
    if ( ! in_array( $r['status'], array( 'UNCHANGED', 'REPAIRED_AND_ACTIVATED' ), true ) ) { throw new RuntimeException( 'Real binding repair failed' ); }
}
$r = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $form ) );
if ( $r['status'] !== InboxSetupService::STATUS_COMPLETED ) { throw new RuntimeException( 'Real Inbox setup failed' ); }
$entries = array();
$witnesses = array(
    array( '1' => 'آرین & همکار', '2' => 'کاظمی «الف»', '4' => 'CQ_RAW_NID_A<&"', '5' => 'grade_code_10', '6' => 'school_code_A' ),
    array( '1' => 'آزمایش نیمه‌کامل', '2' => '', '4' => 'CQ_SYNTH_PARTIAL_NID_B', '5' => 'grade_code_10', '6' => '' ),
    array( '1' => 'نام <img src=x onerror="window.__cellq_xss=1"> امن', '2' => 'کاظمی ب‌پ', '4' => 'CQ_RAW_NID_C', '5' => '', '6' => 'school_code_A' ),
);
foreach ( $witnesses as $index => $values ) {
    $record = array( 'form_id' => $form, 'created_by' => $prior['admin'],
        '7' => 'CQ_ALT_NID_' . $index, '9' => 'CQ_SECRET_DO_NOT_EXPOSE_' . $index ) + $values;
    $id = GFAPI::add_entry( $record );
    if ( is_wp_error( $id ) ) { throw new RuntimeException( 'Real entry insertion failed' ); }
    $stored = GFAPI::get_entry( $id );
    foreach ( array( 1, 2, 4, 5, 6, 7, 9 ) as $field_id ) {
        if ( (string) ( $stored[ (string) $field_id ] ?? '' ) !== (string) ( $record[ $field_id ] ?? '' ) ) { throw new RuntimeException( 'Numeric field identity was changed during fixture insertion' ); }
    }
    $api->process_workflow( $id ); $entries[] = (int) $id;
}
$page = wp_insert_post( array( 'post_title' => 'CQ Native Scoped Inbox', 'post_status' => 'publish', 'post_type' => 'page',
    'post_content' => '[gravityflow page="inbox" form="' . $form . '"]' ), true );
if ( is_wp_error( $page ) ) { throw new RuntimeException( 'Native page creation failed' ); }
$fixture = array_merge( array_intersect_key( $prior, array_flip( array( 'officer', 'viewer', 'admin', 'receiver' ) ) ), array(
    'form_id' => (int) $form, 'step_id' => (int) $step, 'next_step' => (int) $next, 'entries' => $entries,
    'native_url' => get_permalink( $page ), 'witnesses' => $witnesses ) );
update_option( 'cellq_fixture', $fixture, false ); update_option( 'cellq_mode', 'baseline', false );
file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/cellq-fixture.json', wp_json_encode( $fixture, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
echo "CELLQ_AUTHENTIC_FIXTURE_CREATED\n";
