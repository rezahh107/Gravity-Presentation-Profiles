<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationModel;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

Autoloader::register();

$package = json_decode( file_get_contents( __DIR__ . '/../fixtures/wu09-visual-package.json' ), true );
$profile = ( new VisualProfileResolver( $package ) )->resolve( 'gravity_flow.inbox' );

function wu17_binding( $id, $installation, $form_id, $name_field, $national_field, $photo_field, $photo_state ) {
    $proven = array( 'fixture:wu17:semantic', 'fixture:wu17:runtime' );
    $not_proven = array( 'fixture:wu17:negative' );
    $bindings = array(
        array( 'semantic_slot_key' => 'student.full_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $name_field ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'student.national_id', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $national_field ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'student.photo', 'state' => $photo_state, 'source_ref' => 'PROVEN' === $photo_state ? array( 'type' => 'gravity_forms.field', 'field_id' => $photo_field ) : null, 'evidence_refs' => 'PROVEN' === $photo_state ? $proven : $not_proven ),
        array( 'semantic_slot_key' => 'entry.created_at', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'workflow.current_step', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ), 'evidence_refs' => $proven ),
        array( 'semantic_slot_key' => 'school.name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => $not_proven ),
        array( 'semantic_slot_key' => 'workflow.due_at', 'state' => 'NOT_PROVEN', 'source_ref' => null, 'evidence_refs' => $not_proven ),
    );
    $claims = array();
    foreach ( $bindings as $binding ) {
        $state = 'PROVEN' === $binding['state'] ? 'PROVEN' : 'NOT_PROVEN';
        $claims[] = array(
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
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => $installation ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => $form_id ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox' ),
        ),
        'provenance' => array( 'producer' => 'WU17 model test', 'evidence_refs' => $proven ),
        'bindings' => $bindings,
        'runtime_claims' => $claims,
    );
}

$alpha = wu17_binding( 'wu17.alpha', 'fixture-installation', 101, 1, 3, 2, 'PROVEN' );
$beta = wu17_binding( 'wu17.beta', 'fixture-installation', 202, 7, 11, 9, 'NOT_PROVEN' );
$model = new InboxPresentationModel( $profile, array( $alpha, $beta ) );

gpp_assert_same( 'shared.inbox.v1', $model->profileId(), 'One shared surface profile remains fixed across forms.' );

$alpha_entry = array( 'id' => 1001, 'form_id' => 101 );
$beta_entry = array( 'id' => 2001, 'form_id' => 202 );

$alpha_name = $model->resolve( $alpha_entry, 'student.full_name' );
$beta_name = $model->resolve( $beta_entry, 'student.full_name' );
gpp_assert_true( $alpha_name['resolved'], 'Alpha name binding resolves.' );
gpp_assert_true( $beta_name['resolved'], 'Beta name binding resolves.' );
gpp_assert_same( 1, $alpha_name['source_ref']['field_id'], 'Alpha resolves only its own name field.' );
gpp_assert_same( 7, $beta_name['source_ref']['field_id'], 'Beta resolves only its own name field.' );

gpp_assert_same( 3, $model->resolve( $alpha_entry, 'student.national_id' )['source_ref']['field_id'], 'Alpha national ID binding is form-local.' );
gpp_assert_same( 11, $model->resolve( $beta_entry, 'student.national_id' )['source_ref']['field_id'], 'Beta national ID binding is form-local.' );

gpp_assert_true( $model->resolve( $alpha_entry, 'student.photo' )['resolved'], 'PROVEN Alpha photo resolves.' );
$beta_photo = $model->resolve( $beta_entry, 'student.photo' );
gpp_assert_true( ! $beta_photo['resolved'], 'NOT_PROVEN Beta photo fails closed.' );
gpp_assert_same( 'NOT_PROVEN', $beta_photo['state'], 'Photo failure preserves NOT_PROVEN state.' );

gpp_assert_true( ! $model->resolve( $alpha_entry, 'school.name' )['resolved'], 'UNBOUND School remains absent.' );
gpp_assert_true( ! $model->resolve( $alpha_entry, 'workflow.due_at' )['resolved'], 'NOT_PROVEN Due remains absent.' );

// A semantic binding alone must never authorize a guessed Gravity Flow API.
// Even a synthetically PROVEN due_at state binding stays closed until an
// evidence unit admits a concrete runtime source adapter for it.
$due_candidate = $alpha;
foreach ( $due_candidate['bindings'] as &$binding ) {
    if ( 'workflow.due_at' === $binding['semantic_slot_key'] ) {
        $binding['state'] = 'PROVEN';
        $binding['source_ref'] = array( 'type' => 'gravity_flow.state', 'state_key' => 'due_at' );
        $binding['evidence_refs'] = array( 'fixture:wu17:semantic', 'fixture:wu17:runtime' );
    }
}
unset( $binding );
foreach ( $due_candidate['runtime_claims'] as &$claim ) {
    if ( 'workflow.due_at' === $claim['semantic_slot_key'] ) {
        $claim['evidence_state'] = 'PROVEN';
        $claim['evidence_refs'] = array( 'fixture:wu17:semantic', 'fixture:wu17:runtime' );
    }
}
unset( $claim );
$due_model = new InboxPresentationModel( $profile, array( $due_candidate ) );
$due_result = $due_model->resolve( $alpha_entry, 'workflow.due_at' );
gpp_assert_true( ! $due_result['resolved'], 'Unadmitted Gravity Flow due_at state adapter must fail closed.' );
gpp_assert_same( 'source_adapter_not_admitted', $due_result['reason'], 'Due state adapter failure must be explicit.' );

$ambiguous = new InboxPresentationModel(
    $profile,
    array( $alpha, wu17_binding( 'wu17.alpha.other-install', 'other-installation', 101, 21, 23, 22, 'PROVEN' ) )
);
$ambiguous_name = $ambiguous->resolve( $alpha_entry, 'student.full_name' );
gpp_assert_true( ! $ambiguous_name['resolved'], 'Ambiguous active installation identity fails closed.' );
gpp_assert_same( 'missing_or_ambiguous_active_environment', $ambiguous_name['reason'], 'Ambiguous environment is explicit.' );

gpp_assert_same( '۱۴۰۴/۰۱/۰۱، ۰۰:۰۰', PersianDateFormatter::formatDateTime( '2025-03-21 00:00:00' ), 'Nowruz converts to Jalali with Persian numerals.' );
gpp_assert_same( '۱۴۰۴/۱۰/۱۱، ۰۰:۲۴', PersianDateFormatter::formatDateTime( '2026-01-01 00:24:00' ), 'Pinned WU21 fixture date converts deterministically.' );
gpp_assert_same( '۰۰۱۲۳۴۵۶۷۸۹', PersianDateFormatter::persianDigits( '00123456789' ), 'Presentation-only Persian digit conversion is deterministic.' );

echo "INBOX_PRESENTATION_MODEL_PASS\n";
