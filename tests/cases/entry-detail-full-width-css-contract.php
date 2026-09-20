<?php

require_once __DIR__ . '/../helpers.php';

$full_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail-full-width.css';
$panel_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail-full-width-workflow-panel.css';
$timeline_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail-full-width-timeline.css';
$safe_path = dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail.css';
$variant_path = dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/EntryDetailVisualVariant.php';
$adapter_path = dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/EntryDetailFullWidthPresentationAdapter.php';
$full = file_get_contents( $full_path );
$panel = file_get_contents( $panel_path );
$timeline = file_get_contents( $timeline_path );
$safe = file_get_contents( $safe_path );
$variant = file_get_contents( $variant_path );
$adapter = file_get_contents( $adapter_path );

gpp_assert_true( is_string( $full ) && '' !== $full, 'Full Width stylesheet must exist.' );
gpp_assert_true( is_string( $panel ) && '' !== $panel, 'Full Width workflow-panel refinement stylesheet must exist.' );
gpp_assert_true( is_string( $timeline ) && '' !== $timeline, 'Full Width Timeline refinement stylesheet must exist.' );
gpp_assert_true( is_string( $safe ) && '' !== $safe, 'Current / Safe stylesheet must remain present.' );
gpp_assert_true( is_string( $variant ) && is_string( $adapter ), 'Full Width asset registration sources must be readable.' );

$profile = 'srwf.operations.entry-detail.full-width.v1';
gpp_assert_true( false !== strpos( $full, 'data-gpp-profile-id="' . $profile . '"' ), 'Full Width CSS must be rooted in the lifecycle-backed profile identity.' );
gpp_assert_true( false !== strpos( $full, 'data-gpp-entry-detail="ready"' ), 'Full Width CSS must require admitted Entry Detail output.' );
gpp_assert_true( false !== strpos( $full, 'data-gpp-review-mode="read-only"' ), 'Full Width CSS must be read-only Review scoped.' );
gpp_assert_true( false !== strpos( $panel, 'data-gpp-profile-id="' . $profile . '"' ), 'Workflow-panel refinement must use the same Full Width profile identity.' );
gpp_assert_true( false !== strpos( $panel, 'data-gpp-entry-detail="ready"' ) && false !== strpos( $panel, 'data-gpp-review-mode="read-only"' ), 'Workflow-panel refinement must remain admitted read-only Review scoped.' );
gpp_assert_true( false !== strpos( $timeline, 'data-gpp-profile-id="' . $profile . '"' ), 'Timeline refinement must use the same lifecycle-backed Full Width profile identity.' );
gpp_assert_true( false !== strpos( $timeline, 'data-gpp-entry-detail="ready"' ) && false !== strpos( $timeline, 'data-gpp-review-mode="read-only"' ), 'Timeline refinement must remain admitted read-only Review scoped.' );
gpp_assert_true( false === strpos( $panel, '.gpp-entry-dossier__' ) && false === strpos( $panel, '.gravityflow-timeline' ), 'Workflow-panel refinement must not style dossier or Timeline regions.' );

gpp_assert_true( false !== strpos( $full, '#post-body-content' ) && false !== strpos( $full, '#postbox-container-1' ) && false !== strpos( $full, '#postbox-container-2' ), 'Full Width grid must use authentic Gravity Flow sibling regions.' );
gpp_assert_true( false !== strpos( $full, 'display: grid' ), 'Full Width desktop composition must use normal-flow CSS Grid.' );
gpp_assert_true( false !== strpos( $full, '72fr' ) && false !== strpos( $full, '28fr' ), 'Full Width desktop geometry must keep the approved dominant-main/bounded-workflow relationship.' );
gpp_assert_true( 1 === preg_match( '/#poststuff #post-body\s*\{[^}]*margin:\s*0;/s', $full ), 'Full Width must neutralize WordPress columns-2 parent offset after becoming the grid owner.' );
gpp_assert_true( false !== strpos( $full, '#poststuff #post-body > #postbox-container-1' ) && false !== strpos( $full, '#poststuff #post-body > #postbox-container-2' ), 'Full Width must use sufficiently specific, profile-scoped native-column offset resets.' );

