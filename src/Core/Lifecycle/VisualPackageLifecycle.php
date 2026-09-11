<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

final class VisualPackageLifecycle {
    const OPTION_NAME = 'gpp_visual_package_lifecycle_v1';

    private const STATE_KEYS = array( 'revision', 'installed', 'activations', 'audit_seq', 'audit' );
    private const AUDIT_LIMIT = 200;

    private $store;

    public function __construct( StateStore $store ) {
        $this->store = $store;
    }

    public function import( $artifact ) {
        try {
            VisualProfilePackage::validate( $artifact );
            $canonical = json_decode( VisualProfilePackage::canonicalJson( $artifact ), true );
            $hash      = VisualProfilePackage::contentHash( $artifact );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'visual_contract_violation', $exception->getMessage() );
        }

        $package_id = $canonical['package_id'];
        $version    = $canonical['package_version'];
        $state      = $this->loadState();

        if ( isset( $state['installed'][ $package_id ][ $version ] ) ) {
            $existing = $state['installed'][ $package_id ][ $version ];

            if ( $existing['content_hash'] === $hash ) {
                $this->appendAudit(
                    $state,
                    array(
                        'event' => 'VISUAL_IMPORT',
                        'validation_status' => 'PACKAGE_VALID',
                        'outcome' => 'IDEMPOTENT',
                        'package_id' => $package_id,
                        'package_version' => $version,
                        'content_hash' => $hash,
                    )
                );
                $this->commitState( $state );

                return array(
                    'status' => 'IDEMPOTENT',
                    'package_id' => $package_id,
                    'package_version' => $version,
                    'content_hash' => $hash,
                );
            }

            $this->appendAudit(
                $state,
                array(
                    'event' => 'VISUAL_IMPORT',
                    'validation_status' => 'PACKAGE_VALID',
                    'outcome' => 'REJECTED_IDENTITY_VERSION_CONFLICT',
                    'package_id' => $package_id,
                    'package_version' => $version,
                    'content_hash' => $hash,
                )
            );
            $this->commitState( $state );

            throw new LifecycleException(
                'identity_version_conflict',
                'Visual package identity/version is already installed with different content.'
            );
        }

        if ( ! isset( $state['installed'][ $package_id ] ) ) {
            $state['installed'][ $package_id ] = array();
        }

        $state['installed'][ $package_id ][ $version ] = array(
            'artifact_type' => VisualProfilePackage::ARTIFACT_TYPE,
            'package_id' => $package_id,
            'package_version' => $version,
            'content_hash' => $hash,
            'provenance' => $canonical['provenance'],
            'artifact' => $canonical,
        );

        $this->appendAudit(
            $state,
            array(
                'event' => 'VISUAL_IMPORT',
                'validation_status' => 'PACKAGE_VALID',
                'outcome' => 'INSTALLED_INACTIVE',
                'package_id' => $package_id,
                'package_version' => $version,
                'content_hash' => $hash,
            )
        );
        $this->commitState( $state );

