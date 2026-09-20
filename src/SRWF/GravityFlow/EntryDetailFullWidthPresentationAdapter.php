<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Runtime layer for the lifecycle-backed Full Width Entry Detail variant.
 *
 * Gravity Flow continues to own workflow state, authorization, notes, actions,
 * validation and transitions. This adapter adds only scoped presentation assets
 * and a small server-rendered projection of facts already available on the
 * current native Approval step.
 */
final class EntryDetailFullWidthPresentationAdapter {
    private static $full_width_active = null;

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        add_action( 'gravityflow_above_approval_buttons', array( __CLASS__, 'renderWorkflowPanelPresentation' ), 20, 2 );
        add_filter( 'gravityflow_approval_note_label_workflow_detail', array( __CLASS__, 'filterNoteLabel' ), 20, 2 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueAssets' ), 20 );
    }

    public static function renderWorkflowPanelPresentation( $current_step, $form ) {
        if ( ! self::isAdmittedFullWidthReview( $current_step ) || ! is_array( $form ) ) {
            return;
        }

        $payload = self::presentationPayload( $current_step );
        if ( null === $payload ) {
            return;
        }

        echo self::presentationMarkup( $payload );
    }

    private static function presentationMarkup( $payload ) {
        if ( ! is_array( $payload ) || empty( $payload['current_step_label'] ) ) {
            return '';
        }

        $html = '<h3 class="gpp-entry-workflow-panel__title" data-gpp-workflow-panel-presentation="rendered">'
            . esc_html__( 'اقدام شما', 'gravity-presentation-profiles' )
            . '</h3>';
        $html .= '<div class="gpp-entry-workflow-panel__guidance">';
        $html .= '<strong>' . esc_html__( 'این پرونده منتظر اقدام شماست.', 'gravity-presentation-profiles' ) . '</strong>';
        $html .= '<p>' . esc_html__( 'لطفاً پس از بررسی اطلاعات، یکی از گزینه‌های زیر را انتخاب کنید.', 'gravity-presentation-profiles' ) . '</p>';
        $html .= '</div>';
        $html .= '<section class="gpp-entry-workflow-panel__stage">';
        $html .= '<h4>' . esc_html__( 'اطلاعات مرحله فعلی', 'gravity-presentation-profiles' ) . '</h4>';
        $html .= '<dl>';
        $html .= self::factMarkup( 'current-step', 'مرحله', $payload['current_step_label'] );
        if ( null !== $payload['assignee_label'] ) {
            $html .= self::factMarkup( 'assignee', 'تخصیص به', $payload['assignee_label'] );
        }
        if ( null !== $payload['due_date_label'] ) {
            $html .= self::factMarkup( 'due-date', 'مهلت انجام', $payload['due_date_label'] );
        }
        $html .= '</dl>';
        $html .= '</section>';
        $html .= '<p class="gpp-entry-workflow-panel__footer">'
            . esc_html__( 'تمامی عملیات بر اساس تنظیمات Gravity Flow انجام می‌شود.', 'gravity-presentation-profiles' )
            . '</p>';

        return $html;
    }

    public static function filterNoteLabel( $label, $current_step ) {
        if ( ! self::isAdmittedFullWidthReview( $current_step ) ) {
            return $label;
        }

        $note_mode = self::stepSetting( $current_step, 'note_mode' );
        return 'optional' === $note_mode
            ? esc_html__( 'یادداشت (اختیاری)', 'gravity-presentation-profiles' )
            : $label;
    }

    public static function enqueueAssets() {
        if ( ! self::isEntryDetailRequest() || ! self::isFullWidthActive() || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
            return;
        }

        $absolute = dirname( GPP_PLUGIN_FILE ) . '/' . EntryDetailVisualVariant::FULL_WIDTH_STYLE_PATH;
        if ( ! is_readable( $absolute ) ) {
            return;
        }

        wp_enqueue_style(
            EntryDetailVisualVariant::FULL_WIDTH_STYLE_HANDLE,
            plugins_url( EntryDetailVisualVariant::FULL_WIDTH_STYLE_PATH, GPP_PLUGIN_FILE ),
            array( EntryDetailPresentationAdapter::STYLE_HANDLE ),
            self::assetVersion( $absolute )
        );

        $panel_absolute = dirname( GPP_PLUGIN_FILE ) . '/' . EntryDetailVisualVariant::FULL_WIDTH_WORKFLOW_PANEL_STYLE_PATH;
        if ( ! is_readable( $panel_absolute ) ) {
            return;
        }

        wp_enqueue_style(
            EntryDetailVisualVariant::FULL_WIDTH_WORKFLOW_PANEL_STYLE_HANDLE,
            plugins_url( EntryDetailVisualVariant::FULL_WIDTH_WORKFLOW_PANEL_STYLE_PATH, GPP_PLUGIN_FILE ),
            array( EntryDetailVisualVariant::FULL_WIDTH_STYLE_HANDLE ),
            self::assetVersion( $panel_absolute )
        );

        $timeline_absolute = dirname( GPP_PLUGIN_FILE ) . '/' . EntryDetailVisualVariant::FULL_WIDTH_TIMELINE_STYLE_PATH;
        if ( ! is_readable( $timeline_absolute ) ) {
            return;
        }

        wp_enqueue_style(
            EntryDetailVisualVariant::FULL_WIDTH_TIMELINE_STYLE_HANDLE,
            plugins_url( EntryDetailVisualVariant::FULL_WIDTH_TIMELINE_STYLE_PATH, GPP_PLUGIN_FILE ),
            array( EntryDetailVisualVariant::FULL_WIDTH_WORKFLOW_PANEL_STYLE_HANDLE ),
            self::assetVersion( $timeline_absolute )
        );
    }

