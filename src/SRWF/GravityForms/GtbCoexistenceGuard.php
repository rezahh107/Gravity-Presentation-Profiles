<?php

namespace GravityPresentationProfiles\SRWF\GravityForms;

final class GtbCoexistenceGuard {
    const SETTINGS_HOOK = 'gform_gravity-presentation-profiles_form_settings_fields';
    const OPT_IN_CLASS  = 'srwf-registration-theme';

    public static function register() {
        if ( ! function_exists( 'add_filter' ) ) {
            return;
        }

        add_filter( self::SETTINGS_HOOK, array( __CLASS__, 'addOverlapWarning' ), 20, 2 );
    }

    public static function addOverlapWarning( $sections, $form ) {
        if ( ! is_array( $sections ) || ! self::gppPresentationEnabled( $form ) || ! self::hasExactOptInClass( $form ) ) {
            return $sections;
        }

        $warning = esc_html__(
            'Another presentation owner appears to be enabled for this form (Gravity Theme Builder / srwf-registration-theme). Running both presentation layers may produce CSS conflicts. Consider disabling GPP presentation for this form.',
            'gravity-presentation-profiles'
        );

        foreach ( $sections as &$section ) {
            if ( ! isset( $section['fields'] ) || ! is_array( $section['fields'] ) ) {
                continue;
            }

            foreach ( $section['fields'] as &$field ) {
                if ( ! is_array( $field ) || ! isset( $field['name'] ) || 'enabled' !== $field['name'] ) {
                    continue;
                }

                $description = isset( $field['description'] ) && is_string( $field['description'] )
                    ? trim( $field['description'] )
                    : '';
                if ( false === strpos( $description, $warning ) ) {
                    $field['description'] = '' === $description ? $warning : $description . ' ' . $warning;
                }
            }
            unset( $field );
        }
        unset( $section );

        return $sections;
    }

    private static function gppPresentationEnabled( $form ) {
        if ( ! is_array( $form ) || ! isset( $form['gravity-presentation-profiles'] ) || ! is_array( $form['gravity-presentation-profiles'] ) ) {
            return false;
        }

        $settings = $form['gravity-presentation-profiles'];
        $enabled  = isset( $settings['enabled'] ) ? $settings['enabled'] : null;

        return in_array( $enabled, array( true, 1, '1' ), true );
    }

    private static function hasExactOptInClass( $form ) {
        if ( ! is_array( $form ) || ! isset( $form['cssClass'] ) || ! is_string( $form['cssClass'] ) ) {
            return false;
        }

        $class_string = trim( $form['cssClass'] );
        if ( '' === $class_string ) {
            return false;
        }

        $classes = preg_split( '/\s+/', $class_string, -1, PREG_SPLIT_NO_EMPTY );

        return is_array( $classes ) && in_array( self::OPT_IN_CLASS, $classes, true );
    }
}
