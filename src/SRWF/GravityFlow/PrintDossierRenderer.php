<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

final class PrintDossierRenderer {
    public function render( PrintDossierPresentationModel $model, $values, $options ) {
        echo '<main class="gpp-print-dossier" dir="rtl" data-gpp-print-state="ready" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '">';
        $this->renderFront( $values, $options );
        $this->renderBack( $values, $options );
        echo '</main>';
    }

    private function renderFront( $v, $o ) {
        echo '<article class="gpp-print-sheet" id="gpp-print-front" data-gpp-print-page="front" aria-label="صفحهٔ ۱؛ روی پرونده (A4)">';
        echo '<header class="cardboard-header">';
        echo '<div class="front-brand-side front-brand-right"><div class="front-unlabeled front-header-blank" aria-label="کادر خالی برای تکمیل دستی"></div><img class="front-logo-slot" data-gpp-logo="razavi" src="' . esc_url( PrintDossierAssets::razaviUrl() ) . '" alt="نشان مجتمع فرهنگی آموزشی رضوی" /></div>';
        echo '<div class="front-brand-center"><h2>مجتمع فرهنگی آموزشی رضوی</h2><p>نمایندگی بنیاد علمی آموزشی (قلم‌چی)</p></div>';
        echo '<div class="front-brand-side front-brand-left"><img class="front-logo-slot" data-gpp-logo="kanoon" src="' . esc_url( PrintDossierAssets::kanoonUrl() ) . '" alt="نشان کانون فرهنگی آموزش" /></div>';
        echo '</header>';

        echo '<div class="front-identifiers">';
        $this->frontField( 'شمارنده:', $v['registration.counter'], true );
        $this->frontField( 'کد ملی:', $v['student.national_id'], true );
        echo '</div>';

        echo '<section class="cardboard-candidate"><h2>مشخصات داوطلب</h2><div class="front-candidate-body">';
        echo '<div class="front-name-row">';
        $this->frontLine( 'نام و نام خانوادگی:', $v['student.full_name'] );
        $this->frontLine( 'نام پدر:', $v['student.father_name'] );
        echo '</div>';

        echo '<div class="front-study-admin"><div class="front-study">';
        echo '<div class="front-line front-education-combined"><span class="front-edu-label">رشته و پایهٔ تحصیلی:</span><span class="front-blank front-grade-slot">' . $this->value( $v['education.grade_group'] ) . '</span><span class="front-year-label">سال:</span><span class="front-year-blanks"><i>' . $this->value( $v['print.academic_year_start'], true ) . '</i><span>—</span><i>' . $this->value( $v['print.academic_year_end'], true ) . '</i></span></div>';
        $this->choices( 'جنسیت:', array( 'زن' => $o['female'], 'مرد' => $o['male'] ) );
        echo '</div><div class="front-registration-boxes"><div><span>ثبت مالی:</span><div class="front-manual-box" data-gpp-manual="financial-registration"></div></div><div><span>ثبت آمار:</span><div class="front-manual-box" data-gpp-manual="statistics-registration"></div></div></div></div>';

        $this->choices( 'نوع ثبت‌نام:', array( 'عادی' => $o['reg_normal'], 'مدرسه‌ای' => $o['reg_school'], 'بنیاد شهید' => $o['reg_shaheed'], 'کمیته' => $o['reg_komite'], 'بهزیستی' => $o['reg_behzisti'], 'بنیاد مسکن' => $o['reg_maskan'] ) );
        $this->choices( 'زمان ثبت‌نام:', array( 'زودهنگام' => $o['time_early'], 'ادامهٔ آزمون' => $o['time_continue'] ) );

        echo '<div class="front-school-row">';
        $this->frontLine( 'نام مدرسهٔ جاری:', $v['school.name'] );
        $this->choice( 'فارغ‌التحصیل', $o['graduated'] );
        echo '</div>';

        echo '<div class="front-office-row">';
        $this->choices( 'محل ثبت‌نام:', array( 'دفتر مرکزی' => $o['loc_central'], 'دفتر گلستان' => $o['loc_golestan'], 'دفتر صدرا' => $o['loc_sadra'] ) );
        $this->frontLine( 'دفاتر اقماری؛ شهرستان:', $v['print.sub_office'] );
        echo '</div>';

        echo '<div class="front-review-row"><div class="front-review-data">';
        $this->frontLine( 'تاریخ اولین آزمون:', $v['print.first_exam_date'], true );
        $this->choices( 'نحوهٔ پرداخت:', array( 'نقد' => $o['pay_cash'], 'اقساط' => $o['pay_installment'] ) );
        echo '</div><div class="front-stamp-space" data-gpp-manual="front-stamp-signature"><span>محل مهر و امضا</span></div></div>';

        echo '<div class="front-contact-row"><div class="front-contact-fields">';
        $this->frontLine( 'تلفن همراه ۱:', $v['student.mobile'], true );
        $this->frontLine( 'تلفن همراه ۲:', $v['print.phone_2'], true );
        echo '</div><div class="front-unlabeled front-bottom-blank" data-gpp-manual="front-bottom"></div></div>';
        echo '</div></section>';
        echo '<footer class="paper-footer"><span>فیلدهای دارای بایندینگ اثبات‌شده چاپ می‌شوند و سایر محل‌ها برای تکمیل دستی خالی می‌مانند.</span><span>روی پرونده • صفحهٔ ۱ (A4)</span></footer>';
        echo '</article>';
    }

