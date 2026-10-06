<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

$GLOBALS['gpp_guard_filters'] = array();
$GLOBALS['gpp_guard_actions'] = array();
$GLOBALS['gpp_guard_inline'] = array();
$GLOBALS['gpp_guard_script_enqueued'] = true;

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_guard_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_guard_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function wp_script_is( $handle, $status = 'enqueued' ) {
    return 'gravityflow_theme_js' === $handle && 'enqueued' === $status && ! empty( $GLOBALS['gpp_guard_script_enqueued'] );
}

function wp_add_inline_script( $handle, $data, $position = 'after' ) {
    $GLOBALS['gpp_guard_inline'][] = array( $handle, $data, $position );
    return true;
}

function wp_json_encode( $value, $flags = 0, $depth = 512 ) {
    return json_encode( $value, $flags, $depth );
}

if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
    define( 'GPP_PLUGIN_FILE', dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php' );
}

final class Gravity_Flow {
    const THEME_JS = 'gravityflow_theme_js';
}

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxInitialGeometryGuard;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;

Autoloader::register();

function gpp_guard_set_header_configs( $configs ) {
    $loaded = new ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations_loaded' );
    $loaded->setAccessible( true );
    $loaded->setValue( null, true );

    $property = new ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations' );
    $property->setAccessible( true );
    $property->setValue( null, $configs );
}

function gpp_guard_config( $form_id, $student = '1', $national = '3', $school = '6' ) {
    return array(
        'form_id' => $form_id,
        'column_keys' => array(
            'student_name' => $student,
            'national_id' => $national,
            'school_grade' => $school,
        ),
        'sources' => array(),
    );
}

function gpp_guard_projected_columns( $student = '1', $national = '3', $school = '6' ) {
    return array(
        'id' => 'عملیات',
        $student => 'نام دانش‌آموز',
        $national => 'کد ملی',
        $school => 'مدرسه و پایه',
        'date_created' => 'تاریخ و ساعت ثبت',
        'date_created_human_readable' => 'نمایش تاریخ ثبت',
    );
}

function gpp_guard_reset() {
    InboxInitialGeometryGuard::resetRuntimeCache();
    $GLOBALS['gpp_guard_inline'] = array();
    $GLOBALS['gpp_guard_script_enqueued'] = true;
}

InboxInitialGeometryGuard::register();
gpp_assert_same( 1, count( $GLOBALS['gpp_guard_filters'] ), 'Geometry guard should observe exactly one existing native Inbox column seam.' );
gpp_assert_same( 'gravityflow_columns_inbox_table', $GLOBALS['gpp_guard_filters'][0][0], 'Guard scope must be derived from the native Inbox column pipeline.' );
gpp_assert_same( PHP_INT_MAX, $GLOBALS['gpp_guard_filters'][0][2], 'Guard must observe the resolved SRWF header projection at final column priority.' );
gpp_assert_same( 2, $GLOBALS['gpp_guard_filters'][0][3], 'Guard column observer accepted-args contract mismatch.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_guard_actions'] ), 'Guard should attach through one pre-construction footer lifecycle action.' );
gpp_assert_same( 'wp_print_footer_scripts', $GLOBALS['gpp_guard_actions'][0][0], 'Guard must use the qualified pre-construction script seam.' );
gpp_assert_same( 0, $GLOBALS['gpp_guard_actions'][0][2], 'Guard must inject before the native Gravity Flow footer script.' );

$config = gpp_guard_config( 101 );
gpp_guard_set_header_configs( array( 101 => $config ) );
$contract = InboxTableHeaderPresentation::initialGeometryContract( array( 'form_id' => 101 ) );
gpp_assert_same(
    array( 'form_id' => 101, 'column_ids' => array( 'id', '1', '3', '6', 'date_created' ) ),
    $contract,
    'Guard must derive form/column identity from the same resolved SRWF binding as the table header.'
);
gpp_assert_same( null, InboxTableHeaderPresentation::initialGeometryContract( array( 'form_id' => 202 ) ), 'Wrong-form scope must fail closed.' );
gpp_assert_same( null, InboxTableHeaderPresentation::initialGeometryContract( array() ), 'Missing native form scope must fail closed.' );

gpp_guard_reset();
$columns = gpp_guard_projected_columns();
gpp_assert_same( $columns, InboxInitialGeometryGuard::captureResolvedContract( $columns, array( 'form_id' => 101 ) ), 'Scope observation must not mutate host columns.' );
InboxInitialGeometryGuard::attachBeforeNativeGridConstruction();
gpp_assert_same( 1, count( $GLOBALS['gpp_guard_inline'] ), 'Resolved authorized SRWF Inbox must receive one pre-construction guard attachment.' );
gpp_assert_same( 'gravityflow_theme_js', $GLOBALS['gpp_guard_inline'][0][0], 'Guard must attach to Gravity Flow frontend construction handle.' );
gpp_assert_same( 'before', $GLOBALS['gpp_guard_inline'][0][2], 'Guard must run before native Grid construction.' );
$inline = $GLOBALS['gpp_guard_inline'][0][1];
gpp_assert_true( false === strpos( $inline, InboxInitialGeometryGuard::CONTRACT_PLACEHOLDER ), 'Inline guard leaked unresolved contract placeholder.' );
gpp_assert_true( false !== strpos( $inline, '"form_id":101' ), 'Guard lost the authoritative bound form identity.' );
gpp_assert_true( false !== strpos( $inline, '"column_ids":["id","1","3","6","date_created"]' ), 'Guard lost authoritative bound column identities.' );
gpp_assert_true( false !== strpos( $inline, 'options.searchArgs.form_id' ), 'Guard must positively match native Grid searchArgs form identity.' );
gpp_assert_same( 1, substr_count( $inline, 'params.api.sizeColumnsToFit()' ), 'Guard must keep one public native sizing operation.' );

