<?php
/** Test-only observer for the real Gravity Forms Add-On settings request. */
defined( 'ABSPATH' ) || exit;

add_action(
    'current_screen',
    static function () {
        $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        $subview = isset( $_GET['subview'] ) ? sanitize_key( wp_unslash( $_GET['subview'] ) ) : '';
        if ( 'gf_settings' !== $page || 'gravity-presentation-profiles' !== $subview ) {
            return;
        }

        $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
        $form_id = (int) getenv( 'WU18_SETUP_FORM_ID' );
        if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || $form_id <= 0 ) {
            return;
        }

        $method_fact = static function ( $method_name ) {
            if ( ! class_exists( 'Gravity_Flow_API' ) || ! method_exists( 'Gravity_Flow_API', $method_name ) ) {
                return null;
            }
            try {
                $method = new ReflectionMethod( 'Gravity_Flow_API', $method_name );
            } catch ( ReflectionException $exception ) {
                return null;
            }
            return array(
                'public' => $method->isPublic(),
                'static' => $method->isStatic(),
                'required_parameters' => $method->getNumberOfRequiredParameters(),
                'total_parameters' => $method->getNumberOfParameters(),
            );
        };

        $constructible = false;
        try {
            if ( class_exists( 'Gravity_Flow_API' ) ) {
                new Gravity_Flow_API( $form_id );
                $constructible = true;
            }
        } catch ( Throwable $exception ) {
            $constructible = false;
        }

        $facts = array(
            'schema_version' => '1.0.0',
            'request_context' => 'gravity_forms_addon_settings_current_screen',
            'gravity_flow_api_loaded_before_autoload_check' => class_exists( 'Gravity_Flow_API', false ),
            'gravity_flow_api_available' => class_exists( 'Gravity_Flow_API' ),
            'form_bound_api_constructible' => $constructible,
            'get_current_step' => $method_fact( 'get_current_step' ),
            'get_status' => $method_fact( 'get_status' ),
        );
        wp_mkdir_p( $artifact_dir );
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'wu18-admin-settings-context.json',
            wp_json_encode( $facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
        );
    },
    99
);
