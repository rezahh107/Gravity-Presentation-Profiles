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
        echo '<p>' . esc_html__( 'Adopt the shipped SRWF Entry Detail presentation for one existing operations binding context. This action reuses the active EnvironmentBindingSet and does not create authorization or runtime-readiness claims.', 'gravity-presentation-profiles' ) . '</p>';
        if ( 'completed' === $status ) {
            echo '<p><strong>' . esc_html__( 'Entry Detail profile adopted. Runtime readiness remains evidence-gated; native Gravity Flow remains the fallback until proven.', 'gravity-presentation-profiles' ) . '</strong></p>';
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
        echo '<p><small>' . esc_html__( 'This step activates only the surface profile. Unproven Gravity Flow regions/actions continue to fail closed to the native Entry Detail surface.', 'gravity-presentation-profiles' ) . '</small></p>';
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
            wp_die( esc_html( $exception->getMessage() ), '', array( 'response' => 409 ) );
        } catch ( \Throwable $exception ) {
            wp_die( esc_html__( 'Entry Detail presentation setup failed before activation could complete.', 'gravity-presentation-profiles' ), '', array( 'response' => 500 ) );
        }

        if ( EntryDetailSetupService::STATUS_COMPLETED !== $result['status'] ) {
            wp_die( esc_html( self::failureMessage( $result ) ), esc_html__( 'Entry Detail setup rejected', 'gravity-presentation-profiles' ), array( 'response' => 409 ) );
        }

        wp_safe_redirect( add_query_arg( 'gpp_entry_detail_setup', 'completed', admin_url( 'admin.php?page=gf_settings&subview=gravity-presentation-profiles' ) ) );
        exit;
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
