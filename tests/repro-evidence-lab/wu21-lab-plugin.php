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

add_action( 'plugins_loaded', array( 'GPP_WU21_Lab_Adapter', 'boot' ), 30 );
