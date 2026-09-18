<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/** Stores only the latest bounded, non-PII explicit Entry Detail setup outcome. */
final class EntryDetailSetupDiagnosticStore {
    const OPTION_NAME = 'gpp_entry_detail_setup_diagnostic_v1';
    const SCHEMA_VERSION = '1.0.0';

    private const RESULTS = array( 'COMPLETED', 'CONFLICT', 'FAILED' );
    private const STEPS = array(
        'binding_context',
        'stable_host_sources',
        'package_import',
        'entry_detail_activation',
        'cross_surface_preservation',
    );

    private $store;

    public function __construct( StateStore $store ) {
        $this->store = $store;
    }

    public static function forWordPress() {
        return new self( new WordPressOptionStateStore( self::OPTION_NAME ) );
    }

    /**
     * Normalize and persist the outcome returned by EntryDetailSetupService.
     * This is shared by every explicit administrator entry point so support
     * diagnostics cannot drift when the host settings lifecycle changes.
     */
    public function recordServiceResult( $form_id, $result ) {
        $status = is_array( $result ) && isset( $result['status'] ) && in_array( $result['status'], self::RESULTS, true )
            ? $result['status']
            : EntryDetailSetupService::STATUS_FAILED;
        $step = 'binding_context';
        $reason = 'entry_detail_setup_failed';

        if ( EntryDetailSetupService::STATUS_COMPLETED === $status ) {
            $step = 'cross_surface_preservation';
            $reason = 'entry_detail_setup_completed';
        } elseif ( is_array( $result ) && ! empty( $result['steps'] ) && is_array( $result['steps'] ) ) {
            foreach ( $result['steps'] as $step_name => $details ) {
                $outcome = is_array( $details ) && isset( $details['outcome'] ) ? $details['outcome'] : '';
                if ( ! in_array( $outcome, array( 'conflict', 'failed' ), true ) ) {
                    continue;
                }
                $step = $this->diagnosticStep( $step_name, isset( $details['reason'] ) ? $details['reason'] : null );
                $reason = $this->boundedReason( isset( $details['reason'] ) ? $details['reason'] : null, 'entry_detail_setup_failed' );
                break;
            }
        }

        $binding = null;
        if ( EntryDetailSetupService::STATUS_COMPLETED === $status
            && is_array( $result )
            && ! empty( $result['steps']['stable_host_sources']['binding_set_id'] )
            && ! empty( $result['steps']['stable_host_sources']['binding_set_version'] ) ) {
            $binding = array(
                'binding_set_id' => (string) $result['steps']['stable_host_sources']['binding_set_id'],
                'binding_set_version' => (string) $result['steps']['stable_host_sources']['binding_set_version'],
            );
        }

        $activation = null;
        if ( EntryDetailSetupService::STATUS_COMPLETED === $status
            && is_array( $result )
            && ! empty( $result['entry_detail_profile'] )
            && is_array( $result['entry_detail_profile'] ) ) {
            $activation = $result['entry_detail_profile'];
        }

        return $this->record(
            array(
                'selected_form_id' => (int) $form_id,
                'result' => $status,
                'step' => $step,
                'reason_code' => $reason,
                'binding_set' => $binding,
                'entry_detail_activation' => $activation,
            )
        );
    }

    /** Persist a bounded failure raised before a service result can be returned. */
    public function recordFailureReason( $form_id, $reason_code ) {
        return $this->record(
            array(
                'selected_form_id' => (int) $form_id,
                'result' => EntryDetailSetupService::STATUS_FAILED,
                'step' => $this->diagnosticStep( null, $reason_code ),
                'reason_code' => $this->boundedReason( $reason_code, 'entry_detail_setup_failed' ),
                'binding_set' => null,
                'entry_detail_activation' => null,
            )
        );
    }

    public function recordUnexpectedFailure( $form_id ) {
        return $this->recordFailureReason( $form_id, 'entry_detail_setup_unexpected_failure' );
    }

    public function record( $attempt ) {
        $record = $this->normalize( $attempt );
        $state = $this->loadState();
        $expected_revision = $state['revision'];
        $state['revision'] = $expected_revision + 1;
        $state['latest_attempt'] = $record;

        if ( ! $this->store->commit( $expected_revision, $state ) ) {
            throw new LifecycleException( 'entry_detail_setup_diagnostic_commit_failed', 'Entry Detail setup diagnostic persistence failed.' );
        }

        return $record;
    }

    public function snapshot() {
        return $this->loadState();
    }

