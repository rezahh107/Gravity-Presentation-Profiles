<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\BindingHealth\BindingHealthEvaluator;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

Autoloader::register();

final class GppCompoundMemoryStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

final class GFAPI {
    public static $form;
    public static function get_form( $form_id ) {
        return 88 === (int) $form_id ? self::$form : null;
    }
    public static function get_field( $form, $field_id ) {
        if ( ! is_array( $form ) ) {
            return null;
        }
        // Model the supported host API returning the owning field object for
        // top-level field identity; BindingRepairService must still preserve
        // the exact input ID enumerated from the field's inputs definition.
        $parent = false !== strpos( (string) $field_id, '.' ) ? strstr( (string) $field_id, '.', true ) : (string) $field_id;
        foreach ( $form['fields'] as $field ) {
            if ( (string) $field->id === (string) $parent ) {
                return $field;
            }
        }
        return null;
    }
}

$name = new stdClass();
$name->id = 4;
$name->label = 'Student Name';
$name->type = 'name';
$name->inputs = array(
    array( 'id' => '4.3', 'label' => 'First Name' ),
    array( 'id' => '4.6', 'label' => 'Last Name' ),
);
GFAPI::$form = array( 'id' => 88, 'title' => 'Compound Input Form', 'fields' => array( $name ) );

$artifact = array(
    'artifact_type' => 'gpp.environment_binding_set',
    'schema_version' => '1.0.0',
    'binding_set_id' => 'compound.bindings',
    'binding_set_version' => '1.0.0',
    'context' => array(
        'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'compound-installation' ),
        'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 88 ),
        'entry_source_ref' => null,
        'surfaces' => array( 'gravity_flow.entry_detail' ),
    ),
    'provenance' => array( 'producer' => 'Compound input fixture', 'evidence_refs' => array( 'unit:compound' ) ),
    'bindings' => array(
        array(
            'semantic_slot_key' => 'student.first_name',
            'state' => 'PROVEN',
            'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => '4.3' ),
            'evidence_refs' => array( 'unit:compound' ),
        ),
    ),
    'runtime_claims' => array(),
);

$binding_store = new GppCompoundMemoryStore();
$evidence_store = new GppCompoundMemoryStore();
$lifecycle = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'unit:compound' ) ) );
$lifecycle->import( $artifact );
$lifecycle->activate(
    array(
        'context' => $artifact['context'],
        'binding_set_id' => $artifact['binding_set_id'],
        'binding_set_version' => $artifact['binding_set_version'],
    )
);

$inventory_reader = new GravityFormsFieldInventory();
$inventory = $inventory_reader->load( 88 );
gpp_assert_true( isset( $inventory['fields']['4.3'] ), 'Authoritative inventory must enumerate admitted compound input identity 4.3.' );
gpp_assert_true( isset( $inventory['fields']['4.6'] ), 'Authoritative inventory must enumerate admitted compound input identity 4.6.' );
gpp_assert_same( 'Student Name — First Name', $inventory['fields']['4.3']['label'], 'Compound input display label must remain host-derived metadata only.' );

$facts = ( new BindingHealthEvaluator() )->evaluate(
    $artifact,
    array( 'student.first_name' => 'student first name' ),
    $inventory
);
gpp_assert_same( BindingHealthEvaluator::HEALTHY, $facts[0]['status'], 'An existing decimal Gravity Forms input identity must remain healthy.' );

$context_key = $lifecycle->contextKey( $artifact['context'] );
$repair = new BindingRepairService( $binding_store, $evidence_store, $inventory_reader );
$repair->repairField(
    array(
        'context_key' => $context_key,
        'binding_set_id' => 'compound.bindings',
        'binding_set_version' => '1.0.0',
        'semantic_slot_key' => 'student.first_name',
        'field_id' => '4.6',
    )
);
$snapshot = ( new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
$repaired = $snapshot['installed']['compound.bindings']['1.0.1']['artifact']['bindings'][0];
gpp_assert_same( '4.6', $repaired['source_ref']['field_id'], 'Explicit repair must preserve the exact selected compound input identity instead of collapsing to parent field 4.' );

echo "BINDING_HEALTH_COMPOUND_INPUT_TESTS_PASS\n";
