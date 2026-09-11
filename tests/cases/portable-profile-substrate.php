<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;

Autoloader::register();

function wu09_fixture( $name ) {
    $path = __DIR__ . '/../fixtures/' . $name;
    $json = file_get_contents( $path );
    $data = json_decode( $json, true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid fixture JSON: ' . $name );
    }
    return $data;
}

function wu09_expect_violation( $callback, $message ) {
    try {
        $callback();
    } catch ( ContractViolation $exception ) {
        return;
    }
    gpp_fail( $message );
}

function wu09_reverse_object_keys( $value ) {
    if ( ! is_array( $value ) ) {
        return $value;
    }
    $keys = array_keys( $value );
    $is_list = $keys === range( 0, count( $value ) - 1 );
    if ( $is_list ) {
        return array_map( 'wu09_reverse_object_keys', $value );
    }
    $keys = array_reverse( $keys );
    $copy = array();
    foreach ( $keys as $key ) {
        $copy[ $key ] = wu09_reverse_object_keys( $value[ $key ] );
    }
    return $copy;
}

$package = wu09_fixture( 'wu09-visual-package.json' );
$binding_a = wu09_fixture( 'wu09-binding-set-a.json' );
$binding_b = wu09_fixture( 'wu09-binding-set-b.json' );

gpp_assert_true( VisualProfilePackage::validate( $package ), 'Visual package fixture must validate.' );
gpp_assert_same( 'PACKAGE_VALID', VisualProfilePackage::validationReport( $package )['structural_status'], 'Package validity must be structural and explicit.' );
gpp_assert_same( 'NOT_PROVEN', VisualProfilePackage::validationReport( $package )['target_runtime_evidence'], 'Package validity must not prove target runtime evidence.' );

gpp_assert_true( EnvironmentBindingSet::validate( $binding_a ), 'Binding set A must validate.' );
gpp_assert_true( EnvironmentBindingSet::validate( $binding_b ), 'Binding set B must validate.' );
gpp_assert_same( array( 'PROVEN', 'UNBOUND', 'NOT_PROVEN', 'NOT_APPLICABLE' ), EnvironmentBindingSet::bindingStates(), 'Binding-state vocabulary must be exact.' );
gpp_assert_same( 'BINDING_VALID', EnvironmentBindingSet::validationReport( $binding_a )['structural_status'], 'Binding validity must be structural and explicit.' );
gpp_assert_true( in_array( 'student.full_name', EnvironmentBindingSet::validationReport( $binding_a )['proven_binding_sources'], true ), 'A PROVEN source must appear only when source evidence is present.' );
gpp_assert_true( in_array( 'student.full_name:availability', EnvironmentBindingSet::validationReport( $binding_a )['proven_runtime_claims'], true ), 'Runtime claim proof must be separately evidenced.' );
gpp_assert_true( ! in_array( 'school.name:editability', EnvironmentBindingSet::validationReport( $binding_a )['proven_runtime_claims'], true ), 'Structural validity must not promote NOT_PROVEN editability.' );

$slot_keys = array_map( static function ( $slot ) { return $slot['semantic_slot_key']; }, $package['semantic_slots'] );
$visual_resolver = new VisualProfileResolver( $package );
$binding_resolver = new SemanticBindingResolver( array( $binding_a, $binding_b ), $slot_keys );

$inbox_profile = $visual_resolver->resolve( 'gravity_flow.inbox' );
$entry_profile = $visual_resolver->resolve( 'gravity_flow.entry_detail' );
$print_profile = $visual_resolver->resolve( 'print.dossier' );
gpp_assert_same( 'shared.inbox.v1', $inbox_profile['profile_id'], 'Inbox must resolve to one shared default.' );
gpp_assert_same( 'shared.entry_detail.v1', $entry_profile['profile_id'], 'Entry Detail must resolve to one shared default.' );
gpp_assert_same( 'shared.print.v1', $print_profile['profile_id'], 'Print must resolve to one shared default.' );
gpp_assert_same( null, $visual_resolver->resolve( 'gravity_flow.unknown' ), 'Unknown surfaces must fail closed.' );
wu09_expect_violation( static function () use ( $visual_resolver ) { $visual_resolver->resolve( 'gravity_flow.inbox', array( 'form_id' => 999 ) ); }, 'Visual resolution must reject environment context and overrides.' );

