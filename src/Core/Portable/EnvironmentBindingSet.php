<?php

namespace GravityPresentationProfiles\Core\Portable;

final class EnvironmentBindingSet {
    const ARTIFACT_TYPE  = 'gpp.environment_binding_set';
    const SCHEMA_VERSION = '1.0.0';

    /**
     * Additive schema. `1.0.0` keeps its exact frozen meaning; `1.1.0` adds only
     * the optional `print_option_map` on a `print_mapping` runtime claim, so an
     * environment can declare what its own Gravity Forms raw choice values mean
     * for the canonical Print option vocabulary instead of a presentation
     * adapter silently defining that for every installation.
     */
    const SCHEMA_VERSION_1_1 = '1.1.0';

    private const SCHEMA_VERSIONS = array( '1.0.0', '1.1.0' );

    private const CANONICAL_OPTION_PATTERN = '/^[a-z][a-z0-9_]*$/';
    private const HOST_RAW_VALUE_MAX_LENGTH = 255;

    private const BINDING_STATES = array(
        'PROVEN',
        'UNBOUND',
        'NOT_PROVEN',
        'NOT_APPLICABLE',
    );

    private const SURFACES = array(
        'gravity_flow.inbox',
        'gravity_flow.entry_detail',
        'print.dossier',
    );

    private const RUNTIME_CLAIMS = array(
        'host_seam',
        'availability',
        'editability',
        'authorization',
        'action_permission',
        'print_mapping',
    );

    private const EVIDENCE_STATES = array(
        'PROVEN',
        'NOT_PROVEN',
        'NOT_APPLICABLE',
    );

    public static function validate( $artifact ) {
        self::requireArray( $artifact, 'Environment binding set must be an object.' );
        self::requireExactKeys(
            $artifact,
            array(
                'artifact_type',
                'schema_version',
                'binding_set_id',
                'binding_set_version',
                'context',
                'provenance',
                'bindings',
                'runtime_claims',
            ),
            'binding set'
        );

        self::requireSame( self::ARTIFACT_TYPE, $artifact['artifact_type'], 'Unexpected binding artifact_type.' );

        if ( ! is_string( $artifact['schema_version'] ) || ! in_array( $artifact['schema_version'], self::SCHEMA_VERSIONS, true ) ) {
            throw new ContractViolation( 'Unsupported binding schema_version.' );
        }

        self::requireIdentifier( $artifact['binding_set_id'], 'binding_set_id' );
        self::requireVersion( $artifact['binding_set_version'], 'binding_set_version' );
        self::validateContext( $artifact['context'] );
        self::validateProvenance( $artifact['provenance'] );
        $binding_slots = self::validateBindings( $artifact['bindings'] );
        self::validateRuntimeClaims( $artifact['runtime_claims'], $binding_slots, $artifact['schema_version'] );
        self::rejectDangerousStructure( $artifact, 'binding set' );

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

        $proven_bindings = array();
        foreach ( $artifact['bindings'] as $binding ) {
            if ( 'PROVEN' === $binding['state'] ) {
                $proven_bindings[] = $binding['semantic_slot_key'];
            }
        }

        $proven_claims = array();
        foreach ( $artifact['runtime_claims'] as $claim ) {
            if ( 'PROVEN' === $claim['evidence_state'] ) {
                $proven_claims[] = $claim['semantic_slot_key'] . ':' . $claim['claim'];
            }
        }

        return array(
            'structural_status' => 'BINDING_VALID',
            'proven_binding_sources' => $proven_bindings,
            'proven_runtime_claims' => $proven_claims,
        );
    }

    public static function bindingStates() {
        return self::BINDING_STATES;
    }

    public static function admittedSurfaces() {
        return self::SURFACES;
    }

    public static function admittedSchemaVersions() {
        return self::SCHEMA_VERSIONS;
    }

    private static function validateContext( $context ) {
        self::requireArray( $context, 'context must be an object.' );
        self::requireExactKeys(
            $context,
            array( 'installation_source_ref', 'form_source_ref', 'entry_source_ref', 'surfaces' ),
            'context'
        );

        self::validateContextSourceRef(
            $context['installation_source_ref'],
            'wordpress.installation',
            'installation_id',
            'context.installation_source_ref'
        );
        self::validateContextSourceRef(
            $context['form_source_ref'],
            'gravity_forms.form',
            'form_id',
            'context.form_source_ref'
        );

        if ( null !== $context['entry_source_ref'] ) {
            self::validateContextSourceRef(
                $context['entry_source_ref'],
                'gravity_forms.entry',
                'entry_id',
                'context.entry_source_ref'
            );
        }

        self::requireStringList( $context['surfaces'], 'context.surfaces', false );
        $seen = array();

        foreach ( $context['surfaces'] as $surface ) {
            if ( ! in_array( $surface, self::SURFACES, true ) ) {
                throw new ContractViolation( 'context.surfaces contains an unadmitted surface.' );
            }

            if ( isset( $seen[ $surface ] ) ) {
                throw new ContractViolation( 'context.surfaces contains duplicates.' );
            }

            $seen[ $surface ] = true;
        }
    }