    private function renderBack( $v, $o ) {
        $academic_year = trim( $v['print.academic_year_start'] . ( '' !== $v['print.academic_year_start'] && '' !== $v['print.academic_year_end'] ? ' — ' : '' ) . $v['print.academic_year_end'] );

        echo '<article class="gpp-print-sheet" id="gpp-print-back" data-gpp-print-page="back" aria-label="صفحهٔ ۲؛ پشت پرونده (A4)">';
        echo '<header class="paper-header"><div class="paper-org"><span>مجتمع فرهنگی آموزشی رضوی</span><strong>نمایندگی بنیاد علمی آموزشی (قلم‌چی) ـ شیراز</strong></div><img class="paper-logo-reserve" src="' . esc_url( PrintDossierAssets::kanoonUrl() ) . '" alt="نشان کانون فرهنگی آموزش" /></header>';
        echo '<div class="paper-title-row"><h2>فرم مالی</h2><span>صفحهٔ ۲ • پشت پرونده (A4)</span></div>';
        echo '<div class="paper-student-identity">';
        $this->printField( 'تاریخ:', $v['print.financial_date'], 'date-field', true );
        $this->printField( 'نام و نام خانوادگی داوطلب:', $v['student.full_name'], 'name-field' );
        $this->printField( 'نام پدر:', $v['student.father_name'], 'father-field' );
        $this->printField( 'رشته و پایهٔ تحصیلی:', $v['education.grade_group'], 'grade-field' );
        $this->printField( 'سال تحصیلی:', $academic_year, 'year-field', true );
        echo '</div>';

        echo '<table class="paper-finance"><caption class="screen-reader-text">جدول ثبت اسناد مالی داوطلب</caption><colgroup><col class="col-type"><col class="col-serial"><col class="col-date"><col class="col-account"><col class="col-bank"><col class="col-amount"></colgroup><thead><tr><th>نوع سند</th><th>شمارهٔ سریال</th><th>تاریخ</th><th>شمارهٔ حساب</th><th>نام بانک و شعبه</th><th>مبلغ به ریال</th></tr></thead><tbody>';
        for ( $i = 0; $i < 5; $i++ ) {
            echo '<tr class="gpp-print-receipt-row">';
            if ( 0 === $i ) {
                echo '<th scope="rowgroup" rowspan="5">فیش<small>(واریز نقدی)</small></th>';
            }
            echo '<td></td><td></td><td></td><td></td><td></td></tr>';
        }
        for ( $i = 0; $i < 6; $i++ ) {
            echo '<tr class="gpp-print-cheque-row">';
            if ( 0 === $i ) {
                echo '<th scope="rowgroup" rowspan="6">چک<small>(اقساط)</small></th>';
            }
            echo '<td></td><td></td><td></td><td></td><td></td></tr>';
        }
        echo '</tbody><tfoot><tr><td colspan="3">جمع مبلغ دریافتی به حروف:<div class="sum-blank">' . $this->value( $v['print.received_amount_words'] ) . '</div></td><td colspan="3">جمع مبلغ دریافتی به عدد:<div class="sum-blank">' . $this->value( $v['print.received_amount_number'], true ) . '</div></td></tr></tfoot></table>';

        echo '<div class="paper-finance-summary"><div class="paper-fields cols-3">';
        $this->printField( 'کل مبلغ شهریه به ریال:', $v['finance.tuition_amount'], '', true );
        $this->printField( 'مبلغ تخفیف به ریال:', $v['finance.discount_amount'], '', true );
        $this->printField( 'مبلغ قابل دریافت به ریال:', $v['finance.net_payable_amount'], '', true );
        echo '</div><div class="paper-fields cols-3">';
        $this->printField( 'نوع و مبلغ تخفیف:', $v['finance.discount_title'], 'wide' );
        $this->printField( 'معرف:', $v['print.referrer'] );
        echo '</div><div class="paper-inline"><span>سابقهٔ داوطلب:</span><div class="paper-choices">';
        $this->choice( 'کانونی', $o['former_kanoon'] );
        $this->choice( 'غیرکانونی', $o['former_non_kanoon'] );
        echo '</div></div><p class="paper-help">هر داوطلب فقط از یک نوع تخفیف می‌تواند استفاده کند.</p><div class="paper-fields cols-3">';
        $this->printField( 'تعداد آزمون:', $v['print.exam_count'], '', true );
        $this->printField( 'تاریخ اولین آزمون:', $v['print.first_exam_date'], 'wide', true );
        echo '</div></div>';

        echo '<div class="paper-approval-grid">';
        $this->approvalBox( '۱', 'مسئول ثبت‌نام', 'اسناد و مدارک بالا را کنترل نمودم.' );
        $this->approvalBox( '۲', 'مسئول بررسی مالی', 'اسناد مالی را کنترل نموده و صحت آن را بررسی کردم.' );
        $this->approvalBox( '۳', 'مسئول ثبت مالی', 'صحت ورود اطلاعات ثبت مالی را بررسی کردم.' );
        echo '</div>';
        echo '<section class="paper-management" data-gpp-manual="management-approval"><h3><b>۴</b>مدیریت — تأیید نهایی</h3><p>صحت اطلاعات ثبت‌نام و بررسی مالی را:</p><div class="paper-choices">';
        $this->choice( 'تأیید می‌نمایم', false );
        $this->choice( 'تأیید نمی‌نمایم', false );
        echo '</div><div class="paper-write paper-write--management"><span>امضا و مهر مدیریت</span></div></section>';
        echo '<section class="paper-section" data-gpp-manual="notes"><h3>توضیحات در صورت عدم تأیید / یادداشت‌های دستی</h3><div class="writing-lines"><div></div><div></div></div></section>';
        echo '<footer class="paper-footer"><span>مبالغ، تاریخ‌ها، تأییدها و امضاهای ناموجود برای تکمیل دستی خالی می‌مانند.</span><span>پشت پرونده • صفحهٔ ۲ (A4)</span></footer>';
        echo '</article>';
    }

