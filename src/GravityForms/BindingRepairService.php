<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\AdminBindingEvidenceStore;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\RepairBindingEvidenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;

final class BindingRepairService {
    private $binding_store;
    private $evidence_store;
    private $inventory;
    private $fallback_refs;

    public function __construct( StateStore $binding_store, StateStore $evidence_store, GravityFormsFieldInventory $inventory, $fallback_refs = array() ) {
        $this->binding_store = $binding_store;
        $this->evidence_store = new AdminBindingEvidenceStore( $evidence_store );
        $this->inventory = $inventory;
        $this->fallback_refs = is_array( $fallback_refs ) ? $fallback_refs : array();
    }

    public static function forWordPress() {
        return new self(
            new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
            new WordPressOptionStateStore( AdminBindingEvidenceStore::OPTION_NAME ),
            new GravityFormsFieldInventory()
        );
    }

    public function repairField( $request ) {
        $this->requireKeys(
            $request,
            array( 'context_key', 'binding_set_id', 'binding_set_version', 'semantic_slot_key', 'field_id' ),
            'binding repair request'
        );
        $snapshot = $this->snapshot();
        $current = $this->currentRecord( $snapshot, $request );
        $artifact = $current['artifact'];
        $form_id = $artifact['context']['form_source_ref']['form_id'];
        $inventory = $this->inventory->load( $form_id );
        if ( empty( $inventory['form_exists'] ) ) {
            throw new LifecycleException( 'repair_form_missing', 'The bound Gravity Forms form no longer exists.' );
        }

        $requested_field_id = (string) $request['field_id'];
        if ( empty( $inventory['fields'][ $requested_field_id ] ) ) {
            throw new LifecycleException( 'repair_field_missing', 'The selected Gravity Forms field or compound-field input does not exist in the bound form.' );
        }
        $selected_source = $inventory['fields'][ $requested_field_id ];
        $field_id = $selected_source['field_id'];

        // Confirm that Gravity Forms can still resolve the owning field through
        // its supported API. For compound input IDs, get_field() may return the
        // owning field object while the exact input identity remains the ID
        // enumerated above from that field's authoritative inputs definition.
        if ( null === $this->inventory->exactField( $inventory['form'], $field_id ) ) {
            $parent_id = false !== strpos( (string) $field_id, '.' ) ? strstr( (string) $field_id, '.', true ) : $field_id;
            if ( null === $this->inventory->exactField( $inventory['form'], $parent_id ) ) {
                throw new LifecycleException( 'repair_field_missing', 'The selected Gravity Forms source is no longer resolvable in the bound form.' );
            }
        }

        $next = $artifact;
        $next['binding_set_version'] = $this->nextVersion( $snapshot, $artifact['binding_set_id'], $artifact['binding_set_version'] );
        $slot_found = false;
        $new_source = array( 'type' => 'gravity_forms.field', 'field_id' => $field_id );
        $ref = $this->evidence_store->confirmationRef( $next, $request['semantic_slot_key'], $new_source );

        foreach ( $next['bindings'] as &$binding ) {
            if ( $binding['semantic_slot_key'] !== $request['semantic_slot_key'] ) {
                continue;
            }
            if ( 'NOT_APPLICABLE' === $binding['state'] ) {
                throw new LifecycleException( 'repair_not_applicable', 'A NOT_APPLICABLE semantic slot cannot be repaired to a host field.' );
            }
            $slot_found = true;
            $binding['state'] = 'PROVEN';
            $binding['source_ref'] = $new_source;
            $binding['evidence_refs'] = array( $ref );
            break;
        }
        unset( $binding );
        if ( ! $slot_found ) {
            throw new LifecycleException( 'repair_slot_missing', 'The selected semantic slot is not present in the active binding artifact.' );
        }

        // Changing the source for a slot invalidates every runtime claim that
        // depended on the previous source. A declared Print option map described
        // the previous field's raw values, so it is dropped with the proof rather
        // than silently surviving into the new binding version.
        foreach ( $next['runtime_claims'] as &$claim ) {
            if ( $claim['semantic_slot_key'] !== $request['semantic_slot_key'] ) {
                continue;
            }
            if ( 'PROVEN' === $claim['evidence_state'] ) {
                $claim['evidence_state'] = 'NOT_PROVEN';
                $claim['evidence_refs'] = array();
            }
            unset( $claim['print_option_map'] );
        }
        unset( $claim );

        $next['provenance']['producer'] = 'Gravity Presentation Profiles admin binding repair';
        if ( ! in_array( $ref, $next['provenance']['evidence_refs'], true ) ) {
            $next['provenance']['evidence_refs'][] = $ref;
        }
        EnvironmentBindingSet::validate( $next );

        $gate = new RepairBindingEvidenceGate(
            $this->evidence_store,
            $next,
            $artifact,
            new EvidenceReferenceGate( $this->fallback_refs )
        );
        $lifecycle = new BindingSetLifecycle( $this->binding_store, $gate );
        $lifecycle->import( $next );
        $this->evidence_store->recordConfirmation( $next, $request['semantic_slot_key'], $new_source );
        $lifecycle->activateIfCurrent(
            array(
                'context' => $next['context'],
                'binding_set_id' => $next['binding_set_id'],
                'binding_set_version' => $next['binding_set_version'],
                'expected_current_activation' => array(
                    'binding_set_id' => $request['binding_set_id'],
                    'binding_set_version' => $request['binding_set_version'],
                ),
            )
        );

        return array(
            'status' => 'REPAIRED_AND_ACTIVATED',
            'binding_set_id' => $next['binding_set_id'],
            'previous_version' => $artifact['binding_set_version'],
            'binding_set_version' => $next['binding_set_version'],
            'semantic_slot_key' => $request['semantic_slot_key'],
        );
    }

