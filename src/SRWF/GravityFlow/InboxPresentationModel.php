<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

/**
 * Pure presentation-side semantic resolver for the SRWF Gravity Flow Inbox.
 *
 * The visual profile is fixed at construction time. Binding selection is
 * environment-only and can never select or replace the visual profile.
 */
final class InboxPresentationModel {
    const SURFACE = 'gravity_flow.inbox';

    private $profile;
    private $binding_sets;
    private $resolver;
    private $required_slots;
    private $required_source_slots;

    public function __construct( $profile, $binding_sets, $semantic_slot_declarations ) {
        if ( ! is_array( $profile ) || ! isset( $profile['surface'], $profile['profile_id'], $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Inbox presentation requires one resolved surface profile.' );
        }
        if ( self::SURFACE !== $profile['surface'] || ! is_array( $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Inbox presentation profile must target gravity_flow.inbox.' );
        }
        if ( ! is_array( $binding_sets ) ) {
            throw new ContractViolation( 'Inbox presentation binding sets must be an array.' );
        }
        if ( ! is_array( $semantic_slot_declarations ) ) {
            throw new ContractViolation( 'Inbox presentation requires semantic-slot declarations from the active visual package.' );
        }

        $this->profile               = $profile;
        $this->binding_sets          = array_values( $binding_sets );
        $this->required_slots        = $this->requiredSlotsFromPackage( $semantic_slot_declarations );
        $this->required_source_slots = $this->requiredSourceSlots( $this->required_slots );
        $this->resolver              = new SemanticBindingResolver(
            $this->binding_sets,
            array_values( array_unique( array_merge( $profile['semantic_slots'], $this->required_source_slots ) ) )
        );
    }

    public function profileId() {
        return $this->profile['profile_id'];
    }

    public function profile() {
        return $this->profile;
    }

    /**
     * Required Inbox semantics are owned by the active visual package contract.
     * Optional catalog slots such as workflow.due_at remain resolvable/displayable
     * when proven, but do not participate in mandatory Card Mode readiness.
     */
    public function requiredSemanticSlotKeys() {
        return $this->required_slots;
    }

    /**
     * Exact authoritative source slots needed to satisfy the required semantic
     * contract. Derived slots expand to their canonical components instead of
     * introducing a duplicate host source.
     */
    public function requiredSourceSemanticSlotKeys() {
        return $this->required_source_slots;
    }

    public function isDerivedSlot( $slot_key ) {
        return array() !== OperationsBindingManagementPolicy::derivationComponents( $slot_key );
    }

    /**
     * Read-only presentation derivation. Every component must be independently
     * bound and source-bound availability-proven in the same active environment.
     */
    public function derivedDecision( $entry, $slot_key ) {
        $components = OperationsBindingManagementPolicy::derivationComponents( $slot_key );
        if ( array() === $components ) {
            return array(
                'ready' => false,
                'reason' => 'slot_is_not_derived',
                'semantic_slot_key' => $slot_key,
                'component_source_refs' => array(),
            );
        }

        $sources = array();
        $binding_set_id = null;
        $binding_set_version = null;

        foreach ( $components as $component ) {
            $resolved = $this->resolve( $entry, $component );
            if ( empty( $resolved['resolved'] ) || 'PROVEN' !== $resolved['state'] || empty( $resolved['source_ref'] ) ) {
                return array(
                    'ready' => false,
                    'reason' => 'derivation_component_unresolved',
                    'semantic_slot_key' => $component,
                    'component_source_refs' => array(),
                );
            }

            if ( null === $binding_set_id ) {
                $binding_set_id = $resolved['binding_set_id'];
                $binding_set_version = $resolved['binding_set_version'];
            } elseif ( $binding_set_id !== $resolved['binding_set_id'] || $binding_set_version !== $resolved['binding_set_version'] ) {
                return array(
                    'ready' => false,
                    'reason' => 'derivation_component_context_mismatch',
                    'semantic_slot_key' => $component,
                    'component_source_refs' => array(),
                );
            }

            $sources[ $component ] = $resolved['source_ref'];
        }

        return array(
            'ready' => true,
            'reason' => null,
            'semantic_slot_key' => $slot_key,
            'component_source_refs' => $sources,
            'binding_set_id' => $binding_set_id,
            'binding_set_version' => $binding_set_version,
        );
    }

    /**
     * Returns the exact decision made by the production readiness loop so
     * diagnostics can observe it without re-simulating semantic resolution.
     */
    public function presentationReadiness( $entry ) {
        foreach ( $this->required_slots as $slot_key ) {
            if ( $this->isDerivedSlot( $slot_key ) ) {
                $derived = $this->derivedDecision( $entry, $slot_key );
                if ( empty( $derived['ready'] ) ) {
                    return array(
                        'ready' => false,
                        'reason' => $derived['reason'],
                        'semantic_slot_key' => $derived['semantic_slot_key'],
                    );
                }
                continue;
            }

            $resolved = $this->resolve( $entry, $slot_key );
            if ( empty( $resolved['resolved'] ) || 'PROVEN' !== $resolved['state'] || empty( $resolved['source_ref'] ) ) {
                return array(
                    'ready' => false,
                    'reason' => isset( $resolved['reason'] ) && is_string( $resolved['reason'] ) ? $resolved['reason'] : 'binding_not_proven',
                    'semantic_slot_key' => $slot_key,
                );
            }
        }

        return array( 'ready' => true, 'reason' => null, 'semantic_slot_key' => null );
    }

    public function isPresentationReady( $entry ) {
        $decision = $this->presentationReadiness( $entry );
        return true === $decision['ready'];
    }

    /**
     * Resolve one host-backed semantic only. Presentation-derived semantics are
     * intentionally rejected here so no direct student.full_name source can be
     * mistaken for authority.
     */
    public function resolve( $entry, $slot_key ) {
        if ( $this->isDerivedSlot( $slot_key ) ) {
            return $this->unresolved( $slot_key, 'derived_slot_requires_derivation' );
        }

        if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
            return $this->unresolved( $slot_key, 'invalid_entry' );
        }

        $installation_id = $this->installationIdForEntry( $entry );
        if ( null === $installation_id ) {
            return $this->unresolved( $slot_key, 'missing_or_ambiguous_active_environment' );
        }

        $resolved = $this->resolver->resolve(
            array(
                'installation_id' => $installation_id,
                'form_id' => (int) $entry['form_id'],
                'entry_id' => (int) $entry['id'],
                'surface' => self::SURFACE,
            ),
            $slot_key
        );

        if ( empty( $resolved['resolved'] ) || empty( $resolved['binding_set_id'] ) || empty( $resolved['binding_set_version'] ) ) {
            return $resolved;
        }

        if ( ! $this->availabilityIsProven( $resolved, $slot_key, $entry, $installation_id ) ) {
            return $this->failResolved( $resolved, 'availability_not_proven' );
        }

        if ( ! $this->sourceAdapterIsAdmitted( $slot_key, $resolved['source_ref'] ) ) {
            return $this->failResolved( $resolved, 'source_adapter_not_admitted' );
        }

        return $resolved;
    }

    private function requiredSlotsFromPackage( $semantic_slot_declarations ) {
        $required = array();

        foreach ( $semantic_slot_declarations as $declaration ) {
            if ( ! is_array( $declaration ) || empty( $declaration['semantic_slot_key'] ) || ! isset( $declaration['surface_usage'] ) || ! is_array( $declaration['surface_usage'] ) ) {
                throw new ContractViolation( 'Active visual package contains an invalid semantic-slot declaration.' );
            }

            foreach ( $declaration['surface_usage'] as $usage ) {
                if ( ! is_array( $usage ) || ! isset( $usage['surface'], $usage['required'] ) ) {
                    throw new ContractViolation( 'Active visual package contains invalid semantic surface usage.' );
                }

                if ( self::SURFACE === $usage['surface'] && true === $usage['required'] ) {
                    $required[ $declaration['semantic_slot_key'] ] = true;
                }
            }
        }

        if ( array() === $required ) {
            throw new ContractViolation( 'Active Inbox visual package declares no required semantic readiness contract.' );
        }

        return array_keys( $required );
    }

    private function requiredSourceSlots( $required_slots ) {
        $sources = array();
        foreach ( $required_slots as $slot_key ) {
            $components = OperationsBindingManagementPolicy::derivationComponents( $slot_key );
            if ( array() !== $components ) {
                foreach ( $components as $component ) {
                    $sources[ $component ] = true;
                }
                continue;
            }
            $sources[ $slot_key ] = true;
        }
        return array_keys( $sources );
    }

    private function installationIdForEntry( $entry ) {
        $ids = array();

        foreach ( $this->binding_sets as $binding_set ) {
            if ( ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
                continue;
            }

            $installation_id = $binding_set['context']['installation_source_ref']['installation_id'];
            $ids[ (string) $installation_id ] = $installation_id;
        }

        return 1 === count( $ids ) ? reset( $ids ) : null;
    }

    /**
     * A PROVEN bit is not enough: the evidence ref must match the exact active
     * binding-set identity/version and exact resolved source. This makes copied
     * or stale proof fail closed after a remap/version change.
     */
    private function availabilityIsProven( $resolved, $slot_key, $entry, $installation_id ) {
        foreach ( $this->binding_sets as $binding_set ) {
            if ( $resolved['binding_set_id'] !== $binding_set['binding_set_id']
                || $resolved['binding_set_version'] !== $binding_set['binding_set_version']
                || ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
                continue;
            }
            if ( $binding_set['context']['installation_source_ref']['installation_id'] !== $installation_id ) {
                continue;
            }

            $expected_ref = InboxRuntimeEvidence::availabilityRef( $binding_set, $slot_key, $resolved['source_ref'] );
            foreach ( $binding_set['runtime_claims'] as $claim ) {
                if ( $slot_key === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
                    return 'PROVEN' === $claim['evidence_state']
                        && in_array( $expected_ref, $claim['evidence_refs'], true );
                }
            }
        }

        return false;
    }

    private function sourceAdapterIsAdmitted( $slot_key, $source_ref ) {
        if ( ! is_array( $source_ref ) || empty( $source_ref['type'] ) ) {
            return false;
        }

        if ( 'gravity_forms.field' === $source_ref['type'] ) {
            return true;
        }

        if ( 'entry.created_at' === $slot_key && 'gravity_forms.entry_meta' === $source_ref['type'] ) {
            return isset( $source_ref['meta_key'] ) && 'date_created' === $source_ref['meta_key'];
        }

        return 'workflow.current_step' === $slot_key
            && 'gravity_flow.state' === $source_ref['type']
            && isset( $source_ref['state_key'] )
            && 'current_step' === $source_ref['state_key'];
    }

    private function bindingSetMatchesEntry( $binding_set, $entry ) {
        if ( ! is_array( $binding_set ) || empty( $binding_set['context'] ) ) {
            return false;
        }

        $context = $binding_set['context'];
        if ( (string) $context['form_source_ref']['form_id'] !== (string) $entry['form_id'] ) {
            return false;
        }
        if ( ! in_array( self::SURFACE, $context['surfaces'], true ) ) {
            return false;
        }

        $entry_ref = $context['entry_source_ref'];
        return null === $entry_ref || (string) $entry_ref['entry_id'] === (string) $entry['id'];
    }

    private function failResolved( $resolved, $reason ) {
        $resolved['resolved']   = false;
        $resolved['state']      = 'NOT_PROVEN';
        $resolved['source_ref'] = null;
        $resolved['reason']     = $reason;

        return $resolved;
    }

    private function unresolved( $slot_key, $reason ) {
        return array(
            'resolved' => false,
            'binding_set_id' => null,
            'binding_set_version' => null,
            'semantic_slot_key' => $slot_key,
            'state' => 'NOT_PROVEN',
            'source_ref' => null,
            'reason' => $reason,
        );
    }
}
