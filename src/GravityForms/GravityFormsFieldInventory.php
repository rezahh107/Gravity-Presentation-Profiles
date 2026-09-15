<?php

namespace GravityPresentationProfiles\GravityForms;

final class GravityFormsFieldInventory {
    public function load( $form_id ) {
        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_form' ) ) {
            return array( 'form_exists' => false, 'form_title' => null, 'form' => null, 'fields' => array() );
        }

        $form = \GFAPI::get_form( $form_id );
        if ( ! is_array( $form ) ) {
            return array( 'form_exists' => false, 'form_title' => null, 'form' => null, 'fields' => array() );
        }

        $fields = array();
        $form_fields = isset( $form['fields'] ) && is_array( $form['fields'] ) ? $form['fields'] : array();
        foreach ( $form_fields as $field ) {
            if ( ! is_object( $field ) || ! isset( $field->id ) ) {
                continue;
            }

            $id = (string) $field->id;
            $label = isset( $field->label ) && is_string( $field->label ) && '' !== trim( $field->label )
                ? trim( $field->label )
                : 'Field ' . $id;
            $type = isset( $field->type ) && is_string( $field->type ) ? $field->type : 'unknown';
            $fields[ $id ] = array(
                'field_id' => $this->normalizeFieldId( $id ),
                'label' => $label,
                'type' => $type,
            );

            // EnvironmentBindingSet deliberately admits Gravity Forms input IDs
            // such as 4.3. They are stable host identities too, so health must
            // enumerate them from the authoritative field definition rather than
            // falsely reporting a healthy compound-field input as missing.
            if ( ! isset( $field->inputs ) || ! is_array( $field->inputs ) ) {
                continue;
            }
            foreach ( $field->inputs as $input ) {
                if ( ! is_array( $input ) || ! isset( $input['id'] ) ) {
                    continue;
                }
                $input_id = (string) $input['id'];
                if ( 1 !== preg_match( '/^[1-9][0-9]*\.[1-9][0-9]*$/', $input_id ) ) {
                    continue;
                }
                $input_label = isset( $input['label'] ) && is_string( $input['label'] ) && '' !== trim( $input['label'] )
                    ? $label . ' — ' . trim( $input['label'] )
                    : $label . ' — Input ' . $input_id;
                $fields[ $input_id ] = array(
                    'field_id' => $input_id,
                    'label' => $input_label,
                    'type' => $type,
                );
            }
        }

        return array(
            'form_exists' => true,
            'form_title' => isset( $form['title'] ) && is_string( $form['title'] ) ? $form['title'] : null,
            'form' => $form,
            'fields' => $fields,
        );
    }

    public function exactField( $form, $field_id ) {
        if ( ! is_array( $form ) || ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
            return null;
        }
        $field = \GFAPI::get_field( $form, $field_id );
        return is_object( $field ) ? $field : null;
    }

    private function normalizeFieldId( $field_id ) {
        return 1 === preg_match( '/^[1-9][0-9]*$/', (string) $field_id ) ? (int) $field_id : (string) $field_id;
    }
}
