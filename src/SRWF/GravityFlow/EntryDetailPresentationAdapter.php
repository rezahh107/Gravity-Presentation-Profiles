<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * SRWF presentation adapter for the native Gravity Flow Entry Detail surface.
 *
 * The adapter does not own entry access, editing, validation, workflow actions,
 * persistence, upload storage or history. It emits a hidden semantic projection
 * only after the native Gravity Flow permission gate has admitted the request.
 * A small controller promotes that projection only when the expected pinned
 * native regions are present; otherwise Gravity Flow remains fully native.
 */
final class EntryDetailPresentationAdapter {
    const SURFACE = 'gravity_flow.entry_detail';
    const STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail';
    const SCRIPT_HANDLE = 'gpp-srwf-gravity-flow-entry-detail';

    private static $model_loaded = false;
    private static $model = null;
    private static $active_step_id = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        // Gravity Flow 3.1.0 invokes this after its own Entry Detail permission
        // gate and before instructions/grid output. The native form stays owner.
        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderProjection' ), 20, 2 );
        add_filter( 'gravityflow_approve_label_workflow_detail', array( __CLASS__, 'filterApproveLabel' ), 100, 2 );
        add_filter( 'gravityflow_reject_label_workflow_detail', array( __CLASS__, 'filterRejectLabel' ), 100, 2 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
        self::$active_step_id = null;
    }

    public static function enqueueAssets() {
        if ( null === self::model() || ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return;
        }

        if ( function_exists( 'wp_enqueue_style' ) ) {
            wp_enqueue_style(
                self::STYLE_HANDLE,
                plugins_url( 'assets/css/srwf-gravity-flow-entry-detail.css', GPP_PLUGIN_FILE ),
                array(),
                '1.0.0'
            );
        }

        if ( function_exists( 'wp_enqueue_script' ) ) {
            wp_enqueue_script(
                self::SCRIPT_HANDLE,
                plugins_url( 'assets/js/srwf-gravity-flow-entry-detail.js', GPP_PLUGIN_FILE ),
                array(),
                '1.0.0',
                true
            );
        }
    }

