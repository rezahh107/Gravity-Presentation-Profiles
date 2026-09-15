<?php

namespace GravityPresentationProfiles\Core\BindingHealth;

use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;

final class BindingHealthEvaluator {
    const HEALTHY = 'healthy';
    const UNMAPPED = 'unmapped';
    const STALE_SOURCE_MISSING = 'stale_source_missing';
    const AMBIGUOUS_NEEDS_REVIEW = 'ambiguous_needs_review';
    const EVIDENCE_NOT_PROVEN = 'evidence_not_proven';
    const NOT_APPLICABLE = 'not_applicable';

    public function evaluate( $artifact, $semantic_meanings, $host_inventory ) {
        EnvironmentBindingSet::validate( $artifact );

        $semantic_meanings = is_array( $semantic_meanings ) ? $semantic_meanings : array();
        $host_inventory = is_array( $host_inventory ) ? $host_inventory : array();
        $form_exists = ! empty( $host_inventory['form_exists'] );
        $fields = isset( $host_inventory['fields'] ) && is_array( $host_inventory['fields'] )
            ? $host_inventory['fields']
            : array();
        $runtime_by_slot = $this->runtimeClaimsBySlot( $artifact['runtime_claims'] );
        $facts = array();

        foreach ( $artifact['bindings'] as $binding ) {
            $slot = $binding['semantic_slot_key'];
            $meaning = isset( $semantic_meanings[ $slot ] ) ? $semantic_meanings[ $slot ] : null;
            $meaning_conflict = is_array( $meaning );
            $fact = array(
                'semantic_slot_key' => $slot,
                'meaning' => is_string( $meaning ) ? $meaning : null,
                'status' => self::HEALTHY,
                'reason' => null,
                'binding_state' => $binding['state'],
                'source' => $this->sourceFact( $binding['source_ref'], $fields ),
                'runtime_claims' => isset( $runtime_by_slot[ $slot ] ) ? $runtime_by_slot[ $slot ] : array(),
            );

            if ( $meaning_conflict || null === $meaning ) {
                $fact['status'] = self::AMBIGUOUS_NEEDS_REVIEW;
                $fact['reason'] = $meaning_conflict ? 'conflicting_authoritative_meaning' : 'missing_authoritative_meaning';
                $facts[] = $fact;
                continue;
            }

            if ( 'UNBOUND' === $binding['state'] ) {
                $fact['status'] = self::UNMAPPED;
                $fact['reason'] = 'binding_unbound';
                $facts[] = $fact;
                continue;
            }

            if ( 'NOT_PROVEN' === $binding['state'] ) {
                $fact['status'] = self::EVIDENCE_NOT_PROVEN;
                $fact['reason'] = 'binding_not_proven';
                $facts[] = $fact;
                continue;
            }

            if ( 'NOT_APPLICABLE' === $binding['state'] ) {
                $fact['status'] = self::NOT_APPLICABLE;
                $fact['reason'] = 'binding_not_applicable';
                $facts[] = $fact;
                continue;
            }

            if ( 'gravity_forms.field' === $binding['source_ref']['type'] ) {
                $field_id = (string) $binding['source_ref']['field_id'];
                if ( ! $form_exists || ! isset( $fields[ $field_id ] ) ) {
                    $fact['status'] = self::STALE_SOURCE_MISSING;
                    $fact['reason'] = $form_exists ? 'bound_field_missing' : 'bound_form_missing';
                }
            }

            $facts[] = $fact;
        }

        return $facts;
    }

    private function runtimeClaimsBySlot( $claims ) {
        $result = array();
        foreach ( $claims as $claim ) {
            $slot = $claim['semantic_slot_key'];
            if ( ! isset( $result[ $slot ] ) ) {
                $result[ $slot ] = array();
            }
            $result[ $slot ][] = array(
                'claim' => $claim['claim'],
                'evidence_state' => $claim['evidence_state'],
            );
        }
        return $result;
    }

    private function sourceFact( $source, $fields ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) ) {
            return null;
        }

        $fact = array( 'type' => $source['type'] );
        if ( 'gravity_forms.field' === $source['type'] ) {
            $field_id = (string) $source['field_id'];
            $fact['field_id'] = $source['field_id'];
            if ( isset( $fields[ $field_id ] ) ) {
                $fact['label'] = $fields[ $field_id ]['label'];
                $fact['field_type'] = $fields[ $field_id ]['type'];
            }
            return $fact;
        }

        foreach ( array( 'meta_key', 'state_key', 'region_key', 'action_key' ) as $key ) {
            if ( isset( $source[ $key ] ) ) {
                $fact[ $key ] = $source[ $key ];
                break;
            }
        }
        return $fact;
    }
}
