<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;

/** Explicit administrator action for Entry Detail presentation adoption. */
final class EntryDetailSetupAdminController {
    const ACTION = 'gpp_initialize_entry_detail_presentation';
    const NONCE_ACTION = 'gpp_initialize_entry_detail_presentation';

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) return;
        add_action( 'admin_notices', array( __CLASS__, 'render' ) );
        add_action( 'admin_post_' . self::ACTION, array( __CLASS__, 'handle' ) );
    }

    public static function render() {
        if ( ! self::isSettingsPage() || ! self::canManage() ) return;
        $forms = self::forms();
        $status = isset( $_GET['gpp_entry_detail_setup'] ) ? sanitize_key( wp_unslash( $_GET['gpp_entry_detail_setup'] ) ) : '';

        echo '<div class="notice notice-info" data-gpp-entry-detail-setup="explicit">';
        echo '<h2>' . esc_html__( 'Operations Setup — Entry Detail', 'gravity-presentation-profiles' ) . '</h2>';
        echo '<p>' . esc_html__( 'Adopt the shipped SRWF Entry Detail presentation for one existing operations binding context. This action qualifies only the admitted stable host sources; it never records current-user authorization, assignment, or action permission.', 'gravity-presentation-profiles' ) . '</p>';
        if ( 'completed' === $status ) {
            echo '<p><strong>' . esc_html__( 'Entry Detail profile adopted. Enhanced presentation is admitted only on a live native Approval step where the current assignee can process the entry; all other legitimate requests remain native.', 'gravity-presentation-profiles' ) . '</strong></p>';
        }
        if ( array() === $forms ) {
            echo '<p>' . esc_html__( 'No Gravity Forms form is available for Entry Detail setup.', 'gravity-presentation-profiles' ) . '</p></div>';
            return;
        }

        echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
        echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '">';
        wp_nonce_field( self::NONCE_ACTION );
        echo '<label for="gpp-entry-detail-form-id"><strong>' . esc_html__( 'Existing operations form', 'gravity-presentation-profiles' ) . '</strong></label> ';
        echo '<select id="gpp-entry-detail-form-id" name="gpp_entry_detail_form_id" required>';
        echo '<option value="">' . esc_html__( 'Select form', 'gravity-presentation-profiles' ) . '</option>';
        foreach ( $forms as $form ) {
            echo '<option value="' . esc_attr( (string) $form['id'] ) . '">' . esc_html( $form['title'] . ' (Form ' . (int) $form['id'] . ')' ) . '</option>';
        }
        echo '</select> ';
        submit_button( __( 'Initialize / Adopt Entry Detail presentation', 'gravity-presentation-profiles' ), 'secondary', 'submit', false );
        echo '</form>';
        echo '<p><small>' . esc_html__( 'Stable Entry Detail host sources are qualified through the existing immutable binding lifecycle. Native Gravity Flow still decides every request permission, current assignment, Approval action, and conditional region.', 'gravity-presentation-profiles' ) . '</small></p>';
        echo '</div>';
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
            self::recordAttempt( self::exceptionAttempt( $form_id, $exception->reasonCode() ) );
            wp_die( esc_html( $exception->getMessage() ), '', array( 'response' => 409 ) );
        } catch ( \Throwable $exception ) {
            self::recordAttempt(
                array(
                    'selected_form_id' => $form_id,
                    'result' => EntryDetailSetupService::STATUS_FAILED,
                    'step' => 'binding_context',
                    'reason_code' => 'entry_detail_setup_unexpected_failure',
                    'binding_set' => null,
                    'entry_detail_activation' => null,
                )
            );
            wp_die( esc_html__( 'Entry Detail presentation setup failed before activation could complete.', 'gravity-presentation-profiles' ), '', array( 'response' => 500 ) );
        }

        self::recordAttempt( self::resultAttempt( $form_id, $result ) );

        if ( EntryDetailSetupService::STATUS_COMPLETED !== $result['status'] ) {
            wp_die( esc_html( self::failureMessage( $result ) ), esc_html__( 'Entry Detail setup rejected', 'gravity-presentation-profiles' ), array( 'response' => 409 ) );
        }

        wp_safe_redirect( add_query_arg( 'gpp_entry_detail_setup', 'completed', admin_url( 'admin.php?page=gf_settings&subview=gravity-presentation-profiles' ) ) );
        exit;
    }

    private static function resultAttempt( $form_id, $result ) {
        $status = isset( $result['status'] ) && in_array( $result['status'], array( EntryDetailSetupService::STATUS_COMPLETED, EntryDetailSetupService::STATUS_CONFLICT, EntryDetailSetupService::STATUS_FAILED ), true )
            ? $result['status']
            : EntryDetailSetupService::STATUS_FAILED;
        $step = 'binding_context';
        $reason = 'entry_detail_setup_failed';

        if ( EntryDetailSetupService::STATUS_COMPLETED === $status ) {
            $step = 'cross_surface_preservation';
            $reason = 'entry_detail_setup_completed';
        } elseif ( ! empty( $result['steps'] ) && is_array( $result['steps'] ) ) {
            foreach ( $result['steps'] as $step_name => $details ) {
                $outcome = is_array( $details ) && isset( $details['outcome'] ) ? $details['outcome'] : '';
                if ( ! in_array( $outcome, array( 'conflict', 'failed' ), true ) ) {
                    continue;
                }
                $step = self::diagnosticStep( $step_name, isset( $details['reason'] ) ? $details['reason'] : null );
                $reason = self::boundedReason( isset( $details['reason'] ) ? $details['reason'] : null, 'entry_detail_setup_failed' );
                break;
            }
        }

        $binding = null;
        if ( EntryDetailSetupService::STATUS_COMPLETED === $status
            && ! empty( $result['steps']['stable_host_sources']['binding_set_id'] )
            && ! empty( $result['steps']['stable_host_sources']['binding_set_version'] ) ) {
            $binding = array(
                'binding_set_id' => (string) $result['steps']['stable_host_sources']['binding_set_id'],
                'binding_set_version' => (string) $result['steps']['stable_host_sources']['binding_set_version'],
            );
        }

        $activation = null;
        if ( EntryDetailSetupService::STATUS_COMPLETED === $status && ! empty( $result['entry_detail_profile'] ) && is_array( $result['entry_detail_profile'] ) ) {
            $activation = $result['entry_detail_profile'];
        }

        return array(
            'selected_form_id' => $form_id,
            'result' => $status,
            'step' => $step,
            'reason_code' => $reason,
            'binding_set' => $binding,
            'entry_detail_activation' => $activation,
        );
    }

    private static function exceptionAttempt( $form_id, $reason_code ) {
        return array(
            'selected_form_id' => $form_id,
            'result' => EntryDetailSetupService::STATUS_FAILED,
            'step' => self::diagnosticStep( null, $reason_code ),
            'reason_code' => self::boundedReason( $reason_code, 'entry_detail_setup_failed' ),
            'binding_set' => null,
            'entry_detail_activation' => null,
        );
    }

    private static function diagnosticStep( $step_name, $reason_code ) {
        $reason = is_string( $reason_code ) ? $reason_code : '';
        if ( 0 === strpos( $reason, 'entry_detail_binding_' ) || 'setup_installation_unknown' === $reason ) {
            return 'binding_context';
        }
        if ( in_array( $step_name, array( 'stable_host_sources', 'package_import', 'entry_detail_activation' ), true ) ) {
            return $step_name;
        }
        if ( 'existing_surfaces' === $step_name || 'cross_surface_preservation' === $step_name || 'entry_detail_setup_cross_surface_activation_changed' === $reason ) {
            return 'cross_surface_preservation';
        }
        if ( 0 === strpos( $reason, 'operations_package_' ) ) {
            return 'package_import';
        }
        if ( 0 === strpos( $reason, 'entry_detail_host_' ) || 0 === strpos( $reason, 'entry_detail_semantic_' ) ) {
            return 'stable_host_sources';
        }
        return 'binding_context';
    }

    private static function boundedReason( $reason_code, $fallback ) {
        if ( is_string( $reason_code ) && '' !== $reason_code && 1 === preg_match( '/^[a-z0-9_]+$/', $reason_code ) ) {
            return $reason_code;
        }
        return $fallback;
    }

    private static function recordAttempt( $attempt ) {
        try {
            EntryDetailSetupDiagnosticStore::forWordPress()->record( $attempt );
        } catch ( \Throwable $exception ) {
            // Diagnostic persistence is deliberately observational. It must not
            // turn a valid setup result into success/failure or alter lifecycle state.
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

    private static function isSettingsPage() {
        if ( ! function_exists( 'is_admin' ) || ! is_admin() ) return false;
        $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        $subview = isset( $_GET['subview'] ) ? sanitize_key( wp_unslash( $_GET['subview'] ) ) : '';
        return 'gf_settings' === $page && 'gravity-presentation-profiles' === $subview;
    }

    private static function forms() {
        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_forms' ) ) return array();
        try { $forms = \GFAPI::get_forms(); } catch ( \Throwable $exception ) { return array(); }
        if ( ! is_array( $forms ) ) return array();
        $result = array();
        foreach ( $forms as $form ) {
            if ( ! is_array( $form ) || empty( $form['id'] ) ) continue;
            $title = isset( $form['title'] ) && is_string( $form['title'] ) && '' !== trim( $form['title'] ) ? trim( $form['title'] ) : 'Form ' . (int) $form['id'];
            $result[] = array( 'id' => (int) $form['id'], 'title' => $title );
        }
        return $result;
    }
}
