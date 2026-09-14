<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Presentation-only adapter for Gravity Flow's native Entry Detail surface.
 *
 * Permission, workflow, edit/save, validation, actions, uploaded-file storage,
 * timeline and print remain owned by Gravity Forms / Gravity Flow. GPP only
 * projects independently evidenced semantic values and re-composes already
 * rendered native controls in-place.
 */
final class EntryDetailPresentationAdapter {
    const SURFACE = 'gravity_flow.entry_detail';
    const STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail';
    const SCRIPT_HANDLE = 'gpp-srwf-gravity-flow-entry-detail';

    private static $model_loaded = false;
    private static $model = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        // Source-proven Gravity Flow 3.1.0 seams. The content hook executes only
        // after Gravity Flow's own Entry Detail permission gate has passed.
        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderDossier' ), 20, 2 );
        add_filter( 'gravityflow_approve_label_workflow_detail', array( __CLASS__, 'filterApproveLabel' ), 20, 2 );
        add_filter( 'gravityflow_reject_label_workflow_detail', array( __CLASS__, 'filterRejectLabel' ), 20, 2 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
    }

    public static function renderDossier( $form, $entry ) {
        $model = self::model();
        if ( null === $model || ! is_array( $form ) || ! is_array( $entry ) || ! $model->isPresentationReady( $entry ) ) {
            return;
        }

        $current_step = self::currentStep( $entry );
        $editable_fields = self::hostEditableFields( $current_step );
        $instructions_expected = $model->isAvailable( $entry, 'workflow.instructions' );
        $history_expected = $model->isAvailable( $entry, 'workflow.timeline' );
        $approval_actions = self::approvalActionsAreProven( $model, $entry, $current_step );

        echo '<div class="gpp-entry-dossier" dir="rtl" data-gpp-entry-detail="ready" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '"';
        echo ' data-gpp-host-editable="' . ( empty( $editable_fields ) ? '0' : '1' ) . '"';
        echo ' data-gpp-require-instructions="' . ( $instructions_expected ? '1' : '0' ) . '">';

        self::renderIdentitySection( $model, $form, $entry );

        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__task" data-gpp-section="current-task">';
        echo '<h2 class="gpp-entry-dossier__task-heading">' . esc_html__( 'کاری که الان باید انجام دهید', 'gravity-presentation-profiles' ) . '</h2>';
        $step_name = self::slotText( $model, $form, $entry, 'workflow.current_step' );
        if ( null !== $step_name ) {
            echo '<p class="gpp-entry-dossier__task-step"><span>' . esc_html__( 'مرحله جاری', 'gravity-presentation-profiles' ) . '</span><strong>' . esc_html( $step_name ) . '</strong></p>';
        }
        echo '<div class="gpp-entry-dossier__native-instructions" data-gpp-native-instructions></div>';
        echo '<div class="gpp-entry-dossier__native-editor" data-gpp-native-editor></div>';
        if ( $approval_actions ) {
            echo '<div class="gpp-entry-dossier__native-actions" data-gpp-native-actions></div>';
        }
        echo '</section>';

        self::renderFactsSection( $model, $form, $entry );
        self::renderDocumentsSection( $model, $form, $entry );

        if ( $history_expected ) {
            echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__history" data-gpp-section="history">';
            echo '<details data-gpp-history-details>';
            echo '<summary>' . esc_html__( 'سوابق بررسی پرونده', 'gravity-presentation-profiles' ) . '</summary>';
            echo '<p class="gpp-entry-dossier__history-help">' . esc_html__( 'اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.', 'gravity-presentation-profiles' ) . '</p>';
            echo '<div data-gpp-native-history></div>';
            echo '</details>';
            echo '</section>';
        }

        echo self::previewDialogMarkup();
        echo '</div>';
    }

    public static function filterApproveLabel( $label, $step ) {
        return self::canRelabelAction( $step, 'workflow.approve_action', 'approve' )
            ? __( 'تأیید پرونده', 'gravity-presentation-profiles' )
            : $label;
    }