    /**
     * Runs only inside the host-owned, permission-approved Entry Detail form.
     */
    public static function renderProjection( $form, $entry ) {
        self::$active_step_id = null;

        $model = self::model();
        if ( null === $model || ! is_array( $form ) || ! is_array( $entry ) ) {
            return;
        }

        if ( ! $model->isPresentationReady( $entry ) ) {
            echo self::readinessMarker( false );
            return;
        }

        $step = self::admittedRuntimeStep( $model, $form, $entry );
        if ( null === $step || ! self::requiredRuntimeValuesPresent( $model, $entry, $step ) ) {
            echo self::readinessMarker( false );
            return;
        }

        self::$active_step_id = (int) $step->get_id();

        $values = array();
        foreach ( $model->profile()['semantic_slots'] as $slot_key ) {
            $values[ $slot_key ] = self::slotValue( $model, $entry, $slot_key, $step );
        }

        $documents = self::documentsMarkup( $model, $form, $entry );

        echo self::readinessMarker( true );
        echo '<article class="gpp-entry-detail__projection" dir="rtl" data-gpp-entry-detail-projection data-gpp-readiness="ready" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '">';
        echo '<div class="gpp-entry-detail__utility" data-gpp-print-utility-slot></div>';
        echo self::identityMarkup( $values );
        echo '<section class="gpp-entry-detail__task" aria-labelledby="gpp-current-task-title">';
        echo '<h2 id="gpp-current-task-title">' . esc_html__( 'کاری که الان باید انجام دهید', 'gravity-presentation-profiles' ) . '</h2>';
        echo '<div class="gpp-entry-detail__task-instructions" data-gpp-native-instructions-slot></div>';
        echo '<div class="gpp-entry-detail__task-actions" data-gpp-native-task-actions-slot></div>';
        echo '</section>';
        echo '<div class="gpp-entry-detail__material" data-gpp-material-content>';
        echo self::studentSectionMarkup( $values );
        echo self::educationSectionMarkup( $values );
        if ( '' !== $documents ) {
            echo '<section class="gpp-entry-detail__section gpp-entry-detail__documents" aria-labelledby="gpp-documents-title">';
            echo '<h2 id="gpp-documents-title">' . esc_html__( 'مدارک', 'gravity-presentation-profiles' ) . '</h2>';
            echo $documents;
            echo '</section>';
        }
        echo self::administrativeSectionMarkup( $values );
        echo '<details class="gpp-entry-detail__history">';
        echo '<summary>' . esc_html__( 'تاریخچه پرونده', 'gravity-presentation-profiles' ) . '</summary>';
        echo '<p class="gpp-entry-detail__history-help">' . esc_html__( 'اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<div class="gpp-entry-detail__history-body" data-gpp-native-history-slot></div>';
        echo '</details>';
        echo '</div>';
        echo '</article>';
    }

    public static function filterApproveLabel( $label, $step ) {
        return self::isActiveStep( $step )
            ? __( 'تأیید پرونده', 'gravity-presentation-profiles' )
            : $label;
    }

    public static function filterRejectLabel( $label, $step ) {
        return self::isActiveStep( $step )
            ? __( 'رد پرونده', 'gravity-presentation-profiles' )
            : $label;
    }

    private static function isActiveStep( $step ) {
        return null !== self::$active_step_id
            && is_object( $step )
            && method_exists( $step, 'get_id' )
            && self::$active_step_id === (int) $step->get_id();
    }

    /**
     * This is deliberately stricter than semantic readiness. The enhanced
     * dossier is admitted only for the pinned, host-proven read-only Approval
     * case. Editable fields, Revert, admin actions, or uncertain runtime facts
     * stay native instead of being guessed or visually suppressed.
     */
    private static function admittedRuntimeStep( EntryDetailPresentationModel $model, $form, $entry ) {
        if ( ! class_exists( 'Gravity_Flow_API' ) || ! class_exists( 'Gravity_Flow_Entry_Detail' ) ) {
            return null;
        }

        $api = new \Gravity_Flow_API( (int) $entry['form_id'] );
        $step = $api->get_current_step( $entry );
        if ( ! is_object( $step ) || ! method_exists( $step, 'get_type' ) || 'approval' !== $step->get_type() ) {
            return null;
        }

        if ( ! \Gravity_Flow_Entry_Detail::can_update( $step ) ) {
            return null;
        }

        if ( ! method_exists( $step, 'get_editable_fields' ) ) {
            return null;
        }
        $editable_fields = $step->get_editable_fields();
        if ( ! is_array( $editable_fields ) || array() !== $editable_fields ) {
            // Native Entry Editor remains authoritative whenever it exposes any
            // current-step editable control.
            return null;
        }

        if ( ! empty( $step->revertEnable ) ) {
            return null;
        }

        if ( class_exists( 'GFAPI' ) && \GFAPI::current_user_can_any( 'gravityflow_workflow_detail_admin_actions' ) ) {
            // Do not hide or relocate broader host-admin transitions merely to
            // make the dossier look like the locked Approval specimen.
            return null;
        }

        if ( empty( $step->instructionsEnable ) || empty( $step->instructionsValue ) ) {
            return null;
        }

        foreach ( array( 'workflow.timeline', 'workflow.approve_action', 'workflow.reject_action' ) as $slot_key ) {
            $resolved = $model->resolve( $entry, $slot_key );
            if ( empty( $resolved['resolved'] ) ) {
                return null;
            }
        }

        if ( ! $model->runtimeClaimIsProven( $entry, 'workflow.approve_action', 'action_permission' )
            || ! $model->runtimeClaimIsProven( $entry, 'workflow.reject_action', 'action_permission' ) ) {
            return null;
        }

        return $step;
    }

    private static function requiredRuntimeValuesPresent( EntryDetailPresentationModel $model, $entry, $step ) {
        foreach ( $model->requiredSemanticSlotKeys() as $slot_key ) {
            $resolved = $model->resolve( $entry, $slot_key );
            if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref']['type'] ) ) {
                return false;
            }

            $type = $resolved['source_ref']['type'];
            if ( 'gravity_flow.region' === $type || 'gravity_flow.action' === $type ) {
                continue;
            }

            if ( null === self::slotValue( $model, $entry, $slot_key, $step ) ) {
                return false;
            }
        }

        return true;
    }

    private static function identityMarkup( $values ) {
        $name = isset( $values['student.full_name'] ) ? $values['student.full_name'] : null;
        $photo = isset( $values['student.photo'] ) ? $values['student.photo'] : null;

        $html = '<header class="gpp-entry-detail__identity">';
        $html .= '<div class="gpp-entry-detail__identity-photo">' . self::photoMarkup( $photo, $name ) . '</div>';
        $html .= '<div class="gpp-entry-detail__identity-main">';
        $html .= '<h1>' . esc_html( null === $name ? '—' : $name ) . '</h1>';
        $html .= '<dl class="gpp-entry-detail__identity-facts">';
        $html .= self::factMarkup( 'کد ملی', self::persianDigitsIfScalar( self::value( $values, 'student.national_id' ) ) );
        $html .= self::factMarkup( 'پایه / گروه', self::value( $values, 'education.grade_group' ) );
        if ( null !== self::value( $values, 'school.name' ) ) {
            $html .= self::factMarkup( 'مدرسه', self::value( $values, 'school.name' ) );
        }
        $html .= '</dl></div></header>';

        return $html;
    }

