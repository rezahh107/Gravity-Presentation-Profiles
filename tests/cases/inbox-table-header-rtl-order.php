<?php

namespace Gravity_Flow\Gravity_Flow\Inbox {
    final class Inbox_Service_Provider {
        const TASK_MODEL = 'inbox_task_model';
    }
}

namespace {
    require_once __DIR__ . '/../helpers.php';
    require_once __DIR__ . '/../../src/Autoloader.php';

    use GravityPresentationProfiles\Autoloader;
    use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;

    if ( ! defined( 'GPP_PLUGIN_FILE' ) ) {
        define( 'GPP_PLUGIN_FILE', realpath( __DIR__ . '/../../gravity-presentation-profiles.php' ) );
    }

    $GLOBALS['gpp_test_is_rtl'] = false;
    $GLOBALS['gpp_test_grid_id'] = 'user_id_1_inbox_shortcode_13_test';
    $GLOBALS['gpp_test_inline_success'] = true;
    $GLOBALS['gpp_test_enqueued_scripts'] = array();
    $GLOBALS['gpp_test_inline_scripts'] = array();

    function is_rtl() {
        return ! empty( $GLOBALS['gpp_test_is_rtl'] );
    }

    function __( $text, $domain = null ) {
        unset( $domain );
        return $text;
    }

    function plugins_url( $path, $plugin_file = null ) {
        unset( $plugin_file );
        return 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . ltrim( $path, '/' );
    }

    function wp_enqueue_script( $handle, $src = '', $dependencies = array(), $version = false, $in_footer = false ) {
        $GLOBALS['gpp_test_enqueued_scripts'][] = array(
            'handle' => $handle,
            'src' => $src,
            'dependencies' => $dependencies,
            'version' => $version,
            'in_footer' => $in_footer,
        );
    }

    function wp_add_inline_script( $handle, $data, $position = 'after' ) {
        $GLOBALS['gpp_test_inline_scripts'][] = array(
            'handle' => $handle,
            'data' => $data,
            'position' => $position,
        );
        return ! empty( $GLOBALS['gpp_test_inline_success'] );
    }

    function wp_json_encode( $value, $flags = 0, $depth = 512 ) {
        return json_encode( $value, $flags, $depth );
    }

    final class GppTestInboxTaskModel {
        public function get_unique_grid_id_from_args( $args ) {
            unset( $args );
            return $GLOBALS['gpp_test_grid_id'];
        }
    }

    final class GppTestInboxContainer {
        public function get( $key ) {
            if ( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL !== $key ) {
                throw new \RuntimeException( 'Unexpected test container key.' );
            }
            return new GppTestInboxTaskModel();
        }
    }

    final class Gravity_Flow {
        public static function get_instance() {
            return new self();
        }

        public function container() {
            return new GppTestInboxContainer();
        }
    }

    Autoloader::register();

    function gpp_rtl_header_set_configuration() {
        $loaded = new \ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations_loaded' );
        $loaded->setAccessible( true );
        $loaded->setValue( null, true );

        $configurations = new \ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations' );
        $configurations->setAccessible( true );
        $configurations->setValue( null, array(
            101 => array(
                'form_id' => 101,
                'column_keys' => array(
                    'student_name' => '1',
                    'national_id' => '3',
                    'school_grade' => '6',
                ),
                'sources' => array(),
            ),
        ) );

        $active = new \ReflectionProperty( InboxTableHeaderPresentation::class, 'active_form_id' );
        $active->setAccessible( true );
        $active->setValue( null, null );
    }

    function gpp_rtl_header_reset_asset_capture() {
        $GLOBALS['gpp_test_enqueued_scripts'] = array();
        $GLOBALS['gpp_test_inline_scripts'] = array();
        $GLOBALS['gpp_test_inline_success'] = true;
    }

    $native = array(
        'form_title' => 'فرم',
        'workflow_step' => 'مرحله',
        'id' => 'شناسه',
        'created_by' => 'ارسال‌کننده',
        'status' => 'وضعیت',
        'date_created' => 'تاریخ ثبت',
        'date_created_human_readable' => 'نمایش تاریخ ثبت',
    );