    private static function validateContextSourceRef( $source, $type, $id_key, $path ) {
        self::requireArray( $source, $path . ' must be a typed source reference.' );
        self::requireExactKeys( $source, array( 'type', $id_key ), $path );
        self::requireSame( $type, $source['type'], $path . '.type is not admitted.' );
        self::requireHostIdentity( $source[ $id_key ], $path . '.' . $id_key );
    }

    private static function validateProvenance( $provenance ) {
        self::requireArray( $provenance, 'provenance must be an object.' );
        self::requireExactKeys( $provenance, array( 'producer', 'evidence_refs' ), 'provenance' );
        self::requireSafeText( $provenance['producer'], 'provenance.producer' );
        self::requireEvidenceRefs( $provenance['evidence_refs'], 'provenance.evidence_refs', true );
    }

    private static function validateBindings( $bindings ) {
        self::requireList( $bindings, 'bindings' );
        $seen = array();

        foreach ( $bindings as $index => $binding ) {
            $path = 'bindings[' . $index . ']';
            self::requireArray( $binding, $path . ' must be an object.' );
            self::requireExactKeys(
                $binding,
                array( 'semantic_slot_key', 'state', 'source_ref', 'evidence_refs' ),
                $path
            );
            self::requireSlotKey( $binding['semantic_slot_key'], $path . '.semantic_slot_key' );

            if ( isset( $seen[ $binding['semantic_slot_key'] ] ) ) {
                throw new ContractViolation( 'Duplicate binding for semantic slot: ' . $binding['semantic_slot_key'] );
            }

            if ( ! is_string( $binding['state'] ) || ! in_array( $binding['state'], self::BINDING_STATES, true ) ) {
                throw new ContractViolation( $path . '.state is not an admitted binding state.' );
            }

            self::requireEvidenceRefs( $binding['evidence_refs'], $path . '.evidence_refs', true );

            if ( 'PROVEN' === $binding['state'] ) {
                if ( null === $binding['source_ref'] ) {
                    throw new ContractViolation( $path . ' PROVEN binding requires a typed source_ref.' );
                }

                if ( array() === $binding['evidence_refs'] ) {
                    throw new ContractViolation( $path . ' PROVEN binding requires evidence provenance.' );
                }

                self::validateSourceRef( $binding['source_ref'], $path . '.source_ref' );
            } elseif ( null !== $binding['source_ref'] ) {
                throw new ContractViolation( $path . ' unresolved binding must not carry a guessed source_ref.' );
            }

            $seen[ $binding['semantic_slot_key'] ] = true;
        }

        if ( array() === $seen ) {
            throw new ContractViolation( 'bindings must not be empty.' );
        }

        return $seen;
    }

