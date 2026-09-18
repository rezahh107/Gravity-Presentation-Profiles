<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
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

    const VALUE_MAPPED = 'MAPPED_VALUE';
    const VALUE_EMPTY = 'MAPPED_EMPTY';
    const VALUE_UNMAPPED = 'UNMAPPED';
    const VALUE_STALE = 'STALE_SOURCE';
    const VALUE_HIDDEN = 'HOST_HIDDEN';
    const VALUE_UNAVAILABLE = 'SOURCE_UNAVAILABLE';
    const VALUE_UNSUPPORTED = 'UNSUPPORTED_SOURCE';

    private static $model_loaded = false;
    private static $model = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        // Source-proven Gravity Flow 3.1.0 seam. It executes only after the
        // host's own Entry Detail permission gate has admitted this request.
        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderDossier' ), 20, 2 );
        add_filter( 'gravityflow_approve_label_workflow_detail', array( __CLASS__, 'filterApproveLabel' ), 20, 2 );
        add_filter( 'gravityflow_reject_label_workflow_detail', array( __CLASS__, 'filterRejectLabel' ), 20, 2 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
    }

    public static function resetRuntimeCache() {
        self::$model_loaded = false;
        self::$model = null;
        RuntimeDiagnostics::resetSurface( self::SURFACE );
    }

    public static function renderDossier( $form, $entry ) {
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_HOST_SEAM',
            RuntimeDecisionTrace::RESULT_PASS,
            'post_permission_seam_reached',
            'host_authorization_preserved'
        );

        $model = self::model();
        if ( null === $model ) {
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_PRESENTATION_OUTPUT',
                RuntimeDecisionTrace::RESULT_SKIP,
                'profile_not_active',
                'native_gravity_flow_entry_detail'
            );
            return;
        }

        if ( ! self::hostPayloadMatches( $form, $entry ) ) {
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_BINDING_READINESS',
                RuntimeDecisionTrace::RESULT_FAIL,
                'invalid_or_mismatched_host_context',
                'native_gravity_flow_entry_detail'
            );
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_PRESENTATION_OUTPUT',
                RuntimeDecisionTrace::RESULT_SKIP,
                'presentation_not_ready',
                'native_gravity_flow_entry_detail'
            );
            return;
        }

        $capabilities = self::structuralCapabilities( $entry );
        $decision = $model->presentationReadiness( $entry, $capabilities );
        if ( empty( $decision['ready'] ) ) {
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_BINDING_READINESS',
                RuntimeDecisionTrace::RESULT_FAIL,
                self::structuralFailureReason( $decision ),
                'native_gravity_flow_entry_detail'
            );
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_PRESENTATION_OUTPUT',
                RuntimeDecisionTrace::RESULT_SKIP,
                'presentation_not_ready',
                'native_gravity_flow_entry_detail'
            );
            return;
        }
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_BINDING_READINESS',
            RuntimeDecisionTrace::RESULT_PASS,
            'structural_readiness_satisfied'
        );

        self::recordOptionalRegionCapabilities( $capabilities );

        $current_step = self::currentStep( $entry );
        $eligibility = self::approvalProcessingEligibility( $current_step );
        $actionable = ! empty( $eligibility['eligible'] );
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_APPROVAL_ELIGIBILITY',
            $actionable ? RuntimeDecisionTrace::RESULT_PASS : RuntimeDecisionTrace::RESULT_SKIP,
            $actionable ? 'native_current_assignee_can_update' : $eligibility['reason']
        );

        $editable_fields = $actionable ? self::hostEditableFields( $current_step ) : array();

        echo '<div class="gpp-entry-dossier" dir="rtl" data-gpp-entry-detail="ready" data-gpp-profile-id="' . esc_attr( $model->profileId() ) . '"';
        echo ' data-gpp-host-editable="' . ( empty( $editable_fields ) ? '0' : '1' ) . '"';
        echo ' data-gpp-actions-expected="' . ( $actionable ? '1' : '0' ) . '" data-gpp-composition-state="pending">';

        self::renderIdentitySection( $model, $form, $entry, $current_step );

        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__task" data-gpp-section="current-task">';
        echo '<h2 class="gpp-entry-dossier__task-heading">' . esc_html__( 'کاری که الان باید انجام دهید', 'gravity-presentation-profiles' ) . '</h2>';
        self::renderFact( $model, $form, $entry, $current_step, 'workflow.current_step', 'مرحله جاری', 'gpp-entry-dossier__task-step' );
        echo '<div class="gpp-entry-dossier__native-instructions" data-gpp-native-instructions></div>';
        echo '<div class="gpp-entry-dossier__native-editor" data-gpp-native-editor></div>';
        if ( $actionable ) {
            echo '<div class="gpp-entry-dossier__native-actions" data-gpp-native-actions></div>';
        }
        echo '</section>';

        self::renderFactsSection( $model, $form, $entry, $current_step );
        self::renderDocumentsSection( $model, $form, $entry, $current_step );

        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__history" data-gpp-section="history" data-gpp-optional-history>'; 
        echo '<details data-gpp-history-details>';
        echo '<summary>' . esc_html__( 'سوابق بررسی پرونده', 'gravity-presentation-profiles' ) . '</summary>';
        echo '<p class="gpp-entry-dossier__history-help">' . esc_html__( 'اینجا می‌توانید ببینید پرونده در چه تاریخ‌هایی بررسی شده، چه نتیجه‌ای ثبت شده و اگر برای اصلاح برگشته، دلیل آن چه بوده است.', 'gravity-presentation-profiles' ) . '</p>';
        echo '<div data-gpp-native-history></div>';
        echo '</details>';
        echo '</section>';

        echo self::previewDialogMarkup();
        echo '</div>';

        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_PRESENTATION_OUTPUT',
            RuntimeDecisionTrace::RESULT_PASS,
            'gpp_enhanced_entry_detail_emitted'
        );
    }

    public static function filterApproveLabel( $label, $step ) {
        return self::canRelabelAction( $step )
            ? __( 'تأیید پرونده', 'gravity-presentation-profiles' )
            : $label;
    }

    public static function filterRejectLabel( $label, $step ) {
        return self::canRelabelAction( $step )
            ? __( 'رد پرونده', 'gravity-presentation-profiles' )
            : $label;
    }

    public static function enqueueAssets() {
        if ( null === self::model() || ! defined( 'GPP_PLUGIN_FILE' ) ) {
            return;
        }

        $plugin_root = dirname( GPP_PLUGIN_FILE );
        $style_path = 'assets/css/srwf-gravity-flow-entry-detail.css';
        $script_path = 'assets/js/srwf-gravity-flow-entry-detail.js';

        if ( function_exists( 'wp_enqueue_style' ) ) {
            wp_enqueue_style(
                self::STYLE_HANDLE,
                plugins_url( $style_path, GPP_PLUGIN_FILE ),
                array(),
                self::assetVersion( $plugin_root . '/' . $style_path )
            );
        }
        if ( function_exists( 'wp_enqueue_script' ) ) {
            wp_enqueue_script(
                self::SCRIPT_HANDLE,
                plugins_url( $script_path, GPP_PLUGIN_FILE ),
                array(),
                self::assetVersion( $plugin_root . '/' . $script_path ),
                true
            );
        }
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

    private static function hostPayloadMatches( $form, $entry ) {
        if ( ! is_array( $form ) || ! is_array( $entry ) || empty( $form['id'] ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
            return false;
        }
        return (string) $form['id'] === (string) $entry['form_id'];
    }

    private static function renderIdentitySection( EntryDetailPresentationModel $model, $form, $entry, $current_step ) {
        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__identity" data-gpp-section="identity">';
        echo '<div class="gpp-entry-dossier__identity-main">';

        $photo_state = self::semanticDecision( $model, $form, $entry, $current_step, 'student.photo' );
        self::recordSemanticDecision( 'student.photo', $photo_state );
        if ( self::VALUE_MAPPED === $photo_state['state'] ) {
            $photo = self::documentFromDecision( $photo_state, $entry );
            if ( null !== $photo && 'image' === $photo['kind'] ) {
                echo self::imageThumbnailMarkup( $photo, 'gpp-entry-dossier__student-photo' );
            }
        } elseif ( self::isVisiblePlaceholderState( $photo_state['state'] ) ) {
            echo '<div class="gpp-entry-dossier__student-photo gpp-entry-dossier__slot-state" data-gpp-slot="student.photo">' . esc_html( self::placeholderForState( $photo_state['state'] ) ) . '</div>';
        }

        echo '<div class="gpp-entry-dossier__identity-text">';
        $name_state = self::semanticDecision( $model, $form, $entry, $current_step, 'student.full_name' );
        self::recordSemanticDecision( 'student.full_name', $name_state );
        $name = self::displayTextForDecision( $name_state );
        echo '<h1 data-gpp-slot="student.full_name">' . esc_html( null === $name ? '—' : $name ) . '</h1>';
        echo '<dl class="gpp-entry-dossier__facts gpp-entry-dossier__facts--identity">';
        self::renderFact( $model, $form, $entry, $current_step, 'student.national_id', 'کد ملی' );
        self::renderFact( $model, $form, $entry, $current_step, 'student.father_name', 'نام پدر' );
        self::renderFact( $model, $form, $entry, $current_step, 'student.birth_date_jalali', 'تاریخ تولد' );
        self::renderFact( $model, $form, $entry, $current_step, 'student.gender', 'جنسیت' );
        echo '</dl>';
        echo '</div></div></section>';
    }

    private static function renderFactsSection( EntryDetailPresentationModel $model, $form, $entry, $current_step ) {
        echo '<section class="gpp-entry-dossier__section" data-gpp-section="facts">';
        echo '<h2>' . esc_html__( 'اطلاعات پرونده', 'gravity-presentation-profiles' ) . '</h2>';
        echo '<dl class="gpp-entry-dossier__facts">';
        self::renderFact( $model, $form, $entry, $current_step, 'student.mobile', 'تلفن همراه دانش‌آموز' );
        self::renderFact( $model, $form, $entry, $current_step, 'student.home_phone', 'تلفن منزل' );
        self::renderFact( $model, $form, $entry, $current_step, 'student.father_mobile', 'تلفن همراه پدر' );
        self::renderFact( $model, $form, $entry, $current_step, 'student.mother_mobile', 'تلفن همراه مادر' );
        self::renderFact( $model, $form, $entry, $current_step, 'education.level', 'مقطع تحصیلی' );
        self::renderFact( $model, $form, $entry, $current_step, 'education.grade_group', 'پایه / گروه' );
        self::renderFact( $model, $form, $entry, $current_step, 'education.graduation_status', 'وضعیت تحصیلی' );
        self::renderFact( $model, $form, $entry, $current_step, 'school.name', 'مدرسه' );
        self::renderFact( $model, $form, $entry, $current_step, 'registration.center', 'مرکز ثبت‌نام' );
        self::renderFact( $model, $form, $entry, $current_step, 'review.status', 'وضعیت بررسی' );
        self::renderFact( $model, $form, $entry, $current_step, 'review.reason', 'توضیح بررسی' );
        self::renderFact( $model, $form, $entry, $current_step, 'finance.status', 'وضعیت مالی' );
        self::renderFact( $model, $form, $entry, $current_step, 'finance.tuition_amount', 'شهریه' );
        self::renderFact( $model, $form, $entry, $current_step, 'finance.discount_amount', 'تخفیف' );
        self::renderFact( $model, $form, $entry, $current_step, 'finance.discount_title', 'عنوان تخفیف' );
        self::renderFact( $model, $form, $entry, $current_step, 'finance.net_payable_amount', 'خالص قابل پرداخت' );
        echo '</dl></section>';
    }

    private static function renderDocumentsSection( EntryDetailPresentationModel $model, $form, $entry, $current_step ) {
        $decision = self::semanticDecision( $model, $form, $entry, $current_step, 'documents.report_card' );
        self::recordSemanticDecision( 'documents.report_card', $decision );

        if ( in_array( $decision['state'], array( self::VALUE_HIDDEN, self::VALUE_UNAVAILABLE ), true ) ) {
            return;
        }

        echo '<section class="gpp-entry-dossier__section gpp-entry-dossier__documents" data-gpp-section="documents">';
        echo '<h2>' . esc_html__( 'مدارک', 'gravity-presentation-profiles' ) . '</h2>';
        echo '<div class="gpp-entry-dossier__document" data-gpp-slot="documents.report_card">';
        echo '<span class="gpp-entry-dossier__document-label">' . esc_html__( 'کارنامه', 'gravity-presentation-profiles' ) . '</span>';

        if ( self::VALUE_MAPPED === $decision['state'] ) {
            $document = self::documentFromDecision( $decision, $entry );
            if ( null !== $document && 'image' === $document['kind'] ) {
                echo self::imageThumbnailMarkup( $document, 'gpp-entry-dossier__document-thumbnail' );
            } elseif ( null !== $document ) {
                echo '<a class="gpp-entry-dossier__file-link" href="' . esc_url( $document['url'] ) . '" target="_blank" rel="noopener">' . esc_html( $document['name'] ) . '</a>';
            }
        } elseif ( self::isVisiblePlaceholderState( $decision['state'] ) ) {
            echo '<span class="gpp-entry-dossier__slot-state">' . esc_html( self::placeholderForState( $decision['state'] ) ) . '</span>';
        }
        echo '</div></section>';
    }

    private static function renderFact( EntryDetailPresentationModel $model, $form, $entry, $current_step, $slot, $label, $class_name = '' ) {
        $decision = self::semanticDecision( $model, $form, $entry, $current_step, $slot );
        self::recordSemanticDecision( $slot, $decision );

        if ( in_array( $decision['state'], array( self::VALUE_HIDDEN, self::VALUE_UNAVAILABLE ), true ) ) {
            return;
        }

        $value = self::displayTextForDecision( $decision );
        if ( null === $value ) {
            return;
        }

        $class = 'gpp-entry-dossier__fact' . ( '' !== $class_name ? ' ' . $class_name : '' );
        echo '<div class="' . esc_attr( $class ) . '" data-gpp-slot="' . esc_attr( $slot ) . '">';
        echo '<dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( $value ) . '</dd></div>';
    }

    private static function semanticDecision( EntryDetailPresentationModel $model, $form, $entry, $current_step, $slot ) {
        if ( $model->isDerivedSlot( $slot ) ) {
            return self::derivedSemanticDecision( $model, $form, $entry, $current_step, $slot );
        }

        $resolved = $model->resolve( $entry, $slot );
        if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) ) {
            $reason = isset( $resolved['reason'] ) ? (string) $resolved['reason'] : '';
            if ( 'source_adapter_not_admitted' === $reason ) {
                return self::valueDecision( self::VALUE_UNSUPPORTED, null, null, null, $reason );
            }
            return self::valueDecision( self::VALUE_UNMAPPED, null, null, null, '' !== $reason ? $reason : 'binding_not_proven' );
        }

        $source = $resolved['source_ref'];
        if ( 'gravity_forms.field' === $source['type'] ) {
            if ( ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
                return self::valueDecision( self::VALUE_UNAVAILABLE, null, $source, null, 'gravity_forms_field_api_unavailable' );
            }
            $field = \GFAPI::get_field( $form, $source['field_id'] );
            if ( ! is_object( $field ) ) {
                return self::valueDecision( self::VALUE_STALE, null, $source, null, 'mapped_field_missing' );
            }

            $visibility = ( new EntryDetailFieldVisibility() )->decide( $field, $form, $entry, $current_step );
            if ( empty( $visibility['proven'] ) ) {
                return self::valueDecision( self::VALUE_UNAVAILABLE, null, $source, $field, $visibility['reason'] );
            }
            if ( empty( $visibility['visible'] ) ) {
                return self::valueDecision( self::VALUE_HIDDEN, null, $source, $field, 'host_hidden' );
            }

            $value = self::normalizedTextValue( self::readSourceValue( $source, $form, $entry ) );
            return null === $value
                ? self::valueDecision( self::VALUE_EMPTY, null, $source, $field, 'mapped_value_empty' )
                : self::valueDecision( self::VALUE_MAPPED, $value, $source, $field, null );
        }

        $value = self::normalizedTextValue( self::readSourceValue( $source, $form, $entry ) );
        return null === $value
            ? self::valueDecision( self::VALUE_EMPTY, null, $source, null, 'mapped_value_empty' )
            : self::valueDecision( self::VALUE_MAPPED, $value, $source, null, null );
    }

    private static function derivedSemanticDecision( EntryDetailPresentationModel $model, $form, $entry, $current_step, $slot ) {
        $components = $model->derivationComponents( $slot );
        if ( empty( $components ) ) {
            return self::valueDecision( self::VALUE_UNSUPPORTED, null, null, null, 'derived_components_unavailable' );
        }

        $parts = array();
        foreach ( $components as $component ) {
            $decision = self::semanticDecision( $model, $form, $entry, $current_step, $component );
            self::recordSemanticDecision( $component, $decision );
            if ( self::VALUE_MAPPED === $decision['state'] ) {
                $parts[] = $decision['value'];
                continue;
            }
            if ( self::VALUE_HIDDEN === $decision['state'] ) {
                return self::valueDecision( self::VALUE_HIDDEN, null, null, null, 'derived_component_host_hidden' );
            }
            if ( self::VALUE_UNAVAILABLE === $decision['state'] ) {
                return self::valueDecision( self::VALUE_UNAVAILABLE, null, null, null, 'derived_component_source_unavailable' );
            }
            if ( self::VALUE_STALE === $decision['state'] ) {
                return self::valueDecision( self::VALUE_STALE, null, null, null, 'derived_component_stale' );
            }
            if ( self::VALUE_UNSUPPORTED === $decision['state'] ) {
                return self::valueDecision( self::VALUE_UNSUPPORTED, null, null, null, 'derived_component_unsupported' );
            }
            if ( self::VALUE_UNMAPPED === $decision['state'] ) {
                return self::valueDecision( self::VALUE_UNMAPPED, null, null, null, 'derived_component_unmapped' );
            }
            return self::valueDecision( self::VALUE_EMPTY, null, null, null, 'derived_component_empty' );
        }

        $value = trim( implode( ' ', $parts ) );
        return '' === $value
            ? self::valueDecision( self::VALUE_EMPTY, null, null, null, 'derived_value_empty' )
            : self::valueDecision( self::VALUE_MAPPED, $value, null, null, null );
    }

    private static function valueDecision( $state, $value, $source, $field, $reason ) {
        return array(
            'state' => $state,
            'value' => $value,
            'source_ref' => $source,
            'field' => $field,
            'reason' => $reason,
        );
    }

    private static function displayTextForDecision( $decision ) {
        if ( self::VALUE_MAPPED === $decision['state'] ) {
            return $decision['value'];
        }
        if ( self::isVisiblePlaceholderState( $decision['state'] ) ) {
            return self::placeholderForState( $decision['state'] );
        }
        return null;
    }

    private static function isVisiblePlaceholderState( $state ) {
        return in_array( $state, array( self::VALUE_EMPTY, self::VALUE_UNMAPPED, self::VALUE_STALE, self::VALUE_UNSUPPORTED ), true );
    }

    private static function placeholderForState( $state ) {
        if ( self::VALUE_EMPTY === $state ) {
            return __( 'ثبت نشده', 'gravity-presentation-profiles' );
        }
        if ( in_array( $state, array( self::VALUE_STALE, self::VALUE_UNSUPPORTED ), true ) ) {
            return __( 'نگاشت معتبر نیست', 'gravity-presentation-profiles' );
        }
        return __( 'نگاشت نشده', 'gravity-presentation-profiles' );
    }

    private static function recordSemanticDecision( $slot, $decision ) {
        if ( ! is_array( $decision ) || empty( $decision['state'] ) || self::VALUE_MAPPED === $decision['state'] ) {
            return;
        }
        $state = strtolower( $decision['state'] );
        $reason = 'semantic.' . strtolower( preg_replace( '/[^a-z0-9_.-]+/i', '_', $slot ) ) . '.' . $state;
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_SEMANTIC_COMPLETENESS',
            RuntimeDecisionTrace::RESULT_SKIP,
            substr( $reason, 0, 96 ),
            in_array( $decision['state'], array( self::VALUE_HIDDEN, self::VALUE_UNAVAILABLE ), true ) ? 'blank_unproven_value' : null
        );
    }

    private static function normalizedTextValue( $value ) {
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
        return ( new BoundHostValueReader() )->readDisplay( $source, $form, $entry );
    }

    private static function documentFromDecision( $decision, $entry ) {
        if ( self::VALUE_MAPPED !== $decision['state'] || ! is_object( $decision['field'] ) || ! is_array( $decision['source_ref'] ) ) {
            return null;
        }
        $field = $decision['field'];
        if ( 'fileupload' !== $field->type || ! method_exists( $field, 'to_array' ) || ! method_exists( $field, 'get_download_url' ) || ! method_exists( $field, 'get_file_name_from_url' ) ) {
            return null;
        }

        $field_id = (string) $decision['source_ref']['field_id'];
        $raw = array_key_exists( $field_id, $entry ) ? $entry[ $field_id ] : null;
        $files = $field->to_array( $raw );
        $stored_url = self::singleAuthoritativeFile( $files );
        if ( null === $stored_url || '' === $stored_url ) {
            return null;
        }

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

    private static function singleAuthoritativeFile( $files ) {
        if ( ! is_array( $files ) ) {
            return null;
        }

        $candidates = array_values(
            array_filter(
                $files,
                static function ( $file ) {
                    return is_scalar( $file ) && '' !== trim( (string) $file );
                }
            )
        );

        return 1 === count( $candidates ) ? trim( (string) $candidates[0] ) : null;
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
        try {
            $api = new \Gravity_Flow_API( (int) $entry['form_id'] );
            return $api->get_current_step( $entry );
        } catch ( \Throwable $exception ) {
            return null;
        }
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

    private static function approvalProcessingEligibility( $current_step ) {
        if ( ! is_object( $current_step ) || ! method_exists( $current_step, 'get_type' ) ) {
            return array( 'eligible' => false, 'reason' => 'current_step_unavailable' );
        }
        if ( 'approval' !== $current_step->get_type() ) {
            return array( 'eligible' => false, 'reason' => 'current_step_not_approval' );
        }
        if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) || ! method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' ) ) {
            return array( 'eligible' => false, 'reason' => 'native_update_predicate_unavailable' );
        }

        try {
            if ( ! \Gravity_Flow_Entry_Detail::can_update( $current_step ) ) {
                return array( 'eligible' => false, 'reason' => 'current_assignee_not_eligible' );
            }
        } catch ( \Throwable $exception ) {
            return array( 'eligible' => false, 'reason' => 'native_update_predicate_failed' );
        }

        return array( 'eligible' => true, 'reason' => null );
    }

    private static function canRelabelAction( $step ) {
        if ( ! is_object( $step ) || ! method_exists( $step, 'get_entry' ) ) {
            return false;
        }

        $entry = $step->get_entry();
        $model = self::model();
        if ( null === $model || ! is_array( $entry ) ) {
            return false;
        }

        if ( ! $model->isPresentationReady( $entry, self::structuralCapabilities( $entry ) ) ) {
            return false;
        }

        $eligibility = self::approvalProcessingEligibility( $step );
        return ! empty( $eligibility['eligible'] );
    }

    private static function structuralCapabilities( $entry ) {
        $entry_detail_available = class_exists( 'Gravity_Flow_Entry_Detail' );
        $approval_actions_available = class_exists( 'Gravity_Flow_Step_Approval' )
            && method_exists( 'Gravity_Flow_Step_Approval', 'get_actions' )
            && method_exists( 'Gravity_Flow_Step_Approval', 'workflow_detail_status_box_actions' )
            && $entry_detail_available
            && method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' );

        return array(
            'entry.created_at' => class_exists( 'GFAPI' ) && method_exists( 'GFAPI', 'get_entry' ),
            'workflow.current_step' => class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_current_step' ),
            'workflow.status' => class_exists( 'Gravity_Flow_API' ) && method_exists( 'Gravity_Flow_API', 'get_status' ),
            'workflow.instructions' => $entry_detail_available && method_exists( 'Gravity_Flow_Entry_Detail', 'maybe_show_instructions' ),
            'workflow.approve_action' => $approval_actions_available,
            'workflow.reject_action' => $approval_actions_available,
            'workflow.timeline' => $entry_detail_available && method_exists( 'Gravity_Flow_Entry_Detail', 'maybe_show_timeline' ),
            'navigation.backlink' => $entry_detail_available && method_exists( 'Gravity_Flow_Entry_Detail', 'maybe_display_back_link' ),
            'print.utility' => PrintDossierRuntime::utilityAvailable( $entry ),
        );
    }

    private static function recordOptionalRegionCapabilities( $capabilities ) {
        foreach ( array( 'workflow.instructions', 'workflow.timeline', 'navigation.backlink', 'print.utility' ) as $slot ) {
            if ( ! empty( $capabilities[ $slot ] ) ) {
                continue;
            }
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_OPTIONAL_REGIONS',
                RuntimeDecisionTrace::RESULT_SKIP,
                substr( 'region.' . $slot . '.unavailable', 0, 96 )
            );
        }
    }

    private static function structuralFailureReason( $decision ) {
        $reason = isset( $decision['reason'] ) && is_string( $decision['reason'] )
            ? $decision['reason']
            : 'not_ready';
        $code = 'structural.' . $reason;
        $code = strtolower( preg_replace( '/[^a-z0-9_.-]+/i', '_', $code ) );
        return substr( $code, 0, 96 );
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
                RuntimeDiagnostics::recordOnce(
                    self::SURFACE,
                    'ENTRY_DETAIL_PROFILE_RESOLUTION',
                    RuntimeDecisionTrace::RESULT_NOT_APPLICABLE,
                    'profile_not_active',
                    'native_gravity_flow_entry_detail'
                );
                return null;
            }
            $profile = $visual->effectiveProfile( self::SURFACE );
            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $profile || null === $package ) {
                RuntimeDiagnostics::recordOnce(
                    self::SURFACE,
                    'ENTRY_DETAIL_PROFILE_RESOLUTION',
                    RuntimeDecisionTrace::RESULT_FAIL,
                    'profile_resolution_unavailable',
                    'native_gravity_flow_entry_detail'
                );
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
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_PROFILE_RESOLUTION',
                RuntimeDecisionTrace::RESULT_PASS
            );
        } catch ( \Throwable $exception ) {
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'ENTRY_DETAIL_PROFILE_RESOLUTION',
                'runtime_exception',
                'native_gravity_flow_entry_detail',
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
