<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Additive presentation for the Owner-approved SRWF registration-operator journey.
 *
 * Gravity Flow remains authoritative for workflow mutation, confirmation,
 * authorization, assignment, User Input editing and final state. This adapter
 * only renders navigation/orientation/result presentation after a fresh host
 * read-back establishes the corresponding state.
 */
final class EntryDetailJourneyPresentationAdapter {
    const SURFACE = 'gravity_flow.entry_detail';
    const STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail-journey';

    const STATE_REVIEW = 'review';
    const STATE_APPROVED = 'approved';
    const STATE_REJECTED = 'rejected';
    const STATE_CORRECTION = 'correction';
    const STATE_UNKNOWN = 'unknown';
    const STATE_NATIVE = 'native';

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'renderJourneyPresentation' ), 15, 2 );
        add_filter( 'gravityflow_back_link_url_entry_detail', array( __CLASS__, 'filterNativeBackLinkUrl' ), 20, 2 );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
        add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueueStyles' ), 20 );
    }

    public static function enqueueStyles() {
        if ( ! EntryDetailRequestReachability::isReachable() || ! self::srwfEntryDetailProfileActive()
            || ! defined( 'GPP_PLUGIN_FILE' ) || ! function_exists( 'wp_enqueue_style' ) ) {
            return;
        }

        $plugin_root = dirname( GPP_PLUGIN_FILE );
        $style_path = 'assets/css/srwf-gravity-flow-entry-detail-journey.css';
        wp_enqueue_style(
            self::STYLE_HANDLE,
            plugins_url( $style_path, GPP_PLUGIN_FILE ),
            array( EntryDetailPresentationAdapter::STYLE_HANDLE ),
            self::assetVersion( $plugin_root . '/' . $style_path )
        );
    }

    public static function renderJourneyPresentation( $form, $entry ) {
        if ( ! EntryDetailRequestReachability::isReachable() || ! self::hostPayloadMatches( $form, $entry ) ) {
            return;
        }

        $model = self::admittedPresentationModel( $entry );
        if ( null === $model ) {
            return;
        }

        $canonical_url = self::canonicalInboxUrl();
        if ( null === $canonical_url ) {
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_JOURNEY_RETURN_ROUTE',
                RuntimeDecisionTrace::RESULT_SKIP,
                'canonical_inbox_route_unavailable',
                'native_gravity_flow_entry_detail'
            );
            return;
        }

        $truth = self::freshHostTruth( $entry );
        $state = self::classifyHostTruth(
            isset( $truth['current_step_type'] ) ? $truth['current_step_type'] : null,
            isset( $truth['current_step_can_update'] ) ? $truth['current_step_can_update'] : null,
            isset( $truth['final_status'] ) ? $truth['final_status'] : null,
            isset( $truth['api_status'] ) ? $truth['api_status'] : null,
            ! empty( $truth['established'] )
        );

        if ( self::STATE_NATIVE === $state ) {
            return;
        }

        $native_back_link = self::frontendNativeBackLinkConfigured();
        $identity = self::caseIdentity(
            $model,
            $form,
            ! empty( $truth['entry'] ) && is_array( $truth['entry'] ) ? $truth['entry'] : $entry,
            isset( $truth['current_step'] ) ? $truth['current_step'] : null
        );
        $profile_id = $model->profileId();

        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_JOURNEY_RETURN_ROUTE',
            RuntimeDecisionTrace::RESULT_PASS,
            $native_back_link ? 'native_back_link_canonicalized' : 'gpp_page_level_return_rendered'
        );

        if ( self::STATE_REVIEW === $state ) {
            if ( ! $native_back_link ) {
                echo self::returnNavigationMarkup( $canonical_url, $profile_id );
            }
            return;
        }

        if ( self::STATE_CORRECTION === $state ) {
            if ( ! $native_back_link ) {
                echo self::returnNavigationMarkup( $canonical_url, $profile_id );
            }
            echo self::correctionOrientationMarkup( $identity, $profile_id );
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_JOURNEY_RESULT',
                RuntimeDecisionTrace::RESULT_PASS,
                'authoritative_user_input_correction'
            );
            return;
        }

        if ( self::STATE_APPROVED === $state || self::STATE_REJECTED === $state ) {
            echo self::resultMarkup( $state, $identity, $canonical_url, $profile_id, ! $native_back_link );
            RuntimeDiagnostics::recordOnce(
                self::SURFACE,
                'ENTRY_DETAIL_JOURNEY_RESULT',
                RuntimeDecisionTrace::RESULT_PASS,
                'authoritative_' . $state
            );
            return;
        }

        echo self::resultMarkup( self::STATE_UNKNOWN, $identity, $canonical_url, $profile_id, ! $native_back_link );
        RuntimeDiagnostics::recordOnce(
            self::SURFACE,
            'ENTRY_DETAIL_JOURNEY_RESULT',
            RuntimeDecisionTrace::RESULT_SKIP,
            'authoritative_truth_ambiguous',
            'unknown_fail_closed_presentation'
        );
    }

    public static function filterNativeBackLinkUrl( $url, $args = array() ) {
        if ( ! EntryDetailRequestReachability::isReachable() ) {
            return $url;
        }

        $entry_id = isset( $_GET['lid'] ) ? absint( wp_unslash( $_GET['lid'] ) ) : 0;
        if ( $entry_id < 1 || ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_entry' ) ) {
            return $url;
        }
        $entry = \GFAPI::get_entry( $entry_id );
        if ( ! is_array( $entry ) || null === self::admittedPresentationModel( $entry ) ) {
            return $url;
        }

        $canonical = self::canonicalInboxUrl();
        return null === $canonical ? $url : $canonical;
    }

    /**
     * Pure taxonomy boundary. It deliberately has no Technical Error state.
     * The caller may render semantic success only from a fresh established host
     * snapshot; all other terminal ambiguity fails closed to Unknown/native.
     */
    private static function classifyHostTruth( $current_step_type, $current_step_can_update, $final_status, $api_status, $established ) {
        if ( ! $established ) {
            return self::STATE_NATIVE;
        }

        $step_type = is_string( $current_step_type ) ? strtolower( trim( $current_step_type ) ) : null;
        $final = is_scalar( $final_status ) ? strtolower( trim( (string) $final_status ) ) : '';
        $api = is_scalar( $api_status ) ? strtolower( trim( (string) $api_status ) ) : '';

        if ( 'approval' === $step_type ) {
            return self::STATE_REVIEW;
        }
        if ( 'user_input' === $step_type ) {
            return true === $current_step_can_update ? self::STATE_CORRECTION : self::STATE_NATIVE;
        }
        if ( null !== $step_type && '' !== $step_type ) {
            return self::STATE_NATIVE;
        }

        if ( 'approved' === $final && 'approved' === $api ) {
            return self::STATE_APPROVED;
        }
        if ( 'rejected' === $final && 'rejected' === $api ) {
            return self::STATE_REJECTED;
        }

        if ( '' === $final && '' === $api ) {
            return self::STATE_NATIVE;
        }

        return self::STATE_UNKNOWN;
    }

    private static function freshHostTruth( $entry ) {
        $fallback = array(
            'established' => false,
            'entry' => null,
            'current_step' => null,
            'current_step_type' => null,
            'current_step_can_update' => null,
            'final_status' => null,
            'api_status' => null,
        );

        if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] )
            || ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_entry' )
            || ! class_exists( 'Gravity_Flow_API' ) || ! function_exists( 'gform_get_meta' ) ) {
            return $fallback;
        }

        try {
            $fresh_entry = \GFAPI::get_entry( (int) $entry['id'] );
            if ( ! is_array( $fresh_entry ) || empty( $fresh_entry['form_id'] )
                || (string) $fresh_entry['form_id'] !== (string) $entry['form_id'] ) {
                return $fallback;
            }

            $api = new \Gravity_Flow_API( (int) $fresh_entry['form_id'] );
            $step = $api->get_current_step( $fresh_entry );
            $step_type = null;
            $can_update = null;
            if ( $step ) {
                if ( ! is_object( $step ) || ! method_exists( $step, 'get_type' ) ) {
                    return $fallback;
                }
                $step_type = (string) $step->get_type();
                if ( 'user_input' === $step_type ) {
                    if ( ! class_exists( 'Gravity_Flow_Entry_Detail' ) || ! method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' ) ) {
                        return $fallback;
                    }
                    $can_update = (bool) \Gravity_Flow_Entry_Detail::can_update( $step );
                }
            }

            return array(
                'established' => true,
                'entry' => $fresh_entry,
                'current_step' => $step,
                'current_step_type' => $step_type,
                'current_step_can_update' => $can_update,
                'final_status' => (string) gform_get_meta( (int) $fresh_entry['id'], 'workflow_final_status' ),
                'api_status' => (string) $api->get_status( $fresh_entry ),
            );
        } catch ( \Throwable $exception ) {
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'ENTRY_DETAIL_JOURNEY_READBACK',
                'host_readback_failed',
                'native_gravity_flow_entry_detail',
                $exception
            );
            return $fallback;
        }
    }

    private static function canonicalInboxUrl() {
        if ( function_exists( 'is_admin' ) && is_admin() ) {
            return function_exists( 'admin_url' ) ? admin_url( 'admin.php?page=gravityflow-inbox' ) : null;
        }

        if ( ! function_exists( 'get_queried_object' ) || ! function_exists( 'get_permalink' ) ) {
            return null;
        }
        $object = get_queried_object();
        if ( ! is_object( $object ) || empty( $object->ID ) ) {
            return null;
        }
        $url = get_permalink( (int) $object->ID );
        return is_string( $url ) && '' !== trim( $url ) ? $url : null;
    }

    private static function frontendNativeBackLinkConfigured() {
        if ( function_exists( 'is_admin' ) && is_admin() ) {
            return false;
        }
        if ( ! function_exists( 'get_queried_object' ) ) {
            return false;
        }
        $object = get_queried_object();
        if ( ! is_object( $object ) || ! isset( $object->post_content ) || ! is_string( $object->post_content ) ) {
            return false;
        }

        return self::shortcodeBackLinkConfigured( $object->post_content )
            || self::blockBackLinkConfigured( $object->post_content );
    }

    private static function shortcodeBackLinkConfigured( $content ) {
        if ( ! function_exists( 'get_shortcode_regex' ) || ! function_exists( 'shortcode_parse_atts' ) || ! function_exists( 'shortcode_exists' )
            || ! shortcode_exists( 'gravityflow' ) ) {
            return false;
        }
        $pattern = get_shortcode_regex( array( 'gravityflow' ) );
        $count = preg_match_all( '/' . $pattern . '/s', $content, $matches, PREG_SET_ORDER );
        if ( ! is_int( $count ) || $count < 1 ) {
            return false;
        }
        foreach ( $matches as $match ) {
            if ( ! isset( $match[2], $match[3] ) || 'gravityflow' !== $match[2] ) {
                continue;
            }
            $atts = shortcode_parse_atts( $match[3] );
            if ( ! is_array( $atts ) ) {
                continue;
            }
            $page = isset( $atts['page'] ) ? sanitize_key( (string) $atts['page'] ) : 'inbox';
            if ( ! in_array( $page, array( 'inbox', 'status' ), true ) ) {
                continue;
            }
            return isset( $atts['back_link'] ) && self::truthyAttribute( $atts['back_link'] );
        }
        return false;
    }

    private static function blockBackLinkConfigured( $content ) {
        if ( ! function_exists( 'parse_blocks' ) ) {
            return false;
        }
        return self::blocksContainBackLink( parse_blocks( $content ) );
    }

    private static function blocksContainBackLink( $blocks ) {
        if ( ! is_array( $blocks ) ) {
            return false;
        }
        foreach ( $blocks as $block ) {
            if ( ! is_array( $block ) ) {
                continue;
            }
            $name = isset( $block['blockName'] ) ? (string) $block['blockName'] : '';
            if ( in_array( $name, array( 'gravityflow/inbox', 'gravityflow/status' ), true ) ) {
                $attrs = isset( $block['attrs'] ) && is_array( $block['attrs'] ) ? $block['attrs'] : array();
                foreach ( array( 'back_link', 'backLink', 'backlink' ) as $key ) {
                    if ( array_key_exists( $key, $attrs ) && self::truthyAttribute( $attrs[ $key ] ) ) {
                        return true;
                    }
                }
            }
            if ( ! empty( $block['innerBlocks'] ) && self::blocksContainBackLink( $block['innerBlocks'] ) ) {
                return true;
            }
        }
        return false;
    }

    private static function truthyAttribute( $value ) {
        if ( true === $value || 1 === $value ) {
            return true;
        }
        if ( ! is_scalar( $value ) ) {
            return false;
        }
        return in_array( strtolower( trim( (string) $value ) ), array( '1', 'true', 'yes', 'on' ), true );
    }

    private static function admittedPresentationModel( $entry ) {
        if ( ! is_array( $entry ) || empty( $entry['id'] ) || empty( $entry['form_id'] ) ) {
            return null;
        }

        try {
            $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $activation = $visual->resolve( self::SURFACE );
            if ( null === $activation ) {
                return null;
            }
            $profile = $visual->effectiveProfile( self::SURFACE );
            if ( ! is_array( $profile ) || empty( $profile['profile_id'] ) || ! self::isJourneyProfileId( $profile['profile_id'] ) ) {
                return null;
            }
            $package = self::activeVisualPackage( $visual->snapshot(), $activation );
            if ( null === $package ) {
                return null;
            }

            $bindings = new BindingSetLifecycle(
                new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
                new EvidenceReferenceGate( array() )
            );
            $model = new EntryDetailPresentationModel(
                $profile,
                self::activeBindingSets( $bindings->snapshot() ),
                $package['semantic_slots']
            );
            $readiness = $model->presentationReadiness( $entry, array() );
            return ! empty( $readiness['ready'] ) ? $model : null;
        } catch ( \Throwable $exception ) {
            RuntimeDiagnostics::recordException(
                self::SURFACE,
                'ENTRY_DETAIL_JOURNEY_ADMISSION',
                'presentation_context_unavailable',
                'native_gravity_flow_entry_detail',
                $exception
            );
            return null;
        }
    }

    private static function srwfEntryDetailProfileActive() {
        try {
            $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
            $profile = $visual->effectiveProfile( self::SURFACE );
            return is_array( $profile ) && ! empty( $profile['profile_id'] ) && self::isJourneyProfileId( $profile['profile_id'] );
        } catch ( \Throwable $exception ) {
            return false;
        }
    }

    private static function isJourneyProfileId( $profile_id ) {
        return in_array(
            (string) $profile_id,
            array( EntryDetailVisualVariant::CURRENT_SAFE_PROFILE_ID, EntryDetailVisualVariant::FULL_WIDTH_PROFILE_ID ),
            true
        );
    }

    private static function caseIdentity( EntryDetailPresentationModel $model, $form, $entry, $current_step ) {
        $first = self::visibleMappedFieldValue( $model, $form, $entry, $current_step, 'student.first_name' );
        $last = self::visibleMappedFieldValue( $model, $form, $entry, $current_step, 'student.last_name' );
        $national_id = self::visibleMappedFieldValue( $model, $form, $entry, $current_step, 'student.national_id' );
        $name = trim( implode( ' ', array_filter( array( $first, $last ), static function ( $value ) { return null !== $value && '' !== $value; } ) ) );

        return array(
            'name' => '' !== $name ? $name : null,
            'national_id' => $national_id,
            'entry_id' => isset( $entry['id'] ) ? (int) $entry['id'] : 0,
        );
    }

    private static function visibleMappedFieldValue( EntryDetailPresentationModel $model, $form, $entry, $current_step, $slot ) {
        try {
            $resolved = $model->resolve( $entry, $slot );
            if ( empty( $resolved['resolved'] ) || empty( $resolved['source_ref'] ) || 'gravity_forms.field' !== $resolved['source_ref']['type']
                || ! class_exists( 'GFAPI' ) || ! method_exists( 'GFAPI', 'get_field' ) ) {
                return null;
            }
            $field = \GFAPI::get_field( $form, $resolved['source_ref']['field_id'] );
            if ( ! is_object( $field ) ) {
                return null;
            }
            $visibility = ( new EntryDetailFieldVisibility() )->decide( $field, $form, $entry, $current_step );
            if ( empty( $visibility['proven'] ) || empty( $visibility['visible'] ) ) {
                return null;
            }
            $value = ( new BoundHostValueReader() )->readDisplay( $resolved['source_ref'], $form, $entry );
            if ( ! is_scalar( $value ) ) {
                return null;
            }
            $value = trim( wp_strip_all_tags( (string) $value ) );
            return '' === $value ? null : $value;
        } catch ( \Throwable $exception ) {
            return null;
        }
    }

    private static function returnNavigationMarkup( $url, $profile_id ) {
        return '<nav class="gpp-entry-journey-nav" dir="rtl" data-gpp-entry-journey="return" data-gpp-profile-id="' . esc_attr( $profile_id ) . '" aria-label="' . esc_attr__( 'ناوبری پرونده', 'gravity-presentation-profiles' ) . '"><a class="gpp-entry-journey__return" href="' . esc_url( $url ) . '">' . esc_html__( 'بازگشت به کارهای من', 'gravity-presentation-profiles' ) . '</a></nav>';
    }

    private static function correctionOrientationMarkup( $identity, $profile_id ) {
        $html = '<section class="gpp-entry-journey gpp-entry-journey--correction" dir="rtl" data-gpp-entry-journey="correction" data-gpp-profile-id="' . esc_attr( $profile_id ) . '" role="status" aria-labelledby="gpp-entry-journey-correction-title">';
        $html .= self::stateIconMarkup( self::STATE_CORRECTION );
        $html .= '<div class="gpp-entry-journey__body"><h2 id="gpp-entry-journey-correction-title">' . esc_html__( 'پرونده برای اصلاح بازگردانده شد', 'gravity-presentation-profiles' ) . '</h2>';
        $html .= '<p>' . esc_html__( 'فقط فیلدهایی را که Gravity Flow در فرم زیر قابل ویرایش کرده است اصلاح کنید و سپس فرم را با مسیر اصلی تکمیل کنید.', 'gravity-presentation-profiles' ) . '</p>';
        $html .= self::caseContextMarkup( $identity );
        $html .= '</div></section>';
        return $html;
    }

    private static function resultMarkup( $state, $identity, $url, $profile_id, $include_return ) {
        $copy = self::resultCopy( $state );
        $html = '<section class="gpp-entry-journey-result gpp-entry-journey-result--' . esc_attr( $state ) . '" dir="rtl" data-gpp-entry-journey-result="' . esc_attr( $state ) . '" data-gpp-profile-id="' . esc_attr( $profile_id ) . '" role="status" aria-labelledby="gpp-entry-journey-result-title">';
        $html .= self::stateIconMarkup( $state );
        $html .= '<h2 id="gpp-entry-journey-result-title">' . esc_html( $copy['title'] ) . '</h2>';
        $html .= '<p>' . esc_html( $copy['body'] ) . '</p>';
        $html .= self::caseContextMarkup( $identity );
        if ( $include_return ) {
            $html .= '<a class="gpp-entry-journey__return gpp-entry-journey-result__return" href="' . esc_url( $url ) . '">' . esc_html__( 'بازگشت به کارهای من', 'gravity-presentation-profiles' ) . '</a>';
        }
        $html .= '</section>';
        return $html;
    }

    private static function resultCopy( $state ) {
        if ( self::STATE_APPROVED === $state ) {
            return array(
                'title' => __( 'پرونده تأیید شد', 'gravity-presentation-profiles' ),
                'body' => __( 'وضعیت نهایی تأیید از Gravity Flow دوباره خوانده و تأیید شد.', 'gravity-presentation-profiles' ),
            );
        }
        if ( self::STATE_REJECTED === $state ) {
            return array(
                'title' => __( 'پرونده رد شد', 'gravity-presentation-profiles' ),
                'body' => __( 'وضعیت نهایی رد از Gravity Flow دوباره خوانده و تأیید شد.', 'gravity-presentation-profiles' ),
            );
        }
        return array(
            'title' => __( 'نتیجه نهایی هنوز مشخص نیست', 'gravity-presentation-profiles' ),
            'body' => __( 'برای جلوگیری از تکرار عملیات، نتیجه‌ای فرض نشده است. به کارهای من برگردید و وضعیت پرونده را از مسیر اصلی بررسی کنید.', 'gravity-presentation-profiles' ),
        );
    }

    private static function caseContextMarkup( $identity ) {
        $items = array();
        if ( ! empty( $identity['name'] ) ) {
            $items[] = '<div><dt>' . esc_html__( 'داوطلب', 'gravity-presentation-profiles' ) . '</dt><dd>' . esc_html( $identity['name'] ) . '</dd></div>';
        }
        if ( ! empty( $identity['national_id'] ) ) {
            $items[] = '<div><dt>' . esc_html__( 'کد ملی', 'gravity-presentation-profiles' ) . '</dt><dd><bdi>' . esc_html( $identity['national_id'] ) . '</bdi></dd></div>';
        }
        if ( empty( $items ) && ! empty( $identity['entry_id'] ) ) {
            $items[] = '<div><dt>' . esc_html__( 'پرونده', 'gravity-presentation-profiles' ) . '</dt><dd><bdi>#' . esc_html( (string) $identity['entry_id'] ) . '</bdi></dd></div>';
        }
        return empty( $items ) ? '' : '<dl class="gpp-entry-journey__case-context">' . implode( '', $items ) . '</dl>';
    }

    private static function stateIconMarkup( $state ) {
        if ( self::STATE_APPROVED === $state ) {
            $path = '<path d="M7 12.5l3.2 3.2L17.5 8.5"/>';
        } elseif ( self::STATE_REJECTED === $state ) {
            $path = '<path d="M8.5 8.5l7 7m0-7l-7 7"/>';
        } elseif ( self::STATE_CORRECTION === $state ) {
            $path = '<path d="M8 7h8v8H9m0 0l3-3m-3 3l3 3"/>';
        } else {
            $path = '<path d="M9.7 9.2a2.5 2.5 0 014.8.9c0 1.9-2.5 2.1-2.5 4M12 17.5h.01"/>';
        }
        return '<span class="gpp-entry-journey__symbol" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"/>' . $path . '</svg></span>';
    }

    private static function hostPayloadMatches( $form, $entry ) {
        return is_array( $form ) && is_array( $entry ) && ! empty( $form['id'] ) && ! empty( $entry['id'] ) && ! empty( $entry['form_id'] )
            && (string) $form['id'] === (string) $entry['form_id'];
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
}
