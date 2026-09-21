<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Keeps lifecycle-changing GPP plugin-settings commands inside Gravity Forms'
 * native Settings transaction.
 *
 * Gravity Forms 3.1.1.1 validates every prepared Settings field before it runs
 * any field save callback. The historical GPP callbacks combined validation and
 * lifecycle mutation, so a sibling validation error could arrive after GPP had
 * already changed canonical state.
 *
 * This controller keeps the existing callbacks as the single business-rule and
 * lifecycle authority. During the host validation pass it runs them inside a
 * request-local WordPressOptionStateStore preview, so the exact production
 * lifecycle/CAS logic is exercised without persistence. Only after Gravity
 * Forms accepts every sibling field does the native field save callback invoke
 * the same callback against real state exactly once.
 *
 * No nonce, capability, settings dispatch, persistence, or error presentation
 * is reimplemented here; those remain owned by the Gravity Forms Settings API.
 */
final class PluginSettingsAtomicityController {
    private static $commit_callbacks = array();
    private static $rewired = array();
    private static $committed = array();

    private const MUTATING_FIELDS = array(
        'visual_profile_package_json',
        'operations_setup_action',
        'inbox_setup_action',
        'entry_detail_setup_action',
        'binding_management_action',
        'entry_detail_visual_variant_action',
    );

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }

        // GFAddOn creates the prepared plugin-settings renderer during admin
        // initialization. EntryDetailVisualVariantSettingsController inserts its
        // optional command at priority 999, so run immediately afterwards and
        // retain one idempotent admin_head retry for host init-order variance.
        add_action( 'admin_init', array( __CLASS__, 'rewireRenderer' ), 1000 );
        add_action( 'admin_head', array( __CLASS__, 'rewireRenderer' ), 2 );
    }

    public static function rewireRenderer() {
        if ( ! self::isGppPluginSettingsRequest() ) {
            return;
        }

        $addon = AddOn::get_instance();
        if ( ! is_object( $addon )
            || ! method_exists( $addon, 'get_settings_renderer' )
            || ! method_exists( $addon, 'get_field' )
            || ! is_object( $addon->get_settings_renderer() ) ) {
            return;
        }

        foreach ( self::MUTATING_FIELDS as $name ) {
            if ( ! empty( self::$rewired[ $name ] ) ) {
                continue;
            }

            // The prepared Gravity Forms Settings renderer returns Field objects,
            // not the original field-definition arrays.
            $field = $addon->get_field( $name, array() );
            if ( ! is_object( $field ) ) {
                continue;
            }

            $original = isset( $field->validation_callback ) ? $field->validation_callback : null;
            if ( ! is_callable( $original ) ) {
                continue;
            }

            self::$commit_callbacks[ $name ] = $original;
            $field->validation_callback = array( __CLASS__, 'validateWithoutCommit' );
            $field->save_callback = array( __CLASS__, 'commitValidatedAction' );

            $readback = $addon->get_field( $name, array() );
            if ( is_object( $readback )
                && isset( $readback->validation_callback, $readback->save_callback )
                && array( __CLASS__, 'validateWithoutCommit' ) === $readback->validation_callback
                && array( __CLASS__, 'commitValidatedAction' ) === $readback->save_callback ) {
                self::$rewired[ $name ] = true;
            }
        }
    }

    /**
     * Execute the exact historical validation callback against isolated copies
     * of every GPP WordPress option state touched by that callback.
     *
     * The Field object is deliberately the authentic renderer object, so errors
     * set by the callback remain visible to Gravity Forms and the submitted value
     * remains available for correction when any sibling field rejects the form.
     */
    public static function validateWithoutCommit( $field, $value ) {
        $name = self::fieldName( $field );
        if ( '' === $name || ! isset( self::$commit_callbacks[ $name ] ) ) {
            self::setFieldError( $field, 'The settings action could not be validated safely. Refresh the page and try again.' );
            return;
        }

        try {
            $restore_transient_state = self::transientStateRestorer( $name );
            try {
                WordPressOptionStateStore::preview(
                    static function () use ( $name, $field, $value ) {
                        call_user_func( self::$commit_callbacks[ $name ], $field, $value );
                    }
                );
            } finally {
                call_user_func( $restore_transient_state );
            }
        } catch ( \Throwable $exception ) {
            // Expected lifecycle failures are normally converted to Field errors
            // by the original callback. An unexpected preview failure must also
            // fail closed without turning validation into a second transaction.
            if ( '' === self::fieldError( $field ) ) {
                self::setFieldError( $field, 'The settings action could not be validated safely. Refresh the page and try again.' );
            }
        }
    }

    /**
     * Gravity Forms reaches this only after the complete Settings validation
     * pass succeeds. The original callback is therefore allowed to touch real
     * lifecycle state here, while the transient command itself is discarded.
     */
    public static function commitValidatedAction( $field, $value ) {
        $name = self::fieldName( $field );
        if ( '' === $name || ! isset( self::$commit_callbacks[ $name ] ) ) {
            return '';
        }

        $row_token = 'binding_management_action' === $name ? self::postedRowToken() : '';
        $has_action = '' !== $row_token
            || ( is_string( $value ) && '' !== trim( $value ) )
            || ( 'visual_profile_package_json' === $name && is_array( $value ) && ! empty( $value ) );
        if ( ! $has_action ) {
            return '';
        }

        $identity = hash( 'sha256', $name . '|' . $row_token . '|' . self::stableValueIdentity( $value ) );
        if ( isset( self::$committed[ $identity ] ) ) {
            return '';
        }

        call_user_func( self::$commit_callbacks[ $name ], $field, $value );

        // A concurrent state change between validation and this commit can make
        // the original callback reject through the authentic Field error path.
        // Gravity Forms has already finished its validation phase at this point;
        // fail closed before save_values() can persist unrelated settings.
        $error = self::fieldError( $field );
        if ( '' !== $error ) {
            throw new LifecycleException( 'settings_commit_rejected_after_validation', $error );
        }

        self::$committed[ $identity ] = true;
        return '';
    }

    public static function isPreviewing() {
        return WordPressOptionStateStore::isPreviewActive();
    }

    /**
     * Two historical callbacks also cache success feedback in request-local
     * private/static properties. Preview must not make a rejected transaction
     * claim success, so preserve and restore those non-canonical values around
     * the dry run. Reflection is intentionally bounded to these two known GPP
     * classes; lifecycle persistence itself is isolated by StateStore preview.
     */
    private static function transientStateRestorer( $name ) {
        if ( 'inbox_setup_action' === $name ) {
            $target = AddOn::get_instance();
            $property = new \ReflectionProperty( AddOn::class, 'inbox_setup_result' );
            $property->setAccessible( true );
            $before = $property->getValue( $target );
            return static function () use ( $property, $target, $before ) {
                $property->setValue( $target, $before );
            };
        }

        if ( 'entry_detail_visual_variant_action' === $name ) {
            $property = new \ReflectionProperty( EntryDetailVisualVariantSettingsController::class, 'request_result' );
            $property->setAccessible( true );
            $before = $property->getValue();
            return static function () use ( $property, $before ) {
                $property->setValue( null, $before );
            };
        }

        return static function () {};
    }

    private static function postedRowToken() {
        return isset( $_POST['gpp_binding_row_action'] ) && is_scalar( $_POST['gpp_binding_row_action'] )
            ? trim( (string) ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_binding_row_action'] ) : $_POST['gpp_binding_row_action'] ) )
            : '';
    }

    private static function fieldName( $field ) {
        return is_object( $field ) && isset( $field->name ) && is_string( $field->name )
            ? $field->name
            : '';
    }

    private static function fieldError( $field ) {
        if ( ! is_object( $field ) || ! method_exists( $field, 'get_error' ) ) {
            return '';
        }
        $error = $field->get_error();
        return is_string( $error ) ? $error : '';
    }

    private static function stableValueIdentity( $value ) {
        if ( is_scalar( $value ) || null === $value ) {
            return (string) $value;
        }
        $encoded = json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
        return false === $encoded ? gettype( $value ) : $encoded;
    }

    private static function setFieldError( $field, $message ) {
        if ( is_object( $field ) && method_exists( $field, 'set_error' ) ) {
            $field->set_error( $message );
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
}
