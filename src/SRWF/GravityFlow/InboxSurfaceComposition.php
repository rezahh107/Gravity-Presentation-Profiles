<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Bounded server-rendered composition wrapper for the admitted SRWF Inbox.
 *
 * Gravity Flow remains the sole owner of the Inbox DOM/state inside this shell.
 * The wrapper exists only after both the active visual profile and authentic
 * native Inbox markers are present, so unrelated pages and inactive profiles
 * remain untouched.
 */
final class InboxSurfaceComposition {
    const SURFACE = 'gravity_flow.inbox';
    const PROFILE_ID = 'srwf.operations.inbox.v1';

    private static $instance = 0;

    public static function wrap( $html ) {
        if ( ! is_string( $html ) || '' === $html ) {
            return $html;
        }

        if ( false !== strpos( $html, 'data-gpp-inbox-surface=' ) ) {
            return $html;
        }

        // Do not infer the surface from visible text. These are the exact native
        // Gravity Flow Inbox markers already proven by WU17/WU21 runtime evidence.
        if ( false === strpos( $html, 'gflow-inbox' ) || false === strpos( $html, 'data-js="gflow-inbox"' ) ) {
            return $html;
        }

        $profile_id = self::activeProfileId();
        if ( self::PROFILE_ID !== $profile_id ) {
            return $html;
        }

        self::$instance++;
        $title_id = 'gpp-inbox-title-' . self::$instance;

        $out  = '<section class="gpp-inbox-surface" data-gpp-inbox-surface="ready" data-gpp-profile-id="' . esc_attr( $profile_id ) . '" dir="rtl" aria-labelledby="' . esc_attr( $title_id ) . '">';
        $out .= '<div class="gpp-inbox-surface__content">';
        $out .= '<header class="gpp-inbox-surface__header">';
        $out .= '<h1 class="gpp-inbox-surface__title" id="' . esc_attr( $title_id ) . '">' . esc_html__( 'کارهای من', 'gravity-presentation-profiles' ) . '</h1>';
        $out .= '<p class="gpp-inbox-surface__helper">' . esc_html__( 'پرونده‌هایی که اکنون نیاز به اقدام شما دارند در این صفحه نمایش داده می‌شوند. برای شروع، یکی از پرونده‌های زیر را باز کنید.', 'gravity-presentation-profiles' ) . '</p>';
        $out .= '</header>';
        $out .= $html;
        $out .= '</div>';
        $out .= '</section>';

        return $out;
    }

    private static function activeProfileId() {
        if ( ! class_exists( VisualPackageLifecycle::class ) || ! class_exists( WordPressOptionStateStore::class ) ) {
            return null;
        }

        try {
            $visual = new VisualPackageLifecycle(
                new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
            );
            $activation = $visual->resolve( self::SURFACE );
            $profile = $visual->effectiveProfile( self::SURFACE );

            if ( ! is_array( $activation ) || ! is_array( $profile ) ) {
                return null;
            }
            if ( empty( $activation['profile_id'] ) || empty( $profile['profile_id'] ) || empty( $profile['surface'] ) ) {
                return null;
            }
            if ( self::SURFACE !== $profile['surface'] || $activation['profile_id'] !== $profile['profile_id'] ) {
                return null;
            }

            return (string) $profile['profile_id'];
        } catch ( \Throwable $exception ) {
            // Presentation shell fails closed; native Gravity Flow HTML remains.
            unset( $exception );
            return null;
        }
    }
}
