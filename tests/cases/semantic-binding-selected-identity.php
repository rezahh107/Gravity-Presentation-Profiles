<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

Autoloader::register();

$binding = array(
    'artifact_type' => 'gpp.environment_binding_set',
    'schema_version' => '1.0.0',
    'binding_set_id' => 'resolver.identity.fixture',
    'binding_set_version' => '3.4.5',
    'context' => array(
        'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'resolver-installation' ),
        'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 901 ),
        'entry_source_ref' => null,
        'surfaces' => array( 'print.dossier' ),
    ),
    'provenance' => array(
        'producer' => 'Semantic binding selected identity regression',
        'evidence_refs' => array( 'fixture:resolver:selected-identity' ),
    ),
    'bindings' => array(
        array(
            'semantic_slot_key' => 'student.full_name',
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ),
            'evidence_refs' => array( 'fixture:resolver:selected-identity' ),
        ),
        array(
            'semantic_slot_key' => 'school.name',
            'state' => 'UNBOUND',
            'source_ref' => null,
            'evidence_refs' => array( 'fixture:resolver:negative' ),
        ),
    ),
    'runtime_claims' => array(),
);

EnvironmentBindingSet::validate( $binding );
$resolver = new SemanticBindingResolver(
    array( $binding ),
    array( 'student.full_name', 'school.name', 'student.mobile' )
);
$context = array(
    'installation_id' => 'resolver-installation',
    'form_id' => 901,
    'entry_id' => 9001,
    'surface' => 'print.dossier',
);

$resolved = $resolver->resolve( $context, 'student.full_name' );
gpp_assert_true( $resolved['resolved'], 'Selected PROVEN binding must resolve.' );
gpp_assert_same( 'resolver.identity.fixture', $resolved['binding_set_id'], 'Resolved result must preserve selected binding_set_id.' );
gpp_assert_same( '3.4.5', $resolved['binding_set_version'], 'Resolved result must preserve selected binding_set_version.' );

$unbound = $resolver->resolve( $context, 'school.name' );
gpp_assert_same( false, $unbound['resolved'], 'Selected UNBOUND slot must remain unresolved.' );
gpp_assert_same( 'UNBOUND', $unbound['state'], 'Selected UNBOUND state must remain explicit.' );
gpp_assert_same( 'resolver.identity.fixture', $unbound['binding_set_id'], 'Selected UNBOUND result must preserve binding_set_id.' );
gpp_assert_same( '3.4.5', $unbound['binding_set_version'], 'Selected UNBOUND result must preserve binding_set_version.' );

$missing_slot = $resolver->resolve( $context, 'student.mobile' );
gpp_assert_same( false, $missing_slot['resolved'], 'Missing slot in a selected artifact must fail closed.' );
gpp_assert_same( 'missing_slot_binding', $missing_slot['reason'], 'Missing selected slot reason must remain explicit.' );
gpp_assert_same( 'resolver.identity.fixture', $missing_slot['binding_set_id'], 'Selected missing-slot result must preserve binding_set_id.' );
gpp_assert_same( '3.4.5', $missing_slot['binding_set_version'], 'Selected missing-slot result must preserve binding_set_version.' );

$missing_context = $context;
$missing_context['form_id'] = 902;
$no_selection = $resolver->resolve( $missing_context, 'student.full_name' );
gpp_assert_same( null, $no_selection['binding_set_id'], 'No selected artifact must expose no binding_set_id.' );
gpp_assert_same( null, $no_selection['binding_set_version'], 'No selected artifact must expose no binding_set_version.' );

echo "SEMANTIC_BINDING_SELECTED_IDENTITY_PASS\n";