    private static function validateRuntimeClaims( $claims, $binding_slots, $schema_version ) {
        self::requireList( $claims, 'runtime_claims' );
        $seen = array();
        $base_keys = array( 'semantic_slot_key', 'claim', 'evidence_state', 'evidence_refs' );

        foreach ( $claims as $index => $claim ) {
            $path = 'runtime_claims[' . $index . ']';
            self::requireArray( $claim, $path . ' must be an object.' );

            $carries_option_map = self::SCHEMA_VERSION_1_1 === $schema_version
                && is_array( $claim )
                && array_key_exists( 'print_option_map', $claim );

            self::requireExactKeys(
                $claim,
                $carries_option_map ? array_merge( $base_keys, array( 'print_option_map' ) ) : $base_keys,
                $path
            );
            self::requireSlotKey( $claim['semantic_slot_key'], $path . '.semantic_slot_key' );

            if ( ! isset( $binding_slots[ $claim['semantic_slot_key'] ] ) ) {
                throw new ContractViolation( $path . ' references a slot not present in bindings.' );
            }

            if ( ! is_string( $claim['claim'] ) || ! in_array( $claim['claim'], self::RUNTIME_CLAIMS, true ) ) {
                throw new ContractViolation( $path . '.claim is not admitted.' );
            }

            if ( ! is_string( $claim['evidence_state'] ) || ! in_array( $claim['evidence_state'], self::EVIDENCE_STATES, true ) ) {
                throw new ContractViolation( $path . '.evidence_state is not admitted.' );
            }

            self::requireEvidenceRefs( $claim['evidence_refs'], $path . '.evidence_refs', true );

            if ( 'PROVEN' === $claim['evidence_state'] && array() === $claim['evidence_refs'] ) {
                throw new ContractViolation( $path . ' PROVEN runtime claim requires evidence provenance.' );
            }

            if ( $carries_option_map ) {
                if ( 'print_mapping' !== $claim['claim'] ) {
                    throw new ContractViolation( $path . '.print_option_map is admitted only for a print_mapping claim.' );
                }
                self::validatePrintOptionMap( $claim['print_option_map'], $path . '.print_option_map' );
            }

            $claim_key = $claim['semantic_slot_key'] . '|' . $claim['claim'];
            if ( isset( $seen[ $claim_key ] ) ) {
                throw new ContractViolation( 'Duplicate runtime claim: ' . $claim_key );
            }

            $seen[ $claim_key ] = true;
        }
    }

    /**
     * A declarative, environment-scoped mapping from the real host raw value to a
     * canonical Print option. It is evidence, not executable configuration: there
     * is no label-similarity inference and no defaulting. Both sides must be
     * unique so one raw value can never silently satisfy two canonical options.
     */
    private static function validatePrintOptionMap( $map, $path ) {
        self::requireList( $map, $path );

        if ( array() === $map ) {
            throw new ContractViolation( $path . ' must not be empty when present.' );
        }

        $seen_options = array();
        $seen_values  = array();

        foreach ( $map as $index => $entry ) {
            $entry_path = $path . '[' . $index . ']';
            self::requireArray( $entry, $entry_path . ' must be an object.' );
            self::requireExactKeys( $entry, array( 'canonical_option', 'host_raw_value' ), $entry_path );

            if ( ! is_string( $entry['canonical_option'] ) || 1 !== preg_match( self::CANONICAL_OPTION_PATTERN, $entry['canonical_option'] ) ) {
                throw new ContractViolation( $entry_path . '.canonical_option must be a stable lowercase option identifier.' );
            }

            if ( ! is_string( $entry['host_raw_value'] ) || '' === $entry['host_raw_value'] ) {
                throw new ContractViolation( $entry_path . '.host_raw_value must be the exact non-empty host raw value as text.' );
            }

            if ( strlen( $entry['host_raw_value'] ) > self::HOST_RAW_VALUE_MAX_LENGTH ) {
                throw new ContractViolation( $entry_path . '.host_raw_value exceeds the admitted length bound.' );
            }

            self::rejectExecutableString( $entry['host_raw_value'], $entry_path . '.host_raw_value' );

            if ( isset( $seen_options[ $entry['canonical_option'] ] ) ) {
                throw new ContractViolation( $entry_path . ' repeats canonical_option: ' . $entry['canonical_option'] );
            }
            if ( isset( $seen_values[ $entry['host_raw_value'] ] ) ) {
                throw new ContractViolation( $entry_path . ' repeats host_raw_value.' );
            }

            $seen_options[ $entry['canonical_option'] ] = true;
            $seen_values[ $entry['host_raw_value'] ]    = true;
        }
    }

    private static function validateSourceRef( $source, $path ) {
        self::requireArray( $source, $path . ' must be an object.' );

        if ( ! isset( $source['type'] ) || ! is_string( $source['type'] ) ) {
            throw new ContractViolation( $path . '.type is required.' );
        }

        switch ( $source['type'] ) {
            case 'gravity_forms.field':
                self::requireExactKeys( $source, array( 'type', 'field_id' ), $path );
                self::requireGravityFormsFieldId( $source['field_id'], $path . '.field_id' );
                return;

            case 'gravity_forms.entry_meta':
                self::requireExactKeys( $source, array( 'type', 'meta_key' ), $path );
                if ( ! is_string( $source['meta_key'] ) || 1 !== preg_match( '/^[a-z][a-z0-9_]*$/', $source['meta_key'] ) ) {
                    throw new ContractViolation( $path . '.meta_key must be a typed entry-meta identifier.' );
                }
                return;

            case 'gravity_flow.state':
                self::requireExactKeys( $source, array( 'type', 'state_key' ), $path );
                self::requireEnum(
                    $source['state_key'],
                    array( 'current_step', 'due_at', 'status' ),
                    $path . '.state_key'
                );
                return;

            case 'gravity_flow.region':
                self::requireExactKeys( $source, array( 'type', 'region_key' ), $path );
                self::requireEnum(
                    $source['region_key'],
                    array( 'instructions', 'timeline', 'backlink' ),
                    $path . '.region_key'
                );
                return;

            case 'gravity_flow.action':
                self::requireExactKeys( $source, array( 'type', 'action_key' ), $path );
                self::requireEnum(
                    $source['action_key'],
                    array( 'approve', 'reject' ),
                    $path . '.action_key'
                );
                return;
        }

        throw new ContractViolation( $path . ' uses an unknown or arbitrary source type.' );
    }

