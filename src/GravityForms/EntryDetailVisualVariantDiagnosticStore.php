<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

/** Observational switch-result diagnostics; never consulted as visual authority. */
final class EntryDetailVisualVariantDiagnosticStore {
    const OPTION_NAME = 'gpp_entry_detail_visual_variant_diagnostic_v1';
    const SCHEMA_VERSION = '1.0.0';

    private $store;

    public function __construct( StateStore $store ) {
        $this->store = $store;
    }

    public static function forWordPress() {
        return new self( new WordPressOptionStateStore( self::OPTION_NAME ) );
    }

    public function recordSuccess( $variant, $activation ) {
        return $this->record( $variant, 'COMPLETED', 'entry_detail_visual_variant_switched', $activation );
    }

    public function recordFailure( $variant, $reason_code, $activation = null ) {
        $reason = is_string( $reason_code ) && 1 === preg_match( '/^[a-z0-9_]{1,96}$/', $reason_code )
            ? $reason_code
            : 'entry_detail_visual_variant_switch_failed';
        $result = in_array( $reason, array( 'visual_activation_conflict', 'entry_detail_variant_activation_unrecognized' ), true )
            ? 'CONFLICT'
            : 'FAILED';
        return $this->record( $variant, $result, $reason, $activation );
    }

    public function snapshot() {
        $state = $this->store->load();
        if ( null === $state ) {
            return array( 'schema_version' => self::SCHEMA_VERSION, 'revision' => 0, 'latest_attempt' => null );
        }
        if ( ! is_array( $state )
            || self::SCHEMA_VERSION !== ( isset( $state['schema_version'] ) ? $state['schema_version'] : null )
            || ! isset( $state['revision'] )
            || ! is_int( $state['revision'] )
            || $state['revision'] < 0
            || ! array_key_exists( 'latest_attempt', $state ) ) {
            throw new LifecycleException( 'entry_detail_visual_variant_diagnostic_state_corrupt', 'Entry Detail visual variant diagnostic state is corrupt.' );
        }
        return $state;
    }

    private function record( $variant, $result, $reason, $activation ) {
        if ( ! in_array( $variant, array( EntryDetailVisualVariant::CURRENT_SAFE, EntryDetailVisualVariant::FULL_WIDTH ), true ) ) {
            $variant = null;
        }
        $identity = null;
        if ( is_array( $activation ) ) {
            $identity = array();
            foreach ( array( 'package_id', 'package_version', 'profile_id' ) as $key ) {
                if ( ! isset( $activation[ $key ] ) || ! is_string( $activation[ $key ] ) || '' === $activation[ $key ] ) {
                    $identity = null;
                    break;
                }
                $identity[ $key ] = $activation[ $key ];
            }
        }

        $state = $this->snapshot();
        $expected_revision = $state['revision'];
        $state['revision'] = $expected_revision + 1;
        $state['latest_attempt'] = array(
            'result' => $result,
            'target_variant' => $variant,
            'reason_code' => $reason,
            'entry_detail_activation' => $identity,
            'observed_at_utc' => gmdate( 'c' ),
        );
        if ( ! $this->store->commit( $expected_revision, $state ) ) {
            throw new LifecycleException( 'entry_detail_visual_variant_diagnostic_commit_failed', 'Entry Detail visual variant diagnostic persistence failed.' );
        }
        return $state['latest_attempt'];
    }
}
