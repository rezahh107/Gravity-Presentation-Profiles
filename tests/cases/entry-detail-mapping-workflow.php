<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\AdminBindingEvidenceStore;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\RepairBindingEvidenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\BindingBatchRepairService;
use GravityPresentationProfiles\GravityForms\EntryDetailMappingService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

Autoloader::register();

final class GppEntryDetailMappingMemoryStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) return false;
        $this->state = $next_state;
        return true;
    }
}

final class GFAPI {
    public static $forms = array();
    public static function get_form( $form_id ) {
        return isset( self::$forms[ (string) $form_id ] ) ? self::$forms[ (string) $form_id ] : null;
    }
    public static function get_field( $form, $field_id ) {
        if ( ! is_array( $form ) || empty( $form['fields'] ) ) return null;
        foreach ( $form['fields'] as $field ) {
            if ( is_object( $field ) && (string) $field->id === (string) $field_id ) return $field;
        }
        return null;
    }
}

function gpp_edm_field( $id, $label, $type = 'text', $inputs = null ) {
    $field = new stdClass();
    $field->id = $id;
    $field->label = $label;
    $field->type = $type;
    if ( null !== $inputs ) $field->inputs = $inputs;
    return $field;
}

function gpp_edm_artifact( $package, $version, $home_source, $father_source ) {
    $bindings = array();
    foreach ( $package['semantic_slots'] as $slot ) {
        $key = $slot['semantic_slot_key'];
        $source = null;
        if ( 'student.first_name' === $key ) $source = array( 'type' => 'gravity_forms.field', 'field_id' => 1 );
        if ( 'student.home_phone' === $key ) $source = $home_source;
        if ( 'student.father_mobile' === $key ) $source = $father_source;
        $bindings[] = array(
            'semantic_slot_key' => $key,
            'state' => null === $source ? 'UNBOUND' : 'PROVEN',
            'source_ref' => $source,
            'evidence_refs' => null === $source ? array() : array( 'unit:initial' ),
        );
    }

    $runtime_claims = array(
        array( 'semantic_slot_key' => 'student.first_name', 'claim' => 'availability', 'evidence_state' => 'PROVEN', 'evidence_refs' => array( 'unit:first-runtime' ) ),
        array( 'semantic_slot_key' => 'student.father_mobile', 'claim' => 'availability', 'evidence_state' => null === $father_source ? 'NOT_PROVEN' : 'PROVEN', 'evidence_refs' => null === $father_source ? array() : array( 'unit:father-runtime' ) ),
    );

    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => 'entry.detail.mapping.f77',
        'binding_set_version' => $version,
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'entry-detail-mapping-test' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 77 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.entry_detail', 'gravity_flow.inbox', 'print.dossier' ),
        ),
        'provenance' => array( 'producer' => 'Entry Detail mapping test', 'evidence_refs' => array( 'unit:initial' ) ),
        'bindings' => $bindings,
        'runtime_claims' => $runtime_claims,
    );
}

function gpp_edm_binding( $artifact, $slot ) {
    foreach ( $artifact['bindings'] as $binding ) if ( $binding['semantic_slot_key'] === $slot ) return $binding;
    gpp_fail( 'Missing binding ' . $slot );
}

function gpp_edm_claim( $artifact, $slot ) {
    foreach ( $artifact['runtime_claims'] as $claim ) if ( $claim['semantic_slot_key'] === $slot ) return $claim;
    gpp_fail( 'Missing runtime claim ' . $slot );
}

function gpp_edm_row( $facts, $slot ) {
    foreach ( $facts['contexts'][0]['rows'] as $row ) if ( $row['semantic_slot_key'] === $slot ) return $row;
    gpp_fail( 'Missing mapping row ' . $slot );
}

function gpp_edm_throws( $reason, $callback, $message ) {
    try { $callback(); } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message );
        return;
    }
    gpp_fail( $message . ' (no exception)' );
}