    private static function studentSectionMarkup( $values ) {
        $facts = array(
            'نام' => self::value( $values, 'student.first_name' ),
            'نام خانوادگی' => self::value( $values, 'student.last_name' ),
            'نام پدر' => self::value( $values, 'student.father_name' ),
            'تاریخ تولد' => self::value( $values, 'student.birth_date_jalali' ),
            'جنسیت' => self::value( $values, 'student.gender' ),
            'تلفن همراه دانش‌آموز' => self::value( $values, 'student.mobile' ),
            'تلفن منزل' => self::value( $values, 'student.home_phone' ),
            'تلفن همراه پدر' => self::value( $values, 'student.father_mobile' ),
            'تلفن همراه مادر' => self::value( $values, 'student.mother_mobile' ),
        );

        return self::sectionMarkup( 'gpp-student-title', 'اطلاعات دانش‌آموز', $facts );
    }

    private static function educationSectionMarkup( $values ) {
        $facts = array(
            'مقطع تحصیلی' => self::value( $values, 'education.level' ),
            'پایه / گروه' => self::value( $values, 'education.grade_group' ),
            'وضعیت تحصیلی' => self::value( $values, 'education.graduation_status' ),
            'مدرسه' => self::value( $values, 'school.name' ),
            'مرکز ثبت‌نام' => self::value( $values, 'registration.center' ),
        );

        return self::sectionMarkup( 'gpp-education-title', 'اطلاعات تحصیلی و ثبت‌نام', $facts );
    }

    private static function administrativeSectionMarkup( $values ) {
        $facts = array(
            'وضعیت بررسی' => self::value( $values, 'review.status' ),
            'دلیل بررسی / اصلاح' => self::value( $values, 'review.reason' ),
            'وضعیت مالی' => self::value( $values, 'finance.status' ),
            'شهریه' => self::value( $values, 'finance.tuition_amount' ),
            'تخفیف' => self::value( $values, 'finance.discount_amount' ),
            'عنوان تخفیف' => self::value( $values, 'finance.discount_title' ),
            'خالص قابل پرداخت' => self::value( $values, 'finance.net_payable_amount' ),
        );

        foreach ( $facts as $value ) {
            if ( null !== $value ) {
                return self::sectionMarkup( 'gpp-administrative-title', 'اطلاعات اداری و مالی', $facts );
            }
        }

        return '';
    }

    private static function sectionMarkup( $id, $title, $facts ) {
        $body = '';
        foreach ( $facts as $label => $value ) {
            if ( null === $value ) {
                continue;
            }
            $body .= self::factMarkup( $label, $value );
        }
        if ( '' === $body ) {
            return '';
        }

        return '<section class="gpp-entry-detail__section" aria-labelledby="' . esc_attr( $id ) . '"><h2 id="' . esc_attr( $id ) . '">' . esc_html( $title ) . '</h2><dl class="gpp-entry-detail__facts">' . $body . '</dl></section>';
    }

    private static function factMarkup( $label, $value ) {
        $display = null === $value || '' === (string) $value ? '—' : (string) $value;
        return '<div class="gpp-entry-detail__fact"><dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( $display ) . '</dd></div>';
    }

    private static function documentsMarkup( EntryDetailPresentationModel $model, $form, $entry ) {
        $resolved = $model->resolve( $entry, 'documents.report_card' );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref']['field_id'] ) || ! class_exists( 'GFAPI' ) ) {
            return '';
        }

        $field_id = $resolved['source_ref']['field_id'];
        $field = \GFAPI::get_field( $form, $field_id );
        if ( ! is_object( $field ) || 'fileupload' !== $field->type || ! method_exists( $field, 'to_array' ) || ! method_exists( $field, 'get_download_url' ) ) {
            return '';
        }

        $key = (string) $field_id;
        if ( empty( $entry[ $key ] ) ) {
            return '';
        }

        $files = $field->to_array( $entry[ $key ] );
        if ( ! is_array( $files ) || array() === $files ) {
            return '';
        }

