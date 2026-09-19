<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/** CSS-only runtime layer for the optional lifecycle-backed Full Width variant. */
final class EntryDetailFullWidthPresentationAdapter {
    public static function register() {
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
    }

    public static function enqueueAssets() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
            return;
        }

        try {
            $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $activation = $visual->resolve( EntryDetailVisualVariant::SURFACE );
        } catch ( \Throwable $exception ) {
            return;
        }

        if ( ! is_array( $activation )
            || EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID !== ( isset( $activation['package_id'] ) ? $activation['package_id'] : null )
            || EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION !== ( isset( $activation['package_version'] ) ? $activation['package_version'] : null )
            || EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID !== ( isset( $activation['profile_id'] ) ? $activation['profile_id'] : null ) ) {
            return;
        }

        $absolute = dirname( GPP_PLUGIN_FILE ) . '/' . EntryDetailVisualVariant::FULL_WIDTH_STYLE_PATH;
        if ( ! is_readable( $absolute ) ) {
            return;
        }

        wp_enqueue_style(
            EntryDetailVisualVariant::FULL_WIDTH_STYLE_HANDLE,
            plugins_url( EntryDetailVisualVariant::FULL_WIDTH_STYLE_PATH, GPP_PLUGIN_FILE ),
            array( EntryDetailPresentationAdapter::STYLE_HANDLE ),
            self::assetVersion( $absolute )
        );
    }

    private static function assetVersion( $absolute_path ) {
        if ( function_exists( 'hash_file' ) ) {
            $hash = hash_file( 'sha256', $absolute_path );
            if ( is_string( $hash ) && '' !== $hash ) {
                return substr( $hash, 0, 16 );
            }
        }
        return false;
    }
}
