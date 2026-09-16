<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\SemanticBindingResolver;

/**
 * Print-specific semantic model. A unique environment context is structural;
 * individual historical/manual fields may remain unresolved and therefore
 * blank without invalidating the whole physical dossier.
 */
final class PrintDossierPresentationModel {
    const SURFACE = 'print.dossier';

    private const PRINT_MAPPING_REQUIRED = array(
        'student.gender',
        'education.graduation_status',
        'registration.center',
        'registration.counter',
        'print.academic_year_start',
        'print.academic_year_end',
        'print.sub_office',
        'print.first_exam_date',
        'print.phone_2',
        'print.registration_type',
        'print.registration_timing',
        'print.payment_mode',
        'print.financial_date',
        'print.receipt_rows',
        'print.cheque_rows',
        'print.received_amount_words',
        'print.received_amount_number',
        'print.referrer',
        'print.former_kanoon_status',
        'print.exam_count',
        'print.manual_approval_signature_stamp_notes',
        'print.utility',
    );

    /**
     * Presentation derivations. The authoritative Binding Matrix defines
     * `student.full_name` as a presentation composition of two canonical slots,
     * not as its own host field. GPP therefore derives it read-only from the
     * resolved components and never creates, writes or reads a duplicate
     * full-name field in Gravity Forms.
     */
    private const DERIVED_SLOTS = array(
        'student.full_name' => array( 'student.first_name', 'student.last_name' ),
    );

    private $profile;
    private $binding_sets;
    private $resolver;

    public function __construct( $profile, $binding_sets, $semantic_slot_declarations ) {
        if ( ! is_array( $profile ) || ! isset( $profile['surface'], $profile['profile_id'], $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Print dossier requires one resolved surface profile.' );
        }
        if ( self::SURFACE !== $profile['surface'] || ! is_array( $profile['semantic_slots'] ) ) {
            throw new ContractViolation( 'Print dossier profile must target print.dossier.' );
        }
        if ( ! is_array( $binding_sets ) || ! is_array( $semantic_slot_declarations ) ) {
            throw new ContractViolation( 'Print dossier requires binding sets and semantic declarations.' );
        }

        $known = array();
        foreach ( $semantic_slot_declarations as $declaration ) {
            if ( is_array( $declaration ) && isset( $declaration['semantic_slot_key'] ) ) {
                $known[] = $declaration['semantic_slot_key'];
            }
        }

        $this->profile      = $profile;
        $this->binding_sets = array_values( $binding_sets );
        $this->resolver     = new SemanticBindingResolver( $this->binding_sets, $known );
    }

    public function profileId() {
        return $this->profile['profile_id'];
    }

    public function bindingContextStatus( $entry ) {
        $selection = $this->selectBindingContext( $entry );
        return $selection['status'];
    }

    public function resolve( $entry, $slot_key ) {
        $selection = $this->selectBindingContext( $entry );
        if ( 'ready' !== $selection['status'] ) {
            return $this->unresolved( $slot_key, $selection['status'] );
        }

        return $this->resolver->resolve(
            array(
                'installation_id' => $selection['installation_id'],
                'form_id' => (int) $entry['form_id'],
                'entry_id' => (int) $entry['id'],
                'surface' => self::SURFACE,
            ),
            $slot_key
        );
    }

    public function requiresPrintMapping( $slot_key ) {
        return self::requiresPrintMappingSlot( $slot_key );
    }

    /**
     * Slots whose Print meaning needs its own proof, independent of whichever
     * host field an administrator binds to them. Exposed statically so the
     * product setup path seeds exactly these claims as NOT_PROVEN.
     */
    public static function requiresPrintMappingSlot( $slot_key ) {
        return in_array( $slot_key, self::PRINT_MAPPING_REQUIRED, true );
    }

    public static function printMappingRequiredSlots() {
        return self::PRINT_MAPPING_REQUIRED;
    }

    public function printMappingIsProven( $entry, $slot_key ) {
        return null !== $this->provenPrintMappingClaim( $entry, $slot_key );
    }

    /**
     * Environment-declared mapping from a real host raw value to a canonical
     * Print option, as `canonical_option => host_raw_value`.
     *
     * The map is read only from the exact binding-set identity/version that also
     * resolved this slot's source and whose print_mapping claim is PROVEN. A
     * repair that changes the source publishes a new binding version with the
     * claim reset, so proof and map for the previous source are never reused.
     * An empty result means fail closed: no canonical option may be selected.
     */
    public function printOptionMap( $entry, $slot_key ) {
        $claim = $this->provenPrintMappingClaim( $entry, $slot_key );
        if ( null === $claim || empty( $claim['print_option_map'] ) || ! is_array( $claim['print_option_map'] ) ) {
            return array();
        }

        $map = array();
        foreach ( $claim['print_option_map'] as $pair ) {
            if ( is_array( $pair ) && isset( $pair['canonical_option'], $pair['host_raw_value'] ) ) {
                $map[ $pair['canonical_option'] ] = (string) $pair['host_raw_value'];
            }
        }

        return $map;
    }

    private function provenPrintMappingClaim( $entry, $slot_key ) {
        $resolved = $this->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['binding_set_id'] ) || empty( $resolved['binding_set_version'] ) ) {
            return null;
        }

