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
