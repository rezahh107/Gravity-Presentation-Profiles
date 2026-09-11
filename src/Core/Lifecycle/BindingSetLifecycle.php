<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;

final class BindingSetLifecycle {
    const OPTION_NAME = 'gpp_binding_set_lifecycle_v1';

    private const STATE_KEYS = array( 'revision', 'installed', 'activations', 'audit_seq', 'audit' );
    private const AUDIT_LIMIT = 200;

    private $store;
    private $evidence_gate;

    public function __construct( StateStore $store, BindingEvidenceGate $evidence_gate ) {
        $this->store         = $store;
        $this->evidence_gate = $evidence_gate;
    }

    public function import( $artifact ) {
        try {
            EnvironmentBindingSet::validate( $artifact );
            $canonical = json_decode( EnvironmentBindingSet::canonicalJson( $artifact ), true );
            $hash      = EnvironmentBindingSet::contentHash( $artifact );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'binding_contract_violation', $exception->getMessage() );
        }

        $binding_set_id = $canonical['binding_set_id'];
        $version        = $canonical['binding_set_version'];
        $state          = $this->loadState();

        if ( isset( $state['installed'][ $binding_set_id ][ $version ] ) ) {
            $existing = $state['installed'][ $binding_set_id ][ $version ];

            if ( $existing['content_hash'] === $hash ) {
                $this->appendAudit(
                    $state,
                    array(
                        'event' => 'BINDING_IMPORT',
                        'validation_status' => 'BINDING_VALID',
                        'outcome' => 'IDEMPOTENT',
                        'binding_set_id' => $binding_set_id,
                        'binding_set_version' => $version,
                        'content_hash' => $hash,
                        'context_key' => $existing['context_key'],
                    )
                );
                $this->commitState( $state );

                return array(
                    'status' => 'IDEMPOTENT',
                    'binding_set_id' => $binding_set_id,
                    'binding_set_version' => $version,
                    'content_hash' => $hash,
                    'context_key' => $existing['context_key'],
                );
            }

            $this->appendAudit(
                $state,
                array(
                    'event' => 'BINDING_IMPORT',
                    'validation_status' => 'BINDING_VALID',
                    'outcome' => 'REJECTED_IDENTITY_VERSION_CONFLICT',
                    'binding_set_id' => $binding_set_id,
                    'binding_set_version' => $version,
                    'content_hash' => $hash,
                    'context_key' => $this->contextKey( $canonical['context'] ),
                )
            );
            $this->commitState( $state );

            throw new LifecycleException(
                'identity_version_conflict',
                'Binding-set identity/version is already installed with different content.'
            );
        }

        if ( ! isset( $state['installed'][ $binding_set_id ] ) ) {
            $state['installed'][ $binding_set_id ] = array();
        }

        $context_key = $this->contextKey( $canonical['context'] );
        $state['installed'][ $binding_set_id ][ $version ] = array(
            'artifact_type' => EnvironmentBindingSet::ARTIFACT_TYPE,
            'binding_set_id' => $binding_set_id,
            'binding_set_version' => $version,
            'content_hash' => $hash,
            'context_key' => $context_key,
            'provenance' => $canonical['provenance'],
            'artifact' => $canonical,
        );

        $this->appendAudit(
            $state,
            array(
                'event' => 'BINDING_IMPORT',
                'validation_status' => 'BINDING_VALID',
                'outcome' => 'INSTALLED_INACTIVE',
                'binding_set_id' => $binding_set_id,
                'binding_set_version' => $version,
                'content_hash' => $hash,
                'context_key' => $context_key,
            )
        );
        $this->commitState( $state );

