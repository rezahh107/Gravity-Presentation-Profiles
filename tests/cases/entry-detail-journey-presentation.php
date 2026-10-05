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

if ( ! function_exists( '__' ) ) {
    function __( $text, $domain = null ) {
        unset( $domain );
        return $text;
    }
}
if ( ! function_exists( 'esc_html__' ) ) {
    function esc_html__( $text, $domain = null ) {
        unset( $domain );
        return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
    }
}
if ( ! function_exists( 'esc_html' ) ) {
    function esc_html( $text ) {
        return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
    }
}
if ( ! function_exists( 'esc_attr' ) ) {
    function esc_attr( $text ) {
        return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
    }
}
if ( ! function_exists( 'esc_url' ) ) {
    function esc_url( $url ) {
        return (string) $url;
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

$result_markup = $adapter->getMethod( 'resultMarkup' );
$result_markup->setAccessible( true );
$synthetic_identity = array(
    'name' => 'SYNTHETIC STUDENT',
    'national_id' => '1234567890',
    'entry_id' => 98765,
);
foreach ( array(
    EntryDetailJourneyPresentationAdapter::STATE_APPROVED => 'پرونده تأیید شد',
    EntryDetailJourneyPresentationAdapter::STATE_REJECTED => 'پرونده رد شد',
) as $terminal_state => $expected_title ) {
    $markup = $result_markup->invoke( null, $terminal_state, $synthetic_identity, '/my-tasks/', 'synthetic.profile', true );
    gpp_journey_assert( false !== strpos( $markup, 'data-gpp-entry-journey-result="' . $terminal_state . '"' ), 'Terminal result marker missing for ' . $terminal_state . '.' );
    gpp_journey_assert( false !== strpos( $markup, $expected_title ), 'Terminal result title missing for ' . $terminal_state . '.' );
    gpp_journey_assert( false !== strpos( $markup, 'بازگشت به کارهای من' ), 'Terminal continuation missing for ' . $terminal_state . '.' );
    gpp_journey_assert( false === strpos( $markup, 'gpp-entry-journey__case-context' ), 'Terminal case-context markup must be absent for ' . $terminal_state . '.' );
    gpp_journey_assert( false === strpos( $markup, 'SYNTHETIC STUDENT' ) && false === strpos( $markup, '1234567890' ) && false === strpos( $markup, '98765' ), 'Terminal case identity leaked into markup for ' . $terminal_state . '.' );
}
$unknown_markup = $result_markup->invoke( null, EntryDetailJourneyPresentationAdapter::STATE_UNKNOWN, $synthetic_identity, '/my-tasks/', 'synthetic.profile', true );
gpp_journey_assert( false !== strpos( $unknown_markup, 'data-gpp-entry-journey-result="unknown"' ), 'Unknown fail-closed marker is missing.' );
gpp_journey_assert( false !== strpos( $unknown_markup, 'gpp-entry-journey__case-context' ) && false !== strpos( $unknown_markup, 'SYNTHETIC STUDENT' ) && false !== strpos( $unknown_markup, '1234567890' ), 'Unknown fail-closed context must remain available.' );

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
gpp_journey_assert(
    false !== strpos( $css, '.gravityflow-back-link-container a.back-link' )
    && false !== strpos( $css, '.gpp-entry-journey__return' ),
    'Primary-navigation treatment must cover both admitted native and GPP return-control paths.'
);
foreach ( array(
    '#2563eb',
    '#1d4ed8',
    '#93c5fd',
    'border-radius: 12px',
    'min-block-size: 44px',
    '0 6px 18px rgba(37, 99, 235, .14)',
    'content: ""',
    'data:image/svg+xml',
) as $primary_navigation_visual_marker ) {
    gpp_journey_assert(
        false !== strpos( $css, $primary_navigation_visual_marker ),
        'Primary-navigation visual contract marker is missing: ' . $primary_navigation_visual_marker
    );
}
gpp_journey_assert(
    false !== strpos( $css, '.gravityflow-back-link-container a.back-link::before' )
    && false !== strpos( $css, "stroke='%23fff'" ),
    'Decorative RTL return icon must be CSS-only and white on both return paths.'
);

$result_markup_start = strpos( $php, 'private static function resultMarkup' );
$result_copy_start = strpos( $php, 'private static function resultCopy', $result_markup_start );
gpp_journey_assert(
    false !== $result_markup_start && false !== $result_copy_start && $result_copy_start > $result_markup_start,
    'MR-5 result markup boundary could not be inspected.'
);
$result_markup_php = substr( $php, $result_markup_start, $result_copy_start - $result_markup_start );
gpp_journey_assert(
    false !== strpos( $result_markup_php, 'if ( self::STATE_UNKNOWN === $state )' )
    && 1 === substr_count( $result_markup_php, '$html .= self::caseContextMarkup( $identity );' ),
    'MR-5 terminal Approved/Rejected markup must omit repeated case identity while Unknown keeps its existing fail-closed context.'
);

$terminal_targets = ':is(.entry-detail-view, #postbox-container-1, #postbox-container-2, .detail-view-print)';
foreach ( array( 'approved', 'rejected' ) as $terminal_state ) {
    $terminal_marker = '.gpp-entry-journey-result[data-gpp-entry-journey-result="' . $terminal_state . '"]';
    $terminal_boundary = '.gravityflow_workflow_detail form:has(' . $terminal_marker . ')';
    gpp_journey_assert(
        false !== strpos( $css, $terminal_boundary . ' ' . $terminal_targets ),
        'MR-5 terminal result must suppress only the proven competing native Entry Detail surfaces for ' . $terminal_state . '.'
    );
    gpp_journey_assert(
        false === strpos( $css, $terminal_marker . ' .gpp-entry-journey__case-context' ),
        'MR-5 terminal identity must be omitted by server markup, not implemented as CSS-only hiding for ' . $terminal_state . '.'
    );
    gpp_journey_assert(
        false === strpos( $css, $terminal_boundary . ' .gpp-entry-print-utility' ),
        'MR-5 terminal convergence must preserve the separately authorized GPP dossier Print utility for ' . $terminal_state . '.'
    );
}

$correction_print_boundary = '.gravityflow_workflow_detail form:has(.gpp-entry-journey--correction[data-gpp-entry-journey="correction"])';
$correction_gpp_print_selector = $correction_print_boundary . ' .gpp-entry-print-utility';
$correction_native_print_selector = $correction_print_boundary . ' .detail-view-print';
$correction_print_rule = $correction_gpp_print_selector . ",\n" . $correction_native_print_selector . " {\n    display: none;\n}";
gpp_journey_assert(
    false !== strpos( $css, $correction_print_rule ),
    'MR-4 Print suppression must hide native and GPP Print surfaces under the same server-admitted correction marker.'
);
gpp_journey_assert(
    1 === substr_count( $css, $correction_gpp_print_selector ),
    'Journey CSS must keep GPP Print suppression confined to the single MR-4 correction boundary.'
);
gpp_journey_assert(
    false === strpos( $php, 'gpp-entry-journey__return-icon' )
    && false === strpos( $php, 'aria-label="' . 'بازگشت به کارهای من' . '"' ),
    'Return icon must not add duplicate accessible naming or icon markup to the action name.'
);
gpp_journey_assert( false !== strpos( $css, '@media (max-width: 600px)' ) && false !== strpos( $css, 'width: 100%' ), 'Journey presentation must retain the mobile stacking contract.' );
gpp_journey_assert( false !== strpos( $css, 'direction: rtl' ) && false !== strpos( $css, 'unicode-bidi: isolate' ), 'Journey presentation must preserve RTL/BiDi isolation.' );

echo "ENTRY_DETAIL_JOURNEY_PRESENTATION_PASS\n";
