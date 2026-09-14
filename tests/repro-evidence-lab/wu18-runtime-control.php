<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

$action = getenv( 'WU18_CONTROL' );
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['forms']['alpha']['form_id'] ) ) {
    throw new RuntimeException( 'WU18 fixture manifest is unavailable.' );
}

function wu18_control_lifecycle() {
    return new BindingSetLifecycle(
        new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
        new EvidenceReferenceGate( array( 'wu21:synthetic-fixture', 'wu21:reproducible-simulation' ) )
    );
}

function wu18_control_find_binding( $state, $binding_set_id ) {
    foreach ( $state['installed'] as $versions ) {
        foreach ( $versions as $record ) {
            if ( isset( $record['artifact']['binding_set_id'] ) && $binding_set_id === $record['artifact']['binding_set_id'] ) {
                return $record['artifact'];
            }
        }
    }
    throw new RuntimeException( 'WU18 active binding artifact not found: ' . $binding_set_id );
}

function wu18_control_backup( $option_name ) {
    $state = get_option( BindingSetLifecycle::OPTION_NAME );
    if ( ! is_array( $state ) ) {
        throw new RuntimeException( 'Binding lifecycle state is unavailable.' );
    }
    if ( false !== get_option( $option_name, false ) ) {
        throw new RuntimeException( 'WU18 scenario backup already exists: ' . $option_name );
    }
    update_option( $option_name, $state, false );
    return $state;
}

function wu18_control_restore( $option_name ) {
    $backup = get_option( $option_name, false );
    if ( ! is_array( $backup ) ) {
        throw new RuntimeException( 'WU18 scenario backup is missing: ' . $option_name );
    }
    update_option( BindingSetLifecycle::OPTION_NAME, $backup, false );
    delete_option( $option_name );
    EntryDetailPresentationAdapter::resetRuntimeCache();
}

if ( 'required-not-proven-on' === $action ) {
    $state = wu18_control_backup( 'gpp_wu18_required_not_proven_backup' );
    $candidate = wu18_control_find_binding( $state, 'wu18.sim.alpha.v1' );
    $candidate['binding_set_id'] = 'wu18.sim.alpha.required-not-proven';

    foreach ( $candidate['bindings'] as &$binding ) {
        if ( 'student.national_id' === $binding['semantic_slot_key'] ) {
            $binding['state'] = 'NOT_PROVEN';
            $binding['source_ref'] = null;
            $binding['evidence_refs'] = array( 'wu21:fail-closed-negative-control' );
        }
    }
    unset( $binding );

    foreach ( $candidate['runtime_claims'] as &$claim ) {
        if ( 'student.national_id' === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
            $claim['evidence_state'] = 'NOT_PROVEN';
            $claim['evidence_refs'] = array( 'wu21:fail-closed-negative-control' );
        }
    }
    unset( $claim );

    $lifecycle = wu18_control_lifecycle();
    $lifecycle->import( $candidate );
    $lifecycle->activate(
        array(
            'context' => $candidate['context'],
            'binding_set_id' => $candidate['binding_set_id'],
            'binding_set_version' => $candidate['binding_set_version'],
        )
    );
    EntryDetailPresentationAdapter::resetRuntimeCache();
    echo 'required-not-proven-on';
    return;
}

if ( 'required-not-proven-off' === $action ) {
    wu18_control_restore( 'gpp_wu18_required_not_proven_backup' );
    echo 'required-not-proven-off';
    return;
}

throw new RuntimeException( 'Unknown WU18_CONTROL action.' );
