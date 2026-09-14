<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Presentation-only adapter for Gravity Flow's native Entry Detail surface.
 *
 * Gravity Flow remains the owner of permission checks, editable controls,
 * validation, persistence, actions, transitions, history, and print access.
 */
final class EntryDetailPresentationAdapter {
    const SURFACE = 'gravity_flow.entry_detail';
    const STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail';
    const SCRIPT_HANDLE = 'gpp-srwf-gravity-flow-entry-detail';

    private static $model_loaded = false;
    private static $model = null;
    private static $active = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        // All presentation injection happens inside Gravity Flow's own
        // permission-gated Entry Detail form. These hooks are source-proven in
        // the pinned Gravity Flow 3.1.0 runtime used by the WU21 lab.
        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderBefore' ), 20, 2 );
        add_action( 'gravityflow_entry_detail_content_after', array( __CLASS__, 'renderAfter' ), 20, 2 );
        add_filter( 'gform_field_content', array( __CLASS__, 'filterFieldContent' ), 100, 5 );
        add_filter( 'gravityflow_approve_label_workflow_detail', array( __CLASS__, 'filterApproveLabel' ), 100, 2 );
        add_filter( 'gravityflow_reject_label_workflow_detail', array( __CLASS__, 'filterRejectLabel' ), 100, 2 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
        self::$active = null;
    }

    public static function renderBefore( $form, $entry ) {
        $model = self::model();
        if ( null === $model || ! is_array( $form ) || ! is_array( $entry ) || ! $model->isPresentationReady( $entry ) ) {
            self::$active = null;
            return;
        }

        $current_step = self::currentStep( $entry );
        $editable = self::hostEditableFieldIds( $current_step );
        self::$active = array(
            'entry_id' => (string) $entry['id'],
            'form_id' => (string) $entry['form_id'],
            'entry' => $entry,
            'form' => $form,
            'model' => $model,
            'current_step' => $current_step,
            'editable_field_ids' => $editable,
            'projected_field_ids' => array(),
        );

        $identity = self::rows(
            array(
                'student.full_name' => 'نام و نام خانوادگی',
                'student.national_id' => 'کد ملی',
                'student.father_name' => 'نام پدر',
                'student.birth_date_jalali' => 'تاریخ تولد',
                'student.gender' => 'جنسیت',
                'student.mobile' => 'شماره همراه',
                'student.home_phone' => 'تلفن منزل',
                'student.father_mobile' => 'همراه پدر',
                'student.mother_mobile' => 'همراه مادر',
            ),
            $entry
        );
        $education = self::rows(
            array(
                'education.level' => 'مقطع تحصیلی',
                'education.grade_group' => 'پایه / گروه تحصیلی',
                'education.graduation_status' => 'وضعیت تحصیلی',
                'school.name' => 'مدرسه',
                'registration.center' => 'مرکز ثبت‌نام',
            ),
            $entry
        );
        $workflow = self::rows(
            array(
                'workflow.current_step' => 'مرحله جاری',
                'workflow.status' => 'وضعیت گردش کار',
                'entry.created_at' => 'تاریخ ثبت',
            ),
            $entry
        );
        $review = self::rows(
            array(
                'review.status' => 'وضعیت بررسی',
                'review.reason' => 'دلیل / توضیح بررسی',
            ),
            $entry
        );
        $finance = self::rows(
            array(
                'finance.status' => 'وضعیت مالی',
                'finance.tuition_amount' => 'شهریه',
                'finance.discount_amount' => 'تخفیف',
                'finance.discount_title' => 'عنوان تخفیف',
                'finance.net_payable_amount' => 'مبلغ قابل پرداخت',
            ),
            $entry
        );

        $photo = self::photoMarkup( $entry );
        $documents = self::documentsMarkup( $entry );
        $instructions_ready = $model->hostRegionIsProven( $entry, 'workflow.instructions', 'instructions' );
        $timeline_ready = $model->hostRegionIsProven( $entry, 'workflow.timeline', 'timeline' );

        echo '<section class="gpp-entry-dossier" dir="rtl" data-gpp-entry-dossier="ready" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '" data-gpp-entry-id="' . esc_attr( $entry['id'] ) . '" data-gpp-instructions-admitted="' . ( $instructions_ready ? 'true' : 'false' ) . '" data-gpp-timeline-admitted="' . ( $timeline_ready ? 'true' : 'false' ) . '" data-gpp-host-editable="' . ( empty( $editable ) ? 'false' : 'true' ) . '">';
        echo '<section class="gpp-entry-section gpp-entry-identity" aria-labelledby="gpp-entry-identity-title">';
        echo '<div class="gpp-entry-section__heading"><div><h2 id="gpp-entry-identity-title">' . esc_html__( 'هویت دانش‌آموز', 'gravity-presentation-profiles' ) . '</h2><p>' . esc_html__( 'اطلاعات هویتی ثبت‌شده در پرونده', 'gravity-presentation-profiles' ) . '</p></div>' . $photo . '</div>';
        echo $identity;
        echo '</section>';

        // Owner-locked order: current task is immediately after identity.
        echo '<section class="gpp-entry-section gpp-entry-current-task" aria-labelledby="gpp-entry-current-task-title">';
        echo '<h2 id="gpp-entry-current-task-title">کاری که الان باید انجام دهید</h2>';
        echo $workflow;
        echo '<div class="gpp-entry-current-task__instructions" data-gpp-host-instructions></div>';
        echo '<div class="gpp-entry-current-task__editor" data-gpp-host-editor></div>';
        echo '<div class="gpp-entry-current-task__actions" data-gpp-host-actions></div>';
        echo '</section>';

        if ( '' !== $education ) {
            echo self::sectionMarkup( 'اطلاعات تحصیلی و اداری', $education, 'gpp-entry-education' );
        }
        echo '<section class="gpp-entry-section gpp-entry-native-fallback" data-gpp-host-fallback-section hidden><h2>' . esc_html__( 'اطلاعات تکمیلی پرونده', 'gravity-presentation-profiles' ) . '</h2><div data-gpp-host-fallback></div></section>';
        if ( '' !== $documents ) {
            echo self::sectionMarkup( 'مدارک', $documents, 'gpp-entry-documents' );
        }
        if ( '' !== $review ) {
            echo self::sectionMarkup( 'نتیجه بررسی', $review, 'gpp-entry-review' );
        }
        if ( '' !== $finance ) {
            echo self::sectionMarkup( 'اطلاعات مالی', $finance, 'gpp-entry-finance' );
        }

        // Existing host Print is moved here only if Gravity Flow rendered it
        // after its own access gate. WU19 owns any future print composition.
        echo '<div class="gpp-entry-utilities" data-gpp-host-utilities></div>';
        echo self::previewDialogMarkup();
        echo '</section>';
    }

