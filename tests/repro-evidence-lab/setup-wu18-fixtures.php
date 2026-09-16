<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$base = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $artifact_dir || ! is_array( $base ) || empty( $base['forms'] ) || empty( $base['entry_records'] ) || empty( $base['installation_id'] ) ) throw new RuntimeException( 'WU18 requires WU21 fixtures.' );

function wu18_form_meta( $base, $key ) {
    foreach ( $base['forms'] as $form ) if ( $form['key'] === $key ) return $form;
    throw new RuntimeException( 'Missing synthetic form: ' . $key );
}
function wu18_entry_for_form( $base, $form_id, $offset = 0 ) {
    $matches = array_values( array_filter( $base['entry_records'], static function ( $row ) use ( $form_id ) { return (int) $row['form_id'] === (int) $form_id; } ) );
    if ( ! isset( $matches[ $offset ] ) ) throw new RuntimeException( 'Missing synthetic entry offset.' );
    return $matches[ $offset ];
}
function wu18_extend_form( $form_id ) {
    $form = GFAPI::get_form( $form_id );
    if ( ! is_array( $form ) ) throw new RuntimeException( 'Unable to read synthetic form.' );
    $max = 0;
    foreach ( $form['fields'] as $field ) $max = max( $max, (int) $field->id );
    $specs = array(
        'student.first_name' => array( 'Student First Name', 'text' ),
        'student.last_name' => array( 'Student Last Name', 'text' ),
        'student.father_name' => array( 'Father Name', 'text' ),
        'student.birth_date_jalali' => array( 'Birth Date Jalali', 'text' ),
        'student.gender' => array( 'Gender', 'text' ),
        'student.mobile' => array( 'Student Mobile', 'text' ),
        'education.level' => array( 'Education Level', 'text' ),
        'education.grade_group' => array( 'Grade Group', 'text' ),
        'documents.report_card' => array( 'Report Card', 'fileupload' ),
        'review.reason' => array( 'Review Reason', 'textarea' ),
    );
    $map = array();
    foreach ( $specs as $slot => $spec ) {
        $max++;
        $map[ $slot ] = $max;
        $form['fields'][] = array( 'id' => $max, 'label' => 'WU18 ' . $spec[0], 'type' => $spec[1], 'isRequired' => false );
    }
    $result = GFAPI::update_form( $form );
    if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    return $map;
}

$alpha_form = wu18_form_meta( $base, 'alpha' );
$beta_form = wu18_form_meta( $base, 'beta' );
$alpha_fields = wu18_extend_form( $alpha_form['form_id'] );
$beta_fields = wu18_extend_form( $beta_form['form_id'] );
$alpha_entry = wu18_entry_for_form( $base, $alpha_form['form_id'], 0 );
$negative_entry = wu18_entry_for_form( $base, $alpha_form['form_id'], 1 );
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
        'student.first_name' => $prefix . ' First', 'student.last_name' => $prefix . ' Last', 'student.father_name' => $prefix . ' Father',
        'student.birth_date_jalali' => '۱۴۰۰/۰۱/۰۲', 'student.gender' => 'دانش‌آموز', 'student.mobile' => '09120000000',
        'education.level' => 'متوسطه', 'education.grade_group' => 'پایه دهم', 'documents.report_card' => $document_url,
        'review.reason' => 'Synthetic host-owned review value',
    );
    foreach ( $values as $slot => $value ) {
        $result = GFAPI::update_entry_field( $entry_id, $fields[ $slot ], $value );
        if ( is_wp_error( $result ) ) throw new RuntimeException( $result->get_error_message() );
    }
}
wu18_populate_entry( $alpha_entry['entry_id'], $alpha_fields, 'Alpha', $image_url );
wu18_populate_entry( $negative_entry['entry_id'], $alpha_fields, 'Negative', $image_url );
wu18_populate_entry( $beta_entry['entry_id'], $beta_fields, 'Beta', $pdf_url );

