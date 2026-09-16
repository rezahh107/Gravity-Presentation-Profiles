<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Required Print asset inventory and integrity check.
 *
 * Asset failure is reported as its own distinguishable condition. A missing or
 * modified image must never surface as a binding, profile or mapping problem,
 * because the operator remedy is completely different.
 */
final class PrintDossierAssets {
    const STATUS_OK = 'ok';
    const STATUS_MISSING = 'missing';
    const STATUS_UNREADABLE = 'unreadable';
    const STATUS_CHECKSUM_MISMATCH = 'checksum_mismatch';

    const REASON_MISSING = 'required_asset_missing';
    const REASON_MODIFIED = 'required_asset_modified';
    const REASON_UNAVAILABLE = 'required_asset_unavailable';

    private const RAZAVI_PATH = 'assets/images/print/razavi-complex-approved.png';
    private const KANOON_PATH = 'assets/images/print/kanoon-approved.png';
    private const RAZAVI_SHA256 = '0aa32595b57609d292b82ea50468bfc9799a431501e7847b5b2ca2367b59c38b';
    private const KANOON_SHA256 = '21b5c90fc1dae292c80987b7737c88c4fb3904ce8e97bd09ca305d2211a8a159';

    public static function required() {
        return array(
            'razavi' => array( 'path' => self::RAZAVI_PATH, 'sha256' => self::RAZAVI_SHA256 ),
            'kanoon' => array( 'path' => self::KANOON_PATH, 'sha256' => self::KANOON_SHA256 ),
        );
    }

    /**
     * Per-asset integrity facts plus one overall reason code.
     *
     * The reason distinguishes an absent file from a file whose bytes no longer
     * match the expected release identity, so a build/packaging fault and a
     * tampered or partially deployed install are not reported the same way.
     */
    public static function integrity() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return array(
                'ready' => false,
                'reason' => self::REASON_UNAVAILABLE,
                'assets' => array(),
            );
        }

        $base   = dirname( GPP_PLUGIN_FILE ) . '/';
        $assets = array();
        $any_missing = false;
        $any_modified = false;

        foreach ( self::required() as $name => $definition ) {
            $absolute = $base . $definition['path'];

            if ( ! file_exists( $absolute ) ) {
                $status = self::STATUS_MISSING;
                $any_missing = true;
            } elseif ( ! is_readable( $absolute ) ) {
                $status = self::STATUS_UNREADABLE;
                $any_missing = true;
            } else {
                $actual = hash_file( 'sha256', $absolute );
                if ( $definition['sha256'] === $actual ) {
                    $status = self::STATUS_OK;
                } else {
                    $status = self::STATUS_CHECKSUM_MISMATCH;
                    $any_modified = true;
                }
            }

            $assets[ $name ] = array(
                'path' => $definition['path'],
                'expected_sha256' => $definition['sha256'],
                'status' => $status,
            );
        }

        if ( $any_missing ) {
            $reason = self::REASON_MISSING;
        } elseif ( $any_modified ) {
            $reason = self::REASON_MODIFIED;
        } else {
            $reason = null;
        }

        return array(
            'ready' => null === $reason,
            'reason' => $reason,
            'assets' => $assets,
        );
    }

    public static function isReady() {
        $report = self::integrity();

        return $report['ready'];
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
