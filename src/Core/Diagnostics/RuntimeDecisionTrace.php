<?php

namespace GravityPresentationProfiles\Core\Diagnostics;

final class RuntimeDecisionTrace {
    const SCHEMA_VERSION = '1.0.0';

    const RESULT_PASS = 'PASS';
    const RESULT_SKIP = 'SKIP';
    const RESULT_FAIL = 'FAIL';
    const RESULT_NOT_APPLICABLE = 'NOT_APPLICABLE';

    private const MAX_EVENTS = 40;

    private const STAGES = array(
        'GF_PROFILE_SELECTION' => array( 'surface' => 'gravity_forms.form', 'label' => 'Form presentation profile' ),
        'GF_ASSET_READINESS' => array( 'surface' => 'gravity_forms.form', 'label' => 'Form presentation assets' ),
        'GF_PRESENTATION_APPLIED' => array( 'surface' => 'gravity_forms.form', 'label' => 'Form presentation applied' ),
        'INBOX_PROFILE_RESOLUTION' => array( 'surface' => 'gravity_flow.inbox', 'label' => 'Inbox presentation profile' ),
        'INBOX_BINDING_READINESS' => array( 'surface' => 'gravity_flow.inbox', 'label' => 'Inbox semantic bindings' ),
        'INBOX_PRESENTATION_OUTPUT' => array( 'surface' => 'gravity_flow.inbox', 'label' => 'Inbox presentation output' ),
        'ENTRY_DETAIL_HOST_SEAM' => array( 'surface' => 'gravity_flow.entry_detail', 'label' => 'Entry Detail host permission seam' ),
        'ENTRY_DETAIL_PROFILE_RESOLUTION' => array( 'surface' => 'gravity_flow.entry_detail', 'label' => 'Entry Detail presentation profile' ),
        'ENTRY_DETAIL_BINDING_READINESS' => array( 'surface' => 'gravity_flow.entry_detail', 'label' => 'Entry Detail semantic bindings' ),
        'ENTRY_DETAIL_PRESENTATION_OUTPUT' => array( 'surface' => 'gravity_flow.entry_detail', 'label' => 'Entry Detail presentation output' ),
        // WU19 stage identities are intentionally retained so Print evidence and
        // consumers migrate into the shared trace model without a vocabulary break.
        'PRINT_DOSSIER_REQUEST' => array( 'surface' => 'print.dossier', 'label' => 'Dossier Print request' ),
        'HOST_PRINT_CONTEXT_ADMITTED' => array( 'surface' => 'print.dossier', 'label' => 'Gravity Flow Print permission seam' ),
        'PRINT_PROFILE_RESOLVED' => array( 'surface' => 'print.dossier', 'label' => 'Print presentation profile' ),
        'PRINT_BINDINGS_EVALUATED' => array( 'surface' => 'print.dossier', 'label' => 'Print semantic bindings' ),
        'PRINT_COMPOSITION_READY' => array( 'surface' => 'print.dossier', 'label' => 'Two-page dossier composition' ),
    );

    private const SURFACE_LABELS = array(
        'gravity_forms.form' => 'Gravity Forms form',
        'gravity_flow.inbox' => 'Gravity Flow Inbox',
        'gravity_flow.entry_detail' => 'Gravity Flow Entry Detail',
        'print.dossier' => 'Dossier Print',
    );

    private const FALLBACK_LABELS = array(
        'native_gravity_forms_form' => 'The native Gravity Forms form remains authoritative and usable.',
        'native_gravity_flow_inbox' => 'The native Gravity Flow Inbox remains authoritative and usable.',
        'native_gravity_flow_entry_detail' => 'The native Gravity Flow Entry Detail remains authoritative and usable.',
        'host_authorization_preserved' => 'Gravity Flow authorization remains the authority for this request.',
        'dossier_not_rendered' => 'The GPP dossier was not produced rather than emitting unsafe or incomplete output.',
        'blank_unproven_value' => 'The unproven value was left blank rather than guessed or reused.',
    );

    private $surface;
    private $events = array();

    public function __construct( $surface ) {
        if ( ! isset( self::SURFACE_LABELS[ $surface ] ) ) {
            throw new \InvalidArgumentException( 'Unknown GPP diagnostics surface.' );
        }
        $this->surface = $surface;
    }

    public function surface() {
        return $this->surface;
    }

    public function record( $stage, $result, $reason_code = null, $fallback = null, $exception = null ) {
        if ( ! isset( self::STAGES[ $stage ] ) || self::STAGES[ $stage ]['surface'] !== $this->surface ) {
            return false;
        }
        if ( ! in_array( $result, array( self::RESULT_PASS, self::RESULT_SKIP, self::RESULT_FAIL, self::RESULT_NOT_APPLICABLE ), true ) ) {
            return false;
        }
        if ( null !== $reason_code && ( ! is_string( $reason_code ) || 1 !== preg_match( '/^[a-z0-9_.-]{1,96}$/', $reason_code ) ) ) {
            return false;
        }
        if ( null !== $fallback && ( ! is_string( $fallback ) || 1 !== preg_match( '/^[a-z0-9_.-]{1,96}$/', $fallback ) ) ) {
            return false;
        }

        $event = array(
            'seq' => count( $this->events ) + 1,
            'stage' => $stage,
            'result' => $result,
            'reason_code' => $reason_code,
            'fallback' => $fallback,
        );
        if ( is_array( $exception ) && ! empty( $exception ) ) {
            $event['exception'] = $exception;
        }

        $this->events[] = $event;
        if ( count( $this->events ) > self::MAX_EVENTS ) {
            $this->events = array_slice( $this->events, -1 * self::MAX_EVENTS );
            foreach ( $this->events as $index => &$kept ) {
                $kept['seq'] = $index + 1;
            }
            unset( $kept );
        }
        return true;
    }

