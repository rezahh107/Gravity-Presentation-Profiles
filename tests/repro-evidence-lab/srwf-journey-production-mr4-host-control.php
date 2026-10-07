<?php
/**
 * Test-only MR-4 control. When explicitly enabled by the browser scenario, use
 * Gravity Flow's native editable-fields filter to expose the synthetic
 * conditional field through the active User Input step. Production GPP code is
 * not involved in editable-field membership, conditional logic or validation.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

function gpp_srwf_mr4_test_control_matches( $form_id, $step_id = null ) {
    if ( '1' !== (string) get_option( 'gpp_srwf_mr4_expand_editable_fields', '0' ) ) {
        return false;
    }

    $manifest = get_option( 'gpp_srwf_journey_host_manifest' );
    if ( ! is_array( $manifest ) || empty( $manifest['form_id'] ) || empty( $manifest['steps']['correction_id'] ) ) {
        return false;
    }

    if ( (int) $form_id !== (int) $manifest['form_id'] ) {
        return false;
    }

    return null === $step_id || (int) $step_id === (int) $manifest['steps']['correction_id'];
}

add_filter(
    'gravityflow_editable_fields_user_input',
    static function ( $editable_fields, $step ) {
        if ( ! is_object( $step ) || ! method_exists( $step, 'get_id' ) || ! method_exists( $step, 'get_form_id' )
            || ! gpp_srwf_mr4_test_control_matches( $step->get_form_id(), $step->get_id() ) ) {
            return $editable_fields;
        }

        // Conditional logic enablement comes from the persisted User Input feed
        // configured by the pinned host fixture. This hook owns only synthetic
        // editable-field membership so the runtime can prove the host setting.
        $editable_fields = is_array( $editable_fields ) ? array_values( array_map( 'strval', $editable_fields ) ) : array();
        if ( ! in_array( '5', $editable_fields, true ) ) {
            $editable_fields[] = '5';
        }
        if ( ! in_array( '6', $editable_fields, true ) ) {
            $editable_fields[] = '6';
        }

        return $editable_fields;
    },
    20,
    2
);

// Exercise Gravity Forms' authentic field-validation/error rendering boundary
// with a deterministic synthetic invalid value. GPP remains completely outside
// this decision and only styles the native validation UI Gravity Forms emits.
add_filter(
    'gform_field_validation',
    static function ( $result, $value, $form, $field ) {
        if ( ! is_array( $form ) || ! is_object( $field ) || 5 !== (int) $field->id
            || ! gpp_srwf_mr4_test_control_matches( isset( $form['id'] ) ? $form['id'] : 0 ) ) {
            return $result;
        }

        if ( '' === trim( (string) $value ) || 'INVALID-MR4' === (string) $value ) {
            $result['is_valid'] = false;
            $result['message'] = 'MR4 synthetic native validation failure.';
        }

        return $result;
    },
    20,
    4
);