        $selection = $this->selectBindingContext( $entry );
        if ( 'ready' !== $selection['status'] ) {
            return null;
        }

        foreach ( $this->binding_sets as $binding_set ) {
            if ( $resolved['binding_set_id'] !== $binding_set['binding_set_id'] || $resolved['binding_set_version'] !== $binding_set['binding_set_version'] ) {
                continue;
            }
            if ( ! $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
                continue;
            }
            if ( (string) $selection['installation_id'] !== (string) $binding_set['context']['installation_source_ref']['installation_id'] ) {
                continue;
            }

            foreach ( $binding_set['runtime_claims'] as $claim ) {
                if ( $slot_key === $claim['semantic_slot_key'] && 'print_mapping' === $claim['claim'] ) {
                    return 'PROVEN' === $claim['evidence_state'] ? $claim : null;
                }
            }
        }

        return null;
    }

    public function isDerivedSlot( $slot_key ) {
        return isset( self::DERIVED_SLOTS[ $slot_key ] );
    }

    public function derivationComponents( $slot_key ) {
        return isset( self::DERIVED_SLOTS[ $slot_key ] ) ? self::DERIVED_SLOTS[ $slot_key ] : array();
    }

    /**
     * Read-only presentation derivation decision.
     *
     * Every component must resolve to a PROVEN host source. A partially resolved
     * composition would print an incomplete identity on an official dossier, so
     * it fails closed and the field stays blank for manual completion.
     */
    public function derivedDecision( $entry, $slot_key ) {
        if ( ! $this->isDerivedSlot( $slot_key ) ) {
            return array(
                'populate' => false,
                'reason' => 'slot_is_not_derived',
                'component_source_refs' => array(),
                'binding_set_id' => null,
            );
        }

        $sources        = array();
        $binding_set_id = null;

        foreach ( self::DERIVED_SLOTS[ $slot_key ] as $component ) {
            $decision = $this->fieldDecision( $entry, $component );
            if ( null === $binding_set_id ) {
                $binding_set_id = $decision['binding_set_id'];
            }

            if ( empty( $decision['populate'] ) ) {
                return array(
                    'populate' => false,
                    'reason' => 'derivation_component_unresolved',
                    'component_source_refs' => array(),
                    'binding_set_id' => $binding_set_id,
                );
            }

            $sources[] = $decision['source_ref'];
        }

        return array(
            'populate' => true,
            'reason' => null,
            'component_source_refs' => $sources,
            'binding_set_id' => $binding_set_id,
        );
    }

    public function fieldDecision( $entry, $slot_key ) {
        // A derived presentation slot has no host source of its own. Refusing it
        // here keeps a duplicate full-name field from ever being read as though
        // it were authoritative, even if an environment declared one.
        if ( $this->isDerivedSlot( $slot_key ) ) {
            return array(
                'populate' => false,
                'reason' => 'derived_slot_requires_derivation',
                'source_ref' => null,
                'binding_set_id' => null,
            );
        }

        $resolved = $this->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || 'PROVEN' !== $resolved['state'] || empty( $resolved['source_ref'] ) ) {
            $reason = isset( $resolved['reason'] ) && is_string( $resolved['reason'] )
                ? $resolved['reason']
                : 'binding_not_proven';

            if ( in_array( $reason, array( 'missing_binding_set', 'missing_slot_binding' ), true ) || 'binding_not_proven' === $reason ) {
                $reason = 'binding_not_proven';
            }

            return array(
                'populate' => false,
                'reason' => $reason,
                'source_ref' => null,
                'binding_set_id' => isset( $resolved['binding_set_id'] ) ? $resolved['binding_set_id'] : null,
            );
        }

        if ( $this->requiresPrintMapping( $slot_key ) && ! $this->printMappingIsProven( $entry, $slot_key ) ) {
            return array(
                'populate' => false,
                'reason' => 'print_mapping_not_proven',
                'source_ref' => null,
                'binding_set_id' => $resolved['binding_set_id'],
            );
        }

        return array(
            'populate' => true,
            'reason' => null,
            'source_ref' => $resolved['source_ref'],
            'binding_set_id' => $resolved['binding_set_id'],
        );
    }

    private function selectBindingContext( $entry ) {
        if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
            return array( 'status' => 'binding_context_missing', 'installation_id' => null );
        }

        $candidates = array();
        foreach ( $this->binding_sets as $binding_set ) {
            if ( $this->bindingSetMatchesEntry( $binding_set, $entry ) ) {
                $candidates[] = $binding_set;
            }
        }

        if ( array() === $candidates ) {
            return array( 'status' => 'binding_context_missing', 'installation_id' => null );
        }

        $installation_ids = array();
        foreach ( $candidates as $candidate ) {
            $id = $candidate['context']['installation_source_ref']['installation_id'];
            $installation_ids[ (string) $id ] = $id;
        }
        if ( 1 !== count( $installation_ids ) ) {
            return array( 'status' => 'binding_context_ambiguous', 'installation_id' => null );
        }

        $exact = array_values(
            array_filter(
                $candidates,
                static function ( $candidate ) use ( $entry ) {
                    $ref = $candidate['context']['entry_source_ref'];
                    return null !== $ref && (string) $ref['entry_id'] === (string) $entry['id'];
                }
            )
        );
        if ( count( $exact ) > 1 ) {
            return array( 'status' => 'binding_context_ambiguous', 'installation_id' => null );
        }

        if ( 0 === count( $exact ) ) {
            $general = array_values(
                array_filter(
                    $candidates,
                    static function ( $candidate ) {
                        return null === $candidate['context']['entry_source_ref'];
                    }
                )
            );
            if ( 1 !== count( $general ) ) {
                return array( 'status' => 'binding_context_ambiguous', 'installation_id' => null );
            }
        }

        return array( 'status' => 'ready', 'installation_id' => reset( $installation_ids ) );
    }

    private function bindingSetMatchesEntry( $binding_set, $entry ) {
        if ( ! is_array( $binding_set ) || empty( $binding_set['context'] ) ) {
            return false;
        }

        $context = $binding_set['context'];
        if ( (string) $context['form_source_ref']['form_id'] !== (string) $entry['form_id'] ) {
            return false;
        }
        if ( ! in_array( self::SURFACE, $context['surfaces'], true ) ) {
            return false;
        }

        $entry_ref = $context['entry_source_ref'];
        return null === $entry_ref || (string) $entry_ref['entry_id'] === (string) $entry['id'];
    }

    private function unresolved( $slot_key, $reason ) {
        return array(
            'resolved' => false,
            'binding_set_id' => null,
            'semantic_slot_key' => $slot_key,
            'state' => 'NOT_PROVEN',
            'source_ref' => null,
            'reason' => $reason,
        );
    }
}
