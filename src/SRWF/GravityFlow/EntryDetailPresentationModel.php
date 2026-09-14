<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

/**
 * Semantic/readiness model for the native Gravity Flow Entry Detail surface.
 *
 * Visual profile selection is surface-only. Environment binding selection is
 * independent and never changes the resolved visual profile. Runtime claims
 * are consulted separately from semantic source bindings.
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
            throw new ContractViolation( 'Entry Detail presentation requires binding sets and semantic declarations.' );
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
     * Required package mappings must all be independently PROVEN. Availability,
     * editability and permission are deliberately not inferred here; those are
     * separate runtime facts and fail closed at their smallest presentation use.
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

        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return $resolved;
        }

        if ( ! $this->sourceAdapterIsAdmitted( $resolved['source_ref'] ) ) {
            return $this->failResolved( $resolved, 'source_adapter_not_admitted' );
        }

        return $resolved;
    }

    public function runtimeClaimIsProven( $entry, $slot_key, $claim ) {
        $resolved = $this->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['binding_set_id'] ) ) {
            return false;
        }

        $installation_id = $this->installationIdForEntry( $entry );
        if ( null === $installation_id ) {
            return false;
        }

        foreach ( $this->binding_sets as $binding_set ) {
            if ( $resolved['binding_set_id'] !== $binding_set['binding_set_id'] || ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
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

    public function isAvailable( $entry, $slot_key ) {
        return $this->runtimeClaimIsProven( $entry, $slot_key, 'availability' );
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
            throw new ContractViolation( 'Active Entry Detail package declares no required semantic readiness contract.' );
        }

        return array_keys( $required );
    }

    private function installationIdForEntry( $entry ) {
        if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
            return null;
        }

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
        if ( ! is_array( $binding_set ) || empty( $binding_set['context'] ) || ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
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

        if ( 'gravity_forms.field' === $source_ref['type'] || 'gravity_forms.entry_meta' === $source_ref['type'] ) {
            return true;
        }

        if ( 'gravity_flow.state' === $source_ref['type'] ) {
            return isset( $source_ref['state_key'] ) && in_array( $source_ref['state_key'], array( 'current_step', 'status' ), true );
        }

        if ( 'gravity_flow.region' === $source_ref['type'] ) {
            return isset( $source_ref['region_key'] ) && in_array( $source_ref['region_key'], array( 'instructions', 'timeline', 'backlink' ), true );
        }

        if ( 'gravity_flow.action' === $source_ref['type'] ) {
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
