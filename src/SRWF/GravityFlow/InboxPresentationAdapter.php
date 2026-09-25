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
    const NATIVE_BLOCK = 'gravityflow/inbox';
    const CARD_MODE_ROW_BUFFER = 80;

    private static $model_loaded = false;
    private static $model = null;
    private static $form_cache = array();
    private static $presentation_resolver = null;
    private static $surface_reached = false;

    public static function register() {
        if ( ! function_exists( 'add_filter' ) || ! function_exists( 'add_action' ) ) {
            return;
        }

        // These are the exact Gravity Flow 3.1.0 Inbox extension seams admitted
        // by the runtime lab. Layout remains CSS-only; no grid/query API is owned.
        add_filter( 'gravityflow_columns_inbox_table', array( __CLASS__, 'filterColumns' ), 100, 2 );
        add_filter( 'gravityflow_inbox_field_value', array( __CLASS__, 'filterValue' ), 100, 4 );
        add_filter( 'gravityflow_shortcode_inbox', array( __CLASS__, 'filterShortcodeInbox' ), 20, 3 );
        add_filter( 'render_block', array( __CLASS__, 'filterFrontendBlock' ), 20, 2 );

        // Gravity Flow 3.1.0 builds native Inbox grid_options on this shared
        // config seam at priority 10. Adjust only already-admitted native Inbox
        // grids after the host has built them and before AG Grid construction.
        add_filter( 'gravityflow_js_config_shared', array( __CLASS__, 'filterSharedJsConfig' ), 99, 1 );

        // Styles must enter the normal WordPress head lifecycle so the admitted
        // PR66 host-width cascade remains deterministic. Reachability is resolved
        // independently inside enqueueStyles(); profile activation is not enough.
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
        self::$form_cache = array();
        self::$presentation_resolver = null;
        self::$surface_reached = false;
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

    /**
     * Keep native AG Grid materialization aligned with the admitted intrinsic
     * Card Mode flow without taking ownership of grid state or lifecycle.
     */
    public static function filterSharedJsConfig( $config ) {
        if ( ! is_array( $config ) || ! self::currentRequestReachesInbox() || null === self::model() ) {
            return $config;
        }
        if ( empty( $config['grids'] ) || ! is_array( $config['grids'] ) ) {
            return $config;
        }

        foreach ( $config['grids'] as $grid_id => $grid_config ) {
            if ( ! self::isNativeInboxGridConfig( $grid_config ) ) {
                continue;
            }
            $config['grids'][ $grid_id ]['grid_options']['rowBuffer'] = self::CARD_MODE_ROW_BUFFER;
        }

        return $config;
    }

    private static function isNativeInboxGridConfig( $grid_config ) {
        if ( ! is_array( $grid_config ) || ! isset( $grid_config['grid_options'] ) || ! is_array( $grid_config['grid_options'] ) ) {
            return false;
        }

        $options = $grid_config['grid_options'];
        foreach ( array( 'columnDefs', 'rowData', 'pagination', 'paginationPageSize', 'searchArgs' ) as $required_key ) {
            if ( ! array_key_exists( $required_key, $options ) ) {
                return false;
            }
        }

        return is_array( $options['columnDefs'] )
            && is_array( $options['rowData'] )
            && true === $options['pagination']
            && is_int( $options['paginationPageSize'] )
            && is_array( $options['searchArgs'] );
    }

    /**
     * Adds the Full Width page composition only around the authentic frontend
     * Gravity Flow Inbox shortcode output. Entry Detail and lookalike markup are
     * deliberately left untouched.
     */
    public static function filterShortcodeInbox( $html, $atts, $content ) {
        unset( $atts, $content );

        if ( ! is_string( $html ) ) {
            return $html;
        }
        if ( false === strpos( $html, 'gflow-inbox gflow-grid gflow-common' ) || false === strpos( $html, 'data-js="gflow-inbox"' ) ) {
            return $html;
        }

        // Pre-head renders still use the normal enqueue lifecycle. A render
        // after head printing needs its own bounded delivery path.
        self::$surface_reached = true;

        if ( null === self::model() ) {
            return $html;
        }
        if ( false !== strpos( $html, 'data-gpp-inbox-surface="gravity_flow.inbox"' ) ) {
            return self::prependLateStyles( $html );
        }

        $title = esc_html__( 'کارهای من', 'gravity-presentation-profiles' );
        $helper = esc_html__( 'پرونده‌هایی که اکنون نیاز به اقدام شما دارند در این صفحه نمایش داده می‌شوند. برای شروع، یکی از پرونده‌های زیر را باز کنید.', 'gravity-presentation-profiles' );

        return self::prependLateStyles( '<section class="gpp-inbox-surface gpp-inbox-surface--full-width" data-gpp-inbox-surface="gravity_flow.inbox" dir="rtl" aria-labelledby="gpp-inbox-title">'
            . '<div class="gpp-inbox-surface__inner">'
            . '<header class="gpp-inbox-surface__header">'
            . '<h1 class="gpp-inbox-surface__title" id="gpp-inbox-title">' . $title . '</h1>'
            . '<p class="gpp-inbox-surface__helper">' . $helper . '</p>'
            . '</header>'
            . '<div class="gpp-inbox-surface__host">' . $html . '</div>'
            . '</div>'
            . '</section>' );
    }

    /**
     * Gravity Flow 3.1.0 also registers its native Inbox block. Post-content
     * prequalification normally enqueues the styles in the head. This exact
     * render identity can establish reachability during block-theme pre-render;
     * arbitrary DOM lookalikes and unrelated blocks never qualify it.
     */
    public static function filterFrontendBlock( $block_content, $block ) {
        if ( ! is_string( $block_content ) || ! is_array( $block ) ) {
            return $block_content;
        }
        if ( self::NATIVE_BLOCK !== ( isset( $block['blockName'] ) ? $block['blockName'] : null ) || ! self::nativeInboxBlockRegistered() ) {
            return $block_content;
        }
        if ( false === strpos( $block_content, 'gflow-inbox' ) || false === strpos( $block_content, 'data-js="gflow-inbox"' ) ) {
            return $block_content;
        }

        self::$surface_reached = true;
        return null === self::model() ? $block_content : self::prependLateStyles( $block_content );
    }

    /** Print only the Inbox handles still pending after frontend head styles. */
    private static function prependLateStyles( $content ) {
        if ( ! function_exists( 'is_admin' ) || is_admin() || ! function_exists( 'did_action' ) || ! did_action( 'wp_print_styles' )
            || ! function_exists( 'wp_style_is' ) || ! function_exists( 'wp_print_styles' ) ) {
            return $content;
        }

        $pending = array();
        foreach ( array( self::STYLE_HANDLE, self::NATIVE_STYLE_HANDLE ) as $handle ) {
            if ( ! wp_style_is( $handle, 'done' ) ) {
                $pending[] = $handle;
            }
        }
        if ( ! $pending ) {
            return $content;
        }

        // enqueueStyles owns URLs, content versions and host dependencies for
        // both early and late delivery. WordPress resolves and marks printed
        // handles as done, including dependencies, so later renders stay quiet.
        self::enqueueStyles();
        ob_start();
        wp_print_styles( $pending );
        $styles = ob_get_clean();
        return $styles . $content;
    }

    public static function enqueueStyles() {
        if ( ! self::currentRequestReachesInbox() || null === self::model() || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
            return;
        }

        $presentation_path = 'assets/css/srwf-gravity-flow-inbox.css';
        $native_path = 'assets/css/srwf-gravity-flow-inbox-native.css';
        $plugin_root = dirname( GPP_PLUGIN_FILE );
        $presentation_dependencies = array();

        // WordPress 6.8.3 exposes block-theme layout rules through the enqueued
        // global-styles handle. Preserve host ownership by making that active
        // host cascade an explicit predecessor of the admitted Inbox stylesheet.
        if ( function_exists( 'wp_style_is' ) && wp_style_is( 'global-styles', 'enqueued' ) ) {
            $presentation_dependencies[] = 'global-styles';
        }

        // WordPress 7.1 registers the public Design System token stylesheet as
        // wp-theme. Older supported runtimes simply use GPP's bounded fallbacks.
        if ( function_exists( 'wp_style_is' ) && wp_style_is( 'wp-theme', 'registered' ) ) {
            wp_enqueue_style( 'wp-theme' );
            $presentation_dependencies[] = 'wp-theme';
        }

        wp_enqueue_style(
            self::STYLE_HANDLE,
            plugins_url( $presentation_path, GPP_PLUGIN_FILE ),
            $presentation_dependencies,
            self::assetVersion( $plugin_root . '/' . $presentation_path )
        );
        wp_enqueue_style(
            self::NATIVE_STYLE_HANDLE,
            plugins_url( $native_path, GPP_PLUGIN_FILE ),
            array( self::STYLE_HANDLE ),
            self::assetVersion( $plugin_root . '/' . $native_path )
        );
    }

    private static function currentRequestReachesInbox() {
        if ( self::$surface_reached ) {
            return true;
        }

        if ( self::isNativeInboxListRequest() || self::isFrontendInboxRequest() ) {
            self::$surface_reached = true;
            return true;
        }

        return false;
    }

    private static function isNativeInboxListRequest() {
        if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
            return false;
        }

        $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        $view = isset( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';

        return 'gravityflow-inbox' === $page && '' === $view;
    }

    private static function isFrontendInboxRequest() {
        if ( ! function_exists( 'is_admin' ) || is_admin() || ! function_exists( 'is_singular' ) || ! is_singular() || ! function_exists( 'get_queried_object' ) ) {
            return false;
        }

        $object = get_queried_object();
        if ( ! is_object( $object ) || ! isset( $object->post_content ) || ! is_string( $object->post_content ) ) {
            return false;
        }

        $content = $object->post_content;
        return self::contentHasInboxShortcode( $content ) || self::contentHasInboxBlock( $content );
    }

    private static function contentHasInboxShortcode( $content ) {
        if ( ! is_string( $content ) || '' === $content || ! function_exists( 'shortcode_exists' ) || ! shortcode_exists( 'gravityflow' )
            || ! function_exists( 'get_shortcode_regex' ) || ! function_exists( 'shortcode_parse_atts' ) || ! function_exists( 'wp_html_split' ) ) {
            return false;
        }

        $tokens = wp_html_split( $content );
        if ( ! is_array( $tokens ) ) {
            return false;
        }

        $pattern = get_shortcode_regex( array( 'gravityflow' ) );
        if ( ! is_string( $pattern ) || '' === $pattern ) {
            return false;
        }

        foreach ( $tokens as $token ) {
            if ( ! is_string( $token ) || '' === $token ) {
                continue;
            }

            // Match WordPress shortcode execution semantics: HTML comments and
            // CDATA are inert even when their raw text looks like a shortcode.
            if ( '<' === $token[0] && ( 0 === strpos( $token, '<!--' ) || 0 === strpos( $token, '<![CDATA[' ) ) ) {
                continue;
            }

            $match_count = preg_match_all( '/' . $pattern . '/s', $token, $matches, PREG_SET_ORDER );
            if ( false === $match_count || 0 === $match_count ) {
                continue;
            }

            foreach ( $matches as $match ) {
                if ( ! isset( $match[1], $match[2], $match[3], $match[6] ) || 'gravityflow' !== $match[2] ) {
                    continue;
                }
                if ( '[' === $match[1] && ']' === $match[6] ) {
                    continue;
                }

                $atts = shortcode_parse_atts( $match[3] );
                if ( is_array( $atts ) && isset( $atts['page'] ) && 'inbox' === sanitize_key( (string) $atts['page'] ) ) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function contentHasInboxBlock( $content ) {
        if ( ! is_string( $content ) || '' === $content || ! function_exists( 'has_block' ) || ! self::nativeInboxBlockRegistered() ) {
            return false;
        }

        return has_block( self::NATIVE_BLOCK, $content );
    }

    private static function nativeInboxBlockRegistered() {
        if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
            return false;
        }

        $registry = \WP_Block_Type_Registry::get_instance();
        return is_object( $registry ) && method_exists( $registry, 'is_registered' ) && $registry->is_registered( self::NATIVE_BLOCK );
    }

    private static function assetVersion( $absolute_path ) {
        if ( ! is_string( $absolute_path ) || '' === $absolute_path || ! is_file( $absolute_path ) || ! is_readable( $absolute_path ) ) {
            return false;
        }

        if ( function_exists( 'hash_file' ) ) {
            $hash = hash_file( 'sha256', $absolute_path );
            if ( is_string( $hash ) && '' !== $hash ) {
                return substr( $hash, 0, 16 );
            }
        }

        $modified = filemtime( $absolute_path );
        return false === $modified ? false : (string) $modified;
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
        $national_id = self::slotPresentation( $model, $entry, 'student.national_id' );
        $photo = self::slotPhoto( $model, $entry, 'student.photo' );
        $grade_group = self::slotPresentation( $model, $entry, 'education.grade_group' );
        $step = self::slotValue( $model, $entry, 'workflow.current_step' );
        $created = self::slotValue( $model, $entry, 'entry.created_at' );
        $school = self::slotPresentation( $model, $entry, 'school.name' );
        $due = self::slotValue( $model, $entry, 'workflow.due_at' );
        $name_display = self::presentText( $name );
        $national_display = null === $national_id['display_text'] ? null : PersianDateFormatter::persianDigits( $national_id['display_text'] );
        $created_display = null === $created ? null : PersianDateFormatter::formatDateTime( $created );
        $due_display = null === $due ? null : PersianDateFormatter::formatDateTime( $due );
        $due_timestamp = null === $due ? null : PersianDateFormatter::timestamp( $due );
        $is_overdue = null !== $due_timestamp && $due_timestamp < time();

        // The host-owned AG Grid quick filter still owns search. Enrich only
        // this presentation cell with safe text: human display labels first,
        // plus raw authoritative values where they are materially different.
        $search_values = array_filter(
            array(
                $name,
                $national_id['search_text'],
                $grade_group['search_text'],
                $step,
                $created,
                $school['search_text'],
                $due,
            ),
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
        $html .= self::detailMarkup( 'پایه / گروه', $grade_group['display_text'], 'gpp-inbox-card__grade-group' );
        $html .= self::detailMarkup( 'مدرسه', $school['display_text'], 'gpp-inbox-card__school' );
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

    private static function slotPresentation( InboxPresentationModel $model, $entry, $slot ) {
        $empty = array( 'raw' => null, 'display_text' => null, 'raw_search_text' => null, 'search_text' => null );
        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return $empty;
        }

        $source = $resolved['source_ref'];
        if ( 'gravity_forms.field' === $source['type'] ) {
            $form = self::formForEntry( $entry );
            if ( is_array( $form ) ) {
                return self::presentationResolver()->resolveText( $source, $form, $entry );
            }
        }

        $value = self::readSourceValue( $source, $entry );
        $text = self::presentText( is_scalar( $value ) ? $value : null );
        return array( 'raw' => $value, 'display_text' => $text, 'raw_search_text' => $text, 'search_text' => $text );
    }

    private static function slotPhoto( InboxPresentationModel $model, $entry, $slot ) {
        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return null;
        }
        $form = self::formForEntry( $entry );
        if ( ! is_array( $form ) ) {
            return null;
        }
        return self::presentationResolver()->resolvePhoto( $resolved['source_ref'], $form, $entry );
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

    private static function formForEntry( $entry ) {
        if ( ! is_array( $entry ) || empty( $entry['form_id'] ) || ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_form' ) ) {
            return null;
        }
        $form_id = (int) $entry['form_id'];
        if ( ! array_key_exists( $form_id, self::$form_cache ) ) {
            self::$form_cache[ $form_id ] = \GFAPI::get_form( $form_id );
        }
        return is_array( self::$form_cache[ $form_id ] ) ? self::$form_cache[ $form_id ] : null;
    }

    private static function presentationResolver() {
        if ( null === self::$presentation_resolver ) {
            self::$presentation_resolver = new InboxFieldPresentationResolver();
        }
        return self::$presentation_resolver;
    }

    private static function sourceStillExists( $source, $entry ) {
        if ( ! is_array( $source ) || empty( $source['type'] ) ) {
            return false;
        }

        if ( 'gravity_forms.field' === $source['type'] ) {
            if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_form' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
                return false;
            }
            $form = self::formForEntry( $entry );
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
        if ( is_array( $photo ) && 'resolved' === ( isset( $photo['status'] ) ? $photo['status'] : null ) && ! empty( $photo['url'] ) ) {
            $url = esc_url( $photo['url'] );
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