    private static function requireGravityFormsFieldId( $value, $path ) {
        if ( is_int( $value ) && $value > 0 ) {
            return;
        }

        if ( is_string( $value ) && 1 === preg_match( '/^[1-9][0-9]*(?:\.[1-9][0-9]*)?$/', $value ) ) {
            return;
        }

        throw new ContractViolation( $path . ' must be an explicit Gravity Forms field identifier.' );
    }

    private static function requireHostIdentity( $value, $path ) {
        if ( is_int( $value ) && $value > 0 ) {
            return;
        }

        if ( is_string( $value ) && 1 === preg_match( '/^[A-Za-z0-9][A-Za-z0-9._:-]*$/', $value ) ) {
            return;
        }

        throw new ContractViolation( $path . ' must be a host-reported identity scalar.' );
    }

    private static function requireEnum( $value, $allowed, $path ) {
        if ( ! is_string( $value ) || ! in_array( $value, $allowed, true ) ) {
            throw new ContractViolation( $path . ' has an unadmitted value.' );
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

    private static function requireSafeText( $value, $path ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            throw new ContractViolation( $path . ' must be non-empty text.' );
        }

        self::rejectExecutableString( $value, $path );
    }

    private static function requireStringList( $value, $path, $allow_empty ) {
        self::requireList( $value, $path );

        if ( ! $allow_empty && array() === $value ) {
            throw new ContractViolation( $path . ' must not be empty.' );
        }

        foreach ( $value as $item ) {
            if ( ! is_string( $item ) || '' === $item ) {
                throw new ContractViolation( $path . ' must contain non-empty strings only.' );
            }
            self::rejectExecutableString( $item, $path );
        }
    }

    private static function requireEvidenceRefs( $value, $path, $allow_empty ) {
        self::requireList( $value, $path );

        if ( ! $allow_empty && array() === $value ) {
            throw new ContractViolation( $path . ' must not be empty.' );
        }

        $seen = array();

        foreach ( $value as $item ) {
            if ( ! is_string( $item ) || '' === trim( $item ) ) {
                throw new ContractViolation( $path . ' must contain non-empty string references.' );
            }

            self::rejectExecutableString( $item, $path );

            if ( isset( $seen[ $item ] ) ) {
                throw new ContractViolation( $path . ' must not contain duplicates.' );
            }

            $seen[ $item ] = true;
        }
    }

    private static function rejectDangerousStructure( $value, $path ) {
        if ( is_array( $value ) ) {
            foreach ( $value as $key => $item ) {
                if ( is_string( $key ) && 1 === preg_match( '/(?:selector|hook|callback|php|javascript|html|css|api_endpoint|remote_code|executable|code_payload)/i', $key ) ) {
                    throw new ContractViolation( $path . ' contains a prohibited passthrough key: ' . $key );
                }

                self::rejectDangerousStructure( $item, $path . '.' . $key );
            }
            return;
        }

        if ( is_string( $value ) ) {
            self::rejectExecutableString( $value, $path );
        }
    }

    private static function rejectExecutableString( $value, $path ) {
        $patterns = array(
            '/<\?(?:php|=)?/i',
            '/<\/?[a-z][^>]*>/i',
            '/\bjavascript\s*:/i',
            '/\bdata\s*:\s*text\//i',
            '/\b(?:eval|exec|system|shell_exec|passthru)\s*\(/i',
            '/[{};]/',
        );

        foreach ( $patterns as $pattern ) {
            if ( 1 === preg_match( $pattern, $value ) ) {
                throw new ContractViolation( $path . ' contains executable or embedded-code syntax.' );
            }
        }
    }
}
