<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Presentation-only request context for authentic wp-admin Gravity Flow Entry Detail.
 *
 * This class does not authorize access or management actions. Gravity Flow remains
 * authoritative for whether the current user may reach Entry Detail and which
 * native controls it renders there.
 */
final class EntryDetailAdminPresentationContext {
    const BODY_CLASS = 'gpp-srwf-entry-detail-admin-context';

    public static function register() {
        if ( function_exists( 'add_filter' ) ) {
            add_filter( 'admin_body_class', array( __CLASS__, 'filterAdminBodyClass' ), 20, 1 );
        }
    }

    public static function filterAdminBodyClass( $classes ) {
        $classes = is_string( $classes ) ? $classes : '';
        if ( ! EntryDetailRequestReachability::isAdminInboxEntryDetail() ) {
            return $classes;
        }

        $tokens = preg_split( '/\s+/', trim( $classes ), -1, PREG_SPLIT_NO_EMPTY );
        $tokens = is_array( $tokens ) ? $tokens : array();
        if ( ! in_array( self::BODY_CLASS, $tokens, true ) ) {
            $tokens[] = self::BODY_CLASS;
        }

        return implode( ' ', $tokens );
    }
}