<?php

namespace GravityPresentationProfiles\Core\Portable;

final class VisualProfilePackageV11 {
    const SCHEMA_VERSION = '1.1.0';

    private const SURFACES = array(
        'gravity_forms.form',
        'gravity_flow.entry_detail',
        'gravity_flow.inbox',
        'print.dossier',
    );

    private const ROOT_KEYS = array(
        'artifact_type',
        'schema_version',
        'package_id',
        'package_version',
        'provenance',
        'selected_surfaces',
        'design_tokens',
        'semantic_slots',
        'surface_profiles',
        'reserved_extension_seam',
    );

    private const TOKEN_CATEGORIES = array(
        'colors',
        'spacing_px',
        'radii_px',
        'sizes_px',
        'font_sizes_px',
        'line_heights',
        'font_weights',
        'font_families',
    );

    private const CAPABILITIES = array(
        'gravity_forms.orbital_control_metric_projection',
        'persian_gravity.jalali_validation_message_after_control',
    );

    public static function validate( $artifact ) {
        self::requireArray( $artifact, 'Visual profile package must be an object.' );
        self::requireExactKeys( $artifact, self::ROOT_KEYS, 'visual package 1.1' );
        self::requireSame( VisualProfilePackage::ARTIFACT_TYPE, $artifact['artifact_type'], 'Unexpected visual artifact_type.' );
        self::requireSame( self::SCHEMA_VERSION, $artifact['schema_version'], 'Unsupported visual schema_version.' );
        self::requireIdentifier( $artifact['package_id'], 'package_id' );
        self::rejectEnvironmentIdentity( $artifact['package_id'], 'package_id' );
        self::requireVersion( $artifact['package_version'], 'package_version' );
        self::validateProvenance( $artifact['provenance'] );

        $selected_surfaces = self::validateSelectedSurfaces( $artifact['selected_surfaces'] );
        $token_refs        = self::validateDesignTokens( $artifact['design_tokens'] );
        $slots             = self::validateSemanticSlots( $artifact['semantic_slots'], $selected_surfaces );

        self::validateSurfaceProfiles(
            $artifact['surface_profiles'],
            $selected_surfaces,
            $slots,
            $token_refs
        );
        self::validateReservedExtensionSeam( $artifact['reserved_extension_seam'] );
        self::rejectDangerousStrings( $artifact, 'visual package 1.1' );

        return true;
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

    private static function validateSelectedSurfaces( $surfaces ) {
        self::requireList( $surfaces, 'selected_surfaces' );
        if ( array() === $surfaces ) {
            throw new ContractViolation( 'selected_surfaces must not be empty.' );
        }

        $positions = array_flip( self::SURFACES );
        $seen      = array();
        $last      = -1;

        foreach ( $surfaces as $surface ) {
            self::requireSurface( $surface, 'selected_surfaces' );
            if ( isset( $seen[ $surface ] ) ) {
                throw new ContractViolation( 'selected_surfaces must not contain duplicates.' );
            }
            $position = $positions[ $surface ];
            if ( $position <= $last ) {
                throw new ContractViolation( 'selected_surfaces must follow canonical admitted-surface order.' );
            }
            $last             = $position;
            $seen[ $surface ] = true;
        }

        return array_keys( $seen );
    }

    private static function validateDesignTokens( $tokens ) {
        self::requireArray( $tokens, 'design_tokens must be an object.' );
        if ( array() === $tokens ) {
            throw new ContractViolation( 'design_tokens must not be empty.' );
        }

        $refs = array();
        foreach ( $tokens as $category => $values ) {
            if ( ! in_array( $category, self::TOKEN_CATEGORIES, true ) ) {
                throw new ContractViolation( 'Unknown design token category: ' . $category );
            }
            self::requireArray( $values, 'design_tokens.' . $category . ' must be an object.' );
            if ( array() === $values ) {
                throw new ContractViolation( 'design_tokens.' . $category . ' must not be empty.' );
            }
            foreach ( $values as $name => $value ) {
                self::requireTokenName( $name, 'design_tokens.' . $category );
                self::validateTokenValue( $category, $value, 'design_tokens.' . $category . '.' . $name );
                $refs[ $category . '.' . $name ] = $category;
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

        if ( 'sizes_px' === $category ) {
            if ( ! is_int( $value ) || $value < 0 || $value > 4096 ) {
                throw new ContractViolation( $path . ' must be an integer size token between 0 and 4096 pixels.' );
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

        if ( 'font_families' === $category ) {
            if ( ! is_string( $value ) || '' === trim( $value ) || strlen( $value ) > 96
                || 1 !== preg_match( '/^[\p{L}\p{N} ._-]+$/u', $value ) ) {
                throw new ContractViolation( $path . ' must be one safe font-family name.' );
            }
            self::rejectDangerousString( $value, $path );
            return;
        }

        throw new ContractViolation( 'Unsupported token category: ' . $category );
    }

    private static function validateSemanticSlots( $slots, $selected_surfaces ) {
        self::requireList( $slots, 'semantic_slots' );
        $selected = array_fill_keys( $selected_surfaces, true );
        $known    = array();

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
            if ( array() === $slot['surface_usage'] ) {
                throw new ContractViolation( $path . '.surface_usage must not be empty.' );
            }

            $used_surfaces = array();
            foreach ( $slot['surface_usage'] as $usage_index => $usage ) {
                $usage_path = $path . '.surface_usage[' . $usage_index . ']';
                self::requireArray( $usage, $usage_path . ' must be an object.' );
                self::requireExactKeys( $usage, array( 'surface', 'required' ), $usage_path );
                self::requireSurface( $usage['surface'], $usage_path . '.surface' );
                if ( ! isset( $selected[ $usage['surface'] ] ) ) {
                    throw new ContractViolation( $usage_path . '.surface must be selected by the package.' );
                }
                if ( ! is_bool( $usage['required'] ) ) {
                    throw new ContractViolation( $usage_path . '.required must be boolean.' );
                }
                if ( isset( $used_surfaces[ $usage['surface'] ] ) ) {
                    throw new ContractViolation( $path . ' repeats surface usage: ' . $usage['surface'] );
                }
                $used_surfaces[ $usage['surface'] ] = $usage['required'];
            }

            $known[ $slot['semantic_slot_key'] ] = $used_surfaces;
        }

        return $known;
    }

    private static function validateSurfaceProfiles( $profiles, $selected_surfaces, $slots, $token_refs ) {
        self::requireList( $profiles, 'surface_profiles' );
        if ( count( $profiles ) !== count( $selected_surfaces ) ) {
            throw new ContractViolation( 'Schema 1.1 requires exactly one shared default profile for each selected surface.' );
        }

        $seen = array();
        foreach ( $profiles as $index => $profile ) {
            $path = 'surface_profiles[' . $index . ']';
            self::requireArray( $profile, $path . ' must be an object.' );
            self::requireExactKeys(
                $profile,
                array( 'surface', 'profile_id', 'token_refs', 'semantic_slots', 'presentation' ),
                $path
            );
            self::requireSurface( $profile['surface'], $path . '.surface' );
            if ( $profile['surface'] !== $selected_surfaces[ $index ] ) {
                throw new ContractViolation( $path . '.surface must match selected_surfaces canonical order.' );
            }
            self::requireIdentifier( $profile['profile_id'], $path . '.profile_id' );
            self::rejectEnvironmentIdentity( $profile['profile_id'], $path . '.profile_id' );
            if ( isset( $seen[ $profile['surface'] ] ) ) {
                throw new ContractViolation( 'Only one shared default profile is allowed for surface: ' . $profile['surface'] );
            }

            self::requireStringList( $profile['token_refs'], $path . '.token_refs', false );
            $profile_token_refs = array();
            foreach ( $profile['token_refs'] as $ref ) {
                if ( ! isset( $token_refs[ $ref ] ) ) {
                    throw new ContractViolation( $path . ' references unknown design token: ' . $ref );
                }
                $profile_token_refs[ $ref ] = $token_refs[ $ref ];
            }

            self::requireStringList( $profile['semantic_slots'], $path . '.semantic_slots', true );
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
                if ( isset( $usage[ $profile['surface'] ] ) && true === $usage[ $profile['surface'] ]
                    && ! isset( $profile_slots[ $slot_key ] ) ) {
                    throw new ContractViolation( $path . ' omits required semantic slot: ' . $slot_key );
                }
            }

            self::validatePresentation(
                $profile['presentation'],
                $profile['surface'],
                $token_refs,
                $profile_token_refs,
                $path . '.presentation'
            );
            $seen[ $profile['surface'] ] = true;
        }
    }

    private static function validatePresentation( $presentation, $surface, $token_refs, $profile_token_refs, $path ) {
        self::requireArray( $presentation, $path . ' must be an object.' );
        if ( array() === $presentation ) {
            throw new ContractViolation( $path . ' must contain at least one controlled presentation preference.' );
        }

        $allowed = array(
            'composition',
            'typography',
            'controls',
            'labels',
            'descriptions',
            'sections',
            'primary_action',
            'validation',
            'capabilities',
        );
        self::requireAllowedKeys( $presentation, $allowed, $path );

        if ( isset( $presentation['composition'] ) ) {
            self::validatePreferenceBlock(
                $presentation['composition'],
                array(
                    'direction' => array( 'enum', array( 'inherit', 'ltr', 'rtl' ) ),
                    'max_inline_size' => array( 'token', 'sizes_px' ),
                    'inline_padding' => array( 'token', 'spacing_px' ),
                    'surface_background' => array( 'token', 'colors' ),
                    'surface_radius' => array( 'token', 'radii_px' ),
                    'field_layout' => array( 'enum', array( 'host_default', 'single_column' ) ),
                ),
                $token_refs,
                $profile_token_refs,
                $path . '.composition'
            );
        }

        if ( isset( $presentation['typography'] ) ) {
            self::validatePreferenceBlock(
                $presentation['typography'],
                array( 'font_family' => array( 'token', 'font_families' ) ),
                $token_refs,
                $profile_token_refs,
                $path . '.typography'
            );
        }

        if ( isset( $presentation['controls'] ) ) {
            self::validatePreferenceBlock(
                $presentation['controls'],
                array(
                    'background' => array( 'token', 'colors' ),
                    'text' => array( 'token', 'colors' ),
                    'border' => array( 'token', 'colors' ),
                    'focus_border' => array( 'token', 'colors' ),
                    'error_border' => array( 'token', 'colors' ),
                    'radius' => array( 'token', 'radii_px' ),
                    'min_height' => array( 'token', 'sizes_px' ),
                    'font_size' => array( 'token', 'font_sizes_px' ),
                    'font_weight' => array( 'token', 'font_weights' ),
                ),
                $token_refs,
                $profile_token_refs,
                $path . '.controls'
            );
        }

        if ( isset( $presentation['labels'] ) ) {
            self::validatePreferenceBlock(
                $presentation['labels'],
                array(
                    'text' => array( 'token', 'colors' ),
                    'required_color' => array( 'token', 'colors' ),
                    'font_size' => array( 'token', 'font_sizes_px' ),
                    'font_weight' => array( 'token', 'font_weights' ),
                ),
                $token_refs,
                $profile_token_refs,
                $path . '.labels'
            );
        }

        if ( isset( $presentation['descriptions'] ) ) {
            self::validatePreferenceBlock(
                $presentation['descriptions'],
                array( 'text' => array( 'token', 'colors' ) ),
                $token_refs,
                $profile_token_refs,
                $path . '.descriptions'
            );
        }

        if ( isset( $presentation['sections'] ) ) {
            self::validatePreferenceBlock(
                $presentation['sections'],
                array(
                    'divider' => array( 'token', 'colors' ),
                    'heading_text' => array( 'token', 'colors' ),
                    'heading_font_size' => array( 'token', 'font_sizes_px' ),
                    'heading_font_weight' => array( 'token', 'font_weights' ),
                    'description_text' => array( 'token', 'colors' ),
                ),
                $token_refs,
                $profile_token_refs,
                $path . '.sections'
            );
        }

        if ( isset( $presentation['primary_action'] ) ) {
            self::validatePreferenceBlock(
                $presentation['primary_action'],
                array(
                    'background' => array( 'token', 'colors' ),
                    'pressed_background' => array( 'token', 'colors' ),
                    'focus_border' => array( 'token', 'colors' ),
                    'min_height' => array( 'token', 'sizes_px' ),
                    'font_size' => array( 'token', 'font_sizes_px' ),
                    'font_weight' => array( 'token', 'font_weights' ),
                ),
                $token_refs,
                $profile_token_refs,
                $path . '.primary_action'
            );
        }

        if ( isset( $presentation['validation'] ) ) {
            self::validatePreferenceBlock(
                $presentation['validation'],
                array( 'error_color' => array( 'token', 'colors' ) ),
                $token_refs,
                $profile_token_refs,
                $path . '.validation'
            );
        }

        if ( isset( $presentation['capabilities'] ) ) {
            self::validateCapabilities( $presentation['capabilities'], $surface, $path . '.capabilities' );
        }
    }

    private static function validatePreferenceBlock( $block, $rules, $token_refs, $profile_token_refs, $path ) {
        self::requireArray( $block, $path . ' must be an object.' );
        if ( array() === $block ) {
            throw new ContractViolation( $path . ' must not be empty.' );
        }
        self::requireAllowedKeys( $block, array_keys( $rules ), $path );

        foreach ( $block as $key => $value ) {
            $rule = $rules[ $key ];
            if ( 'enum' === $rule[0] ) {
                if ( ! is_string( $value ) || ! in_array( $value, $rule[1], true ) ) {
                    throw new ContractViolation( $path . '.' . $key . ' is not an admitted controlled value.' );
                }
                continue;
            }

            self::requireTokenReference(
                $value,
                $rule[1],
                $token_refs,
                $profile_token_refs,
                $path . '.' . $key
            );
        }
    }

    private static function requireTokenReference( $ref, $category, $token_refs, $profile_token_refs, $path ) {
        if ( ! is_string( $ref ) || ! isset( $token_refs[ $ref ] ) ) {
            throw new ContractViolation( $path . ' must reference a declared design token.' );
        }
        if ( $token_refs[ $ref ] !== $category ) {
            throw new ContractViolation( $path . ' must reference design_tokens.' . $category . '.' );
        }
        if ( ! isset( $profile_token_refs[ $ref ] ) ) {
            throw new ContractViolation( $path . ' token must also be declared by surface_profiles.token_refs.' );
        }
    }

    private static function validateCapabilities( $capabilities, $surface, $path ) {
        self::requireList( $capabilities, $path );
        $positions = array_flip( self::CAPABILITIES );
        $seen      = array();
        $last      = -1;

        foreach ( $capabilities as $capability ) {
            if ( ! is_string( $capability ) || ! isset( $positions[ $capability ] ) ) {
                throw new ContractViolation( $path . ' contains an unsupported presentation capability.' );
            }
            if ( isset( $seen[ $capability ] ) ) {
                throw new ContractViolation( $path . ' must not contain duplicate capabilities.' );
            }
            if ( 'gravity_forms.form' !== $surface ) {
                throw new ContractViolation( $path . ' capabilities are admitted only for gravity_forms.form.' );
            }
            $position = $positions[ $capability ];
            if ( $position <= $last ) {
                throw new ContractViolation( $path . ' must follow canonical capability order.' );
            }
            $last                = $position;
            $seen[ $capability ] = true;
        }
    }

    private static function validateReservedExtensionSeam( $seam ) {
        self::requireArray( $seam, 'reserved_extension_seam must be an object.' );
        self::requireExactKeys( $seam, array( 'version', 'state' ), 'reserved_extension_seam' );
        self::requireSame(
            VisualProfilePackage::RESERVED_EXTENSION_SEAM_VERSION,
            $seam['version'],
            'reserved_extension_seam.version is not admitted.'
        );
        self::requireSame(
            VisualProfilePackage::RESERVED_EXTENSION_SEAM_STATE,
            $seam['state'],
            'reserved_extension_seam.state must remain INERT.'
        );
    }

    private static function requireAllowedKeys( $value, $allowed, $path ) {
        foreach ( array_keys( $value ) as $key ) {
            if ( ! in_array( $key, $allowed, true ) ) {
                throw new ContractViolation( $path . ' contains an unknown key: ' . $key );
            }
        }
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
            throw new ContractViolation( $path . ' contains a surface not admitted by schema 1.1.' );
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
