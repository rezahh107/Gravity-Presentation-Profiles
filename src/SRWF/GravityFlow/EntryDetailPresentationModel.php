<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

/**
 * Semantic/readiness model for the native Gravity Flow Entry Detail surface.
 *
 * The Operations Package declares presentation meanings, but those meanings do
 * not all have the same authority shape. Direct fields resolve from the active
 * EnvironmentBindingSet, derived values expand to canonical components, stable
 * host state uses admitted host APIs, request-local regions/actions are checked
 * live, and print.utility is owned by the existing Print runtime capability.
 */
final class EntryDetailPresentationModel {
    const SURFACE = 'gravity_flow.entry_detail';

    private $profile;
    private $binding_sets;
    private $resolver;
    private $required_slots;
    private $required_source_slots;

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

    public function requiredSemanticSlotKeys() {
        return $this->required_slots;
    }

    public function requiredSourceSemanticSlotKeys() {
        return $this->required_source_slots;
    }

    public function isDerivedSlot( $slot_key ) {
        return OperationsBindingManagementPolicy::ENTRY_DETAIL_DERIVED === OperationsBindingManagementPolicy::entryDetailReadinessKind( $slot_key );
    }

    public function derivationComponents( $slot_key ) {
        return OperationsBindingManagementPolicy::derivationComponents( $slot_key );
    }

    /**
     * Read-only presentation derivation. Every canonical component must resolve
     * independently from the same active binding identity/version. A direct
     * student.full_name binding is intentionally never consulted.
     */
    public function derivedDecision( $entry, $slot_key ) {
        $components = $this->derivationComponents( $slot_key );
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

            $version = isset( $resolved['binding_set_version'] ) ? $resolved['binding_set_version'] : null;
            if ( null === $binding_set_id ) {
                $binding_set_id = $resolved['binding_set_id'];
                $binding_set_version = $version;
            } elseif ( $binding_set_id !== $resolved['binding_set_id'] || $binding_set_version !== $version ) {
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
     * Structural readiness only.
     *
     * $capabilities contains stable host/GPP capability facts, never
     * request-local action authorization. Current Approval assignment is checked
     * separately at the live Entry Detail request boundary.
     */
    public function presentationReadiness( $entry, $capabilities ) {
        if ( ! is_array( $capabilities ) ) {
            throw new ContractViolation( 'Entry Detail readiness requires a capability map.' );
        }

        foreach ( $this->required_slots as $slot_key ) {
            $kind = OperationsBindingManagementPolicy::entryDetailReadinessKind( $slot_key );

            if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_DERIVED === $kind ) {
                $derived = $this->derivedDecision( $entry, $slot_key );
                if ( empty( $derived['ready'] ) ) {
                    return $this->failedReadiness(
                        $derived['semantic_slot_key'],
                        $derived['reason']
                    );
                }
                continue;
            }

            if ( in_array( $kind, array(
                OperationsBindingManagementPolicy::ENTRY_DETAIL_DIRECT_SOURCE,
                OperationsBindingManagementPolicy::ENTRY_DETAIL_STABLE_HOST_SOURCE,
            ), true ) ) {
                $resolved = $this->resolve( $entry, $slot_key );
                if ( empty( $resolved['resolved'] ) || 'PROVEN' !== $resolved['state'] || empty( $resolved['source_ref'] ) ) {
                    return $this->failedReadiness(
                        $slot_key,
                        isset( $resolved['reason'] ) && is_string( $resolved['reason'] ) ? $resolved['reason'] : 'binding_not_proven'
                    );
                }

                if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_STABLE_HOST_SOURCE === $kind
                    && empty( $capabilities[ $slot_key ] ) ) {
                    return $this->failedReadiness( $slot_key, 'stable_host_capability_unavailable' );
                }
                continue;
            }

            if ( in_array( $kind, array(
                OperationsBindingManagementPolicy::ENTRY_DETAIL_REQUEST_REGION,
                OperationsBindingManagementPolicy::ENTRY_DETAIL_REQUEST_ACTION,
                OperationsBindingManagementPolicy::ENTRY_DETAIL_GPP_CAPABILITY,
            ), true ) ) {
                if ( empty( $capabilities[ $slot_key ] ) ) {
                    $reason = OperationsBindingManagementPolicy::ENTRY_DETAIL_GPP_CAPABILITY === $kind
                        ? 'required_gpp_capability_unavailable'
                        : 'stable_host_capability_unavailable';
                    return $this->failedReadiness( $slot_key, $reason );
                }
                continue;
            }

            return $this->failedReadiness( $slot_key, 'semantic_readiness_kind_unknown' );
        }

        return array( 'ready' => true, 'reason' => null, 'semantic_slot_key' => null );
    }

