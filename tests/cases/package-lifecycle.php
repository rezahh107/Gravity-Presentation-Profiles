<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;

Autoloader::register();

final class Wu10MemoryStateStore implements StateStore {
    private $state = null;
    private $fail_next = false;
    public $write_count = 0;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        if ( $this->fail_next ) {
            $this->fail_next = false;
            return false;
        }
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        $this->write_count++;
        return true;
    }

    public function failNextCommit() {
        $this->fail_next = true;
    }
}

function wu10_throws( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message . ' reason' );
        return;
    }
    gpp_fail( $message );
}

function wu10_visual( $version = '1.0.0', $seam = '1.0.0' ) {
    return array(
        'artifact_type' => 'gpp.visual_profile_package',
        'schema_version' => '1.0.0',
        'package_id' => 'gpp.shared.defaults',
        'package_version' => $version,
        'provenance' => array( 'producer' => 'WU10 synthetic fixture', 'evidence_refs' => array( 'fixture:wu10:visual' ) ),
        'design_tokens' => array( 'colors' => array( 'primary' => '#1D4ED8' ) ),
        'semantic_slots' => array(
            array(
                'semantic_slot_key' => 'student.full_name',
                'meaning' => 'student full name',
                'surface_usage' => array(
                    array( 'surface' => 'gravity_flow.inbox', 'required' => true ),
                    array( 'surface' => 'gravity_flow.entry_detail', 'required' => true ),
                    array( 'surface' => 'print.dossier', 'required' => true ),
                ),
            ),
        ),
        'surface_profiles' => array(
            array( 'surface' => 'gravity_flow.inbox', 'profile_id' => 'shared.inbox.v1', 'token_refs' => array( 'colors.primary' ), 'semantic_slots' => array( 'student.full_name' ) ),
            array( 'surface' => 'gravity_flow.entry_detail', 'profile_id' => 'shared.entry.v1', 'token_refs' => array( 'colors.primary' ), 'semantic_slots' => array( 'student.full_name' ) ),
            array( 'surface' => 'print.dossier', 'profile_id' => 'shared.print.v1', 'token_refs' => array( 'colors.primary' ), 'semantic_slots' => array( 'student.full_name' ) ),
        ),
        'reserved_extension_seam' => array( 'version' => $seam, 'state' => 'INERT' ),
    );
}

function wu10_binding( $version = '1.0.0' ) {
    return array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.0.0',
        'binding_set_id' => 'fixture.environment.bindings',
        'binding_set_version' => $version,
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'fixture-installation' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 'fixture-form-a' ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox' ),
        ),
        'provenance' => array( 'producer' => 'WU10 synthetic fixture', 'evidence_refs' => array( 'fixture:wu10:binding' ) ),
        'bindings' => array(
            array( 'semantic_slot_key' => 'student.full_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 101 ), 'evidence_refs' => array( 'fixture:wu10:field:101' ) ),
            array( 'semantic_slot_key' => 'school.name', 'state' => 'UNBOUND', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'student.mobile', 'state' => 'NOT_PROVEN', 'source_ref' => null, 'evidence_refs' => array() ),
            array( 'semantic_slot_key' => 'student.photo', 'state' => 'NOT_APPLICABLE', 'source_ref' => null, 'evidence_refs' => array() ),
        ),
        'runtime_claims' => array(
            array( 'semantic_slot_key' => 'student.full_name', 'claim' => 'authorization', 'evidence_state' => 'NOT_PROVEN', 'evidence_refs' => array() ),
        ),
    );
}

function wu10_versions( $snapshot, $identity ) {
    return isset( $snapshot['installed'][ $identity ] ) ? count( $snapshot['installed'][ $identity ] ) : 0;
}

$visual_store  = new Wu10MemoryStateStore();
$binding_store = new Wu10MemoryStateStore();
$visual        = new VisualPackageLifecycle( $visual_store );
$bindings      = new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array( 'fixture:wu10:field:101' ) ) );
$workflow      = new SettingsLifecycleWorkflow( $visual, $bindings );
$visual_json   = json_encode( wu10_visual(), JSON_UNESCAPED_SLASHES );
$binding_json  = json_encode( wu10_binding(), JSON_UNESCAPED_SLASHES );

