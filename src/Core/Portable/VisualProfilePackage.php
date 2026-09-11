<?php

namespace GravityPresentationProfiles\Core\Portable;

final class VisualProfilePackage {
    const ARTIFACT_TYPE  = 'gpp.visual_profile_package';
    const SCHEMA_VERSION = '1.0.0';

    private const SURFACES = array(
        'gravity_flow.inbox',
        'gravity_flow.entry_detail',
        'print.dossier',
    );

    private const ROOT_KEYS = array(
        'artifact_type',
        'schema_version',
        'package_id',
        'package_version',
        'provenance',
        'design_tokens',
        'semantic_slots',
        'surface_profiles',
        'reserved_extension_seam',
    );

    public static function validate( $artifact ) {
        self::requireArray( $artifact, 'Visual profile package must be an object.' );
        self::requireExactKeys( $artifact, self::ROOT_KEYS, 'visual package' );
        self::requireSame( self::ARTIFACT_TYPE, $artifact['artifact_type'], 'Unexpected visual artifact_type.' );
        self::requireSame( self::SCHEMA_VERSION, $artifact['schema_version'], 'Unsupported visual schema_version.' );
        self::requireIdentifier( $artifact['package_id'], 'package_id' );
        self::rejectEnvironmentIdentity( $artifact['package_id'], 'package_id' );
        self::requireVersion( $artifact['package_version'], 'package_version' );
        self::validateProvenance( $artifact['provenance'] );
        $token_refs = self::validateDesignTokens( $artifact['design_tokens'] );
        $slots      = self::validateSemanticSlots( $artifact['semantic_slots'] );
        self::validateSurfaceProfiles( $artifact['surface_profiles'], $slots, $token_refs );
        self::validateReservedExtensionSeam( $artifact['reserved_extension_seam'] );
        self::rejectDangerousStrings( $artifact, 'visual package' );
        return true;
    }

    public static function contentHash( $artifact ) {
        self::validate( $artifact );
        return CanonicalJson::hash( $artifact );
    }

    public static function canonicalJson( $artifact ) {
        self::validate( $artifact );
        return CanonicalJson::encode( $artifact );
    }

    public static function validationReport( $artifact ) {
        self::validate( $artifact );
        return array(
            'structural_status' => 'PACKAGE_VALID',
            'target_runtime_evidence' => 'NOT_PROVEN',
        );
    }

    public static function admittedSurfaces() {
        return self::SURFACES;
    }

    private static function validateProvenance( $provenance ) {
        self::requireArray( $provenance, 'provenance must be an object.' );
        self::requireExactKeys( $provenance, array( 'producer', 'evidence_refs' ), 'provenance' );
        self::requireSafeText( $provenance['producer'], 'provenance.producer' );
        self::requireStringList( $provenance['evidence_refs'], 'provenance.evidence_refs', true );
    }

    private static function validateDesignTokens( $tokens ) {
        self::requireArray( $tokens, 'design_tokens must be an object.' );
        $allowed = array( 'colors', 'spacing_px', 'radii_px', 'font_sizes_px', 'line_heights', 'font_weights' );
        foreach ( array_keys( $tokens ) as $key ) {
            if ( ! in_array( $key, $allowed, true ) ) {
                throw new ContractViolation( 'Unknown design token category: ' . $key );
            }
        }
        if ( array() === $tokens ) {
            throw new ContractViolation( 'design_tokens must not be empty.' );
        }
        $refs = array();
        foreach ( $tokens as $category => $values ) {
            self::requireArray( $values, 'design_tokens.' . $category . ' must be an object.' );
            foreach ( $values as $name => $value ) {
                self::requireTokenName( $name, 'design_tokens.' . $category );
                self::validateTokenValue( $category, $value, 'design_tokens.' . $category . '.' . $name );
                $refs[] = $category . '.' . $name;
            }
        }
        return $refs;
    }

    private static function validateTokenValue( $category, $value, $path ) {
        if ( 'colors' === $category ) {
            if ( ! is_string( $value ) || 1 !== preg_match( '/^#[0-9A-Fa-f]{6}$/', $value ) ) {
                throw new ContractViolation( $path . ' must be a six-digit hex color.' );
            }
            return;
        }
        if ( in_array( $category, array( 'spacing_px', 'radii_px', 'font_sizes_px' ), true ) ) {
            if ( ! is_int( $value ) || $value < 0 || $value > 512 ) {
                throw new ContractViolation( $path . ' must be an integer pixel token between 0 and 512.' );
            }
            return;
        }
        if ( 'line_heights' === $category ) {
            if ( ( ! is_int( $value ) && ! is_float( $value ) ) || $value < 1 || $value > 3 ) {
                throw new ContractViolation( $path . ' must be numeric between 1 and 3.' );
            }
            return;
        }
        if ( 'font_weights' === $category ) {
            if ( ! is_int( $value ) || $value < 100 || $value > 900 || 0 !== $value % 100 ) {
                throw new ContractViolation( $path . ' must be an integer font weight from 100 to 900.' );
            }
            return;
        }
        throw new ContractViolation( 'Unsupported token category: ' . $category );
    }

