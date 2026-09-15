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
            $fields[ $id ] = array(
                'field_id' => $field->id,
                'label' => isset( $field->label ) && is_string( $field->label ) && '' !== trim( $field->label ) ? $field->label : 'Field ' . $id,
                'type' => isset( $field->type ) && is_string( $field->type ) ? $field->type : 'unknown',
            );
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
}
