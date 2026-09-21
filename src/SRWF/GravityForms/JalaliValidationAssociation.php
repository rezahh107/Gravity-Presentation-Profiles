<?php

namespace GravityPresentationProfiles\SRWF\GravityForms;

use GravityPresentationProfiles\GravityForms\AddOn;

/**
 * Adds the missing semantic relationship between an admitted GPP Jalali control
 * and Gravity Forms' existing validation-message node.
 *
 * Gravity Forms/PersianGravity remain the sole validation authorities: this
 * adapter neither creates an error nor infers one from text. It only annotates
 * the existing failed control during the same server-side render that produced
 * the real validation node.
 */
final class JalaliValidationAssociation {
    const PROFILE_CLASS = 'gpp-profile-srwf-registration';
    const DECLARATIVE_CAPABILITY_CLASS = 'gpp-cap-pgr-jalali-validation-message-after-control';
    const FIELD_TYPE = 'pgr_jalali_date';

    private static $admitted_form_cache = array();

    public static function register() {
        if ( function_exists( 'add_filter' ) ) {
            add_filter( 'gform_field_content', array( __CLASS__, 'associateValidationError' ), 20, 5 );
        }
    }

    public static function associateValidationError( $field_content, $field, $value, $lead_id, $form_id ) {
        unset( $value );

        if ( ! is_string( $field_content ) || '' === $field_content || ! is_object( $field ) ) {
            return $field_content;
        }

        // This presentation repair belongs only to the public form render. Entry
        // Detail and other host contexts keep their own native markup contracts.
        if ( 0 !== (int) $lead_id ) {
            return $field_content;
        }

        $field_type = isset( $field->type ) && is_string( $field->type ) ? $field->type : '';
        if ( self::FIELD_TYPE !== $field_type || empty( $field->failed_validation ) ) {
            return $field_content;
        }

        $form_id = absint( $form_id );
        $field_id = isset( $field->id ) ? absint( $field->id ) : 0;
        if ( $form_id < 1 || $field_id < 1 || ! self::isAdmittedForm( $form_id ) || ! class_exists( 'WP_HTML_Tag_Processor' ) ) {
            return $field_content;
        }

        $input_id = 'input_' . $form_id . '_' . $field_id;
        $facts = self::markupFacts( $field_content, $input_id );
        if ( null === $facts ) {
            return $field_content;
        }

        $error_id = $facts['error_id'];
        $all_ids = $facts['all_ids'];
        $described_by = self::idReferences( $facts['aria_describedby'] );
        $error_message = self::idReferences( $facts['aria_errormessage'] );

        // Preserve every ordinary help/description relationship. If the host has
        // already emitted a dangling ARIA ID, fail closed rather than mixing a
        // GPP association into markup whose complete reference set is not valid.
        foreach ( array_merge( $described_by, $error_message ) as $reference ) {
            if ( ! isset( $all_ids[ $reference ] ) ) {
                return $field_content;
            }
        }

        // Future-compatible: if the pinned host or PersianGravity later supplies
        // the exact relationship itself, do not duplicate it through a second
        // mechanism.
        if ( in_array( $error_id, $described_by, true ) || in_array( $error_id, $error_message, true ) ) {
            return $field_content;
        }

        $error_message[] = $error_id;
        $processor = new \WP_HTML_Tag_Processor( $field_content );
        $matched = 0;
        while ( $processor->next_tag( array( 'tag_name' => 'INPUT' ) ) ) {
            if ( $input_id !== (string) $processor->get_attribute( 'id' ) || ! $processor->has_class( 'pgr_jalali_date' ) ) {
                continue;
            }
            $matched++;
            if ( 1 !== $matched ) {
                return $field_content;
            }
            if ( ! $processor->set_attribute( 'aria-errormessage', implode( ' ', $error_message ) ) ) {
                return $field_content;
            }
        }

        return 1 === $matched ? $processor->get_updated_html() : $field_content;
    }

    private static function markupFacts( $field_content, $input_id ) {
        $processor = new \WP_HTML_Tag_Processor( $field_content );
        $all_ids = array();
        $input_count = 0;
        $error_count = 0;
        $error_id = null;
        $aria_describedby = null;
        $aria_errormessage = null;

        while ( $processor->next_tag() ) {
            $id = $processor->get_attribute( 'id' );
            if ( is_string( $id ) && '' !== trim( $id ) ) {
                if ( isset( $all_ids[ $id ] ) ) {
                    // A duplicated ID cannot support a truthful programmatic
                    // relationship, so leave the native field untouched.
                    return null;
                }
                $all_ids[ $id ] = true;
            }

            if ( 'INPUT' === $processor->get_tag()
                && $input_id === (string) $id
                && $processor->has_class( 'pgr_jalali_date' ) ) {
                $input_count++;
                $aria_describedby = $processor->get_attribute( 'aria-describedby' );
                $aria_errormessage = $processor->get_attribute( 'aria-errormessage' );
            }

            if ( $processor->has_class( 'gfield_validation_message' ) ) {
                $error_count++;
                if ( is_string( $id ) && '' !== trim( $id ) ) {
                    $error_id = $id;
                }
            }
        }

        if ( 1 !== $input_count || 1 !== $error_count || ! is_string( $error_id ) || '' === trim( $error_id ) ) {
            return null;
        }

        return array(
            'all_ids' => $all_ids,
            'error_id' => $error_id,
            'aria_describedby' => $aria_describedby,
            'aria_errormessage' => $aria_errormessage,
        );
    }

    private static function idReferences( $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return array();
        }
        $ids = preg_split( '/\s+/', trim( $value ) );
        return array_values( array_unique( array_filter( is_array( $ids ) ? $ids : array(), 'strlen' ) ) );
    }

    private static function isAdmittedForm( $form_id ) {
        if ( array_key_exists( $form_id, self::$admitted_form_cache ) ) {
            return self::$admitted_form_cache[ $form_id ];
        }

        self::$admitted_form_cache[ $form_id ] = false;
        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_form' ) ) {
            return false;
        }

        try {
            $form = \GFAPI::get_form( $form_id );
            if ( ! is_array( $form ) ) {
                return false;
            }

            $state = AddOn::get_instance()->resolve_form_state( $form );
            if ( ! is_object( $state ) || ! method_exists( $state, 'isActive' ) || ! $state->isActive() || ! method_exists( $state, 'semanticClasses' ) ) {
                return false;
            }

            $classes = $state->semanticClasses();
            self::$admitted_form_cache[ $form_id ] = in_array( self::PROFILE_CLASS, $classes, true )
                || in_array( self::DECLARATIVE_CAPABILITY_CLASS, $classes, true );
        } catch ( \Throwable $exception ) {
            self::$admitted_form_cache[ $form_id ] = false;
        }

        return self::$admitted_form_cache[ $form_id ];
    }
}
