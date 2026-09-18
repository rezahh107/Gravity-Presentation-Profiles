<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\AdminBindingEvidenceStore;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\RepairBindingEvidenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;

/**
 * Qualifies only stable, installation-level Entry Detail host sources.
 *
 * No request-local region presence, assignee identity, action permission or
 * current-user authorization is persisted here. Those remain fresh Gravity Flow
 * request facts and are evaluated by EntryDetailPresentationAdapter.
 */
final class EntryDetailRuntimeReadinessService {
    const STATUS_QUALIFIED = 'QUALIFIED_AND_ACTIVATED';
    const STATUS_ALREADY_QUALIFIED = 'ALREADY_QUALIFIED';

    private const HOST_SOURCES = array(
        'entry.created_at' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ),
        'workflow.current_step' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ),
        'workflow.status' => array( 'type' => 'gravity_flow.state', 'state_key' => 'status' ),
    );

    private $binding_store;
    private $evidence_store;

    public function __construct( StateStore $binding_store, StateStore $evidence_store ) {
        $this->binding_store = $binding_store;
        $this->evidence_store = $evidence_store;
    }

    public static function forWordPress() {
        return new self(
            new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
            new WordPressOptionStateStore( AdminBindingEvidenceStore::OPTION_NAME )
        );
    }

    public function qualify( $context ) {
        if ( ! is_array( $context ) ) {
            throw new LifecycleException( 'entry_detail_runtime_invalid_request', 'Entry Detail runtime qualification requires a binding context.' );
        }

        $reader = new BindingSetLifecycle( $this->binding_store, new EvidenceReferenceGate( array() ) );
        $snapshot = $reader->snapshot();
        $context_key = $reader->contextKey( $context );
        if ( empty( $snapshot['activations'][ $context_key ] ) ) {
            throw new LifecycleException( 'entry_detail_binding_context_missing', 'No active EnvironmentBindingSet exists for the selected form.' );
        }

        $active = $snapshot['activations'][ $context_key ];
        if ( empty( $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'] ) ) {
            throw new LifecycleException( 'entry_detail_binding_artifact_missing', 'The active EnvironmentBindingSet artifact is unavailable.' );
        }

        $record = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ];
        if ( $record['context_key'] !== $context_key ) {
            throw new LifecycleException( 'entry_detail_binding_context_mismatch', 'The active EnvironmentBindingSet does not match the selected form context.' );
        }

        $artifact = $record['artifact'];
        foreach ( array_keys( self::HOST_SOURCES ) as $slot_key ) {
            if ( ! $this->hostSeamAvailable( $slot_key ) ) {
                throw new LifecycleException( 'entry_detail_host_seam_unavailable', 'A required stable Entry Detail host API is unavailable.' );
            }
        }

        $comparison_refs = array();
        $current_candidate = $this->qualifiedArtifact( $artifact, $comparison_refs );
        if ( CanonicalJson::encode( $current_candidate ) === CanonicalJson::encode( $artifact ) ) {
            return array(
                'status' => self::STATUS_ALREADY_QUALIFIED,
                'binding_set_id' => $artifact['binding_set_id'],
                'binding_set_version' => $artifact['binding_set_version'],
                'stable_sources' => array_keys( self::HOST_SOURCES ),
                'request_authorization' => 'decided_per_request_by_gravity_flow',
            );
        }

        $next = $artifact;
        $next['binding_set_version'] = $this->nextVersion( $snapshot, $artifact['binding_set_id'], $artifact['binding_set_version'] );
        $binding_refs = array();
        $next = $this->qualifiedArtifact( $next, $binding_refs );
        $next['provenance']['producer'] = 'Gravity Presentation Profiles Entry Detail stable host-source qualification';
        foreach ( $binding_refs as $ref ) {
            if ( ! in_array( $ref, $next['provenance']['evidence_refs'], true ) ) {
                $next['provenance']['evidence_refs'][] = $ref;
            }
        }
        EnvironmentBindingSet::validate( $next );

        $gate = new RepairBindingEvidenceGate(
            new AdminBindingEvidenceStore( $this->evidence_store ),
            $next,
            $artifact,
            new EvidenceReferenceGate( $binding_refs )
        );
        $lifecycle = new BindingSetLifecycle( $this->binding_store, $gate );
        $lifecycle->import( $next );
        $lifecycle->activateIfCurrent(
            array(
                'context' => $next['context'],
                'binding_set_id' => $next['binding_set_id'],
                'binding_set_version' => $next['binding_set_version'],
                'expected_current_activation' => array(
                    'binding_set_id' => $active['binding_set_id'],
                    'binding_set_version' => $active['binding_set_version'],
                ),
            )
        );

        return array(
            'status' => self::STATUS_QUALIFIED,
            'binding_set_id' => $next['binding_set_id'],
            'previous_version' => $artifact['binding_set_version'],
            'binding_set_version' => $next['binding_set_version'],
            'stable_sources' => array_keys( self::HOST_SOURCES ),
            'request_authorization' => 'decided_per_request_by_gravity_flow',
        );
    }

    private function qualifiedArtifact( $artifact, &$binding_refs ) {
        $candidate = $artifact;
        $binding_refs = array();

        foreach ( self::HOST_SOURCES as $slot_key => $source_ref ) {
            $index = $this->bindingIndex( $candidate, $slot_key );
            $binding = $candidate['bindings'][ $index ];
            if ( 'PROVEN' === $binding['state'] && ! $this->sameSource( $binding['source_ref'], $source_ref ) ) {
                throw new LifecycleException(
                    'entry_detail_host_source_conflict',
                    'A required stable Entry Detail semantic is already bound to a different authoritative source.'
                );
            }

            if ( 'PROVEN' === $binding['state'] && $this->sameSource( $binding['source_ref'], $source_ref ) ) {
                continue;
            }

            $ref = EntryDetailRuntimeEvidence::hostBindingRef( $candidate, $slot_key, $source_ref );
            $candidate['bindings'][ $index ] = array(
                'semantic_slot_key' => $slot_key,
                'state' => 'PROVEN',
                'source_ref' => $source_ref,
                'evidence_refs' => array( $ref ),
            );
            $binding_refs[] = $ref;
        }

        EnvironmentBindingSet::validate( $candidate );
        $binding_refs = array_values( array_unique( $binding_refs ) );
        return $candidate;
    }

    private function bindingIndex( $artifact, $semantic_slot_key ) {
        foreach ( $artifact['bindings'] as $index => $binding ) {
            if ( $semantic_slot_key === $binding['semantic_slot_key'] ) {
                return $index;
            }
        }
        throw new LifecycleException( 'entry_detail_semantic_slot_missing', 'A required stable Entry Detail semantic is absent from the active EnvironmentBindingSet.' );
    }

    private function hostSeamAvailable( $slot_key ) {
        if ( 'entry.created_at' === $slot_key ) {
            return class_exists( 'GFAPI' ) && method_exists( 'GFAPI', 'get_entry' );
        }
        if ( 'workflow.current_step' === $slot_key ) {
            return class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_current_step' );
        }
        if ( 'workflow.status' === $slot_key ) {
            return class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_status' );
        }
        return false;
    }

    private function sameSource( $left, $right ) {
        if ( ! is_array( $left ) || ! is_array( $right ) ) return false;
        try {
            return CanonicalJson::encode( $left ) === CanonicalJson::encode( $right );
        } catch ( \Throwable $exception ) {
            return false;
        }
    }

    private function nextVersion( $snapshot, $binding_set_id, $current_version ) {
        $parts = array_map( 'intval', explode( '.', $current_version ) );
        if ( 3 !== count( $parts ) ) {
            throw new LifecycleException( 'entry_detail_binding_version_invalid', 'The active binding version is not semantic x.y.z.' );
        }

        $patch = $parts[2] + 1;
        do {
            $candidate = $parts[0] . '.' . $parts[1] . '.' . $patch;
            $patch++;
        } while ( isset( $snapshot['installed'][ $binding_set_id ][ $candidate ] ) );

        return $candidate;
    }
}
