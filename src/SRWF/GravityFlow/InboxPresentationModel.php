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

    public function __construct( $profile, $binding_sets ) {
        if ( ! is_array( $profile ) || ! isset( $profile['surface'], $profile['profile_id'], $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Inbox presentation requires one resolved surface profile.' );
        }
        if ( self::SURFACE !== $profile['surface'] || ! is_array( $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Inbox presentation profile must target gravity_flow.inbox.' );
        }
        if ( ! is_array( $binding_sets ) ) {
            throw new ContractViolation( 'Inbox presentation binding sets must be an array.' );
        }

        $this->profile      = $profile;
        $this->binding_sets = array_values( $binding_sets );
        $this->resolver     = new SemanticBindingResolver( $this->binding_sets, $profile['semantic_slots'] );
    }

    public function profileId() {
        return $this->profile['profile_id'];
    }

    public function profile() {
        return $this->profile;
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

        if ( ! $this->availabilityIsProven( $resolved['binding_set_id'], $slot_key, $entry, $installation_id ) ) {
            return $this->failResolved( $resolved, 'availability_not_proven' );
        }

        // A PROVEN semantic binding is necessary but not sufficient to call an
        // arbitrary host API. WU17 only admits source adapters already covered
        // by the portable contract/WU21 runtime evidence. Unknown state readers
        // fail closed until a later evidence unit admits them explicitly.
        if ( ! $this->sourceAdapterIsAdmitted( $resolved['source_ref'] ) ) {
            return $this->failResolved( $resolved, 'source_adapter_not_admitted' );
        }

        return $resolved;
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

    private function availabilityIsProven( $binding_set_id, $slot_key, $entry, $installation_id ) {
        foreach ( $this->binding_sets as $binding_set ) {
            if ( $binding_set_id !== $binding_set['binding_set_id'] || ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
                continue;
            }
            if ( $binding_set['context']['installation_source_ref']['installation_id'] !== $installation_id ) {
                continue;
            }

            foreach ( $binding_set['runtime_claims'] as $claim ) {
                if ( $slot_key === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
                    return 'PROVEN' === $claim['evidence_state'];
                }
            }
        }

        return false;
    }

    private function sourceAdapterIsAdmitted( $source_ref ) {
        if ( ! is_array( $source_ref ) || empty( $source_ref['type'] ) ) {
            return false;
        }

        if ( 'gravity_forms.field' === $source_ref['type'] || 'gravity_forms.entry_meta' === $source_ref['type'] ) {
            return true;
        }

        return 'gravity_flow.state' === $source_ref['type']
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
            'semantic_slot_key' => $slot_key,
            'state' => 'NOT_PROVEN',
            'source_ref' => null,
            'reason' => $reason,
        );
    }
}
