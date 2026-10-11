<?php

namespace GravityPresentationProfiles\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\InstalledVisualProfileCatalog;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Paint-only Schema 1.1 consumer for the GPP-owned frontend Inbox shell.
 *
 * No SRWF semantic slot, binding set, AG Grid column or host behavior is
 * required. An unsupported (although schema-valid) preference fails closed.
 */
final class DeclarativeInboxPresentation {
    const SURFACE = 'gravity_flow.inbox';
    const STYLE_HANDLE = 'gpp-gravity-flow-inbox-declarative';
    const ASSET_PATH = 'assets/css/gravity-flow-inbox-declarative.css';

    private const PREFERENCES = array(
        'composition' => array( 'surface_background' => '--gpp-declarative-inbox-background' ),
        'sections' => array( 'heading_text' => '--gpp-declarative-inbox-heading-color' ),
        'descriptions' => array( 'text' => '--gpp-declarative-inbox-helper-color' ),
    );

    public static function supported( $resolution ) {
        if ( ! is_array( $resolution )
            || '1.1.0' !== ( $resolution['schema_version'] ?? null )
            || self::SURFACE !== ( $resolution['surface'] ?? null )
            || ! isset( $resolution['artifact'], $resolution['profile'] )
            || ! is_array( $resolution['artifact'] ) || ! is_array( $resolution['profile'] ) ) {
            return false;
        }
        $profile = $resolution['profile'];
        $presentation = $profile['presentation'] ?? null;
        if ( ( $profile['semantic_slots'] ?? null ) !== array()
            || ! is_array( $presentation ) || array() === $presentation ) {
            return false;
        }
        foreach ( $presentation as $block => $preferences ) {
            if ( ! isset( self::PREFERENCES[ $block ] ) || ! is_array( $preferences ) || array() === $preferences ) {
                return false;
            }
            foreach ( $preferences as $name => $token_ref ) {
                if ( ! isset( self::PREFERENCES[ $block ][ $name ] )
                    || ! is_string( $token_ref ) || 0 !== strpos( $token_ref, 'colors.' ) ) {
                    return false;
                }
                $token_name = substr( $token_ref, 7 );
                $color = $resolution['artifact']['design_tokens']['colors'][ $token_name ] ?? null;
                if ( ! is_string( $color ) || 1 !== preg_match( '/^#[0-9A-Fa-f]{6}$/', $color ) ) {
                    return false;
                }
            }
        }
        return true;
    }

    /** Resolve the immutable installed record including its canonical hash. */
    public static function resolve( VisualPackageLifecycle $lifecycle ) {
        try {
            $activation = $lifecycle->resolve( self::SURFACE );
            if ( ! is_array( $activation ) ) {
                return null;
            }
            $resolution = ( new InstalledVisualProfileCatalog( $lifecycle ) )->resolveExact(
                self::SURFACE,
                $activation['package_id'],
                $activation['package_version'],
                $activation['profile_id']
            );
            return self::supported( $resolution ) ? $resolution : null;
        } catch ( \Throwable $exception ) {
            return null; // Corrupt/missing activation must leave native Inbox untouched.
        }
    }

    public static function forWordPress() {
        return self::resolve( new VisualPackageLifecycle(
            new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
        ) );
    }

    public static function assetAvailable() {
        return defined( 'GPP_PLUGIN_FILE' )
            && is_readable( dirname( GPP_PLUGIN_FILE ) . '/' . self::ASSET_PATH );
    }

    public static function css( $resolution ) {
        if ( ! self::supported( $resolution ) ) {
            return '';
        }
        $declarations = array();
        foreach ( self::PREFERENCES as $block => $names ) {
            foreach ( $names as $name => $property ) {
                if ( ! isset( $resolution['profile']['presentation'][ $block ][ $name ] ) ) {
                    continue;
                }
                $ref = $resolution['profile']['presentation'][ $block ][ $name ];
                $declarations[ $property ] = $resolution['artifact']['design_tokens']['colors'][ substr( $ref, 7 ) ];
            }
        }
        if ( array() === $declarations ) {
            return '';
        }
        ksort( $declarations, SORT_STRING );
        $css = '.gpp-inbox-surface.gpp-inbox-declarative{';
        foreach ( $declarations as $property => $color ) {
            $css .= $property . ':' . $color . ';';
        }
        return $css . '}';
    }
}
