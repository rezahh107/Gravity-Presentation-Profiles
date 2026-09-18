<?php
/** Production boundary for explicit Entry Detail profile adoption. */
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupService;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailRuntimeReadinessService;

Autoloader::register();

if ( ! class_exists( 'GFAPI' ) ) {
    class GFAPI {
        public static function get_form( $form_id ) { return array( 'id' => (int) $form_id ); }
        public static function get_entry( $entry_id ) { return array( 'id' => $entry_id ); }
    }
}
if ( ! class_exists( 'Gravity_Flow_API' ) ) {
    class Gravity_Flow_API {
        private $form_id;
        public function __construct( $form_id ) { $this->form_id = (int) $form_id; }
        public function get_current_step( $entry ) { unset( $entry ); return null; }
        public function get_status( $entry ) { unset( $entry ); return 'pending'; }
    }
}

final class Pr5MemoryStateStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) return false;
        $this->state = $next_state;
        return true;
    }
}

function pr5_active_binding_artifact( $store, $context ) {
    $lifecycle = new BindingSetLifecycle( $store, new EvidenceReferenceGate( array() ) );
    $active = $lifecycle->resolve( $context );
    gpp_assert_true( is_array( $active ), 'Expected active Entry Detail binding context.' );
    $snapshot = $lifecycle->snapshot();
    return $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'];
}

function pr5_binding_for( $artifact, $slot ) {
    foreach ( $artifact['bindings'] as $binding ) {
        if ( $slot === $binding['semantic_slot_key'] ) return $binding;
    }
    throw new RuntimeException( 'Missing fixture binding: ' . $slot );
}

function pr5_assert_source( $artifact, $slot, $type, $key, $value, $message ) {
    $source = pr5_binding_for( $artifact, $slot )['source_ref'];
    gpp_assert_true( is_array( $source ), $message . ' (missing source)' );
    gpp_assert_same( $type, isset( $source['type'] ) ? $source['type'] : null, $message . ' (type)' );
    gpp_assert_same( $value, isset( $source[ $key ] ) ? $source[ $key ] : null, $message . ' (' . $key . ')' );
}

$visual_store = new Pr5MemoryStateStore();
$binding_store = new Pr5MemoryStateStore();
$evidence_store = new Pr5MemoryStateStore();
$visual = new VisualPackageLifecycle( $visual_store );
$operations = new OperationsSetupService(
    $visual,
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) ),
    __DIR__ . '/../../profiles/srwf/operations/operations-package-v1.json',
    'fixture.example'
);

$base = $operations->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( OperationsSetupService::STATUS_COMPLETED, $base['status'], 'Operations setup establishes the authoritative binding context first.' );
$context = $operations->bindingContext( 77 );
$seed = pr5_active_binding_artifact( $binding_store, $context );
gpp_assert_same( 'UNBOUND', pr5_binding_for( $seed, 'workflow.status' )['state'], 'Operations seed must not guess workflow.status before qualification.' );
$print_before = $visual->resolve( 'print.dossier' );
gpp_assert_same( null, $visual->resolve( 'gravity_flow.entry_detail' ), 'Entry Detail starts inactive.' );

$runtime = new EntryDetailRuntimeReadinessService( $binding_store, $evidence_store );
$service = new EntryDetailSetupService( $operations, $visual, $runtime );
$first = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( EntryDetailSetupService::STATUS_COMPLETED, $first['status'], 'Explicit Entry Detail adoption completes when stable host sources can be qualified.' );
gpp_assert_same( 'qualified', $first['steps']['stable_host_sources']['outcome'], 'Entry Detail adoption qualifies stable host sources before presentation activation.' );
gpp_assert_same(
    array( 'entry.created_at', 'workflow.current_step', 'workflow.status' ),
    $first['steps']['stable_host_sources']['sources'],
    'Only the admitted stable host sources are persisted during Entry Detail qualification.'
);
gpp_assert_same( 'form_bound_public_api', $first['steps']['stable_host_sources']['host_source_contract'], 'Qualification proves the form-bound public host API contract, not bare method names.' );
gpp_assert_same( 'not_persisted', $first['steps']['stable_host_sources']['request_values'], 'Setup must not persist entry-local workflow values.' );
gpp_assert_same( 'activated', $first['steps']['entry_detail_activation']['outcome'], 'The shipped Entry Detail profile is explicitly activated.' );
gpp_assert_same( 'deferred_to_request', $first['steps']['runtime_readiness']['outcome'], 'Activation must defer live Entry Detail eligibility to the request boundary.' );
gpp_assert_same( $print_before, $visual->resolve( 'print.dossier' ), 'Entry Detail adoption preserves Print activation.' );

$qualified = pr5_active_binding_artifact( $binding_store, $context );
pr5_assert_source(
    $qualified,
    'entry.created_at',
    'gravity_forms.entry_meta',
    'meta_key',
    'date_created',
    'Entry creation time is qualified from the admitted Gravity Forms entry-meta source.'
);
pr5_assert_source(
    $qualified,
    'workflow.current_step',
    'gravity_flow.state',
    'state_key',
    'current_step',
    'Current step is qualified from the admitted Gravity Flow API-backed source.'
);
pr5_assert_source(
    $qualified,
    'workflow.status',
    'gravity_flow.state',
    'state_key',
    'status',
    'Workflow status is qualified from the admitted Gravity Flow API-backed source.'
);
gpp_assert_same( 'UNBOUND', pr5_binding_for( $qualified, 'workflow.approve_action' )['state'], 'Entry Detail qualification must not persist request-local Approval authorization.' );
gpp_assert_same( 'UNBOUND', pr5_binding_for( $qualified, 'workflow.reject_action' )['state'], 'Entry Detail qualification must not persist request-local Reject authorization.' );
gpp_assert_same( 'UNBOUND', pr5_binding_for( $qualified, 'student.full_name' )['state'], 'Derived full name remains without a duplicate direct source.' );
gpp_assert_same( 'UNBOUND', pr5_binding_for( $qualified, 'print.utility' )['state'], 'Print utility remains a capability, not a fabricated host source.' );

$activation = $visual->resolve( 'gravity_flow.entry_detail' );
gpp_assert_same( 'srwf.operations.presentation', $activation['package_id'], 'Entry Detail uses the shipped Operations Package.' );
gpp_assert_same( 'srwf.operations.entry-detail.v1', $activation['profile_id'], 'Entry Detail adopts the shipped surface profile.' );

$first_version = $first['steps']['stable_host_sources']['binding_set_version'];
$second = $service->initialize( array( 'form_id' => 77 ) );
gpp_assert_same( EntryDetailSetupService::STATUS_COMPLETED, $second['status'], 'Entry Detail adoption is idempotent.' );
gpp_assert_same( 'already_qualified', $second['steps']['stable_host_sources']['outcome'], 'Stable host-source qualification is idempotent.' );
gpp_assert_same( $first_version, $second['steps']['stable_host_sources']['binding_set_version'], 'Idempotent qualification does not publish a needless binding version.' );
gpp_assert_same( 'already_active', $second['steps']['entry_detail_activation']['outcome'], 'Idempotent rerun preserves the same activation.' );
gpp_assert_same( 'deferred_to_request', $second['steps']['runtime_readiness']['outcome'], 'Rerun still does not cache or fabricate request eligibility.' );

echo "ENTRY_DETAIL_PRODUCTION_ACTIVATION_TESTS_PASS\n";
