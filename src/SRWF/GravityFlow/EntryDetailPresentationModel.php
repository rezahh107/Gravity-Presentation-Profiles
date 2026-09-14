<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

/**
 * Pure semantic/readiness model for the native Gravity Flow Entry Detail.
 *
 * The visual profile is fixed per surface. Binding selection is environment-only;
 * runtime claims prove facts about a resolved source but never authorize host UI.
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
        if ( ! is_array( $binding_sets ) || ! is_array( $semantic_slot_declarations ) ) {
            throw new ContractViolation( 'Entry Detail presentation requires binding sets and semantic-slot declarations.' );
        }

        $this->profile        = $profile;
        $this->binding_sets   = array_values( $binding_sets );
        $this->required_slots = $this->requiredSlotsFromPackage( $semantic_slot_declarations );
        $this->resolver       = new SemanticBindingResolver( $this->binding_sets, $profile['semantic_slots'] );
    }

    public function profileId() {
        return $this->profile['profile_id'];
    }

    public function requiredSemanticSlotKeys() {
        return $this->required_slots;
    }

    /**
     * Required package semantics must have an independently admitted source.
     * Per-request availability/action/editability remains a separate runtime fact.
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
        if ( ! $this->sourceAdapterIsAdmitted( $resolved['source_ref'] ) ) {
            return $this->failResolved( $resolved, 'source_adapter_not_admitted' );
        }

        return $resolved;
    }

    /**
     * Resolve a read-only value/region only when runtime availability is PROVEN.
     * An editability claim is intentionally ignored here.
     */
    public function resolveAvailable( $entry, $slot_key ) {
        $resolved = $this->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) ) {
            return $resolved;
        }
        if ( ! $this->runtimeClaimIsProven( $resolved['binding_set_id'], $slot_key, 'availability', $entry ) ) {
            return $this->failResolved( $resolved, 'availability_not_proven' );
        }
        return $resolved;
    }

    /**
     * Resolve host-owned action semantics only when action permission is PROVEN.
     * This never creates or authorizes an action; the host must still render it.
     */
    public function resolveAction( $entry, $slot_key, $action_key ) {
        $resolved = $this->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) ) {
            return $resolved;
        }
        $source = $resolved['source_ref'];
        if ( 'gravity_flow.action' !== $source['type'] || ! isset( $source['action_key'] ) || $action_key !== $source['action_key'] ) {
            return $this->failResolved( $resolved, 'action_source_mismatch' );
        }
        if ( ! $this->runtimeClaimIsProven( $resolved['binding_set_id'], $slot_key, 'action_permission', $entry ) ) {
            return $this->failResolved( $resolved, 'action_permission_not_proven' );
        }
        return $resolved;
    }

    public function hostRegionIsProven( $entry, $slot_key, $region_key ) {
        $resolved = $this->resolveAvailable( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) ) {
            return false;
        }
        $source = $resolved['source_ref'];
        if ( 'gravity_flow.region' !== $source['type'] || ! isset( $source['region_key'] ) || $region_key !== $source['region_key'] ) {
            return false;
        }
        return $this->runtimeClaimIsProven( $resolved['binding_set_id'], $slot_key, 'host_seam', $entry );
    }

    public function runtimeClaimIsProven( $binding_set_id, $slot_key, $claim, $entry ) {
        foreach ( $this->binding_sets as $binding_set ) {
            if ( ! is_array( $binding_set ) || $binding_set_id !== $binding_set['binding_set_id'] || ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
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

    private function sourceAdapterIsAdmitted( $source_ref ) {
        if ( ! is_array( $source_ref ) || empty( $source_ref['type'] ) ) {
            return false;
        }
        switch ( $source_ref['type'] ) {
            case 'gravity_forms.field':
                return isset( $source_ref['field_id'] );
            case 'gravity_forms.entry_meta':
                return ! empty( $source_ref['meta_key'] );
            case 'gravity_flow.state':
                return isset( $source_ref['state_key'] ) && in_array( $source_ref['state_key'], array( 'current_step', 'due_at', 'status' ), true );
            case 'gravity_flow.region':
                return isset( $source_ref['region_key'] ) && in_array( $source_ref['region_key'], array( 'instructions', 'timeline', 'backlink' ), true );
            case 'gravity_flow.action':
                return isset( $source_ref['action_key'] ) && in_array( $source_ref['action_key'], array( 'approve', 'reject' ), true );
        }
        return false;
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