GFAPI::$forms['77'] = array(
    'id' => 77,
    'title' => 'Synthetic Entry Detail Form',
    'fields' => array(
        gpp_edm_field( 1, 'First name' ),
        gpp_edm_field( 5, 'Home phone', 'phone' ),
        gpp_edm_field( 6, 'Other phone', 'phone' ),
        gpp_edm_field( 7, 'Father mobile', 'phone' ),
        gpp_edm_field( 10, 'Compound contact', 'name', array(
            array( 'id' => '10.3', 'label' => 'Given input' ),
            array( 'id' => '10.6', 'label' => 'Other input' ),
        ) ),
    ),
);

$root = dirname( __DIR__, 2 );
$package = json_decode( file_get_contents( $root . '/profiles/srwf/operations/operations-package-v1.json' ), true );
gpp_assert_true( is_array( $package ), 'Operations package fixture must load.' );

$visual_store = new GppEntryDetailMappingMemoryStore();
$visual = new VisualPackageLifecycle( $visual_store );
$visual->import( $package );
$entry_profile = null;
foreach ( $package['surface_profiles'] as $profile ) {
    if ( 'gravity_flow.entry_detail' === $profile['surface'] ) { $entry_profile = $profile; break; }
}
gpp_assert_true( is_array( $entry_profile ), 'Operations package must contain Entry Detail profile.' );
$visual->activate( array(
    'surface' => 'gravity_flow.entry_detail',
    'package_id' => $package['package_id'],
    'package_version' => $package['package_version'],
    'profile_id' => $entry_profile['profile_id'],
) );

$binding_store = new GppEntryDetailMappingMemoryStore();
$evidence_store = new GppEntryDetailMappingMemoryStore();
$lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:initial', 'unit:first-runtime', 'unit:father-runtime' ) ) );
$historical = gpp_edm_artifact(
    $package,
    '1.0.0',
    array( 'type' => 'gravity_forms.field', 'field_id' => 5 ),
    array( 'type' => 'gravity_forms.field', 'field_id' => 7 )
);
$lifecycle->import( $historical );
$lifecycle->activate( array( 'context' => $historical['context'], 'binding_set_id' => $historical['binding_set_id'], 'binding_set_version' => '1.0.0' ) );
$current = gpp_edm_artifact( $package, '1.0.1', null, array( 'type' => 'gravity_forms.field', 'field_id' => 7 ) );
$lifecycle->import( $current );
$lifecycle->activate( array( 'context' => $current['context'], 'binding_set_id' => $current['binding_set_id'], 'binding_set_version' => '1.0.1' ) );
$context_key = $lifecycle->contextKey( $current['context'] );

$mapping = new EntryDetailMappingService( $lifecycle, $visual, new GravityFormsFieldInventory() );
$facts = $mapping->workflowFacts();
gpp_assert_same( $package['package_id'], $facts['profile']['package_id'], 'Mapping workflow must resolve exact active package.' );
gpp_assert_same( $package['package_version'], $facts['profile']['package_version'], 'Mapping workflow must resolve exact active package version.' );
gpp_assert_same( $entry_profile['profile_id'], $facts['profile']['profile_id'], 'Mapping workflow must resolve exact active Entry Detail profile.' );
gpp_assert_true( count( $facts['contexts'][0]['rows'] ) > 10, 'Mapping workflow must expose a complete direct-field pass, not one blocker.' );
$home_row = gpp_edm_row( $facts, 'student.home_phone' );
gpp_assert_true( true === $home_row['required'], 'student.home_phone requiredness must come from the active profile.' );
gpp_assert_same( 'UNRESOLVED', $home_row['source_validity'], 'Unbound home phone must display unresolved.' );
gpp_assert_same( '5', (string) $home_row['suggestion']['field']['field_id'], 'One surviving previously-authoritative mapping may be suggested.' );
gpp_assert_same( 'previous_authoritative_mapping', $home_row['suggestion']['evidence'], 'Suggestion reason must be bounded authoritative history.' );
$first_row = gpp_edm_row( $facts, 'student.first_name' );
gpp_assert_same( 'VALID', $first_row['source_validity'], 'Existing proven mapping must display as valid.' );
gpp_assert_same( '1', (string) $first_row['current_field']['field_id'], 'Existing mapping must retain exact field identity.' );
gpp_assert_same( null, $first_row['suggestion'], 'A valid current authoritative mapping must win over suggestions.' );
$encoded = json_encode( $facts['contexts'][0]['rows'] );
gpp_assert_true( false === strpos( $encoded, 'workflow.current_step' ), 'Host-owned current step must not appear as a GF mapping row.' );
gpp_assert_true( false === strpos( $encoded, 'workflow.status' ), 'Host-owned workflow status must not appear as a GF mapping row.' );
gpp_assert_true( false === strpos( $encoded, 'student.full_name' ), 'Derived full name must not appear as a direct GF mapping row.' );
$excluded_json = json_encode( $facts['excluded_semantics'] );
gpp_assert_true( false !== strpos( $excluded_json, 'workflow.current_step' ), 'Host-owned semantic should remain classified outside field mapping.' );
gpp_assert_true( false !== strpos( $excluded_json, 'student.full_name' ), 'Derived semantic should remain classified outside field mapping.' );

