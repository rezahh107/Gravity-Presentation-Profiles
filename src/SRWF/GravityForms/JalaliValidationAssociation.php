<?php

namespace GravityPresentationProfiles\SRWF\GravityForms;

use GravityPresentationProfiles\GravityForms\AddOn;

/**
 * Adds the missing semantic relationship between the admitted SRWF Jalali
 * control and Gravity Forms' existing validation-message node.
 *
 * Gravity Forms/PersianGravity remain the sole validation authorities: this
 * adapter neither creates an error nor infers one from text. It only annotates
 * the existing failed control during the same server-side render that produced
 * the real validation node.
 */
final class JalaliValidationAssociation {
    const PROFILE_CLASS = 'gpp-profile-srwf-registration';
    const FIELD_TYPE = 'pgr_jalali_date';

    public static function register() {
        if ( function_exists( 'add_filter' ) ) {
            add_filter( 'gform_field_content', array( __CLASS__, 'associateValidationError' ), 20, 5 );
        }
    }

    public static function associateValidationError( $field_content, $field, $value, $lead_id, $form_id ) {
        unset( $value, $lead_id );

        if ( ! is_string( $field_content ) || '' === $field_content || ! is_object( $field ) ) {
            return $field_content;
        }

        $field_type = isset( $field->type ) && is_string( $field->type ) ? $field->type : '';
        if ( self::FIELD_TYPE !== $field_type || empty( $field->failed_validation ) ) {
            return $field_content;
        }

        $form_id = absint( $form_id );
        $field_id = isset( $field->id ) ? absint( $field->id ) : 0;
        if ( $form_id < 1 || $field_id < 1 || ! self::isAdmittedForm( $form_id ) ) {
            return $field_content;
        }

        $error_id = 'validation_message_' . $form_id . '_' . $field_id;
        if ( ! self::containsValidationNode( $field_content, $error_id ) ) {
            return $field_content;
        }

        $input_id = 'input_' . $form_id . '_' . $field_id;
        $pattern = '/<input\b(?=[^>]*\bid=(?:"' . preg_quote( $input_id, '/' ) . '"|\'' . preg_quote( $input_id, '/' ) . '\'))[^>]*>/i';

        return preg_replace_callback(
            $pattern,
            static function ( $matches ) use ( $error_id ) {
                return self::withErrorMessageReference( $matches[0], $error_id );
            },
            $field_content,
            1
        );
    }

    private static function isAdmittedForm( $form_id ) {
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

            return in_array( self::PROFILE_CLASS, $state->semanticClasses(), true );
        } catch ( \Throwable $exception ) {
            return false;
        }
    }

    private static function containsValidationNode( $field_content, $error_id ) {
        if ( ! preg_match( '/<[^>]*\bid=(?:"' . preg_quote( $error_id, '/' ) . '"|\'' . preg_quote( $error_id, '/' ) . '\')[^>]*>/i', $field_content, $matches ) ) {
            return false;
        }

        return 1 === preg_match( '/\bclass=(?:"[^"]*\bgfield_validation_message\b[^"]*"|\'[^\']*\bgfield_validation_message\b[^\']*\')/i', $matches[0] );
    }

    private static function withErrorMessageReference( $input_tag, $error_id ) {
        if ( preg_match( '/\saria-errormessage=("|\')(.*?)\1/i', $input_tag, $matches ) ) {
            $ids = preg_split( '/\s+/', trim( $matches[2] ) );
            $ids = array_values( array_filter( is_array( $ids ) ? $ids : array(), 'strlen' ) );
            if ( ! in_array( $error_id, $ids, true ) ) {
                $ids[] = $error_id;
            }
            $replacement = ' aria-errormessage=' . $matches[1] . esc_attr( implode( ' ', $ids ) ) . $matches[1];
            return preg_replace( '/\saria-errormessage=("|\')(.*?)\1/i', $replacement, $input_tag, 1 );
        }

        $updated = preg_replace(
            '/\s*\/>$/',
            ' aria-errormessage="' . esc_attr( $error_id ) . '" />',
            $input_tag,
            1,
            $count
        );
        if ( 1 === $count ) {
            return $updated;
        }

        return preg_replace( '/>$/', ' aria-errormessage="' . esc_attr( $error_id ) . '">', $input_tag, 1 );
    }
}
