<?php

namespace GravityPresentationProfiles\Core\Lifecycle;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;

final class InstalledVisualProfileCatalog {
    private $visual;

    public function __construct( VisualPackageLifecycle $visual ) {
        $this->visual = $visual;
    }

    public function listForSurface( $surface ) {
        $this->requireSurface( $surface );
        $state   = $this->visual->snapshot();
        $results = array();

        foreach ( $state['installed'] as $package_id => $versions ) {
            if ( ! is_string( $package_id ) || ! is_array( $versions ) ) {
                throw new LifecycleException( 'visual_state_corrupt', 'Installed visual package registry is invalid.' );
            }

            foreach ( $versions as $package_version => $record ) {
                $validated = $this->validateRecord( $package_id, $package_version, $record );
                $profile   = ( new VisualProfileResolver( $validated['artifact'] ) )->resolve( $surface );

                if ( null === $profile ) {
                    continue;
                }

                $results[] = array(
                    'surface' => $surface,
                    'package_id' => $package_id,
                    'package_version' => $package_version,
                    'profile_id' => $profile['profile_id'],
                    'schema_version' => $validated['artifact']['schema_version'],
                    'content_hash' => $validated['content_hash'],
                );
            }
        }

        usort(
            $results,
            static function ( $left, $right ) {
                foreach ( array( 'package_id', 'package_version', 'profile_id' ) as $key ) {
                    $comparison = strcmp( $left[ $key ], $right[ $key ] );
                    if ( 0 !== $comparison ) {
                        return $comparison;
                    }
                }
                return 0;
            }
        );

        return $results;
    }

    public function resolveExact( $surface, $package_id, $package_version, $profile_id ) {
        $this->requireSurface( $surface );
        $this->requireIdentityPart( $package_id, 'package_id' );
        $this->requireIdentityPart( $package_version, 'package_version' );
        $this->requireIdentityPart( $profile_id, 'profile_id' );

        $state = $this->visual->snapshot();
        if ( ! isset( $state['installed'][ $package_id ][ $package_version ] ) ) {
            throw new LifecycleException( 'visual_version_not_installed', 'Requested visual package version is not installed.' );
        }

        $validated = $this->validateRecord(
            $package_id,
            $package_version,
            $state['installed'][ $package_id ][ $package_version ]
        );
        $profile = ( new VisualProfileResolver( $validated['artifact'] ) )->resolve( $surface );

        if ( null === $profile || $profile['profile_id'] !== $profile_id ) {
            throw new LifecycleException( 'profile_not_in_package_surface', 'Requested profile is not admitted for the requested surface.' );
        }

        return array(
            'surface' => $surface,
            'package_id' => $package_id,
            'package_version' => $package_version,
            'profile_id' => $profile_id,
            'schema_version' => $validated['artifact']['schema_version'],
            'content_hash' => $validated['content_hash'],
            'artifact' => $validated['artifact'],
            'profile' => $profile,
        );
    }

    private function validateRecord( $package_id, $package_version, $record ) {
        if ( ! is_array( $record ) || ! isset( $record['artifact'], $record['content_hash'] ) ) {
            throw new LifecycleException( 'visual_state_corrupt', 'Installed visual package record is incomplete.' );
        }
        if ( ! is_string( $record['content_hash'] ) || '' === $record['content_hash'] ) {
            throw new LifecycleException( 'visual_state_corrupt', 'Installed visual package content hash is invalid.' );
        }

        try {
            VisualProfilePackage::validate( $record['artifact'] );
            $content_hash = VisualProfilePackage::contentHash( $record['artifact'] );
        } catch ( ContractViolation $exception ) {
            throw new LifecycleException( 'stored_visual_contract_violation', $exception->getMessage() );
        }

        if (
            ! isset( $record['artifact']['package_id'], $record['artifact']['package_version'] ) ||
            $record['artifact']['package_id'] !== $package_id ||
            $record['artifact']['package_version'] !== $package_version ||
            $record['content_hash'] !== $content_hash
        ) {
            throw new LifecycleException( 'visual_state_corrupt', 'Installed visual package identity or content hash does not match persisted registry state.' );
        }

        return array(
            'artifact' => $record['artifact'],
            'content_hash' => $content_hash,
        );
    }

    private function requireSurface( $surface ) {
        if ( ! is_string( $surface ) || ! in_array( $surface, VisualProfilePackage::admittedSurfaces(), true ) ) {
            throw new LifecycleException( 'invalid_surface', 'Requested surface is not admitted.' );
        }
    }

    private function requireIdentityPart( $value, $name ) {
        if ( ! is_string( $value ) || '' === $value ) {
            throw new LifecycleException( 'invalid_visual_identity', $name . ' must be non-empty text.' );
        }
    }
}