    private function diagnosticStep( $step_name, $reason_code ) {
        $reason = is_string( $reason_code ) ? $reason_code : '';
        if ( 0 === strpos( $reason, 'entry_detail_binding_' ) || 'setup_installation_unknown' === $reason ) {
            return 'binding_context';
        }
        if ( in_array( $step_name, array( 'stable_host_sources', 'package_import', 'entry_detail_activation' ), true ) ) {
            return $step_name;
        }
        if ( 'existing_surfaces' === $step_name || 'cross_surface_preservation' === $step_name || 'entry_detail_setup_cross_surface_activation_changed' === $reason ) {
            return 'cross_surface_preservation';
        }
        if ( 0 === strpos( $reason, 'operations_package_' ) ) {
            return 'package_import';
        }
        if ( 0 === strpos( $reason, 'entry_detail_host_' ) || 0 === strpos( $reason, 'entry_detail_semantic_' ) ) {
            return 'stable_host_sources';
        }
        return 'binding_context';
    }

    private function boundedReason( $reason_code, $fallback ) {
        if ( is_string( $reason_code ) && '' !== $reason_code && 1 === preg_match( '/^[a-z0-9_]+$/', $reason_code ) ) {
            return $reason_code;
        }
        return $fallback;
    }

    private function normalize( $attempt ) {
        if ( ! is_array( $attempt ) ) {
            throw new LifecycleException( 'invalid_entry_detail_setup_diagnostic', 'Entry Detail setup diagnostic must be bounded structured data.' );
        }

        $form_id = isset( $attempt['selected_form_id'] ) ? (int) $attempt['selected_form_id'] : 0;
        $result = isset( $attempt['result'] ) ? (string) $attempt['result'] : '';
        $step = isset( $attempt['step'] ) ? (string) $attempt['step'] : '';
        $reason = isset( $attempt['reason_code'] ) && is_string( $attempt['reason_code'] ) ? $attempt['reason_code'] : '';

        if ( $form_id <= 0 || ! in_array( $result, self::RESULTS, true ) || ! in_array( $step, self::STEPS, true ) ) {
            throw new LifecycleException( 'invalid_entry_detail_setup_diagnostic', 'Entry Detail setup diagnostic contains an unadmitted result or step.' );
        }
        if ( '' === $reason || 1 !== preg_match( '/^[a-z0-9_]+$/', $reason ) ) {
            throw new LifecycleException( 'invalid_entry_detail_setup_diagnostic', 'Entry Detail setup diagnostic requires a bounded reason code.' );
        }

        $binding = null;
        if ( isset( $attempt['binding_set'] ) && null !== $attempt['binding_set'] ) {
            $binding = $this->identity( $attempt['binding_set'], array( 'binding_set_id', 'binding_set_version' ) );
        }
        $activation = null;
        if ( isset( $attempt['entry_detail_activation'] ) && null !== $attempt['entry_detail_activation'] ) {
            $activation = $this->identity( $attempt['entry_detail_activation'], array( 'package_id', 'package_version', 'profile_id' ) );
        }

        return array(
            'attempted' => true,
            'selected_form_id' => $form_id,
            'result' => $result,
            'step' => $step,
            'reason_code' => $reason,
            'binding_set' => $binding,
            'entry_detail_activation' => $activation,
            'observed_at_utc' => gmdate( 'c' ),
        );
    }

    private function identity( $value, $keys ) {
        if ( ! is_array( $value ) ) {
            throw new LifecycleException( 'invalid_entry_detail_setup_diagnostic', 'Entry Detail setup diagnostic identity is invalid.' );
        }
        $identity = array();
        foreach ( $keys as $key ) {
            if ( ! isset( $value[ $key ] ) || ! is_string( $value[ $key ] ) || '' === $value[ $key ] ) {
                throw new LifecycleException( 'invalid_entry_detail_setup_diagnostic', 'Entry Detail setup diagnostic identity is incomplete.' );
            }
            if ( 1 !== preg_match( '/^[A-Za-z0-9._:-]+$/', $value[ $key ] ) ) {
                throw new LifecycleException( 'invalid_entry_detail_setup_diagnostic', 'Entry Detail setup diagnostic identity is not bounded.' );
            }
            $identity[ $key ] = $value[ $key ];
        }
        return $identity;
    }

    private function loadState() {
        $state = $this->store->load();
        if ( null === $state ) {
            return array(
                'schema_version' => self::SCHEMA_VERSION,
                'revision' => 0,
                'latest_attempt' => null,
            );
        }
        if ( ! is_array( $state )
            || self::SCHEMA_VERSION !== ( isset( $state['schema_version'] ) ? $state['schema_version'] : null )
            || ! isset( $state['revision'] )
            || ! is_int( $state['revision'] )
            || $state['revision'] < 0
            || ! array_key_exists( 'latest_attempt', $state ) ) {
            throw new LifecycleException( 'entry_detail_setup_diagnostic_state_corrupt', 'Entry Detail setup diagnostic state is corrupt.' );
        }
        return $state;
    }
}