    private function value( $value, $digits = false ) {
        $class = 'print-value' . ( $digits ? ' print-value-digits' : '' );
        return '<bdi class="' . $class . '" dir="' . ( $digits ? 'ltr' : 'auto' ) . '">' . esc_html( $value ) . '</bdi>';
    }

    private function frontField( $label, $value, $digits = false ) {
        echo '<div class="front-id-field"><span>' . esc_html( $label ) . '</span><span class="front-id-blank">' . $this->value( $value, $digits ) . '</span></div>';
    }

    private function frontLine( $label, $value, $digits = false ) {
        echo '<div class="front-line"><span>' . esc_html( $label ) . '</span><span class="front-blank">' . $this->value( $value, $digits ) . '</span></div>';
    }

    private function printField( $label, $value, $extra_class = '', $digits = false ) {
        $class = 'print-field' . ( '' !== $extra_class ? ' ' . $extra_class : '' );
        echo '<div class="' . esc_attr( $class ) . '"><span>' . esc_html( $label ) . '</span><span class="blank">' . $this->value( $value, $digits ) . '</span></div>';
    }

    private function choices( $label, $choices ) {
        echo '<div class="front-options"><span class="front-label">' . esc_html( $label ) . '</span><div class="paper-choices">';
        foreach ( $choices as $choice_label => $checked ) {
            $this->choice( $choice_label, $checked );
        }
        echo '</div></div>';
    }

    private function choice( $label, $checked ) {
        echo '<span class="paper-choice"><i' . ( $checked ? ' data-gpp-checked="1"' : '' ) . '>' . ( $checked ? '✓' : '' ) . '</i>' . esc_html( $label ) . '</span>';
    }

    private function approvalBox( $number, $title, $copy ) {
        echo '<section class="paper-approval" data-gpp-manual="approval-' . esc_attr( $number ) . '"><h3><b>' . esc_html( $number ) . '</b>' . esc_html( $title ) . '</h3><p>' . esc_html( $copy ) . '</p><div class="paper-choices">';
        $this->choice( 'تأیید می‌نمایم', false );
        $this->choice( 'تأیید نمی‌نمایم', false );
        echo '</div><div class="paper-write"><span>محل مهر و امضا</span></div></section>';
    }
}