foreach ( array( '.site-content', '.grid-container', '.inside-article', '.site-main' ) as $global_selector ) {
    gpp_assert_true( false === strpos( $full, $global_selector ), 'Full Width must not globally rewrite GeneratePress selector ' . $global_selector );
    gpp_assert_true( false === strpos( $panel, $global_selector ), 'Workflow-panel refinement must not globally rewrite GeneratePress selector ' . $global_selector );
    gpp_assert_true( false === strpos( $timeline, $global_selector ), 'Timeline refinement must not globally rewrite GeneratePress selector ' . $global_selector );
}
foreach ( array( 'position: absolute', 'position:absolute', 'position: fixed', 'position:fixed', 'display: contents', 'display:contents', 'translate(', 'translate3d(', 'transform: scale', 'transform:scale' ) as $forbidden ) {
    gpp_assert_true( false === stripos( $full, $forbidden ), 'Full Width must not use forbidden layout method: ' . $forbidden );
    gpp_assert_true( false === stripos( $panel, $forbidden ), 'Workflow-panel refinement must not use forbidden layout method: ' . $forbidden );
    gpp_assert_true( false === stripos( $timeline, $forbidden ), 'Timeline refinement must not use forbidden layout method: ' . $forbidden );
}
gpp_assert_true( 0 === preg_match( '/margin(?:-[a-z]+)?\s*:\s*-[0-9]/i', $full ), 'Full Width must not use negative-margin layout hacks.' );
gpp_assert_true( 0 === preg_match( '/margin(?:-[a-z]+)?\s*:\s*-[0-9]/i', $panel ), 'Workflow-panel refinement must not use negative-margin layout hacks.' );
gpp_assert_true( 0 === preg_match( '/margin(?:-[a-z]+)?\s*:\s*-[0-9]/i', $timeline ), 'Timeline refinement must not use negative-margin layout hacks.' );
gpp_assert_true( 0 === preg_match( '/::(?:before|after)\s*\{[^}]*\bcontent\s*:/si', $panel ), 'Workflow-panel refinement must not fabricate visible content with CSS pseudo-elements.' );

// The original Full Width event-card seam remains isolated from PR47 Current / Safe.
gpp_assert_true( 1 === preg_match( '/\.gravityflow-timeline \.gravityflow-note\s*\{[^}]*border:\s*1px solid #e5e7eb;[^}]*border-radius:\s*16px;[^}]*background:\s*#f8fafc;/s', $full ), 'Full Width base must retain the existing native event-wrapper seam.' );
gpp_assert_true( 1 === preg_match( '/\.gravityflow-timeline \.gravityflow-note\s*\{[^}]*border-top:\s*1px solid #e4e7ec;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s', $safe ), 'Current / Safe Timeline must remain the PR47 neutral non-card chronology.' );

$timeline_start = strpos( $full, 'Timeline stays native' );
gpp_assert_true( false !== $timeline_start, 'Full Width Timeline enforcement boundary must remain explicit.' );
$timeline_css = substr( $full, $timeline_start );
gpp_assert_true( 0 === preg_match( '/approved|rejected|revert|approve|reject|تأیید|رد شد|ارسال شد/i', $timeline_css ), 'Base Timeline styling must not classify event outcome from visible text or action names.' );
gpp_assert_true( 0 === preg_match( '/approved|rejected|revert|approve|reject|تأیید|رد شد|ارسال شد/i', $timeline ), 'Timeline refinement must not classify event outcome from visible text or action names.' );