    public static function renderAfter( $form, $entry ) {
        if ( ! self::matchesActive( $form, $entry ) ) {
            return;
        }

        // Kept as real DOM text even without JS. The controller only relocates
        // it beside Gravity Flow's authentic timeline and collapses that region.
        echo '<p class="gpp-entry-history-helper" data-gpp-history-helper>اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.</p>';
        self::$active = null;
    }

    /**
     * Suppress only read-only native rows that have already been safely
     * projected through a PROVEN semantic source. Editable controls never pass
     * through this suppression path and remain entirely host-owned.
     */
    public static function filterFieldContent( $content, $field, $value, $entry_id, $form_id ) {
        if ( null === self::$active || (string) $entry_id !== self::$active['entry_id'] || (string) $form_id !== self::$active['form_id'] || ! is_object( $field ) || ! isset( $field->id ) ) {
            return $content;
        }
        $field_id = (string) $field->id;
        if ( isset( self::$active['editable_field_ids'][ $field_id ] ) ) {
            return $content;
        }
        return isset( self::$active['projected_field_ids'][ $field_id ] ) ? '' : $content;
    }

    public static function filterApproveLabel( $label, $step ) {
        return self::nativeActionLabel( $label, $step, 'workflow.approve_action', 'approve', 'تأیید پرونده' );
    }

    public static function filterRejectLabel( $label, $step ) {
        return self::nativeActionLabel( $label, $step, 'workflow.reject_action', 'reject', 'رد پرونده' );
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
            self::$model = new EntryDetailPresentationModel(
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
            if ( ! isset( $identity['binding_set_id'], $identity['binding_set_version'] ) ) {
                continue;
            }
            $id = $identity['binding_set_id'];
            $version = $identity['binding_set_version'];
            if ( ! isset( $snapshot['installed'][ $id ][ $version ] ) ) {
                continue;
            }
            $record = $snapshot['installed'][ $id ][ $version ];
            if ( isset( $record['context_key'], $record['artifact'] ) && $record['context_key'] === $context_key ) {
                $active[] = $record['artifact'];
            }
        }
        return $active;
    }

    private static function rows( $slots, $entry ) {
        $html = '';
        foreach ( $slots as $slot_key => $label ) {
            $value = self::slotValue( $entry, $slot_key );
            if ( null === $value ) {
                continue;
            }
            $html .= '<div class="gpp-entry-fact" data-gpp-semantic-slot="' . esc_attr( $slot_key ) . '"><dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( $value ) . '</dd></div>';
        }
        return '' === $html ? '' : '<dl class="gpp-entry-facts">' . $html . '</dl>';
    }

