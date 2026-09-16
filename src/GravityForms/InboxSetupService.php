<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeReadinessService;

/**
 * Explicit production adoption path for the shipped SRWF Inbox presentation.
 *
 * Print setup remains separate. This service requires and reuses the existing
 * active EnvironmentBindingSet for the selected form, qualifies Inbox runtime
 * sources in that same lifecycle, then conflict-safely adopts the surface-only
 * Inbox visual profile.
 */
final class InboxSetupService {
    const SURFACE = 'gravity_flow.inbox';

    const STATUS_COMPLETED = 'COMPLETED';
    const STATUS_CONFLICT = 'CONFLICT';
    const STATUS_FAILED = 'FAILED';

    private const LEGACY_COMPATIBLE_PACKAGE_VERSIONS = array( '1.0.0' );

    private $operations;
    private $visual;
    private $runtime_readiness;

    public function __construct(
        OperationsSetupService $operations,
        VisualPackageLifecycle $visual,
        InboxRuntimeReadinessService $runtime_readiness
    ) {
        $this->operations = $operations;
        $this->visual = $visual;
        $this->runtime_readiness = $runtime_readiness;
    }

    public static function forWordPress() {
        return new self(
            OperationsSetupService::forWordPress(),
            new VisualPackageLifecycle(
                new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
            ),
            InboxRuntimeReadinessService::forWordPress()
        );
    }

    /**
     * Return the canonical shipped Operations Package unchanged.
     *
     * OperationsSetupService owns package loading and validation. Inbox setup
     * may inspect that artifact but must not rewrite package-owned facts.
     */
    public function packageArtifact() {
        return $this->operations->packageArtifact();
    }

    public function inboxProfileIdentity() {
        $artifact = $this->packageArtifact();
        foreach ( $artifact['surface_profiles'] as $profile ) {
            if ( self::SURFACE === $profile['surface'] ) {
                return array(
                    'package_id' => $artifact['package_id'],
                    'package_version' => $artifact['package_version'],
                    'profile_id' => $profile['profile_id'],
                );
            }
        }

        throw new LifecycleException( 'operations_package_invalid', 'The shipped operations package declares no gravity_flow.inbox profile.' );
    }

    public function initialize( $request ) {
        if ( ! is_array( $request ) || ! isset( $request['form_id'] ) || count( $request ) !== 1 ) {
            throw new LifecycleException( 'invalid_inbox_setup_request', 'Inbox setup requires one explicitly selected Gravity Forms form.' );
        }

        $form_id = (int) $request['form_id'];
        if ( $form_id <= 0 ) {
            throw new LifecycleException( 'inbox_setup_form_not_selected', 'Select the real Gravity Forms form before adopting Inbox presentation.' );
        }

        $artifact = $this->packageArtifact();
        $identity = $this->inboxProfileIdentity();
        $context = $this->operations->bindingContext( $form_id );
        $print_before = $this->visual->resolve( OperationsSetupService::PRINT_SURFACE );
        $current = $this->visual->resolve( self::SURFACE );

        if ( null !== $current && ! $this->compatibleCurrentActivation( $current, $identity ) ) {
            return array(
                'status' => self::STATUS_CONFLICT,
                'form_id' => $form_id,
                'inbox_profile' => $identity,
                'steps' => array(
                    'inbox_activation' => array(
                        'outcome' => 'conflict',
                        'reason' => 'visual_activation_conflict',
                        'message' => 'A different Inbox visual activation already exists and was left unchanged.',
                        'current' => $current,
                    ),
                ),
                'request_authorization' => 'decided_per_request_by_gravity_flow',
            );
        }

        $steps = array();
        try {
            $binding_identity = $this->runtime_readiness->assertActiveBindingContext( $context );
            $steps['binding_context'] = array(
                'outcome' => 'reused',
                'reason' => null,
                'binding_set_id' => $binding_identity['binding_set_id'],
                'binding_set_version' => $binding_identity['binding_set_version'],
            );
        } catch ( LifecycleException $exception ) {
            return $this->failedResult( $form_id, $identity, 'binding_context', $exception );
        }

        try {
            $import = $this->visual->import( $artifact );
            $steps['package_import'] = array(
                'outcome' => 'IDEMPOTENT' === $import['status'] ? 'already_installed' : 'installed',
                'reason' => null,
                'content_hash' => $import['content_hash'],
            );
        } catch ( LifecycleException $exception ) {
            return $this->failedResult( $form_id, $identity, 'package_import', $exception, $steps );
        }

        $steps['inbox_activation'] = $this->adoptActivation( $identity );
        if ( in_array( $steps['inbox_activation']['outcome'], array( 'conflict', 'failed' ), true ) ) {
            return array(
                'status' => 'conflict' === $steps['inbox_activation']['outcome'] ? self::STATUS_CONFLICT : self::STATUS_FAILED,
                'form_id' => $form_id,
                'inbox_profile' => $identity,
                'steps' => $steps,
                'request_authorization' => 'decided_per_request_by_gravity_flow',
            );
        }

        try {
            $runtime = $this->runtime_readiness->qualify( $context, $artifact['semantic_slots'] );
            $steps['runtime_readiness'] = array(
                'outcome' => InboxRuntimeReadinessService::STATUS_ALREADY_QUALIFIED === $runtime['status'] ? 'already_qualified' : 'qualified',
                'reason' => null,
                'binding_set_id' => $runtime['binding_set_id'],
                'binding_set_version' => $runtime['binding_set_version'],
                'outcomes' => $runtime['outcomes'],
            );
        } catch ( LifecycleException $exception ) {
            $steps['runtime_readiness'] = array(
                'outcome' => 'failed',
                'reason' => $exception->reasonCode(),
                'message' => $exception->getMessage(),
            );
        }

        $print_after = $this->visual->resolve( OperationsSetupService::PRINT_SURFACE );
        if ( $print_before !== $print_after ) {
            throw new LifecycleException( 'inbox_setup_print_activation_changed', 'Inbox setup unexpectedly changed the existing Print activation.' );
        }

        $steps['print_activation'] = array(
            'outcome' => 'unchanged',
            'reason' => null,
            'activation' => $print_after,
        );

        return array(
            'status' => 'failed' === $steps['runtime_readiness']['outcome'] ? self::STATUS_FAILED : self::STATUS_COMPLETED,
            'form_id' => $form_id,
            'inbox_profile' => $identity,
            'steps' => $steps,
            'request_authorization' => 'decided_per_request_by_gravity_flow',
        );
    }