    public function rollback( $request ) {
        $this->requireKeys(
            $request,
            array(
                'context_key',
                'binding_set_id',
                'binding_set_version',
                'expected_binding_set_id',
                'expected_binding_set_version',
            ),
            'binding rollback request'
        );
        $snapshot = $this->snapshot();
        if ( empty( $snapshot['activations'][ $request['context_key'] ] ) ) {
            throw new LifecycleException( 'rollback_context_inactive', 'The binding context is not active.' );
        }
        if ( empty( $snapshot['installed'][ $request['binding_set_id'] ][ $request['binding_set_version'] ] ) ) {
            throw new LifecycleException( 'rollback_version_missing', 'The requested rollback binding version is not installed.' );
        }
        $target = $snapshot['installed'][ $request['binding_set_id'] ][ $request['binding_set_version'] ];
        if ( $target['context_key'] !== $request['context_key'] || ! $this->wasActivated( $snapshot, $target ) ) {
            throw new LifecycleException( 'rollback_version_not_previously_authoritative', 'Rollback is limited to an exact immutable binding version that was previously activated for this context.' );
        }

        $gate = new RepairBindingEvidenceGate(
            $this->evidence_store,
            $target['artifact'],
            $target['artifact'],
            new EvidenceReferenceGate( $this->fallback_refs )
        );
        $lifecycle = new BindingSetLifecycle( $this->binding_store, $gate );
        $lifecycle->rollbackIfCurrent(
            array(
                'context' => $target['artifact']['context'],
                'binding_set_id' => $target['binding_set_id'],
                'binding_set_version' => $target['binding_set_version'],
                'expected_current_activation' => array(
                    'binding_set_id' => $request['expected_binding_set_id'],
                    'binding_set_version' => $request['expected_binding_set_version'],
                ),
            )
        );

        return array(
            'status' => 'ROLLED_BACK',
            'binding_set_id' => $target['binding_set_id'],
            'binding_set_version' => $target['binding_set_version'],
        );
    }

    private function snapshot() {
        return ( new BindingSetLifecycle( $this->binding_store, new EvidenceReferenceGate( array() ) ) )->snapshot();
    }

    private function currentRecord( $snapshot, $request ) {
        if ( empty( $snapshot['activations'][ $request['context_key'] ] ) ) {
            throw new LifecycleException( 'repair_context_inactive', 'The binding context is no longer active.' );
        }
        $active = $snapshot['activations'][ $request['context_key'] ];
        if ( $active['binding_set_id'] !== $request['binding_set_id'] || $active['binding_set_version'] !== $request['binding_set_version'] ) {
            throw new LifecycleException( 'repair_activation_changed', 'The active binding changed after this settings view loaded; refresh before repairing.' );
        }
        if ( empty( $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ] ) ) {
            throw new LifecycleException( 'repair_active_version_missing', 'The active binding artifact is missing.' );
        }
        $record = $snapshot['installed'][ $active['binding_set_id'] ][ $active['binding_set_version'] ];
        if ( $record['context_key'] !== $request['context_key'] ) {
            throw new LifecycleException( 'repair_context_mismatch', 'The active binding context does not match its immutable artifact.' );
        }
        return $record;
    }

    private function nextVersion( $snapshot, $binding_set_id, $current_version ) {
        $parts = array_map( 'intval', explode( '.', $current_version ) );
        if ( 3 !== count( $parts ) ) {
            throw new LifecycleException( 'repair_version_invalid', 'The active binding version is not semantic x.y.z.' );
        }
        $patch = $parts[2] + 1;
        do {
            $candidate = $parts[0] . '.' . $parts[1] . '.' . $patch;
            $patch++;
        } while ( isset( $snapshot['installed'][ $binding_set_id ][ $candidate ] ) );
        return $candidate;
    }

    private function wasActivated( $snapshot, $target ) {
        foreach ( $snapshot['audit'] as $record ) {
            if ( 'ACTIVATED' !== ( isset( $record['outcome'] ) ? $record['outcome'] : null ) ) {
                continue;
            }
            if ( isset( $record['binding_set_id'], $record['binding_set_version'], $record['content_hash'], $record['context_key'] )
                && $record['binding_set_id'] === $target['binding_set_id']
                && $record['binding_set_version'] === $target['binding_set_version']
                && $record['content_hash'] === $target['content_hash']
                && $record['context_key'] === $target['context_key'] ) {
                return true;
            }
        }
        return false;
    }

    private function requireKeys( $value, $expected, $path ) {
        if ( ! is_array( $value ) ) {
            throw new LifecycleException( 'invalid_request', $path . ' must be an object.' );
        }
        $actual = array_keys( $value );
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );
        if ( $actual !== $expected ) {
            throw new LifecycleException( 'invalid_request_keys', $path . ' contains missing or unknown keys.' );
        }
        foreach ( $value as $item ) {
            if ( ! is_int( $item ) && ! is_string( $item ) ) {
                throw new LifecycleException( 'invalid_request_value', $path . ' values must be scalar identifiers.' );
            }
        }
    }
}
