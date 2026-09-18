<?php
/** Test-only observer for the real Gravity Forms Add-On settings request. */
defined( 'ABSPATH' ) || exit;

$gpp_wu18_settings_probe_buffer_level = null;

$gpp_wu18_is_settings_request = static function () {
    $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
    $subview = isset( $_GET['subview'] ) ? sanitize_key( wp_unslash( $_GET['subview'] ) ) : '';
    return 'gf_settings' === $page && 'gravity-presentation-profiles' === $subview;
};

add_action(
    'current_screen',
    static function () use ( $gpp_wu18_is_settings_request ) {
        if ( ! $gpp_wu18_is_settings_request() ) {
            return;
        }

        $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
        $form_id = (int) getenv( 'WU18_SETUP_FORM_ID' );
        if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || $form_id <= 0 ) {
            return;
        }

        // Capture lifecycle truth before any probe below is allowed to invoke an
        // autoloader. Availability and preloaded state are different facts.
        $loaded_before_autoload_check = class_exists( 'Gravity_Flow_API', false );
        $available = class_exists( 'Gravity_Flow_API' );

        $method_fact = static function ( $method_name ) use ( $available ) {
            if ( ! $available || ! method_exists( 'Gravity_Flow_API', $method_name ) ) {
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
            if ( $available ) {
                new Gravity_Flow_API( $form_id );
                $constructible = true;
            }
        } catch ( Throwable $exception ) {
            $constructible = false;
        }

        $facts = array(
            'schema_version' => '1.2.0',
            'request_context' => 'gravity_forms_addon_settings_current_screen',
            'gravity_flow_api_loaded_before_autoload_check' => $loaded_before_autoload_check,
            'gravity_flow_api_available' => $available,
            'form_bound_api_constructible' => $constructible,
            'get_current_step' => $method_fact( 'get_current_step' ),
            'get_status' => $method_fact( 'get_status' ),
            'setup_notice_rendered' => null,
            'setup_action_rendered' => null,
        );
        wp_mkdir_p( $artifact_dir );
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'wu18-admin-settings-context.json',
            wp_json_encode( $facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
        );
    },
    99
);

// Observe only the bounded admin-notice output and immediately replay it. The
// artifact stores booleans only; no nonce, token, HTML, form title or site data
// is retained.
add_action(
    'admin_notices',
    static function () use ( $gpp_wu18_is_settings_request, &$gpp_wu18_settings_probe_buffer_level ) {
        if ( ! $gpp_wu18_is_settings_request() ) {
            return;
        }
        ob_start();
        $gpp_wu18_settings_probe_buffer_level = ob_get_level();
    },
    -999
);

add_action(
    'admin_notices',
    static function () use ( $gpp_wu18_is_settings_request, &$gpp_wu18_settings_probe_buffer_level ) {
        if ( ! $gpp_wu18_is_settings_request()
            || ! is_int( $gpp_wu18_settings_probe_buffer_level )
            || ob_get_level() < $gpp_wu18_settings_probe_buffer_level ) {
            return;
        }

        $html = (string) ob_get_clean();
        $gpp_wu18_settings_probe_buffer_level = null;

        $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
        $path = is_string( $artifact_dir ) && '' !== $artifact_dir
            ? trailingslashit( $artifact_dir ) . 'wu18-admin-settings-context.json'
            : '';
        if ( '' !== $path && is_readable( $path ) ) {
            $facts = json_decode( (string) file_get_contents( $path ), true );
            if ( is_array( $facts ) ) {
                $facts['setup_notice_rendered'] = false !== strpos( $html, 'data-gpp-entry-detail-setup="explicit"' );
                $facts['setup_action_rendered'] = false !== strpos( $html, 'name="action" value="gpp_initialize_entry_detail_presentation"' );
                file_put_contents(
                    $path,
                    wp_json_encode( $facts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
                );
            }
        }

        echo $html;
    },
    PHP_INT_MAX
);
