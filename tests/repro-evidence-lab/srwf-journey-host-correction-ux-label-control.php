<?php
/**
 * Test-only MU-plugin payload for SRWF Correction CTA qualification.
 *
 * It uses the native Gravity Flow User Input update-button text filter and is
 * scoped to the exact synthetic SRWF journey form + correction step recorded by
 * the qualification manifest. It does not replace or clone the native button.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_filter(
    'gravityflow_update_button_text_user_input',
    static function ( $text, $form, $step ) {
        $manifest = get_option( 'gpp_srwf_journey_host_manifest' );
        if ( ! is_array( $manifest ) ) {
            return $text;
        }

        $expected_form = isset( $manifest['form_id'] ) ? (int) $manifest['form_id'] : 0;
        $expected_step = isset( $manifest['steps']['correction_id'] ) ? (int) $manifest['steps']['correction_id'] : 0;
        $actual_form   = is_array( $form ) && isset( $form['id'] ) ? (int) $form['id'] : 0;
        $actual_step   = is_object( $step ) && method_exists( $step, 'get_id' ) ? (int) $step->get_id() : 0;

        if ( $expected_form < 1 || $expected_step < 1 || $actual_form !== $expected_form || $actual_step !== $expected_step ) {
            return $text;
        }

        return 'اصلاح اطلاعات';
    },
    10,
    3
);