$before = $lifecycle->snapshot();
$activation_count_before = 0;
foreach ( $before['audit'] as $audit ) if ( 'ACTIVATED' === ( isset( $audit['outcome'] ) ? $audit['outcome'] : null ) ) $activation_count_before++;
$batch = new BindingBatchRepairService( $binding_store, $evidence_store, new GravityFormsFieldInventory() );
$result = $batch->repairFields( array(
    'context_key' => $context_key,
    'binding_set_id' => 'entry.detail.mapping.f77',
    'binding_set_version' => '1.0.1',
    'mappings' => array(
        array( 'semantic_slot_key' => 'student.home_phone', 'field_id' => 5 ),
        array( 'semantic_slot_key' => 'student.father_mobile', 'field_id' => '10.3' ),
    ),
) );
gpp_assert_same( 'REPAIRED_AND_ACTIVATED', $result['status'], 'Multi-slot repair must activate one coherent next version.' );
gpp_assert_same( '1.0.2', $result['binding_set_version'], 'One multi-slot save must create one next immutable patch version.' );
$post = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( '1.0.2', $post['activations'][ $context_key ]['binding_set_version'], 'Batch repair must make the one final version authoritative.' );
$new = $post['installed']['entry.detail.mapping.f77']['1.0.2']['artifact'];
gpp_assert_same( '5', (string) gpp_edm_binding( $new, 'student.home_phone' )['source_ref']['field_id'], 'Manual real-field repair must persist exact selected source.' );
gpp_assert_same( '10.3', (string) gpp_edm_binding( $new, 'student.father_mobile' )['source_ref']['field_id'], 'Compound input identity must survive batch persistence exactly.' );
gpp_assert_same( 'NOT_PROVEN', gpp_edm_claim( $new, 'student.father_mobile' )['evidence_state'], 'Changed semantic source-bound runtime evidence must be invalidated.' );
gpp_assert_same( 'PROVEN', gpp_edm_claim( $new, 'student.first_name' )['evidence_state'], 'Unrelated runtime evidence must remain intact.' );
$activation_count_after = 0;
foreach ( $post['audit'] as $audit ) if ( 'ACTIVATED' === ( isset( $audit['outcome'] ) ? $audit['outcome'] : null ) ) $activation_count_after++;
gpp_assert_same( $activation_count_before + 1, $activation_count_after, 'Two mapping changes in one save must cause exactly one additional activation.' );

$revision_before_noop = $post['revision'];
$noop = $batch->repairFields( array(
    'context_key' => $context_key,
    'binding_set_id' => 'entry.detail.mapping.f77',
    'binding_set_version' => '1.0.2',
    'mappings' => array(
        array( 'semantic_slot_key' => 'student.home_phone', 'field_id' => 5 ),
        array( 'semantic_slot_key' => 'student.father_mobile', 'field_id' => '10.3' ),
    ),
) );
gpp_assert_same( 'UNCHANGED', $noop['status'], 'Equivalent requested mappings must be idempotent.' );
$after_noop = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
gpp_assert_same( $revision_before_noop, $after_noop['revision'], 'No-change save must not import or activate another binding version.' );