gpp_guard_reset();
$wrong_columns = $columns;
$wrong_columns['999'] = 'Unrelated';
InboxInitialGeometryGuard::captureResolvedContract( $wrong_columns, array( 'form_id' => 101 ) );
InboxInitialGeometryGuard::attachBeforeNativeGridConstruction();
gpp_assert_same( array(), $GLOBALS['gpp_guard_inline'], 'Correct wrapper/form context with unrelated column identity must fail closed.' );

gpp_guard_reset();
InboxInitialGeometryGuard::captureResolvedContract( $columns, array( 'form_id' => 202 ) );
InboxInitialGeometryGuard::attachBeforeNativeGridConstruction();
gpp_assert_same( array(), $GLOBALS['gpp_guard_inline'], 'Active profile with wrong native form must not attach the guard.' );

gpp_guard_reset();
gpp_guard_set_header_configs( array() );
InboxInitialGeometryGuard::captureResolvedContract( $columns, array( 'form_id' => 101 ) );
InboxInitialGeometryGuard::attachBeforeNativeGridConstruction();
gpp_assert_same( array(), $GLOBALS['gpp_guard_inline'], 'Inactive/missing resolved SRWF binding must not attach the guard.' );

gpp_guard_reset();
gpp_guard_set_header_configs( array( 101 => $config ) );
$GLOBALS['gpp_guard_script_enqueued'] = false;
InboxInitialGeometryGuard::captureResolvedContract( $columns, array( 'form_id' => 101 ) );
InboxInitialGeometryGuard::attachBeforeNativeGridConstruction();
gpp_assert_same( array(), $GLOBALS['gpp_guard_inline'], 'Guard must not inject when the native frontend construction handle is absent.' );

gpp_guard_reset();
$config_202 = gpp_guard_config( 202, '11', '13', '16' );
gpp_guard_set_header_configs( array( 101 => $config, 202 => $config_202 ) );
InboxInitialGeometryGuard::captureResolvedContract( $columns, array( 'form_id' => 101 ) );
InboxInitialGeometryGuard::captureResolvedContract( gpp_guard_projected_columns( '11', '13', '16' ), array( 'form_id' => 202 ) );
InboxInitialGeometryGuard::attachBeforeNativeGridConstruction();
gpp_assert_same( array(), $GLOBALS['gpp_guard_inline'], 'Multiple different resolved Inbox targets in one request must fail closed.' );

$source = file_get_contents( dirname( __DIR__, 2 ) . '/' . InboxInitialGeometryGuard::SCRIPT_RELATIVE_PATH );
gpp_assert_true( is_string( $source ), 'Production geometry JavaScript source could not be read.' );
gpp_assert_same( 1, substr_count( $source, InboxInitialGeometryGuard::CONTRACT_PLACEHOLDER ), 'Production source must expose exactly one bounded contract placeholder.' );
gpp_assert_same( 1, substr_count( $source, 'window.localStorage' ), 'Presentation provenance must use one bounded localStorage capability access.' );
gpp_assert_true( false !== strpos( $source, "const STORAGE_PREFIX = 'gpp:srwf-inbox-fit:v1:'" ), 'Presentation provenance storage namespace is missing.' );
gpp_assert_true( false !== strpos( $source, 'options.onColumnResized = function' ), 'Manual/API width invalidation callback composition is missing.' );
gpp_assert_true( false !== strpos( $source, 'GROW_SETTLE_MS = 180' ), 'Bounded grow settle policy is missing.' );
gpp_assert_true( false !== strpos( $source, 'GROW_MIN_DELTA_PX = 24' ), 'Material grow threshold is missing.' );
gpp_assert_same( 1, substr_count( $source, 'params.api.sizeColumnsToFit()' ), 'Public sizeColumnsToFit must remain the sole sizing mutation.' );

foreach ( array(
    'sessionStorage',
    'ResizeObserver',
    'MutationObserver',
    'setInterval(',
    'onGridReady',
    'onColumnEverythingChanged',
    'columnEverythingChanged',
    'setColumnWidth',
    'applyColumnState',
    'enableRtl',
    "addEventListener('resize'",
    'addEventListener("resize"',
) as $forbidden ) {
    gpp_assert_true( false === strpos( $source, $forbidden ), 'Production geometry guard reintroduced prohibited mechanism: ' . $forbidden );
}

gpp_assert_true( false === strpos( $source, '3.1.0' ), 'Qualification dependency identity must not become a production exact-version gate.' );
gpp_assert_true( false === strpos( $source, 'columnEverythingChanged' ), 'Restore-event provenance discrimination must remain outside production admission.' );

echo "INBOX_INITIAL_GEOMETRY_GUARD_TESTS_PASS\n";