    public static function filterRejectLabel( $label, $step ) {
        return self::canRelabelAction( $step, 'workflow.reject_action', 'reject' )
            ? __( 'رد پرونده', 'gravity-presentation-profiles' )
            : $label;
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

    private static function renderIdentitySection( EntryDetailPresentationModel $model, $form, $entry ) {
        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__identity" data-gpp-section="identity">';
        echo '<div class="gpp-entry-dossier__identity-main">';

        $photo = self::documentForSlot( $model, $form, $entry, 'student.photo' );
        if ( null !== $photo && 'image' === $photo['kind'] ) {
            echo self::imageThumbnailMarkup( $photo, 'gpp-entry-dossier__student-photo' );
        }

        echo '<div class="gpp-entry-dossier__identity-text">';
        $name = self::slotText( $model, $form, $entry, 'student.full_name' );
        echo '<h1>' . esc_html( null === $name ? '—' : $name ) . '</h1>';
        echo '<dl class="gpp-entry-dossier__facts gpp-entry-dossier__facts--identity">';
        self::renderFact( $model, $form, $entry, 'student.national_id', 'کد ملی' );
        self::renderFact( $model, $form, $entry, 'student.father_name', 'نام پدر' );
        self::renderFact( $model, $form, $entry, 'student.birth_date_jalali', 'تاریخ تولد' );
        self::renderFact( $model, $form, $entry, 'student.gender', 'جنسیت' );
        echo '</dl>';
        echo '</div></div></section>';
    }

    private static function renderFactsSection( EntryDetailPresentationModel $model, $form, $entry ) {
        echo '<section class="gpp-entry-dossier__section" data-gpp-section="facts">';
        echo '<h2>' . esc_html__( 'اطلاعات پرونده', 'gravity-presentation-profiles' ) . '</h2>';
        echo '<dl class="gpp-entry-dossier__facts">';
        self::renderFact( $model, $form, $entry, 'student.mobile', 'تلفن همراه دانش‌آموز' );
        self::renderFact( $model, $form, $entry, 'student.home_phone', 'تلفن منزل' );
        self::renderFact( $model, $form, $entry, 'student.father_mobile', 'تلفن همراه پدر' );
        self::renderFact( $model, $form, $entry, 'student.mother_mobile', 'تلفن همراه مادر' );
        self::renderFact( $model, $form, $entry, 'education.level', 'مقطع تحصیلی' );
        self::renderFact( $model, $form, $entry, 'education.grade_group', 'پایه / گروه' );
        self::renderFact( $model, $form, $entry, 'education.graduation_status', 'وضعیت تحصیلی' );
        self::renderFact( $model, $form, $entry, 'school.name', 'مدرسه' );
        self::renderFact( $model, $form, $entry, 'registration.center', 'مرکز ثبت‌نام' );
        self::renderFact( $model, $form, $entry, 'review.status', 'وضعیت بررسی' );
        self::renderFact( $model, $form, $entry, 'review.reason', 'توضیح بررسی' );
        self::renderFact( $model, $form, $entry, 'finance.status', 'وضعیت مالی' );
        self::renderFact( $model, $form, $entry, 'finance.tuition_amount', 'شهریه' );
        self::renderFact( $model, $form, $entry, 'finance.discount_amount', 'تخفیف' );
        self::renderFact( $model, $form, $entry, 'finance.discount_title', 'عنوان تخفیف' );
        self::renderFact( $model, $form, $entry, 'finance.net_payable_amount', 'خالص قابل پرداخت' );
        echo '</dl></section>';
    }

    private static function renderDocumentsSection( EntryDetailPresentationModel $model, $form, $entry ) {
        $document = self::documentForSlot( $model, $form, $entry, 'documents.report_card' );
        if ( null === $document ) {
            return;
        }

        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__documents" data-gpp-section="documents">';
        echo '<h2>' . esc_html__( 'مدارک', 'gravity-presentation-profiles' ) . '</h2>';
        echo '<div class="gpp-entry-dossier__document">';
        echo '<span class="gpp-entry-dossier__document-label">' . esc_html__( 'کارنامه', 'gravity-presentation-profiles' ) . '</span>';
        if ( 'image' === $document['kind'] ) {
            echo self::imageThumbnailMarkup( $document, 'gpp-entry-dossier__document-thumbnail' );
        } else {
            echo '<a class="gpp-entry-dossier__file-link" href="' . esc_url( $document['url'] ) . '" target="_blank" rel="noopener">' . esc_html( $document['name'] ) . '</a>';
        }
        echo '</div></section>';
    }

    private static function renderFact( EntryDetailPresentationModel $model, $form, $entry, $slot, $label ) {
        $value = self::slotText( $model, $form, $entry, $slot );
        if ( null === $value ) {
            return;
        }

        echo '<div class="gpp-entry-dossier__fact" data-gpp-slot="' . esc_attr( $slot ) . '">';
        echo '<dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( $value ) . '</dd></div>';
    }

    private static function slotText( EntryDetailPresentationModel $model, $form, $entry, $slot ) {
        if ( ! $model->isAvailable( $entry, $slot ) ) {
            return null;
        }

        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            return null;
        }

        $source = $resolved['source_ref'];
        $value = self::readSourceValue( $source, $form, $entry );
        if ( is_int( $value ) || is_float( $value ) ) {
            return (string) $value;
        }
        if ( ! is_scalar( $value ) ) {
            return null;
        }

        $text = trim( wp_strip_all_tags( (string) $value ) );
        return '' === $text ? null : $text;
    }

    private static function readSourceValue( $source, $form, $entry ) {
        return ( new BoundHostValueReader() )->read( $source, $form, $entry );
    }

    private static function documentForSlot( EntryDetailPresentationModel $model, $form, $entry, $slot ) {
        if ( ! $model->isAvailable( $entry, $slot ) ) {
            return null;
        }
        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || 'gravity_forms.field' !== $resolved['source_ref']['type'] || ! class_exists( 'GFAPI' ) ) {
            return null;
        }