        return array(
            'status' => 'INSTALLED_INACTIVE',
            'binding_set_id' => $binding_set_id,
            'binding_set_version' => $version,
            'content_hash' => $hash,
            'context_key' => $context_key,
        );
    }

    public function export( $binding_set_id, $binding_set_version ) {
        $state  = $this->loadState();
        $record = $this->requireInstalled( $state, $binding_set_id, $binding_set_version );

        try {
            return EnvironmentBindingSet::canonicalJson( $record['artifact'] );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'stored_binding_contract_violation', $exception->getMessage() );
        }
    }

    public function activate( $request ) {
        return $this->changeActivation( $request, 'BINDING_ACTIVATE' );
    }

    public function rollback( $request ) {
        return $this->changeActivation( $request, 'BINDING_ROLLBACK' );
    }

    public function deactivate( $request ) {
        $this->requireExactKeys( $request, array( 'context' ), 'binding deactivation request' );
        $context_key = $this->contextKey( $request['context'] );
        $state       = $this->loadState();

        unset( $state['activations'][ $context_key ] );
        $this->appendAudit(
            $state,
            array(
                'event' => 'BINDING_DEACTIVATE',
                'outcome' => 'DEACTIVATED',
                'context_key' => $context_key,
            )
        );
        $this->commitState( $state );

        return null;
    }

    public function remove( $request ) {
        $this->requireExactKeys(
            $request,
            array( 'binding_set_id', 'binding_set_version' ),
            'binding removal request'
        );
        $binding_set_id      = $request['binding_set_id'];
        $binding_set_version = $request['binding_set_version'];
        $state               = $this->loadState();
        $record              = $this->requireInstalled( $state, $binding_set_id, $binding_set_version );

        foreach ( $state['activations'] as $context_key => $activation ) {
            if ( $activation['binding_set_id'] === $binding_set_id && $activation['binding_set_version'] === $binding_set_version ) {
                $this->appendAudit(
                    $state,
                    array(
                        'event' => 'BINDING_REMOVE',
                        'outcome' => 'REJECTED_ACTIVE_VERSION',
                        'binding_set_id' => $binding_set_id,
                        'binding_set_version' => $binding_set_version,
                        'content_hash' => $record['content_hash'],
                        'context_key' => $context_key,
                    )
                );
                $this->commitState( $state );
                throw new LifecycleException( 'active_artifact_removal_blocked', 'Active binding-set version cannot be removed.' );
            }
        }

        unset( $state['installed'][ $binding_set_id ][ $binding_set_version ] );
        if ( array() === $state['installed'][ $binding_set_id ] ) {
            unset( $state['installed'][ $binding_set_id ] );
        }

        $this->appendAudit(
            $state,
            array(
                'event' => 'BINDING_REMOVE',
                'outcome' => 'REMOVED',
                'binding_set_id' => $binding_set_id,
                'binding_set_version' => $binding_set_version,
                'content_hash' => $record['content_hash'],
                'context_key' => $record['context_key'],
            )
        );
        $this->commitState( $state );

        return true;
    }

    public function resolve( $context ) {
        $context_key = $this->contextKey( $context );
        $state       = $this->loadState();

        return isset( $state['activations'][ $context_key ] ) ? $state['activations'][ $context_key ] : null;
    }

    public function snapshot() {
        return $this->loadState();
    }

    public function contextKey( $context ) {
        if ( ! is_array( $context ) ) {
            throw new LifecycleException( 'invalid_binding_context', 'Binding activation context must be an object.' );
        }

        try {
            return CanonicalJson::hash( $context );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'invalid_binding_context', $exception->getMessage() );
        }
    }

    private function changeActivation( $request, $event ) {
        $this->requireExactKeys(
            $request,
            array( 'context', 'binding_set_id', 'binding_set_version' ),
            'binding activation request'
        );

        $binding_set_id      = $request['binding_set_id'];
        $binding_set_version = $request['binding_set_version'];
        $context_key         = $this->contextKey( $request['context'] );
        $state               = $this->loadState();
        $record              = $this->requireInstalled( $state, $binding_set_id, $binding_set_version );

        try {
            EnvironmentBindingSet::validate( $record['artifact'] );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'stored_binding_contract_violation', $exception->getMessage() );
        }

        if ( $record['context_key'] !== $context_key || CanonicalJson::encode( $record['artifact']['context'] ) !== CanonicalJson::encode( $request['context'] ) ) {
            throw new LifecycleException( 'binding_context_mismatch', 'Binding set may activate only for its admitted environment/context identity.' );
        }

        foreach ( $record['artifact']['bindings'] as $binding ) {
            if ( 'PROVEN' === $binding['state'] && ! $this->evidence_gate->allowsBinding( $binding ) ) {
                $this->appendAudit(
                    $state,
                    array(
                        'event' => $event,
                        'outcome' => 'REJECTED_PROVEN_EVIDENCE_NOT_ADMITTED',
                        'binding_set_id' => $binding_set_id,
                        'binding_set_version' => $binding_set_version,
                        'content_hash' => $record['content_hash'],
                        'context_key' => $context_key,
                    )
                );
                $this->commitState( $state );
                throw new LifecycleException(
                    'proven_evidence_not_admitted',
                    'PROVEN binding activation requires admitted source/adapter evidence.'
                );
            }
        }

        $state['activations'][ $context_key ] = array(
            'binding_set_id' => $binding_set_id,
            'binding_set_version' => $binding_set_version,
        );

        $this->appendAudit(
            $state,
            array(
                'event' => $event,
                'outcome' => 'ACTIVATED',
                'binding_set_id' => $binding_set_id,
                'binding_set_version' => $binding_set_version,
                'content_hash' => $record['content_hash'],
                'context_key' => $context_key,
            )
        );
        $this->commitState( $state );

        return $state['activations'][ $context_key ];
    }

    private function loadState() {
        $state = $this->store->load();

        if ( null === $state ) {
            return $this->initialState();
        }

        if ( ! is_array( $state ) ) {
            throw new LifecycleException( 'binding_state_corrupt', 'Binding lifecycle state must be an array.' );
        }

        $this->requireExactKeys( $state, self::STATE_KEYS, 'binding lifecycle state' );

        if ( ! is_int( $state['revision'] ) || $state['revision'] < 0 || ! is_int( $state['audit_seq'] ) || $state['audit_seq'] < 0 ) {
            throw new LifecycleException( 'binding_state_corrupt', 'Binding lifecycle revision metadata is invalid.' );
        }
        if ( ! is_array( $state['installed'] ) || ! is_array( $state['activations'] ) || ! is_array( $state['audit'] ) ) {
            throw new LifecycleException( 'binding_state_corrupt', 'Binding lifecycle collections are invalid.' );
        }

        return $state;
    }

    private function initialState() {
        return array(
            'revision' => 0,
            'installed' => array(),
            'activations' => array(),
            'audit_seq' => 0,
            'audit' => array(),
        );
    }

    private function commitState( &$state ) {
        $expected_revision = $state['revision'];
        $state['revision'] = $expected_revision + 1;

        if ( ! $this->store->commit( $expected_revision, $state ) ) {
            $state['revision'] = $expected_revision;
            throw new LifecycleException( 'state_commit_failed', 'Binding lifecycle state commit failed; prior state remains authoritative.' );
        }
    }

    private function requireInstalled( $state, $binding_set_id, $binding_set_version ) {
        if ( ! is_string( $binding_set_id ) || ! is_string( $binding_set_version ) ) {
            throw new LifecycleException( 'invalid_binding_identity', 'Binding-set identity/version must be strings.' );
        }

        if ( ! isset( $state['installed'][ $binding_set_id ][ $binding_set_version ] ) ) {
            throw new LifecycleException( 'binding_version_not_installed', 'Requested binding-set version is not installed.' );
        }

        return $state['installed'][ $binding_set_id ][ $binding_set_version ];
    }

    private function requireExactKeys( $value, $expected, $path ) {
        if ( ! is_array( $value ) ) {
            throw new LifecycleException( 'invalid_request', $path . ' must be an object.' );
        }

        $actual = array_keys( $value );
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );

        if ( $actual !== $expected ) {
            throw new LifecycleException( 'invalid_request_keys', $path . ' contains missing or forbidden cross-class keys.' );
        }
    }

    private function appendAudit( &$state, $record ) {
        $state['audit_seq']++;
        $record['seq']            = $state['audit_seq'];
        $record['artifact_class'] = 'environment_binding_set';
        $state['audit'][]          = $record;

        if ( count( $state['audit'] ) > self::AUDIT_LIMIT ) {
            $state['audit'] = array_slice( $state['audit'], -1 * self::AUDIT_LIMIT );
        }
    }
}