// Timeline refinement: preserve native event nodes while converging on the Owner three-zone composition.
gpp_assert_true( false !== strpos( $timeline, '.gravityflow-timeline .gravityflow-note' ), 'Timeline refinement must target authentic native event wrappers.' );
gpp_assert_true( false !== strpos( $timeline, '.gravityflow-note-avatar' ) && false !== strpos( $timeline, 'display: none' ), 'Native avatar may be visually suppressed without removing the node or event content.' );
gpp_assert_true( 1 === preg_match( '/\.gravityflow-timeline \.gravityflow-note-body-wrap\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+52px\s+minmax\(156px,\s*196px\);/s', $timeline ), 'Desktop Timeline must use the native body wrapper as a three-zone normal-flow grid.' );
gpp_assert_true( false !== strpos( $timeline, 'repeating-linear-gradient' ), 'Timeline must provide a dashed/dotted connector rail without new DOM.' );
gpp_assert_true( false !== strpos( $timeline, 'inline-size: 34px' ) && false !== strpos( $timeline, 'border-radius: 50%' ), 'Timeline must provide a bounded neutral circular event marker.' );
gpp_assert_true( false !== strpos( $timeline, '.gravityflow-note-body') && false !== strpos( $timeline, 'background: #f5f8ff' ), 'Native event body must become the dominant soft content card.' );
gpp_assert_true( false !== strpos( $timeline, '.gravityflow-note-title' ) && false !== strpos( $timeline, '.gravityflow-note-meta' ) && false !== strpos( $timeline, 'background: #f8fafc' ), 'Native actor and metadata must form the compact secondary metadata surface.' );
gpp_assert_true( false !== strpos( $timeline, 'content: "تاریخچه"' ), 'Full Width Timeline must expose the Owner-facing Persian History title without replacing the native heading node.' );
gpp_assert_true( false === strpos( $timeline, 'رویداد' ), 'Timeline must not fabricate an event-count pill when no safe native/request-time count seam has been admitted.' );
gpp_assert_true( false !== strpos( $timeline, '@media (max-width: 700px)' ) && false !== strpos( $timeline, 'grid-template-columns: 38px minmax(0, 1fr)' ), 'Narrow Timeline must reflow to rail + stacked authentic metadata/content without overlap.' );
gpp_assert_true( false !== strpos( $timeline, '@media (max-width: 420px)' ) && false !== strpos( $timeline, 'grid-template-columns: 34px minmax(0, 1fr)' ), 'Very narrow Timeline must tighten the same composition without device-specific event reconstruction.' );

// The refinement is a Full Width-only dependent asset, not a global/Current-Safe stylesheet.
gpp_assert_true( false !== strpos( $variant, 'FULL_WIDTH_TIMELINE_STYLE_HANDLE' ) && false !== strpos( $variant, 'FULL_WIDTH_TIMELINE_STYLE_PATH' ), 'Full Width Timeline asset identity must be explicit.' );
gpp_assert_true( false !== strpos( $variant, 'assets/css/srwf-gravity-flow-entry-detail-full-width-timeline.css' ), 'Full Width Timeline asset path must be registered.' );
gpp_assert_true( false !== strpos( $adapter, 'EntryDetailVisualVariant::FULL_WIDTH_TIMELINE_STYLE_HANDLE' ), 'Full Width adapter must enqueue the Timeline refinement.' );
gpp_assert_true( 1 === preg_match( '/FULL_WIDTH_TIMELINE_STYLE_HANDLE,[\s\S]*?array\(\s*EntryDetailVisualVariant::FULL_WIDTH_WORKFLOW_PANEL_STYLE_HANDLE\s*\)/', $adapter ), 'Timeline refinement must load after the existing Full Width asset chain.' );

// Workflow/action panel: native controls remain host-owned; GPP may add only the admitted presentation markup.
gpp_assert_true( false !== strpos( $panel, '#gravityflow-status-box-container' ), 'Workflow-panel refinement must target the authentic native status box.' );
gpp_assert_true( false !== strpos( $panel, 'textarea[name="gravityflow_note"]' ), 'Native Gravity Flow note textarea must remain the note control.' );
gpp_assert_true( false !== strpos( $panel, 'button[value="approved"]' ), 'Native Approve control may receive profile-scoped visual treatment.' );
gpp_assert_true( false !== strpos( $panel, 'button[value="rejected"]' ), 'Native Reject control may receive profile-scoped visual treatment.' );
gpp_assert_true( false !== strpos( $panel, 'button[value="revert"]' ), 'A future native Revert control may receive profile-scoped styling without being manufactured by GPP.' );
gpp_assert_true( false !== strpos( $panel, '.gpp-entry-workflow-panel__title' ) && false !== strpos( $panel, '.gpp-entry-workflow-panel__guidance' ) && false !== strpos( $panel, '.gpp-entry-workflow-panel__stage' ) && false !== strpos( $panel, '.gpp-entry-workflow-panel__footer' ), 'Owner-approved server-rendered presentation regions must have scoped styles.' );

