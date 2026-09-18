<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\ContractViolation;

/** Deterministic evidence identity for stable Entry Detail host sources. */
final class EntryDetailRuntimeEvidence {
    const ADAPTER_CONTRACT = 'srwf.gravity_flow.entry_detail.runtime.v1';

    public static function hostBindingRef( $artifact, $semantic_slot_key, $source_ref ) {
        if ( ! is_array( $artifact ) || ! isset( $artifact['binding_set_id'], $artifact['binding_set_version'], $artifact['context'] ) ) {
            throw new ContractViolation( 'Entry Detail runtime evidence requires binding artifact identity/version and context.' );
        }
        if ( ! is_string( $semantic_slot_key ) || '' === $semantic_slot_key || ! is_array( $source_ref ) ) {
            throw new ContractViolation( 'Entry Detail runtime evidence requires a semantic slot and typed source.' );
        }

        return 'gpp-entry-detail-host-source:' . CanonicalJson::hash(
            array(
                'adapter_contract' => self::ADAPTER_CONTRACT,
                'claim' => 'binding_source',
                'binding_set_id' => $artifact['binding_set_id'],
                'binding_set_version' => $artifact['binding_set_version'],
                'context' => $artifact['context'],
                'semantic_slot_key' => $semantic_slot_key,
                'source_ref' => $source_ref,
            )
        );
    }
}
