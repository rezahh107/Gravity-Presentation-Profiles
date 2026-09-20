<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

/**
 * Request-time semantic presentation for the native Gravity Flow Timeline.
 *
 * Gravity Flow remains the source of truth. This adapter reads the official
 * display-time timeline note objects, classifies only bounded proven host
 * signatures, and decorates the already-rendered native event body. It never
 * writes workflow state, reorders notes, or creates a second timeline.
 */
final class EntryDetailTimelineSemanticPresentation {
    const FAMILY_APPROVAL   = 'approval';
    const FAMILY_TRANSITION = 'transition';
    const FAMILY_NOTE       = 'note';
    const FAMILY_SYSTEM     = 'system';
    const FAMILY_UNKNOWN    = 'unknown';

    private static $buffering = false;
    private static $buffer_level = null;
    private static $events = array();

    public static function register() {
        if ( ! function_exists( 'add_action' ) || ! function_exists( 'add_filter' ) ) {
            return;
        }

        add_action( 'gravityflow_entry_detail_content_before', array( __CLASS__, 'beginCapture' ), 1, 2 );
        add_filter( 'gravityflow_timeline_notes', array( __CLASS__, 'captureTimelineEvidence' ), 90, 2 );
        add_action( 'gravityflow_entry_detail_content_after', array( __CLASS__, 'finishCapture' ), 999, 2 );
    }

    public static function beginCapture( $form, $entry ) {
        self::$events = array();
        self::$buffering = false;
        self::$buffer_level = null;

        if ( ! self::isEntryDetailRequest() || ! self::isFullWidthActive() ) {
            return;
        }

        self::$buffer_level = ob_get_level();
        if ( false === ob_start() ) {
            self::$buffer_level = null;
            return;
        }

        self::$buffering = true;
    }

    public static function captureTimelineEvidence( $notes, $entry ) {
        if ( ! self::$buffering || ! is_array( $notes ) || ! is_array( $entry ) ) {
            return $notes;
        }

        $steps = self::stepsForEntry( $entry );
        self::$events = array();

        foreach ( $notes as $note ) {
            self::$events[] = self::classify( $note, $steps );
        }

        return $notes;
    }

    public static function finishCapture( $form, $entry ) {
        if ( ! self::$buffering ) {
            return;
        }

        self::$buffering = false;
        $target_level = is_int( self::$buffer_level ) ? self::$buffer_level : 0;
        self::$buffer_level = null;

        if ( ob_get_level() <= $target_level ) {
            self::$events = array();
            return;
        }

        $html = ob_get_clean();
        while ( ob_get_level() > $target_level ) {
            $html = ob_get_clean() . $html;
        }

        if ( ! is_string( $html ) || '' === $html ) {
            self::$events = array();
            return;
        }

        $admitted = false !== strpos( $html, 'data-gpp-profile-id="' . EntryDetailVisualVariant::PROFILE_FULL_WIDTH . '"' );
        $admitted = $admitted && false !== strpos( $html, 'data-gpp-entry-detail="ready"' );
        $admitted = $admitted && false !== strpos( $html, 'data-gpp-review-mode="read-only"' );

        if ( ! $admitted || array() === self::$events ) {
            echo $html;
            self::$events = array();
            return;
        }

        echo self::decorateNativeTimeline( $html, self::$events );
        self::$events = array();
    }

    private static function classify( $note, array $steps ) {
        $unknown = array(
            'family' => self::FAMILY_UNKNOWN,
            'title' => null,
            'subtitle' => null,
            'destination' => null,
            'evidence' => 'unmatched_native_event',
        );

        if ( ! is_object( $note ) || ! isset( $note->value ) || ! is_scalar( $note->value ) ) {
            return $unknown;
        }
        if ( isset( $note->note_type ) && 'gravityflow' !== (string) $note->note_type ) {
            return $unknown;
        }

        $value = self::normalizeText( (string) $note->value );
        if ( '' === $value ) {
            return $unknown;
        }

        $workflow_submitted = self::normalizeText( self::translate( 'Workflow Submitted' ) );
        if ( $value === $workflow_submitted ) {
            return array(
                'family' => self::FAMILY_SYSTEM,
                'title' => 'جریان کار آغاز شد',
                'subtitle' => 'پرونده وارد جریان کار شد.',
                'destination' => null,
                'evidence' => 'exact_gravityflow_workflow_submitted_signature',
            );
        }

        foreach ( $steps as $step ) {
            if ( ! is_object( $step ) || ! method_exists( $step, 'get_name' ) ) {
                continue;
            }
            $name = self::normalizeText( (string) $step->get_name() );
            if ( '' === $name ) {
                continue;
            }

            $type = method_exists( $step, 'get_type' ) ? (string) $step->get_type() : '';
            if ( 'approval' === $type ) {
                $approved = $name . ': ' . self::normalizeText( self::translate( 'Approved.' ) );
                if ( $value === $approved ) {
                    return array(
                        'family' => self::FAMILY_APPROVAL,
                        'title' => 'پرونده تأیید شد',
                        'subtitle' => 'پرونده بررسی و تأیید شد.',
                        'destination' => null,
                        'evidence' => 'approval_step_plus_exact_approved_signature',
                    );
                }
            }

            $transition_signatures = array(
                self::normalizeText( self::translate( 'Sent to step' ) . ': ' . $name ),
                self::normalizeText( sprintf( self::translate( 'Sent to step: %s' ), $name ) ),
            );
            if ( in_array( $value, array_unique( $transition_signatures ), true ) ) {
                return array(
                    'family' => self::FAMILY_TRANSITION,
                    'title' => 'به مرحله بعد ارسال شد',
                    'subtitle' => 'پرونده به مرحله «' . $name . '» ارسال شد.',
                    'destination' => $name,
                    'evidence' => 'exact_send_to_known_step_signature',
                );
            }
        }

        return $unknown;
    }

