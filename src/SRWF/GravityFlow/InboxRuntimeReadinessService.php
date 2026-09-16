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
use GravityPresentationProfiles\GravityForms\GravityFormsFieldInventory;

/**
 * Qualifies Inbox configuration availability against the real configured host.
 *
 * This does not authorize any user and does not inspect or replace the native
 * Inbox query. It publishes a new immutable EnvironmentBindingSet version only
 * when host-source binding or source-bound availability evidence needs to move.
 */
final class InboxRuntimeReadinessService {
    const STATUS_QUALIFIED = 'QUALIFIED_AND_ACTIVATED';
    const STATUS_ALREADY_QUALIFIED = 'ALREADY_QUALIFIED';

    private const HOST_SOURCES = array(
        'entry.created_at' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ),
        'workflow.current_step' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ),
    );

    private $binding_store;
    private $evidence_store;
    private $inventory;

    public function __construct( StateStore $binding_store, StateStore $evidence_store, GravityFormsFieldInventory $inventory ) {
        $this->binding_store = $binding_store;
        $this->evidence_store = $evidence_store;
        $this->inventory = $inventory;
    }

    public static function forWordPress() {
        return new self(
            new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
            new WordPressOptionStateStore( AdminBindingEvidenceStore::OPTION_NAME ),
            new GravityFormsFieldInventory()
        );
    }

    /**
     * Read-only prerequisite check used before a visual activation mutation.
     */
    public function assertActiveBindingContext( $context ) {
        if ( ! is_array( $context ) ) {
            throw new LifecycleException( 'inbox_runtime_invalid_request', 'Inbox runtime qualification requires a binding context.' );
        }

        $reader = new BindingSetLifecycle( $this->binding_store, new EvidenceReferenceGate( array() ) );
        $snapshot = $reader->snapshot();
        $context_key = $reader->contextKey( $context );
        if ( empty( $snapshot['activations'][ $context_key ] ) ) {
            throw new LifecycleException( 'inbox_binding_context_missing', 'No active EnvironmentBindingSet exists for the selected form.' );
        }

        $active = $snapshot['activations'][ $context_key ];
        if ( empty( $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'] ) ) {
            throw new LifecycleException( 'inbox_binding_artifact_missing', 'The active EnvironmentBindingSet artifact is unavailable.' );
        }

        $record = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ];
        if ( $record['context_key'] !== $context_key ) {
            throw new LifecycleException( 'inbox_binding_context_mismatch', 'The active EnvironmentBindingSet does not match the selected form context.' );
        }

        return array(
            'binding_set_id' => $active['binding_set_id'],
            'binding_set_version' => $active['binding_set_version'],
            'context_key' => $context_key,
        );
    }

    /**
     * @param array $context Exact active EnvironmentBindingSet context.
     * @param array $semantic_slot_declarations Active Operations Package semantic declarations.
     */
    public function qualify( $context, $semantic_slot_declarations ) {
        if ( ! is_array( $context ) || ! is_array( $semantic_slot_declarations ) ) {
            throw new LifecycleException( 'inbox_runtime_invalid_request', 'Inbox runtime qualification requires a binding context and semantic declarations.' );
        }

        $reader = new BindingSetLifecycle( $this->binding_store, new EvidenceReferenceGate( array() ) );
        $snapshot = $reader->snapshot();
        $context_key = $reader->contextKey( $context );

        if ( empty( $snapshot['activations'][ $context_key ] ) ) {
            throw new LifecycleException( 'inbox_binding_context_missing', 'No active EnvironmentBindingSet exists for the selected form.' );
        }

        $active = $snapshot['activations'][ $context_key ];
        if ( empty( $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'] ) ) {
            throw new LifecycleException( 'inbox_binding_artifact_missing', 'The active EnvironmentBindingSet artifact is unavailable.' );
        }

        $record = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ];
        if ( $record['context_key'] !== $context_key ) {
            throw new LifecycleException( 'inbox_binding_context_mismatch', 'The active EnvironmentBindingSet does not match the selected form context.' );
        }

        $artifact = $record['artifact'];
        $form_id = (int) $artifact['context']['form_source_ref']['form_id'];
        $inventory = $this->inventory->load( $form_id );
        if ( empty( $inventory['form_exists'] ) ) {
            throw new LifecycleException( 'inbox_bound_form_missing', 'The configured Gravity Forms form no longer exists.' );
        }

        $current_binding_refs = array();
        $current_outcomes = array();
        $current_candidate = $this->qualifiedArtifact(
            $artifact,
            $semantic_slot_declarations,
            $inventory,
            $current_binding_refs,
            $current_outcomes
        );

        if ( CanonicalJson::encode( $current_candidate ) === CanonicalJson::encode( $artifact ) ) {
            return array(
                'status' => self::STATUS_ALREADY_QUALIFIED,
                'binding_set_id' => $artifact['binding_set_id'],
                'binding_set_version' => $artifact['binding_set_version'],
                'outcomes' => $current_outcomes,
                'request_authorization' => 'decided_per_request_by_gravity_flow',
            );
        }

        $next = $artifact;
        $next['binding_set_version'] = $this->nextVersion( $snapshot, $artifact['binding_set_id'], $artifact['binding_set_version'] );
        $binding_refs = array();
        $outcomes = array();
        $next = $this->qualifiedArtifact( $next, $semantic_slot_declarations, $inventory, $binding_refs, $outcomes );

        $next['provenance']['producer'] = 'Gravity Presentation Profiles Inbox runtime qualification';
        foreach ( $binding_refs as $ref ) {
            if ( ! in_array( $ref, $next['provenance']['evidence_refs'], true ) ) {
                $next['provenance']['evidence_refs'][] = $ref;
            }
        }
        foreach ( $next['runtime_claims'] as $claim ) {
            if ( 'availability' !== $claim['claim'] || 'PROVEN' !== $claim['evidence_state'] ) {
                continue;
            }
            foreach ( $claim['evidence_refs'] as $ref ) {
                if ( ! in_array( $ref, $next['provenance']['evidence_refs'], true ) ) {
                    $next['provenance']['evidence_refs'][] = $ref;
                }
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
            'outcomes' => $outcomes,
            'request_authorization' => 'decided_per_request_by_gravity_flow',
        );
    }

    private function qualifiedArtifact( $artifact, $semantic_slot_declarations, $inventory, &$binding_refs, &$outcomes ) {
        $binding_refs = array();
        $outcomes = array();
        $candidate = $artifact;

        foreach ( self::HOST_SOURCES as $slot_key => $source_ref ) {
            if ( ! $this->hostSeamAvailable( $slot_key ) ) {
                $outcomes[ $slot_key ] = 'host_seam_unavailable';
                $this->setAvailabilityClaim( $candidate, $slot_key, false, null );
                continue;
            }

            $binding_index = $this->bindingIndex( $candidate, $slot_key );
            $binding = $candidate['bindings'][ $binding_index ];
            if ( 'PROVEN' === $binding['state'] && ! $this->sameSource( $binding['source_ref'], $source_ref ) ) {
                throw new LifecycleException(
                    'inbox_host_source_conflict',
                    'A required host-managed Inbox semantic is already bound to a different authoritative source.'
                );
            }

            $ref = InboxRuntimeEvidence::hostBindingRef( $candidate, $slot_key, $source_ref );
            $candidate['bindings'][ $binding_index ] = array(
                'semantic_slot_key' => $slot_key,
                'state' => 'PROVEN',
                'source_ref' => $source_ref,
                'evidence_refs' => array( $ref ),
            );
            $binding_refs[] = $ref;
        }

        foreach ( $this->requiredSourceSlots( $semantic_slot_declarations ) as $slot_key ) {
            $binding = $candidate['bindings'][ $this->bindingIndex( $candidate, $slot_key ) ];
            if ( 'PROVEN' !== $binding['state'] || ! is_array( $binding['source_ref'] ) ) {
                $this->setAvailabilityClaim( $candidate, $slot_key, false, null );
                $outcomes[ $slot_key ] = 'source_not_bound';
                continue;
            }

            if ( ! $this->sourceConfigurationAvailable( $slot_key, $binding['source_ref'], $inventory ) ) {
                $this->setAvailabilityClaim( $candidate, $slot_key, false, null );
                $outcomes[ $slot_key ] = 'source_unavailable';
                continue;
            }

            $availability_ref = InboxRuntimeEvidence::availabilityRef( $candidate, $slot_key, $binding['source_ref'] );
            $this->setAvailabilityClaim( $candidate, $slot_key, true, $availability_ref );
            $outcomes[ $slot_key ] = 'available';
        }

        EnvironmentBindingSet::validate( $candidate );
        $binding_refs = array_values( array_unique( $binding_refs ) );

        return $candidate;
    }

    private function requiredSourceSlots( $semantic_slot_declarations ) {
        $slots = array();

        foreach ( $semantic_slot_declarations as $declaration ) {
            if ( ! is_array( $declaration ) || empty( $declaration['semantic_slot_key'] ) || empty( $declaration['surface_usage'] ) ) {
                continue;
            }
            $required = false;
            foreach ( $declaration['surface_usage'] as $usage ) {
                if ( is_array( $usage )
                    && 'gravity_flow.inbox' === ( isset( $usage['surface'] ) ? $usage['surface'] : null )
                    && true === ( isset( $usage['required'] ) ? $usage['required'] : null ) ) {
                    $required = true;
                    break;
                }
            }
            if ( ! $required ) {
                continue;
            }

            $slot_key = $declaration['semantic_slot_key'];
            $components = OperationsBindingManagementPolicy::derivationComponents( $slot_key );
            if ( array() !== $components ) {
                foreach ( $components as $component ) {
                    $slots[ $component ] = true;
                }
                continue;
            }

            $slots[ $slot_key ] = true;
        }

        return array_keys( $slots );
    }

    private function sourceConfigurationAvailable( $slot_key, $source_ref, $inventory ) {
        if ( ! is_array( $source_ref ) || empty( $source_ref['type'] ) ) {
            return false;
        }

        if ( 'gravity_forms.field' === $source_ref['type'] ) {
            $field_id = isset( $source_ref['field_id'] ) ? (string) $source_ref['field_id'] : '';
            return '' !== $field_id && isset( $inventory['fields'][ $field_id ] );
        }

        if ( 'entry.created_at' === $slot_key ) {
            return $this->sameSource( $source_ref, self::HOST_SOURCES['entry.created_at'] ) && $this->hostSeamAvailable( $slot_key );
        }

        if ( 'workflow.current_step' === $slot_key ) {
            return $this->sameSource( $source_ref, self::HOST_SOURCES['workflow.current_step'] ) && $this->hostSeamAvailable( $slot_key );
        }

        return false;
    }

    private function hostSeamAvailable( $slot_key ) {
        if ( 'entry.created_at' === $slot_key ) {
            return class_exists( 'GFAPI' ) && method_exists( 'GFAPI', 'get_entry' );
        }

        if ( 'workflow.current_step' === $slot_key ) {
            return class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_current_step' );
        }

        return false;
    }

    private function setAvailabilityClaim( &$artifact, $semantic_slot_key, $proven, $evidence_ref ) {
        $claim = array(
            'semantic_slot_key' => $semantic_slot_key,
            'claim' => 'availability',
            'evidence_state' => $proven ? 'PROVEN' : 'NOT_PROVEN',
            'evidence_refs' => $proven ? array( $evidence_ref ) : array(),
        );

        foreach ( $artifact['runtime_claims'] as $index => $existing ) {
            if ( $semantic_slot_key === $existing['semantic_slot_key'] && 'availability' === $existing['claim'] ) {
                $artifact['runtime_claims'][ $index ] = $claim;
                return;
            }
        }

        $artifact['runtime_claims'][] = $claim;
    }

    private function bindingIndex( $artifact, $semantic_slot_key ) {
        foreach ( $artifact['bindings'] as $index => $binding ) {
            if ( $semantic_slot_key === $binding['semantic_slot_key'] ) {
                return $index;
            }
        }

        throw new LifecycleException( 'inbox_semantic_slot_missing', 'A required Inbox semantic is absent from the active EnvironmentBindingSet.' );
    }

    private function sameSource( $left, $right ) {
        if ( ! is_array( $left ) || ! is_array( $right ) ) {
            return false;
        }
        try {
            return CanonicalJson::encode( $left ) === CanonicalJson::encode( $right );
        } catch ( \Throwable $exception ) {
            return false;
        }
    }

    private function nextVersion( $snapshot, $binding_set_id, $current_version ) {
        $parts = array_map( 'intval', explode( '.', $current_version ) );
        if ( 3 !== count( $parts ) ) {
            throw new LifecycleException( 'inbox_binding_version_invalid', 'The active binding version is not semantic x.y.z.' );
        }

        $patch = $parts[2] + 1;
        do {
            $candidate = $parts[0] . '.' . $parts[1] . '.' . $patch;
            $patch++;
        } while ( isset( $snapshot['installed'][ $binding_set_id ][ $candidate ] ) );

        return $candidate;
    }
}