    private static function validateSemanticSlots( $slots ) {
        self::requireList( $slots, 'semantic_slots' );
        $known = array();
        foreach ( $slots as $index => $slot ) {
            $path = 'semantic_slots[' . $index . ']';
            self::requireArray( $slot, $path . ' must be an object.' );
            self::requireExactKeys( $slot, array( 'semantic_slot_key', 'meaning', 'surface_usage' ), $path );
            self::requireSlotKey( $slot['semantic_slot_key'], $path . '.semantic_slot_key' );
            self::requireSafeText( $slot['meaning'], $path . '.meaning' );
            if ( isset( $known[ $slot['semantic_slot_key'] ] ) ) {
                throw new ContractViolation( 'Duplicate semantic_slot_key: ' . $slot['semantic_slot_key'] );
            }
            self::requireList( $slot['surface_usage'], $path . '.surface_usage' );
            $used_surfaces = array();
            foreach ( $slot['surface_usage'] as $usage_index => $usage ) {
                $usage_path = $path . '.surface_usage[' . $usage_index . ']';
                self::requireArray( $usage, $usage_path . ' must be an object.' );
                self::requireExactKeys( $usage, array( 'surface', 'required' ), $usage_path );
                self::requireSurface( $usage['surface'], $usage_path . '.surface' );
                if ( ! is_bool( $usage['required'] ) ) {
                    throw new ContractViolation( $usage_path . '.required must be boolean.' );
                }
                if ( isset( $used_surfaces[ $usage['surface'] ] ) ) {
                    throw new ContractViolation( $path . ' repeats surface usage: ' . $usage['surface'] );
                }
                $used_surfaces[ $usage['surface'] ] = $usage['required'];
            }
            if ( array() === $used_surfaces ) {
                throw new ContractViolation( $path . '.surface_usage must not be empty.' );
            }
            $known[ $slot['semantic_slot_key'] ] = $used_surfaces;
        }
        if ( array() === $known ) {
            throw new ContractViolation( 'semantic_slots must not be empty.' );
        }
        return $known;
    }

    private static function validateSurfaceProfiles( $profiles, $slots, $token_refs ) {
        self::requireList( $profiles, 'surface_profiles' );
        $seen = array();
        foreach ( $profiles as $index => $profile ) {
            $path = 'surface_profiles[' . $index . ']';
            self::requireArray( $profile, $path . ' must be an object.' );
            self::requireExactKeys( $profile, array( 'surface', 'profile_id', 'token_refs', 'semantic_slots' ), $path );
            self::requireSurface( $profile['surface'], $path . '.surface' );
            self::requireIdentifier( $profile['profile_id'], $path . '.profile_id' );
            self::rejectEnvironmentIdentity( $profile['profile_id'], $path . '.profile_id' );
            if ( isset( $seen[ $profile['surface'] ] ) ) {
                throw new ContractViolation( 'Only one shared default profile is allowed for surface: ' . $profile['surface'] );
            }
            self::requireStringList( $profile['token_refs'], $path . '.token_refs', false );
            foreach ( $profile['token_refs'] as $ref ) {
                if ( ! in_array( $ref, $token_refs, true ) ) {
                    throw new ContractViolation( $path . ' references unknown design token: ' . $ref );
                }
            }
            self::requireStringList( $profile['semantic_slots'], $path . '.semantic_slots', false );
            $profile_slots = array();
            foreach ( $profile['semantic_slots'] as $slot_key ) {
                if ( ! isset( $slots[ $slot_key ] ) ) {
                    throw new ContractViolation( $path . ' references unknown semantic slot: ' . $slot_key );
                }
                if ( ! array_key_exists( $profile['surface'], $slots[ $slot_key ] ) ) {
                    throw new ContractViolation( $slot_key . ' is not declared for surface ' . $profile['surface'] . '.' );
                }
                if ( isset( $profile_slots[ $slot_key ] ) ) {
                    throw new ContractViolation( $path . ' repeats semantic slot: ' . $slot_key );
                }
                $profile_slots[ $slot_key ] = true;
            }
            foreach ( $slots as $slot_key => $usage ) {
                if ( isset( $usage[ $profile['surface'] ] ) && true === $usage[ $profile['surface'] ] && ! isset( $profile_slots[ $slot_key ] ) ) {
                    throw new ContractViolation( $path . ' omits required semantic slot: ' . $slot_key );
                }
            }
            $seen[ $profile['surface'] ] = true;
        }
        if ( count( $seen ) !== count( self::SURFACES ) ) {
            throw new ContractViolation( 'V1 requires exactly one shared default profile for each admitted surface.' );
        }
        foreach ( self::SURFACES as $surface ) {
            if ( ! isset( $seen[ $surface ] ) ) {
                throw new ContractViolation( 'Missing shared default profile for surface: ' . $surface );
            }
        }
    }

