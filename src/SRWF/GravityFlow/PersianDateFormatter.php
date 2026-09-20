<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Presentation\PersianGravityJalaliBridge;

/**
 * Bounded host-date presentation helpers for the SRWF Gravity surfaces.
 *
 * Calendar conversion is intentionally absent. Gregorian/system datetimes are
 * converted only by PersianGravity's optional public facade after the caller's
 * source contract has established the exact host UTC `Y-m-d H:i:s` semantics.
 * Numeric candidates remain native until their producing host seam is separately
 * qualified; a number is not promoted to an authoritative instant by shape alone.
 *
 * Any other value fails closed to native presentation. Persian digit mapping is
 * not calendar conversion and remains local presentation behavior.
 */
final class PersianDateFormatter {
    const DIAGNOSTIC_SURFACE = 'integration.persian_gravity';

    /**
     * Compatibility entry point for the current admitted GPP host-date callers.
     *
     * Only exact host UTC datetime strings are eligible for the provider. Numeric
     * candidates (currently the optional current-step Due path) remain native
     * because that host source contract is not yet independently qualified.
     * Parsing never depends on PHP's ambient/default timezone, Iran offsets,
     * visible display text, or year heuristics.
     */
    public static function formatDateTime( $value ) {
        if ( is_int( $value ) || ( is_string( $value ) && ctype_digit( $value ) ) ) {
            $timestamp = self::timestamp( $value );
            self::recordSourceFallback( 'source_semantics_not_qualified' );
            return null === $timestamp ? null : self::nativeUnixInstantFallback( $timestamp );
        }

        $native = self::nativeUtcDateTimeFallback( $value );
        $source = self::strictUtcDateTime( $value );
        if ( null === $source ) {
            self::recordSourceFallback( 'source_semantics_not_qualified' );
            return $native;
        }

        $result = PersianGravityJalaliBridge::formatDateTime( $source );
        return null !== $result['value'] ? $result['value'] : $native;
    }

    /**
     * Timeline companion: return only a provider presentation. `null` means the
     * caller must preserve the already-rendered native Timeline date node.
     */
    public static function tryFormatUtcDateTime( $value ) {
        $source = self::strictUtcDateTime( $value );
        if ( null === $source ) {
            self::recordSourceFallback( 'source_semantics_not_qualified' );
            return null;
        }

        $result = PersianGravityJalaliBridge::formatDateTime( $source );
        return null !== $result['value'] ? $result['value'] : null;
    }

    public static function persianDigits( $value ) {
        return strtr(
            (string) $value,
            array(
                '0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴',
                '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹',
            )
        );
    }

    /**
     * Numeric host value helper. This validates numeric shape only; it does not
     * qualify the producing host seam for Gregorian→Jalali conversion.
     */
    public static function timestamp( $value ) {
        if ( is_int( $value ) || ( is_string( $value ) && ctype_digit( $value ) ) ) {
            $timestamp = (int) $value;
            return $timestamp > 0 ? $timestamp : null;
        }
        return null;
    }

    private static function strictUtcDateTime( $value ) {
        if ( ! is_string( $value ) || 1 !== preg_match( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D', $value ) ) {
            return null;
        }

        try {
            $utc = new \DateTimeZone( 'UTC' );
            $source = \DateTimeImmutable::createFromFormat( '!Y-m-d H:i:s', $value, $utc );
        } catch ( \Throwable $exception ) {
            return null;
        }

        if ( false === $source ) {
            return null;
        }

        $errors = \DateTimeImmutable::getLastErrors();
        if ( is_array( $errors ) && ( ! empty( $errors['warning_count'] ) || ! empty( $errors['error_count'] ) ) ) {
            return null;
        }

        return $source->format( 'Y-m-d H:i:s' ) === $value ? $source : null;
    }

    private static function nativeUtcDateTimeFallback( $value ) {
        if ( ! is_scalar( $value ) ) {
            return null;
        }
        $raw = trim( (string) $value );
        if ( '' === $raw ) {
            return null;
        }

        // Gravity Forms owns native date_created presentation. This preserves
        // its site-timezone/date-format behavior when its formatter is present.
        if ( class_exists( 'GFCommon' ) && method_exists( 'GFCommon', 'format_date' ) ) {
            try {
                $native = \GFCommon::format_date( $raw, false );
                if ( is_scalar( $native ) && '' !== trim( (string) $native ) ) {
                    return trim( (string) $native );
                }
            } catch ( \Throwable $exception ) {
                // Fall through to the authoritative raw host value.
            }
        }

        return $raw;
    }

    private static function nativeUnixInstantFallback( $timestamp ) {
        if ( function_exists( 'wp_date' ) ) {
            try {
                $format = function_exists( 'get_option' )
                    ? trim( (string) get_option( 'date_format', 'Y-m-d' ) . ' ' . (string) get_option( 'time_format', 'H:i' ) )
                    : 'Y-m-d H:i';
                $native = wp_date( '' === $format ? 'Y-m-d H:i' : $format, $timestamp );
                if ( is_string( $native ) && '' !== trim( $native ) ) {
                    return trim( $native );
                }
            } catch ( \Throwable $exception ) {
                // Keep the fallback bounded and side-effect free.
            }
        }

        return gmdate( 'Y-m-d H:i', $timestamp );
    }

    private static function recordSourceFallback( $reason ) {
        RuntimeDiagnostics::recordOnce(
            self::DIAGNOSTIC_SURFACE,
            'JALALI_PRESENTATION',
            RuntimeDecisionTrace::RESULT_SKIP,
            $reason,
            'native_date_presentation'
        );
    }
}
