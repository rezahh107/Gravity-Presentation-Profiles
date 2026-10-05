<?php
/**
 * Test-only MR-4 control. When explicitly enabled by the browser scenario, use
 * Gravity Flow's native editable-fields filter to expose the synthetic
 * conditional field through the active User Input step. Production GPP code is
 * not involved in editable-field membership.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

add_filter(
    'gravityflow_editable_fields_user_input',
    static function ( $editable_fields, $step ) {
        if ( '1' !== (string) get_option( 'gpp_srwf_mr4_expand_editable_fields', '0' ) ) {
            return $editable_fields;
        }

        $manifest = get_option( 'gpp_srwf_journey_host_manifest' );
        if ( ! is_array( $manifest ) || empty( $manifest['form_id'] ) || empty( $manifest['steps']['correction_id'] )
            || ! is_object( $step ) || ! method_exists( $step, 'get_id' ) || ! method_exists( $step, 'get_form_id' ) ) {
            return $editable_fields;
        }

        if ( (int) $step->get_id() !== (int) $manifest['steps']['correction_id']
            || (int) $step->get_form_id() !== (int) $manifest['form_id'] ) {
            return $editable_fields;
        }

        $editable_fields = is_array( $editable_fields ) ? array_values( array_map( 'strval', $editable_fields ) ) : array();
        if ( ! in_array( '5', $editable_fields, true ) ) {
            $editable_fields[] = '5';
        }

        return $editable_fields;
    },
    20,
    2
);