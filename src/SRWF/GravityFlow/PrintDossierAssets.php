<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

final class PrintDossierAssets {
    private const RAZAVI_PATH = 'assets/images/print/razavi-complex-approved.png';
    private const KANOON_PATH = 'assets/images/print/kanoon-approved.png';
    private const RAZAVI_SHA256 = '0aa32595b57609d292b82ea50468bfc9799a431501e7847b5b2ca2367b59c38b';
    private const KANOON_SHA256 = '21b5c90fc1dae292c80987b7737c88c4fb3904ce8e97bd09ca305d2211a8a159';

    public static function isReady() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return false;
        }

        $base = dirname( GPP_PLUGIN_FILE ) . '/';
        $razavi = $base . self::RAZAVI_PATH;
        $kanoon = $base . self::KANOON_PATH;

        return is_readable( $razavi )
            && is_readable( $kanoon )
            && self::RAZAVI_SHA256 === hash_file( 'sha256', $razavi )
            && self::KANOON_SHA256 === hash_file( 'sha256', $kanoon );
    }

    public static function razaviUrl() {
        return defined( 'GPP_PLUGIN_FILE' ) ? plugins_url( self::RAZAVI_PATH, GPP_PLUGIN_FILE ) : '';
    }

    public static function kanoonUrl() {
        return defined( 'GPP_PLUGIN_FILE' ) ? plugins_url( self::KANOON_PATH, GPP_PLUGIN_FILE ) : '';
    }

    public static function paths() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return array();
        }

        $base = dirname( GPP_PLUGIN_FILE ) . '/';
        return array(
            'razavi' => $base . self::RAZAVI_PATH,
            'kanoon' => $base . self::KANOON_PATH,
        );
    }
}
