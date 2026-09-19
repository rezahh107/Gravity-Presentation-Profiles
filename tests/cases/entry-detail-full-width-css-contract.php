<?php

require_once __DIR__ . '/../helpers.php';

$full_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail-full-width.css';
$safe_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail.css';
$full = file_get_contents( $full_path );
$safe = file_get_contents( $safe_path );

gpp_assert_true( is_string( $full ) && '' !== $full, 'Full Width stylesheet must exist.' );
gpp_assert_true( is_string( $safe ) && '' !== $safe, 'Current / Safe stylesheet must remain present.' );

$profile = 'srwf.operations.entry-detail.full-width.v1';
gpp_assert_true( false !== strpos( $full, 'data-gpp-profile-id="' . $profile . '"' ), 'Full Width CSS must be rooted in the lifecycle-backed profile identity.' );
gpp_assert_true( false !== strpos( $full, 'data-gpp-entry-detail="ready"' ), 'Full Width CSS must require admitted Entry Detail output.' );
gpp_assert_true( false !== strpos( $full, 'data-gpp-review-mode="read-only"' ), 'Full Width CSS must be read-only Review scoped.' );

gpp_assert_true( false !== strpos( $full, '#post-body-content' ) && false !== strpos( $full, '#postbox-container-1' ) && false !== strpos( $full, '#postbox-container-2' ), 'Full Width grid must use authentic Gravity Flow sibling regions.' );
gpp_assert_true( false !== strpos( $full, 'display: grid' ), 'Full Width desktop composition must use normal-flow CSS Grid.' );
gpp_assert_true( false !== strpos( $full, '72fr' ) && false !== strpos( $full, '28fr' ), 'Full Width desktop geometry must keep the approved dominant-main/bounded-workflow relationship.' );

foreach ( array( '.site-content', '.grid-container', '.inside-article', '.site-main' ) as $global_selector ) {
    gpp_assert_true( false === strpos( $full, $global_selector ), 'Full Width must not globally rewrite GeneratePress selector ' . $global_selector );
}
foreach ( array( 'position: absolute', 'position:absolute', 'position: fixed', 'position:fixed', 'display: contents', 'display:contents', 'translate(', 'translate3d(' ) as $forbidden ) {
    gpp_assert_true( false === stripos( $full, $forbidden ), 'Full Width must not use forbidden layout method: ' . $forbidden );
}
gpp_assert_true( 0 === preg_match( '/margin(?:-[a-z]+)?\s*:\s*-[0-9]/i', $full ), 'Full Width must not use negative-margin layout hacks.' );

// The Full Width event-card treatment is isolated from PR47 Current / Safe.
gpp_assert_true( 1 === preg_match( '/\.gravityflow-timeline \.gravityflow-note\s*\{[^}]*border:\s*1px solid #e5e7eb;[^}]*border-radius:\s*16px;[^}]*background:\s*#f8fafc;/s', $full ), 'Full Width must style the existing native event wrapper as a neutral card.' );
gpp_assert_true( 1 === preg_match( '/\.gravityflow-timeline \.gravityflow-note\s*\{[^}]*border-top:\s*1px solid #e4e7ec;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s', $safe ), 'Current / Safe Timeline must remain the PR47 neutral non-card chronology.' );

$timeline_start = strpos( $full, 'Timeline stays native' );
gpp_assert_true( false !== $timeline_start, 'Full Width Timeline enforcement boundary must remain explicit.' );
$timeline_css = substr( $full, $timeline_start );
gpp_assert_true( 0 === preg_match( '/approved|rejected|revert|approve|reject|تأیید|رد شد|ارسال شد/i', $timeline_css ), 'Timeline styling must not classify event outcome from visible text or action names.' );

gpp_assert_true( false !== strpos( $full, 'button[value="approved"]' ), 'Native Approve control may receive profile-scoped visual treatment.' );
gpp_assert_true( false !== strpos( $full, 'button[value="rejected"]' ), 'Native Reject control may receive profile-scoped visual treatment.' );
gpp_assert_true( false !== strpos( $full, 'button[value="revert"]' ), 'Native Revert control may receive profile-scoped visual treatment.' );
gpp_assert_true( false !== strpos( $full, 'min-block-size: 48px' ), 'Full Width actions must retain generous interaction targets.' );
gpp_assert_true( false !== strpos( $full, 'outline: 3px solid #2563eb' ), 'Full Width focus-visible treatment must remain explicit.' );
gpp_assert_true( false !== strpos( $full, 'opacity: .48' ), 'Full Width disabled action state must remain visible.' );

gpp_assert_true( false !== strpos( $full, '@media (max-width: 820px)' ), 'Full Width must declare the narrow single-column breakpoint.' );
gpp_assert_true(
    1 === preg_match( '/grid-template-areas:\s*"main"\s*"workflow"\s*"timeline"\s*;/s', $full ),
    'Full Width must collapse to source-order single-column flow without DOM relocation.'
);
gpp_assert_true( false !== strpos( $full, '@media (prefers-reduced-motion: reduce)' ), 'Reduced-motion boundary must remain explicit.' );

echo "ENTRY_DETAIL_FULL_WIDTH_CSS_CONTRACT_PASS\n";
