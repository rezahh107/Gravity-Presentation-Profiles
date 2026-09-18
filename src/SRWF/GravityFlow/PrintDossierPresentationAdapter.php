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

        // Deliberately no gravityflow_print_entry_header callback: that hook is
        // pre-permission in Gravity Flow 3.1.0 and must never expose Entry data.
        add_action( 'gravityflow_print_entry_footer', array( __CLASS__, 'renderPrintDossier' ), 20, 2 );

        // Gravity Flow owns its isolated Print stylesheet list. Reuse Vazir's
        // public loader only for explicit dossier intent so Vazir keeps font-file
        // ownership while its already-admitted self-hosted @font-face reaches
        // the Print document through the host's documented stylesheet seam.
        if ( function_exists( 'add_filter' ) ) {
            add_filter( 'gravityflow_print_styles', array( __CLASS__, 'includeVazirPrintStyle' ), 20, 2 );
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

        if ( ! class_exists( '\VazirFont_Loader' ) || ! method_exists( '\VazirFont_Loader', 'get_instance' ) ) {
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

        echo '<div class="gpp-entry-print-utility" data-gpp-print-utility="dossier">';
        echo '<a href="javascript:;" class="button button-secondary" data-gpp-dossier-print-url="' . esc_url( $url ) . '"';
        echo ' onclick="if(typeof printPage===\'function\'){printPage(\'' . esc_js( $url ) . '\');}else{window.open(\'' . esc_js( $url ) . '\',\'_blank\',\'noopener\');}return false;">';
        echo esc_html__( 'چاپ پرونده (دو صفحهٔ A4)', 'gravity-presentation-profiles' );
        echo '</a></div>';
    }

    private static function printUtilityAvailable( $entry ) {
        return PrintDossierRuntime::utilityAvailable( $entry );
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

        self::renderStylesheetLink();
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

    private static function renderStylesheetLink() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return;
        }
        $href = plugins_url( 'assets/css/srwf-gravity-flow-print-dossier.css', GPP_PLUGIN_FILE );
        echo '<link rel="stylesheet" id="gpp-print-dossier-css" href="' . esc_url( add_query_arg( 'ver', self::STYLE_VERSION, $href ) ) . '" type="text/css" media="all" />';
    }

    private static function renderFailure( $reason, PrintDossierDecisionTrace $trace ) {
        self::renderStylesheetLink();
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