    private static function decorateNativeTimeline( $html, array $events ) {
        $index = 0;
        $pattern = '~(<div class="gravityflow-note-body-wrap"><div class="gravityflow-note-body">.*?<div class="gravityflow-note-body">)(.*?)(</div></div></div>)~s';
        $matches = preg_match_all( $pattern, $html, $ignored );
        if ( ! is_int( $matches ) || $matches !== count( $events ) ) {
            return $html;
        }

        $decorated = preg_replace_callback(
            $pattern,
            static function ( $match ) use ( $events, &$index ) {
                $event = isset( $events[ $index ] ) ? $events[ $index ] : null;
                $index++;
                if ( ! is_array( $event ) || self::FAMILY_UNKNOWN === $event['family'] ) {
                    return $match[0];
                }

                $title = esc_html( $event['title'] );
                $subtitle = self::subtitleMarkup( $event );
                $family = esc_attr( $event['family'] );
                $evidence = esc_attr( $event['evidence'] );

                $presentation = '<div class="gpp-timeline-event" dir="rtl" data-gpp-timeline-semantic="' . $family . '" data-gpp-timeline-evidence="' . $evidence . '">';
                $presentation .= '<strong class="gpp-timeline-event__title">' . $title . '</strong>';
                $presentation .= '<span class="gpp-timeline-event__subtitle">' . $subtitle . '</span>';
                $presentation .= '<span class="gpp-timeline-event__native-source" data-gpp-native-event-source="preserved" hidden>' . $match[2] . '</span>';
                $presentation .= '</div>';

                return $match[1] . $presentation . $match[3];
            },
            $html
        );

        return is_string( $decorated ) ? $decorated : $html;
    }

    private static function subtitleMarkup( array $event ) {
        if ( self::FAMILY_TRANSITION === $event['family'] && ! empty( $event['destination'] ) ) {
            return 'پرونده به مرحله «<bdi dir="auto">' . esc_html( $event['destination'] ) . '</bdi>» ارسال شد.';
        }

        return esc_html( $event['subtitle'] );
    }

    private static function stepsForEntry( array $entry ) {
        $form_id = isset( $entry['form_id'] ) ? absint( $entry['form_id'] ) : 0;
        if ( $form_id <= 0 || ! class_exists( 'Gravity_Flow_API' ) ) {
            return array();
        }

        try {
            $api = new \Gravity_Flow_API( $form_id );
            $steps = $api->get_steps();
            return is_array( $steps ) ? $steps : array();
        } catch ( \Throwable $exception ) {
            return array();
        }
    }

    private static function normalizeText( $value ) {
        $value = html_entity_decode( wp_strip_all_tags( (string) $value ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
        $value = str_replace( "\xc2\xa0", ' ', $value );
        $value = preg_replace( '/\s+/u', ' ', $value );
        return trim( is_string( $value ) ? $value : '' );
    }

    private static function translate( $value ) {
        return function_exists( '__' ) ? __( $value, 'gravityflow' ) : $value;
    }

    private static function isEntryDetailRequest() {
        if ( ! isset( $_GET['view'] ) || 'entry' !== sanitize_key( wp_unslash( $_GET['view'] ) ) ) {
            return false;
        }

        $page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
        return in_array( $page, array( 'gravityflow-inbox', 'gravityflow-status' ), true );
    }

    private static function isFullWidthActive() {
        $lifecycle = new VisualPackageLifecycle(
            new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
        );
        $snapshot = $lifecycle->snapshot();
        $activation = isset( $snapshot['activations'][ EntryDetailVisualVariant::SURFACE ] )
            ? $snapshot['activations'][ EntryDetailVisualVariant::SURFACE ]
            : null;

        return is_array( $activation )
            && EntryDetailVisualVariant::PACKAGE_ID === ( isset( $activation['package_id'] ) ? $activation['package_id'] : null )
            && EntryDetailVisualVariant::PACKAGE_VERSION === ( isset( $activation['package_version'] ) ? $activation['package_version'] : null )
            && EntryDetailVisualVariant::PROFILE_FULL_WIDTH === ( isset( $activation['profile_id'] ) ? $activation['profile_id'] : null );
    }
}
