<?php

namespace GravityPresentationProfiles\GravityForms;

/**
 * Executes the custom row-level Mapping & Binding Health submitter through the
 * real Gravity Forms plugin-settings form boundary.
 *
 * The row controls are rendered inside GF's settings form, but they are not
 * independent Settings API fields. Gravity Forms therefore does not invoke the
 * registered rollback field's validation callback when a row Apply button is
 * clicked. This controller deliberately handles only that unique submitter,
 * reuses Gravity Forms' own settings nonce/capability boundary, delegates the
 * actual payload validation/mutation back to AddOn, then redirects before the
 * ordinary settings save can accidentally persist unrelated controls.
 */
final class BindingRowAdminController {
    public static function register() {
        if ( function_exists( 'add_action' ) ) {
            add_action( 'admin_init', array( __CLASS__, 'maybeHandle' ), 5 );
        }
    }

    public static function maybeHandle() {
        if ( ! isset( $_POST['gpp_binding_row_action'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
            return;
        }

        if ( ! class_exists( 'GFCommon' ) || ! \GFCommon::current_user_can_any( 'gravityforms_edit_settings' ) ) {
            wp_die(
                esc_html__( 'You are not allowed to change GPP semantic mappings.', 'gravity-presentation-profiles' ),
                '',
                array( 'response' => 403 )
            );
        }

        // The submitter lives inside Gravity Forms' own plugin-settings form.
        // Reuse that exact CSRF boundary instead of inventing a parallel nonce.
        check_admin_referer( 'gform_settings_save', 'gform_settings_save_nonce' );

        $field = new BindingRowActionErrorSink();
        AddOn::get_instance()->validate_binding_management_action( $field, '' );

        if ( null !== $field->error() ) {
            wp_die(
                esc_html( $field->error() ),
                esc_html__( 'Mapping change rejected', 'gravity-presentation-profiles' ),
                array( 'response' => 409 )
            );
        }

        $redirect = admin_url( 'admin.php?page=gf_settings&subview=gravity-presentation-profiles' );
        wp_safe_redirect( $redirect );
        exit;
    }
}

final class BindingRowActionErrorSink {
    private $error = null;

    public function set_error( $message ) {
        $this->error = is_string( $message ) ? $message : __( 'Mapping change failed.', 'gravity-presentation-profiles' );
    }

    public function error() {
        return $this->error;
    }
}
