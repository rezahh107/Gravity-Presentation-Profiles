<?php

namespace GravityPresentationProfiles;

final class Bootstrap {
    private static $initialized = false;

    public static function init() {
        if ( self::$initialized ) {
            return;
        }

        self::$initialized = true;

        if ( function_exists( 'add_action' ) ) {
            add_action( 'gform_loaded', array( __CLASS__, 'loadGravityFormsIntegration' ), 5 );
        }
    }

    public static function loadGravityFormsIntegration() {
        if ( ! class_exists( 'GFForms' ) || ! method_exists( 'GFForms', 'include_addon_framework' ) ) {
            return false;
        }

        \GFForms::include_addon_framework();

        if ( ! class_exists( 'GFAddOn' ) ) {
            return false;
        }

        $addon_class = 'GravityPresentationProfiles\\GravityForms\\AddOn';

        if ( ! class_exists( $addon_class ) ) {
            return false;
        }

        \GFAddOn::register( $addon_class );

        return true;
    }
}
