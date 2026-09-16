<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;

/**
 * Compatibility adapter for the WU19 request-local Print trace.
 *
 * Legacy {stage,outcome} events remain byte-shape compatible for existing
 * browser/runtime evidence, while every accepted event is also emitted into
 * the shared production diagnostics vocabulary.
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
        'full_name_derived',
        'unsupported_request_cardinality',
        // Retained so historical Print evidence stays readable. Setup and model
        // resolution failures now emit the specific outcomes below instead of
        // collapsing into this one public meaning.
        'profile_not_active',
        'print_surface_not_activated',
        'activated_package_unresolved',
        'semantic_package_unusable',
        'print_configuration_incomplete',
        'binding_context_missing',
        'binding_context_ambiguous',
        'binding_not_proven',
        'print_mapping_not_proven',
        'print_option_map_not_declared',
        'derivation_component_unresolved',
        'source_unavailable',
        'required_asset_unavailable',
        'required_asset_missing',
        'required_asset_modified',
        'runtime_exception',
        'composition_not_safe',
        'ready_two_pages',
    );

    private $events = array();

    public function __construct() {
        RuntimeDiagnostics::resetSurface( 'print.dossier' );
    }

    public function record( $stage, $outcome ) {
        if ( ! in_array( $stage, self::STAGES, true ) || ! in_array( $outcome, self::OUTCOMES, true ) ) {
            return false;
        }

        $this->events[] = array( 'stage' => $stage, 'outcome' => $outcome );
        $shared = $this->sharedDecision( $outcome );
        RuntimeDiagnostics::record(
            'print.dossier',
            $stage,
            $shared['result'],
            $shared['reason_code'],
            $shared['fallback']
        );
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

    private function sharedDecision( $outcome ) {
        $pass = array(
            'intent_admitted',
            'profile_resolved',
            'bindings_evaluated',
            'full_name_derived',
            'ready_two_pages',
        );
        if ( in_array( $outcome, $pass, true ) ) {
            return array( 'result' => RuntimeDecisionTrace::RESULT_PASS, 'reason_code' => null, 'fallback' => null );
        }
        if ( 'post_permission_seam_reached' === $outcome ) {
            return array(
                'result' => RuntimeDecisionTrace::RESULT_PASS,
                'reason_code' => null,
                'fallback' => 'host_authorization_preserved',
            );
        }
        // A single unresolved slot leaves that value blank; it never fails the
        // whole dossier, which stays physically usable for manual completion.
        $blank_value = array(
            'binding_not_proven',
            'print_mapping_not_proven',
            'print_option_map_not_declared',
            'derivation_component_unresolved',
            'source_unavailable',
        );
        if ( in_array( $outcome, $blank_value, true ) ) {
            return array(
                'result' => RuntimeDecisionTrace::RESULT_SKIP,
                'reason_code' => $outcome,
                'fallback' => 'blank_unproven_value',
            );
        }

        return array(
            'result' => RuntimeDecisionTrace::RESULT_FAIL,
            'reason_code' => $outcome,
            'fallback' => 'dossier_not_rendered',
        );
    }
}
