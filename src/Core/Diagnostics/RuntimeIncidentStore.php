<?php

namespace GravityPresentationProfiles\Core\Diagnostics;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

final class RuntimeIncidentStore {
    const OPTION_NAME = 'gpp_runtime_diagnostics_v1';
    const SCHEMA_VERSION = '1.0.0';
    private const INCIDENT_LIMIT = 25;

    private $store;

    public function __construct( StateStore $store ) {
        $this->store = $store;
    }

    public static function forWordPress() {
        return new self( new WordPressOptionStateStore( self::OPTION_NAME ) );
    }

    public function recordTrace( $trace ) {
        if ( ! RuntimeDecisionTrace::validateSnapshot( $trace ) ) {
            throw new LifecycleException( 'invalid_runtime_trace', 'Runtime diagnostics received an invalid decision trace.' );
        }
        if ( 'NOT_APPLICABLE' === $trace['status'] ) {
            return false;
        }

        $state = $this->loadState();

        // Frontend instrumentation must not become a write-on-every-request
        // telemetry subsystem. Keep one representative success per surface and
        // collapse consecutive identical incidents. A materially different
        // branch/result remains eligible for persistence.
        if ( 'PASS' === $trace['status'] ) {
            if ( isset( $state['recent_success'][ $trace['surface'] ] )
                && $this->sameTrace( $state['recent_success'][ $trace['surface'] ], $trace ) ) {
                return false;
            }
        } elseif ( ! empty( $state['incidents'] ) ) {
            $last = $state['incidents'][ count( $state['incidents'] ) - 1 ];
            if ( $this->sameTrace( $last, $trace ) ) {
                return false;
            }
        }

        $record = $trace;
        $record['observed_at_utc'] = gmdate( 'c' );

        if ( 'PASS' === $trace['status'] ) {
            $state['recent_success'][ $trace['surface'] ] = $record;
        } else {
            $state['incidents'][] = $record;
            if ( count( $state['incidents'] ) > self::INCIDENT_LIMIT ) {
                $state['incidents'] = array_slice( $state['incidents'], -1 * self::INCIDENT_LIMIT );
            }
        }

        $expected_revision = $state['revision'];
        $state['revision'] = $expected_revision + 1;
        if ( ! $this->store->commit( $expected_revision, $state ) ) {
            throw new LifecycleException( 'runtime_diagnostics_commit_failed', 'Runtime diagnostics persistence failed; operational behavior remains unchanged.' );
        }
        return true;
    }

    public function snapshot() {
        return $this->loadState();
    }

    public function reset() {
        $state = $this->loadState();
        $expected_revision = $state['revision'];
        $next = $this->initialState();
        $next['revision'] = $expected_revision + 1;
        if ( ! $this->store->commit( $expected_revision, $next ) ) {
            throw new LifecycleException( 'runtime_diagnostics_commit_failed', 'Runtime diagnostics reset failed.' );
        }
    }

    private function sameTrace( $record, $trace ) {
        if ( ! is_array( $record ) ) {
            return false;
        }
        $existing = $record;
        unset( $existing['observed_at_utc'] );
        return $existing === $trace;
    }

    private function loadState() {
        $state = $this->store->load();
        if ( null === $state ) {
            return $this->initialState();
        }
        if ( ! is_array( $state ) || ! isset( $state['schema_version'], $state['revision'], $state['incidents'], $state['recent_success'] ) ) {
            throw new LifecycleException( 'runtime_diagnostics_state_corrupt', 'Runtime diagnostics state is corrupt.' );
        }
        if ( self::SCHEMA_VERSION !== $state['schema_version'] || ! is_int( $state['revision'] ) || $state['revision'] < 0 || ! is_array( $state['incidents'] ) || ! is_array( $state['recent_success'] ) ) {
            throw new LifecycleException( 'runtime_diagnostics_state_corrupt', 'Runtime diagnostics state is corrupt.' );
        }
        foreach ( $state['incidents'] as $record ) {
            if ( ! $this->validRecord( $record ) || ! in_array( $record['status'], array( 'FAIL', 'DEGRADED' ), true ) ) {
                throw new LifecycleException( 'runtime_diagnostics_state_corrupt', 'Runtime diagnostics incident record is corrupt.' );
            }
        }
        foreach ( $state['recent_success'] as $surface => $record ) {
            if ( $surface !== $record['surface'] || ! $this->validRecord( $record ) || 'PASS' !== $record['status'] ) {
                throw new LifecycleException( 'runtime_diagnostics_state_corrupt', 'Runtime diagnostics success record is corrupt.' );
            }
        }
        return $state;
    }

    private function validRecord( $record ) {
        if ( ! is_array( $record ) || empty( $record['observed_at_utc'] ) || ! is_string( $record['observed_at_utc'] ) ) {
            return false;
        }
        $trace = $record;
        unset( $trace['observed_at_utc'] );
        return RuntimeDecisionTrace::validateSnapshot( $trace );
    }

    private function initialState() {
        return array(
            'schema_version' => self::SCHEMA_VERSION,
            'revision' => 0,
            'incidents' => array(),
            'recent_success' => array(),
        );
    }
}