gpp_edm_throws( 'repair_field_missing', static function () use ( $batch, $context_key ) {
    $batch->repairFields( array(
        'context_key' => $context_key,
        'binding_set_id' => 'entry.detail.mapping.f77',
        'binding_set_version' => '1.0.2',
        'mappings' => array( array( 'semantic_slot_key' => 'student.home_phone', 'field_id' => 999 ) ),
    ) );
}, 'Stale submitted field must fail closed after fresh host inventory read.' );

$target = $post['installed']['entry.detail.mapping.f77']['1.0.1']['artifact'];
$rollback_lifecycle = new BindingSetLifecycle(
    $binding_store,
    new RepairBindingEvidenceGate( new AdminBindingEvidenceStore( $evidence_store ), $target, $target, new EvidenceReferenceGate( array( 'unit:initial', 'unit:first-runtime', 'unit:father-runtime' ) ) )
);
$rollback_lifecycle->rollbackIfCurrent( array(
    'context' => $target['context'],
    'binding_set_id' => $target['binding_set_id'],
    'binding_set_version' => $target['binding_set_version'],
    'expected_current_activation' => array( 'binding_set_id' => 'entry.detail.mapping.f77', 'binding_set_version' => '1.0.2' ),
) );
gpp_edm_throws( 'repair_activation_changed', static function () use ( $batch, $context_key ) {
    $batch->repairFields( array(
        'context_key' => $context_key,
        'binding_set_id' => 'entry.detail.mapping.f77',
        'binding_set_version' => '1.0.2',
        'mappings' => array( array( 'semantic_slot_key' => 'student.home_phone', 'field_id' => 6 ) ),
    ) );
}, 'A stale rendered binding version must never overwrite a concurrent authoritative change.' );

$amb_binding_store = new GppEntryDetailMappingMemoryStore();
$amb_evidence_store = new GppEntryDetailMappingMemoryStore();
$amb_lifecycle = new BindingSetLifecycle( $amb_binding_store, new EvidenceReferenceGate( array( 'unit:initial', 'unit:first-runtime', 'unit:father-runtime' ) ) );
$amb_a = gpp_edm_artifact( $package, '1.0.0', array( 'type' => 'gravity_forms.field', 'field_id' => 5 ), array( 'type' => 'gravity_forms.field', 'field_id' => 7 ) );
$amb_b = gpp_edm_artifact( $package, '1.0.1', array( 'type' => 'gravity_forms.field', 'field_id' => 6 ), array( 'type' => 'gravity_forms.field', 'field_id' => 7 ) );
$amb_c = gpp_edm_artifact( $package, '1.0.2', null, array( 'type' => 'gravity_forms.field', 'field_id' => 7 ) );
foreach ( array( $amb_a, $amb_b, $amb_c ) as $artifact ) {
    $amb_lifecycle->import( $artifact );
    $amb_lifecycle->activate( array( 'context' => $artifact['context'], 'binding_set_id' => $artifact['binding_set_id'], 'binding_set_version' => $artifact['binding_set_version'] ) );
}
$amb_mapping = new EntryDetailMappingService( $amb_lifecycle, $visual, new GravityFormsFieldInventory() );
$amb_facts = $amb_mapping->workflowFacts();
gpp_assert_same( null, gpp_edm_row( $amb_facts, 'student.home_phone' )['suggestion'], 'Multiple surviving authoritative historical sources must yield no suggestion.' );

$controller_source = file_get_contents( $root . '/src/GravityForms/EntryDetailMappingAdminController.php' );
gpp_assert_true( false === strpos( $controller_source, "'student.home_phone'" ), 'Owner-facing workflow must not special-case the current blocker.' );
gpp_assert_true( false !== strpos( $controller_source, 'Save Entry Detail mappings once' ), 'Owner-facing workflow must expose one bounded save action.' );
gpp_assert_true( false !== strpos( $controller_source, 'Field mapping is shared' ), 'UI must explicitly explain shared mapping impact.' );

echo "ENTRY_DETAIL_MAPPING_WORKFLOW_TESTS_PASS\n";