    private static function validateReservedExtensionSeam( $seam ) {
        self::requireArray( $seam, 'reserved_extension_seam must be an object.' );
        self::requireExactKeys( $seam, array( 'version', 'state' ), 'reserved_extension_seam' );
        self::requireVersion( $seam['version'], 'reserved_extension_seam.version' );
        self::requireSame( 'INERT', $seam['state'], 'reserved_extension_seam.state must be INERT in V1.' );
    }

    private static function requireExactKeys( $value, $expected, $path ) {
        $actual = array_keys( $value );
        sort( $actual, SORT_STRING );
        $expected_sorted = $expected;
        sort( $expected_sorted, SORT_STRING );
        if ( $actual !== $expected_sorted ) {
            throw new ContractViolation( $path . ' contains missing or unknown keys.' );
        }
    }

    private static function requireArray( $value, $message ) {
        if ( ! is_array( $value ) ) {
            throw new ContractViolation( $message );
        }
    }

    private static function requireList( $value, $path ) {
        self::requireArray( $value, $path . ' must be an array.' );
        $index = 0;
        foreach ( array_keys( $value ) as $key ) {
            if ( $key !== $index ) {
                throw new ContractViolation( $path . ' must be an ordered list.' );
            }
            $index++;
        }
    }

    private static function requireSame( $expected, $actual, $message ) {
        if ( $expected !== $actual ) {
            throw new ContractViolation( $message );
        }
    }

    private static function requireVersion( $value, $path ) {
        if ( ! is_string( $value ) || 1 !== preg_match( '/^[0-9]+\.[0-9]+\.[0-9]+$/', $value ) ) {
            throw new ContractViolation( $path . ' must be an explicit x.y.z version.' );
        }
    }

    private static function requireIdentifier( $value, $path ) {
        if ( ! is_string( $value ) || 1 !== preg_match( '/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/', $value ) ) {
            throw new ContractViolation( $path . ' must be a stable lowercase identifier.' );
        }
    }

    private static function requireSlotKey( $value, $path ) {
        if ( ! is_string( $value ) || 1 !== preg_match( '/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/', $value ) ) {
            throw new ContractViolation( $path . ' must be a stable dotted semantic slot key.' );
        }
    }

    private static function requireTokenName( $value, $path ) {
        if ( ! is_string( $value ) || 1 !== preg_match( '/^[a-z][a-z0-9_]*$/', $value ) ) {
            throw new ContractViolation( $path . ' contains an invalid token name.' );
        }
    }

    private static function requireSurface( $surface, $path ) {
        if ( ! is_string( $surface ) || ! in_array( $surface, self::SURFACES, true ) ) {
            throw new ContractViolation( $path . ' is not an admitted V1 surface.' );
        }
    }

    private static function requireSafeText( $value, $path ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            throw new ContractViolation( $path . ' must be non-empty text.' );
        }
        self::rejectDangerousString( $value, $path );
    }

    private static function requireStringList( $value, $path, $allow_empty ) {
        self::requireList( $value, $path );
        if ( ! $allow_empty && array() === $value ) {
            throw new ContractViolation( $path . ' must not be empty.' );
        }
        $seen = array();
        foreach ( $value as $item ) {
            if ( ! is_string( $item ) || '' === $item ) {
                throw new ContractViolation( $path . ' must contain non-empty strings only.' );
            }
            self::rejectDangerousString( $item, $path );
            if ( isset( $seen[ $item ] ) ) {
                throw new ContractViolation( $path . ' must not contain duplicates.' );
            }
            $seen[ $item ] = true;
        }
    }

    private static function rejectEnvironmentIdentity( $value, $path ) {
        if ( 1 === preg_match( '/(?:^|[._-])(form|field|step|page|route|user|role|binding)(?:[._-]|$)/i', $value ) ) {
            throw new ContractViolation( $path . ' must not encode environment identity.' );
        }
    }

    private static function rejectDangerousStrings( $value, $path ) {
        if ( is_array( $value ) ) {
            foreach ( $value as $key => $item ) {
                self::rejectDangerousStrings( $item, $path . '.' . $key );
            }
            return;
        }
        if ( is_string( $value ) ) {
            self::rejectDangerousString( $value, $path );
        }
    }

    private static function rejectDangerousString( $value, $path ) {
        $patterns = array(
            '/<\?(?:php|=)?/i',
            '/<\/?[a-z][^>]*>/i',
            '/\bjavascript\s*:/i',
            '/\bdata\s*:\s*text\//i',
            '/\bhttps?:\/\//i',
            '/\b(?:eval|exec|system|shell_exec|passthru)\s*\(/i',
            '/[{};]/',
        );
        foreach ( $patterns as $pattern ) {
            if ( 1 === preg_match( $pattern, $value ) ) {
                throw new ContractViolation( $path . ' contains executable, remote-code, HTML, or unrestricted CSS syntax.' );
            }
        }
    }
}
