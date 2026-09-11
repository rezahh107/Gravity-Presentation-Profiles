<?php

namespace GravityPresentationProfiles\Core\Portable;

final class SemanticBindingResolver {
    private $binding_sets = array();
    private $known_slots  = array();

    public function __construct( $binding_sets, $known_slot_keys ) {
        if ( ! is_array( $binding_sets ) || ! is_array( $known_slot_keys ) ) {
            throw new ContractViolation( 'Semantic binding resolver requires binding-set and semantic-slot arrays.' );
        }
        foreach ( $known_slot_keys as $slot_key ) {
            if ( ! is_string( $slot_key ) || 1 !== preg_match( '/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/', $slot_key ) ) {
                throw new ContractViolation( 'Known semantic slots must use stable dotted keys.' );
            }
            $this->known_slots[ $slot_key ] = true;
        }
        foreach ( $binding_sets as $binding_set ) {
            EnvironmentBindingSet::validate( $binding_set );
            $this->binding_sets[] = $binding_set;
        }
    }

    public function resolve( $context, $slot_key ) {
        if ( ! isset( $this->known_slots[ $slot_key ] ) ) {
            return $this->unresolved( $slot_key, 'NOT_PROVEN', 'unknown_semantic_slot' );
        }
        if ( ! $this->validRuntimeContext( $context ) ) {
            return $this->unresolved( $slot_key, 'NOT_PROVEN', 'invalid_runtime_context' );
        }
        $candidates = array();
        foreach ( $this->binding_sets as $binding_set ) {
            if ( $this->contextMatches( $binding_set['context'], $context ) ) {
                $candidates[] = $binding_set;
            }
        }
        if ( array() === $candidates ) {
            return $this->unresolved( $slot_key, 'NOT_PROVEN', 'missing_binding_set' );
        }
        $selected = $this->selectMostSpecific( $candidates, $context );
        if ( null === $selected ) {
            return $this->unresolved( $slot_key, 'NOT_PROVEN', 'ambiguous_binding_set' );
        }
        foreach ( $selected['bindings'] as $binding ) {
            if ( $slot_key !== $binding['semantic_slot_key'] ) {
                continue;
            }
            if ( 'PROVEN' !== $binding['state'] ) {
                return array(
                    'resolved' => false,
                    'binding_set_id' => $selected['binding_set_id'],
                    'semantic_slot_key' => $slot_key,
                    'state' => $binding['state'],
                    'source_ref' => null,
                    'reason' => 'binding_not_proven',
                );
            }
            return array(
                'resolved' => true,
                'binding_set_id' => $selected['binding_set_id'],
                'semantic_slot_key' => $slot_key,
                'state' => 'PROVEN',
                'source_ref' => $binding['source_ref'],
                'reason' => null,
            );
        }
        return array(
            'resolved' => false,
            'binding_set_id' => $selected['binding_set_id'],
            'semantic_slot_key' => $slot_key,
            'state' => 'NOT_PROVEN',
            'source_ref' => null,
            'reason' => 'missing_slot_binding',
        );
    }

    private function validRuntimeContext( $context ) {
        if ( ! is_array( $context ) ) {
            return false;
        }
        $keys = array_keys( $context );
        sort( $keys, SORT_STRING );
        $expected = array( 'entry_id', 'form_id', 'installation_id', 'surface' );
        sort( $expected, SORT_STRING );
        if ( $keys !== $expected ) {
            return false;
        }
        if ( ! $this->validIdentity( $context['installation_id'] ) || ! $this->validIdentity( $context['form_id'] ) || ! $this->validIdentity( $context['entry_id'] ) ) {
            return false;
        }
        return is_string( $context['surface'] ) && in_array( $context['surface'], VisualProfilePackage::admittedSurfaces(), true );
    }

    private function contextMatches( $binding_context, $runtime_context ) {
        if ( $binding_context['installation_id'] !== $runtime_context['installation_id'] || $binding_context['form_id'] !== $runtime_context['form_id'] ) {
            return false;
        }
        if ( ! in_array( $runtime_context['surface'], $binding_context['surfaces'], true ) ) {
            return false;
        }
        return null === $binding_context['entry_id'] || $binding_context['entry_id'] === $runtime_context['entry_id'];
    }

    private function selectMostSpecific( $candidates, $context ) {
        $exact = array();
        foreach ( $candidates as $candidate ) {
            if ( null !== $candidate['context']['entry_id'] && $candidate['context']['entry_id'] === $context['entry_id'] ) {
                $exact[] = $candidate;
            }
        }
        if ( 1 === count( $exact ) ) {
            return $exact[0];
        }
        if ( count( $exact ) > 1 ) {
            return null;
        }
        $general = array_values( array_filter( $candidates, static function ( $candidate ) { return null === $candidate['context']['entry_id']; } ) );
        return 1 === count( $general ) ? $general[0] : null;
    }

    private function validIdentity( $value ) {
        if ( is_int( $value ) ) {
            return $value > 0;
        }
        return is_string( $value ) && 1 === preg_match( '/^[A-Za-z0-9][A-Za-z0-9._:-]*$/', $value );
    }

    private function unresolved( $slot_key, $state, $reason ) {
        return array(
            'resolved' => false,
            'binding_set_id' => null,
            'semantic_slot_key' => $slot_key,
            'state' => $state,
            'source_ref' => null,
            'reason' => $reason,
        );
    }
}