gpp_assert_true( false !== strpos( $panel, 'border: 1px solid #e4e8f0' ), 'Workflow card/divider border must use the calibrated cool-neutral family.' );
gpp_assert_true( false !== strpos( $panel, 'border-radius: 18px' ), 'Workflow outer card radius must match the calibrated target family.' );
gpp_assert_true( false !== strpos( $panel, 'background: #fbfcfe' ), 'Workflow card must use the calibrated cool near-white surface.' );
gpp_assert_true( false !== strpos( $panel, 'box-shadow: 0 4px 14px rgba(15, 23, 42, .055)' ), 'Workflow card must use the restrained target-calibrated shadow.' );
gpp_assert_true( false !== strpos( $panel, 'padding: 22px clamp(20px, 6.75%, 24px) 24px' ), 'Workflow content inset must preserve the normalized target control/card width relationship.' );
gpp_assert_true( false !== strpos( $panel, '#poststuff #gravityflow-status-box-container .gravityflow-status-box' ), 'Workflow content inset must carry enough local specificity to beat WordPress #poststuff .inside padding without broadening scope.' );

gpp_assert_true( false !== strpos( $panel, 'min-block-size: 129px' ) && false !== strpos( $panel, 'border: 1px solid #dde3ee' ) && false !== strpos( $panel, 'border-radius: 11px' ), 'Native note textarea must retain the target-normalized height with calibrated border/radius.' );
gpp_assert_true( false !== strpos( $panel, 'gap: 16px' ), 'Workflow actions must preserve the target-normalized vertical gap.' );
gpp_assert_true( false !== strpos( $panel, 'min-block-size: 57px' ), 'Full Width actions must retain the target-normalized interaction height while exceeding accessible target size.' );
gpp_assert_true( false !== strpos( $panel, 'border-radius: 9px' ), 'Workflow action radius must match the target button family.' );
gpp_assert_true( false !== strpos( $panel, 'font-size: 15px' ), 'Workflow actions/current-stage typography must retain the calibrated scale.' );
gpp_assert_true( false !== strpos( $panel, 'border-color: #379b52' ) && false !== strpos( $panel, 'background: #379b52' ), 'Approve action must use the measured target green.' );
gpp_assert_true( false !== strpos( $panel, 'border-color: #e55967' ) && false !== strpos( $panel, 'background: #e55967' ), 'Reject action must use the measured target coral-red.' );
gpp_assert_true( false !== strpos( $panel, 'background: #fcf2d8' ), 'Approved warm presentation family must remain available for notice/native Revert treatment.' );

gpp_assert_true( false !== strpos( $panel, 'display: flex' ) && false !== strpos( $panel, 'flex-direction: column' ), 'Workflow hierarchy refinement must stay in normal-flow CSS.' );
gpp_assert_true( false !== strpos( $panel, 'order: 10' ) && false !== strpos( $panel, 'order: 12' ) && false !== strpos( $panel, 'order: 20' ), 'Authentic note/actions/context may be visually grouped without DOM relocation.' );
gpp_assert_true( false !== strpos( $panel, 'display: flex' ) && false !== strpos( $panel, 'align-items: center' ) && false !== strpos( $panel, 'justify-content: center' ) && false !== strpos( $panel, 'text-align: center' ), 'Native action icon/label groups must be robustly centered.' );
gpp_assert_true( false !== strpos( $panel, 'outline: 3px solid #2563eb' ), 'Full Width focus-visible treatment must remain explicit.' );
gpp_assert_true( false !== strpos( $panel, 'opacity: .48' ) && false !== strpos( $panel, 'aria-disabled="true"' ), 'Full Width disabled action semantics must remain visibly preserved.' );

gpp_assert_true( false !== strpos( $full, '@media (max-width: 820px)' ), 'Full Width must declare the narrow single-column breakpoint.' );
gpp_assert_true(
    1 === preg_match( '/grid-template-areas:\s*"main"\s*"workflow"\s*"timeline"\s*;/s', $full ),
    'Full Width must collapse to source-order single-column flow without DOM relocation.'
);
gpp_assert_true( false !== strpos( $panel, '@media (max-width: 600px)' ) && false !== strpos( $panel, 'padding: 20px 20px 22px' ), 'Workflow panel must keep bounded mobile insets.' );
gpp_assert_true( false !== strpos( $full, '@media (prefers-reduced-motion: reduce)' ), 'Reduced-motion boundary must remain explicit.' );

echo "ENTRY_DETAIL_FULL_WIDTH_CSS_CONTRACT_PASS\n";
