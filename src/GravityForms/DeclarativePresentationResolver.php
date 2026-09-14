<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackageV11;
use GravityPresentationProfiles\Core\RuntimeState;

final class DeclarativePresentationResolver {
    const SURFACE = 'gravity_forms.form';

    private $workflow;

    public function __construct( SettingsLifecycleWorkflow $workflow ) {
        $this->workflow = $workflow;
    }

    public static function hasSelection( $settings ) {
        if ( ! is_array( $settings ) || ! array_key_exists( 'declarative_profile', $settings ) ) {
            return false;
        }

        return '' !== $settings['declarative_profile'] && null !== $settings['declarative_profile'];
    }

    public static function encodeReference( $package_id, $package_version, $profile_id ) {
        return $package_id . '|' . $package_version . '|' . $profile_id;
    }

    public function choices() {
        $choices = array();
        foreach ( $this->workflow->visualProfilesForSurface( self::SURFACE ) as $installed ) {
            if ( VisualProfilePackageV11::SCHEMA_VERSION !== $installed['schema_version'] ) {
                continue;
            }
            $choices[] = array(
                'label' => $installed['package_id'] . ' @ ' . $installed['package_version'] . ' — ' . $installed['profile_id'],
                'value' => self::encodeReference(
                    $installed['package_id'],
                    $installed['package_version'],
                    $installed['profile_id']
                ),
            );
        }

        return $choices;
    }

    public function resolve( $settings ) {
        if ( ! is_array( $settings ) ) {
            return RuntimeState::inactive( false, 'disabled' );
        }

        $enabled_value = isset( $settings['enabled'] ) ? $settings['enabled'] : null;
        $enabled       = in_array( $enabled_value, array( true, 1, '1' ), true );
        if ( ! $enabled ) {
            return RuntimeState::inactive( false, 'disabled' );
        }

        if ( ! array_key_exists( 'declarative_profile', $settings ) || ! is_string( $settings['declarative_profile'] ) ) {
            return RuntimeState::inactive( true, 'invalid_declarative_reference' );
        }

        $reference = trim( $settings['declarative_profile'] );
        $parts     = explode( '|', $reference );
        if ( 3 !== count( $parts ) || in_array( '', $parts, true ) ) {
            return RuntimeState::inactive( true, 'invalid_declarative_reference' );
        }

        try {
            $resolution = $this->workflow->resolveInstalledVisualProfile(
                self::SURFACE,
                $parts[0],
                $parts[1],
                $parts[2]
            );
        } catch ( LifecycleException $exception ) {
            return RuntimeState::inactive( true, 'declarative_' . $exception->reasonCode() );
        }

        if ( VisualProfilePackageV11::SCHEMA_VERSION !== $resolution['schema_version'] ) {
            return RuntimeState::inactive( true, 'unsupported_declarative_schema' );
        }
        if ( ! DeclarativeProfileDefinition::supportsCapabilities( $resolution['profile'] ) ) {
            return RuntimeState::inactive( true, 'unsupported_declarative_capability' );
        }

        return RuntimeState::active( new DeclarativeProfileDefinition( $resolution ) );
    }
}
