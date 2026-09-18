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

/**
 * Bounded multi-field variant of the existing BindingRepairService mutation.
 *
 * One Owner submit is normalized and validated against one fresh Gravity Forms
 * inventory, then produces at most one next immutable EnvironmentBindingSet and
 * one compare-and-set activation. It deliberately uses the same lifecycle and
 * evidence stores as the existing single-row repair path.
 */
final class BindingBatchRepairService {
    private $binding_store;
    private $evidence_store;
    private $inventory;
    private $fallback_refs;

    public function __construct( StateStore $binding_store, StateStore $evidence_store, GravityFormsFieldInventory $inventory, $fallback_refs = array() ) {
        $this->binding_store  = $binding_store;
        $this->evidence_store = new AdminBindingEvidenceStore( $evidence_store );
        $this->inventory      = $inventory;
        $this->fallback_refs  = is_array( $fallback_refs ) ? $fallback_refs : array();
    }

    public static function forWordPress() {
        return new self(
            new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
            new WordPressOptionStateStore( AdminBindingEvidenceStore::OPTION_NAME ),
            new GravityFormsFieldInventory()
        );
    }

    public function repairFields( $request ) {
        $this->requireExactKeys(
            $request,
            array( 'context_key', 'binding_set_id', 'binding_set_version', 'mappings' ),
            'batch binding repair request'
        );
        if ( ! is_string( $request['context_key'] ) || ! is_string( $request['binding_set_id'] ) || ! is_string( $request['binding_set_version'] ) || ! is_array( $request['mappings'] ) ) {
            throw new LifecycleException( 'invalid_request_value', 'Batch binding repair identity must be scalar and mappings must be a list.' );
        }

        $snapshot = $this->snapshot();
        $current  = $this->currentRecord( $snapshot, $request );
        $artifact = $current['artifact'];
        $form_id  = $artifact['context']['form_source_ref']['form_id'];
        $inventory = $this->inventory->load( $form_id );
        if ( empty( $inventory['form_exists'] ) ) {
            throw new LifecycleException( 'repair_form_missing', 'The bound Gravity Forms form no longer exists.' );
        }

        $normalized = array();
        foreach ( $request['mappings'] as $index => $mapping ) {
            $this->requireExactKeys( $mapping, array( 'semantic_slot_key', 'field_id' ), 'batch mappings[' . $index . ']' );
            if ( ! is_string( $mapping['semantic_slot_key'] ) || '' === trim( $mapping['semantic_slot_key'] ) || ( ! is_int( $mapping['field_id'] ) && ! is_string( $mapping['field_id'] ) ) ) {
                throw new LifecycleException( 'invalid_request_value', 'Each batch mapping requires one semantic key and one field/input identity.' );
            }
            $slot_key = trim( $mapping['semantic_slot_key'] );
            if ( isset( $normalized[ $slot_key ] ) ) {
                throw new LifecycleException( 'repair_duplicate_slot', 'A semantic mapping may be submitted only once per save.' );
            }

            $binding = $this->bindingForSlot( $artifact, $slot_key );
            if ( 'NOT_APPLICABLE' === $binding['state'] ) {
                throw new LifecycleException( 'repair_not_applicable', 'A NOT_APPLICABLE semantic slot cannot be repaired to a host field.' );
            }
            if ( null !== $binding['source_ref'] && 'gravity_forms.field' !== $binding['source_ref']['type'] ) {
                throw new LifecycleException( 'repair_not_field_backed', 'Only an admitted Gravity Forms field mapping may be changed by this workflow.' );
            }

            $requested_id = (string) $mapping['field_id'];
            if ( '' === $requested_id || empty( $inventory['fields'][ $requested_id ] ) ) {
                throw new LifecycleException( 'repair_field_missing', 'A selected Gravity Forms field or compound-field input no longer exists in the bound form.' );
            }
            $field_id = $inventory['fields'][ $requested_id ]['field_id'];
            if ( null === $this->inventory->exactField( $inventory['form'], $field_id ) ) {
                $parent_id = false !== strpos( (string) $field_id, '.' ) ? strstr( (string) $field_id, '.', true ) : $field_id;
                if ( null === $this->inventory->exactField( $inventory['form'], $parent_id ) ) {
                    throw new LifecycleException( 'repair_field_missing', 'A selected Gravity Forms source is no longer resolvable in the bound form.' );
                }
            }

            $normalized[ $slot_key ] = array(
                'binding' => $binding,
                'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => $field_id ),
            );
        }

        $changed = array();
        foreach ( $normalized as $slot_key => $item ) {
            if ( 'PROVEN' === $item['binding']['state'] && $this->sameSource( $item['binding']['source_ref'], $item['source_ref'] ) ) {
                continue;
            }
            $changed[ $slot_key ] = $item['source_ref'];
        }

        if ( array() === $changed ) {
            return array(
                'status' => 'UNCHANGED',
                'binding_set_id' => $artifact['binding_set_id'],
                'previous_version' => $artifact['binding_set_version'],
                'binding_set_version' => $artifact['binding_set_version'],
                'changed_semantic_slots' => array(),
            );
        }

        $next = $artifact;
        $next['binding_set_version'] = $this->nextVersion( $snapshot, $artifact['binding_set_id'], $artifact['binding_set_version'] );
        $confirmations = array();

        foreach ( $changed as $slot_key => $source_ref ) {
            $ref = $this->evidence_store->confirmationRef( $next, $slot_key, $source_ref );
            $confirmations[ $slot_key ] = array( 'source_ref' => $source_ref, 'ref' => $ref );

            foreach ( $next['bindings'] as &$binding ) {
                if ( $binding['semantic_slot_key'] !== $slot_key ) {
                    continue;
                }
                $binding['state'] = 'PROVEN';
                $binding['source_ref'] = $source_ref;
                $binding['evidence_refs'] = array( $ref );
                break;
            }
            unset( $binding );

            $this->invalidateRuntimeClaims( $next, $slot_key );
            if ( ! in_array( $ref, $next['provenance']['evidence_refs'], true ) ) {
                $next['provenance']['evidence_refs'][] = $ref;
            }
        }

        $next['provenance']['producer'] = 'Gravity Presentation Profiles admin batch binding repair';
        EnvironmentBindingSet::validate( $next );

        $gate = new RepairBindingEvidenceGate(
            $this->evidence_store,
            $next,
            $artifact,
            new EvidenceReferenceGate( $this->fallback_refs )
        );
        $lifecycle = new BindingSetLifecycle( $this->binding_store, $gate );
        $lifecycle->import( $next );
        foreach ( $confirmations as $slot_key => $confirmation ) {
            $this->evidence_store->recordConfirmation( $next, $slot_key, $confirmation['source_ref'] );
        }
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
            'changed_semantic_slots' => array_keys( $changed ),
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

    private function bindingForSlot( $artifact, $semantic_slot_key ) {
        foreach ( $artifact['bindings'] as $binding ) {
            if ( $binding['semantic_slot_key'] === $semantic_slot_key ) {
                return $binding;
            }
        }
        throw new LifecycleException( 'repair_slot_missing', 'The selected semantic slot is not present in the active binding artifact.' );
    }

    private function sameSource( $left, $right ) {
        return is_array( $left )
            && isset( $left['type'], $left['field_id'] )
            && $left['type'] === $right['type']
            && (string) $left['field_id'] === (string) $right['field_id'];
    }

    private function invalidateRuntimeClaims( &$artifact, $semantic_slot_key ) {
        foreach ( $artifact['runtime_claims'] as &$claim ) {
            if ( $claim['semantic_slot_key'] !== $semantic_slot_key ) {
                continue;
            }
            if ( 'PROVEN' === $claim['evidence_state'] ) {
                $claim['evidence_state'] = 'NOT_PROVEN';
                $claim['evidence_refs'] = array();
            }
            unset( $claim['print_option_map'] );
        }
        unset( $claim );
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

    private function requireExactKeys( $value, $expected, $path ) {
        if ( ! is_array( $value ) ) {
            throw new LifecycleException( 'invalid_request', $path . ' must be an object.' );
        }
        $actual = array_keys( $value );
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );
        if ( $actual !== $expected ) {
            throw new LifecycleException( 'invalid_request_keys', $path . ' contains missing or unknown keys.' );
        }
    }
}
