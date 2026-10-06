<?php
/**
 * Qualification-only forward-host direction control for MR-6.
 *
 * The disposable Journey lab is installed in the default LTR WordPress locale,
 * while the Owner-approved SRWF operator surface is RTL. MR-6 installs this file
 * only after all historical Journey scenarios have completed, then switches the
 * frontend presentation direction through WordPress's own locale object. It does
 * not patch Gravity Flow, AG Grid, GPP production code, routing, or workflow state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

function gpp_srwf_mr6_apply_forward_host_rtl() {
    if ( is_admin() ) {
        return;
    }

    $manifest = get_option( 'gpp_srwf_journey_host_manifest' );
    if ( ! is_array( $manifest ) || empty( $manifest['mr6']['rtl_host_control_enabled'] ) ) {
        return;
    }

    global $wp_locale;
    if ( is_object( $wp_locale ) ) {
        $wp_locale->text_direction = 'rtl';
    }
}
add_action( 'wp', 'gpp_srwf_mr6_apply_forward_host_rtl', PHP_INT_MIN );
