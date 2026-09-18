<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\AdminBindingEvidenceStore;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\RepairBindingEvidenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\CanonicalJson;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;

/**
 * Qualifies only stable, installation-level Entry Detail host sources.
 *
 * No request-local region presence, assignee identity, action permission or
 * current-user authorization is persisted here. Those remain fresh Gravity Flow
 * request facts and are evaluated by EntryDetailPresentationAdapter.
 */
final class EntryDetailRuntimeReadinessService {
    const STATUS_QUALIFIED = 'QUALIFIED_AND_ACTIVATED';
    const STATUS_ALREADY_QUALIFIED = 'ALREADY_QUALIFIED';

    private const HOST_SOURCES = array(
        'entry.created_at' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ),
        'workflow.current_step' => array( 'type' => 'gravity_flow.state', 'state_key' => 'current_step' ),
        'workflow.status' => array( 'type' => 'gravity_flow.state', 'state_key' => 'status' ),
    );

    private $binding_store;
    private $evidence_store;

    public function __construct( StateStore $binding_store, StateStore $evidence_store ) {
        $this->binding_store = $binding_store;
        $this->evidence_store = $evidence_store;
    }

    public static function forWordPress() {
        return new self(
            new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
            new WordPressOptionStateStore( AdminBindingEvidenceStore::OPTION_NAME )
        );
    }

    public function qualify( $context ) {
        if ( ! is_array( $context ) ) {
            throw new LifecycleException( 'entry_detail_runtime_invalid_request', 'Entry Detail runtime qualification requires a binding context.' );
        }

        $reader = new BindingSetLifecycle( $this->binding_store, new EvidenceReferenceGate( array() ) );
        $snapshot = $reader->snapshot();
        $context_key = $reader->contextKey( $context );
        if ( empty( $snapshot['activations'][ $context_key ] ) ) {
            throw new LifecycleException( 'entry_detail_binding_context_missing', 'No active EnvironmentBindingSet exists for the selected form.' );
        }

        $active = $snapshot['activations'][ $context_key ];
        if ( empty( $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ]['artifact'] ) ) {
            throw new LifecycleException( 'entry_detail_binding_artifact_missing', 'The active EnvironmentBindingSet artifact is unavailable.' );
        }

        $record = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ];
        if ( $record['context_key'] !== $context_key ) {
            throw new LifecycleException( 'entry_detail_binding_context_mismatch', 'The active EnvironmentBindingSet does not match the selected form context.' );
        }

        $artifact = $record['artifact'];
        $this->assertStableHostSourceContract( $context );

        $comparison_refs = array();
        $current_candidate = $this->qualifiedArtifact( $artifact, $comparison_refs );
        if ( CanonicalJson::encode( $current_candidate ) === CanonicalJson::encode( $artifact ) ) {
            return array(
                'status' => self::STATUS_ALREADY_QUALIFIED,
                'binding_set_id' => $artifact['binding_set_id'],
                'binding_set_version' => $artifact['binding_set_version'],
                'stable_sources' => array_keys( self::HOST_SOURCES ),
                'host_source_contract' => 'form_bound_public_api',
                'request_values' => 'not_persisted',
                'request_authorization' => 'decided_per_request_by_gravity_flow',
            );
        }

        $next = $artifact;
        $next['binding_set_version'] = $this->nextVersion( $snapshot, $artifact['binding_set_id'], $artifact['binding_set_version'] );
        $binding_refs = array();
        $next = $this->qualifiedArtifact( $next, $binding_refs );
        $next['provenance']['producer'] = 'Gravity Presentation Profiles Entry Detail stable host-source qualification';
        foreach ( $binding_refs as $ref ) {
            if ( ! in_array( $ref, $next['provenance']['evidence_refs'], true ) ) {
                $next['provenance']['evidence_refs'][] = $ref;
            }
        }
        EnvironmentBindingSet::validate( $next );

        $gate = new RepairBindingEvidenceGate(
            new AdminBindingEvidenceStore( $this->evidence_store ),
            $next,
            $artifact,
            new EvidenceReferenceGate( $binding_refs )
        );
        $lifecycle = new BindingSetLifecycle( $this->binding_store, $gate );
        $lifecycle->import( $next );
        $lifecycle->activateIfCurrent(
            array(
                'context' => $next['context'],
                'binding_set_id' => $next['binding_set_id'],
                'binding_set_version' => $next['binding_set_version'],
                'expected_current_activation' => array(
                    'binding_set_id' => $active['binding_set_id'],
                    'binding_set_version' => $active['binding_set_version'],
                ),
            )
        );

        return array(
            'status' => self::STATUS_QUALIFIED,
            'binding_set_id' => $next['binding_set_id'],
            'previous_version' => $artifact['binding_set_version'],
            'binding_set_version' => $next['binding_set_version'],
            'stable_sources' => array_keys( self::HOST_SOURCES ),
            'host_source_contract' => 'form_bound_public_api',
            'request_values' => 'not_persisted',
            'request_authorization' => 'decided_per_request_by_gravity_flow',
        );
    }

    /**
     * Proves installation-level source availability without manufacturing a
     * request value. Gravity Flow 3.1.0 documents both workflow getters as
     * entry-valued methods on a form-bound Gravity_Flow_API instance. Setup
     * therefore verifies the selected form, constructible API object and exact
     * public entry-parameter contract, but deliberately does not cache or
     * persist an entry/status/step value.
     */
    private function assertStableHostSourceContract( $context ) {
        if ( ! isset( $context['form_source_ref']['type'], $context['form_source_ref']['form_id'] )
            || 'gravity_forms.form' !== $context['form_source_ref']['type'] ) {
            throw new LifecycleException( 'entry_detail_host_form_context_invalid', 'Entry Detail host-source qualification requires the selected Gravity Forms form context.' );
        }

        $form_id = (int) $context['form_source_ref']['form_id'];
        if ( $form_id <= 0
            || ! class_exists( 'GFAPI' )
            || ! method_exists( 'GFAPI', 'get_form' )
            || ! method_exists( 'GFAPI', 'get_entry' ) ) {
            throw new LifecycleException( 'entry_detail_host_gravity_forms_api_unavailable', 'The required Gravity Forms host API is unavailable.' );
        }

        try {
            $form = \GFAPI::get_form( $form_id );
        } catch ( \Throwable $exception ) {
            throw new LifecycleException( 'entry_detail_host_form_unavailable', 'The selected Gravity Forms form could not be read for Entry Detail qualification.' );
        }
        if ( ! is_array( $form ) || empty( $form['id'] ) || (int) $form['id'] !== $form_id ) {
            throw new LifecycleException( 'entry_detail_host_form_unavailable', 'The selected Gravity Forms form is unavailable for Entry Detail qualification.' );
        }

        if ( ! class_exists( 'Gravity_Flow_API' ) ) {
            throw new LifecycleException( 'entry_detail_host_gravity_flow_api_unavailable', 'The Gravity Flow orchestration API is unavailable in the setup request.' );
        }

        foreach ( array( 'get_current_step', 'get_status' ) as $method_name ) {
            if ( ! method_exists( 'Gravity_Flow_API', $method_name ) ) {
                throw new LifecycleException( 'entry_detail_host_gravity_flow_api_contract_invalid', 'The Gravity Flow orchestration API does not expose the required stable Entry Detail method contract.' );
            }
            try {
                $method = new \ReflectionMethod( 'Gravity_Flow_API', $method_name );
            } catch ( \ReflectionException $exception ) {
                throw new LifecycleException( 'entry_detail_host_gravity_flow_api_contract_invalid', 'The Gravity Flow orchestration API method contract could not be inspected.' );
            }
            if ( ! $method->isPublic() || $method->isStatic() || $method->getNumberOfRequiredParameters() < 1 ) {
                throw new LifecycleException( 'entry_detail_host_gravity_flow_api_contract_invalid', 'The Gravity Flow orchestration API method contract is not the admitted entry-valued public API.' );
            }
        }

        try {
            new \Gravity_Flow_API( $form_id );
        } catch ( \Throwable $exception ) {
            throw new LifecycleException( 'entry_detail_host_gravity_flow_api_initialization_failed', 'The form-bound Gravity Flow orchestration API could not be initialized.' );
        }
    }

    private function qualifiedArtifact( $artifact, &$binding_refs ) {
        $candidate = $artifact;
        $binding_refs = array();

        foreach ( self::HOST_SOURCES as $slot_key => $source_ref ) {
            $index = $this->bindingIndex( $candidate, $slot_key );
            $binding = $candidate['bindings'][ $index ];
            if ( 'PROVEN' === $binding['state'] && ! $this->sameSource( $binding['source_ref'], $source_ref ) ) {
                throw new LifecycleException(
                    'entry_detail_host_source_conflict',
                    'A required stable Entry Detail semantic is already bound to a different authoritative source.'
                );
            }

            if ( 'PROVEN' === $binding['state'] && $this->sameSource( $binding['source_ref'], $source_ref ) ) {
                continue;
            }

            $ref = EntryDetailRuntimeEvidence::hostBindingRef( $candidate, $slot_key, $source_ref );
            $candidate['bindings'][ $index ] = array(
                'semantic_slot_key' => $slot_key,
                'state' => 'PROVEN',
                'source_ref' => $source_ref,
                'evidence_refs' => array( $ref ),
            );
            $binding_refs[] = $ref;
        }

        EnvironmentBindingSet::validate( $candidate );
        $binding_refs = array_values( array_unique( $binding_refs ) );
        return $candidate;
    }

    private function bindingIndex( $artifact, $semantic_slot_key ) {
        foreach ( $artifact['bindings'] as $index => $binding ) {
            if ( $semantic_slot_key === $binding['semantic_slot_key'] ) {
                return $index;
            }
        }
        throw new LifecycleException( 'entry_detail_semantic_slot_missing', 'A required stable Entry Detail semantic is absent from the active EnvironmentBindingSet.' );
    }

    private function sameSource( $left, $right ) {
        if ( ! is_array( $left ) || ! is_array( $right ) ) return false;
        try {
            return CanonicalJson::encode( $left ) === CanonicalJson::encode( $right );
        } catch ( \Throwable $exception ) {
            return false;
        }
    }

    private function nextVersion( $snapshot, $binding_set_id, $current_version ) {
        $parts = array_map( 'intval', explode( '.', $current_version ) );
        if ( 3 !== count( $parts ) ) {
            throw new LifecycleException( 'entry_detail_binding_version_invalid', 'The active binding version is not semantic x.y.z.' );
        }

        $patch = $parts[2] + 1;
        do {
            $candidate = $parts[0] . '.' . $parts[1] . '.' . $patch;
            $patch++;
        } while ( isset( $snapshot['installed'][ $binding_set_id ][ $candidate ] ) );

        return $candidate;
    }
}