$context_a = array( 'installation_id' => 'fixture-installation', 'form_id' => 'fixture-form-a', 'entry_id' => 'fixture-entry-a', 'surface' => 'gravity_flow.inbox' );
$context_b = array( 'installation_id' => 'fixture-installation', 'form_id' => 'fixture-form-b', 'entry_id' => 'fixture-entry-b', 'surface' => 'gravity_flow.inbox' );
$name_a = $binding_resolver->resolve( $context_a, 'student.full_name' );
$name_b = $binding_resolver->resolve( $context_b, 'student.full_name' );
$school_b = $binding_resolver->resolve( $context_b, 'school.name' );
gpp_assert_true( $name_a['resolved'], 'Form A full name must resolve.' );
gpp_assert_true( $name_b['resolved'], 'Form B full name must resolve.' );
gpp_assert_same( 'fixture.bindings.a.v1', $name_a['binding_set_id'], 'Form A must use its own binding set.' );
gpp_assert_same( 'fixture.bindings.b.v1', $name_b['binding_set_id'], 'Form B must use its own binding set.' );
gpp_assert_true( $name_a['source_ref'] !== $name_b['source_ref'], 'Distinct forms may use distinct source references.' );
gpp_assert_same( false, $school_b['resolved'], 'UNBOUND School must fail closed locally.' );
gpp_assert_same( 'UNBOUND', $school_b['state'], 'UNBOUND state must be preserved.' );
gpp_assert_same( null, $school_b['source_ref'], 'UNBOUND must never guess or fall back to another source.' );
gpp_assert_same( 'shared.inbox.v1', $visual_resolver->resolve( 'gravity_flow.inbox' )['profile_id'], 'Form-specific binding must not switch profile.' );

$missing_context = $context_a;
$missing_context['form_id'] = 'fixture-form-c';
$missing = $binding_resolver->resolve( $missing_context, 'student.full_name' );
gpp_assert_same( false, $missing['resolved'], 'Missing binding set must fail closed.' );
gpp_assert_same( 'missing_binding_set', $missing['reason'], 'Missing binding set must be explicit.' );
gpp_assert_same( null, $missing['source_ref'], 'Missing binding set must not cross-form fallback.' );

$override_context = $context_a;
$override_context['profile_id'] = 'attacker.profile';
$override_result = $binding_resolver->resolve( $override_context, 'student.full_name' );
gpp_assert_same( false, $override_result['resolved'], 'Binding resolver must reject profile override context.' );
gpp_assert_same( 'invalid_runtime_context', $override_result['reason'], 'Profile override attempt must fail closed.' );

$package_reordered = wu09_reverse_object_keys( $package );
gpp_assert_same( VisualProfilePackage::contentHash( $package ), VisualProfilePackage::contentHash( $package_reordered ), 'Canonical visual hash must ignore associative object-key order.' );
$package_array_reordered = $package;
$package_array_reordered['surface_profiles'] = array_reverse( $package_array_reordered['surface_profiles'] );
gpp_assert_true( VisualProfilePackage::contentHash( $package ) !== VisualProfilePackage::contentHash( $package_array_reordered ), 'Canonical visual hash must preserve ordered semantic arrays.' );
$binding_reordered = wu09_reverse_object_keys( $binding_a );
gpp_assert_same( EnvironmentBindingSet::contentHash( $binding_a ), EnvironmentBindingSet::contentHash( $binding_reordered ), 'Canonical binding hash must ignore associative object-key order.' );
$binding_changed = $binding_a;
$binding_changed['context']['form_id'] = 'fixture-form-a-2';
gpp_assert_true( EnvironmentBindingSet::contentHash( $binding_a ) !== EnvironmentBindingSet::contentHash( $binding_changed ), 'Canonical binding hash must change for semantic content changes.' );

