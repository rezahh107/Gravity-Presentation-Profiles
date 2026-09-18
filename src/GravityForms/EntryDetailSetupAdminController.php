<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;

/**
 * Backward-compatible explicit admin-post endpoint for Entry Detail adoption.
 *
 * The visible setup control is owned by the Gravity Forms Add-On settings
 * lifecycle in AddOn::plugin_settings_fields(). The GF settings screen does not
 * render this plugin's admin_notices callback reliably, so this controller no
 * longer attempts to own the page UI.
 */
final class EntryDetailSetupAdminController {
    const ACTION = 'gpp_initialize_entry_detail_presentation';
    const NONCE_ACTION = 'gpp_initialize_entry_detail_presentation';

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) return;
        add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle' ) );
    }

    public static function handle() {
        if ( ! self::canManage() ) {
            wp_die( esc_html__( 'You are not allowed to initialize GPP Entry Detail presentation.', 'gravity-presentation-profiles' ), '', array( 'response' => 403 ) );
        }
        check_admin_referer( self::NONCE_ACTION );
        $form_id = isset( $_POST['gpp_entry_detail_form_id'] ) ? absint( wp_unslash( $_POST['gpp_entry_detail_form_id'] ) ) : 0;
        if ( $form_id <= 0 ) {
            wp_die( esc_html__( 'Select the existing Gravity Forms form before initializing Entry Detail presentation.', 'gravity-presentation-profiles' ), '', array( 'response' => 400 ) );
        }

        try {
            $result = EntryDetailSetupService::forWordPress()->initialize( array( 'form_id' => $form_id ) );
        } catch ( LifecycleException $exception ) {
            self::recordFailureReason( $form_id, $exception->reasonCode() );
            wp_die( esc_html( $exception->getMessage() ), '', array( 'response' => 409 ) );
        } catch ( \Throwable $exception ) {
            self::recordUnexpectedFailure( $form_id );
            wp_die( esc_html__( 'Entry Detail presentation setup failed before activation could complete.', 'gravity-presentation-profiles' ), '', array( 'response' => 500 ) );
        }

        self::recordServiceResult( $form_id, $result );

        if ( EntryDetailSetupService::STATUS_COMPLETED !== $result['status'] ) {
            wp_die( esc_html( self::failureMessage( $result ) ), esc_html__( 'Entry Detail setup rejected', 'gravity-presentation-profiles' ), array( 'response' => 409 ) );
        }

        wp_safe_redirect( add_query_arg( 'gpp_entry_detail_setup', 'completed', admin_url( 'admin.php?page=gf_settings&subview=gravity-presentation-profiles' ) ) );
        exit;
    }

    private static function recordServiceResult( $form_id, $result ) {
        try {
            EntryDetailSetupDiagnosticStore::forWordPress()->recordServiceResult( $form_id, $result );
        } catch ( \Throwable $exception ) {
            // Diagnostics are observational and never alter the setup result.
        }
    }

    private static function recordFailureReason( $form_id, $reason_code ) {
        try {
            EntryDetailSetupDiagnosticStore::forWordPress()->recordFailureReason( $form_id, $reason_code );
        } catch ( \Throwable $exception ) {
            // Diagnostics are observational and never alter the setup result.
        }
    }

    private static function recordUnexpectedFailure( $form_id ) {
        try {
            EntryDetailSetupDiagnosticStore::forWordPress()->recordUnexpectedFailure( $form_id );
        } catch ( \Throwable $exception ) {
            // Diagnostics are observational and never alter the setup result.
        }
    }

    private static function failureMessage( $result ) {
        if ( ! empty( $result['steps'] ) ) {
            foreach ( $result['steps'] as $step ) {
                if ( in_array( isset( $step['outcome'] ) ? $step['outcome'] : '', array( 'conflict', 'failed' ), true ) ) {
                    if ( ! empty( $step['message'] ) ) return $step['message'];
                    if ( ! empty( $step['reason'] ) ) return $step['reason'];
                }
            }
        }
        return __( 'Entry Detail presentation setup did not complete.', 'gravity-presentation-profiles' );
    }

    private static function canManage() {
        return class_exists( 'GFCommon' ) && \GFCommon::current_user_can_any( 'gravityforms_edit_settings' );
    }
}
