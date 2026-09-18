<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Reads already-resolved typed host source references without creating a
 * second semantic binding system. The caller remains responsible for proving
 * that the source_ref is admitted for its presentation surface.
 *
 * Raw and display reads are deliberately separate entry points. A display read
 * returns the host's human-readable label for a stored value; a raw read returns
 * the exact value Gravity Forms stored. Option/checkbox selection logic must
 * compare raw host values, because a display label is localized, editable and
 * not the identity Gravity Forms persists. There is intentionally no combined
 * `read()` method, so the two meanings cannot be conflated at a call site.
 */
final class BoundHostValueReader {
    /**
     * Exact value as stored by the host for this source. No Gravity Forms
     * formatter runs here: formatting is what produces a display label.
     */
    public function readRaw( $source, $form, $entry ) {
        unset( $form );

        if ( ! is_array( $source ) || empty( $source['type'] ) || ! is_array( $entry ) ) {
            return null;
        }

        switch ( $source['type'] ) {
            case 'gravity_forms.field':
                $field_id = isset( $source['field_id'] ) ? (string) $source['field_id'] : '';
                return '' !== $field_id && array_key_exists( $field_id, $entry ) ? $entry[ $field_id ] : null;

            case 'gravity_forms.entry_meta':
                return $this->entryMeta( $source, $entry );

            case 'gravity_flow.state':
                return $this->flowState( $source, $entry );
        }

        return null;
    }

    /**
     * Human-readable presentation text for this source.
     *
     * For a Gravity Forms field this delegates to the host field object so that
     * choice labels, compound inputs and field-specific rendering stay
     * host-owned. The Gravity Forms signature is
     * `get_value_entry_detail( $value, $currency = '', $use_text = false, $format = 'html', $media = 'screen' )`,
     * so the currency argument must be a currency code and never the entry.
     */
    public function readDisplay( $source, $form, $entry ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) || ! is_array( $entry ) ) {
            return null;
        }

        if ( 'gravity_forms.field' !== $source['type'] ) {
            return $this->readRaw( $source, $form, $entry );
        }

        $raw = $this->readRaw( $source, $form, $entry );
        if ( null === $raw ) {
            return null;
        }

        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
            return $raw;
        }

        $field = \GFAPI::get_field( $form, $source['field_id'] );
        if ( ! is_object( $field ) || ! method_exists( $field, 'get_value_entry_detail' ) ) {
            return $raw;
        }

        return $field->get_value_entry_detail( $raw, '', true, 'text' );
    }

    private function entryMeta( $source, $entry ) {
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
    }

    private function flowState( $source, $entry ) {
        if ( empty( $source['state_key'] ) || ! class_exists( 'Gravity_Flow_API' ) || empty( $entry['form_id'] ) ) {
            return null;
        }

        $api  = new \Gravity_Flow_API( (int) $entry['form_id'] );

        if ( 'current_step' === $source['state_key'] ) {
            $step = $api->get_current_step( $entry );
            return $step ? $step->get_name() : null;
        }
        if ( 'status' === $source['state_key'] ) {
            return method_exists( $api, 'get_status' ) ? $api->get_status( $entry ) : null;
        }
        if ( 'due_at' === $source['state_key'] ) {
            $step = $api->get_current_step( $entry );
            return $step && method_exists( $step, 'get_due_date' ) ? $step->get_due_date() : null;
        }

        return null;
    }
}
