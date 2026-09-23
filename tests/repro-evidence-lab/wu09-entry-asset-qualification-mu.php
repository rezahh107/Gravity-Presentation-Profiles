<?php
/**
 * WU09 evidence-only asset-delivery qualification shim.
 *
 * This file is copied into the disposable WU18 runtime as an mu-plugin. It
 * deliberately does not ship as production code. It removes the current broad
 * base asset delivery and replays the two candidate rules under qualification:
 * early request-gated CSS and post-admission footer JS.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

function gpp_wu09_candidate_entry_detail_request() {
    if ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() ) {
        return false;
    }
    if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
        return false;
    }

    $page = isset( $_GET['page'] ) && is_string( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
    $view = isset( $_GET['view'] ) && is_string( $_GET['view'] ) ? sanitize_key( wp_unslash( $_GET['view'] ) ) : '';
    $form_id = isset( $_GET['id'] ) ? absint( wp_unslash( $_GET['id'] ) ) : 0;
    $entry_id = isset( $_GET['lid'] ) ? absint( wp_unslash( $_GET['lid'] ) ) : 0;

    return 'gravityflow-inbox' === $page && 'entry' === $view && $form_id > 0 && $entry_id > 0;
}

function gpp_wu09_trace_has_admitted_dossier() {
    $trace = RuntimeDiagnostics::snapshot( EntryDetailPresentationAdapter::SURFACE );
    if ( ! is_array( $trace ) || empty( $trace['events'] ) || ! is_array( $trace['events'] ) ) {
        return false;
    }

    $output_pass = false;
    $suppression_pass = false;
    foreach ( $trace['events'] as $event ) {
        if ( 'ENTRY_DETAIL_PRESENTATION_OUTPUT' === ( $event['stage'] ?? null )
            && 'PASS' === ( $event['result'] ?? null )
            && 'gpp_read_only_review_dossier_emitted' === ( $event['reason_code'] ?? null ) ) {
            $output_pass = true;
        }
        if ( 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION' === ( $event['stage'] ?? null )
            && 'PASS' === ( $event['result'] ?? null )
            && 'server_admitted_read_only_gpp_review' === ( $event['reason_code'] ?? null ) ) {
            $suppression_pass = true;
        }
    }

    return $output_pass && $suppression_pass;
}

function gpp_wu09_filter_current_asset_delivery() {
    if ( ! class_exists( EntryDetailPresentationAdapter::class ) ) {
        return;
    }

    // Preserve the production profile/model decision as the source of truth:
    // only keep CSS if production itself admitted the active profile/model.
    if ( wp_style_is( EntryDetailPresentationAdapter::STYLE_HANDLE, 'enqueued' )
        && ! gpp_wu09_candidate_entry_detail_request() ) {
        wp_dequeue_style( EntryDetailPresentationAdapter::STYLE_HANDLE );
    }

    // Remove the current early JS delivery everywhere. The qualification hook
    // below may re-enqueue this already-registered handle after dossier PASS.
    if ( wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'enqueued' ) ) {
        wp_dequeue_script( EntryDetailPresentationAdapter::SCRIPT_HANDLE );
    }
}
add_action( 'admin_enqueue_scripts', 'gpp_wu09_filter_current_asset_delivery', 999 );
add_action( 'wp_enqueue_scripts', 'gpp_wu09_filter_current_asset_delivery', 999 );

$GLOBALS['gpp_wu09_late_enqueue_count'] = 0;

function gpp_wu09_enqueue_script_after_admission() {
    if ( ! gpp_wu09_candidate_entry_detail_request() || ! gpp_wu09_trace_has_admitted_dossier() ) {
        return;
    }

    // Production registered this exact handle/path/version during the normal
    // enqueue lifecycle; re-enqueueing the registered handle uses WordPress's
    // own footer/once-only registry instead of a custom loader.
    if ( wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'registered' ) ) {
        wp_enqueue_script( EntryDetailPresentationAdapter::SCRIPT_HANDLE );
        ++$GLOBALS['gpp_wu09_late_enqueue_count'];
    }
}
add_action( 'gravityflow_entry_detail_content_before', 'gpp_wu09_enqueue_script_after_admission', 21, 2 );

function gpp_wu09_emit_qualification_state() {
    if ( ! class_exists( EntryDetailPresentationAdapter::class ) ) {
        return;
    }

    echo '<div id="gpp-wu09-qualification-state" hidden'
        . ' data-candidate-request="' . ( gpp_wu09_candidate_entry_detail_request() ? '1' : '0' ) . '"'
        . ' data-style-enqueued="' . ( wp_style_is( EntryDetailPresentationAdapter::STYLE_HANDLE, 'enqueued' ) ? '1' : '0' ) . '"'
        . ' data-script-enqueued="' . ( wp_script_is( EntryDetailPresentationAdapter::SCRIPT_HANDLE, 'enqueued' ) ? '1' : '0' ) . '"'
        . ' data-admission-pass="' . ( gpp_wu09_trace_has_admitted_dossier() ? '1' : '0' ) . '"'
        . ' data-late-enqueue-count="' . (int) $GLOBALS['gpp_wu09_late_enqueue_count'] . '"'
        . '></div>';
}
add_action( 'admin_footer', 'gpp_wu09_emit_qualification_state', 9999 );
add_action( 'wp_footer', 'gpp_wu09_emit_qualification_state', 9999 );
