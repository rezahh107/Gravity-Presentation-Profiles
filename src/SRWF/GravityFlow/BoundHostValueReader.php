<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Reads already-resolved typed host source references without creating a
 * second semantic binding system. The caller remains responsible for proving
 * that the source_ref is admitted for its presentation surface.
 */
final class BoundHostValueReader {
    public function read( $source, $form, $entry ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) || ! is_array( $entry ) ) {
            return null;
        }

        switch ( $source['type'] ) {
            case 'gravity_forms.field':
                $field_id = isset( $source['field_id'] ) ? (string) $source['field_id'] : '';
                if ( '' === $field_id || ! array_key_exists( $field_id, $entry ) ) {
                    return null;
                }

                $raw = $entry[ $field_id ];
                if ( class_exists( 'GFAPI' ) && method_exists( 'GFAPI', 'get_field' ) ) {
                    $field = \GFAPI::get_field( $form, $source['field_id'] );
                    if ( is_object( $field ) && method_exists( $field, 'get_value_entry_detail' ) ) {
                        return $field->get_value_entry_detail( $raw, $entry, true, 'text' );
                    }
                }

                return $raw;

            case 'gravity_forms.entry_meta':
                if ( empty( $source['meta_key'] ) ) {
                    return null;
                }
                $key = $source['meta_key'];
                if ( array_key_exists( $key, $entry ) ) {
                    return $entry[ $key ];
                }
                return function_exists( 'gform_get_meta' ) && ! empty( $entry['id'] )
                    ? gform_get_meta( (int) $entry['id'], $key )
                    : null;

            case 'gravity_flow.state':
                if ( empty( $source['state_key'] ) || ! class_exists( 'Gravity_Flow_API' ) || empty( $entry['form_id'] ) ) {
                    return null;
                }
                $api  = new \Gravity_Flow_API( (int) $entry['form_id'] );
                $step = $api->get_current_step( $entry );

                if ( 'current_step' === $source['state_key'] ) {
                    return $step ? $step->get_name() : null;
                }
                if ( 'status' === $source['state_key'] ) {
                    return $step && method_exists( $step, 'get_status' ) ? $step->get_status() : null;
                }
                if ( 'due_at' === $source['state_key'] ) {
                    return $step && method_exists( $step, 'get_due_date' ) ? $step->get_due_date() : null;
                }
                return null;
        }

        return null;
    }
}
