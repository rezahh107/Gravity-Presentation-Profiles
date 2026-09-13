<?php
/**
 * WU21 Evidence Lab adapter. Test-only MU plugin; never production configuration.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class GPP_WU21_Lab_Adapter {
    const OPTION_BINDINGS = 'gpp_wu21_binding_sets';
    const INSTALLATION_ID = 'wu21-sim-installation';

    private static $resolver = null;
    private static $binding_sets = array();

    public static function boot() {
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'columns' ), 30, 2 );
        add_filter( 'gravityflow_inbox_field_value', array( __CLASS__, 'value' ), 30, 4 );
    }

    public static function columns( $columns, $args ) {
        $columns['gpp_wu21_student_name'] = 'Student Name';
        $columns['gpp_wu21_student_photo'] = 'Student Photo';
        $columns['gpp_wu21_current_step'] = 'Current Step';
        $columns['gpp_wu21_created_at'] = 'Created At';

        // School and Due are intentionally absent: no independent PROVEN evidence.
        return $columns;
    }

    public static function value( $value, $form_id, $field_id, $entry ) {
        $map = array(
            'gpp_wu21_student_name' => 'student.full_name',
            'gpp_wu21_student_photo' => 'student.photo',
            'gpp_wu21_current_step' => 'workflow.current_step',
            'gpp_wu21_created_at' => 'entry.created_at',
        );

        if ( ! isset( $map[ $field_id ] ) ) {
            return $value;
        }

        $slot = $map[ $field_id ];
        $resolved = self::resolve( $entry, $slot );
        if ( ! $resolved['resolved'] || ! self::availability_is_proven( $resolved['binding_set_id'], $slot ) ) {
            return '';
        }

        $source = $resolved['source_ref'];
        switch ( $source['type'] ) {
            case 'gravity_forms.field':
                $key = (string) $source['field_id'];
                return isset( $entry[ $key ] ) ? (string) $entry[ $key ] : '';

            case 'gravity_forms.entry_meta':
                $key = $source['meta_key'];
                if ( isset( $entry[ $key ] ) ) {
                    return (string) $entry[ $key ];
                }
                $meta = gform_get_meta( (int) $entry['id'], $key );
                return is_scalar( $meta ) ? (string) $meta : '';

            case 'gravity_flow.state':
                if ( 'current_step' !== $source['state_key'] || ! class_exists( 'Gravity_Flow_API' ) ) {
                    return '';
                }
                $api = new Gravity_Flow_API( (int) $form_id );
                $step = $api->get_current_step( $entry );
                return $step ? (string) $step->get_name() : '';
        }

        return '';
    }

    public static function resolve( $entry, $slot ) {
        self::ensure_resolver();
        if ( ! self::$resolver ) {
            return array(
                'resolved' => false,
                'binding_set_id' => null,
                'semantic_slot_key' => $slot,
                'state' => 'NOT_PROVEN',
                'source_ref' => null,
                'reason' => 'lab_binding_resolver_unavailable',
            );
        }

        return self::$resolver->resolve(
            array(
                'installation_id' => self::INSTALLATION_ID,
                'form_id' => (int) $entry['form_id'],
                'entry_id' => (int) $entry['id'],
                'surface' => 'gravity_flow.inbox',
            ),
            $slot
        );
    }

    private static function ensure_resolver() {
        if ( null !== self::$resolver ) {
            return;
        }

        if ( ! class_exists( '\\GravityPresentationProfiles\\Core\\Portable\\SemanticBindingResolver' ) ) {
            return;
        }

        self::$binding_sets = get_option( self::OPTION_BINDINGS, array() );
        if ( ! is_array( self::$binding_sets ) || array() === self::$binding_sets ) {
            return;
        }

        $slots = array(
            'student.full_name',
            'student.photo',
            'entry.created_at',
            'workflow.current_step',
            'school.name',
            'workflow.due_at',
        );
        self::$resolver = new \GravityPresentationProfiles\Core\Portable\SemanticBindingResolver( self::$binding_sets, $slots );
    }

    private static function availability_is_proven( $binding_set_id, $slot ) {
        foreach ( self::$binding_sets as $binding_set ) {
            if ( $binding_set_id !== $binding_set['binding_set_id'] ) {
                continue;
            }
            foreach ( $binding_set['runtime_claims'] as $claim ) {
                if ( $slot === $claim['semantic_slot_key'] && 'availability' === $claim['claim'] ) {
                    return 'PROVEN' === $claim['evidence_state'];
                }
            }
        }
        return false;
    }
}

final class GPP_WU21_Polling_Diagnostics {
    const ROUTE = '/gravityflow/internal/inbox/changes';

    private static $active = false;

    public static function boot() {
        add_filter( 'rest_pre_dispatch', array( __CLASS__, 'before_dispatch' ), 10, 3 );
        add_filter( 'rest_request_after_callbacks', array( __CLASS__, 'after_callbacks' ), 10, 3 );
        register_shutdown_function( array( __CLASS__, 'shutdown' ) );
    }

    public static function before_dispatch( $result, $server, $request ) {
        if ( ! $request instanceof WP_REST_Request || self::ROUTE !== $request->get_route() ) {
            return $result;
        }

        self::$active = true;
        $token = $request->get_param( 'gflow_access_token' );
        $decoded = false;
        if ( is_string( $token ) && '' !== $token && function_exists( 'gravity_flow' ) ) {
            $decoded = gravity_flow()->decode_access_token( $token );
        }

        $search_args = $request->get_param( 'search_args' );
        if ( is_string( $search_args ) ) {
            $decoded_search_args = json_decode( $search_args, true );
            if ( is_array( $decoded_search_args ) ) {
                $search_args = $decoded_search_args;
            }
        }

        self::write_event( array(
            'event' => 'rest_pre_dispatch',
            'route' => $request->get_route(),
            'method' => $request->get_method(),
            'current_user_id' => get_current_user_id(),
            'is_user_logged_in' => is_user_logged_in(),
            'token_present' => is_string( $token ) && '' !== $token,
            'token_sha256' => is_string( $token ) && '' !== $token ? hash( 'sha256', $token ) : null,
            'token_subject' => is_array( $decoded ) && isset( $decoded['sub'] ) ? sanitize_text_field( $decoded['sub'] ) : null,
            'current_ids' => $request->get_param( 'current_ids' ),
            'search_args' => $search_args,
        ) );

        return $result;
    }

    public static function after_callbacks( $response, $handler, $request ) {
        if ( ! $request instanceof WP_REST_Request || self::ROUTE !== $request->get_route() ) {
            return $response;
        }

        $normalized = rest_ensure_response( $response );
        self::write_event( array(
            'event' => 'rest_request_after_callbacks',
            'route' => $request->get_route(),
            'status' => $normalized->get_status(),
            'response_data' => self::bounded_value( $normalized->get_data() ),
        ) );
        self::$active = false;

        return $response;
    }

    public static function shutdown() {
        if ( ! self::$active ) {
            return;
        }

        $error = error_get_last();
        self::write_event( array(
            'event' => 'shutdown_after_polling_request',
            'fatal' => is_array( $error ) ? array(
                'type' => isset( $error['type'] ) ? $error['type'] : null,
                'message' => isset( $error['message'] ) ? self::bounded_text( $error['message'], 12000 ) : null,
                'file' => isset( $error['file'] ) ? $error['file'] : null,
                'line' => isset( $error['line'] ) ? $error['line'] : null,
            ) : null,
        ) );
    }

    private static function bounded_value( $value ) {
        if ( is_scalar( $value ) || null === $value ) {
            return self::bounded_text( $value, 4000 );
        }
        $encoded = wp_json_encode( $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
        return self::bounded_text( $encoded, 8000 );
    }

    private static function bounded_text( $value, $limit ) {
        $text = (string) $value;
        return strlen( $text ) > $limit ? substr( $text, 0, $limit ) . '…' : $text;
    }

    private static function write_event( $event ) {
        $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
        if ( ! $artifact_dir ) {
            return;
        }
        $event['observed_at_utc'] = gmdate( 'c' );
        file_put_contents(
            trailingslashit( $artifact_dir ) . 'polling-server-events.jsonl',
            wp_json_encode( $event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n",
            FILE_APPEND
        );
    }
}

add_action( 'plugins_loaded', array( 'GPP_WU21_Lab_Adapter', 'boot' ), 30 );
add_action( 'plugins_loaded', array( 'GPP_WU21_Polling_Diagnostics', 'boot' ), 31 );
