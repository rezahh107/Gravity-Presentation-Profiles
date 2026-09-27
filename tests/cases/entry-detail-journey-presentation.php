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
    array( array( 'approval', null, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_REVIEW, 'Approval must remain Review.' ),
    array( array( null, null, 'approved', 'approved', true ), EntryDetailJourneyPresentationAdapter::STATE_APPROVED, 'Matching fresh Approved truth must classify Approved.' ),
    array( array( null, null, 'rejected', 'rejected', true ), EntryDetailJourneyPresentationAdapter::STATE_REJECTED, 'Matching fresh Rejected truth must classify Rejected.' ),
    array( array( 'user_input', true, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_CORRECTION, 'Authorized User Input must classify Correction.' ),
    array( array( 'user_input', false, 'pending', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_NATIVE, 'Unauthorized User Input must fall back to native.' ),
    array( array( null, null, 'approved', 'pending', true ), EntryDetailJourneyPresentationAdapter::STATE_UNKNOWN, 'Conflicting terminal truth must fail closed to Unknown.' ),
    array( array( null, null, 'rejected', 'approved', true ), EntryDetailJourneyPresentationAdapter::STATE_UNKNOWN, 'Conflicting business outcomes must fail closed to Unknown.' ),
    array( array( null, null, 'approved', 'approved', false ), EntryDetailJourneyPresentationAdapter::STATE_NATIVE, 'Unestablished read-back must never classify success.' ),
);
foreach ( $cases as $case ) {
    $actual = $classify->invokeArgs( null, $case[0] );
    gpp_journey_assert( $case[1] === $actual, $case[2] . ' Actual: ' . var_export( $actual, true ) );
}

$root = dirname( __DIR__, 2 );
$php = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailJourneyPresentationAdapter.php' );
$css = file_get_contents( $root . '/assets/css/srwf-gravity-flow-entry-detail-journey.css' );
$bootstrap = file_get_contents( $root . '/src/Bootstrap.php' );

gpp_journey_assert( false !== strpos( $bootstrap, 'EntryDetailJourneyPresentationAdapter::register();' ), 'Journey adapter is not production-reachable from Bootstrap.' );
gpp_journey_assert( false !== strpos( $php, "GFAPI::get_entry" ), 'Journey result truth must fresh-read the entry.' );
gpp_journey_assert( false !== strpos( $php, "get_current_step" ) && false !== strpos( $php, "get_status" ) && false !== strpos( $php, "workflow_final_status" ), 'Journey result truth must use current-step, API-status and final-status read-back.' );
gpp_journey_assert( false !== strpos( $php, "Gravity_Flow_Entry_Detail::can_update" ), 'Correction must defer current-operator authority to Gravity Flow.' );
gpp_journey_assert( false !== strpos( $php, "gravityflow_back_link_url_entry_detail" ), 'Native Gravity Flow back-link route must be canonicalized through its supported filter.' );
gpp_journey_assert( false !== strpos( $php, "admin.php?page=gravityflow-inbox" ) && false !== strpos( $php, 'get_permalink' ), 'Canonical admin/frontend Inbox authorities are missing.' );
gpp_journey_assert( false !== strpos( $php, "back_link" ) && false !== strpos( $php, "gravityflow/inbox" ), 'Frontend duplicate-back-link avoidance must cover shortcode and Inbox Block composition.' );
gpp_journey_assert( false !== strpos( $php, 'role="status"' ), 'Result/correction semantics must not rely on color alone.' );
gpp_journey_assert( false !== strpos( $php, 'بازگشت به کارهای من' ), 'Canonical return control copy is missing.' );
gpp_journey_assert( false !== strpos( $php, 'نتیجه نهایی هنوز مشخص نیست' ), 'Unknown fail-closed presentation is missing.' );
gpp_journey_assert( false === strpos( $php, 'STATE_TECHNICAL_ERROR' ) && false === strpos( $php, 'data-gpp-entry-journey-result="technical' ), 'Unqualified Technical Error taxonomy must not exist.' );
gpp_journey_assert( false === strpos( $php, 'window.confirm' ) && false === strpos( $php, 'preventDefault' ) && false === strpos( $php, 'wp_ajax_' ), 'GPP must not replace native confirmation/action transport.' );
gpp_journey_assert( false === strpos( $php, 'update_option(' ) && false === strpos( $php, 'add_option(' ) && false === strpos( $php, 'set_transient(' ), 'Journey adapter must remain stateless.' );
gpp_journey_assert( false === strpos( $php, 'wp_insert_post' ) && false === strpos( $php, 'page_id' ), 'Production journey must not create or hard-code environment Page IDs.' );
gpp_journey_assert( false !== strpos( $css, ':focus-visible' ), 'Journey return control requires visible keyboard focus.' );
gpp_journey_assert( false !== strpos( $css, '@media (max-width: 600px)' ) && false !== strpos( $css, 'width: 100%' ), 'Journey presentation must retain the mobile stacking contract.' );
gpp_journey_assert( false !== strpos( $css, 'direction: rtl' ) && false !== strpos( $css, 'unicode-bidi: isolate' ), 'Journey presentation must preserve RTL/BiDi isolation.' );

echo "ENTRY_DETAIL_JOURNEY_PRESENTATION_PASS\n";
