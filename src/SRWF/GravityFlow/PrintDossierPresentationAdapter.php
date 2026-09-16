<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\ContractViolation;

/**
 * Presentation-only consumer of Gravity Flow 3.1.0's native Print lifecycle.
 * Entry material is emitted only from gravityflow_print_entry_footer, which the
 * pinned host reaches after its Entry Detail permission decision succeeds.
 */
final class PrintDossierPresentationAdapter {
    const SURFACE = 'print.dossier';
    const INTENT_KEY = 'gpp_presentation';
    const INTENT_VALUE = 'dossier';
    const STYLE_VERSION = '1.0.0';

    private static $model_loaded = false;
    private static $model_resolution = null;
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
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model_resolution = null;
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
     * Resolved Print model plus, on failure, the specific reason.
     *
     * The distinct setup failures below have materially different operator
     * remedies, so they are never collapsed into one public meaning.
     *
     * @return array{model: ?PrintDossierPresentationModel, reason: ?string}
     */
    private static function modelResolution() {
        if ( self::$model_loaded ) {
            return self::$model_resolution;
        }

        self::$model_loaded     = true;
        self::$model_resolution = self::resolveModel();

        return self::$model_resolution;
    }

    private static function resolveModel() {
        try {
            $visual     = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $activation = $visual->resolve( self::SURFACE );
            if ( null === $activation ) {
                return self::unresolvedModel( 'print_surface_not_activated' );
            }

            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $package ) {
                return self::unresolvedModel( 'activated_package_unresolved' );
            }

            $profile = $visual->effectiveProfile( self::SURFACE );
            if ( null === $profile ) {
                return self::unresolvedModel( 'semantic_package_unusable' );
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );

            return array(
                'model' => new PrintDossierPresentationModel(
                    $profile,
                    self::activeBindingSets( $bindings->snapshot() ),
                    $package['semantic_slots']
                ),
                'reason' => null,
            );
        } catch ( ContractViolation $exception ) {
            return self::unresolvedModel( 'semantic_package_unusable', $exception );
        } catch ( LifecycleException $exception ) {
            $reason = 'activation_state_corrupt' === $exception->reasonCode()
                ? 'semantic_package_unusable'
                : 'activated_package_unresolved';

            return self::unresolvedModel( $reason, $exception );
        } catch ( \Throwable $exception ) {
            return self::unresolvedModel( 'runtime_exception', $exception );
        }
    }

    private static function unresolvedModel( $reason, \Throwable $exception = null ) {
        if ( null !== $exception ) {
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'PRINT_PROFILE_RESOLVED',
                $reason,
                'dossier_not_rendered',
                $exception
            );
        }

        return array( 'model' => null, 'reason' => $reason );
    }

    private static function activeVisualPackage( $snapshot, $activation ) {
        if ( ! is_array( $snapshot ) || ! is_array( $activation ) || ! isset( $activation['package_id'], $activation['package_version'] ) ) {
            return null;
        }
        $id = $activation['package_id'];
        $version = $activation['package_version'];
        if ( empty( $snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
            return null;
        }
        $package = $snapshot['installed'][ $id ][ $version ]['artifact'];
        return ! empty( $package['semantic_slots'] ) && is_array( $package['semantic_slots'] ) ? $package : null;
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
