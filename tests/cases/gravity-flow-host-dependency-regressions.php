<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailFullWidthPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

if ( ! function_exists( 'wp_unslash' ) ) {
    function wp_unslash( $value ) {
        return $value;
    }
}
if ( ! function_exists( 'sanitize_key' ) ) {
    function sanitize_key( $value ) {
        return strtolower( preg_replace( '/[^a-z0-9_-]/i', '', (string) $value ) );
    }
}
if ( ! function_exists( 'absint' ) ) {
    function absint( $value ) {
        return abs( (int) $value );
    }
}

Autoloader::register();

final class WU11_Fake_Entry_Step {
    private $type;
    private $editable_fields;

    public function __construct( $type, array $editable_fields = array() ) {
        $this->type = $type;
        $this->editable_fields = $editable_fields;
    }

    public function get_type() {
        return $this->type;
    }

    public function get_editable_fields() {
        return $this->editable_fields;
    }
}

$reflection = new ReflectionClass( EntryDetailPresentationAdapter::class );
$read_only = $reflection->getMethod( 'readOnlyReviewAdmission' );
$read_only->setAccessible( true );
$action_eligibility = $reflection->getMethod( 'approvalProcessingEligibility' );
$action_eligibility->setAccessible( true );

$full_width_reflection = new ReflectionClass( EntryDetailFullWidthPresentationAdapter::class );
$full_width_eligibility = $full_width_reflection->getMethod( 'isAdmittedFullWidthReview' );
$full_width_eligibility->setAccessible( true );
$full_width_active = $full_width_reflection->getProperty( 'full_width_active' );
$full_width_active->setAccessible( true );
$full_width_active->setValue( null, true );
$_GET = array( 'view' => 'entry', 'lid' => '42' );

$approval_read_only = new WU11_Fake_Entry_Step( 'approval' );
$approval_editor = new WU11_Fake_Entry_Step( 'approval', array( '7' ) );
$user_input = new WU11_Fake_Entry_Step( 'user_input', array( '7' ) );
$other_step = new WU11_Fake_Entry_Step( 'notification' );

// Degraded seam: the host class/method is absent. GPP must not infer editability
// or action permission from its own state, including the Full Width panel.
gpp_assert_true( ! class_exists( 'Gravity_Flow_Entry_Detail', false ), 'Host Entry Detail class unexpectedly exists in the isolated WU11 process.' );
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'editability_state_unproven' ),
    $read_only->invoke( null, $approval_read_only ),
    'Missing can_update() host seam must fail closed for read-only Review admission.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'native_update_predicate_unavailable' ),
    $action_eligibility->invoke( null, $approval_read_only ),
    'Missing can_update() host seam must fail closed for Approval action eligibility.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, $approval_read_only ),
    'Missing can_update() host seam must fail closed for Full Width review-panel eligibility.'
);

// Define a controllable host stub only after the unavailable-seam assertions.
eval( <<<'PHPSTUB'
class Gravity_Flow_Entry_Detail {
    public static $wu11_mode = 'false';

    public static function can_update( $step ) {
        unset( $step );
        if ( 'throw' === self::$wu11_mode ) {
            throw new RuntimeException( 'WU11 synthetic host failure.' );
        }
        return 'true' === self::$wu11_mode;
    }
}
PHPSTUB
);

Gravity_Flow_Entry_Detail::$wu11_mode = 'false';
gpp_assert_same(
    array( 'eligible' => true, 'reason' => null ),
    $read_only->invoke( null, $approval_read_only ),
    'Authentic read-only host semantics must permit the Review projection without inventing action permission.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'current_assignee_not_eligible' ),
    $action_eligibility->invoke( null, $approval_read_only ),
    'Host can_update=false must keep GPP Approval action eligibility false.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, $approval_read_only ),
    'Host can_update=false must keep Full Width workflow guidance suppressed.'
);

Gravity_Flow_Entry_Detail::$wu11_mode = 'true';
gpp_assert_same(
    array( 'eligible' => true, 'reason' => null ),
    $read_only->invoke( null, $approval_read_only ),
    'Current Approval assignee with no editable fields must remain eligible for the read-only Review projection.'
);
gpp_assert_same(
    array( 'eligible' => true, 'reason' => null ),
    $action_eligibility->invoke( null, $approval_read_only ),
    'Current Approval assignee with host can_update=true must remain action-eligible.'
);
gpp_assert_same(
    true,
    $full_width_eligibility->invoke( null, $approval_read_only ),
    'Current Approval assignee with no editable fields must remain eligible for Full Width workflow guidance.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'native_editor_required' ),
    $read_only->invoke( null, $approval_editor ),
    'Effective editable fields must preserve the native Approval editor instead of forcing the GPP read-only projection.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, $approval_editor ),
    'Effective editable fields must suppress Full Width workflow guidance in favor of the native editor.'
);