    private static function slotValue( $entry, $slot_key ) {
        $model = self::$active['model'];
        $resolved = $model->resolveAvailable( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return null;
        }
        $source = $resolved['source_ref'];
        if ( 'gravity_forms.field' === $source['type'] && self::fieldIsEditable( $source['field_id'] ) ) {
            // Semantic source evidence never turns a host field into a GPP edit
            // control. Leave the real Gravity Flow editor untouched instead.
            return null;
        }

        $value = self::readSourceValue( $source, $entry );
        if ( ! is_scalar( $value ) ) {
            return null;
        }
        $value = trim( wp_strip_all_tags( (string) $value ) );
        if ( '' === $value ) {
            return null;
        }
        if ( 'gravity_forms.field' === $source['type'] ) {
            self::markProjectedField( $source['field_id'] );
        }
        return $value;
    }

    private static function readSourceValue( $source, $entry ) {
        switch ( $source['type'] ) {
            case 'gravity_forms.field':
                $key = (string) $source['field_id'];
                return isset( $entry[ $key ] ) ? $entry[ $key ] : null;
            case 'gravity_forms.entry_meta':
                $key = $source['meta_key'];
                if ( isset( $entry[ $key ] ) ) {
                    return $entry[ $key ];
                }
                return function_exists( 'gform_get_meta' ) ? gform_get_meta( (int) $entry['id'], $key ) : null;
            case 'gravity_flow.state':
                if ( 'status' === $source['state_key'] ) {
                    return function_exists( 'gform_get_meta' ) ? gform_get_meta( (int) $entry['id'], 'workflow_final_status' ) : null;
                }
                $step = self::currentStep( $entry );
                if ( ! $step ) {
                    return null;
                }
                if ( 'current_step' === $source['state_key'] ) {
                    return $step->get_name();
                }
                if ( 'due_at' === $source['state_key'] && method_exists( $step, 'supports_due_date' ) && $step->supports_due_date() && ! empty( $step->due_date ) && method_exists( $step, 'get_due_date_timestamp' ) ) {
                    return gmdate( 'Y-m-d H:i:s', $step->get_due_date_timestamp() );
                }
        }
        return null;
    }

    private static function currentStep( $entry ) {
        if ( ! class_exists( 'Gravity_Flow_API' ) ) {
            return null;
        }
        $api = new \Gravity_Flow_API( (int) $entry['form_id'] );
        $step = $api->get_current_step( $entry );
        return $step ? $step : null;
    }

    private static function hostEditableFieldIds( $current_step ) {
        $ids = array();
        if ( ! $current_step || ! class_exists( 'Gravity_Flow_Entry_Detail' ) || ! method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' ) ) {
            return $ids;
        }
        if ( ! \Gravity_Flow_Entry_Detail::can_update( $current_step ) || ! method_exists( $current_step, 'get_editable_fields' ) ) {
            return $ids;
        }
        foreach ( (array) $current_step->get_editable_fields() as $field_id ) {
            $ids[ (string) $field_id ] = true;
        }
        return $ids;
    }

    private static function fieldIsEditable( $field_id ) {
        return null !== self::$active && isset( self::$active['editable_field_ids'][ (string) $field_id ] );
    }

    private static function markProjectedField( $field_id ) {
        if ( null !== self::$active && ! self::fieldIsEditable( $field_id ) ) {
            self::$active['projected_field_ids'][ (string) $field_id ] = true;
        }
    }

    private static function photoMarkup( $entry ) {
        $items = self::fileItemsForSlot( $entry, 'student.photo' );
        if ( empty( $items ) ) {
            return '';
        }
        $item = reset( $items );
        if ( empty( $item['is_image'] ) ) {
            return '';
        }
        return '<button type="button" class="gpp-entry-photo" data-gpp-image-preview data-gpp-preview-src="' . esc_attr( $item['url'] ) . '" data-gpp-preview-alt="' . esc_attr( $item['name'] ) . '" aria-label="' . esc_attr__( 'نمایش تصویر بزرگ‌تر', 'gravity-presentation-profiles' ) . '"><img src="' . esc_url( $item['url'] ) . '" alt="" loading="lazy" /></button>';
    }