foreach ( array( array( $alpha_form, $alpha_fields ), array( $beta_form, $beta_fields ) ) as $pair ) {
    $form_meta = $pair[0]; $fields = $pair[1];
    $entry_row = wu18_entry_for_form( $base, $form_meta['form_id'], 0 );
    $api = new Gravity_Flow_API( (int) $form_meta['form_id'] );
    $step = $api->get_current_step( GFAPI::get_entry( $entry_row['entry_id'] ) );
    if ( ! $step || 'approval' !== $step->get_type() ) throw new RuntimeException( 'Pinned fixture did not expose Approval.' );
    $meta = $step->get_feed_meta();
    $meta['editable_fields'] = array( (string) $fields['review.reason'] );
    $meta['instructionsEnable'] = '1';
    $meta['instructionsValue'] = 'Synthetic WU18 current-task instructions.';
    $meta['note_mode'] = 'hidden';
    $meta['revertEnable'] = '0';
    gravity_flow()->update_feed_meta( $step->get_id(), $meta );
}

gravity_flow()->add_timeline_note( $alpha_entry['entry_id'], 'Synthetic dossier review opened.' );
gravity_flow()->add_timeline_note( $beta_entry['entry_id'], 'Synthetic dossier review opened.' );

$visual_path = WP_PLUGIN_DIR . '/gravity-presentation-profiles/tests/fixtures/wu09-visual-package.json';
$visual_package = json_decode( file_get_contents( $visual_path ), true );
$profile = ( new VisualProfileResolver( $visual_package ) )->resolve( 'gravity_flow.entry_detail' );
if ( ! is_array( $profile ) || 'shared.entry_detail.v1' !== $profile['profile_id'] ) throw new RuntimeException( 'Shared Entry Detail profile identity changed.' );
$visual_lifecycle = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
// WU18 owns this legacy visual fixture dependency. PR4's WU21 setup now uses
// only the authentic Operations Package path and no longer pre-installs wu09.
$visual_lifecycle->import( $visual_package );
$visual_lifecycle->activate( array( 'surface' => 'gravity_flow.entry_detail', 'package_id' => $visual_package['package_id'], 'package_version' => $visual_package['package_version'], 'profile_id' => $profile['profile_id'] ) );

function wu18_binding_set( $id, $installation_id, $form_meta, $fields, $entry_ref, $negative_required = false ) {
    $proven = array( 'wu18:synthetic-fixture', 'wu18:pinned-runtime' ); $negative = array( 'wu18:negative-control' );
    $field_map = array(
        'student.first_name' => $fields['student.first_name'], 'student.last_name' => $fields['student.last_name'], 'student.full_name' => $form_meta['name_field_id'],
        'student.father_name' => $fields['student.father_name'], 'student.national_id' => $form_meta['national_id_field_id'],
        'student.birth_date_jalali' => $fields['student.birth_date_jalali'], 'student.gender' => $fields['student.gender'], 'student.mobile' => $fields['student.mobile'],
        'education.level' => $fields['education.level'], 'education.grade_group' => $fields['education.grade_group'],
        'student.photo' => $form_meta['photo_field_id'], 'documents.report_card' => $fields['documents.report_card'], 'review.reason' => $fields['review.reason'],
    );
    $bindings = array();
    foreach ( $field_map as $slot => $field_id ) {
        $state = $negative_required && 'student.national_id' === $slot ? 'NOT_PROVEN' : 'PROVEN';
        $bindings[] = array( 'semantic_slot_key' => $slot, 'state' => $state, 'source_ref' => 'PROVEN' === $state ? array( 'type' => 'gravity_forms.field', 'field_id' => $field_id ) : null, 'evidence_refs' => 'PROVEN' === $state ? $proven : $negative );
    }
    $bindings[] = array( 'semantic_slot_key' => 'workflow.current_step', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.status', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'status' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.instructions', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'instructions' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'navigation.backlink', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'backlink' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.timeline', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.region', 'region_key' => 'timeline' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.approve_action', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.action', 'action_key' => 'approve' ), 'evidence_refs' => $proven );
    $bindings[] = array( 'semantic_slot_key' => 'workflow.reject_action', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.action', 'action_key' => 'reject' ), 'evidence_refs' => $proven );
    $claims = array();
    foreach ( $bindings as $binding ) {
        $slot = $binding['semantic_slot_key']; $available = 'PROVEN' === $binding['state'] && 'navigation.backlink' !== $slot;
        $claims[] = array( 'semantic_slot_key' => $slot, 'claim' => 'availability', 'evidence_state' => $available ? 'PROVEN' : 'NOT_PROVEN', 'evidence_refs' => $available ? $proven : $negative );
    }
    foreach ( array( 'workflow.approve_action', 'workflow.reject_action' ) as $slot ) $claims[] = array( 'semantic_slot_key' => $slot, 'claim' => 'action_permission', 'evidence_state' => 'PROVEN', 'evidence_refs' => $proven );
    $claims[] = array( 'semantic_slot_key' => 'student.mobile', 'claim' => 'editability', 'evidence_state' => 'PROVEN', 'evidence_refs' => $proven );
    $claims[] = array( 'semantic_slot_key' => 'review.reason', 'claim' => 'editability', 'evidence_state' => 'PROVEN', 'evidence_refs' => $proven );
    return array(
        'artifact_type' => 'gpp.environment_binding_set', 'schema_version' => '1.0.0', 'binding_set_id' => $id, 'binding_set_version' => '1.0.0',
        'context' => array( 'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation_id ), 'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => (int) $form_meta['form_id'] ), 'entry_source_ref' => array( 'type' => 'gravity_forms.entry', 'entry_id' => (int) $entry_ref ), 'surfaces' => array( 'gravity_flow.entry_detail' ) ),
        'provenance' => array( 'producer' => 'WU18 pinned Evidence Lab fixture', 'evidence_refs' => $proven ), 'bindings' => $bindings, 'runtime_claims' => $claims,
    );
}