    public function events() {
        return $this->events;
    }

    public function status() {
        $has_pass = false;
        $has_skip = false;
        foreach ( $this->events as $event ) {
            if ( self::RESULT_FAIL === $event['result'] ) {
                return 'FAIL';
            }
            if ( self::RESULT_SKIP === $event['result'] ) {
                $has_skip = true;
            }
            if ( self::RESULT_PASS === $event['result'] ) {
                $has_pass = true;
            }
        }
        if ( $has_skip ) {
            return 'DEGRADED';
        }
        if ( $has_pass ) {
            return 'PASS';
        }
        return 'NOT_APPLICABLE';
    }

    public function snapshot() {
        return array(
            'schema_version' => self::SCHEMA_VERSION,
            'surface' => $this->surface,
            'status' => $this->status(),
            'events' => $this->events,
        );
    }

    public static function safeException( \Throwable $exception ) {
        $fact = array(
            'class' => get_class( $exception ),
            'frames' => array(),
        );
        if ( is_int( $exception->getCode() ) && 0 !== $exception->getCode() ) {
            $fact['code'] = $exception->getCode();
        }

        $frames = array_merge(
            array( array( 'file' => $exception->getFile(), 'line' => $exception->getLine(), 'class' => null, 'function' => null ) ),
            $exception->getTrace()
        );
        foreach ( $frames as $frame ) {
            $class = isset( $frame['class'] ) && is_string( $frame['class'] ) ? $frame['class'] : '';
            $file = isset( $frame['file'] ) && is_string( $frame['file'] ) ? str_replace( '\\', '/', $frame['file'] ) : '';
            $relative = self::gppRelativePath( $file, $class );
            if ( null === $relative ) {
                continue;
            }
            $safe = array( 'path' => $relative );
            if ( isset( $frame['line'] ) && is_int( $frame['line'] ) ) {
                $safe['line'] = $frame['line'];
            }
            if ( '' !== $class && 0 === strpos( $class, 'GravityPresentationProfiles\\' ) ) {
                $safe['class'] = $class;
            }
            if ( isset( $frame['function'] ) && is_string( $frame['function'] ) && 1 === preg_match( '/^[A-Za-z0-9_]+$/', $frame['function'] ) ) {
                $safe['function'] = $frame['function'];
            }
            $fact['frames'][] = $safe;
            if ( count( $fact['frames'] ) >= 4 ) {
                break;
            }
        }

        return $fact;
    }

    public static function validateSnapshot( $snapshot ) {
        if ( ! is_array( $snapshot ) || self::SCHEMA_VERSION !== ( isset( $snapshot['schema_version'] ) ? $snapshot['schema_version'] : null ) ) {
            return false;
        }
        if ( ! isset( self::SURFACE_LABELS[ $snapshot['surface'] ] ) || ! is_array( $snapshot['events'] ) || count( $snapshot['events'] ) > self::MAX_EVENTS ) {
            return false;
        }
        if ( ! in_array( $snapshot['status'], array( 'PASS', 'DEGRADED', 'FAIL', 'NOT_APPLICABLE' ), true ) ) {
            return false;
        }
        foreach ( $snapshot['events'] as $event ) {
            if ( ! is_array( $event ) || ! isset( $event['stage'], $event['result'], $event['seq'] ) || ! isset( self::STAGES[ $event['stage'] ] ) ) {
                return false;
            }
            if ( self::STAGES[ $event['stage'] ]['surface'] !== $snapshot['surface'] || ! in_array( $event['result'], array( self::RESULT_PASS, self::RESULT_SKIP, self::RESULT_FAIL, self::RESULT_NOT_APPLICABLE ), true ) ) {
                return false;
            }
        }
        return true;
    }

    public static function stageLabel( $stage ) {
        return isset( self::STAGES[ $stage ] ) ? self::STAGES[ $stage ]['label'] : $stage;
    }

    public static function surfaceLabel( $surface ) {
        return isset( self::SURFACE_LABELS[ $surface ] ) ? self::SURFACE_LABELS[ $surface ] : $surface;
    }

    public static function fallbackLabel( $fallback ) {
        return isset( self::FALLBACK_LABELS[ $fallback ] ) ? self::FALLBACK_LABELS[ $fallback ] : $fallback;
    }

    private static function gppRelativePath( $file, $class ) {
        $src_pos = strpos( $file, '/src/' );
        if ( false !== $src_pos && ( '' === $class || 0 === strpos( $class, 'GravityPresentationProfiles\\' ) ) ) {
            return 'src/' . substr( $file, $src_pos + 5 );
        }
        return null;
    }
}
