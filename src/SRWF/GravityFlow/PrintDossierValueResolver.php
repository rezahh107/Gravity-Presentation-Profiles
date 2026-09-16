<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Resolves the printed values and canonical option selections for one entry.
 *
 * Kept separate from the request adapter so that data resolution is decided by
 * the semantic model and the environment's own declared evidence, independent of
 * request handling, permission seams and failure rendering.
 */
final class PrintDossierValueResolver {
    /**
     * Canonical Print option vocabulary, by the semantic slot that decides it.
     *
     * These identities belong to the locked two-page visual contract, so they
     * live here. What a real Gravity Forms choice value *means* is environment
     * evidence and is never defined here: it comes from the active binding set's
     * declared print option map. Without that map the whole group stays blank.
     */
    private const OPTION_GROUPS = array(
        'student.gender' => array( 'female', 'male' ),
        'education.graduation_status' => array( 'graduated' ),
        'registration.center' => array( 'loc_central', 'loc_golestan', 'loc_sadra' ),
        'print.registration_type' => array( 'reg_normal', 'reg_school', 'reg_shaheed', 'reg_komite', 'reg_behzisti', 'reg_maskan' ),
        'print.registration_timing' => array( 'time_early', 'time_continue' ),
        'print.payment_mode' => array( 'pay_cash', 'pay_installment' ),
        'print.former_kanoon_status' => array( 'former_kanoon', 'former_non_kanoon' ),
    );

    /**
     * Directly bound Print text slots. `student.full_name` is intentionally
     * absent: it is a presentation derivation, not a host source.
     */
    private const VALUE_SLOTS = array(
        'registration.counter', 'student.national_id', 'student.father_name',
        'education.grade_group', 'print.academic_year_start', 'print.academic_year_end', 'school.name',
        'print.sub_office', 'print.first_exam_date', 'student.mobile', 'print.phone_2',
        'print.financial_date', 'finance.tuition_amount', 'finance.discount_amount',
        'finance.net_payable_amount', 'finance.discount_title', 'print.received_amount_words',
        'print.received_amount_number', 'print.referrer', 'print.exam_count',
    );

    private $model;
    private $reader;

    public function __construct( PrintDossierPresentationModel $model, BoundHostValueReader $reader = null ) {
        $this->model  = $model;
        $this->reader = null === $reader ? new BoundHostValueReader() : $reader;
    }

    public static function optionGroups() {
        return self::OPTION_GROUPS;
    }

    public static function valueSlots() {
        return self::VALUE_SLOTS;
    }

    /**
     * @return array{values: array<string,string>, options: array<string,bool>}
     */
    public function resolve( $form, $entry, PrintDossierDecisionTrace $trace ) {
        $values = array();
        foreach ( self::VALUE_SLOTS as $slot ) {
            $values[ $slot ] = $this->slotText( $form, $entry, $slot, $trace );
        }
        $values['student.full_name'] = $this->deriveFullName( $form, $entry, $trace );

        return array(
            'values' => $values,
            'options' => $this->options( $form, $entry, $trace ),
        );
    }

    private function slotText( $form, $entry, $slot, PrintDossierDecisionTrace $trace ) {
        $decision = $this->model->fieldDecision( $entry, $slot );
        if ( empty( $decision['populate'] ) ) {
            $this->recordBlankReason( $trace, $decision['reason'] );
            return '';
        }

        // Printed text is presentation, so the host's human-readable label is
        // the correct rendering for a choice-backed field here.
        return $this->presentationText( $this->reader->readDisplay( $decision['source_ref'], $form, $entry ), $trace );
    }

    /**
     * Read-only composition of the authoritative first and last name slots.
     *
     * Both components must resolve. A half-composed identity on an official
     * printed dossier is a data-correctness defect, so an unresolved component
     * leaves the field blank for manual completion instead.
     */
    private function deriveFullName( $form, $entry, PrintDossierDecisionTrace $trace ) {
        $decision = $this->model->derivedDecision( $entry, 'student.full_name' );
        if ( empty( $decision['populate'] ) ) {
            $this->recordBlankReason( $trace, $decision['reason'] );
            return '';
        }

        $parts = array();
        foreach ( $decision['component_source_refs'] as $source ) {
            $text = $this->presentationText( $this->reader->readDisplay( $source, $form, $entry ), $trace );
            if ( '' === $text ) {
                return '';
            }
            $parts[] = $text;
        }

        $trace->record( 'PRINT_BINDINGS_EVALUATED', 'full_name_derived' );

        return implode( ' ', $parts );
    }

    /**
     * Canonical option selection.
     *
     * Every option starts unselected. A canonical option is selected only when
     * the environment's declared print option map contains it and its declared
     * host raw value equals the value Gravity Forms actually stored. The
     * comparison uses the raw read, never the display label, because the label
     * is localized presentation text rather than the persisted identity.
     */
    private function options( $form, $entry, PrintDossierDecisionTrace $trace ) {
        $options = array();

        foreach ( self::OPTION_GROUPS as $slot => $canonical_options ) {
            foreach ( $canonical_options as $option ) {
                $options[ $option ] = false;
            }

            $decision = $this->model->fieldDecision( $entry, $slot );
            if ( empty( $decision['populate'] ) ) {
                $this->recordBlankReason( $trace, $decision['reason'] );
                continue;
            }

            $map = $this->model->printOptionMap( $entry, $slot );
            if ( array() === $map ) {
                $trace->record( 'PRINT_BINDINGS_EVALUATED', 'print_option_map_not_declared' );
                continue;
            }

            $raw = $this->reader->readRaw( $decision['source_ref'], $form, $entry );
            if ( ! is_scalar( $raw ) ) {
                $trace->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
                continue;
            }

            $raw = (string) $raw;
            foreach ( $canonical_options as $option ) {
                if ( isset( $map[ $option ] ) && $map[ $option ] === $raw ) {
                    $options[ $option ] = true;
                }
            }
        }

        return $options;
    }

    private function presentationText( $value, PrintDossierDecisionTrace $trace ) {
        if ( is_int( $value ) || is_float( $value ) ) {
            return (string) $value;
        }
        if ( ! is_scalar( $value ) ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
            return '';
        }

        $value = trim( wp_strip_all_tags( (string) $value ) );
        if ( '' === $value ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
        }

        return $value;
    }

    private function recordBlankReason( PrintDossierDecisionTrace $trace, $reason ) {
        $explicit = array(
            'binding_context_missing',
            'binding_context_ambiguous',
            'print_mapping_not_proven',
            'derivation_component_unresolved',
        );
        if ( in_array( $reason, $explicit, true ) ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', $reason );
            return;
        }

        $trace->record( 'PRINT_BINDINGS_EVALUATED', 'binding_not_proven' );
    }
}