// Validation rejects malformed/unsupported/unknown structure with zero lifecycle persistence.
gpp_assert_same( false, $workflow->validateVisualJson( '{bad' )['valid'], 'Malformed visual JSON rejected.' );
gpp_assert_same( false, $workflow->validateBindingJson( '{bad' )['valid'], 'Malformed binding JSON rejected.' );
wu10_throws( 'invalid_json', static function () use ( $workflow ) { $workflow->importVisualJson( '{bad' ); }, 'Malformed visual import rejected.' );
wu10_throws( 'invalid_json', static function () use ( $workflow ) { $workflow->importBindingJson( '{bad' ); }, 'Malformed binding import rejected.' );
gpp_assert_same( 0, $visual_store->write_count, 'Malformed visual JSON writes nothing.' );
gpp_assert_same( 0, $binding_store->write_count, 'Malformed binding JSON writes nothing.' );

$bad = wu10_visual();
$bad['schema_version'] = '2.0.0';
wu10_throws( 'visual_contract_violation', static function () use ( $workflow, $bad ) { $workflow->importVisualJson( json_encode( $bad ) ); }, 'Unsupported visual schema rejected.' );
$bad = wu10_visual();
$bad['capabilities'] = array( 'arbitrary' );
wu10_throws( 'visual_contract_violation', static function () use ( $workflow, $bad ) { $workflow->importVisualJson( json_encode( $bad ) ); }, 'Unknown visual keys rejected.' );
$bad = wu10_binding();
$bad['schema_version'] = '2.0.0';
wu10_throws( 'binding_contract_violation', static function () use ( $workflow, $bad ) { $workflow->importBindingJson( json_encode( $bad ) ); }, 'Unsupported binding schema rejected.' );
$bad = wu10_binding();
$bad['package_id'] = 'forbidden.visual';
wu10_throws( 'binding_contract_violation', static function () use ( $workflow, $bad ) { $workflow->importBindingJson( json_encode( $bad ) ); }, 'Binding visual selector rejected.' );
gpp_assert_same( 0, $visual_store->write_count, 'Invalid visual contracts write nothing.' );
gpp_assert_same( 0, $binding_store->write_count, 'Invalid binding contracts write nothing.' );

// Immutable install, idempotency, conflict, and inactive new-version behavior.
$v1 = $workflow->importVisualJson( $visual_json );
gpp_assert_same( 'INSTALLED_INACTIVE', $v1['status'], 'Visual import is inactive.' );
gpp_assert_same( 'PACKAGE_VALID', $v1['validation_report']['structural_status'], 'Visual validation report is class-specific.' );
gpp_assert_same( array(), $visual->snapshot()['activations'], 'Visual import does not activate.' );
$visual_hash = $visual->snapshot()['installed']['gpp.shared.defaults']['1.0.0']['content_hash'];
gpp_assert_same( 'IDEMPOTENT', $workflow->importVisualJson( $visual_json )['status'], 'Visual same hash is idempotent.' );
gpp_assert_same( 1, wu10_versions( $visual->snapshot(), 'gpp.shared.defaults' ), 'Visual idempotency does not duplicate.' );
$conflict = wu10_visual();
$conflict['design_tokens']['colors']['primary'] = '#111827';
wu10_throws( 'identity_version_conflict', static function () use ( $visual, $conflict ) { $visual->import( $conflict ); }, 'Visual version/hash conflict rejected.' );
gpp_assert_same( $visual_hash, $visual->snapshot()['installed']['gpp.shared.defaults']['1.0.0']['content_hash'], 'Visual conflict preserves immutable content.' );
$visual->import( wu10_visual( '1.1.0' ) );
gpp_assert_same( 2, wu10_versions( $visual->snapshot(), 'gpp.shared.defaults' ), 'Visual new version installs separately.' );
gpp_assert_same( array(), $visual->snapshot()['activations'], 'Visual new version remains inactive.' );

$b1 = $workflow->importBindingJson( $binding_json );
gpp_assert_same( 'INSTALLED_INACTIVE', $b1['status'], 'Binding import is inactive.' );
gpp_assert_same( 'BINDING_VALID', $b1['validation_report']['structural_status'], 'Binding validation report is class-specific.' );
gpp_assert_same( array(), $bindings->snapshot()['activations'], 'Binding import does not activate.' );
$binding_hash = $bindings->snapshot()['installed']['fixture.environment.bindings']['1.0.0']['content_hash'];
gpp_assert_same( 'IDEMPOTENT', $workflow->importBindingJson( $binding_json )['status'], 'Binding same hash is idempotent.' );
gpp_assert_same( 1, wu10_versions( $bindings->snapshot(), 'fixture.environment.bindings' ), 'Binding idempotency does not duplicate.' );
$conflict = wu10_binding();
$conflict['provenance']['producer'] = 'Different producer';
wu10_throws( 'identity_version_conflict', static function () use ( $bindings, $conflict ) { $bindings->import( $conflict ); }, 'Binding version/hash conflict rejected.' );
gpp_assert_same( $binding_hash, $bindings->snapshot()['installed']['fixture.environment.bindings']['1.0.0']['content_hash'], 'Binding conflict preserves immutable content.' );
$bindings->import( wu10_binding( '1.1.0' ) );
gpp_assert_same( 2, wu10_versions( $bindings->snapshot(), 'fixture.environment.bindings' ), 'Binding new version installs separately.' );
gpp_assert_same( array(), $bindings->snapshot()['activations'], 'Binding new version remains inactive.' );