    private static function documentsMarkup( $entry ) {
        $items = self::fileItemsForSlot( $entry, 'documents.report_card' );
        if ( empty( $items ) ) {
            return '';
        }
        $html = '<div class="gpp-entry-files">';
        foreach ( $items as $item ) {
            $html .= '<article class="gpp-entry-file">';
            if ( $item['is_image'] ) {
                $html .= '<button type="button" class="gpp-entry-file__thumb" data-gpp-image-preview data-gpp-preview-src="' . esc_attr( $item['url'] ) . '" data-gpp-preview-alt="' . esc_attr( $item['name'] ) . '"><img src="' . esc_url( $item['url'] ) . '" alt="" loading="lazy" /></button>';
            } else {
                $html .= '<span class="gpp-entry-file__icon" aria-hidden="true">PDF</span>';
            }
            $html .= '<div><strong>' . esc_html( $item['name'] ) . '</strong><a href="' . esc_url( $item['url'] ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'باز کردن فایل', 'gravity-presentation-profiles' ) . '<span class="screen-reader-text"> ' . esc_html__( '(در زبانه جدید)', 'gravity-presentation-profiles' ) . '</span></a></div>';
            $html .= '</article>';
        }
        return $html . '</div>';
    }

    private static function fileItemsForSlot( $entry, $slot_key ) {
        $model = self::$active['model'];
        $resolved = $model->resolveAvailable( $entry, $slot_key );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) || 'gravity_forms.field' !== $resolved['source_ref']['type'] || self::fieldIsEditable( $resolved['source_ref']['field_id'] ) ) {
            return array();
        }
        if ( ! function_exists( 'GFAPI' ) ) {
            return array();
        }
        $field_id = $resolved['source_ref']['field_id'];
        $field = \GFAPI::get_field( (int) $entry['form_id'], $field_id );
        if ( ! is_object( $field ) || 'fileupload' !== $field->type || ! method_exists( $field, 'to_array' ) || ! method_exists( $field, 'get_download_url' ) || ! method_exists( $field, 'get_file_name_from_url' ) ) {
            return array();
        }
        $key = (string) $field_id;
        $raw = isset( $entry[ $key ] ) ? $entry[ $key ] : null;
        $files = $field->to_array( $raw );
        $items = array();
        foreach ( $files as $file ) {
            if ( is_array( $file ) ) {
                $original_url = isset( $file['tmp_url'] ) ? $file['tmp_url'] : null;
                $name = isset( $file['uploaded_name'] ) ? $file['uploaded_name'] : null;
            } else {
                $original_url = $file;
                $names = $field->get_file_name_from_url( $original_url );
                $name = is_array( $names ) && ! empty( $names['original'] ) ? $names['original'] : null;
            }
            if ( ! is_string( $original_url ) || '' === $original_url || ! is_string( $name ) || '' === $name ) {
                continue;
            }
            $url = $field->get_download_url( $original_url, false, (int) $entry['id'] );
            if ( ! is_string( $url ) || '' === esc_url( $url ) ) {
                continue;
            }
            $filetype = function_exists( 'wp_check_filetype' ) ? wp_check_filetype( $name ) : array( 'type' => null );
            $mime = isset( $filetype['type'] ) ? (string) $filetype['type'] : '';
            $items[] = array(
                'name' => $name,
                'url' => $url,
                'is_image' => 0 === strpos( $mime, 'image/' ),
            );
        }
        if ( ! empty( $items ) ) {
            self::markProjectedField( $field_id );
        }
        return $items;
    }

    private static function sectionMarkup( $title, $body, $class_name ) {
        return '<section class="gpp-entry-section ' . esc_attr( $class_name ) . '"><h2>' . esc_html( $title ) . '</h2>' . $body . '</section>';
    }

    private static function previewDialogMarkup() {
        return '<dialog class="gpp-entry-preview" data-gpp-image-dialog aria-labelledby="gpp-entry-preview-title"><div class="gpp-entry-preview__panel"><div class="gpp-entry-preview__header"><strong id="gpp-entry-preview-title">' . esc_html__( 'پیش‌نمایش تصویر', 'gravity-presentation-profiles' ) . '</strong><button type="button" data-gpp-image-close aria-label="' . esc_attr__( 'بستن پیش‌نمایش', 'gravity-presentation-profiles' ) . '">×</button></div><img data-gpp-image-large src="" alt="" /></div></dialog>';
    }

    private static function nativeActionLabel( $label, $step, $slot_key, $action_key, $replacement ) {
        if ( null === self::$active || ! is_object( $step ) || ! method_exists( $step, 'get_entry' ) ) {
            return $label;
        }
        $entry = $step->get_entry();
        if ( ! is_array( $entry ) || (string) $entry['id'] !== self::$active['entry_id'] ) {
            return $label;
        }
        $resolved = self::$active['model']->resolveAction( $entry, $slot_key, $action_key );
        return ! empty( $resolved['resolved'] ) ? $replacement : $label;
    }

    private static function matchesActive( $form, $entry ) {
        return null !== self::$active
            && is_array( $form )
            && is_array( $entry )
            && (string) $form['id'] === self::$active['form_id']
            && (string) $entry['id'] === self::$active['entry_id'];
    }
}