        return array(
            'status' => 'INSTALLED_INACTIVE',
            'package_id' => $package_id,
            'package_version' => $version,
            'content_hash' => $hash,
        );
    }

    public function export( $package_id, $package_version ) {
        $state  = $this->loadState();
        $record = $this->requireInstalled( $state, $package_id, $package_version );

        try {
            return VisualProfilePackage::canonicalJson( $record['artifact'] );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'stored_visual_contract_violation', $exception->getMessage() );
        }
    }

    public function activate( $request ) {
        return $this->changeActivation( $request, 'VISUAL_ACTIVATE' );
    }

    public function rollback( $request ) {
        return $this->changeActivation( $request, 'VISUAL_ROLLBACK' );
    }

    public function deactivate( $request ) {
        $this->requireExactKeys( $request, array( 'surface' ), 'visual deactivation request' );
        $surface = $request['surface'];
        $this->requireSurface( $surface );

        $state = $this->loadState();
        unset( $state['activations'][ $surface ] );
        $this->appendAudit(
            $state,
            array(
                'event' => 'VISUAL_DEACTIVATE',
                'outcome' => 'DEACTIVATED',
                'surface' => $surface,
            )
        );
        $this->commitState( $state );

        return null;
    }

    public function remove( $request ) {
        $this->requireExactKeys( $request, array( 'package_id', 'package_version' ), 'visual removal request' );
        $package_id      = $request['package_id'];
        $package_version = $request['package_version'];
        $state           = $this->loadState();
        $record          = $this->requireInstalled( $state, $package_id, $package_version );

        foreach ( $state['activations'] as $surface => $activation ) {
            if ( $activation['package_id'] === $package_id && $activation['package_version'] === $package_version ) {
                $this->appendAudit(
                    $state,
                    array(
                        'event' => 'VISUAL_REMOVE',
                        'outcome' => 'REJECTED_ACTIVE_VERSION',
                        'package_id' => $package_id,
                        'package_version' => $package_version,
                        'content_hash' => $record['content_hash'],
                        'surface' => $surface,
                    )
                );
                $this->commitState( $state );
                throw new LifecycleException( 'active_artifact_removal_blocked', 'Active visual package version cannot be removed.' );
            }
        }

        unset( $state['installed'][ $package_id ][ $package_version ] );
        if ( array() === $state['installed'][ $package_id ] ) {
            unset( $state['installed'][ $package_id ] );
        }

        $this->appendAudit(
            $state,
            array(
                'event' => 'VISUAL_REMOVE',
                'outcome' => 'REMOVED',
                'package_id' => $package_id,
                'package_version' => $package_version,
                'content_hash' => $record['content_hash'],
            )
        );
        $this->commitState( $state );

        return true;
    }

    public function resolve( $surface ) {
        $this->requireSurface( $surface );
        $state = $this->loadState();

        return isset( $state['activations'][ $surface ] ) ? $state['activations'][ $surface ] : null;
    }

    public function effectiveProfile( $surface ) {
        $activation = $this->resolve( $surface );
        if ( null === $activation ) {
            return null;
        }

        $state  = $this->loadState();
        $record = $this->requireInstalled(
            $state,
            $activation['package_id'],
            $activation['package_version']
        );

        foreach ( $record['artifact']['surface_profiles'] as $profile ) {
            if ( $profile['surface'] === $surface && $profile['profile_id'] === $activation['profile_id'] ) {
                return $profile;
            }
        }

        throw new LifecycleException( 'activation_state_corrupt', 'Active visual profile is missing from the installed package.' );
    }

    public function snapshot() {
        return $this->loadState();
    }

    private function changeActivation( $request, $event ) {
        $this->requireExactKeys(
            $request,
            array( 'surface', 'package_id', 'package_version', 'profile_id' ),
            'visual activation request'
        );

        $surface         = $request['surface'];
        $package_id      = $request['package_id'];
        $package_version = $request['package_version'];
        $profile_id      = $request['profile_id'];

        $this->requireSurface( $surface );
        $state  = $this->loadState();
        $record = $this->requireInstalled( $state, $package_id, $package_version );
        $match  = null;

        try {
            VisualProfilePackage::validate( $record['artifact'] );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'stored_visual_contract_violation', $exception->getMessage() );
        }

        foreach ( $record['artifact']['surface_profiles'] as $profile ) {
            if ( $profile['surface'] === $surface && $profile['profile_id'] === $profile_id ) {
                $match = $profile;
                break;
            }
        }

        if ( null === $match ) {
            throw new LifecycleException( 'profile_not_in_package_surface', 'Requested profile is not admitted for the requested surface.' );
        }

        $state['activations'][ $surface ] = array(
            'package_id' => $package_id,
            'package_version' => $package_version,
            'profile_id' => $profile_id,
        );

        $this->appendAudit(
            $state,
            array(
                'event' => $event,
                'outcome' => 'ACTIVATED',
                'package_id' => $package_id,
                'package_version' => $package_version,
                'profile_id' => $profile_id,
                'content_hash' => $record['content_hash'],
                'surface' => $surface,
            )
        );
        $this->commitState( $state );

        return $state['activations'][ $surface ];
    }

    private function loadState() {
        $state = $this->store->load();

        if ( null === $state ) {
            return $this->initialState();
        }

        if ( ! is_array( $state ) ) {
            throw new LifecycleException( 'visual_state_corrupt', 'Visual lifecycle state must be an array.' );
        }

        $this->requireExactKeys( $state, self::STATE_KEYS, 'visual lifecycle state' );

        if ( ! is_int( $state['revision'] ) || $state['revision'] < 0 || ! is_int( $state['audit_seq'] ) || $state['audit_seq'] < 0 ) {
            throw new LifecycleException( 'visual_state_corrupt', 'Visual lifecycle revision metadata is invalid.' );
        }
        if ( ! is_array( $state['installed'] ) || ! is_array( $state['activations'] ) || ! is_array( $state['audit'] ) ) {
            throw new LifecycleException( 'visual_state_corrupt', 'Visual lifecycle collections are invalid.' );
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
            throw new LifecycleException( 'state_commit_failed', 'Visual lifecycle state commit failed; prior state remains authoritative.' );
        }
    }

    private function requireInstalled( $state, $package_id, $package_version ) {
        if ( ! is_string( $package_id ) || ! is_string( $package_version ) ) {
            throw new LifecycleException( 'invalid_visual_identity', 'Visual package identity/version must be strings.' );
        }

        if ( ! isset( $state['installed'][ $package_id ][ $package_version ] ) ) {
            throw new LifecycleException( 'visual_version_not_installed', 'Requested visual package version is not installed.' );
        }

        return $state['installed'][ $package_id ][ $package_version ];
    }

    private function requireSurface( $surface ) {
        if ( ! is_string( $surface ) || ! in_array( $surface, VisualProfilePackage::admittedSurfaces(), true ) ) {
            throw new LifecycleException( 'invalid_surface', 'Requested surface is not admitted in V1.' );
        }
    }

    private function requireExactKeys( $value, $expected, $path ) {
        if ( ! is_array( $value ) ) {
            throw new LifecycleException( 'invalid_request', $path . ' must be an object.' );
        }

        $actual = array_keys( $value );
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );

        if ( $actual !== $expected ) {
            throw new LifecycleException( 'invalid_request_keys', $path . ' contains missing or forbidden targeting keys.' );
        }
    }

    private function appendAudit( &$state, $record ) {
        $state['audit_seq']++;
        $record['seq']            = $state['audit_seq'];
        $record['artifact_class'] = 'visual_profile_package';
        $state['audit'][]          = $record;

        if ( count( $state['audit'] ) > self::AUDIT_LIMIT ) {
            $state['audit'] = array_slice( $state['audit'], -1 * self::AUDIT_LIMIT );
        }
    }
}
