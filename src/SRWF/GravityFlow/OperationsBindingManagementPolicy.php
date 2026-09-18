<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Management policy for the shipped SRWF operations binding contract.
 *
 * No label or field-type heuristic is used here. This class records only the
 * source-class decisions already admitted by the SRWF binding matrix.
 */
final class OperationsBindingManagementPolicy {
    const DIRECT_FIELD = 'direct_field';
    const DERIVED = 'derived';
    const HOST_MANAGED = 'host_managed';

    const ENTRY_DETAIL_DIRECT_SOURCE = 'entry_detail_direct_source';
    const ENTRY_DETAIL_DERIVED = 'entry_detail_derived';
    const ENTRY_DETAIL_STABLE_HOST_SOURCE = 'entry_detail_stable_host_source';
    const ENTRY_DETAIL_REQUEST_REGION = 'entry_detail_request_region';
    const ENTRY_DETAIL_REQUEST_ACTION = 'entry_detail_request_action';
    const ENTRY_DETAIL_GPP_CAPABILITY = 'entry_detail_gpp_capability';

    private const ENTRY_DETAIL_STABLE_HOST_SLOTS = array(
        'entry.created_at',
        'workflow.current_step',
        'workflow.status',
    );

    private const ENTRY_DETAIL_REQUEST_REGION_SLOTS = array(
        'workflow.instructions',
        'workflow.timeline',
        'navigation.backlink',
    );

    private const ENTRY_DETAIL_REQUEST_ACTION_SLOTS = array(
        'workflow.approve_action',
        'workflow.reject_action',
    );

    private const ENTRY_DETAIL_GPP_CAPABILITY_SLOTS = array(
        'print.utility',
    );

    private const DIRECT_FIELD_SLOTS = array(
        'student.photo',
        'student.first_name',
        'student.last_name',
        'student.father_name',
        'student.national_id',
        'student.birth_date_jalali',
        'student.gender',
        'student.mobile',
        'student.home_phone',
        'student.father_mobile',
        'student.mother_mobile',
        'education.level',
        'education.grade_group',
        'education.graduation_status',
        'school.name',
        'registration.center',
        'registration.counter',
        'documents.report_card',
        'review.status',
        'review.reason',
        'finance.status',
        'finance.tuition_amount',
        'finance.discount_amount',
        'finance.discount_title',
        'finance.net_payable_amount',
    );

    private const DERIVED_SLOTS = array(
        'student.full_name' => array( 'student.first_name', 'student.last_name' ),
    );

    public static function kind( $semantic_slot_key ) {
        if ( isset( self::DERIVED_SLOTS[ $semantic_slot_key ] ) ) {
            return self::DERIVED;
        }
        if ( in_array( $semantic_slot_key, self::DIRECT_FIELD_SLOTS, true ) ) {
            return self::DIRECT_FIELD;
        }
        return self::HOST_MANAGED;
    }

    public static function derivationComponents( $semantic_slot_key ) {
        return isset( self::DERIVED_SLOTS[ $semantic_slot_key ] )
            ? self::DERIVED_SLOTS[ $semantic_slot_key ]
            : array();
    }

    /**
     * Entry Detail readiness classification.
     *
     * This is deliberately separate from the management kind: administrators
     * may repair only direct Gravity Forms mappings, while Entry Detail also
     * consumes derived values, stable host APIs, request-local native regions
     * and the existing GPP Print capability.
     */
    public static function entryDetailReadinessKind( $semantic_slot_key ) {
        if ( isset( self::DERIVED_SLOTS[ $semantic_slot_key ] ) ) {
            return self::ENTRY_DETAIL_DERIVED;
        }
        if ( in_array( $semantic_slot_key, self::DIRECT_FIELD_SLOTS, true ) ) {
            return self::ENTRY_DETAIL_DIRECT_SOURCE;
        }
        if ( in_array( $semantic_slot_key, self::ENTRY_DETAIL_STABLE_HOST_SLOTS, true ) ) {
            return self::ENTRY_DETAIL_STABLE_HOST_SOURCE;
        }
        if ( in_array( $semantic_slot_key, self::ENTRY_DETAIL_REQUEST_REGION_SLOTS, true ) ) {
            return self::ENTRY_DETAIL_REQUEST_REGION;
        }
        if ( in_array( $semantic_slot_key, self::ENTRY_DETAIL_REQUEST_ACTION_SLOTS, true ) ) {
            return self::ENTRY_DETAIL_REQUEST_ACTION;
        }
        if ( in_array( $semantic_slot_key, self::ENTRY_DETAIL_GPP_CAPABILITY_SLOTS, true ) ) {
            return self::ENTRY_DETAIL_GPP_CAPABILITY;
        }
        return null;
    }
}
