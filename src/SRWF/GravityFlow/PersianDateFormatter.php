<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

final class PersianDateFormatter {
    public static function formatDateTime( $value ) {
        $parts = self::dateParts( $value );
        if ( null === $parts ) {
            return null;
        }

        $jalali = self::gregorianToJalali( $parts['year'], $parts['month'], $parts['day'] );
        $text = sprintf(
            '%04d/%02d/%02d، %02d:%02d',
            $jalali[0],
            $jalali[1],
            $jalali[2],
            $parts['hour'],
            $parts['minute']
        );

        return self::persianDigits( $text );
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

    public static function timestamp( $value ) {
        if ( is_int( $value ) || ( is_string( $value ) && ctype_digit( $value ) ) ) {
            $timestamp = (int) $value;
            return $timestamp > 0 ? $timestamp : null;
        }

        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return null;
        }

        $timestamp = strtotime( $value );
        return false === $timestamp ? null : $timestamp;
    }

    private static function dateParts( $value ) {
        $timestamp = self::timestamp( $value );
        if ( null === $timestamp ) {
            return null;
        }

        return array(
            'year' => (int) gmdate( 'Y', $timestamp ),
            'month' => (int) gmdate( 'n', $timestamp ),
            'day' => (int) gmdate( 'j', $timestamp ),
            'hour' => (int) gmdate( 'G', $timestamp ),
            'minute' => (int) gmdate( 'i', $timestamp ),
        );
    }

    private static function gregorianToJalali( $gy, $gm, $gd ) {
        $g_days_in_month = array( 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 );

        if ( $gy > 1600 ) {
            $jy = 979;
            $gy -= 1600;
        } else {
            $jy = 0;
            $gy -= 621;
        }

        $gy2 = $gm > 2 ? $gy + 1 : $gy;
        $days = ( 365 * $gy )
            + (int) floor( ( $gy2 + 3 ) / 4 )
            - (int) floor( ( $gy2 + 99 ) / 100 )
            + (int) floor( ( $gy2 + 399 ) / 400 )
            - 80
            + $gd
            + $g_days_in_month[ $gm - 1 ];

        $jy += 33 * (int) floor( $days / 12053 );
        $days %= 12053;
        $jy += 4 * (int) floor( $days / 1461 );
        $days %= 1461;

        if ( $days > 365 ) {
            $jy += (int) floor( ( $days - 1 ) / 365 );
            $days = ( $days - 1 ) % 365;
        }

        if ( $days < 186 ) {
            $jm = 1 + (int) floor( $days / 31 );
            $jd = 1 + ( $days % 31 );
        } else {
            $jm = 7 + (int) floor( ( $days - 186 ) / 30 );
            $jd = 1 + ( ( $days - 186 ) % 30 );
        }

        return array( $jy, $jm, $jd );
    }
}
