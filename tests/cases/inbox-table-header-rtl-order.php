<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

$GLOBALS['gpp_test_is_rtl'] = false;

function is_rtl() {
    return ! empty( $GLOBALS['gpp_test_is_rtl'] );
}

function __( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;

Autoloader::register();

function gpp_rtl_header_set_configuration() {
    $loaded = new ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations_loaded' );
    $loaded->setAccessible( true );
    $loaded->setValue( null, true );

    $configurations = new ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations' );
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

    $active = new ReflectionProperty( InboxTableHeaderPresentation::class, 'active_form_id' );
    $active->setAccessible( true );
    $active->setValue( null, null );
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

$ltr_physical_labels = array(
    'عملیات',
    'نام دانش‌آموز',
    'کد ملی',
    'مدرسه و پایه',
    'تاریخ و ساعت ثبت',
);

$owner_right_to_left = array(
    'نام دانش‌آموز',
    'کد ملی',
    'مدرسه و پایه',
    'تاریخ و ساعت ثبت',
    'عملیات',
);

gpp_rtl_header_set_configuration();
$ltr = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
gpp_assert_same(
    array( 'id', '1', '3', '6', 'date_created', 'date_created_human_readable' ),
    array_map( 'strval', array_keys( $ltr ) ),
    'LTR requests must retain the existing physical native column sequence.'
);
gpp_assert_same(
    $ltr_physical_labels,
    array_values( array_slice( $ltr, 0, 5, true ) ),
    'LTR control must retain the five existing labels unchanged.'
);

$GLOBALS['gpp_test_is_rtl'] = true;
gpp_rtl_header_set_configuration();
$rtl = InboxTableHeaderPresentation::filterColumns( $native, array( 'form_id' => 101 ) );
gpp_assert_same(
    array( 'id', 'date_created', '6', '3', '1', 'date_created_human_readable' ),
    array_map( 'strval', array_keys( $rtl ) ),
    'RTL requests must keep native id first and reverse only the four informational columns.'
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
    array( 'id', 'date_created', '6', '3', '1' ),
    array_map( 'strval', array_keys( array_slice( $rtl, 0, 5, true ) ) ),
    'RTL ordering must keep exactly the same five visible column identities.'
);

echo "INBOX_TABLE_HEADER_RTL_ORDER_PASS\n";
