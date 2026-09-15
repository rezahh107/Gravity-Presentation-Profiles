<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

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
    private static $model = null;
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
        self::$model = null;
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

        $model = self::model();
        if ( null === $model ) {
            $trace->record( 'PRINT_PROFILE_RESOLVED', 'profile_not_active' );
            self::renderFailure( 'profile_not_active', $trace );
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

        if ( ! PrintDossierAssets::isReady() ) {
            $trace->record( 'PRINT_COMPOSITION_READY', 'required_asset_unavailable' );
            self::renderFailure( 'required_asset_unavailable', $trace );
            return;
        }

        $reader = new BoundHostValueReader();
        $values = array();
        foreach ( self::valueSlots() as $slot ) {
            $values[ $slot ] = self::readSlotText( $model, $reader, $form, $entry, $slot, $trace );
        }

        $options = array(
            'female' => self::optionChecked( $model, $reader, $form, $entry, 'student.gender', '0', $trace ),
            'male' => self::optionChecked( $model, $reader, $form, $entry, 'student.gender', '1', $trace ),
            'graduated' => self::optionChecked( $model, $reader, $form, $entry, 'education.graduation_status', '0', $trace ),
            'loc_central' => self::optionChecked( $model, $reader, $form, $entry, 'registration.center', '0', $trace ),
            'loc_golestan' => self::optionChecked( $model, $reader, $form, $entry, 'registration.center', '1', $trace ),
            'loc_sadra' => self::optionChecked( $model, $reader, $form, $entry, 'registration.center', '2', $trace ),
            'reg_normal' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_type', 'reg_normal', $trace ),
            'reg_school' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_type', 'reg_school', $trace ),
            'reg_shaheed' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_type', 'reg_shaheed', $trace ),
            'reg_komite' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_type', 'reg_komite', $trace ),
            'reg_behzisti' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_type', 'reg_behzisti', $trace ),
            'reg_maskan' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_type', 'reg_maskan', $trace ),
            'time_early' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_timing', 'time_early', $trace ),
            'time_continue' => self::optionChecked( $model, $reader, $form, $entry, 'print.registration_timing', 'time_continue', $trace ),
            'pay_cash' => self::optionChecked( $model, $reader, $form, $entry, 'print.payment_mode', 'pay_cash', $trace ),
            'pay_installment' => self::optionChecked( $model, $reader, $form, $entry, 'print.payment_mode', 'pay_installment', $trace ),
            'former_kanoon' => self::optionChecked( $model, $reader, $form, $entry, 'print.former_kanoon_status', 'kanoon', $trace ),
            'former_non_kanoon' => self::optionChecked( $model, $reader, $form, $entry, 'print.former_kanoon_status', 'non_kanoon', $trace ),
        );
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

    private static function valueSlots() {
        return array(
            'registration.counter', 'student.national_id', 'student.full_name', 'student.father_name',
            'education.grade_group', 'print.academic_year_start', 'print.academic_year_end', 'school.name',
            'print.sub_office', 'print.first_exam_date', 'student.mobile', 'print.phone_2',
            'print.financial_date', 'finance.tuition_amount', 'finance.discount_amount',
            'finance.net_payable_amount', 'finance.discount_title', 'print.received_amount_words',
            'print.received_amount_number', 'print.referrer', 'print.exam_count',
        );
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

    private static function readSlotText( PrintDossierPresentationModel $model, BoundHostValueReader $reader, $form, $entry, $slot, PrintDossierDecisionTrace $trace ) {
        $decision = $model->fieldDecision( $entry, $slot );
        if ( empty( $decision['populate'] ) ) {
            self::recordBlankReason( $trace, $decision['reason'] );
            return '';
        }

        $value = $reader->read( $decision['source_ref'], $form, $entry );
        if ( is_int( $value ) || is_float( $value ) ) {
            return (string) $value;
        }
        if ( ! is_scalar( $value ) ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
            return '';
        }

        $value = trim( wp_strip_all_tags( (string) $value ) );
        if ( '' === $value ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
        }
        return $value;
    }

    private static function optionChecked( PrintDossierPresentationModel $model, BoundHostValueReader $reader, $form, $entry, $slot, $expected, PrintDossierDecisionTrace $trace ) {
        $decision = $model->fieldDecision( $entry, $slot );
        if ( empty( $decision['populate'] ) ) {
            self::recordBlankReason( $trace, $decision['reason'] );
            return false;
        }

        $value = $reader->read( $decision['source_ref'], $form, $entry );
        if ( ! is_scalar( $value ) ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
            return false;
        }

        return (string) $value === (string) $expected;
    }

    private static function recordBlankReason( PrintDossierDecisionTrace $trace, $reason ) {
        if ( in_array( $reason, array( 'binding_context_missing', 'binding_context_ambiguous', 'print_mapping_not_proven' ), true ) ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', $reason );
            return;
        }
        $trace->record( 'PRINT_BINDINGS_EVALUATED', 'binding_not_proven' );
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

    private static function model() {
        if ( self::$model_loaded ) {
            return self::$model;
        }
        self::$model_loaded = true;

        try {
            $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $activation = $visual->resolve( self::SURFACE );
            if ( null === $activation ) {
                return null;
            }
            $profile = $visual->effectiveProfile( self::SURFACE );
            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $profile || null === $package ) {
                return null;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );
            self::$model = new PrintDossierPresentationModel(
                $profile,
                self::activeBindingSets( $bindings->snapshot() ),
                $package['semantic_slots']
            );
        } catch ( \Throwable $exception ) {
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'PRINT_PROFILE_RESOLVED',
                'runtime_exception',
                'dossier_not_rendered',
                $exception
            );
            self::$model = null;
        }

        return self::$model;
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
