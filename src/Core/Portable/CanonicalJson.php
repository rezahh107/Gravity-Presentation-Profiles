<?php

namespace GravityPresentationProfiles\Core\Portable;

final class CanonicalJson {
    public static function normalize( $value ) {
        if ( ! is_array( $value ) ) {
            return $value;
        }

        if ( self::isList( $value ) ) {
            $normalized = array();
            foreach ( $value as $item ) {
                $normalized[] = self::normalize( $item );
            }
            return $normalized;
        }

        $normalized = array();
        $keys       = array_keys( $value );
        sort( $keys, SORT_STRING );
        foreach ( $keys as $key ) {
            $normalized[ $key ] = self::normalize( $value[ $key ] );
        }
        return $normalized;
    }

    public static function encode( $value ) {
        $encoded = json_encode(
            self::normalize( $value ),
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION
        );
        if ( false === $encoded ) {
            throw new ContractViolation( 'Artifact cannot be encoded as canonical JSON.' );
        }
        return $encoded;
    }

    public static function hash( $value ) {
        return hash( 'sha256', self::encode( $value ) );
    }

    private static function isList( $value ) {
        $index = 0;
        foreach ( array_keys( $value ) as $key ) {
            if ( $key !== $index ) {
                return false;
            }
            $index++;
        }
        return true;
    }
}
