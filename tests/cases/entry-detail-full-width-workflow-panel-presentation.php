<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailFullWidthPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PersianDateFormatter;

if ( ! function_exists( 'esc_html' ) ) {
    function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' ); }
}
if ( ! function_exists( 'esc_attr' ) ) {
    function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' ); }
}
if ( ! function_exists( 'esc_html__' ) ) {
    function esc_html__( $value, $domain = null ) { return esc_html( $value ); }
}

final class GppWorkflowPanelTestAssignee {
    private $name;
    public function __construct( $name ) { $this->name = $name; }
    public function get_display_name() { return $this->name; }
}

final class GppWorkflowPanelTestStep {
    private $name;
    private $assignees;
    private $supports_due;
    private $due;

    public function __construct( $name, array $assignees, $supports_due, $due ) {
        $this->name = $name;
        $this->assignees = $assignees;
        $this->supports_due = $supports_due;
        $this->due = $due;
    }
    public function get_name() { return $this->name; }
    public function get_assignees() { return $this->assignees; }
    public function supports_due_date() { return $this->supports_due; }
    public function get_due_date_timestamp() { return $this->due; }
}

Autoloader::register();

$reflection = new ReflectionClass( EntryDetailFullWidthPresentationAdapter::class );
$payload_method = $reflection->getMethod( 'presentationPayload' );
$payload_method->setAccessible( true );
$markup_method = $reflection->getMethod( 'presentationMarkup' );
$markup_method->setAccessible( true );

$due_timestamp = 1760000000;
$step = new GppWorkflowPanelTestStep(
    'بررسی مدیر',
    array( new GppWorkflowPanelTestAssignee( 'کاربر آزمایشی' ) ),
    true,
    $due_timestamp
);
$payload = $payload_method->invoke( null, $step );
gpp_assert_same( 'بررسی مدیر', $payload['current_step_label'], 'Current step must come directly from the authentic step object.' );
gpp_assert_same( 'کاربر آزمایشی', $payload['assignee_label'], 'Assignee label must come from the authentic assignee object.' );
gpp_assert_same( PersianDateFormatter::formatDateTime( $due_timestamp ), $payload['due_date_label'], 'Due date must come from the authentic step due timestamp and existing formatter.' );

$markup = $markup_method->invoke( null, $payload );
gpp_assert_true( false !== strpos( $markup, 'اقدام شما' ), 'Full Width presentation heading must be real HTML text.' );
gpp_assert_true( false !== strpos( $markup, 'این پرونده منتظر اقدام شماست.' ), 'Static yellow guidance primary text must be real HTML.' );
gpp_assert_true( false !== strpos( $markup, 'لطفاً پس از بررسی اطلاعات، یکی از گزینه‌های زیر را انتخاب کنید.' ), 'Static yellow guidance supporting text must be real HTML.' );
gpp_assert_true( false !== strpos( $markup, 'اطلاعات مرحله فعلی' ), 'Current-stage section heading must be real HTML.' );
gpp_assert_true( false !== strpos( $markup, 'data-gpp-workflow-fact="current-step"' ), 'Current-stage markup must identify the authentic current-step projection.' );
gpp_assert_true( false !== strpos( $markup, 'data-gpp-workflow-fact="assignee"' ), 'Current-stage markup must identify the authentic assignee projection.' );
gpp_assert_true( false !== strpos( $markup, 'data-gpp-workflow-fact="due-date"' ), 'Authentic due date must render when the host provides one.' );
gpp_assert_true( false !== strpos( $markup, 'تمامی عملیات بر اساس تنظیمات Gravity Flow انجام می‌شود.' ), 'Blue informational footer must be real HTML.' );
gpp_assert_true( false === strpos( $markup, '<button' ), 'Presentation markup must never manufacture workflow controls, including Revert.' );
gpp_assert_true( false === strpos( $markup, 'نامشخص' ) && false === strpos( $markup, 'ثبت نشده' ) && false === strpos( $markup, 'بدون مهلت' ), 'Presentation markup must not fabricate missing workflow values.' );

$missing = new GppWorkflowPanelTestStep( 'بررسی مدیر', array(), true, false );
$missing_payload = $payload_method->invoke( null, $missing );
$missing_markup = $markup_method->invoke( null, $missing_payload );
gpp_assert_same( null, $missing_payload['assignee_label'], 'Unavailable assignee must remain absent.' );
gpp_assert_same( null, $missing_payload['due_date_label'], 'Unavailable due date must remain absent.' );
gpp_assert_true( false === strpos( $missing_markup, 'data-gpp-workflow-fact="assignee"' ), 'Unavailable assignee row must be omitted.' );
gpp_assert_true( false === strpos( $missing_markup, 'data-gpp-workflow-fact="due-date"' ), 'Unavailable due-date row must be omitted.' );

$element_count = preg_match_all( '/<(?:h3|div|strong|p|section|h4|dl|dt|dd)\b/', $missing_markup, $matches );
gpp_assert_same( 10, $element_count, 'Minimal Full Width markup without optional assignee/due facts must remain bounded.' );

$adapter_source = file_get_contents( dirname( __DIR__, 2 ) . '/src/SRWF/GravityFlow/EntryDetailFullWidthPresentationAdapter.php' );
$panel_css = file_get_contents( dirname( __DIR__, 2 ) . '/assets/css/srwf-gravity-flow-entry-detail-full-width-workflow-panel.css' );
gpp_assert_true( false !== strpos( $adapter_source, 'gravityflow_above_approval_buttons' ), 'Presentation markup must use the existing native Approval render seam.' );
gpp_assert_true( false !== strpos( $adapter_source, 'gravityflow_approval_note_label_workflow_detail' ), 'Optional Note label must use the native Gravity Flow label filter.' );
gpp_assert_true( false === strpos( $adapter_source, '<button' ), 'Adapter must not render workflow buttons.' );
gpp_assert_true( false === strpos( $adapter_source, 'wp_remote_' ) && false === strpos( $adapter_source, 'curl_' ), 'Presentation adapter must not add network requests.' );
gpp_assert_true( false === strpos( $adapter_source, 'update_option' ) && false === strpos( $adapter_source, 'add_option' ) && false === strpos( $adapter_source, 'GFAPI::update' ), 'Presentation adapter must not persist workflow state.' );
gpp_assert_true( false === strpos( $adapter_source, 'wp_enqueue_script' ), 'Full Width presentation markup must not add JavaScript.' );
gpp_assert_true( false === preg_match( '/preg_match|preg_replace|strip_tags|html_entity_decode/', $adapter_source ), 'Workflow facts must not be inferred by visible-text scraping/parsing.' );
gpp_assert_true( false === preg_match( '/::before[^}]*content\s*:|::after[^}]*content\s*:/s', $panel_css ), 'Meaningful presentation copy must not come from CSS generated content.' );
gpp_assert_true( false !== strpos( $panel_css, 'justify-content: center' ) && false !== strpos( $panel_css, 'align-items: center' ) && false !== strpos( $panel_css, 'text-align: center' ), 'Native action labels/icons must be horizontally and vertically centered.' );

echo "ENTRY_DETAIL_FULL_WIDTH_WORKFLOW_PANEL_PRESENTATION_PASS\n";
