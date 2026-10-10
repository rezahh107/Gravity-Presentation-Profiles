<?php

namespace GravityPresentationProfiles\GravityForms;

/**
 * Read-only bundled help in the existing GF Add-On Settings surface.
 * File names are fixed and never obtained from the request.
 */
final class InPluginHelp {
    public static function render() {
        $locale = function_exists( 'determine_locale' ) ? determine_locale() : ( function_exists( 'get_locale' ) ? get_locale() : 'en_US' );
        $language = 0 === strpos( (string) $locale, 'fa_' ) ? 'fa_IR' : 'en_US';
        $path = dirname( __DIR__, 2 ) . '/help/' . $language . '.html';
        if ( ! is_readable( $path ) ) {
            echo '<p>' . esc_html__( 'The bundled GPP guide is unavailable. Reinstall a validated release package.', 'gravity-presentation-profiles' ) . '</p>';
            return;
        }
        // Trusted, fixed plugin-owned HTML: no request content or saved data.
        readfile( $path );
    }
}
