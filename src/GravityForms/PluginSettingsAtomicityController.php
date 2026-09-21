<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;

/**
 * Keeps lifecycle-changing GPP plugin-settings commands inside Gravity Forms'
 * native Settings transaction.
 *
 * In Gravity Forms 3.1.1.1 the prepared Settings renderer validates every
 * field first, then runs field save callbacks only when the complete settings
 * submission is valid. Existing GPP callbacks historically mixed validation
 * and mutation. This controller preserves those callbacks as the commit
 * implementation, replaces validation with read-only checks, and invokes the
 * mutation only from the host-owned post-validation field save phase.
 *
 * Prepared renderer fields are Settings Field objects, not the original config
 * arrays. The controller therefore mutates those public callback properties in
 * place. This is important: replacing only array-shaped metadata would leave
 * the authentic renderer untouched and the historical validation-time mutation
 * path active.
 *
 * No nonce, capability, dispatch, settings persistence, or error UI is
 * reimplemented here; those remain owned by the Gravity Forms Settings API.
 */
final class PluginSettingsAtomicityController {
    private static $commit_callbacks = array();
    private static $rewired = array();
    private static $committed = array();

    private const FIELD_VALIDATORS = array(
        'visual_profile_package_json'        => 'validateVisualPackage',
        'operations_setup_action'            => 'validateFormAction',
        'inbox_setup_action'                 => 'validateFormAction',
        'entry_detail_setup_action'          => 'validateFormAction',
        'binding_management_action'          => 'validateBindingAction',
        'entry_detail_visual_variant_action' => 'validateVisualVariantAction',
    );

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }

        // GFAddOn creates the prepared plugin-settings renderer during its admin
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

        foreach ( self::FIELD_VALIDATORS as $name => $validator ) {
            if ( ! empty( self::$rewired[ $name ] ) ) {
                continue;
            }

            $field = $addon->get_field( $name, array() );
            if ( ! is_object( $field ) ) {
                // Optional fields can legitimately be absent on the first retry.
                // Core command fields are protected by exact-runtime WU-04; do
                // not synthesize a second renderer or parallel POST path here.
                continue;
            }

            $original = isset( $field->validation_callback ) ? $field->validation_callback : null;
            if ( ! is_callable( $original ) ) {
                continue;
            }

            self::$commit_callbacks[ $name ] = $original;
            $field->validation_callback = array( __CLASS__, $validator );
            $field->save_callback = array( __CLASS__, 'commitValidatedAction' );

            $readback = $addon->get_field( $name, array() );
            if ( is_object( $readback )
                && isset( $readback->validation_callback, $readback->save_callback )
                && array( __CLASS__, $validator ) === $readback->validation_callback
                && array( __CLASS__, 'commitValidatedAction' ) === $readback->save_callback ) {
                self::$rewired[ $name ] = true;
            }
        }
    }

    public static function validateVisualPackage( $field, $value ) {
        $json = self::visualPackageJsonString( $value );
        if ( null === $json ) {
            self::setFieldError( $field, 'Profile Package JSON must be text or a decoded JSON object.' );
            return;
        }
        if ( '' === trim( $json ) ) {
            return;
        }

        try {
            $validation = SettingsLifecycleWorkflow::forWordPress()->validateVisualJson( $json );
            if ( empty( $validation['valid'] ) ) {
                self::setFieldError( $field, isset( $validation['message'] ) ? $validation['message'] : 'Profile Package JSON is invalid.' );
            }
        } catch ( LifecycleException $exception ) {
            self::setFieldError( $field, $exception->getMessage() );
        } catch ( \Throwable $exception ) {
            self::setFieldError( $field, 'Profile Package JSON could not be validated safely.' );
        }
    }

    public static function validateFormAction( $field, $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }
        if ( 1 !== preg_match( '/^form:([1-9][0-9]*)$/', trim( $value ) ) ) {
            $name = self::fieldName( $field );
            $messages = array(
                'operations_setup_action'   => 'The selected operations setup action is invalid. Refresh the page and try again.',
                'inbox_setup_action'        => 'The selected Inbox setup action is invalid. Refresh the page and try again.',
                'entry_detail_setup_action' => 'The selected Entry Detail setup action is invalid. Refresh the page and try again.',
            );
            self::setFieldError( $field, isset( $messages[ $name ] ) ? $messages[ $name ] : 'The selected setup action is invalid. Refresh the page and try again.' );
        }
    }

    public static function validateBindingAction( $field, $value ) {
        $row_token = self::postedRowToken();
        $row_submission = '' !== $row_token;
        if ( $row_submission ) {
            $row_values = isset( $_POST['gpp_binding_row'] ) && is_array( $_POST['gpp_binding_row'] )
                ? ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_binding_row'] ) : $_POST['gpp_binding_row'] )
                : array();
            $encoded = isset( $row_values[ $row_token ] ) && is_scalar( $row_values[ $row_token ] )
                ? (string) $row_values[ $row_token ]
                : '';
            $row_action = self::decodeBindingAction( $encoded );
            if ( 1 !== preg_match( '/^[a-f0-9]{24}$/', $row_token )
                || null === $row_action
                || self::bindingRowToken( $row_action ) !== $row_token ) {
                self::setFieldError( $field, 'The selected mapping row no longer matches its submitted action. Refresh the page and try again.' );
                return;
            }
            $value = $encoded;
        }

        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        $action = self::decodeBindingAction( $value );
        if ( null === $action || ( ! $row_submission && 'rollback' !== $action['action'] ) ) {
            self::setFieldError( $field, 'The selected binding management action is invalid. Refresh the page and try again.' );
            return;
        }

        if ( in_array( $action['action'], array( 'repair', 'unmap', 'print_option', 'clear_print_option' ), true )
            && OperationsBindingManagementPolicy::DIRECT_FIELD !== OperationsBindingManagementPolicy::kind( $action['semantic_slot_key'] ) ) {
            self::setFieldError( $field, 'This semantic meaning is not admitted as a direct Gravity Forms field mapping.' );
        }
    }

    public static function validateVisualVariantAction( $field, $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return;
        }

        try {
            $choices = EntryDetailVisualVariantService::forWordPress()->settingsChoices();
        } catch ( \Throwable $exception ) {
            self::setFieldError( $field, 'Entry Detail design choices could not be validated safely.' );
            return;
        }

        foreach ( $choices as $choice ) {
            if ( isset( $choice['value'] ) && hash_equals( (string) $choice['value'], trim( $value ) ) ) {
                return;
            }
        }
        self::setFieldError( $field, 'The selected Entry Detail design action is no longer current. Refresh the page and try again.' );
    }

    public static function commitValidatedAction( $field, $value ) {
        $name = self::fieldName( $field );
        if ( '' === $name || ! isset( self::$commit_callbacks[ $name ] ) ) {
            return '';
        }

        $row_token = 'binding_management_action' === $name ? self::postedRowToken() : '';
        $has_action = '' !== $row_token || ( is_string( $value ) && '' !== trim( $value ) ) || ( 'visual_profile_package_json' === $name && is_array( $value ) && ! empty( $value ) );
        if ( ! $has_action ) {
            return '';
        }

        $identity = hash( 'sha256', $name . '|' . $row_token . '|' . self::stableValueIdentity( $value ) );
        if ( isset( self::$committed[ $identity ] ) ) {
            return '';
        }
        self::$committed[ $identity ] = true;

        // Gravity Forms 3.1.1.1 reaches field save callbacks only after the
        // renderer's complete validation pass succeeds. Reusing the historical
        // callback here preserves each command's lifecycle/CAS implementation,
        // diagnostics and transient request feedback while removing its ability
        // to mutate during a rejected sibling validation transaction.
        call_user_func( self::$commit_callbacks[ $name ], $field, $value );
        return '';
    }

    private static function decodeBindingAction( $value ) {
        if ( ! is_string( $value ) || '' === $value || 1 !== preg_match( '/^[A-Za-z0-9_-]+$/', $value ) ) {
            return null;
        }
        $padded = strtr( $value, '-_', '+/' );
        $padding = strlen( $padded ) % 4;
        if ( $padding ) {
            $padded .= str_repeat( '=', 4 - $padding );
        }
        $decoded = base64_decode( $padded, true );
        if ( false === $decoded ) {
            return null;
        }
        $payload = json_decode( $decoded, true );
        if ( ! is_array( $payload ) || empty( $payload['action'] ) ) {
            return null;
        }

        $expected_by_action = array(
            'repair' => array( 'action', 'binding_set_id', 'binding_set_version', 'context_key', 'field_id', 'semantic_slot_key' ),
            'unmap' => array( 'action', 'binding_set_id', 'binding_set_version', 'context_key', 'semantic_slot_key' ),
            'print_option' => array( 'action', 'binding_set_id', 'binding_set_version', 'canonical_option', 'context_key', 'host_raw_value', 'semantic_slot_key' ),
            'clear_print_option' => array( 'action', 'binding_set_id', 'binding_set_version', 'canonical_option', 'context_key', 'semantic_slot_key' ),
            'rollback' => array( 'action', 'binding_set_id', 'binding_set_version', 'context_key', 'expected_binding_set_id', 'expected_binding_set_version' ),
        );
        if ( ! isset( $expected_by_action[ $payload['action'] ] ) ) {
            return null;
        }

        $actual = array_keys( $payload );
        $expected = $expected_by_action[ $payload['action'] ];
        sort( $actual, SORT_STRING );
        sort( $expected, SORT_STRING );
        return $actual === $expected ? $payload : null;
    }

    private static function bindingRowToken( $action ) {
        if ( ! is_array( $action ) || empty( $action['action'] ) ) {
            return '';
        }
        if ( in_array( $action['action'], array( 'repair', 'unmap' ), true ) ) {
            $parts = array( 'mapping', $action['context_key'], $action['binding_set_id'], $action['binding_set_version'], $action['semantic_slot_key'] );
        } elseif ( in_array( $action['action'], array( 'print_option', 'clear_print_option' ), true ) ) {
            $parts = array( 'print', $action['context_key'], $action['binding_set_id'], $action['binding_set_version'], $action['semantic_slot_key'], $action['canonical_option'] );
        } else {
            return '';
        }
        return substr( hash( 'sha256', implode( '|', array_map( 'strval', $parts ) ) ), 0, 24 );
    }

    private static function postedRowToken() {
        return isset( $_POST['gpp_binding_row_action'] ) && is_scalar( $_POST['gpp_binding_row_action'] )
            ? trim( (string) ( function_exists( 'wp_unslash' ) ? wp_unslash( $_POST['gpp_binding_row_action'] ) : $_POST['gpp_binding_row_action'] ) )
            : '';
    }

    private static function fieldName( $field ) {
        if ( is_array( $field ) && isset( $field['name'] ) && is_string( $field['name'] ) ) {
            return $field['name'];
        }
        if ( is_object( $field ) && isset( $field->name ) && is_string( $field->name ) ) {
            return $field->name;
        }
        return '';
    }

    private static function visualPackageJsonString( $value ) {
        if ( is_string( $value ) ) {
            return $value;
        }
        if ( ! is_array( $value ) ) {
            return null;
        }
        $json = json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
        return false === $json ? null : $json;
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
