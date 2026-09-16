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
                'choices' => $this->choices( $field ),
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
                    'choices' => $this->choices( $field ),
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

    /**
     * The field's own authoritative choice list, as the host configured it.
     *
     * This is read so an administrator confirms a Print option against a raw
     * value the form actually defines. It is never used to infer a mapping from
     * a choice label.
     */
    private function choices( $field ) {
        if ( ! isset( $field->choices ) || ! is_array( $field->choices ) ) {
            return array();
        }

        $choices = array();
        foreach ( $field->choices as $choice ) {
            if ( ! is_array( $choice ) || ! isset( $choice['value'] ) || ! is_scalar( $choice['value'] ) ) {
                continue;
            }

            $value = (string) $choice['value'];
            if ( '' === $value ) {
                continue;
            }

            $choices[] = array(
                'value' => $value,
                'text' => isset( $choice['text'] ) && is_scalar( $choice['text'] ) && '' !== trim( (string) $choice['text'] )
                    ? trim( (string) $choice['text'] )
                    : $value,
            );
        }

        return $choices;
    }

    private function normalizeFieldId( $field_id ) {
        return 1 === preg_match( '/^[1-9][0-9]*$/', (string) $field_id ) ? (int) $field_id : (string) $field_id;
    }
}
