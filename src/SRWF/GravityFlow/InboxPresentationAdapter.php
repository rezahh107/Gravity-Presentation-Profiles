<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * SRWF production adapter for the native Gravity Flow Inbox.
 *
 * This adapter only changes presentation. Gravity Flow remains the owner of
 * entry queries, assignment/authorization, sorting, paging, refresh and URLs.
 */
final class InboxPresentationAdapter {
    const SURFACE = 'gravity_flow.inbox';
    const CARD_COLUMN = 'gpp_case_card';
    const STYLE_HANDLE = 'gpp-srwf-gravity-flow-inbox';

    private static $model_loaded = false;
    private static $model = null;

    public static function register() {
        if ( ! function_exists( 'add_filter' ) || ! function_exists( 'add_action' ) ) {
            return;
        }

        // Run after host/extension column discovery so GPP can add one
        // presentation column without deleting host-owned row data.
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'filterColumns' ), 100, 2 );
        add_filter( 'gravityflow_inbox_field_value', array( __CLASS__, 'filterValue' ), 100, 4 );
        add_filter( 'gravityflow_js_config_shared', array( __CLASS__, 'filterJsConfig' ), 100, 1 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
    }

    public static function filterColumns( $columns, $args ) {
        if ( null === self::model() || ! is_array( $columns ) ) {
            return $columns;
        }

        // Preserve every native/extension column in rowData. Gravity Flow uses
        // the native entry id for AG Grid row identity and native search/sort/
        // refresh may depend on other host-owned values. Visibility is handled
        // only in filterJsConfig().
        if ( ! isset( $columns['id'] ) ) {
            $columns = array( 'id' => __( 'Entry ID', 'gravity-presentation-profiles' ) ) + $columns;
        }
        $columns[ self::CARD_COLUMN ] = __( 'پرونده‌های دانش‌آموزان', 'gravity-presentation-profiles' );

        return $columns;
    }

    public static function filterValue( $value, $form_id, $field_id, $entry ) {
        if ( self::CARD_COLUMN !== $field_id ) {
            return $value;
        }

        $model = self::model();
        if ( null === $model || ! is_array( $entry ) ) {
            return '';
        }

        return self::renderCard( $model, $entry );
    }

    public static function filterJsConfig( $config ) {
        if ( null === self::model() || ! is_array( $config ) || empty( $config['grids'] ) || ! is_array( $config['grids'] ) ) {
            return $config;
        }

        foreach ( $config['grids'] as &$grid ) {
            if ( empty( $grid['grid_options'] ) || ! is_array( $grid['grid_options'] ) ) {
                continue;
            }

            $grid['grid_options']['domLayout'] = 'autoHeight';
            $grid['grid_options']['ensureDomOrder'] = true;
            $grid['grid_options']['suppressHorizontalScroll'] = true;

            if ( empty( $grid['grid_options']['columnDefs'] ) || ! is_array( $grid['grid_options']['columnDefs'] ) ) {
                continue;
            }

            foreach ( $grid['grid_options']['columnDefs'] as &$definition ) {
                if ( ! is_array( $definition ) || empty( $definition['field'] ) ) {
                    continue;
                }

                if ( self::CARD_COLUMN !== $definition['field'] ) {
                    $definition['hide'] = true;
                    continue;
                }

                $definition['hide'] = false;
                $definition['flex'] = 1;
                $definition['minWidth'] = 0;
                $definition['wrapText'] = true;
                $definition['autoHeight'] = true;
            }
            unset( $definition );
        }
        unset( $grid );

        return $config;
    }

    public static function enqueueStyles() {
        if ( null === self::model() || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
            return;
        }

        wp_enqueue_style(
            self::STYLE_HANDLE,
            plugins_url( 'assets/css/srwf-gravity-flow-inbox.css', GPP_PLUGIN_FILE ),
            array(),
            '1.0.0'
        );
    }

    private static function model() {
        if ( self::$model_loaded ) {
            return self::$model;
        }

        self::$model_loaded = true;

        try {
            $visual = new VisualPackageLifecycle(
                new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
            );
            $profile = $visual->effectiveProfile( self::SURFACE );
            if ( null === $profile ) {
                return null;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );
            $active_binding_sets = self::activeBindingSets( $bindings->snapshot() );

            self::$model = new InboxPresentationModel( $profile, $active_binding_sets );
        } catch ( \Throwable $exception ) {
            // Presentation fails closed; native Gravity Flow remains available.
            self::$model = null;
        }

        return self::$model;
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

    private static function renderCard( InboxPresentationModel $model, $entry ) {
        $name = self::slotValue( $model, $entry, 'student.full_name' );
        $national_id = self::slotValue( $model, $entry, 'student.national_id' );
        $photo = self::slotValue( $model, $entry, 'student.photo' );
        $step = self::slotValue( $model, $entry, 'workflow.current_step' );
        $created = self::slotValue( $model, $entry, 'entry.created_at' );
        $school = self::slotValue( $model, $entry, 'school.name' );
        $due = self::slotValue( $model, $entry, 'workflow.due_at' );

        $name_display = self::presentText( $name );
        $national_display = null === $national_id ? null : PersianDateFormatter::persianDigits( $national_id );
        $created_display = null === $created ? null : PersianDateFormatter::formatDateTime( $created );
        $due_display = null === $due ? null : PersianDateFormatter::formatDateTime( $due );
        $due_timestamp = null === $due ? null : PersianDateFormatter::timestamp( $due );
        $is_overdue = null !== $due_timestamp && $due_timestamp < time();

        $search_values = array_filter(
            array( $name, $national_id, $step, $created, $school, $due ),
            static function ( $item ) { return null !== $item && '' !== (string) $item; }
        );

        $html = '<span class="gpp-inbox-card__search-key" aria-hidden="true">' . esc_html( implode( ' ', $search_values ) ) . '</span>';
        $html .= '<article class="gpp-inbox-card" dir="rtl" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '">';
        $html .= '<div class="gpp-inbox-card__photo">' . self::photoMarkup( $photo, $name_display ) . '</div>';
        $html .= '<div class="gpp-inbox-card__identity">';
        $html .= '<strong class="gpp-inbox-card__name">' . esc_html( null === $name_display ? '—' : $name_display ) . '</strong>';
        $html .= '<span class="gpp-inbox-card__meta"><span class="gpp-inbox-card__label">' . esc_html__( 'کد ملی', 'gravity-presentation-profiles' ) . '</span><span class="gpp-inbox-card__national-id">' . esc_html( null === $national_display ? '—' : $national_display ) . '</span></span>';
        $html .= '</div>';
        $html .= '<dl class="gpp-inbox-card__details">';
        $html .= self::detailMarkup( 'مرحله جاری', $step, 'gpp-inbox-card__step' );
        $html .= self::detailMarkup( 'تاریخ ثبت', $created_display, 'gpp-inbox-card__created-at' );
        if ( null !== $school ) {
            $html .= self::detailMarkup( 'مدرسه', $school, 'gpp-inbox-card__school' );
        }
        if ( null !== $due_display ) {
            $due_class = 'gpp-inbox-card__due' . ( $is_overdue ? ' gpp-inbox-card__due--overdue' : '' );
            $html .= self::detailMarkup( 'سررسید', $due_display, $due_class );
        }
        $html .= '</dl>';
        $html .= '<span class="gpp-inbox-card__open">' . esc_html__( 'باز کردن پرونده', 'gravity-presentation-profiles' ) . '</span>';
        $html .= '</article>';

        return $html;
    }

    private static function slotValue( InboxPresentationModel $model, $entry, $slot ) {
        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return null;
        }

        $source = $resolved['source_ref'];
        $value = self::readSourceValue( $source, $entry );

        if ( is_int( $value ) || is_float( $value ) ) {
            return $value;
        }
        if ( ! is_scalar( $value ) ) {
            return null;
        }

        $value = trim( (string) $value );
        return '' === $value ? null : $value;
    }

    private static function readSourceValue( $source, $entry ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) ) {
            return null;
        }

        switch ( $source['type'] ) {
            case 'gravity_forms.field':
                $key = (string) $source['field_id'];
                return isset( $entry[ $key ] ) ? $entry[ $key ] : null;

            case 'gravity_forms.entry_meta':
                $key = $source['meta_key'];
                if ( isset( $entry[ $key ] ) ) {
                    return $entry[ $key ];
                }
                if ( function_exists( 'gform_get_meta' ) ) {
                    return gform_get_meta( (int) $entry['id'], $key );
                }
                return null;

            case 'gravity_flow.state':
                if ( ! class_exists( 'Gravity_Flow_API' ) ) {
                    return null;
                }
                $api = new \Gravity_Flow_API( (int) $entry['form_id'] );
                $step = $api->get_current_step( $entry );
                if ( ! $step ) {
                    return null;
                }
                if ( 'current_step' === $source['state_key'] ) {
                    return $step->get_name();
                }
                if ( 'due_at' === $source['state_key'] && ! empty( $step->due_date ) && method_exists( $step, 'get_due_date_timestamp' ) ) {
                    return (int) $step->get_due_date_timestamp();
                }
                if ( 'status' === $source['state_key'] && method_exists( $step, 'get_status' ) ) {
                    return $step->get_status();
                }
                return null;
        }

        return null;
    }

    private static function presentText( $value ) {
        if ( null === $value ) {
            return null;
        }
        return trim( wp_strip_all_tags( (string) $value ) );
    }

    private static function photoMarkup( $photo, $name ) {
        if ( null !== $photo ) {
            $url = esc_url( $photo );
            if ( '' !== $url ) {
                return '<img class="gpp-inbox-card__photo-image" src="' . $url . '" alt="" loading="lazy" />';
            }
        }

        $initial = '؟';
        if ( null !== $name && '' !== $name && function_exists( 'mb_substr' ) ) {
            $initial = mb_substr( $name, 0, 1, 'UTF-8' );
        }

        return '<span class="gpp-inbox-card__photo-fallback" aria-hidden="true">' . esc_html( $initial ) . '</span><span class="screen-reader-text">' . esc_html__( 'تصویر دانش‌آموز موجود نیست', 'gravity-presentation-profiles' ) . '</span>';
    }

    private static function detailMarkup( $label, $value, $class_name ) {
        $display = null === $value || '' === (string) $value ? '—' : (string) $value;
        return '<div class="gpp-inbox-card__detail ' . esc_attr( $class_name ) . '"><dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( $display ) . '</dd></div>';
    }
}
