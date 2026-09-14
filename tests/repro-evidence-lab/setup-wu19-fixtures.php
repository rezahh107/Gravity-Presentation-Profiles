<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$wu18 = get_option( 'gpp_wu18_fixture_manifest' );
$base = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $wu18 ) || ! is_array( $base ) ) throw new RuntimeException( 'WU19 requires WU18/WU21 fixtures.' );

function wu19_base_form_meta( $base, $form_id ) {
    foreach ( $base['forms'] as $form ) if ( (int) $form['form_id'] === (int) $form_id ) return $form;
    throw new RuntimeException( 'WU19 base form metadata missing.' );
}

function wu19_add_fields( $form_id ) {
    $form = GFAPI::get_form( $form_id );
    if ( ! is_array( $form ) ) throw new RuntimeException( 'WU19 form unavailable.' );
    $max = 0;
    foreach ( $form['fields'] as $field ) $max = max( $max, (int) $field->id );
    $specs = array(
        'school.name' => 'School Name', 'registration.center' => 'Registration Center', 'registration.counter' => 'Registration Counter',
        'education.graduation_status' => 'Graduation Status', 'finance.tuition_amount' => 'Tuition Amount',
        'finance.discount_amount' => 'Discount Amount', 'finance.discount_title' => 'Discount Title',
        'finance.net_payable_amount' => 'Net Payable', 'print.academic_year_start' => 'Academic Year Start',
        'print.academic_year_end' => 'Academic Year End', 'print.sub_office' => 'Sub Office', 'print.first_exam_date' => 'First Exam Date',
    );
    $ids = array();
    foreach ( $specs as $slot => $label ) {
        $max++;
        $ids[ $slot ] = $max;
        $form['fields'][] = array( 'id' => $max, 'label' => 'WU19 ' . $label, 'type' => 'text', 'isRequired' => false );
    }
    $result = GFAPI::update_form( $form );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    return $ids;
}

$alpha_form_id = (int) $wu18['alpha']['form_id'];
$beta_form_id = (int) $wu18['beta']['form_id'];
$alpha_entry_id = (int) $wu18['alpha']['entry_id'];
$beta_entry_id = (int) $wu18['beta']['entry_id'];
$alpha_extra = wu19_add_fields( $alpha_form_id );
$beta_extra = wu19_add_fields( $beta_form_id );
$alpha_base = wu19_base_form_meta( $base, $alpha_form_id );
$beta_base = wu19_base_form_meta( $base, $beta_form_id );

function wu19_populate( $entry_id, $ids, $prefix ) {
    $values = array(
        'school.name' => 'دبیرستان نمونه ' . $prefix, 'registration.center' => '1',
        'registration.counter' => 'REG-' . strtoupper( $prefix ) . '-001', 'education.graduation_status' => '0',
        'finance.tuition_amount' => '125000000', 'finance.discount_amount' => '15000000',
        'finance.discount_title' => 'تخفیف مصوب آموزشی', 'finance.net_payable_amount' => '110000000',
        'print.academic_year_start' => '۱۴۰۵', 'print.academic_year_end' => '۱۴۰۶',
        'print.sub_office' => 'شیراز', 'print.first_exam_date' => '۱۴۰۵/۰۷/۱۵',
    );
    foreach ( $values as $slot => $value ) {
        $result = GFAPI::update_entry_field( $entry_id, $ids[ $slot ], $value );
        if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    }
}
wu19_populate( $alpha_entry_id, $alpha_extra, 'alpha' );
wu19_populate( $beta_entry_id, $beta_extra, 'beta' );

$alpha_fields = $wu18['alpha']['fields'];
$beta_fields = $wu18['beta']['fields'];
GFAPI::update_entry_field( $alpha_entry_id, $alpha_fields['student.gender'], '0' );
GFAPI::update_entry_field( $beta_entry_id, $beta_fields['student.gender'], '1' );

$visual_path = WP_PLUGIN_DIR . '/gravity-presentation-profiles/tests/fixtures/wu09-visual-package.json';
$visual_package = json_decode( file_get_contents( $visual_path ), true );
$profile = ( new VisualProfileResolver( $visual_package ) )->resolve( 'print.dossier' );
if ( ! is_array( $profile ) || 'shared.print.v1' !== $profile['profile_id'] ) throw new RuntimeException( 'Shared print profile identity changed.' );
$visual_lifecycle = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
$visual_lifecycle->activate( array( 'surface' => 'print.dossier', 'package_id' => $visual_package['package_id'], 'package_version' => $visual_package['package_version'], 'profile_id' => $profile['profile_id'] ) );

