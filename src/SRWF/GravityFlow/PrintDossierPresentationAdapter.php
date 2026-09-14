<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Presentation-only consumer of Gravity Flow 3.1.0's native Print lifecycle.
 * No Entry material is emitted before Gravity Flow reaches its post-permission
 * gravityflow_print_entry_footer seam.
 */
final class PrintDossierPresentationAdapter {
    const SURFACE = 'print.dossier';
    const INTENT_KEY = 'gpp_presentation';
    const INTENT_VALUE = 'dossier';
    const STYLE_VERSION = '1.0.0';

    private const RAZAVI_ASSET = 'assets/images/print/razavi-complex-approved.png';
    private const KANOON_ASSET = 'assets/images/print/kanoon-approved.png';
    private const RAZAVI_SHA256 = 'd9cd27599368d5f3342a8beac2b860b93275696ee6c1e5918d547201d2f8388d';
    private const KANOON_SHA256 = 'a6b17af013e8be32dd43fa3624fd6396d40e8da7baf8d2df8d3f2f974b002d2a';

    private static $model_loaded = false;
    private static $model = null;
    private static $print_rendered = false;
    private static $last_trace = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) ) {
            return;
        }

        // Entry Detail content hook is reached after Gravity Flow's permission
        // gate. This creates intent only; the fresh Print request authorizes again.
        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderPrintUtility' ), 15, 2 );

        // This is the only Print composition hook. No print-header hook is used.
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

        if ( ! self::assetsAreReady() ) {
            $trace->record( 'PRINT_COMPOSITION_READY', 'required_asset_unavailable' );
            self::renderFailure( 'required_asset_unavailable', $trace );
            return;
        }

        $reader = new BoundHostValueReader();
        $values = array();
        $slots = array(
            'registration.counter', 'student.national_id', 'student.full_name', 'student.father_name',
            'education.grade_group', 'print.academic_year_start', 'print.academic_year_end', 'school.name',
            'print.sub_office', 'print.first_exam_date', 'student.mobile', 'print.phone_2',
            'print.financial_date', 'finance.tuition_amount', 'finance.discount_amount',
            'finance.net_payable_amount', 'finance.discount_title', 'print.received_amount_words',
            'print.received_amount_number', 'print.referrer', 'print.exam_count',
        );

        foreach ( $slots as $slot ) {
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
        self::renderPages( $model, $values, $options );
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

        $ids = array_map( 'intval', explode( ',', $raw ) );
        return array_values( array_unique( $ids ) );
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
        if ( 'binding_context_missing' === $reason || 'binding_context_ambiguous' === $reason ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', $reason );
            return;
        }
        if ( 'print_mapping_not_proven' === $reason ) {
            $trace->record( 'PRINT_BINDINGS_EVALUATED', 'print_mapping_not_proven' );
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

    private static function assetsAreReady() {
        if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return false;
        }
        $base = dirname( GPP_PLUGIN_FILE ) . '/';
        $razavi = $base . self::RAZAVI_ASSET;
        $kanoon = $base . self::KANOON_ASSET;

        return is_readable( $razavi )
            && is_readable( $kanoon )
            && self::RAZAVI_SHA256 === hash_file( 'sha256', $razavi )
            && self::KANOON_SHA256 === hash_file( 'sha256', $kanoon );
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
        echo '<code>' . esc_html( $reason ) . '</code>';
        echo '</main>';
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

    private static function renderPages( PrintDossierPresentationModel $model, $v, $o ) {
        $razavi = plugins_url( self::RAZAVI_ASSET, GPP_PLUGIN_FILE );
        $kanoon = plugins_url( self::KANOON_ASSET, GPP_PLUGIN_FILE );
        $academic_year = trim( $v['print.academic_year_start'] . ( '' !== $v['print.academic_year_start'] && '' !== $v['print.academic_year_end'] ? ' — ' : '' ) . $v['print.academic_year_end'] );

        echo '<main class="gpp-print-dossier" dir="rtl" data-gpp-print-state="ready" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '">';
        echo '<article class="gpp-print-sheet" id="gpp-print-front" data-gpp-print-page="front" aria-label="صفحهٔ ۱؛ روی پرونده (A4)">';
        echo '<header class="cardboard-header">';
        echo '<div class="front-brand-side front-brand-right"><div class="front-unlabeled front-header-blank" aria-label="کادر خالی برای تکمیل دستی"></div><img class="front-logo-slot" data-gpp-logo="razavi" src="' . esc_url( $razavi ) . '" alt="نشان مجتمع فرهنگی آموزشی رضوی" /></div>';
        echo '<div class="front-brand-center"><h2>مجتمع فرهنگی آموزشی رضوی</h2><p>نمایندگی بنیاد علمی آموزشی (قلم‌چی)</p></div>';
        echo '<div class="front-brand-side front-brand-left"><img class="front-logo-slot" data-gpp-logo="kanoon" src="' . esc_url( $kanoon ) . '" alt="نشان کانون فرهنگی آموزش" /></div>';
        echo '</header>';

        echo '<div class="front-identifiers">';
        self::frontField( 'شمارنده:', $v['registration.counter'], true );
        self::frontField( 'کد ملی:', $v['student.national_id'], true );
        echo '</div>';

        echo '<section class="cardboard-candidate"><h2>مشخصات داوطلب</h2><div class="front-candidate-body">';
        echo '<div class="front-name-row">';
        self::frontLine( 'نام و نام خانوادگی:', $v['student.full_name'] );
        self::frontLine( 'نام پدر:', $v['student.father_name'] );
        echo '</div>';

        echo '<div class="front-study-admin"><div class="front-study">';
        echo '<div class="front-line front-education-combined"><span class="front-edu-label">رشته و پایهٔ تحصیلی:</span><span class="front-blank front-grade-slot">' . self::value( $v['education.grade_group'] ) . '</span><span class="front-year-label">سال:</span><span class="front-year-blanks"><i>' . self::value( $v['print.academic_year_start'], true ) . '</i><span>—</span><i>' . self::value( $v['print.academic_year_end'], true ) . '</i></span></div>';
        self::choices( 'جنسیت:', array( 'زن' => $o['female'], 'مرد' => $o['male'] ) );
        echo '</div><div class="front-registration-boxes"><div><span>ثبت مالی:</span><div class="front-manual-box" data-gpp-manual="financial-registration"></div></div><div><span>ثبت آمار:</span><div class="front-manual-box" data-gpp-manual="statistics-registration"></div></div></div></div>';

        self::choices( 'نوع ثبت‌نام:', array( 'عادی' => $o['reg_normal'], 'مدرسه‌ای' => $o['reg_school'], 'بنیاد شهید' => $o['reg_shaheed'], 'کمیته' => $o['reg_komite'], 'بهزیستی' => $o['reg_behzisti'], 'بنیاد مسکن' => $o['reg_maskan'] ) );
        self::choices( 'زمان ثبت‌نام:', array( 'زودهنگام' => $o['time_early'], 'ادامهٔ آزمون' => $o['time_continue'] ) );

        echo '<div class="front-school-row">';
        self::frontLine( 'نام مدرسهٔ جاری:', $v['school.name'] );
        self::choice( 'فارغ‌التحصیل', $o['graduated'] );
        echo '</div>';

        echo '<div class="front-office-row">';
        self::choices( 'محل ثبت‌نام:', array( 'دفتر مرکزی' => $o['loc_central'], 'دفتر گلستان' => $o['loc_golestan'], 'دفتر صدرا' => $o['loc_sadra'] ) );
        self::frontLine( 'دفاتر اقماری؛ شهرستان:', $v['print.sub_office'] );
        echo '</div>';

        echo '<div class="front-review-row"><div class="front-review-data">';
        self::frontLine( 'تاریخ اولین آزمون:', $v['print.first_exam_date'], true );
        self::choices( 'نحوهٔ پرداخت:', array( 'نقد' => $o['pay_cash'], 'اقساط' => $o['pay_installment'] ) );
        echo '</div><div class="front-stamp-space" data-gpp-manual="front-stamp-signature"><span>محل مهر و امضا</span></div></div>';

        echo '<div class="front-contact-row"><div class="front-contact-fields">';
        self::frontLine( 'تلفن همراه ۱:', $v['student.mobile'], true );
        self::frontLine( 'تلفن همراه ۲:', $v['print.phone_2'], true );
        echo '</div><div class="front-unlabeled front-bottom-blank" data-gpp-manual="front-bottom"></div></div>';
        echo '</div></section>';
        echo '<footer class="paper-footer"><span>فیلدهای دارای بایندینگ اثبات‌شده چاپ می‌شوند و سایر محل‌ها برای تکمیل دستی خالی می‌مانند.</span><span>روی پرونده • صفحهٔ ۱ (A4)</span></footer>';
        echo '</article>';

        echo '<article class="gpp-print-sheet" id="gpp-print-back" data-gpp-print-page="back" aria-label="صفحهٔ ۲؛ پشت پرونده (A4)">';
        echo '<header class="paper-header"><div class="paper-org"><span>مجتمع فرهنگی آموزشی رضوی</span><strong>نمایندگی بنیاد علمی آموزشی (قلم‌چی) ـ شیراز</strong></div><img class="paper-logo-reserve" src="' . esc_url( $kanoon ) . '" alt="نشان کانون فرهنگی آموزش" /></header>';
        echo '<div class="paper-title-row"><h2>فرم مالی</h2><span>صفحهٔ ۲ • پشت پرونده (A4)</span></div>';
        echo '<div class="paper-student-identity">';
        self::printField( 'تاریخ:', $v['print.financial_date'], 'date-field', true );
        self::printField( 'نام و نام خانوادگی داوطلب:', $v['student.full_name'], 'name-field' );
        self::printField( 'نام پدر:', $v['student.father_name'], 'father-field' );
        self::printField( 'رشته و پایهٔ تحصیلی:', $v['education.grade_group'], 'grade-field' );
        self::printField( 'سال تحصیلی:', $academic_year, 'year-field', true );
        echo '</div>';

        echo '<table class="paper-finance"><caption class="screen-reader-text">جدول ثبت اسناد مالی داوطلب</caption><colgroup><col class="col-type"><col class="col-serial"><col class="col-date"><col class="col-account"><col class="col-bank"><col class="col-amount"></colgroup><thead><tr><th>نوع سند</th><th>شمارهٔ سریال</th><th>تاریخ</th><th>شمارهٔ حساب</th><th>نام بانک و شعبه</th><th>مبلغ به ریال</th></tr></thead><tbody>';
        for ( $i = 0; $i < 5; $i++ ) {
            echo '<tr class="gpp-print-receipt-row">';
            if ( 0 === $i ) echo '<th scope="rowgroup" rowspan="5">فیش<small>(واریز نقدی)</small></th>';
            echo '<td></td><td></td><td></td><td></td><td></td></tr>';
        }
        for ( $i = 0; $i < 6; $i++ ) {
            echo '<tr class="gpp-print-cheque-row">';
            if ( 0 === $i ) echo '<th scope="rowgroup" rowspan="6">چک<small>(اقساط)</small></th>';
            echo '<td></td><td></td><td></td><td></td><td></td></tr>';
        }
        echo '</tbody><tfoot><tr><td colspan="3">جمع مبلغ دریافتی به حروف:<div class="sum-blank">' . self::value( $v['print.received_amount_words'] ) . '</div></td><td colspan="3">جمع مبلغ دریافتی به عدد:<div class="sum-blank">' . self::value( $v['print.received_amount_number'], true ) . '</div></td></tr></tfoot></table>';

        echo '<div class="paper-finance-summary"><div class="paper-fields cols-3">';
        self::printField( 'کل مبلغ شهریه به ریال:', $v['finance.tuition_amount'], '', true );
        self::printField( 'مبلغ تخفیف به ریال:', $v['finance.discount_amount'], '', true );
        self::printField( 'مبلغ قابل دریافت به ریال:', $v['finance.net_payable_amount'], '', true );
        echo '</div><div class="paper-fields cols-3">';
        self::printField( 'نوع و مبلغ تخفیف:', $v['finance.discount_title'], 'wide' );
        self::printField( 'معرف:', $v['print.referrer'] );
        echo '</div><div class="paper-inline"><span>سابقهٔ داوطلب:</span><div class="paper-choices">';
        self::choice( 'کانونی', $o['former_kanoon'] ); self::choice( 'غیرکانونی', $o['former_non_kanoon'] );
        echo '</div></div><p class="paper-help">هر داوطلب فقط از یک نوع تخفیف می‌تواند استفاده کند.</p><div class="paper-fields cols-3">';
        self::printField( 'تعداد آزمون:', $v['print.exam_count'], '', true );
        self::printField( 'تاریخ اولین آزمون:', $v['print.first_exam_date'], 'wide', true );
        echo '</div></div>';

        echo '<div class="paper-approval-grid">';
        self::approvalBox( '۱', 'مسئول ثبت‌نام', 'اسناد و مدارک بالا را کنترل نمودم.' );
        self::approvalBox( '۲', 'مسئول بررسی مالی', 'اسناد مالی را کنترل نموده و صحت آن را بررسی کردم.' );
        self::approvalBox( '۳', 'مسئول ثبت مالی', 'صحت ورود اطلاعات ثبت مالی را بررسی کردم.' );
        echo '</div>';
        echo '<section class="paper-management" data-gpp-manual="management-approval"><h3><b>۴</b>مدیریت — تأیید نهایی</h3><p>صحت اطلاعات ثبت‌نام و بررسی مالی را:</p><div class="paper-choices">';
        self::choice( 'تأیید می‌نمایم', false ); self::choice( 'تأیید نمی‌نمایم', false );
        echo '</div><div class="paper-write paper-write--management"><span>امضا و مهر مدیریت</span></div></section>';
        echo '<section class="paper-section" data-gpp-manual="notes"><h3>توضیحات در صورت عدم تأیید / یادداشت‌های دستی</h3><div class="writing-lines"><div></div><div></div></div></section>';
        echo '<footer class="paper-footer"><span>مبالغ، تاریخ‌ها، تأییدها و امضاهای ناموجود برای تکمیل دستی خالی می‌مانند.</span><span>پشت پرونده • صفحهٔ ۲ (A4)</span></footer>';
        echo '</article></main>';
    }

    private static function value( $value, $digits = false ) {
        $class = 'print-value' . ( $digits ? ' print-value-digits' : '' );
        $dir = $digits ? 'ltr' : 'auto';
        return '<bdi class="' . $class . '" dir="' . $dir . '">' . esc_html( $value ) . '</bdi>';
    }

    private static function frontField( $label, $value, $digits = false ) {
        echo '<div class="front-id-field"><span>' . esc_html( $label ) . '</span><span class="front-id-blank">' . self::value( $value, $digits ) . '</span></div>';
    }

    private static function frontLine( $label, $value, $digits = false ) {
        echo '<div class="front-line"><span>' . esc_html( $label ) . '</span><span class="front-blank">' . self::value( $value, $digits ) . '</span></div>';
    }

    private static function printField( $label, $value, $extra_class = '', $digits = false ) {
        $class = 'print-field' . ( '' !== $extra_class ? ' ' . $extra_class : '' );
        echo '<div class="' . esc_attr( $class ) . '"><span>' . esc_html( $label ) . '</span><span class="blank">' . self::value( $value, $digits ) . '</span></div>';
    }

    private static function choices( $label, $choices ) {
        echo '<div class="front-options"><span class="front-label">' . esc_html( $label ) . '</span><div class="paper-choices">';
        foreach ( $choices as $choice_label => $checked ) self::choice( $choice_label, $checked );
        echo '</div></div>';
    }

    private static function choice( $label, $checked ) {
        echo '<span class="paper-choice"><i' . ( $checked ? ' data-gpp-checked="1"' : '' ) . '>' . ( $checked ? '✓' : '' ) . '</i>' . esc_html( $label ) . '</span>';
    }

    private static function approvalBox( $number, $title, $copy ) {
        echo '<section class="paper-approval" data-gpp-manual="approval-' . esc_attr( $number ) . '"><h3><b>' . esc_html( $number ) . '</b>' . esc_html( $title ) . '</h3><p>' . esc_html( $copy ) . '</p><div class="paper-choices">';
        self::choice( 'تأیید می‌نمایم', false ); self::choice( 'تأیید نمی‌نمایم', false );
        echo '</div><div class="paper-write"><span>محل مهر و امضا</span></div></section>';
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
            if ( ! isset( $identity['binding_set_id'], $identity['binding_set_version'] ) ) continue;
            $id = $identity['binding_set_id'];
            $version = $identity['binding_set_version'];
            if ( ! isset( $snapshot['installed'][ $id ][ $version ] ) ) continue;
            $record = $snapshot['installed'][ $id ][ $version ];
            if ( ! isset( $record['context_key'], $record['artifact'] ) || $record['context_key'] !== $context_key ) continue;
            $active[] = $record['artifact'];
        }
        return $active;
    }
}
