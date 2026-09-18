<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeReadinessService;

/**
 * Explicit production adoption path for the shipped SRWF Entry Detail profile.
 *
 * This deliberately activates presentation only after an existing authoritative
 * EnvironmentBindingSet has been proven present for the selected form. It does
 * not manufacture Entry Detail runtime claims: unresolved host regions/actions
 * remain NOT_PROVEN and EntryDetailPresentationModel therefore fails closed to
 * native Gravity Flow until separately qualified evidence exists.
 */
final class EntryDetailSetupService {
    const SURFACE = 'gravity_flow.entry_detail';

    const STATUS_COMPLETED = 'COMPLETED';
    const STATUS_CONFLICT = 'CONFLICT';
    const STATUS_FAILED = 'FAILED';

    private $operations;
    private $visual;
    private $binding_reader;

    public function __construct(
        OperationsSetupService $operations,
        VisualPackageLifecycle $visual,
        InboxRuntimeReadinessService $binding_reader
    ) {
        $this->operations = $operations;
        $this->visual = $visual;
        $this->binding_reader = $binding_reader;
    }

    public static function forWordPress() {
        return new self(
            OperationsSetupService::forWordPress(),
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            InboxRuntimeReadinessService::forWordPress()
        );
    }

    public function entryDetailProfileIdentity() {
        $artifact = $this->operations->packageArtifact();
        foreach ( $artifact['surface_profiles'] as $profile ) {
            if ( self::SURFACE === $profile['surface'] ) {
                return array(
                    'package_id' => $artifact['package_id'],
                    'package_version' => $artifact['package_version'],
                    'profile_id' => $profile['profile_id'],
                );
            }
        }

        throw new LifecycleException( 'operations_package_invalid', 'The shipped operations package declares no gravity_flow.entry_detail profile.' );
    }

    public function initialize( $request ) {
        if ( ! is_array( $request ) || ! isset( $request['form_id'] ) || count( $request ) !== 1 ) {
            throw new LifecycleException( 'invalid_entry_detail_setup_request', 'Entry Detail setup requires one explicitly selected Gravity Forms form.' );
        }

        $form_id = (int) $request['form_id'];
        if ( $form_id <= 0 ) {
            throw new LifecycleException( 'entry_detail_setup_form_not_selected', 'Select the real Gravity Forms form before adopting Entry Detail presentation.' );
        }

        $artifact = $this->operations->packageArtifact();
        $identity = $this->entryDetailProfileIdentity();
        $context = $this->operations->bindingContext( $form_id );
        $print_before = $this->visual->resolve( OperationsSetupService::PRINT_SURFACE );
        $inbox_before = $this->visual->resolve( InboxSetupService::SURFACE );
        $current = $this->visual->resolve( self::SURFACE );

        if ( null !== $current && ! $this->sameIdentity( $current, $identity ) ) {
            return $this->result(
                self::STATUS_CONFLICT,
                $form_id,
                $identity,
                array(
                    'entry_detail_activation' => array(
                        'outcome' => 'conflict',
                        'reason' => 'visual_activation_conflict',
                        'message' => 'A different Entry Detail visual activation already exists and was left unchanged.',
                        'current' => $current,
                    ),
                )
            );
        }

        $steps = array();
        try {
            $binding = $this->binding_reader->assertActiveBindingContext( $context );
            $steps['binding_context'] = array(
                'outcome' => 'reused',
                'reason' => null,
                'binding_set_id' => $binding['binding_set_id'],
                'binding_set_version' => $binding['binding_set_version'],
            );
        } catch ( LifecycleException $exception ) {
            return $this->failedResult( $form_id, $identity, 'binding_context', $exception, $steps );
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

        $steps['entry_detail_activation'] = $this->adoptActivation( $identity );
        if ( in_array( $steps['entry_detail_activation']['outcome'], array( 'conflict', 'failed' ), true ) ) {
            return $this->result(
                'conflict' === $steps['entry_detail_activation']['outcome'] ? self::STATUS_CONFLICT : self::STATUS_FAILED,
                $form_id,
                $identity,
                $steps
            );
        }

        $print_after = $this->visual->resolve( OperationsSetupService::PRINT_SURFACE );
        $inbox_after = $this->visual->resolve( InboxSetupService::SURFACE );
        if ( $print_before !== $print_after || $inbox_before !== $inbox_after ) {
            throw new LifecycleException( 'entry_detail_setup_cross_surface_activation_changed', 'Entry Detail setup unexpectedly changed an existing Inbox or Print activation.' );
        }

        $steps['existing_surfaces'] = array(
            'outcome' => 'unchanged',
            'reason' => null,
            'print_activation' => $print_after,
            'inbox_activation' => $inbox_after,
        );
        $steps['runtime_readiness'] = array(
            'outcome' => 'deferred_to_request',
            'reason' => 'live_approval_processing_required',
            'message' => 'Activation does not grant request eligibility. Structural readiness and Gravity Flow native Approval/current-assignee eligibility are evaluated fresh for each Entry Detail request.',
        );

        return $this->result( self::STATUS_COMPLETED, $form_id, $identity, $steps );
    }

    private function adoptActivation( $identity ) {
        try {
            $current = $this->visual->resolve( self::SURFACE );
            if ( null !== $current ) {
                return $this->sameIdentity( $current, $identity )
                    ? array( 'outcome' => 'already_active', 'reason' => null )
                    : array( 'outcome' => 'conflict', 'reason' => 'visual_activation_conflict', 'current' => $current );
            }

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

    private function result( $status, $form_id, $identity, $steps ) {
        return array(
            'status' => $status,
            'form_id' => $form_id,
            'entry_detail_profile' => $identity,
            'steps' => $steps,
            'request_authorization' => 'decided_per_request_by_gravity_flow',
        );
    }

    private function failedResult( $form_id, $identity, $step_name, LifecycleException $exception, $steps ) {
        $steps[ $step_name ] = array(
            'outcome' => 'failed',
            'reason' => $exception->reasonCode(),
            'message' => $exception->getMessage(),
        );
        return $this->result( self::STATUS_FAILED, $form_id, $identity, $steps );
    }
}
