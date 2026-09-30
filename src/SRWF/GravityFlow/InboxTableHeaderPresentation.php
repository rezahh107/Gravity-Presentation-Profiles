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
 * native Inbox column/value filters to select, order and label five visible
 * columns. Two labels require a combined semantic; those values are composed
 * as plain text from already-PROVEN Gravity Forms field bindings and never
 * introduce a renderer, parallel data source or HTML cell contract.
 */
final class InboxTableHeaderPresentation {
    const SURFACE = 'gravity_flow.inbox';
    const COLUMN_ORDER_SCRIPT_HANDLE = 'gpp-srwf-gravity-flow-inbox-column-order-contract';
    const COLUMN_ORDER_SCRIPT_PATH = 'assets/js/gravity-flow-inbox-column-order-contract.js';

    private static $configurations_loaded = false;
    private static $configurations = array();
    private static $active_form_id = null;
    private static $column_order_contracts = array();

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
        self::$configurations_loaded = false;
        self::$configurations = array();
        self::$active_form_id = null;
        self::$column_order_contracts = array();
    }

    public static function filterColumns( $columns, $args = array() ) {
        if ( ! is_array( $columns ) ) {
            return $columns;
        }

        self::$active_form_id = null;
        $configuration = self::configurationForColumns( $args );
        if ( null === $configuration
            || ! array_key_exists( 'id', $columns )
            || ! array_key_exists( 'date_created', $columns )
            || ! array_key_exists( 'date_created_human_readable', $columns ) ) {
            return $columns;
        }

        $visible = array(
            'id' => self::label( 'عملیات' ),
            $configuration['column_keys']['student_name'] => self::label( 'نام دانش‌آموز' ),
            $configuration['column_keys']['national_id'] => self::label( 'کد ملی' ),
            $configuration['column_keys']['school_grade'] => self::label( 'مدرسه و پایه' ),
            'date_created' => self::label( 'تاریخ و ساعت ثبت' ),
        );

        // Gravity Flow's current native Inbox Grid remains physically LTR even
        // when the surrounding WordPress presentation is RTL. The column hook
        // therefore needs the inverse physical sequence on RTL requests so the
        // visible right-to-left order matches the Owner contract. Gravity Flow
        // 3.1.0 can subsequently restore a compatible persisted column state
        // with `id` moved to the physical front, so bind this exact projected
        // order to the exact native Grid ID for a post-restore reconciliation.
        $is_rtl = function_exists( 'is_rtl' ) && is_rtl();
        if ( $is_rtl ) {
            $visible = array_reverse( $visible, true );
            if ( ! self::bindColumnOrderContract( $args, array_keys( $visible ) ) ) {
                // Without an exact host Grid identity and the bounded runtime
                // reconciler, the persisted-state path can violate the Owner
                // order. Leave the native host columns untouched instead.
                return $columns;
            }
        }

        self::$active_form_id = $configuration['form_id'];

        // Gravity Flow 3.1.0 keeps the raw date_created compare value and its
        // human-readable display value as separate column identities. Preserve
        // the host-owned hidden companion so the visible native date column
        // retains its displayKey without GPP formatting dates.
        $visible['date_created_human_readable'] = $columns['date_created_human_readable'];

        return $visible;
    }

    public static function filterFieldValue( $value, $form_id, $field_id, $entry ) {
        $configuration = self::configurationForForm( $form_id );
        if ( null === $configuration || (string) self::$active_form_id !== (string) $form_id || ! is_array( $entry ) ) {
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

    private static function bindColumnOrderContract( $args, $physical_column_ids ) {
        $grid_id = self::gridIdFromArgs( $args );
        if ( null === $grid_id ) {
            return false;
        }

        $physical_column_ids = array_values( array_map( 'strval', $physical_column_ids ) );
        if ( ! $physical_column_ids || count( array_unique( $physical_column_ids, SORT_STRING ) ) !== count( $physical_column_ids ) ) {
            return false;
        }

        if ( array_key_exists( $grid_id, self::$column_order_contracts ) ) {
            return self::$column_order_contracts[ $grid_id ] === $physical_column_ids;
        }

        if ( ! self::enqueueColumnOrderContract( $grid_id, $physical_column_ids ) ) {
            return false;
        }

        self::$column_order_contracts[ $grid_id ] = $physical_column_ids;
        return true;
    }

    private static function gridIdFromArgs( $args ) {
        if ( ! is_array( $args ) || ! class_exists( 'Gravity_Flow' ) ) {
            return null;
        }

        $provider_class = 'Gravity_Flow\\Gravity_Flow\\Inbox\\Inbox_Service_Provider';
        if ( ! class_exists( $provider_class ) || ! defined( $provider_class . '::TASK_MODEL' ) ) {
            return null;
        }

        try {
            $gravity_flow = \Gravity_Flow::get_instance();
            if ( ! is_object( $gravity_flow ) || ! method_exists( $gravity_flow, 'container' ) ) {
                return null;
            }

            $container = $gravity_flow->container();
            if ( ! is_object( $container ) || ! method_exists( $container, 'get' ) ) {
                return null;
            }

            $task_model = $container->get( constant( $provider_class . '::TASK_MODEL' ) );
            if ( ! is_object( $task_model ) || ! method_exists( $task_model, 'get_unique_grid_id_from_args' ) ) {
                return null;
            }

            $grid_id = $task_model->get_unique_grid_id_from_args( $args );
            if ( ! is_scalar( $grid_id ) ) {
                return null;
            }

            $grid_id = trim( (string) $grid_id );
            return '' === $grid_id ? null : $grid_id;
        } catch ( \Throwable $exception ) {
            return null;
        }
    }

    private static function enqueueColumnOrderContract( $grid_id, $physical_column_ids ) {
        if ( ! defined( 'GPP_PLUGIN_FILE' )
            || ! function_exists( 'plugins_url' )
            || ! function_exists( 'wp_enqueue_script' )
            || ! function_exists( 'wp_add_inline_script' ) ) {
            return false;
        }

        $absolute_path = dirname( GPP_PLUGIN_FILE ) . '/' . self::COLUMN_ORDER_SCRIPT_PATH;
        if ( ! is_file( $absolute_path ) ) {
            return false;
        }

        $hash = hash_file( 'sha256', $absolute_path );
        if ( ! is_string( $hash ) || '' === $hash ) {
            return false;
        }

        $payload = array(
            'gridId' => $grid_id,
            'physicalColumnIds' => $physical_column_ids,
        );
        $json = function_exists( 'wp_json_encode' )
            ? wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
            : json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
        if ( ! is_string( $json ) || '' === $json ) {
            return false;
        }

        wp_enqueue_script(
            self::COLUMN_ORDER_SCRIPT_HANDLE,
            plugins_url( self::COLUMN_ORDER_SCRIPT_PATH, GPP_PLUGIN_FILE ),
            array(),
            substr( $hash, 0, 16 ),
            true
        );

        $inline = 'window.gppSrwfInboxColumnOrderContracts=window.gppSrwfInboxColumnOrderContracts||[];'
            . 'window.gppSrwfInboxColumnOrderContracts.push(' . $json . ');';

        return false !== wp_add_inline_script( self::COLUMN_ORDER_SCRIPT_HANDLE, $inline, 'before' );
    }

    private static function configurationForColumns( $args ) {
        $form_id = self::formIdFromArgs( $args );
        if ( null === $form_id ) {
            return null;
        }

        $configurations = self::configurations();
        if ( ! $configurations ) {
            return null;
        }

        return isset( $configurations[ $form_id ] ) ? $configurations[ $form_id ] : null;
    }

    private static function configurationForForm( $form_id ) {
        $form_id = (int) $form_id;
        if ( $form_id < 1 ) {
            return null;
        }
        $configurations = self::configurations();
        return isset( $configurations[ $form_id ] ) ? $configurations[ $form_id ] : null;
    }

    private static function configurations() {
        if ( self::$configurations_loaded ) {
            return self::$configurations;
        }

        self::$configurations_loaded = true;

        try {
            $visual = new VisualPackageLifecycle(
                new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
            );
            if ( null === $visual->resolve( self::SURFACE ) ) {
                return self::$configurations;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );

            foreach ( self::activeBindingSets( $bindings->snapshot() ) as $binding_set ) {
                $configuration = self::configurationFromBindingSet( $binding_set );
                if ( null === $configuration ) {
                    continue;
                }
                $form_id = (int) $configuration['form_id'];
                if ( array_key_exists( $form_id, self::$configurations ) ) {
                    // More than one active table-wide binding for one form is
                    // ambiguous; fail that form closed rather than pick one.
                    self::$configurations[ $form_id ] = null;
                    continue;
                }
                self::$configurations[ $form_id ] = $configuration;
            }

            self::$configurations = array_filter( self::$configurations, static function ( $configuration ) {
                return is_array( $configuration );
            } );
        } catch ( \Throwable $exception ) {
            self::$configurations = array();
        }

        return self::$configurations;
    }

    private static function formIdFromArgs( $args ) {
        if ( ! is_array( $args ) || ! array_key_exists( 'form_id', $args ) ) {
            return null;
        }

        $form_id = $args['form_id'];
        if ( is_array( $form_id ) ) {
            $form_id = array_values( array_filter( array_map( 'intval', $form_id ) ) );
            return 1 === count( $form_id ) ? $form_id[0] : null;
        }

        if ( ! is_scalar( $form_id ) ) {
            return null;
        }
        $form_id = (int) $form_id;
        return $form_id > 0 ? $form_id : null;
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
