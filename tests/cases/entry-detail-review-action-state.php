<?php

$root = dirname( __DIR__, 2 );
$js = file_get_contents( $root . '/assets/js/srwf-gravity-flow-entry-detail.js' );
$css = file_get_contents( $root . '/assets/css/srwf-gravity-flow-entry-detail-journey.css' );

function gpp_review_action_assert( $condition, $message ) {
    if ( ! $condition ) {
        fwrite( STDERR, $message . PHP_EOL );
        exit( 1 );
    }
}

gpp_review_action_assert( false !== strpos( $js, "form.addEventListener('submit'" ), 'Review busy state must attach only at the native form-submit boundary.' );
gpp_review_action_assert( false !== strpos( $js, 'queueMicrotask' ), 'Busy presentation must defer until host submit listeners have run.' );
gpp_review_action_assert( false !== strpos( $js, "['approved', 'rejected', 'revert']" ), 'Only the three admitted material Review actions may enter busy state.' );
gpp_review_action_assert( false !== strpos( $js, '#gravityflow_approval_new_status_step' ), 'Busy admission must consume Gravity Flow\'s native post-confirmation action carrier.' );
gpp_review_action_assert( false !== strpos( $js, 'handleApprovalStepButtonClick' ), 'Busy admission must verify the authentic Gravity Flow action handler shape.' );
gpp_review_action_assert( false !== strpos( $js, "status.textContent = 'در حال ثبت نتیجه…'" ), 'Operator busy feedback copy is missing.' );
gpp_review_action_assert( false !== strpos( $js, "status.setAttribute('role', 'status')" ) && false !== strpos( $js, "status.setAttribute('aria-live', 'polite')" ), 'Busy feedback must be exposed accessibly.' );
gpp_review_action_assert( false !== strpos( $js, "actionRegion.setAttribute('aria-busy', 'true')" ), 'Native action region must expose truthful busy semantics.' );
gpp_review_action_assert( false !== strpos( $js, 'button.disabled = true' ) && false !== strpos( $js, "button.setAttribute('aria-disabled', 'true')" ), 'Material controls must be unavailable during an admitted submission.' );
gpp_review_action_assert( false !== strpos( $js, "window.addEventListener('pageshow', clearBusy)" ) && false !== strpos( $js, "document.addEventListener('gform/post_render', clearBusy)" ), 'Busy state must recover on native page/form lifecycle recovery.' );
gpp_review_action_assert( false !== strpos( $js, "'srwf.operations.entry-detail.v1'" ) && false !== strpos( $js, "'srwf.operations.entry-detail.full-width.v1'" ), 'Busy enhancement must remain limited to admitted SRWF Review profiles.' );

foreach ( array( 'preventDefault(', 'stopPropagation(', 'stopImmediatePropagation(', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'BroadcastChannel', 'wp_ajax_' ) as $forbidden ) {
    gpp_review_action_assert( false === strpos( $js, $forbidden ), 'Review busy enhancement must not own or replace workflow transport/state: ' . $forbidden );
}

gpp_review_action_assert( false === strpos( $js, 'window.handleApprovalStepButtonClick' ) && false === strpos( $js, 'handleApprovalStepButtonClick =' ), 'GPP must not override Gravity Flow\'s native inline action handler.' );
gpp_review_action_assert( false !== strpos( $css, '.gpp-entry-review-action-status' ) && false !== strpos( $css, '[data-gpp-material-action-busy="1"]' ), 'Busy presentation CSS is missing.' );
gpp_review_action_assert( false === strpos( $css, 'button[value="approved"]' ) && false === strpos( $css, 'button[value="rejected"]' ) && false === strpos( $css, 'button[value="revert"]' ), 'Journey busy CSS must not change semantic action colors or relative importance.' );

echo "ENTRY_DETAIL_REVIEW_ACTION_STATE_PASS\n";