    public function isPresentationReady( $entry, $capabilities ) {
        $decision = $this->presentationReadiness( $entry, $capabilities );
        return true === $decision['ready'];
    }

    /**
     * Resolve host-backed semantics only. Derived/request-local/capability
     * meanings deliberately have no independent EnvironmentBindingSet source.
     */
    public function resolve( $entry, $slot_key ) {
        $kind = OperationsBindingManagementPolicy::entryDetailReadinessKind( $slot_key );
        if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_DERIVED === $kind ) {
            return $this->unresolved( $slot_key, 'derived_slot_requires_derivation' );
        }
        if ( in_array( $kind, array(
            OperationsBindingManagementPolicy::ENTRY_DETAIL_REQUEST_REGION,
            OperationsBindingManagementPolicy::ENTRY_DETAIL_REQUEST_ACTION,
        ), true ) ) {
            return $this->unresolved( $slot_key, 'request_local_semantic_has_no_persisted_source' );
        }
        if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_GPP_CAPABILITY === $kind ) {
            return $this->unresolved( $slot_key, 'gpp_capability_has_no_host_source' );
        }
        if ( null === $kind ) {
            return $this->unresolved( $slot_key, 'semantic_readiness_kind_unknown' );
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

        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return $resolved;
        }

        if ( ! $this->sourceAdapterIsAdmitted( $slot_key, $resolved['source_ref'] ) ) {
            return $this->failResolved( $resolved, 'source_adapter_not_admitted' );
        }

        return $resolved;
    }

    /**
     * Retained for source-bound legacy consumers only. Request-local action
     * semantics no longer resolve through this model, so stale
     * action_permission=PROVEN claims have zero admission power.
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

    private function requiredSourceSlots( $required_slots ) {
        $sources = array();

        foreach ( $required_slots as $slot_key ) {
            $kind = OperationsBindingManagementPolicy::entryDetailReadinessKind( $slot_key );
            if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_DERIVED === $kind ) {
                foreach ( $this->derivationComponents( $slot_key ) as $component ) {
                    $sources[ $component ] = true;
                }
                continue;
            }
            if ( in_array( $kind, array(
                OperationsBindingManagementPolicy::ENTRY_DETAIL_DIRECT_SOURCE,
                OperationsBindingManagementPolicy::ENTRY_DETAIL_STABLE_HOST_SOURCE,
            ), true ) ) {
                $sources[ $slot_key ] = true;
            }
        }

        return array_keys( $sources );
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

    private function sourceAdapterIsAdmitted( $slot_key, $source_ref ) {
        if ( ! is_array( $source_ref ) || empty( $source_ref['type'] ) ) {
            return false;
        }

        $kind = OperationsBindingManagementPolicy::entryDetailReadinessKind( $slot_key );
        if ( OperationsBindingManagementPolicy::ENTRY_DETAIL_DIRECT_SOURCE === $kind ) {
            return 'gravity_forms.field' === $source_ref['type']
                && isset( $source_ref['field_id'] )
                && '' !== (string) $source_ref['field_id'];
        }

        if ( 'entry.created_at' === $slot_key ) {
            return 'gravity_forms.entry_meta' === $source_ref['type']
                && isset( $source_ref['meta_key'] )
                && 'date_created' === $source_ref['meta_key'];
        }

        if ( 'workflow.current_step' === $slot_key || 'workflow.status' === $slot_key ) {
            return 'gravity_flow.state' === $source_ref['type']
                && isset( $source_ref['state_key'] )
                && ( 'workflow.current_step' === $slot_key ? 'current_step' : 'status' ) === $source_ref['state_key'];
        }

        return false;
    }

    private function failedReadiness( $slot_key, $reason ) {
        return array(
            'ready' => false,
            'reason' => $reason,
            'semantic_slot_key' => $slot_key,
        );
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
