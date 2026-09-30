<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Bounded SRWF Inbox table-header projection over Gravity Flow's native Grid.
 *
 * Gravity Flow remains authoritative for the table, query, row identity,
 * search, pagination, navigation and lifecycle. This adapter uses only the
 * native Inbox column/value filters to select, order and label five columns.
 * Two labels require a combined semantic; those values are composed as plain
 * text from already-PROVEN Gravity Forms field bindings and never introduce a
 * renderer, parallel data source or HTML cell contract.
 */
final class InboxTableHeaderPresentation {
    const SURFACE = 'gravity_flow.inbox';

    private static $configuration_loaded = false;
    private static $configuration = null;

    public static function register() {
        if ( ! function_exists( 'add_filter' ) ) {
            return;
        }

        // Run after ordinary site filters so this bounded SRWF presentation is
        // the final visible column set, while Gravity Flow still builds/owns it.
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'filterColumns' ), PHP_INT_MAX, 2 );
        add_filter( 'gravityflow_inbox_field_value', array( __CLASS__, 'filterFieldValue' ), PHP_INT_MAX, 4 );
    }

    public static function resetRuntimeCache() {
        self::$configuration_loaded = false;
        self::$configuration = null;
    }

    public static function filterColumns( $columns, $args = array() ) {
        unset( $args );

        if ( ! is_array( $columns ) ) {
            return $columns;
        }

        $configuration = self::configuration();
        if ( null === $configuration || ! array_key_exists( 'id', $columns ) || ! array_key_exists( 'date_created', $columns ) ) {
            return $columns;
        }

        return array(
            'id' => self::label( 'عملیات' ),
            $configuration['column_keys']['student_name'] => self::label( 'نام دانش‌آموز' ),
            $configuration['column_keys']['national_id'] => self::label( 'کد ملی' ),
            $configuration['column_keys']['school_grade'] => self::label( 'مدرسه و پایه' ),
            'date_created' => self::label( 'تاریخ و ساعت ثبت' ),
        );
    }

    public static function filterFieldValue( $value, $form_id, $field_id, $entry ) {
        $configuration = self::configuration();
        if ( null === $configuration || (string) $configuration['form_id'] !== (string) $form_id || ! is_array( $entry ) ) {
            return $value;
        }

        $field_key = self::fieldKey( $field_id );
        if ( null === $field_key ) {
            return $value;
        }

        if ( $field_key === $configuration['column_keys']['student_name'] ) {
            return self::composePlainText(
                $value,
                $configuration,
                $entry,
                array( 'student.first_name', 'student.last_name' )
            );
        }

        if ( $field_key === $configuration['column_keys']['school_grade'] ) {
            return self::composePlainText(
                $value,
                $configuration,
                $entry,
                array( 'school.name', 'education.grade_group' ),
                ' — '
            );
        }

        return $value;
    }

    private static function composePlainText( $fallback, $configuration, $entry, $slots, $separator = ' ' ) {
        if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_form' ) ) {
            return $fallback;
        }

        $form = \GFAPI::get_form( (int) $configuration['form_id'] );
        if ( ! is_array( $form ) ) {
            return $fallback;
        }

        $reader = new BoundHostValueReader();
        $parts = array();
        foreach ( $slots as $slot ) {
            if ( empty( $configuration['sources'][ $slot ] ) ) {
                return $fallback;
            }

            $part = self::plainText( $reader->readDisplay( $configuration['sources'][ $slot ], $form, $entry ) );
            if ( '' !== $part ) {
                $parts[] = $part;
            }
        }

        return $parts ? implode( $separator, $parts ) : $fallback;
    }

    private static function plainText( $value ) {
        if ( ! is_scalar( $value ) ) {
            return '';
        }

        $text = (string) $value;
        $text = function_exists( 'wp_strip_all_tags' ) ? wp_strip_all_tags( $text, true ) : strip_tags( $text );
        $text = preg_replace( '/\s+/u', ' ', $text );
        return is_string( $text ) ? trim( $text ) : '';
    }

    private static function label( $text ) {
        return function_exists( '__' ) ? __( $text, 'gravity-presentation-profiles' ) : $text;
    }

    private static function configuration() {
        if ( self::$configuration_loaded ) {
            return self::$configuration;
        }

        self::$configuration_loaded = true;

        try {
            $visual = new VisualPackageLifecycle(
                new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
            );
            if ( null === $visual->resolve( self::SURFACE ) ) {
                return null;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );

            $candidates = array();
            foreach ( self::activeBindingSets( $bindings->snapshot() ) as $binding_set ) {
                $configuration = self::configurationFromBindingSet( $binding_set );
                if ( null !== $configuration ) {
                    $candidates[] = $configuration;
                }
            }

            if ( 1 !== count( $candidates ) ) {
                return null;
            }

            self::$configuration = $candidates[0];
        } catch ( \Throwable $exception ) {
            self::$configuration = null;
        }

        return self::$configuration;
    }

    private static function configurationFromBindingSet( $binding_set ) {
        if ( ! is_array( $binding_set ) || empty( $binding_set['context'] ) || ! is_array( $binding_set['context'] ) ) {
            return null;
        }

        $context = $binding_set['context'];
        if ( empty( $context['surfaces'] ) || ! is_array( $context['surfaces'] ) || ! in_array( self::SURFACE, $context['surfaces'], true ) ) {
            return null;
        }
        if ( ! empty( $context['entry_source_ref'] ) || empty( $context['form_source_ref'] ) || ! is_array( $context['form_source_ref'] ) ) {
            return null;
        }
        if ( 'gravity_forms.form' !== ( $context['form_source_ref']['type'] ?? null ) || empty( $context['form_source_ref']['form_id'] ) ) {
            return null;
        }

        $required_fields = array(
            'student.first_name',
            'student.last_name',
            'student.national_id',
            'school.name',
            'education.grade_group',
        );
        $sources = array();
        foreach ( $required_fields as $slot ) {
            $source = self::provenSource( $binding_set, $slot, 'gravity_forms.field' );
            if ( null === $source || null === self::fieldKey( $source['field_id'] ?? null ) ) {
                return null;
            }
            $sources[ $slot ] = $source;
        }

        $created_at = self::provenSource( $binding_set, 'entry.created_at', 'gravity_forms.entry_meta' );
        if ( null === $created_at || 'date_created' !== ( $created_at['meta_key'] ?? null ) ) {
            return null;
        }
        $sources['entry.created_at'] = $created_at;

        $column_keys = array(
            'student_name' => self::fieldKey( $sources['student.first_name']['field_id'] ),
            'national_id' => self::fieldKey( $sources['student.national_id']['field_id'] ),
            'school_grade' => self::fieldKey( $sources['school.name']['field_id'] ),
        );

        $distinct = array(
            'id',
            $column_keys['student_name'],
            $column_keys['national_id'],
            $column_keys['school_grade'],
            'date_created',
        );
        if ( count( array_unique( $distinct, SORT_STRING ) ) !== count( $distinct ) ) {
            return null;
        }
        if ( self::fieldKey( $sources['student.first_name']['field_id'] ) === self::fieldKey( $sources['student.last_name']['field_id'] )
            || self::fieldKey( $sources['school.name']['field_id'] ) === self::fieldKey( $sources['education.grade_group']['field_id'] ) ) {
            return null;
        }

        return array(
            'form_id' => (int) $context['form_source_ref']['form_id'],
            'column_keys' => $column_keys,
            'sources' => $sources,
        );
    }

    private static function provenSource( $binding_set, $slot, $source_type ) {
        if ( empty( $binding_set['bindings'] ) || ! is_array( $binding_set['bindings'] ) ) {
            return null;
        }

        foreach ( $binding_set['bindings'] as $binding ) {
            if ( ! is_array( $binding ) || $slot !== ( $binding['semantic_slot_key'] ?? null ) || 'PROVEN' !== ( $binding['state'] ?? null ) ) {
                continue;
            }

            $source = $binding['source_ref'] ?? null;
            if ( ! is_array( $source ) || $source_type !== ( $source['type'] ?? null ) || ! self::availabilityIsCurrent( $binding_set, $slot, $source ) ) {
                return null;
            }
            return $source;
        }

        return null;
    }

    private static function availabilityIsCurrent( $binding_set, $slot, $source ) {
        if ( empty( $binding_set['runtime_claims'] ) || ! is_array( $binding_set['runtime_claims'] ) ) {
            return false;
        }

        try {
            $expected = InboxRuntimeEvidence::availabilityRef( $binding_set, $slot, $source );
        } catch ( \Throwable $exception ) {
            return false;
        }

        foreach ( $binding_set['runtime_claims'] as $claim ) {
            if ( ! is_array( $claim ) || $slot !== ( $claim['semantic_slot_key'] ?? null ) || 'availability' !== ( $claim['claim'] ?? null ) ) {
                continue;
            }
            return 'PROVEN' === ( $claim['evidence_state'] ?? null )
                && ! empty( $claim['evidence_refs'] )
                && is_array( $claim['evidence_refs'] )
                && in_array( $expected, $claim['evidence_refs'], true );
        }

        return false;
    }

    private static function fieldKey( $field_id ) {
        if ( ! is_scalar( $field_id ) ) {
            return null;
        }
        $key = trim( (string) $field_id );
        return '' === $key ? null : $key;
    }

    private static function activeBindingSets( $snapshot ) {
        if ( ! is_array( $snapshot ) || empty( $snapshot['installed'] ) || empty( $snapshot['activations'] ) ) {
            return array();
        }

        $active = array();
        foreach ( $snapshot['activations'] as $context_key => $identity ) {
            if ( ! isset( $identity['binding_set_id'], $identity['binding_set_version'] ) ) {
                continue;
            }

            $id = $identity['binding_set_id'];
            $version = $identity['binding_set_version'];
            if ( ! isset( $snapshot['installed'][ $id ][ $version ] ) ) {
                continue;
            }

            $record = $snapshot['installed'][ $id ][ $version ];
            if ( ! isset( $record['context_key'], $record['artifact'] ) || $record['context_key'] !== $context_key ) {
                continue;
            }

            $active[] = $record['artifact'];
        }

        return $active;
    }
}
