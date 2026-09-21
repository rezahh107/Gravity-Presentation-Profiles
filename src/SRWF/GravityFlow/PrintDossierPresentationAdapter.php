<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/**
 * Presentation-only consumer of Gravity Flow 3.1.0's native Print lifecycle.
 * Entry material is emitted only from gravityflow_print_entry_footer, which the
 * pinned host reaches after its Entry Detail permission decision succeeds.
 */
final class PrintDossierPresentationAdapter {
    const SURFACE = 'print.dossier';
    const INTENT_KEY = 'gpp_presentation';
    const INTENT_VALUE = 'dossier';
    const STYLE_VERSION = '1.0.1';
    const VAZIR_STYLE_HANDLE = 'vazir-font-frontend';
    const DOSSIER_STYLE_HANDLE = 'gpp-print-dossier';
    const UTILITY_STYLE_HANDLE = 'gpp-srwf-gravity-flow-print-utility';
    const UTILITY_SCRIPT_HANDLE = 'gpp-srwf-gravity-flow-print-utility';

    private static $print_rendered = false;
    private static $last_trace = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }

        // Entry Detail has already passed the host permission gate here. The
        // generated URL is presentation intent only; the Print request will be
        // re-authorized by Gravity Flow on every request.
        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderPrintUtility' ), 15, 2 );

        // Dedicated Print-utility assets are limited to Gravity Flow Entry Detail
        // routes. If a future host route differs, the inline button fallback still
        // dispatches the unchanged native Print request without the enhancement.
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueUtilityAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueUtilityAssets' ), 20 );

        // Deliberately no gravityflow_print_entry_header callback: that hook is
        // pre-permission in Gravity Flow 3.1.0 and must never expose Entry data.
        add_action( 'gravityflow_print_entry_footer', array( __CLASS__, 'renderPrintDossier' ), 20, 2 );

        // Gravity Flow owns its isolated Print stylesheet list. Keep the font
        // provider first, then append the dossier stylesheet through the same
        // native seam so the Print document has exactly one effective GPP CSS
        // delivery path and Gravity Flow still owns document construction.
        if ( function_exists( 'add_filter' ) ) {
            add_filter( 'gravityflow_print_styles', array( __CLASS__, 'includeVazirPrintStyle' ), 20, 2 );
            add_filter( 'gravityflow_print_styles', array( __CLASS__, 'includeDossierPrintStyle' ), 30, 2 );
        }
    }

    /**
     * Bridge the existing Vazir frontend delivery handle into Gravity Flow's
     * isolated Print document without copying or regenerating font-face CSS.
     * If the host plugin or its configured frontend delivery is unavailable,
     * leave Gravity Flow's stylesheet list unchanged; target font acceptance
     * then remains unproven rather than being simulated by GPP.
     */
    public static function includeVazirPrintStyle( $styles, $entry_ids ) {
        unset( $entry_ids );

        if ( ! self::isDossierIntent() ) {
            return $styles;
        }

        if ( ! class_exists( '\\VazirFont_Loader' ) || ! method_exists( '\\VazirFont_Loader', 'get_instance' ) ) {
            return $styles;
        }

        $loader = \VazirFont_Loader::get_instance();
        if ( ! is_object( $loader ) || ! method_exists( $loader, 'enqueue_frontend_fonts' ) ) {
            return $styles;
        }

        // The Vazir plugin remains the only owner of the font files and its
        // @font-face declarations. This public method respects that plugin's
        // existing frontend enablement setting and registers/enqueues its own
        // stylesheet handle when delivery is admitted for the site.
        $loader->enqueue_frontend_fonts();

        if ( ! function_exists( 'wp_style_is' ) || ! wp_style_is( self::VAZIR_STYLE_HANDLE, 'registered' ) ) {
            return $styles;
        }

        $styles = is_array( $styles ) ? $styles : array();
        if ( ! in_array( self::VAZIR_STYLE_HANDLE, $styles, true ) ) {
            $styles[] = self::VAZIR_STYLE_HANDLE;
        }

        return $styles;
    }

    /**
     * Deliver the admitted dossier stylesheet through Gravity Flow's native
     * isolated Print stylesheet list. This is the production form of the WU-03
     * candidate seam; there is intentionally no parallel manual <link> path.
     */
    public static function includeDossierPrintStyle( $styles, $entry_ids ) {
        unset( $entry_ids );

        if ( ! self::isDossierIntent() || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_register_style' ) ) {
            return $styles;
        }

        $path = dirname( GPP_PLUGIN_FILE ) . '/assets/css/srwf-gravity-flow-print-dossier.css';
        if ( ! is_file( $path ) || ! is_readable( $path ) ) {
            return $styles;
        }

        wp_register_style(
            self::DOSSIER_STYLE_HANDLE,
            plugins_url( 'assets/css/srwf-gravity-flow-print-dossier.css', GPP_PLUGIN_FILE ),
            array(),
            self::STYLE_VERSION,
            'all'
        );

        $styles = is_array( $styles ) ? $styles : array();
        if ( ! in_array( self::DOSSIER_STYLE_HANDLE, $styles, true ) ) {
            $styles[] = self::DOSSIER_STYLE_HANDLE;
        }

        return $styles;
    }

    public static function resetRuntimeCache() {
        PrintDossierRuntime::reset();
        self::$print_rendered = false;
        self::$last_trace = null;
    }

    public static function lastDecisionTrace() {
        return self::$last_trace instanceof PrintDossierDecisionTrace
            ? self::$last_trace->events()
            : array();
    }

    /**
     * Enqueue the small progressive-enhancement bundle only on Gravity Flow
     * Entry Detail routes where the Print dossier capability itself is active.
     * The actual utility still has an inline native-dispatch fallback.
     */
    public static function enqueueUtilityAssets() {
        if ( ! self::isEntryDetailRequest() || ! self::printUtilityAssetsAvailable() || ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return;
        }

        $plugin_root = dirname( GPP_PLUGIN_FILE );
        $style_path = 'assets/css/srwf-gravity-flow-print-utility.css';
        $script_path = 'assets/js/srwf-gravity-flow-print-utility.js';

        if ( function_exists( 'wp_enqueue_style' ) ) {
            wp_enqueue_style(
                self::UTILITY_STYLE_HANDLE,
                plugins_url( $style_path, GPP_PLUGIN_FILE ),
                array(),
                self::assetVersion( $plugin_root . '/' . $style_path )
            );
        }

        if ( function_exists( 'wp_enqueue_script' ) ) {
            wp_enqueue_script(
                self::UTILITY_SCRIPT_HANDLE,
                plugins_url( $script_path, GPP_PLUGIN_FILE ),
                array(),
                self::assetVersion( $plugin_root . '/' . $script_path ),
                true
            );
        }
    }

    public static function renderPrintUtility( $form, $entry ) {
        if ( ! is_array( $form ) || ! is_array( $entry ) || empty( $entry['id'] ) || ! function_exists( 'admin_url' ) ) {
            return;
        }

        // The affordance represents the existing GPP Print vertical slice, not
        // a generic promise that printing must work. Expose it only when that
        // slice is configured for this entry context. The Print request itself
        // is still independently authorized by Gravity Flow.
        if ( ! self::printUtilityAvailable( $entry ) ) {
            return;
        }

        $url = add_query_arg(
            array(
                'action' => 'gravityflow_print_entries',
                'lid' => (int) $entry['id'],
                self::INTENT_KEY => self::INTENT_VALUE,
            ),
            admin_url( 'admin-ajax.php' )
        );

        $idle_label = esc_html__( 'چاپ پرونده', 'gravity-presentation-profiles' );
        $busy_label = esc_html__( 'در حال آماده‌سازی چاپ…', 'gravity-presentation-profiles' );

        echo '<div class="gpp-entry-print-utility" data-gpp-print-utility="dossier">';
        echo '<button type="button" class="gpp-entry-print-utility__button" data-gpp-dossier-print-button data-gpp-dossier-print-url="' . esc_url( $url ) . '"';
        echo ' data-gpp-print-idle-label="' . esc_attr( $idle_label ) . '" data-gpp-print-busy-label="' . esc_attr( $busy_label ) . '"';
        echo ' aria-label="' . esc_attr( $idle_label ) . '" aria-busy="false" aria-disabled="false"';
        echo ' onclick="var u=this.getAttribute(\'data-gpp-dossier-print-url\');if(window.gppPrintUtilityActivate){return window.gppPrintUtilityActivate(this);}if(typeof printPage===\'function\'){printPage(u);}else{window.open(u,\'_blank\',\'noopener\');}return false;">';
        echo '<span class="gpp-entry-print-utility__icon" data-gpp-print-icon aria-hidden="true">';
        echo '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z"/><path d="M17 11h.01"/></svg>';
        echo '</span>';
        echo '<span class="gpp-entry-print-utility__spinner" data-gpp-print-spinner aria-hidden="true" hidden></span>';
        echo '<span class="gpp-entry-print-utility__label" data-gpp-print-label aria-hidden="true">' . $idle_label . '</span>';
        echo '</button>';
        echo '<span class="gpp-entry-print-utility__status" data-gpp-print-status role="status" aria-live="polite" aria-atomic="true"></span>';
        echo '</div>';
    }

    private static function printUtilityAvailable( $entry ) {
        return PrintDossierRuntime::utilityAvailable( $entry );
    }

    private static function printUtilityAssetsAvailable() {
        $resolution = self::modelResolution();
        if ( ! is_array( $resolution ) || empty( $resolution['model'] ) ) {
            return false;
        }

        $assets = PrintDossierAssets::integrity();
        return ! empty( $assets['ready'] );
    }

    private static function isEntryDetailRequest() {
        $view = isset( $_GET['view'] ) && is_string( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';
        $lid = isset( $_GET['lid'] ) ? absint( wp_unslash( $_GET['lid'] ) ) : 0;

        if ( 'entry' !== $view || $lid < 1 ) {
            return false;
        }

        if ( function_exists( 'is_admin' ) && is_admin() ) {
            $page = isset( $_GET['page'] ) && is_string( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
            return 'gravityflow-inbox' === $page;
        }

        return true;
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

        return false;
    }

    public static function renderPrintDossier( $form, $entry ) {
        if ( ! self::isDossierIntent() || self::$print_rendered ) {
            return;
        }
        self::$print_rendered = true;

        $trace = new PrintDossierDecisionTrace();
        self::$last_trace = $trace;
        $trace->record( 'PRINT_DOSSIER_REQUEST', 'intent_admitted' );
        $trace->record( 'HOST_PRINT_CONTEXT_ADMITTED', 'post_permission_seam_reached' );

        $entry_ids = self::requestedEntryIds();
        if ( 1 !== count( $entry_ids ) ) {
            $trace->record( 'PRINT_DOSSIER_REQUEST', 'unsupported_request_cardinality' );
            self::renderFailure( 'unsupported_request_cardinality', $trace );
            return;
        }

        if ( ! is_array( $form ) || ! is_array( $entry ) || empty( $entry['id'] ) || (int) $entry_ids[0] !== (int) $entry['id'] ) {
            $trace->record( 'PRINT_COMPOSITION_READY', 'composition_not_safe' );
            self::renderFailure( 'composition_not_safe', $trace );
            return;
        }

        $resolution = self::modelResolution();
        $model      = $resolution['model'];
        if ( null === $model ) {
            $trace->record( 'PRINT_PROFILE_RESOLVED', $resolution['reason'] );
            self::renderFailure( $resolution['reason'], $trace );
            return;
        }
        $trace->record( 'PRINT_PROFILE_RESOLVED', 'profile_resolved' );

        $context_status = $model->bindingContextStatus( $entry );
        if ( 'ready' !== $context_status ) {
            $reason = in_array( $context_status, array( 'binding_context_missing', 'binding_context_ambiguous' ), true )
                ? $context_status
                : 'composition_not_safe';
            $trace->record( 'PRINT_BINDINGS_EVALUATED', $reason );
            self::renderFailure( $reason, $trace );
            return;
        }

        $assets = PrintDossierAssets::integrity();
        if ( empty( $assets['ready'] ) ) {
            $trace->record( 'PRINT_COMPOSITION_READY', $assets['reason'] );
            self::renderFailure( $assets['reason'], $trace );
            return;
        }

        $resolved = ( new PrintDossierValueResolver( $model ) )->resolve( $form, $entry, $trace );
        $values   = $resolved['values'];
        $options  = $resolved['options'];
        $trace->record( 'PRINT_BINDINGS_EVALUATED', 'bindings_evaluated' );

        if ( ! self::valuesFitContract( $values ) ) {
            $trace->record( 'PRINT_COMPOSITION_READY', 'composition_not_safe' );
            self::renderFailure( 'composition_not_safe', $trace );
            return;
        }

        ( new PrintDossierRenderer() )->render( $model, $values, $options );
        $trace->record( 'PRINT_COMPOSITION_READY', 'ready_two_pages' );
        self::renderTrace( $trace );
        self::emitTrace( $trace );
    }

    private static function isDossierIntent() {
        if ( ! isset( $_GET[ self::INTENT_KEY ], $_REQUEST['action'] ) || ! is_string( $_GET[ self::INTENT_KEY ] ) || ! is_string( $_REQUEST['action'] ) ) {
            return false;
        }

        return 'gravityflow_print_entries' === sanitize_key( wp_unslash( $_REQUEST['action'] ) )
            && self::INTENT_VALUE === sanitize_key( wp_unslash( $_GET[ self::INTENT_KEY ] ) );
    }

    private static function requestedEntryIds() {
        if ( ! isset( $_GET['lid'] ) || ! is_string( $_GET['lid'] ) ) {
            return array();
        }

        $raw = trim( wp_unslash( $_GET['lid'] ) );
        if ( '' === $raw || 1 !== preg_match( '/^[1-9][0-9]*(?:,[1-9][0-9]*)*$/', $raw ) ) {
            return array();
        }

        return array_values( array_unique( array_map( 'intval', explode( ',', $raw ) ) ) );
    }

    private static function valuesFitContract( $values ) {
        $limits = array(
            'student.full_name' => 90,
            'student.father_name' => 60,
            'education.grade_group' => 90,
            'school.name' => 140,
            'finance.discount_title' => 100,
            'print.referrer' => 80,
        );

        foreach ( $values as $slot => $value ) {
            if ( '' === $value ) {
                continue;
            }
            $limit = isset( $limits[ $slot ] ) ? $limits[ $slot ] : 48;
            $length = function_exists( 'mb_strlen' ) ? mb_strlen( $value, 'UTF-8' ) : strlen( $value );
            if ( $length > $limit ) {
                return false;
            }
        }
        return true;
    }

    private static function renderFailure( $reason, PrintDossierDecisionTrace $trace ) {
        echo '<main class="gpp-print-dossier gpp-print-dossier--failure" dir="rtl" data-gpp-print-state="failure" data-gpp-print-failure="' . esc_attr( $reason ) . '">';
        echo '<h1>' . esc_html__( 'چاپ پرونده آماده نیست', 'gravity-presentation-profiles' ) . '</h1>';
        echo '<p>' . esc_html__( 'برای جلوگیری از چاپ ناقص یا نادرست، پرونده در این درخواست تولید نشد.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<code>' . esc_html( $reason ) . '</code></main>';
        self::renderTrace( $trace );
        self::emitTrace( $trace );
    }

    private static function renderTrace( PrintDossierDecisionTrace $trace ) {
        echo '<script type="application/json" class="gpp-print-decision-trace">' . $trace->json() . '</script>';
    }

    private static function emitTrace( PrintDossierDecisionTrace $trace ) {
        if ( function_exists( 'do_action' ) ) {
            do_action( 'gpp_print_dossier_decision_trace', $trace->events() );
        }
    }

    /**
     * Shared internal Print runtime authority. Entry Detail consumes the same
     * model/context/assets capability without reconstructing it.
     */
    private static function modelResolution() {
        return PrintDossierRuntime::modelResolution();
    }

}