    private function adoptActivation( $identity ) {
        try {
            $current = $this->visual->resolve( self::SURFACE );
        } catch ( LifecycleException $exception ) {
            return array( 'outcome' => 'failed', 'reason' => $exception->reasonCode(), 'message' => $exception->getMessage() );
        }

        if ( null !== $current ) {
            if ( $this->sameIdentity( $current, $identity ) ) {
                return array( 'outcome' => 'already_active', 'reason' => null );
            }

            if ( $this->legacyCompatibleActivation( $current, $identity ) ) {
                try {
                    $this->visual->activateIfCurrent(
                        array(
                            'surface' => self::SURFACE,
                            'package_id' => $identity['package_id'],
                            'package_version' => $identity['package_version'],
                            'profile_id' => $identity['profile_id'],
                            'expected_current_activation' => $current,
                        )
                    );
                } catch ( LifecycleException $exception ) {
                    return array(
                        'outcome' => 'visual_activation_conflict' === $exception->reasonCode() ? 'conflict' : 'failed',
                        'reason' => $exception->reasonCode(),
                        'message' => $exception->getMessage(),
                    );
                }

                return array( 'outcome' => 'updated_compatible', 'reason' => null );
            }

            return array(
                'outcome' => 'conflict',
                'reason' => 'visual_activation_conflict',
                'message' => 'A different Inbox visual activation already exists and was left unchanged.',
                'current' => $current,
            );
        }

        try {
            $this->visual->activateIfCurrent(
                array(
                    'surface' => self::SURFACE,
                    'package_id' => $identity['package_id'],
                    'package_version' => $identity['package_version'],
                    'profile_id' => $identity['profile_id'],
                    'expected_current_activation' => null,
                )
            );
        } catch ( LifecycleException $exception ) {
            return array(
                'outcome' => 'visual_activation_conflict' === $exception->reasonCode() ? 'conflict' : 'failed',
                'reason' => $exception->reasonCode(),
                'message' => $exception->getMessage(),
            );
        }

        return array( 'outcome' => 'activated', 'reason' => null );
    }

    private function compatibleCurrentActivation( $current, $identity ) {
        return $this->sameIdentity( $current, $identity ) || $this->legacyCompatibleActivation( $current, $identity );
    }

    private function legacyCompatibleActivation( $current, $identity ) {
        return is_array( $current )
            && isset( $current['package_id'], $current['package_version'], $current['profile_id'] )
            && $current['package_id'] === $identity['package_id']
            && $current['profile_id'] === $identity['profile_id']
            && in_array( $current['package_version'], self::LEGACY_COMPATIBLE_PACKAGE_VERSIONS, true );
    }

    private function sameIdentity( $current, $identity ) {
        if ( ! is_array( $current ) ) {
            return false;
        }
        foreach ( array( 'package_id', 'package_version', 'profile_id' ) as $key ) {
            if ( ! isset( $current[ $key ] ) || $current[ $key ] !== $identity[ $key ] ) {
                return false;
            }
        }
        return true;
    }

    private function failedResult( $form_id, $identity, $step_name, LifecycleException $exception, $steps = array() ) {
        $steps[ $step_name ] = array(
            'outcome' => 'failed',
            'reason' => $exception->reasonCode(),
            'message' => $exception->getMessage(),
        );

        return array(
            'status' => self::STATUS_FAILED,
            'form_id' => $form_id,
            'inbox_profile' => $identity,
            'steps' => $steps,
            'request_authorization' => 'decided_per_request_by_gravity_flow',
        );
    }
}
