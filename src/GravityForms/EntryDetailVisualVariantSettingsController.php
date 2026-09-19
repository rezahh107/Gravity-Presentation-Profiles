<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailVisualVariant;

/**
 * Adds one transient visual-activation command to the existing GPP Entry Detail
 * plugin-settings section without creating a second persisted style setting.
 */
final class EntryDetailVisualVariantSettingsController {
    private static $renderer_mutated = false;
    private static $request_result = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }

        // GFAddOn initializes its plugin-settings renderer during its admin
        // lifecycle. admin_init normally reaches it after that initialization;
        // admin_head is a conservative pre-render retry for host timing variants.
        add_action( 'admin_init', array( __CLASS__, 'augmentSettingsRenderer' ), 999 );
        add_action( 'admin_head', array( __CLASS__, 'augmentSettingsRenderer' ), 1 );
    }

    public static function augmentSettingsRenderer() {
        if ( self::$renderer_mutated || ! self::isGppPluginSettingsRequest() ) {
            return;
        }

        $addon = AddOn::get_instance();
        if ( ! is_object( $addon ) || ! method_exists( $addon, 'get_settings_renderer' ) ) {
            return;
        }
        $renderer = $addon->get_settings_renderer();
        if ( ! is_object( $renderer ) || ! method_exists( $renderer, 'set_fields' ) ) {
            return;
        }

        $sections = $addon->plugin_settings_fields();
        if ( ! is_array( $sections ) ) {
            return;
        }

        foreach ( $sections as &$section ) {
            if ( ! is_array( $section ) || 'Operations Setup (Entry Detail)' !== ( isset( $section['title'] ) ? $section['title'] : null ) ) {
                continue;
            }
            if ( ! isset( $section['fields'] ) || ! is_array( $section['fields'] ) ) {
                return;
            }

            foreach ( $section['fields'] as $field ) {
                if ( is_array( $field ) && 'entry_detail_visual_variant_action' === ( isset( $field['name'] ) ? $field['name'] : null ) ) {
                    self::$renderer_mutated = true;
                    return;
                }
            }

            $section['fields'][] = array(
                'name'                => 'entry_detail_visual_variant_action',
                'label'               => esc_html__( 'Entry Detail design', 'gravity-presentation-profiles' ),
                'description'         => esc_html__( 'Appearance only. Gravity Flow workflow, data, permissions, mappings, Inbox and Print are unchanged. Current / Safe is the stable rollback design.', 'gravity-presentation-profiles' ),
                'type'                => 'select',
                'choices'             => self::choices(),
                'validation_callback' => array( __CLASS__, 'validateSelection' ),
                'save_callback'       => array( __CLASS__, 'discardSelection' ),
            );
            $section['fields'][] = array(
                'name'     => 'entry_detail_visual_variant_feedback',
                'label'    => esc_html__( 'Active Entry Detail design', 'gravity-presentation-profiles' ),
                'type'     => 'gpp_entry_detail_visual_variant_feedback',
                'callback' => array( __CLASS__, 'renderFeedback' ),
            );

            $renderer->set_fields( $sections );
            self::$renderer_mutated = true;
            return;
        }
    }

    public static function validateSelection( $field, $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        try {
            self::$request_result = EntryDetailVisualVariantService::forWordPress()->applySettingsValue( trim( $value ) );
        } catch ( LifecycleException $exception ) {
            self::setFieldError( $field, $exception->getMessage() );
        } catch ( \Throwable $exception ) {
            self::setFieldError(
                $field,
                __( 'Entry Detail design switching failed before a safe visual activation could complete.', 'gravity-presentation-profiles' )
            );
        }
    }

    public static function discardSelection( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    public static function renderFeedback( $field ) {
        unset( $field );

        try {
            $facts = EntryDetailVisualVariantService::forWordPress()->activeFacts();
        } catch ( \Throwable $exception ) {
            echo '<p><strong>' . esc_html__( 'The active Entry Detail visual activation could not be read. No visual change was attempted.', 'gravity-presentation-profiles' ) . '</strong></p>';
            return;
        }

        if ( 'active' !== $facts['state'] ) {
            echo '<p><strong>' . esc_html__( 'The current Entry Detail visual activation is not one of the two Owner-selectable designs. Refresh after resolving that lifecycle state; GPP will not overwrite it silently.', 'gravity-presentation-profiles' ) . '</strong></p>';
            return;
        }

        $label = EntryDetailVisualVariant::label( $facts['variant'] );
        echo '<p data-gpp-entry-detail-visual-variant="' . esc_attr( $facts['variant'] ) . '"><strong>';
        echo esc_html( sprintf( __( 'Active: %s', 'gravity-presentation-profiles' ), $label ) );
        echo '</strong></p>';
        echo '<p><small>' . esc_html__( 'Changing this selector changes presentation only. Gravity Flow remains authoritative for workflow, actions, permissions and data.', 'gravity-presentation-profiles' ) . '</small></p>';

        if ( is_array( self::$request_result ) && EntryDetailVisualVariantService::STATUS_COMPLETED === self::$request_result['status'] ) {
            echo '<div class="notice notice-success inline" data-gpp-entry-detail-visual-switch="completed"><p>';
            echo esc_html( sprintf( __( 'Entry Detail design switched successfully to %s.', 'gravity-presentation-profiles' ), $label ) );
            echo '</p></div>';
        }
    }

    private static function choices() {
        try {
            return EntryDetailVisualVariantService::forWordPress()->settingsChoices();
        } catch ( \Throwable $exception ) {
            return array(
                array(
                    'label' => esc_html__( 'Entry Detail design unavailable — no visual change', 'gravity-presentation-profiles' ),
                    'value' => '',
                ),
            );
        }
    }

    private static function isGppPluginSettingsRequest() {
        if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
            return false;
        }

        $page = isset( $_GET['page'] ) && is_scalar( $_GET['page'] )
            ? sanitize_key( wp_unslash( $_GET['page'] ) )
            : '';
        $subview = isset( $_GET['subview'] ) && is_scalar( $_GET['subview'] )
            ? sanitize_key( wp_unslash( $_GET['subview'] ) )
            : '';

        return 'gf_settings' === $page && 'gravity-presentation-profiles' === $subview;
    }

    private static function setFieldError( $field, $message ) {
        if ( is_object( $field ) && method_exists( $field, 'set_error' ) ) {
            $field->set_error( $message );
        }
    }
}
