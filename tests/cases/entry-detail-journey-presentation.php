<?php

require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailJourneyPresentationAdapter;

Autoloader::register();

function gpp_journey_assert( $condition, $message ) {
    if ( ! $condition ) {
        fwrite( STDERR, $message . PHP_EOL );
        exit( 1 );
    }
}

$adapter = new ReflectionClass( EntryDetailJourneyPresentationAdapter::class );
$classify = $adapter->getMethod( 'classifyHostTruth' );
$classify->setAccessible( true );

$cases = array(
    array( array( 'approval', null, false, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_REVIEW, 'Approval must remain Review.' ),
    array( array( null, null, false, 'approved', 'approved', true ), EntryDetailJourneyPresentationAdapter::STATE_APPROVED, 'Matching fresh Approved truth must classify Approved.' ),
    array( array( null, null, false, 'rejected', 'rejected', true ), EntryDetailJourneyPresentationAdapter::STATE_REJECTED, 'Matching fresh Rejected truth must classify Rejected.' ),
    array( array( 'user_input', true, true, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_CORRECTION, 'Authorized expected Revert target must classify Correction.' ),
    array( array( 'user_input', true, false, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_NATIVE, 'Unrelated authorized User Input must remain native.' ),
    array( array( 'user_input', false, true, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_NATIVE, 'Unauthorized correction target must fall back to native.' ),
    array( array( null, null, false, 'approved', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_UNKNOWN, 'Conflicting terminal truth must fail closed to Unknown.' ),
    array( array( null, null, false, 'rejected', 'approved', true ), EntryDetailJourneyPresentationAdapter::STATE_UNKNOWN, 'Conflicting business outcomes must fail closed to Unknown.' ),
    array( array( null, null, false, 'approved', 'approved', false ), EntryDetailJourneyPresentationAdapter::STATE_NATIVE, 'Unestablished read-back must never classify success.' ),
);
foreach ( $cases as $case ) {
    $actual = $classify->invokeArgs( null, $case[0] );
    gpp_journey_assert( $case[1] === $actual, $case[2] . ' Actual: ' . var_export( $actual, true ) );
}

$root = dirname( __DIR__, 2 );
$php = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailJourneyPresentationAdapter.php' );
$primary_php = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailPresentationAdapter.php' );
$css = file_get_contents( $root . '/assets/css/srwf-gravity-flow-entry-detail-journey.css' );
$bootstrap = file_get_contents( $root . '/src/Bootstrap.php' );

gpp_journey_assert( false !== strpos( $bootstrap, 'EntryDetailJourneyPresentationAdapter::register();' ), 'Journey adapter is not production-reachable from Bootstrap.' );
gpp_journey_assert( false !== strpos( $php, 'GFAPI::get_entry' ), 'Journey result truth must fresh-read the entry.' );
gpp_journey_assert( false !== strpos( $php, 'get_current_step' ) && false !== strpos( $php, 'get_status' ) && false !== strpos( $php, 'workflow_final_status' ), 'Journey result truth must use current-step, API-status and final-status read-back.' );
gpp_journey_assert( false !== strpos( $php, 'Gravity_Flow_Entry_Detail::can_update' ), 'Correction must defer current-operator authority to Gravity Flow.' );
gpp_journey_assert(
    false !== strpos( $php, 'isExpectedSameOperatorCorrectionStep' )
    && false !== strpos( $php, 'stepAssignedExclusivelyToUser' )
    && false !== strpos( $php, "'revertEnable'" )
    && false !== strpos( $php, "'revertValue'" )
    && false !== strpos( $php, 'get_steps' ),
    'Correction semantics must bind the same operator to the host-configured Approval Revert target.'
);
gpp_journey_assert(
    false !== strpos( $primary_php, 'public static function resolvedPresentationModel' )
    && false !== strpos( $primary_php, 'public static function admittedPresentationModel' )
    && false !== strpos( $php, 'EntryDetailPresentationAdapter::resolvedPresentationModel' )
    && false !== strpos( $php, 'EntryDetailPresentationAdapter::admittedPresentationModel' ),
    'Journey presentation must reuse the canonical Entry Detail presentation admission primitive.'
);
foreach ( array( 'new VisualPackageLifecycle', 'new BindingSetLifecycle', 'WordPressOptionStateStore', 'EvidenceReferenceGate' ) as $duplicated_lifecycle_marker ) {
    gpp_journey_assert(
        false === strpos( $php, $duplicated_lifecycle_marker ),
        'Journey adapter must not duplicate Entry Detail lifecycle/model admission: ' . $duplicated_lifecycle_marker
    );
}
gpp_journey_assert( false !== strpos( $php, 'gravityflow_back_link_url_entry_detail' ), 'Native Gravity Flow back-link route must be canonicalized through its supported filter.' );
gpp_journey_assert( false !== strpos( $php, 'admin.php?page=gravityflow-inbox' ) && false !== strpos( $php, 'get_permalink' ), 'Canonical admin/frontend Inbox authorities are missing.' );
gpp_journey_assert( false !== strpos( $php, "if ( 'inbox' === \$page )" ) && false !== strpos( $php, "'gravityflow/inbox'" ), 'Frontend canonical routing must admit only actual Inbox shortcode/Block pages.' );
gpp_journey_assert( false === strpos( $php, "array( 'inbox', 'status' )" ), 'Gravity Flow Status pages must not be treated as canonical My Tasks routes.' );
gpp_journey_assert( false !== strpos( $php, 'role="status"' ), 'Result/correction semantics must not rely on color alone.' );
gpp_journey_assert( false !== strpos( $php, 'بازگشت به کارهای من' ), 'Canonical return control copy is missing.' );
gpp_journey_assert( false !== strpos( $php, 'نتیجه بررسی با موفقیت ثبت شد.' ) && false !== strpos( $php, 'نتیجه رد با موفقیت ثبت شد.' ), 'Owner-approved result copy was not preserved.' );
gpp_journey_assert( false !== strpos( $php, 'نتیجه نهایی هنوز مشخص نیست' ), 'Unknown fail-closed presentation is missing.' );
gpp_journey_assert( false === strpos( $php, 'STATE_TECHNICAL_ERROR' ) && false === strpos( $php, 'data-gpp-entry-journey-result="technical' ), 'Unqualified Technical Error taxonomy must not exist.' );
gpp_journey_assert( false === strpos( $php, 'window.confirm' ) && false === strpos( $php, 'preventDefault' ) && false === strpos( $php, 'wp_ajax_' ), 'GPP must not replace native confirmation/action transport.' );
gpp_journey_assert( false === strpos( $php, 'update_option(' ) && false === strpos( $php, 'add_option(' ) && false === strpos( $php, 'set_transient(' ), 'Journey adapter must remain stateless.' );
gpp_journey_assert( false === strpos( $php, 'wp_insert_post' ) && false === strpos( $php, 'page_id' ), 'Production journey must not create or hard-code environment Page IDs.' );
gpp_journey_assert( false !== strpos( $css, ':focus-visible' ), 'Journey return control requires visible keyboard focus.' );
gpp_journey_assert( false !== strpos( $css, '@media (max-width: 600px)' ) && false !== strpos( $css, 'width: 100%' ), 'Journey presentation must retain the mobile stacking contract.' );
gpp_journey_assert( false !== strpos( $css, 'direction: rtl' ) && false !== strpos( $css, 'unicode-bidi: isolate' ), 'Journey presentation must preserve RTL/BiDi isolation.' );

echo "ENTRY_DETAIL_JOURNEY_PRESENTATION_PASS\n";