<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

final class EvidenceReferenceGate implements BindingEvidenceGate {
    private $admitted_refs = array();

    public function __construct( $admitted_refs ) {
        if ( ! is_array( $admitted_refs ) ) {
            throw new LifecycleException( 'invalid_evidence_catalog', 'Admitted evidence references must be an array.' );
        }

        foreach ( $admitted_refs as $ref ) {
            if ( ! is_string( $ref ) || '' === trim( $ref ) ) {
                throw new LifecycleException( 'invalid_evidence_catalog', 'Admitted evidence references must be non-empty strings.' );
            }
            $this->admitted_refs[ $ref ] = true;
        }
    }

    public function allowsBinding( $binding ) {
        if ( ! is_array( $binding ) || ! isset( $binding['state'] ) ) {
            return false;
        }

        if ( 'PROVEN' !== $binding['state'] ) {
            return true;
        }

        if ( ! isset( $binding['source_ref'] ) || ! is_array( $binding['source_ref'] ) ) {
            return false;
        }

        if ( ! isset( $binding['evidence_refs'] ) || ! is_array( $binding['evidence_refs'] ) ) {
            return false;
        }

        foreach ( $binding['evidence_refs'] as $ref ) {
            if ( isset( $this->admitted_refs[ $ref ] ) ) {
                return true;
            }
        }

        return false;
    }
}
