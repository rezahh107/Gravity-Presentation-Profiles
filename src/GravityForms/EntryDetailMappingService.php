<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;

/**
 * Read model for the Owner-facing Entry Detail mapping workflow.
 *
 * The active visual lifecycle is the only profile authority. Field mappings
 * remain owned by the active EnvironmentBindingSet and real host field
 * inventory. This service is deliberately read-only: suggestions never mutate
 * lifecycle state.
 */
final class EntryDetailMappingService {
    const SURFACE = 'gravity_flow.entry_detail';

    private $bindings;
    private $visual;
    private $inventory;

    public function __construct( BindingSetLifecycle $bindings, VisualPackageLifecycle $visual, GravityFormsFieldInventory $inventory ) {
        $this->bindings  = $bindings;
        $this->visual    = $visual;
        $this->inventory = $inventory;
    }

    public static function forWordPress() {
        return new self(
            new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            ),
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            new GravityFormsFieldInventory()
        );
    }

    public function workflowFacts() {
        $profile = $this->activeProfileContract();
        $state   = $this->bindings->snapshot();
        $contexts = array();

        foreach ( $state['activations'] as $context_key => $activation ) {
            if ( empty( $activation['binding_set_id'] ) || empty( $activation['binding_set_version'] ) ) {
                continue;
            }
            $id      = $activation['binding_set_id'];
            $version = $activation['binding_set_version'];
            if ( empty( $state['installed'][ $id ][ $version ]['artifact'] ) ) {
                continue;
            }
            $record = $state['installed'][ $id ][ $version ];
            if ( ! isset( $record['context_key'] ) || $record['context_key'] !== $context_key ) {
                continue;
            }
            $artifact = $record['artifact'];
            if ( empty( $artifact['context']['surfaces'] ) || ! in_array( self::SURFACE, $artifact['context']['surfaces'], true ) ) {
                continue;
            }

            $form_id   = $artifact['context']['form_source_ref']['form_id'];
            $inventory = $this->inventory->load( $form_id );
            $rows      = array();

            foreach ( $profile['semantic_slots'] as $slot_key => $semantic ) {
                $kind = OperationsBindingManagementPolicy::kind( $slot_key );
                if ( OperationsBindingManagementPolicy::DIRECT_FIELD !== $kind ) {
                    continue;
                }
                $binding = $this->bindingForSlot( $artifact, $slot_key );
                $current = $this->currentSourceFact( $binding, $inventory );
                $rows[] = array(
                    'semantic_slot_key' => $slot_key,
                    'meaning' => $semantic['meaning'],
                    'required' => $semantic['required'],
                    'binding_state' => $binding['state'],
                    'source_ref' => $binding['source_ref'],
                    'source_validity' => $current['validity'],
                    'current_field' => $current['field'],
                    'suggestion' => $this->suggestion( $state, $record, $slot_key, $binding, $inventory ),
                );
            }

            $contexts[] = array(
                'context_key' => $context_key,
                'binding_set_id' => $id,
                'binding_set_version' => $version,
                'form_id' => $form_id,
                'form_title' => isset( $inventory['form_title'] ) ? $inventory['form_title'] : null,
                'form_exists' => ! empty( $inventory['form_exists'] ),
                'fields' => isset( $inventory['fields'] ) ? array_values( $inventory['fields'] ) : array(),
                'rows' => $rows,
            );
        }

        return array(
            'surface' => self::SURFACE,
            'profile' => array(
                'package_id' => $profile['package_id'],
                'package_version' => $profile['package_version'],
                'profile_id' => $profile['profile_id'],
            ),
            'excluded_semantics' => $profile['excluded_semantics'],
            'contexts' => $contexts,
        );
    }

    private function activeProfileContract() {
        $activation = $this->visual->resolve( self::SURFACE );
        if ( null === $activation ) {
            throw new LifecycleException( 'entry_detail_mapping_profile_inactive', 'No active Entry Detail presentation profile is available.' );
        }

        $snapshot = $this->visual->snapshot();
        $id = $activation['package_id'];
        $version = $activation['package_version'];
        if ( empty( $snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
            throw new LifecycleException( 'entry_detail_mapping_profile_missing', 'The active Entry Detail package is unavailable.' );
        }
        $artifact = $snapshot['installed'][ $id ][ $version ]['artifact'];
        $profile = $this->visual->effectiveProfile( self::SURFACE );
        if ( ! is_array( $profile ) || $profile['profile_id'] !== $activation['profile_id'] ) {
            throw new LifecycleException( 'entry_detail_mapping_profile_mismatch', 'The active Entry Detail profile could not be resolved consistently.' );
        }

        $profile_slots = array_fill_keys( $profile['semantic_slots'], true );
        $semantic_slots = array();
        $excluded = array();
        foreach ( $artifact['semantic_slots'] as $slot ) {
            $key = $slot['semantic_slot_key'];
            if ( ! isset( $profile_slots[ $key ] ) ) {
                continue;
            }
            $usage = $this->entryDetailUsage( $slot );
            if ( null === $usage ) {
                continue;
            }
            $semantic_slots[ $key ] = array(
                'meaning' => $slot['meaning'],
                'required' => $usage['required'],
            );
            if ( OperationsBindingManagementPolicy::DIRECT_FIELD !== OperationsBindingManagementPolicy::kind( $key ) ) {
                $excluded[] = array(
                    'semantic_slot_key' => $key,
                    'meaning' => $slot['meaning'],
                    'required' => $usage['required'],
                    'kind' => OperationsBindingManagementPolicy::entryDetailReadinessKind( $key ),
                );
            }
        }

        return array(
            'package_id' => $id,
            'package_version' => $version,
            'profile_id' => $activation['profile_id'],
            'semantic_slots' => $semantic_slots,
            'excluded_semantics' => $excluded,
        );
    }

    private function entryDetailUsage( $slot ) {
        foreach ( $slot['surface_usage'] as $usage ) {
            if ( isset( $usage['surface'] ) && self::SURFACE === $usage['surface'] ) {
                return $usage;
            }
        }
        return null;
    }

    private function bindingForSlot( $artifact, $semantic_slot_key ) {
        foreach ( $artifact['bindings'] as $binding ) {
            if ( $binding['semantic_slot_key'] === $semantic_slot_key ) {
                return $binding;
            }
        }
        throw new LifecycleException( 'entry_detail_mapping_slot_missing', 'An active-profile semantic is missing from the active EnvironmentBindingSet.' );
    }

    private function currentSourceFact( $binding, $inventory ) {
        if ( 'PROVEN' !== $binding['state'] || ! is_array( $binding['source_ref'] ) ) {
            return array( 'validity' => 'UNRESOLVED', 'field' => null );
        }
        if ( 'gravity_forms.field' !== ( isset( $binding['source_ref']['type'] ) ? $binding['source_ref']['type'] : null ) ) {
            return array( 'validity' => 'UNSUPPORTED_SOURCE', 'field' => null );
        }
        $field_id = (string) $binding['source_ref']['field_id'];
        if ( empty( $inventory['form_exists'] ) || empty( $inventory['fields'][ $field_id ] ) ) {
            return array( 'validity' => 'STALE_SOURCE_MISSING', 'field' => null );
        }
        return array( 'validity' => 'VALID', 'field' => $inventory['fields'][ $field_id ] );
    }

    /**
     * Suggest only one previously-authoritative source for the exact same
     * context/semantic, and only if that host identity still exists now.
     * Installed-but-never-activated versions, labels, types and ordering are not
     * evidence. More than one surviving historical source is ambiguous.
     */
    private function suggestion( $state, $current_record, $slot_key, $current_binding, $inventory ) {
        if ( 'PROVEN' === $current_binding['state'] ) {
            $current = $this->currentSourceFact( $current_binding, $inventory );
            if ( 'VALID' === $current['validity'] ) {
                return null;
            }
        }
        if ( empty( $inventory['form_exists'] ) ) {
            return null;
        }

        $authoritative_versions = array();
        foreach ( $state['audit'] as $audit ) {
            if ( 'ACTIVATED' !== ( isset( $audit['outcome'] ) ? $audit['outcome'] : null ) ) {
                continue;
            }
            if ( ! isset( $audit['context_key'], $audit['binding_set_id'], $audit['binding_set_version'] )
                || $audit['context_key'] !== $current_record['context_key']
                || $audit['binding_set_id'] !== $current_record['binding_set_id'] ) {
                continue;
            }
            $authoritative_versions[ $audit['binding_set_version'] ] = true;
        }

        $candidates = array();
        foreach ( array_keys( $authoritative_versions ) as $version ) {
            if ( empty( $state['installed'][ $current_record['binding_set_id'] ][ $version ]['artifact'] ) ) {
                continue;
            }
            try {
                $binding = $this->bindingForSlot( $state['installed'][ $current_record['binding_set_id'] ][ $version ]['artifact'], $slot_key );
            } catch ( LifecycleException $exception ) {
                continue;
            }
            if ( 'PROVEN' !== $binding['state'] || ! is_array( $binding['source_ref'] ) || 'gravity_forms.field' !== $binding['source_ref']['type'] ) {
                continue;
            }
            $field_id = (string) $binding['source_ref']['field_id'];
            if ( empty( $inventory['fields'][ $field_id ] ) ) {
                continue;
            }
            $candidates[ $field_id ] = $inventory['fields'][ $field_id ];
        }

        if ( 1 !== count( $candidates ) ) {
            return null;
        }
        $field = reset( $candidates );
        return array(
            'field' => $field,
            'evidence' => 'previous_authoritative_mapping',
        );
    }
}
