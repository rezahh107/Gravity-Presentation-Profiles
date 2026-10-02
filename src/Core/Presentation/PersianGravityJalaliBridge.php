<?php

namespace GravityPresentationProfiles\Core\Presentation;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;

/**
 * Optional consumer boundary for PersianGravity's public Jalali presentation facade.
 *
 * This class deliberately knows nothing about Gravity Forms / Gravity Flow source
 * semantics. Callers must supply an already-qualified DateTimeInterface. No provider
 * files are loaded by GPP and no PersianGravity converter internals are referenced.
 */
final class PersianGravityJalaliBridge {
    const DIAGNOSTIC_SURFACE = 'integration.persian_gravity';

    const STATUS_APPLIED = 'applied';
    const STATUS_PROVIDER_UNAVAILABLE = 'provider_unavailable';
    const STATUS_CAPABILITY_UNAVAILABLE = 'provider_capability_unavailable';
    const STATUS_PROVIDER_NATIVE_FALLBACK = 'provider_native_fallback';
    const STATUS_PROVIDER_FAILURE = 'provider_failure';

    /**
     * @return array{value:?string,status:string}
     */
    public static function formatDateTime( \DateTimeInterface $source ) {
        /*
         * PGR_VERSION is diagnostic context only. Runtime admission is the public
         * facade/callable contract GPP actually consumes; a version mismatch or an
         * absent version constant must not reject an otherwise compatible facade.
         */
        if ( ! class_exists( '\\PGR_Jalali_Presentation', false ) ) {
            return self::fallback(
                defined( 'PGR_VERSION' )
                    ? self::STATUS_CAPABILITY_UNAVAILABLE
                    : self::STATUS_PROVIDER_UNAVAILABLE
            );
        }

        if ( ! is_callable( array( '\\PGR_Jalali_Presentation', 'format_datetime' ) ) ) {
            return self::fallback( self::STATUS_CAPABILITY_UNAVAILABLE );
        }

        try {
            $value = \PGR_Jalali_Presentation::format_datetime( $source );
        } catch ( \Throwable $exception ) {
            // Optional presentation must never turn provider failure into a GPP
            // runtime failure. Do not record exception text: no source value is
            // needed to diagnose this bounded integration state.
            return self::fallback( self::STATUS_PROVIDER_FAILURE );
        }

        if ( null === $value ) {
            return self::fallback( self::STATUS_PROVIDER_NATIVE_FALLBACK );
        }
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return self::fallback( self::STATUS_PROVIDER_NATIVE_FALLBACK );
        }

        RuntimeDiagnostics::recordOnce(
            self::DIAGNOSTIC_SURFACE,
            'JALALI_PRESENTATION',
            RuntimeDecisionTrace::RESULT_PASS,
            self::STATUS_APPLIED
        );

        return array(
            'value' => $value,
            'status' => self::STATUS_APPLIED,
        );
    }

    private static function fallback( $status ) {
        RuntimeDiagnostics::recordOnce(
            self::DIAGNOSTIC_SURFACE,
            'JALALI_PRESENTATION',
            RuntimeDecisionTrace::RESULT_SKIP,
            $status,
            'native_date_presentation'
        );

        return array(
            'value' => null,
            'status' => $status,
        );
    }
}
