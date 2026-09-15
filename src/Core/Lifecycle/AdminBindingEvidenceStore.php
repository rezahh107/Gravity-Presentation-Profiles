<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;

final class AdminBindingEvidenceStore {
    const OPTION_NAME = 'gpp_admin_binding_evidence_v1';
    private const EVENT_LIMIT = 200;

    private $store;

    public function __construct( StateStore $store ) {
        $this->store = $store;
    }

    public function confirmationRef( $artifact, $semantic_slot_key, $source_ref ) {
        $subject = $this->subject( $artifact, $semantic_slot_key, $source_ref );
        return 'gpp-admin-binding:' . CanonicalJson::hash( $subject );
    }

    public function recordConfirmation( $artifact, $semantic_slot_key, $source_ref ) {
        EnvironmentBindingSet::validate( $artifact );
        $ref = $this->confirmationRef( $artifact, $semantic_slot_key, $source_ref );
        $subject = $this->subject( $artifact, $semantic_slot_key, $source_ref );
        $state = $this->loadState();

        if ( isset( $state['events'][ $ref ] ) ) {
            if ( $state['events'][ $ref ] !== $subject ) {
                throw new LifecycleException( 'admin_evidence_collision', 'Administrator evidence identity collision detected.' );
            }
            return $ref;
        }

        $expected_revision = $state['revision'];
        $state['revision']++;
        $state['events'][ $ref ] = $subject;
        if ( count( $state['events'] ) > self::EVENT_LIMIT ) {
            $state['events'] = array_slice( $state['events'], -1 * self::EVENT_LIMIT, self::EVENT_LIMIT, true );
        }

        if ( ! $this->store->commit( $expected_revision, $state ) ) {
            throw new LifecycleException( 'admin_evidence_commit_failed', 'Administrator binding evidence could not be recorded.' );
        }

        return $ref;
    }

    public function allowsConfirmation( $artifact, $binding ) {
        if ( ! is_array( $binding ) || 'PROVEN' !== ( isset( $binding['state'] ) ? $binding['state'] : null ) || empty( $binding['source_ref'] ) ) {
            return false;
        }
        $ref = $this->confirmationRef( $artifact, $binding['semantic_slot_key'], $binding['source_ref'] );
        if ( empty( $binding['evidence_refs'] ) || ! in_array( $ref, $binding['evidence_refs'], true ) ) {
            return false;
        }
        $state = $this->loadState();
        return isset( $state['events'][ $ref ] ) && $state['events'][ $ref ] === $this->subject( $artifact, $binding['semantic_slot_key'], $binding['source_ref'] );
    }

    public function snapshot() {
        return $this->loadState();
    }

    private function subject( $artifact, $semantic_slot_key, $source_ref ) {
        if ( ! is_array( $artifact ) || ! isset( $artifact['binding_set_id'], $artifact['binding_set_version'], $artifact['context'] ) ) {
            throw new LifecycleException( 'invalid_admin_evidence_artifact', 'Administrator evidence requires binding artifact identity and context.' );
        }
        if ( ! is_string( $semantic_slot_key ) || '' === $semantic_slot_key || ! is_array( $source_ref ) ) {
            throw new LifecycleException( 'invalid_admin_evidence_subject', 'Administrator evidence requires a semantic slot and typed source.' );
        }
        try {
            $context_key = CanonicalJson::hash( $artifact['context'] );
            $source_hash = CanonicalJson::hash( $source_ref );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'invalid_admin_evidence_subject', $exception->getMessage() );
        }
        return array(
            'event' => 'ADMIN_CONFIRMED_BINDING_SOURCE',
            'binding_set_id' => $artifact['binding_set_id'],
            'binding_set_version' => $artifact['binding_set_version'],
            'context_key' => $context_key,
            'semantic_slot_key' => $semantic_slot_key,
            'source_ref_hash' => $source_hash,
        );
    }

    private function loadState() {
        $state = $this->store->load();
        if ( null === $state ) {
            return array( 'revision' => 0, 'events' => array() );
        }
        if ( ! is_array( $state ) || ! isset( $state['revision'], $state['events'] ) || ! is_int( $state['revision'] ) || ! is_array( $state['events'] ) ) {
            throw new LifecycleException( 'admin_evidence_state_corrupt', 'Administrator binding evidence state is corrupt.' );
        }
        return $state;
    }
}
