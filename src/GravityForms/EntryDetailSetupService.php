<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailRuntimeReadinessService;

/** Explicit production adoption path for the shipped SRWF Entry Detail profile. */
final class EntryDetailSetupService {
    const SURFACE = 'gravity_flow.entry_detail';

    const STATUS_COMPLETED = 'COMPLETED';
    const STATUS_CONFLICT = 'CONFLICT';
    const STATUS_FAILED = 'FAILED';

    private $operations;
    private $visual;
    private $runtime_readiness;

    public function __construct(
        OperationsSetupService $operations,
        VisualPackageLifecycle $visual,
        EntryDetailRuntimeReadinessService $runtime_readiness
    ) {
        $this->operations = $operations;
        $this->visual = $visual;
        $this->runtime_readiness = $runtime_readiness;
    }

    public static function forWordPress() {
        return new self(
            OperationsSetupService::forWordPress(),
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            EntryDetailRuntimeReadinessService::forWordPress()
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
            $qualification = $this->runtime_readiness->qualify( $context );
            $steps['stable_host_sources'] = array(
                'outcome' => EntryDetailRuntimeReadinessService::STATUS_ALREADY_QUALIFIED === $qualification['status'] ? 'already_qualified' : 'qualified',
                'reason' => null,
                'binding_set_id' => $qualification['binding_set_id'],
                'binding_set_version' => $qualification['binding_set_version'],
                'sources' => $qualification['stable_sources'],
                'host_source_contract' => $qualification['host_source_contract'],
                'request_values' => $qualification['request_values'],
            );
        } catch ( LifecycleException $exception ) {
            return $this->failedResult( $form_id, $identity, 'stable_host_sources', $exception, $steps );
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
            $steps['cross_surface_preservation'] = array(
                'outcome' => 'failed',
                'reason' => 'entry_detail_setup_cross_surface_activation_changed',
                'message' => 'Entry Detail setup unexpectedly changed an existing Inbox or Print activation.',
            );
            return $this->result( self::STATUS_FAILED, $form_id, $identity, $steps );
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
            'message' => 'Stable host sources are qualified during adoption, but activation never grants request eligibility. Gravity Flow native Approval/current-assignee eligibility is evaluated fresh for every Entry Detail request.',
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
