<?php

namespace GravityPresentationProfiles\GravityForms;

final class FormPresentationOwnershipSettings {
    const SETTINGS_HOOK = 'gform_gravity-presentation-profiles_form_settings_fields';

    public static function register() {
        if ( ! function_exists( 'add_filter' ) ) {
            return;
        }

        add_filter( self::SETTINGS_HOOK, array( __CLASS__, 'clarifyOwnership' ), 10, 2 );
    }

    public static function clarifyOwnership( $sections, $form ) {
        unset( $form );

        if ( ! is_array( $sections ) ) {
            return $sections;
        }

        foreach ( $sections as &$section ) {
            if ( ! isset( $section['fields'] ) || ! is_array( $section['fields'] ) ) {
                continue;
            }

            foreach ( $section['fields'] as &$field ) {
                if ( ! is_array( $field ) || ! isset( $field['name'] ) ) {
                    continue;
                }

                if ( 'enabled' === $field['name'] ) {
                    $field['label'] = esc_html__( 'Form presentation', 'gravity-presentation-profiles' );
                    $field['description'] = esc_html__(
                        'When enabled, GPP may apply the selected Gravity Forms presentation profile to this form. Turn this off when another presentation system owns this form\'s appearance. Disabling this affects only GPP presentation of this Gravity Forms form; it does not disable GPP Inbox, Entry Detail, Print, mappings, diagnostics, or other forms.',
                        'gravity-presentation-profiles'
                    );

                    if ( isset( $field['choices'] ) && is_array( $field['choices'] ) ) {
                        foreach ( $field['choices'] as &$choice ) {
                            if ( is_array( $choice ) && isset( $choice['name'] ) && 'enabled' === $choice['name'] ) {
                                $choice['label'] = esc_html__( 'Apply GPP presentation to this form', 'gravity-presentation-profiles' );
                            }
                        }
                        unset( $choice );
                    }
                }

                if ( in_array( $field['name'], array( 'declarative_profile', 'profile' ), true ) ) {
                    $inactive_note = esc_html__(
                        'This selection is preserved while GPP presentation is off, but it is not applied to the form until GPP presentation is turned back on.',
                        'gravity-presentation-profiles'
                    );
                    $description = isset( $field['description'] ) && is_string( $field['description'] )
                        ? trim( $field['description'] )
                        : '';

                    if ( false === strpos( $description, $inactive_note ) ) {
                        $field['description'] = '' === $description
                            ? $inactive_note
                            : $description . ' ' . $inactive_note;
                    }
                }
            }
            unset( $field );
        }
        unset( $section );

        return $sections;
    }
}
