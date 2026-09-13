<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;

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
    file_put_contents( $artifact_dir . '/fixture-manifest.json', json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
    echo "WU21 fixtures already exist.\n";
    return;
}

$operator = get_user_by( 'login', 'bootstrap_admin' );
$viewer = get_user_by( 'login', 'wu21_viewer' );
if ( ! $operator || ! $viewer ) {
    throw new RuntimeException( 'Synthetic WU21 operator/viewer accounts must be provisioned by the pinned CI workflow.' );
}

function wu21_add_form( $title, $name_id, $photo_id ) {
    $form = array(
        'title' => $title,
        'description' => 'Synthetic WU21 evidence form.',
        'labelPlacement' => 'top_label',
        'fields' => array(
            array(
                'id' => $name_id,
                'label' => 'Student Name',
                'type' => 'text',
                'isRequired' => true,
            ),
            array(
                'id' => $photo_id,
                'label' => 'Student Photo',
                'type' => 'fileupload',
                'isRequired' => false,
            ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    );
    $id = GFAPI::add_form( $form );
    if ( is_wp_error( $id ) ) {
        throw new RuntimeException( $id->get_error_message() );
    }
    return (int) $id;
}

$form_alpha = wu21_add_form( 'WU21 Alpha Form', 1, 2 );
$form_beta = wu21_add_form( 'WU21 Beta Form', 7, 9 );

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
$step_beta = wu21_add_approval_step( $form_beta, 'WU21 Beta Review', $operator->ID );

$uploads = wp_upload_dir();
$synthetic_dir = trailingslashit( $uploads['basedir'] ) . 'wu21-synthetic';
wp_mkdir_p( $synthetic_dir );
$png = base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' );
file_put_contents( $synthetic_dir . '/alpha.png', $png );
file_put_contents( $synthetic_dir . '/beta.png', $png );
$alpha_photo = trailingslashit( $uploads['baseurl'] ) . 'wu21-synthetic/alpha.png';
$beta_photo = trailingslashit( $uploads['baseurl'] ) . 'wu21-synthetic/beta.png';

$entry_ids = array();
$entry_records = array();
for ( $i = 0; $i < 25; $i++ ) {
    $is_alpha = 0 === $i % 2;
    $form_id = $is_alpha ? $form_alpha : $form_beta;
    $name_field = $is_alpha ? 1 : 7;
    $photo_field = $is_alpha ? 2 : 9;
    $prefix = $is_alpha ? 'Alpha' : 'Beta';
    $entry = array(
        'form_id' => $form_id,
        'created_by' => (int) $operator->ID,
        (string) $name_field => sprintf( 'WU21 %s Student %02d', $prefix, $i ),
        (string) $photo_field => $is_alpha ? $alpha_photo : $beta_photo,
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
        'student_name' => $entry[(string) $name_field],
        'date_created' => $created,
        'step_id' => (int) $current->get_id(),
        'step_name' => $current->get_name(),
    );
}

function wu21_binding_set( $id, $form_id, $name_field, $photo_field, $photo_state ) {
    $proven = array( 'wu21:synthetic-fixture', 'wu21:reproducible-simulation' );
    $not_proven = array( 'wu21:fail-closed-negative-control' );
    $bindings = array(
        array(
            'semantic_slot_key' => 'student.full_name',
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $name_field ),
            'evidence_refs' => $proven,
        ),
        array(
            'semantic_slot_key' => 'student.photo',
            'state' => $photo_state,
            'source_ref' => 'PROVEN' === $photo_state ? array( 'type' => 'gravity_forms.field', 'field_id' => $photo_field ) : null,
            'evidence_refs' => 'PROVEN' === $photo_state ? $proven : $not_proven,
        ),
        array(
            'semantic_slot_key' => 'entry.created_at',
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ),
            'evidence_refs' => $proven,
        ),
        array(
            'semantic_slot_key' => 'workflow.current_step',
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ),
            'evidence_refs' => $proven,
        ),
        array(
            'semantic_slot_key' => 'school.name',
            'state' => 'UNBOUND',
            'source_ref' => null,
            'evidence_refs' => $not_proven,
        ),
        array(
            'semantic_slot_key' => 'workflow.due_at',
            'state' => 'NOT_PROVEN',
            'source_ref' => null,
            'evidence_refs' => $not_proven,
        ),
    );
    $runtime_claims = array();
    foreach ( $bindings as $binding ) {
        $state = 'PROVEN' === $binding['state'] ? 'PROVEN' : 'NOT_PROVEN';
        $runtime_claims[] = array(
            'semantic_slot_key' => $binding['semantic_slot_key'],
            'claim' => 'availability',
            'evidence_state' => $state,
            'evidence_refs' => 'PROVEN' === $state ? $proven : $not_proven,
        );
    }
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => $id,
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'wu21-sim-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox' ),
        ),
        'provenance' => array( 'producer' => 'WU21 Evidence Lab synthetic fixture builder', 'evidence_refs' => $proven ),
        'bindings' => $bindings,
        'runtime_claims' => $runtime_claims,
    );
}

$binding_alpha = wu21_binding_set( 'wu21.sim.alpha.v1', $form_alpha, 1, 2, 'PROVEN' );
$binding_beta = wu21_binding_set( 'wu21.sim.beta.v1', $form_beta, 7, 9, 'NOT_PROVEN' );
EnvironmentBindingSet::validate( $binding_alpha );
EnvironmentBindingSet::validate( $binding_beta );
update_option( 'gpp_wu21_binding_sets', array( $binding_alpha, $binding_beta ), false );

$visual_path = WP_PLUGIN_DIR . '/gravity-presentation-profiles/tests/fixtures/wu09-visual-package.json';
$visual_package = json_decode( file_get_contents( $visual_path ), true );
VisualProfilePackage::validate( $visual_package );
$resolver = new VisualProfileResolver( $visual_package );
$inbox_profile = $resolver->resolve( 'gravity_flow.inbox' );
if ( ! is_array( $inbox_profile ) || 'shared.inbox.v1' !== $inbox_profile['profile_id'] ) {
    throw new RuntimeException( 'Shared Inbox profile identity changed unexpectedly.' );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'installation_id' => 'wu21-sim-installation',
    'operator' => array( 'id' => (int) $operator->ID, 'login' => $operator->user_login, 'email_domain' => 'example.invalid' ),
    'viewer' => array( 'id' => (int) $viewer->ID, 'login' => $viewer->user_login, 'email_domain' => 'example.invalid' ),
    'forms' => array(
        array( 'key' => 'alpha', 'form_id' => $form_alpha, 'name_field_id' => 1, 'photo_field_id' => 2, 'step_id' => $step_alpha ),
        array( 'key' => 'beta', 'form_id' => $form_beta, 'name_field_id' => 7, 'photo_field_id' => 9, 'step_id' => $step_beta ),
    ),
    'entry_ids' => $entry_ids,
    'entry_records' => $entry_records,
    'base_entry_count' => count( $entry_ids ),
    'surface_profile_id' => 'shared.inbox.v1',
    'optional_capabilities' => array(
        'school.name' => 'UNBOUND',
        'workflow.due_at' => 'NOT_PROVEN',
    ),
    'binding_set_ids' => array( 'wu21.sim.alpha.v1', 'wu21.sim.beta.v1' ),
);
update_option( 'gpp_wu21_fixture_manifest', $manifest, false );
file_put_contents( $artifact_dir . '/fixture-manifest.json', json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
echo "WU21 synthetic fixtures created: {$form_alpha}, {$form_beta}; entries=" . count( $entry_ids ) . "\n";