        $items = '';
        $dialogs = '';
        $index = 0;
        foreach ( $files as $file ) {
            $raw_url = is_array( $file ) ? rgar( $file, 'tmp_url' ) : $file;
            if ( ! is_string( $raw_url ) || '' === trim( $raw_url ) ) {
                continue;
            }

            $name = is_array( $file ) ? rgar( $file, 'uploaded_name' ) : wp_basename( (string) parse_url( $raw_url, PHP_URL_PATH ) );
            $name = is_string( $name ) && '' !== $name ? $name : __( 'فایل پرونده', 'gravity-presentation-profiles' );
            $download_url = $field->get_download_url( $raw_url, false, (int) $entry['id'] );
            $download_url = esc_url( $download_url );
            if ( '' === $download_url ) {
                continue;
            }

            $path = (string) parse_url( $raw_url, PHP_URL_PATH );
            $type = function_exists( 'wp_check_filetype' ) ? wp_check_filetype( $path ) : array( 'type' => '' );
            $mime = isset( $type['type'] ) ? (string) $type['type'] : '';
            $is_image = 0 === strpos( $mime, 'image/' );

            if ( $is_image ) {
                $dialog_id = 'gpp-document-preview-' . (int) $entry['id'] . '-' . $index;
                $items .= '<div class="gpp-entry-detail__document gpp-entry-detail__document--image">';
                $items .= '<button type="button" class="gpp-entry-detail__thumbnail" data-gpp-image-preview-open="' . esc_attr( $dialog_id ) . '" aria-haspopup="dialog">';
                $items .= '<img src="' . $download_url . '" alt="' . esc_attr( sprintf( __( 'پیش‌نمایش %s', 'gravity-presentation-profiles' ), $name ) ) . '" loading="lazy" />';
                $items .= '<span>' . esc_html( $name ) . '</span></button></div>';
                $dialogs .= '<div id="' . esc_attr( $dialog_id ) . '" class="gpp-entry-detail__preview" role="dialog" aria-modal="true" aria-label="' . esc_attr( $name ) . '" hidden data-gpp-image-preview-dialog>';
                $dialogs .= '<div class="gpp-entry-detail__preview-panel">';
                $dialogs .= '<button type="button" class="gpp-entry-detail__preview-close" data-gpp-image-preview-close>' . esc_html__( 'بستن', 'gravity-presentation-profiles' ) . '</button>';
                $dialogs .= '<img src="' . $download_url . '" alt="' . esc_attr( $name ) . '" />';
                $dialogs .= '</div></div>';
            } else {
                $items .= '<div class="gpp-entry-detail__document gpp-entry-detail__document--file">';
                $items .= '<span class="gpp-entry-detail__document-name">' . esc_html( $name ) . '</span>';
                $items .= '<a href="' . $download_url . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'باز کردن فایل', 'gravity-presentation-profiles' ) . '</a>';
                $items .= '</div>';
            }
            $index++;
        }

        return '' === $items ? '' : '<div class="gpp-entry-detail__document-list">' . $items . '</div>' . $dialogs;
    }

    private static function photoMarkup( $photo, $name ) {
        if ( null !== $photo ) {
            $url = esc_url( $photo );
            if ( '' !== $url ) {
                return '<img src="' . $url . '" alt="" loading="lazy" />';
            }
        }

        $initial = '؟';
        if ( null !== $name && '' !== $name && function_exists( 'mb_substr' ) ) {
            $initial = mb_substr( $name, 0, 1, 'UTF-8' );
        }
        return '<span aria-hidden="true">' . esc_html( $initial ) . '</span><span class="screen-reader-text">' . esc_html__( 'تصویر دانش‌آموز موجود نیست', 'gravity-presentation-profiles' ) . '</span>';
    }

    private static function value( $values, $key ) {
        return array_key_exists( $key, $values ) ? $values[ $key ] : null;
    }

    private static function persianDigitsIfScalar( $value ) {
        return null === $value ? null : PersianDateFormatter::persianDigits( $value );
    }

    private static function slotValue( EntryDetailPresentationModel $model, $entry, $slot_key, $step ) {
        $resolved = $model->resolve( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return null;
        }

        $value = self::readSourceValue( $resolved['source_ref'], $entry, $step );
        if ( is_int( $value ) || is_float( $value ) ) {
            return $value;
        }
        if ( ! is_scalar( $value ) ) {
            return null;
        }

        $value = trim( wp_strip_all_tags( (string) $value ) );
        return '' === $value ? null : $value;
    }

    private static function readSourceValue( $source, $entry, $step ) {
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
                if ( ! is_object( $step ) ) {
                    return null;
                }
                if ( isset( $source['state_key'] ) && 'current_step' === $source['state_key'] && method_exists( $step, 'get_name' ) ) {
                    return $step->get_name();
                }
                if ( isset( $source['state_key'] ) && 'status' === $source['state_key'] && method_exists( $step, 'evaluate_status' ) ) {
                    return $step->evaluate_status();
                }
                return null;
        }

        return null;
    }

    private static function readinessMarker( $ready ) {
        $state = $ready ? 'ready' : 'unready';
        return '<span hidden class="gpp-entry-detail__readiness gpp-entry-detail__readiness--' . $state . '" data-gpp-entry-detail-readiness="' . $state . '" aria-hidden="true"></span>';
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
            $active_binding_sets = self::activeBindingSets( $bindings->snapshot() );

            self::$model = new EntryDetailPresentationModel(
                $profile,
                $active_binding_sets,
                $package['semantic_slots']
            );
        } catch ( \Throwable $exception ) {
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
}
