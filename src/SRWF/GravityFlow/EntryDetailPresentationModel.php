<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

/**
 * Pure semantic resolver for the SRWF native Gravity Flow Entry Detail surface.
 *
 * Visual profile identity is fixed at construction time. Environment bindings
 * may locate host-owned values/regions/actions, but never select a profile or
 * imply availability, editability, authorization, or workflow permission.
 */
final class EntryDetailPresentationModel {
    const SURFACE = 'gravity_flow.entry_detail';

    private $profile;
    private $binding_sets;
    private $resolver;
    private $required_slots;

    public function __construct( $profile, $binding_sets, $semantic_slot_declarations ) {
        if ( ! is_array( $profile ) || ! isset( $profile['surface'], $profile['profile_id'], $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Entry Detail presentation requires one resolved surface profile.' );
        }
        if ( self::SURFACE !== $profile['surface'] || ! is_array( $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Entry Detail presentation profile must target gravity_flow.entry_detail.' );
        }
        if ( ! is_array( $binding_sets ) ) {
            throw new ContractViolation( 'Entry Detail presentation binding sets must be an array.' );
        }
        if ( ! is_array( $semantic_slot_declarations ) ) {
            throw new ContractViolation( 'Entry Detail presentation requires semantic-slot declarations from the active visual package.' );
        }

        $this->profile        = $profile;
        $this->binding_sets   = array_values( $binding_sets );
        $this->required_slots = $this->requiredSlotsFromPackage( $semantic_slot_declarations );
        $this->resolver       = new SemanticBindingResolver( $this->binding_sets, $profile['semantic_slots'] );
    }

    public function profileId() {
        return $this->profile['profile_id'];
    }

    public function profile() {
        return $this->profile;
    }

    public function requiredSemanticSlotKeys() {
        return $this->required_slots;
    }

    /**
     * A presentation projection is ready only when every package-required
     * semantic resolves through an independently PROVEN availability claim.
     */
    public function isPresentationReady( $entry ) {
        foreach ( $this->required_slots as $slot_key ) {
            $resolved = $this->resolve( $entry, $slot_key );
            if ( empty( $resolved['resolved'] ) || 'PROVEN' !== $resolved['state'] || empty( $resolved['source_ref'] ) ) {
                return false;
            }
        }

        return true;
    }

    public function resolve( $entry, $slot_key ) {
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

        if ( empty( $resolved['resolved'] ) || empty( $resolved['binding_set_id'] ) ) {
            return $resolved;
        }

        if ( ! $this->runtimeClaimIsProvenForBindingSet( $resolved['binding_set_id'], $slot_key, 'availability', $entry, $installation_id ) ) {
            return $this->failResolved( $resolved, 'availability_not_proven' );
        }

        if ( ! $this->sourceAdapterIsAdmittedForSlot( $slot_key, $resolved['source_ref'] ) ) {
            return $this->failResolved( $resolved, 'source_adapter_not_admitted' );
        }

        return $resolved;
    }

    /**
     * Runtime claims remain separate from semantic source resolution. In
     * particular, callers must never infer editability/action permission from
     * a PROVEN binding alone.
     */
    public function runtimeClaimIsProven( $entry, $slot_key, $claim ) {
        $resolved = $this->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['binding_set_id'] ) ) {
            return false;
        }

        $installation_id = $this->installationIdForEntry( $entry );
        if ( null === $installation_id ) {
            return false;
        }

        return $this->runtimeClaimIsProvenForBindingSet(
            $resolved['binding_set_id'],
            $slot_key,
            $claim,
            $entry,
            $installation_id
        );
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
            throw new ContractViolation( 'Active Entry Detail visual package declares no required semantic readiness contract.' );
        }

        return array_keys( $required );
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

    private function runtimeClaimIsProvenForBindingSet( $binding_set_id, $slot_key, $claim, $entry, $installation_id ) {
        foreach ( $this->binding_sets as $binding_set ) {
            if ( $binding_set_id !== $binding_set['binding_set_id'] || ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
                continue;
            }
            if ( $binding_set['context']['installation_source_ref']['installation_id'] !== $installation_id ) {
                continue;
            }

            foreach ( $binding_set['runtime_claims'] as $runtime_claim ) {
                if ( $slot_key === $runtime_claim['semantic_slot_key'] && $claim === $runtime_claim['claim'] ) {
                    return 'PROVEN' === $runtime_claim['evidence_state'];
                }
            }
        }

        return false;
    }

    private function sourceAdapterIsAdmittedForSlot( $slot_key, $source_ref ) {
        if ( ! is_array( $source_ref ) || empty( $source_ref['type'] ) ) {
            return false;
        }

        $exact = array(
            'workflow.current_step' => array( 'type' => 'gravity_flow.state', 'key' => 'state_key', 'value' => 'current_step' ),
            'workflow.status' => array( 'type' => 'gravity_flow.state', 'key' => 'state_key', 'value' => 'status' ),
            'workflow.instructions' => array( 'type' => 'gravity_flow.region', 'key' => 'region_key', 'value' => 'instructions' ),
            'workflow.timeline' => array( 'type' => 'gravity_flow.region', 'key' => 'region_key', 'value' => 'timeline' ),
            'navigation.backlink' => array( 'type' => 'gravity_flow.region', 'key' => 'region_key', 'value' => 'backlink' ),
            'workflow.approve_action' => array( 'type' => 'gravity_flow.action', 'key' => 'action_key', 'value' => 'approve' ),
            'workflow.reject_action' => array( 'type' => 'gravity_flow.action', 'key' => 'action_key', 'value' => 'reject' ),
            'entry.created_at' => array( 'type' => 'gravity_forms.entry_meta', 'key' => null, 'value' => null ),
        );

        if ( isset( $exact[ $slot_key ] ) ) {
            $rule = $exact[ $slot_key ];
            if ( $rule['type'] !== $source_ref['type'] ) {
                return false;
            }
            if ( null === $rule['key'] ) {
                return true;
            }
            return isset( $source_ref[ $rule['key'] ] ) && $rule['value'] === $source_ref[ $rule['key'] ];
        }

        // Dossier facts/documents are host-owned Gravity Forms field values.
        return 0 === strpos( $slot_key, 'student.' )
            || 0 === strpos( $slot_key, 'education.' )
            || 0 === strpos( $slot_key, 'school.' )
            || 0 === strpos( $slot_key, 'registration.' )
            || 0 === strpos( $slot_key, 'documents.' )
            || 0 === strpos( $slot_key, 'review.' )
            || 0 === strpos( $slot_key, 'finance.' )
            ? 'gravity_forms.field' === $source_ref['type']
            : false;
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
            'semantic_slot_key' => $slot_key,
            'state' => 'NOT_PROVEN',
            'source_ref' => null,
            'reason' => $reason,
        );
    }
}