    /** Test/process reset only; request runtime naturally resolves once. */
    public static function resetRuntimeCache() {
        self::$full_width_active = null;
    }

    private static function isAdmittedFullWidthReview( $current_step ) {
        if ( ! self::isEntryDetailRequest() || ! self::isFullWidthActive() || ! is_object( $current_step ) || ! method_exists( $current_step, 'get_type' ) ) {
            return false;
        }

        try {
            if ( 'approval' !== (string) $current_step->get_type() ) {
                return false;
            }

            if ( class_exists( 'Gravity_Flow_Entry_Detail' ) && method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' )
                && ! \Gravity_Flow_Entry_Detail::can_update( $current_step ) ) {
                return false;
            }

            if ( ! method_exists( $current_step, 'get_editable_fields' ) ) {
                return false;
            }
            $editable_fields = $current_step->get_editable_fields();
            if ( ! is_array( $editable_fields ) ) {
                return false;
            }
            foreach ( $editable_fields as $field_id ) {
                if ( is_scalar( $field_id ) && '' !== trim( (string) $field_id ) ) {
                    return false;
                }
            }
        } catch ( \Throwable $exception ) {
            return false;
        }

        return true;
    }

    /**
     * Build an ephemeral request-only presentation payload from the current
     * native Gravity Flow step. No values are stored or re-resolved elsewhere.
     */
    private static function presentationPayload( $current_step ) {
        if ( ! is_object( $current_step ) || ! method_exists( $current_step, 'get_name' ) ) {
            return null;
        }

        try {
            $step_name = trim( (string) $current_step->get_name() );
        } catch ( \Throwable $exception ) {
            return null;
        }
        if ( '' === $step_name ) {
            return null;
        }

        $assignee_names = array();
        if ( method_exists( $current_step, 'get_assignees' ) ) {
            try {
                $assignees = $current_step->get_assignees();
                if ( is_array( $assignees ) ) {
                    foreach ( $assignees as $assignee ) {
                        if ( ! is_object( $assignee ) || ! method_exists( $assignee, 'get_display_name' ) ) {
                            continue;
                        }
                        $name = trim( (string) $assignee->get_display_name() );
                        if ( '' !== $name ) {
                            $assignee_names[] = $name;
                        }
                    }
                }
            } catch ( \Throwable $exception ) {
                $assignee_names = array();
            }
        }
        $assignee_names = array_values( array_unique( $assignee_names ) );

        $due_label = null;
        if ( method_exists( $current_step, 'supports_due_date' ) && method_exists( $current_step, 'get_due_date_timestamp' ) ) {
            try {
                if ( $current_step->supports_due_date() ) {
                    $due_timestamp = $current_step->get_due_date_timestamp();
                    if ( is_numeric( $due_timestamp ) && (int) $due_timestamp > 0 ) {
                        $due_label = PersianDateFormatter::formatDateTime( (int) $due_timestamp );
                    }
                }
            } catch ( \Throwable $exception ) {
                $due_label = null;
            }
        }

        return array(
            'current_step_label' => $step_name,
            'assignee_label' => empty( $assignee_names ) ? null : implode( '، ', $assignee_names ),
            'due_date_label' => is_string( $due_label ) && '' !== $due_label ? $due_label : null,
        );
    }

    private static function factMarkup( $key, $label, $value ) {
        if ( ! is_string( $value ) || '' === trim( $value ) ) {
            return '';
        }
        return '<dt>' . esc_html( $label ) . '</dt>'
            . '<dd data-gpp-workflow-fact="' . esc_attr( $key ) . '">' . esc_html( $value ) . '</dd>';
    }

    private static function stepSetting( $current_step, $key ) {
        if ( ! is_object( $current_step ) ) {
            return null;
        }
        try {
            if ( method_exists( $current_step, 'get_setting' ) ) {
                $value = $current_step->get_setting( $key );
                if ( is_scalar( $value ) ) {
                    return (string) $value;
                }
            }
            if ( isset( $current_step->{$key} ) && is_scalar( $current_step->{$key} ) ) {
                return (string) $current_step->{$key};
            }
        } catch ( \Throwable $exception ) {
            return null;
        }
        return null;
    }

    private static function isFullWidthActive() {
        if ( null !== self::$full_width_active ) {
            return self::$full_width_active;
        }

        self::$full_width_active = false;
        try {
            $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $activation = $visual->resolve( EntryDetailVisualVariant::SURFACE );
        } catch ( \Throwable $exception ) {
            return false;
        }

        self::$full_width_active = is_array( $activation )
            && EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_ID === ( isset( $activation['package_id'] ) ? $activation['package_id'] : null )
            && EntryDetailVisualVariant::FULL_WIDTH_PACKAGE_VERSION === ( isset( $activation['package_version'] ) ? $activation['package_version'] : null )
            && EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID === ( isset( $activation['profile_id'] ) ? $activation['profile_id'] : null );

        return self::$full_width_active;
    }

    /**
     * Match the existing Entry Detail/Print utility request boundary: a concrete
     * Entry Detail view and entry ID are required, and admin rendering is
     * limited to Gravity Flow Inbox Entry Detail. Frontend Entry Detail keeps
     * the same view/lid seam without introducing theme-wide asset delivery.
     */
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
        if ( function_exists( 'hash_file' ) ) {
            $hash = hash_file( 'sha256', $absolute_path );
            if ( is_string( $hash ) && '' !== $hash ) {
                return substr( $hash, 0, 16 );
            }
        }
        return false;
    }
}
