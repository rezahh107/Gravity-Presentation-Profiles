<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\ContractViolation;

/**
 * Deterministic identities for Inbox runtime evidence.
 *
 * Availability proof is intentionally bound to the exact immutable binding-set
 * identity/version and exact authoritative source. Copying a PROVEN claim into
 * a later binding version without re-qualification therefore becomes stale and
 * fails closed in InboxPresentationModel.
 */
final class InboxRuntimeEvidence {
    const ADAPTER_CONTRACT = 'srwf.gravity_flow.inbox.runtime.v1';

    public static function availabilityRef( $artifact, $semantic_slot_key, $source_ref ) {
        return 'gpp-inbox-availability:' . self::subjectHash(
            $artifact,
            $semantic_slot_key,
            $source_ref,
            'availability'
        );
    }

    public static function hostBindingRef( $artifact, $semantic_slot_key, $source_ref ) {
        return 'gpp-inbox-host-source:' . self::subjectHash(
            $artifact,
            $semantic_slot_key,
            $source_ref,
            'binding_source'
        );
    }

    private static function subjectHash( $artifact, $semantic_slot_key, $source_ref, $claim ) {
        if ( ! is_array( $artifact ) || ! isset( $artifact['binding_set_id'], $artifact['binding_set_version'], $artifact['context'] ) ) {
            throw new ContractViolation( 'Inbox runtime evidence requires binding artifact identity/version and context.' );
        }
        if ( ! is_string( $semantic_slot_key ) || '' === $semantic_slot_key || ! is_array( $source_ref ) ) {
            throw new ContractViolation( 'Inbox runtime evidence requires a semantic slot and typed source.' );
        }

        return CanonicalJson::hash(
            array(
                'adapter_contract' => self::ADAPTER_CONTRACT,
                'claim' => $claim,
                'binding_set_id' => $artifact['binding_set_id'],
                'binding_set_version' => $artifact['binding_set_version'],
                'context' => $artifact['context'],
                'semantic_slot_key' => $semantic_slot_key,
                'source_ref' => $source_ref,
            )
        );
    }
}
