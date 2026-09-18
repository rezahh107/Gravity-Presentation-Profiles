<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\ContractViolation;

/**
 * Internal runtime authority shared by the Print surface and Entry Detail.
 *
 * This class evaluates configuration/capability only. It never grants a user
 * permission to print: Gravity Flow re-authorizes the actual Print request.
 *
 * @internal
 */
final class PrintDossierRuntime {
    private static $model_loaded = false;
    private static $model_resolution = null;

    public static function reset() {
        self::$model_loaded = false;
        self::$model_resolution = null;
    }

    public static function utilityAvailable( $entry ) {
        if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
            return false;
        }

        $resolution = self::modelResolution();
        if ( empty( $resolution['model'] ) || 'ready' !== $resolution['model']->bindingContextStatus( $entry ) ) {
            return false;
        }

        $assets = PrintDossierAssets::integrity();
        return ! empty( $assets['ready'] );
    }

    /**
     * @return array{model: ?PrintDossierPresentationModel, reason: ?string}
     */
    public static function modelResolution() {
        if ( self::$model_loaded ) {
            return self::$model_resolution;
        }

        self::$model_loaded     = true;
        self::$model_resolution = self::resolveModel();

        return self::$model_resolution;
    }

    private static function resolveModel() {
        try {
            $visual     = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $activation = $visual->resolve( PrintDossierPresentationAdapter::SURFACE );
            if ( null === $activation ) {
                return self::unresolvedModel( 'print_surface_not_activated' );
            }

            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $package ) {
                return self::unresolvedModel( 'activated_package_unresolved' );
            }

            $profile = $visual->effectiveProfile( PrintDossierPresentationAdapter::SURFACE );
            if ( null === $profile ) {
                return self::unresolvedModel( 'semantic_package_unusable' );
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );

            return array(
                'model' => new PrintDossierPresentationModel(
                    $profile,
                    self::activeBindingSets( $bindings->snapshot() ),
                    $package['semantic_slots']
                ),
                'reason' => null,
            );
        } catch ( ContractViolation $exception ) {
            return self::unresolvedModel( 'semantic_package_unusable', $exception );
        } catch ( LifecycleException $exception ) {
            $reason = 'activation_state_corrupt' === $exception->reasonCode()
                ? 'semantic_package_unusable'
                : 'activated_package_unresolved';

            return self::unresolvedModel( $reason, $exception );
        } catch ( \Throwable $exception ) {
            return self::unresolvedModel( 'runtime_exception', $exception );
        }
    }

    private static function unresolvedModel( $reason, \Throwable $exception = null ) {
        if ( null !== $exception ) {
            RuntimeDiagnostics::recordException(
                PrintDossierPresentationAdapter::SURFACE,
                'PRINT_PROFILE_RESOLVED',
                $reason,
                'dossier_not_rendered',
                $exception
            );
        }

        return array( 'model' => null, 'reason' => $reason );
    }

    private static function activeVisualPackage( $snapshot, $activation ) {
        if ( ! is_array( $snapshot ) || ! is_array( $activation ) || ! isset( $activation['package_id'], $activation['package_version'] ) ) {
            return null;
        }
        $id = $activation['package_id'];
        $version = $activation['package_version'];
        if ( empty( $snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
            return null;
        }
        $package = $snapshot['installed'][ $id ][ $version ]['artifact'];
        return ! empty( $package['semantic_slots'] ) && is_array( $package['semantic_slots'] ) ? $package : null;
    }

    private static function activeBindingSets( $snapshot ) {
        if ( ! is_array( $snapshot ) || empty( $snapshot['installed'] ) || empty( $snapshot['activations'] ) ) {
            return array();
        }

        $active = array();
        foreach ( $snapshot['activations'] as $context_key => $identity ) {
            if ( ! isset( $identity['binding_set_id'], $identity['binding_set_version'] ) ) {
                continue;
            }
            $id = $identity['binding_set_id'];
            $version = $identity['binding_set_version'];
            if ( ! isset( $snapshot['installed'][ $id ][ $version ] ) ) {
                continue;
            }
            $record = $snapshot['installed'][ $id ][ $version ];
            if ( ! isset( $record['context_key'], $record['artifact'] ) || $record['context_key'] !== $context_key ) {
                continue;
            }
            $active[] = $record['artifact'];
        }
        return $active;
    }
}