$bindings = array(
    wu18_binding_set( 'wu18.sim.alpha.v1', $base['installation_id'], $alpha_form, $alpha_fields, $alpha_entry['entry_id'] ),
    wu18_binding_set( 'wu18.sim.beta.v1', $base['installation_id'], $beta_form, $beta_fields, $beta_entry['entry_id'] ),
    wu18_binding_set( 'wu18.sim.alpha.negative.v1', $base['installation_id'], $alpha_form, $alpha_fields, $negative_entry['entry_id'], true ),
);
foreach ( $bindings as $binding ) EnvironmentBindingSet::validate( $binding );
$binding_lifecycle = new BindingSetLifecycle( new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ), new EvidenceReferenceGate( array( 'wu21:synthetic-fixture', 'wu21:reproducible-simulation', 'wu21:fail-closed-negative-control', 'wu18:synthetic-fixture', 'wu18:pinned-runtime', 'wu18:negative-control' ) ) );
foreach ( $bindings as $binding ) {
    $binding_lifecycle->import( $binding );
    $binding_lifecycle->activate( array( 'context' => $binding['context'], 'binding_set_id' => $binding['binding_set_id'], 'binding_set_version' => $binding['binding_set_version'] ) );
}
EntryDetailPresentationAdapter::resetRuntimeCache();

$manifest = array(
    'schema_version' => '1.0.0', 'data_class' => 'SYNTHETIC_NON_PII', 'profile_id' => 'shared.entry_detail.v1',
    'alpha' => array( 'form_id' => (int) $alpha_form['form_id'], 'entry_id' => (int) $alpha_entry['entry_id'], 'fields' => $alpha_fields, 'document_kind' => 'image' ),
    'beta' => array( 'form_id' => (int) $beta_form['form_id'], 'entry_id' => (int) $beta_entry['entry_id'], 'fields' => $beta_fields, 'document_kind' => 'pdf' ),
    'negative' => array( 'form_id' => (int) $alpha_form['form_id'], 'entry_id' => (int) $negative_entry['entry_id'] ),
    'locked_history_helper' => 'اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.',
);
update_option( 'gpp_wu18_fixture_manifest', $manifest, false );
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-fixture-manifest.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
echo "WU18 synthetic Entry Detail fixtures ready.\n";