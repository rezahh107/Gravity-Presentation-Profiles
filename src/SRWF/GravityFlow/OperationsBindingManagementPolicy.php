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
}