        $field_id = $resolved['source_ref']['field_id'];
        $field = \GFAPI::get_field( $form, $field_id );
        if ( ! is_object( $field ) || 'fileupload' !== $field->type || ! method_exists( $field, 'to_array' ) || ! method_exists( $field, 'get_download_url' ) || ! method_exists( $field, 'get_file_name_from_url' ) ) {
            return null;
        }

        $raw = isset( $entry[ (string) $field_id ] ) ? $entry[ (string) $field_id ] : null;
        $files = $field->to_array( $raw );
        if ( ! is_array( $files ) || empty( $files[0] ) || ! is_scalar( $files[0] ) ) {
            return null;
        }

        $stored_url = trim( (string) $files[0] );
        if ( '' === $stored_url ) {
            return null;
        }

        // Gravity Forms 3.x owns file-name parsing. The pinned 3.1.1.1
        // contract returns false or structured metadata with original/sanitized
        // names; the sanitized host basename is the canonical presentation name.
        $name_metadata = $field->get_file_name_from_url( $stored_url );
        if ( ! is_array( $name_metadata ) || ! isset( $name_metadata['sanitized'] ) || ! is_string( $name_metadata['sanitized'] ) ) {
            return null;
        }
        $name = trim( $name_metadata['sanitized'] );
        if ( '' === $name ) {
            return null;
        }

        $url = $field->get_download_url( $stored_url, false, (int) $entry['id'] );
        if ( ! is_string( $url ) || '' === trim( $url ) ) {
            return null;
        }

        $extension = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
        $kind = in_array( $extension, array( 'jpg', 'jpeg', 'png', 'gif', 'webp' ), true ) ? 'image' : 'file';
        return array( 'kind' => $kind, 'url' => $url, 'name' => $name );
    }

    private static function imageThumbnailMarkup( $document, $class_name ) {
        $label = sprintf( __( 'نمایش تصویر %s', 'gravity-presentation-profiles' ), $document['name'] );
        return '<button type="button" class="gpp-entry-dossier__image-trigger ' . esc_attr( $class_name ) . '" data-gpp-image-preview data-gpp-image-src="' . esc_url( $document['url'] ) . '" data-gpp-image-name="' . esc_attr( $document['name'] ) . '" aria-label="' . esc_attr( $label ) . '"><img src="' . esc_url( $document['url'] ) . '" alt="" loading="lazy" /></button>';
    }

    private static function previewDialogMarkup() {
        return '<dialog class="gpp-entry-dossier__preview" data-gpp-image-dialog aria-label="' . esc_attr__( 'پیش‌نمایش تصویر', 'gravity-presentation-profiles' ) . '"><button type="button" class="gpp-entry-dossier__preview-close" data-gpp-image-close aria-label="' . esc_attr__( 'بستن پیش‌نمایش', 'gravity-presentation-profiles' ) . '">×</button><img data-gpp-image-full alt="" /></dialog>';
    }

    private static function currentStep( $entry ) {
        if ( ! class_exists( 'Gravity_Flow_API' ) || ! is_array( $entry ) || empty( $entry['form_id'] ) ) {
            return null;
        }
        $api = new \Gravity_Flow_API( (int) $entry['form_id'] );
        return $api->get_current_step( $entry );
    }

    private static function hostEditableFields( $current_step ) {
        if ( ! $current_step || ! class_exists( 'Gravity_Flow_Entry_Detail' ) || ! method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' ) ) {
            return array();
        }
        if ( ! \Gravity_Flow_Entry_Detail::can_update( $current_step ) || ! method_exists( $current_step, 'get_editable_fields' ) ) {
            return array();
        }
        $fields = $current_step->get_editable_fields();
        return is_array( $fields ) ? $fields : array();
    }

    private static function approvalActionsAreProven( EntryDetailPresentationModel $model, $entry, $current_step ) {
        if ( ! $current_step || ! method_exists( $current_step, 'get_type' ) || 'approval' !== $current_step->get_type() ) {
            return false;
        }
        return $model->runtimeClaimIsProven( $entry, 'workflow.approve_action', 'action_permission' )
            && $model->runtimeClaimIsProven( $entry, 'workflow.reject_action', 'action_permission' );
    }

    private static function canRelabelAction( $step, $slot, $action_key ) {
        if ( ! is_object( $step ) || ! method_exists( $step, 'get_type' ) || 'approval' !== $step->get_type() || ! method_exists( $step, 'get_entry' ) ) {
            return false;
        }
        $entry = $step->get_entry();
        $model = self::model();
        if ( null === $model || ! is_array( $entry ) || ! $model->isPresentationReady( $entry ) ) {
            return false;
        }
        $resolved = $model->resolve( $entry, $slot );
        return ! empty( $resolved['resolved'] )
            && 'gravity_flow.action' === $resolved['source_ref']['type']
            && $action_key === $resolved['source_ref']['action_key']
            && $model->runtimeClaimIsProven( $entry, $slot, 'action_permission' );
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
            // Presentation failure must never replace native Entry Detail.
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
