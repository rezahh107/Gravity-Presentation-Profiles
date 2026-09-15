<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\ContractViolation;

final class RepairBindingEvidenceGate implements BindingEvidenceGate {
    private $evidence_store;
    private $artifact;
    private $previous_artifact;
    private $fallback;

    public function __construct( AdminBindingEvidenceStore $evidence_store, $artifact, $previous_artifact = null, BindingEvidenceGate $fallback = null ) {
        $this->evidence_store = $evidence_store;
        $this->artifact = $artifact;
        $this->previous_artifact = $previous_artifact;
        $this->fallback = $fallback;
    }

    public function allowsBinding( $binding ) {
        if ( ! is_array( $binding ) || ! isset( $binding['state'] ) ) {
            return false;
        }
        if ( 'PROVEN' !== $binding['state'] ) {
            return true;
        }
        if ( null !== $this->fallback && $this->fallback->allowsBinding( $binding ) ) {
            return true;
        }
        if ( $this->evidence_store->allowsConfirmation( $this->artifact, $binding ) ) {
            return true;
        }
        return $this->matchesPreviousBinding( $binding );
    }

    private function matchesPreviousBinding( $binding ) {
        if ( ! is_array( $this->previous_artifact ) || empty( $this->previous_artifact['bindings'] ) ) {
            return false;
        }
        foreach ( $this->previous_artifact['bindings'] as $previous ) {
            if ( ! isset( $previous['semantic_slot_key'] ) || $previous['semantic_slot_key'] !== $binding['semantic_slot_key'] ) {
                continue;
            }
            try {
                return CanonicalJson::encode( $previous ) === CanonicalJson::encode( $binding );
            } catch ( ContractViolation $exception ) {
                return false;
            }
        }
        return false;
    }
}
