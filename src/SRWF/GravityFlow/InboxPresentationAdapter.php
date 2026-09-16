<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
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
    const NATIVE_STYLE_HANDLE = 'gpp-srwf-gravity-flow-inbox-native';

    private static $model_loaded = false;
    private static $model = null;
    private static $form_cache = array();

    public static function register() {
        if ( ! function_exists( 'add_filter' ) || ! function_exists( 'add_action' ) ) {
            return;
        }

        // These are the exact Gravity Flow 3.1.0 Inbox extension seams admitted
        // by the runtime lab. Layout remains CSS-only; no grid/query API is owned.
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'filterColumns' ), 100, 2 );
        add_filter( 'gravityflow_inbox_field_value', array( __CLASS__, 'filterValue' ), 100, 4 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
        self::$form_cache = array();
        RuntimeDiagnostics::resetSurface( self::SURFACE );
    }

    public static function filterColumns( $columns, $args ) {
        unset( $args );
        if ( null === self::model() || ! is_array( $columns ) ) {
            return $columns;
        }

        // Preserve every native/extension column in rowData. Gravity Flow uses
        // the native entry id for AG Grid row identity and native search/sort/
        // refresh may depend on other host-owned values. CSS changes visibility.
        if ( ! isset( $columns['id'] ) ) {
            $columns = array( 'id' => __( 'Entry ID', 'gravity-presentation-profiles' ) ) + $columns;
        }

        // Keep the presentation column first so AG Grid column virtualization
        // cannot omit it on narrow viewports. No native data column is removed.
        unset( $columns[ self::CARD_COLUMN ] );
        $card = array(
            self::CARD_COLUMN => __( 'پرونده‌های دانش‌آموزان', 'gravity-presentation-profiles' ),
        );

        return $card + $columns;
    }

    public static function filterValue( $value, $form_id, $field_id, $entry ) {
        unset( $form_id );
        if ( self::CARD_COLUMN !== $field_id ) {
            return $value;
        }

        $model = self::model();
        if ( null === $model ) {
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'INBOX_PRESENTATION_OUTPUT',
                RuntimeDecisionTrace::RESULT_SKIP,
                'profile_not_active',
                'native_gravity_flow_inbox'
            );
            return '';
        }
        if ( ! is_array( $entry ) ) {
            return self::unreadyOutput( 'invalid_entry' );
        }

        return self::renderCard( $model, $entry );
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
        wp_enqueue_style(
            self::NATIVE_STYLE_HANDLE,
            plugins_url( 'assets/css/srwf-gravity-flow-inbox-native.css', GPP_PLUGIN_FILE ),
            array( self::STYLE_HANDLE ),
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
            $activation = $visual->resolve( self::SURFACE );
            if ( null === $activation ) {
                RuntimeDiagnostics::recordOnce(
                    self::SURFACE,
                    'INBOX_PROFILE_RESOLUTION',
                    RuntimeDecisionTrace::RESULT_NOT_APPLICABLE,
                    'profile_not_active',
                    'native_gravity_flow_inbox'
                );
                return null;
            }

            $profile = $visual->effectiveProfile( self::SURFACE );
            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $profile || null === $package ) {
                RuntimeDiagnostics::recordOnce(
                    self::SURFACE,
                    'INBOX_PROFILE_RESOLUTION',
                    RuntimeDecisionTrace::RESULT_FAIL,
                    'profile_resolution_unavailable',
                    'native_gravity_flow_inbox'
                );
                return null;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );
            $active_binding_sets = self::activeBindingSets( $bindings->snapshot() );

            self::$model = new InboxPresentationModel(
                $profile,
                $active_binding_sets,
                $package['semantic_slots']
            );
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'INBOX_PROFILE_RESOLUTION',
                RuntimeDecisionTrace::RESULT_PASS
            );
        } catch ( \Throwable $exception ) {
            // Presentation fails closed; native Gravity Flow remains available.
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'INBOX_PROFILE_RESOLUTION',
                'runtime_exception',
                'native_gravity_flow_inbox',
                $exception
            );
            self::$model = null;
        }

        return self::$model;
    }

    private static function activeVisualPackage( $snapshot, $activation ) {
        if ( ! is_array( $snapshot ) || ! is_array( $activation ) ) {
            return null;
        }
        if ( ! isset( $activation['package_id'], $activation['package_version'], $activation['profile_id'] ) ) {
            return null;
        }

        $id = $activation['package_id'];
        $version = $activation['package_version'];
        if ( empty( $snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
            return null;
        }

        $package = $snapshot['installed'][ $id ][ $version ]['artifact'];
        if ( empty( $package['semantic_slots'] ) || ! is_array( $package['semantic_slots'] ) ) {
            return null;
        }

        return $package;
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
        $decision = $model->presentationReadiness( $entry );
        if ( ! $decision['ready'] ) {
            return self::unreadyOutput( $decision['reason'] );
        }

        $source_health = self::requiredSourcesStillAvailable( $model, $entry );
        if ( ! $source_health['ready'] ) {
            return self::unreadyOutput( $source_health['reason'] );
        }

        $full_name = self::derivedFullName( $model, $entry );
        if ( ! $full_name['ready'] ) {
            return self::unreadyOutput( $full_name['reason'] );
        }

        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'INBOX_BINDING_READINESS',
            RuntimeDecisionTrace::RESULT_PASS
        );

        $name = $full_name['value'];
        $national_id = self::slotValue( $model, $entry, 'student.national_id' );
        $photo = self::slotValue( $model, $entry, 'student.photo' );
        $grade_group = self::slotValue( $model, $entry, 'education.grade_group' );
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

        // Keep native-searchable raw values in the host-owned row value. The
        // text is visually hidden; AG Grid remains the sole search authority.
        $search_values = array_filter(
            array( $name, $national_id, $grade_group, $step, $created, $school, $due ),
            static function ( $item ) { return null !== $item && '' !== (string) $item; }
        );

        $html = self::readinessMarker( true );
        $html .= '<span class="gpp-inbox-card__search-key" aria-hidden="true">' . esc_html( implode( ' ', $search_values ) ) . '</span>';
        $html .= '<article class="gpp-inbox-card" dir="rtl" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '">';
        $html .= '<div class="gpp-inbox-card__photo">' . self::photoMarkup( $photo, $name_display ) . '</div>';
        $html .= '<div class="gpp-inbox-card__identity">';
        $html .= '<strong class="gpp-inbox-card__name">' . esc_html( $name_display ) . '</strong>';
        $html .= '<span class="gpp-inbox-card__meta"><span class="gpp-inbox-card__label">' . esc_html__( 'کد ملی', 'gravity-presentation-profiles' ) . '</span><span class="gpp-inbox-card__national-id">' . esc_html( null === $national_display ? '—' : $national_display ) . '</span></span>';
        $html .= '</div>';
        $html .= '<dl class="gpp-inbox-card__details">';
        $html .= self::detailMarkup( 'پایه / گروه', $grade_group, 'gpp-inbox-card__grade-group' );
        $html .= self::detailMarkup( 'مدرسه', $school, 'gpp-inbox-card__school' );
        $html .= self::detailMarkup( 'مرحله جاری', $step, 'gpp-inbox-card__step' );
        $html .= self::detailMarkup( 'تاریخ ثبت', $created_display, 'gpp-inbox-card__created-at' );
        if ( null !== $due_display ) {
            $due_class = 'gpp-inbox-card__due' . ( $is_overdue ? ' gpp-inbox-card__due--overdue' : '' );
            $html .= self::detailMarkup( 'سررسید', $due_display, $due_class );
        }
        $html .= '</dl>';
        $html .= '<span class="gpp-inbox-card__open">' . esc_html__( 'باز کردن پرونده', 'gravity-presentation-profiles' ) . '</span>';
        $html .= '</article>';

        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'INBOX_PRESENTATION_OUTPUT',
            RuntimeDecisionTrace::RESULT_PASS
        );
        return $html;
    }

    private static function unreadyOutput( $reason ) {
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'INBOX_BINDING_READINESS',
            RuntimeDecisionTrace::RESULT_FAIL,
            $reason,
            'native_gravity_flow_inbox'
        );
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'INBOX_PRESENTATION_OUTPUT',
            RuntimeDecisionTrace::RESULT_SKIP,
            'presentation_not_ready',
            'native_gravity_flow_inbox'
        );
        return self::readinessMarker( false );
    }

    private static function requiredSourcesStillAvailable( InboxPresentationModel $model, $entry ) {
        foreach ( $model->requiredSourceSemanticSlotKeys() as $slot_key ) {
            $resolved = $model->resolve( $entry, $slot_key );
            if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
                return array( 'ready' => false, 'reason' => isset( $resolved['reason'] ) ? $resolved['reason'] : 'required_source_unresolved' );
            }
            if ( ! self::sourceStillExists( $resolved['source_ref'], $entry ) ) {
                return array( 'ready' => false, 'reason' => 'source_configuration_stale' );
            }
        }
        return array( 'ready' => true, 'reason' => null );
    }

    private static function derivedFullName( InboxPresentationModel $model, $entry ) {
        $decision = $model->derivedDecision( $entry, 'student.full_name' );
        if ( empty( $decision['ready'] ) || empty( $decision['component_source_refs'] ) ) {
            return array( 'ready' => false, 'reason' => isset( $decision['reason'] ) ? $decision['reason'] : 'derivation_component_unresolved', 'value' => null );
        }

        $parts = array();
        foreach ( array( 'student.first_name', 'student.last_name' ) as $component ) {
            if ( empty( $decision['component_source_refs'][ $component ] ) ) {
                return array( 'ready' => false, 'reason' => 'derivation_component_unresolved', 'value' => null );
            }
            $value = self::readSourceValue( $decision['component_source_refs'][ $component ], $entry );
            $value = self::presentText( is_scalar( $value ) ? $value : null );
            if ( null === $value || '' === $value ) {
                return array( 'ready' => false, 'reason' => 'derivation_component_value_missing', 'value' => null );
            }
            $parts[] = $value;
        }

        return array( 'ready' => true, 'reason' => null, 'value' => implode( ' ', $parts ) );
    }

    private static function readinessMarker( $ready ) {
        $state = $ready ? 'ready' : 'unready';
        return '<span hidden class="gpp-inbox-card__readiness gpp-inbox-card__readiness--' . $state . '" data-gpp-readiness="' . $state . '" aria-hidden="true"></span>';
    }

    private static function slotValue( InboxPresentationModel $model, $entry, $slot ) {
        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return null;
        }

        $value = self::readSourceValue( $resolved['source_ref'], $entry );

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
                return array_key_exists( $key, $entry ) ? $entry[ $key ] : null;

            case 'gravity_forms.entry_meta':
                if ( ! isset( $source['meta_key'] ) || 'date_created' !== $source['meta_key'] ) {
                    return null;
                }
                // date_created is Gravity Forms Entry metadata carried on the
                // authoritative Entry object; never replace it with page time.
                return array_key_exists( 'date_created', $entry ) ? $entry['date_created'] : null;

            case 'gravity_flow.state':
                if ( ! isset( $source['state_key'] ) || 'current_step' !== $source['state_key'] || ! class_exists( 'Gravity_Flow_API' ) ) {
                    return null;
                }
                $api = new \Gravity_Flow_API( (int) $entry['form_id'] );
                $step = $api->get_current_step( $entry );
                return $step ? (string) $step->get_name() : null;
        }

        return null;
    }

    private static function sourceStillExists( $source, $entry ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) ) {
            return false;
        }

        if ( 'gravity_forms.field' === $source['type'] ) {
            if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_form' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
                return false;
            }
            $form_id = (int) $entry['form_id'];
            if ( ! array_key_exists( $form_id, self::$form_cache ) ) {
                self::$form_cache[ $form_id ] = \GFAPI::get_form( $form_id );
            }
            $form = self::$form_cache[ $form_id ];
            if ( ! is_array( $form ) ) {
                return false;
            }
            $field_id = isset( $source['field_id'] ) ? $source['field_id'] : null;
            $field = \GFAPI::get_field( $form, $field_id );
            if ( is_object( $field ) ) {
                return true;
            }
            if ( is_string( $field_id ) && false !== strpos( $field_id, '.' ) ) {
                $parent_id = strstr( $field_id, '.', true );
                return is_object( \GFAPI::get_field( $form, $parent_id ) );
            }
            return false;
        }

        if ( 'gravity_forms.entry_meta' === $source['type'] ) {
            return isset( $source['meta_key'] ) && 'date_created' === $source['meta_key'];
        }

        return 'gravity_flow.state' === $source['type']
            && isset( $source['state_key'] )
            && 'current_step' === $source['state_key']
            && class_exists( 'Gravity_Flow_API' )
            && method_exists( 'Gravity_Flow_API', 'get_current_step' );
    }

    private static function presentText( $value ) {
        if ( null === $value ) {
            return null;
        }
        $value = trim( wp_strip_all_tags( (string) $value ) );
        return '' === $value ? null : $value;
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