Gravity_Flow_Entry_Detail::$wu11_mode = 'throw';
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'editability_state_unproven' ),
    $read_only->invoke( null, $approval_read_only ),
    'A throwing can_update() seam must fail closed for read-only admission.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'native_update_predicate_failed' ),
    $action_eligibility->invoke( null, $approval_read_only ),
    'A throwing can_update() seam must fail closed for action eligibility.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, $approval_read_only ),
    'A throwing can_update() seam must fail closed for Full Width review-panel eligibility.'
);

Gravity_Flow_Entry_Detail::$wu11_mode = 'true';
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'active_user_input_editing' ),
    $read_only->invoke( null, $user_input ),
    'Active User Input must stay on the native editor independently of can_update().'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'current_step_not_approval' ),
    $action_eligibility->invoke( null, $user_input ),
    'User Input must never be treated as a GPP Approval-action state.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, $user_input ),
    'User Input must never receive Full Width Approval workflow guidance.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'unsupported_or_ambiguous_request_state' ),
    $read_only->invoke( null, $other_step ),
    'A non-Approval/non-User-Input step must conservatively fall back to native presentation.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'current_step_not_approval' ),
    $action_eligibility->invoke( null, $other_step ),
    'A non-Approval step must not receive GPP action eligibility.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, $other_step ),
    'A non-Approval step must not receive Full Width workflow guidance.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'unsupported_or_ambiguous_request_state' ),
    $read_only->invoke( null, null ),
    'Missing current step must fall back to native presentation.'
);
gpp_assert_same(
    array( 'eligible' => false, 'reason' => 'current_step_unavailable' ),
    $action_eligibility->invoke( null, null ),
    'Missing current step must not receive action eligibility.'
);
gpp_assert_same(
    false,
    $full_width_eligibility->invoke( null, null ),
    'Missing current step must not receive Full Width workflow guidance.'
);

$root = dirname( __DIR__, 2 );
$full_width = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailFullWidthPresentationAdapter.php' );
$timeline = file_get_contents( $root . '/src/SRWF/GravityFlow/EntryDetailTimelineSemanticPresentation.php' );
$inbox = file_get_contents( $root . '/src/SRWF/GravityFlow/InboxPresentationAdapter.php' );
$inbox_css = file_get_contents( $root . '/assets/css/srwf-gravity-flow-inbox.css' );

gpp_assert_true(
    is_string( $full_width )
        && false !== strpos( $full_width, "! class_exists( 'Gravity_Flow_Entry_Detail' ) || ! method_exists( 'Gravity_Flow_Entry_Detail', 'can_update' )" )
        && false !== strpos( $full_width, '! \\Gravity_Flow_Entry_Detail::can_update( $current_step )' )
        && false !== strpos( $full_width, 'catch ( \\Throwable $exception )' ),
    'Full Width Review panel must fail closed when the host can_update() capability is absent, false, or failing.'
);

gpp_assert_true(
    is_string( $timeline )
        && false !== strpos( $timeline, '$matches !== count( $events )' )
        && false !== strpos( $timeline, 'return $html;' ),
    'Timeline decoration must retain the event-count mismatch native fallback.'
);

gpp_assert_true(
    is_string( $inbox_css )
        && false !== strpos( $inbox_css, '.ag-center-cols-container > .ag-row > .ag-cell[col-id="gpp_case_card"]' )
        && false !== strpos( $inbox_css, ':not(:has(.ag-center-cols-container > .ag-row .gpp-inbox-card__readiness--unready))' ),
    'Card Mode must remain gated on the exact pinned AG Grid row/card-cell seam and all-ready rendered set.'
);

foreach ( array( 'setQuickFilter', 'applyTransaction(', 'paginationGoToPage(', 'get_inbox_entries(' ) as $host_api ) {
    gpp_assert_true(
        is_string( $inbox ) && false === strpos( $inbox, $host_api ),
        'GPP Inbox production adapter must not take ownership of host Grid state/API: ' . $host_api
    );
}

$full_width_active->setValue( null, null );
$_GET = array();

echo "GRAVITY_FLOW_HOST_DEPENDENCY_REGRESSIONS_PASS\n";