$coerced = $package;
$coerced['design_tokens']['spacing_px']['unit'] = '8';
wu09_expect_violation( static function () use ( $coerced ) { VisualProfilePackage::validate( $coerced ); }, 'Silent semantic coercion must be rejected.' );
$bad = $package;
$bad['php'] = '<?php system("id");';
wu09_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Executable PHP payload must be rejected.' );
$bad = $package;
$bad['surface_profiles'][0]['selector'] = '.gform_wrapper';
wu09_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Raw DOM selector passthrough must be rejected.' );
$bad = $package;
$bad['surface_profiles'][0]['hook'] = 'gravityflow_entry_detail';
wu09_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Raw hook passthrough must be rejected.' );
$bad = $package;
$bad['surface_profiles'][0]['profile_id'] = 'shared.form-77.inbox';
wu09_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Concrete form identity must be rejected from profile_id.' );
$bad = $package;
$bad['surface_profiles'][0]['capabilities'] = array( 'arbitrary-runtime' );
wu09_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Unknown capabilities must fail closed.' );
$bad = $package;
$bad['reserved_extension_seam']['form_id'] = 77;
wu09_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Reserved Extension Seam must remain inert and reject targeting.' );

$bad = $binding_a;
$bad['bindings'][0]['state'] = 'FALLBACK';
wu09_expect_violation( static function () use ( $bad ) { EnvironmentBindingSet::validate( $bad ); }, 'Unknown binding state must be rejected.' );
$bad = $binding_a;
$bad['bindings'][0]['evidence_refs'] = array();
wu09_expect_violation( static function () use ( $bad ) { EnvironmentBindingSet::validate( $bad ); }, 'PROVEN binding without evidence must be rejected.' );
$bad = $binding_b;
foreach ( $bad['bindings'] as &$binding ) {
    if ( 'school.name' === $binding['semantic_slot_key'] ) {
        $binding['source_ref'] = array( 'type' => 'gravity_forms.field', 'field_id' => 999 );
        break;
    }
}
unset( $binding );
wu09_expect_violation( static function () use ( $bad ) { EnvironmentBindingSet::validate( $bad ); }, 'UNBOUND binding must reject guessed source identifiers.' );
$bad = $binding_a;
$bad['bindings'][0]['source_ref'] = array( 'type' => 'arbitrary.host_api', 'endpoint' => 'do-anything' );
wu09_expect_violation( static function () use ( $bad ) { EnvironmentBindingSet::validate( $bad ); }, 'Arbitrary host API source types must be rejected.' );
$bad = $binding_a;
$bad['bindings'][0]['selector'] = '#entry-7';
wu09_expect_violation( static function () use ( $bad ) { EnvironmentBindingSet::validate( $bad ); }, 'Binding raw selectors must be rejected.' );
$bad = $binding_a;
$bad['runtime_claims'][0]['evidence_refs'] = array();
wu09_expect_violation( static function () use ( $bad ) { EnvironmentBindingSet::validate( $bad ); }, 'PROVEN runtime evidence without provenance must be rejected.' );

gpp_assert_same( CanonicalJson::hash( array( 'b' => 2, 'a' => 1 ) ), CanonicalJson::hash( array( 'a' => 1, 'b' => 2 ) ), 'Canonical JSON must sort object keys.' );
gpp_assert_true( CanonicalJson::hash( array( 1, 2 ) ) !== CanonicalJson::hash( array( 2, 1 ) ), 'Canonical JSON must preserve list order.' );

echo "GPP_WU09_PORTABLE_SUBSTRATE_PASS\n";