    $owner_right_to_left = array(
        'عملیات',
        'نام دانش‌آموز',
        'کد ملی',
        'مدرسه و پایه',
        'تاریخ و ساعت ثبت',
    );

    gpp_rtl_header_set_configuration();
    $ltr = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
    gpp_assert_same(
        array( 'id', '1', '3', '6', 'date_created', 'date_created_human_readable' ),
        array_map( 'strval', array_keys( $ltr ) ),
        'LTR requests must retain the existing physical native column sequence.'
    );
    gpp_assert_same(
        $owner_right_to_left,
        array_values( array_slice( $ltr, 0, 5, true ) ),
        'LTR control must retain the five existing labels unchanged.'
    );
    gpp_assert_same( array(), $GLOBALS['gpp_test_enqueued_scripts'], 'LTR projection must not enqueue the RTL order reconciler.' );

    $GLOBALS['gpp_test_is_rtl'] = true;
    gpp_rtl_header_set_configuration();
    $rtl = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
    gpp_assert_same(
        array( 'date_created', '6', '3', '1', 'id', 'date_created_human_readable' ),
        array_map( 'strval', array_keys( $rtl ) ),
        'RTL requests must reverse only the five visible physical columns for the native LTR Grid.'
    );
    gpp_assert_same(
        array_reverse( $owner_right_to_left ),
        array_values( array_slice( $rtl, 0, 5, true ) ),
        'RTL physical left-to-right labels must be the inverse of the Owner right-to-left contract.'
    );
    gpp_assert_same(
        $owner_right_to_left,
        array_reverse( array_values( array_slice( $rtl, 0, 5, true ) ) ),
        'RTL visible right-to-left order must exactly match the Owner contract.'
    );
    gpp_assert_same(
        'نمایش تاریخ ثبت',
        $rtl['date_created_human_readable'],
        'RTL ordering must preserve the native hidden date display companion unchanged.'
    );
    gpp_assert_same(
        array( 'date_created', '6', '3', '1', 'id' ),
        array_map( 'strval', array_keys( array_slice( $rtl, 0, 5, true ) ) ),
        'RTL ordering must keep exactly the same five visible column identities.'
    );

    $asset_path = dirname( GPP_PLUGIN_FILE ) . '/' . InboxTableHeaderPresentation::COLUMN_ORDER_SCRIPT_PATH;
    gpp_assert_true( is_file( $asset_path ), 'RTL column-order runtime asset must exist.' );
    $expected_version = substr( hash_file( 'sha256', $asset_path ), 0, 16 );
    gpp_assert_same( 1, count( $GLOBALS['gpp_test_enqueued_scripts'] ), 'RTL projection must enqueue exactly one order reconciler.' );
    gpp_assert_same(
        array(
            'handle' => InboxTableHeaderPresentation::COLUMN_ORDER_SCRIPT_HANDLE,
            'src' => 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . InboxTableHeaderPresentation::COLUMN_ORDER_SCRIPT_PATH,
            'dependencies' => array(),
            'version' => $expected_version,
            'in_footer' => true,
        ),
        $GLOBALS['gpp_test_enqueued_scripts'][0],
        'RTL order reconciler must use deterministic asset identity and footer delivery.'
    );
    gpp_assert_same( 1, count( $GLOBALS['gpp_test_inline_scripts'] ), 'Exact Grid contract must be emitted once.' );
    gpp_assert_same( InboxTableHeaderPresentation::COLUMN_ORDER_SCRIPT_HANDLE, $GLOBALS['gpp_test_inline_scripts'][0]['handle'], 'Inline contract must bind to the reconciler handle.' );
    gpp_assert_same( 'before', $GLOBALS['gpp_test_inline_scripts'][0]['position'], 'Grid contract must exist before the reconciler executes.' );
    gpp_assert_true(
        false !== strpos( $GLOBALS['gpp_test_inline_scripts'][0]['data'], 'user_id_1_inbox_shortcode_13_test' ),
        'Inline contract must contain the exact native Gravity Flow Grid ID.'
    );
    gpp_assert_true(
        false !== strpos( $GLOBALS['gpp_test_inline_scripts'][0]['data'], '["date_created","6","3","1","id"]' ),
        'Inline contract must contain exactly the approved physical RTL column order.'
    );