function wu19_binding_set( $id, $form_id, $base_meta, $wu18_fields, $extra ) {
    $proven = array( 'wu19:synthetic-fixture', 'wu19:pinned-runtime' );
    $negative = array( 'wu19:negative-control' );
    $proven_fields = array(
        'student.full_name' => $base_meta['name_field_id'], 'student.national_id' => $base_meta['national_id_field_id'],
        'student.father_name' => $wu18_fields['student.father_name'], 'student.gender' => $wu18_fields['student.gender'],
        'student.mobile' => $wu18_fields['student.mobile'], 'education.grade_group' => $wu18_fields['education.grade_group'],
        'school.name' => $extra['school.name'], 'registration.center' => $extra['registration.center'],
        'registration.counter' => $extra['registration.counter'], 'education.graduation_status' => $extra['education.graduation_status'],
        'finance.tuition_amount' => $extra['finance.tuition_amount'], 'finance.discount_amount' => $extra['finance.discount_amount'],
        'finance.discount_title' => $extra['finance.discount_title'], 'finance.net_payable_amount' => $extra['finance.net_payable_amount'],
        'print.academic_year_start' => $extra['print.academic_year_start'], 'print.academic_year_end' => $extra['print.academic_year_end'],
        'print.sub_office' => $extra['print.sub_office'], 'print.first_exam_date' => $extra['print.first_exam_date'],
    );
    $manual = array(
        'print.phone_2', 'print.registration_type', 'print.registration_timing', 'print.payment_mode',
        'print.financial_date', 'print.receipt_rows', 'print.cheque_rows', 'print.received_amount_words',
        'print.received_amount_number', 'print.referrer', 'print.former_kanoon_status', 'print.exam_count',
        'print.manual_approval_signature_stamp_notes', 'print.utility',
    );
    $bindings = array();
    foreach ( $proven_fields as $slot => $field_id ) $bindings[] = array( 'semantic_slot_key' => $slot, 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $field_id ), 'evidence_refs' => $proven );
    foreach ( $manual as $slot ) $bindings[] = array( 'semantic_slot_key' => $slot, 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => $negative );
    $claims = array();
    foreach ( array( 'student.gender', 'education.graduation_status', 'registration.center', 'registration.counter', 'print.academic_year_start', 'print.academic_year_end', 'print.sub_office', 'print.first_exam_date' ) as $slot ) {
        $claims[] = array( 'semantic_slot_key' => $slot, 'claim' => 'print_mapping', 'evidence_state' => 'PROVEN', 'evidence_refs' => $proven );
    }
    foreach ( $manual as $slot ) $claims[] = array( 'semantic_slot_key' => $slot, 'claim' => 'print_mapping', 'evidence_state' => 'NOT_PROVEN', 'evidence_refs' => $negative );
    return array(
        'artifact_type' => 'gpp.environment_binding_set', 'schema_version' => '1.0.0', 'binding_set_id' => $id, 'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'wu21-sim-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ), 'entry_source_ref' => null, 'surfaces' => array( 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'WU19 pinned Evidence Lab fixture', 'evidence_refs' => $proven ),
        'bindings' => $bindings, 'runtime_claims' => $claims,
    );
}

$alpha_binding = wu19_binding_set( 'wu19.sim.alpha.v1', $alpha_form_id, $alpha_base, $alpha_fields, $alpha_extra );
$beta_binding = wu19_binding_set( 'wu19.sim.beta.v1', $beta_form_id, $beta_base, $beta_fields, $beta_extra );
foreach ( array( $alpha_binding, $beta_binding ) as $binding ) EnvironmentBindingSet::validate( $binding );
$binding_lifecycle = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array( 'wu19:synthetic-fixture', 'wu19:pinned-runtime', 'wu19:negative-control' ) )
);
foreach ( array( $alpha_binding, $beta_binding ) as $binding ) {
    $binding_lifecycle->import( $binding );
    $binding_lifecycle->activate( array( 'context' => $binding['context'], 'binding_set_id' => $binding['binding_set_id'], 'binding_set_version' => $binding['binding_set_version'] ) );
}
PrintDossierPresentationAdapter::resetRuntimeCache();

$operator = get_user_by( 'login', 'wu19_operator' );
if ( ! $operator ) {
    $operator_id = wp_create_user( 'wu19_operator', 'wu19-operator-pass-2026', 'wu19.operator@example.invalid' );
    if ( is_wp_error( $operator_id ) ) throw new RuntimeException( $operator_id->get_error_message() );
    $operator = get_user_by( 'id', $operator_id );
    $operator->set_role( 'subscriber' );
}
$bootstrap = get_user_by( 'login', 'bootstrap_admin' );
if ( ! $bootstrap ) throw new RuntimeException( 'Bootstrap admin missing.' );

$api = new Gravity_Flow_API( $alpha_form_id );
$alpha_entry = GFAPI::get_entry( $alpha_entry_id );
$step = $api->get_current_step( $alpha_entry );
if ( ! $step || 'approval' !== $step->get_type() ) throw new RuntimeException( 'WU19 alpha Approval step missing.' );

$manifest = array(
    'schema_version' => '1.0.0', 'data_class' => 'SYNTHETIC_NON_PII', 'profile_id' => 'shared.print.v1',
    'alpha' => array( 'form_id' => $alpha_form_id, 'entry_id' => $alpha_entry_id, 'fields' => array_merge( array( 'student.full_name' => $alpha_base['name_field_id'], 'student.national_id' => $alpha_base['national_id_field_id'] ), $alpha_fields, $alpha_extra ) ),
    'beta' => array( 'form_id' => $beta_form_id, 'entry_id' => $beta_entry_id, 'fields' => array_merge( array( 'student.full_name' => $beta_base['name_field_id'], 'student.national_id' => $beta_base['national_id_field_id'] ), $beta_fields, $beta_extra ) ),
    'step_id' => (int) $step->get_id(), 'operator_id' => (int) $operator->ID, 'bootstrap_id' => (int) $bootstrap->ID,
    'intent_key' => PrintDossierPresentationAdapter::INTENT_KEY, 'intent_value' => PrintDossierPresentationAdapter::INTENT_VALUE,
);
update_option( 'gpp_wu19_fixture_manifest', $manifest, false );
file_put_contents( trailingslashit( $artifact_dir ) . 'wu19-fixture-manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU19 synthetic native Print fixtures ready.\n";