// Separate activation registries and strict targeting keys.
$profiles = array( 'gravity_flow.inbox' => 'shared.inbox.v1', 'gravity_flow.entry_detail' => 'shared.entry.v1', 'print.dossier' => 'shared.print.v1' );
foreach ( $profiles as $surface => $profile_id ) {
    $active = $visual->activate( array( 'surface' => $surface, 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.0.0', 'profile_id' => $profile_id ) );
    gpp_assert_same( array( 'package_id', 'package_version', 'profile_id' ), array_keys( $active ), 'Visual registry stores exact visual identity.' );
}
foreach ( array( 'form_id', 'user_id', 'role', 'binding_set_id' ) as $key ) {
    $request = array( 'surface' => 'gravity_flow.inbox', 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.0.0', 'profile_id' => 'shared.inbox.v1', $key => 'forbidden' );
    wu10_throws( 'invalid_request_keys', static function () use ( $visual, $request ) { $visual->activate( $request ); }, 'Visual targeting injection rejected.' );
}

$context = wu10_binding()['context'];
$active = $bindings->activate( array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.0.0' ) );
gpp_assert_same( array( 'binding_set_id', 'binding_set_version' ), array_keys( $active ), 'Binding registry contains no visual selector.' );
foreach ( array( 'package_id', 'profile_id' ) as $key ) {
    $request = array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.0.0', $key => 'forbidden' );
    wu10_throws( 'invalid_request_keys', static function () use ( $bindings, $request ) { $bindings->activate( $request ); }, 'Binding visual selector injection rejected.' );
}

// Failure injection proves activation/rollback are atomic and preserve prior state.
$before = $visual->resolve( 'gravity_flow.inbox' );
$visual_store->failNextCommit();
wu10_throws( 'state_commit_failed', static function () use ( $visual ) { $visual->activate( array( 'surface' => 'gravity_flow.inbox', 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.1.0', 'profile_id' => 'shared.inbox.v1' ) ); }, 'Visual failed activation is atomic.' );
gpp_assert_same( $before, $visual->resolve( 'gravity_flow.inbox' ), 'Visual activation failure preserves prior state.' );
$before = $bindings->resolve( $context );
$binding_store->failNextCommit();
wu10_throws( 'state_commit_failed', static function () use ( $bindings, $context ) { $bindings->activate( array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.1.0' ) ); }, 'Binding failed activation is atomic.' );
gpp_assert_same( $before, $bindings->resolve( $context ), 'Binding activation failure preserves prior state.' );

$visual->activate( array( 'surface' => 'gravity_flow.inbox', 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.1.0', 'profile_id' => 'shared.inbox.v1' ) );
$visual->rollback( array( 'surface' => 'gravity_flow.inbox', 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.0.0', 'profile_id' => 'shared.inbox.v1' ) );
gpp_assert_same( '1.0.0', $visual->resolve( 'gravity_flow.inbox' )['package_version'], 'Visual rollback selects prior version.' );
$bindings->activate( array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.1.0' ) );
$bindings->rollback( array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.0.0' ) );
gpp_assert_same( '1.0.0', $bindings->resolve( $context )['binding_set_version'], 'Binding rollback selects prior version.' );
$visual_store->failNextCommit();
wu10_throws( 'state_commit_failed', static function () use ( $visual ) { $visual->rollback( array( 'surface' => 'gravity_flow.inbox', 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.1.0', 'profile_id' => 'shared.inbox.v1' ) ); }, 'Failed visual rollback preserves active state.' );
gpp_assert_same( '1.0.0', $visual->resolve( 'gravity_flow.inbox' )['package_version'], 'Visual rollback failure preserves state.' );
$binding_store->failNextCommit();
wu10_throws( 'state_commit_failed', static function () use ( $bindings, $context ) { $bindings->rollback( array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.1.0' ) ); }, 'Failed binding rollback preserves active state.' );
gpp_assert_same( '1.0.0', $bindings->resolve( $context )['binding_set_version'], 'Binding rollback failure preserves state.' );

// Active removal is blocked; inactive removal and classes are independent.
wu10_throws( 'active_artifact_removal_blocked', static function () use ( $visual ) { $visual->remove( array( 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.0.0' ) ); }, 'Active visual removal blocked.' );
wu10_throws( 'active_artifact_removal_blocked', static function () use ( $bindings ) { $bindings->remove( array( 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.0.0' ) ); }, 'Active binding removal blocked.' );
$other = $bindings->snapshot();
$visual->remove( array( 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.1.0' ) );
gpp_assert_same( $other, $bindings->snapshot(), 'Visual removal cannot mutate binding state.' );
$other = $visual->snapshot();
$bindings->remove( array( 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.1.0' ) );
gpp_assert_same( $other, $visual->snapshot(), 'Binding removal cannot mutate visual state.' );

// PROVEN evidence gate fails closed and unresolved states never guess sources.
$closed = new BindingSetLifecycle( new Wu10MemoryStateStore(), new EvidenceReferenceGate( array() ) );
$closed->import( wu10_binding() );
wu10_throws( 'proven_evidence_not_admitted', static function () use ( $closed, $context ) { $closed->activate( array( 'context' => $context, 'binding_set_id' => 'fixture.environment.bindings', 'binding_set_version' => '1.0.0' ) ); }, 'PROVEN binding without admitted evidence rejected.' );
gpp_assert_same( array(), $closed->snapshot()['activations'], 'Rejected PROVEN binding does not activate.' );
$binding_export = json_decode( $workflow->exportBinding( 'fixture.environment.bindings', '1.0.0' ), true );
foreach ( $binding_export['bindings'] as $binding ) {
    if ( in_array( $binding['state'], array( 'UNBOUND', 'NOT_PROVEN', 'NOT_APPLICABLE' ), true ) ) {
        gpp_assert_same( null, $binding['source_ref'], 'Unresolved states retain null source_ref.' );
    }
}

// Reserved seam stays inert across install/activation.
$profile_before = $visual->effectiveProfile( 'gravity_flow.inbox' );
$visual->import( wu10_visual( '1.2.0', '1.1.0' ) );
$visual->activate( array( 'surface' => 'gravity_flow.inbox', 'package_id' => 'gpp.shared.defaults', 'package_version' => '1.2.0', 'profile_id' => 'shared.inbox.v1' ) );
gpp_assert_same( $profile_before, $visual->effectiveProfile( 'gravity_flow.inbox' ), 'Reserved seam data is inert in V1 resolution.' );

// Export boundaries: visual is portable; concrete context exists only in binding artifact; neither carries code/selectors.
$visual_export = $workflow->exportVisual( 'gpp.shared.defaults', '1.2.0' );
foreach ( array( '"form_id"', '"field_id"', '"step_id"', '"page_id"', '"route_id"', '"user_id"', '"role"', '"binding_set_id"' ) as $key ) {
    gpp_assert_true( false === strpos( $visual_export, $key ), 'Visual export excludes environment target ' . $key );
}
$binding_export_json = json_encode( $binding_export );
gpp_assert_true( false !== strpos( $binding_export_json, '"form_id"' ), 'Binding export retains typed concrete context.' );
gpp_assert_true( false === strpos( $binding_export_json, '"package_id"' ), 'Binding export has no package selector.' );
gpp_assert_true( false === strpos( $binding_export_json, '"profile_id"' ), 'Binding export has no profile selector.' );
foreach ( array( $visual_export, $binding_export_json ) as $exported ) {
    foreach ( array( '"selector"', '"hook"', '<?php', '<script', 'javascript:' ) as $unsafe ) {
        gpp_assert_true( false === stripos( $exported, $unsafe ), 'Exports exclude executable/raw-selector data.' );
    }
}

// Audit records are bounded metadata only; no concrete source payload or host authorization state.
foreach ( array( json_encode( $visual->snapshot()['audit'] ), json_encode( $bindings->snapshot()['audit'] ) ) as $audit ) {
    foreach ( array( 'selector', '<script', '<?php', 'source_ref', 'authorization', 'field_id', 'form_id' ) as $unsafe ) {
        gpp_assert_true( false === stripos( $audit, $unsafe ), 'Audit excludes unsafe or host-owned state.' );
    }
}
gpp_assert_true( count( $visual->snapshot()['audit'] ) <= 200, 'Visual audit is bounded.' );
gpp_assert_true( count( $bindings->snapshot()['audit'] ) <= 200, 'Binding audit is bounded.' );

echo "GPP_WU10_PACKAGE_LIFECYCLE_PASS\n";