    gpp_rtl_header_set_configuration();
    $rtl_repeat = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
    gpp_assert_same( $rtl, $rtl_repeat, 'Repeated projection for the same exact Grid must remain deterministic.' );
    gpp_assert_same( 1, count( $GLOBALS['gpp_test_enqueued_scripts'] ), 'Repeated same-Grid projection must not enqueue duplicate contracts.' );
    gpp_assert_same( 1, count( $GLOBALS['gpp_test_inline_scripts'] ), 'Repeated same-Grid projection must not emit duplicate inline contracts.' );

    InboxTableHeaderPresentation::resetRuntimeCache();
    gpp_rtl_header_set_configuration();
    gpp_rtl_header_reset_asset_capture();
    $GLOBALS['gpp_test_grid_id'] = '';
    $fail_closed = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
    gpp_assert_same( $native, $fail_closed, 'Missing exact native Grid ID must fail closed to untouched native columns.' );
    gpp_assert_same( array(), $GLOBALS['gpp_test_enqueued_scripts'], 'Missing Grid identity must not enqueue the reconciler.' );

    $active = new \ReflectionProperty( InboxTableHeaderPresentation::class, 'active_form_id' );
    $active->setAccessible( true );
    gpp_assert_same( null, $active->getValue(), 'Failed RTL contract binding must not authorize GPP field-value projection.' );

    InboxTableHeaderPresentation::resetRuntimeCache();
    gpp_rtl_header_set_configuration();
    gpp_rtl_header_reset_asset_capture();
    $GLOBALS['gpp_test_grid_id'] = 'user_id_1_inbox_shortcode_13_retry';
    $GLOBALS['gpp_test_inline_success'] = false;
    $inline_fail = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
    gpp_assert_same( $native, $inline_fail, 'Inline contract delivery failure must fail closed to native columns.' );
    gpp_assert_same( 1, count( $GLOBALS['gpp_test_enqueued_scripts'] ), 'Asset may be enqueued before an inline-delivery failure is known.' );
    gpp_assert_same( 1, count( $GLOBALS['gpp_test_inline_scripts'] ), 'Failed inline delivery attempt must be observable once.' );

    $GLOBALS['gpp_test_inline_success'] = true;
    $inline_retry = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
    gpp_assert_same(
        array( 'date_created', '6', '3', '1', 'id', 'date_created_human_readable' ),
        array_map( 'strval', array_keys( $inline_retry ) ),
        'A failed inline contract must not poison retry for the same Grid ID.'
    );
    gpp_assert_same( 2, count( $GLOBALS['gpp_test_enqueued_scripts'] ), 'Retry must re-attempt runtime asset binding after a failed inline contract.' );
    gpp_assert_same( 2, count( $GLOBALS['gpp_test_inline_scripts'] ), 'Retry must emit a fresh inline contract after prior failure.' );

    $asset_source = file_get_contents( $asset_path );
    gpp_assert_true( is_string( $asset_source ), 'RTL order reconciler source must be readable.' );
    gpp_assert_true( false === strpos( $asset_source, 'localStorage' ), 'Production reconciler must not inspect or mutate localStorage.' );
    gpp_assert_true( false === strpos( $asset_source, 'sessionStorage' ), 'Production reconciler must not inspect or mutate sessionStorage.' );
    gpp_assert_true( false === strpos( $asset_source, 'removeItem' ), 'Production reconciler must not delete browser persistence records.' );
    gpp_assert_true( false !== strpos( $asset_source, 'getColumnState' ), 'Production reconciler must reuse native AG Grid column state.' );
    gpp_assert_true( false !== strpos( $asset_source, 'applyColumnState' ), 'Production reconciler must reconcile through native AG Grid column state API.' );
    gpp_assert_true( false !== strpos( $asset_source, 'applyOrder: true' ), 'Production reconciler must change only native state order.' );

    echo "INBOX_TABLE_HEADER_RTL_ORDER_PASS\n";
}
