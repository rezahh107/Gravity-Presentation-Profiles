<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Request-local, non-PII decision trace for the production print branch.
 * It is deliberately not persisted; later Diagnostics may consume the same
 * stable events without re-implementing print decisions.
 */
final class PrintDossierDecisionTrace {
    private const STAGES = array(
        'PRINT_DOSSIER_REQUEST',
        'HOST_PRINT_CONTEXT_ADMITTED',
        'PRINT_PROFILE_RESOLVED',
        'PRINT_BINDINGS_EVALUATED',
        'PRINT_COMPOSITION_READY',
    );

    private const OUTCOMES = array(
        'intent_admitted',
        'post_permission_seam_reached',
        'profile_resolved',
        'bindings_evaluated',
        'unsupported_request_cardinality',
        'profile_not_active',
        'binding_context_missing',
        'binding_context_ambiguous',
        'binding_not_proven',
        'print_mapping_not_proven',
        'source_unavailable',
        'required_asset_unavailable',
        'composition_not_safe',
        'ready_two_pages',
    );

    private $events = array();

    public function record( $stage, $outcome ) {
        if ( ! in_array( $stage, self::STAGES, true ) || ! in_array( $outcome, self::OUTCOMES, true ) ) {
            return false;
        }

        $this->events[] = array( 'stage' => $stage, 'outcome' => $outcome );
        return true;
    }

    public function events() {
        return $this->events;
    }

    public function hasOutcome( $outcome ) {
        foreach ( $this->events as $event ) {
            if ( $event['outcome'] === $outcome ) {
                return true;
            }
        }
        return false;
    }

    public function json() {
        return function_exists( 'wp_json_encode' )
            ? wp_json_encode( $this->events, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
            : json_encode( $this->events, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
    }
}
