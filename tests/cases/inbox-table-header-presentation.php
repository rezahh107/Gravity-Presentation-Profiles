<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

$GLOBALS['gpp_filters'] = array();

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function __( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function wp_strip_all_tags( $text, $remove_breaks = false ) {
    $text = strip_tags( (string) $text );
    return $remove_breaks ? preg_replace( '/[\r\n\t ]+/', ' ', $text ) : $text;
}

final class GppInboxHeaderFakeField {
    public function get_value_entry_detail( $raw, $entry, $format_media = true, $media = 'text' ) {
        unset( $entry, $format_media, $media );
        return $raw;
    }
}

final class GFAPI {
    public static function get_form( $form_id ) {
        return 101 === (int) $form_id ? array( 'id' => 101 ) : null;
    }

    public static function get_field( $form, $field_id ) {
        unset( $form );
        return in_array( (string) $field_id, array( '1', '2', '3', '5', '6' ), true ) ? new GppInboxHeaderFakeField() : null;
    }
}

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;

Autoloader::register();

function gpp_header_binding_set() {
    $bindings = array(
        array( 'semantic_slot_key' => 'student.first_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ) ),
        array( 'semantic_slot_key' => 'student.last_name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ) ),
        array( 'semantic_slot_key' => 'student.national_id', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 3 ) ),
        array( 'semantic_slot_key' => 'education.grade_group', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 5 ) ),
        array( 'semantic_slot_key' => 'school.name', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.field', 'field_id' => 6 ) ),
        array( 'semantic_slot_key' => 'entry.created_at', 'state' => 'PROVEN', 'source_ref' => array( 'type' => 'gravity_forms.entry_meta', 'meta_key' => 'date_created' ) ),
    );
    $artifact = array(
        'artifact_type' => 'gpp.environment_binding_set',
        'schema_version' => '1.1.0',
        'binding_set_id' => 'gpp.header.fixture',
        'binding_set_version' => '1.0.0',
        'context' => array(
            'installation_source_ref' => array( 'type' => 'wordpress.installation', 'installation_id' => 'fixture' ),
            'form_source_ref' => array( 'type' => 'gravity_forms.form', 'form_id' => 101 ),
            'entry_source_ref' => null,
            'surfaces' => array( 'gravity_flow.inbox' ),
        ),
        'bindings' => $bindings,
        'runtime_claims' => array(),
    );

    foreach ( $bindings as $binding ) {
        $artifact['runtime_claims'][] = array(
            'semantic_slot_key' => $binding['semantic_slot_key'],
            'claim' => 'availability',
            'evidence_state' => 'PROVEN',
            'evidence_refs' => array(
                InboxRuntimeEvidence::availabilityRef( $artifact, $binding['semantic_slot_key'], $binding['source_ref'] ),
            ),
        );
    }

    return $artifact;
}

function gpp_header_config_from_binding( $binding ) {
    $method = new ReflectionMethod( InboxTableHeaderPresentation::class, 'configurationFromBindingSet' );
    $method->setAccessible( true );
    return $method->invoke( null, $binding );
}

function gpp_header_set_configs( $configs ) {
    $loaded = new ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations_loaded' );
    $loaded->setAccessible( true );
    $loaded->setValue( null, true );
    $property = new ReflectionProperty( InboxTableHeaderPresentation::class, 'configurations' );
    $property->setAccessible( true );
    $property->setValue( null, $configs );
    $active = new ReflectionProperty( InboxTableHeaderPresentation::class, 'active_form_id' );
    $active->setAccessible( true );
    $active->setValue( null, null );
}

InboxTableHeaderPresentation::register();
gpp_assert_same( 2, count( $GLOBALS['gpp_filters'] ), 'Header batch should register exactly the two native Gravity Flow Inbox filters it needs.' );
gpp_assert_same( 'gravityflow_columns_inbox_table', $GLOBALS['gpp_filters'][0][0], 'Column structure must use the native Inbox column filter.' );
gpp_assert_same( PHP_INT_MAX, $GLOBALS['gpp_filters'][0][2], 'Header projection must run after ordinary site column customizations.' );
gpp_assert_same( 2, $GLOBALS['gpp_filters'][0][3], 'Column filter accepted-args contract mismatch.' );
gpp_assert_same( 'gravityflow_inbox_field_value', $GLOBALS['gpp_filters'][1][0], 'Combined plain-text values must stay on the native Inbox value filter.' );
gpp_assert_same( 4, $GLOBALS['gpp_filters'][1][3], 'Inbox value filter accepted-args contract mismatch.' );

$binding = gpp_header_binding_set();
$config = gpp_header_config_from_binding( $binding );
gpp_assert_true( is_array( $config ), 'Exact active/proven SRWF field sources should produce a bounded header configuration.' );
gpp_assert_same( 101, $config['form_id'], 'Header configuration must retain the authoritative bound form.' );
gpp_assert_same( '1', $config['column_keys']['student_name'], 'Student name must anchor to the proven first-name field column.' );
gpp_assert_same( '3', $config['column_keys']['national_id'], 'National ID must use its proven field column.' );
gpp_assert_same( '6', $config['column_keys']['school_grade'], 'School/grade must anchor to the proven school field column.' );

$stale = $binding;
foreach ( $stale['runtime_claims'] as &$claim ) {
    if ( 'school.name' === $claim['semantic_slot_key'] ) {
        $claim['evidence_refs'] = array( 'stale-proof' );
    }
}
unset( $claim );
gpp_assert_same( null, gpp_header_config_from_binding( $stale ), 'A stale runtime-availability claim must fail closed instead of guessing a school column.' );

$entry_specific = $binding;
$entry_specific['context']['entry_source_ref'] = array( 'type' => 'gravity_forms.entry', 'entry_id' => 88 );
gpp_assert_same( null, gpp_header_config_from_binding( $entry_specific ), 'A table-wide header must not be derived from one entry-specific binding context.' );

gpp_header_set_configs( array( 101 => $config ) );
$before = array(
    'form_title' => 'فرم',
    'workflow_step' => 'مرحله',
    'id' => 'شناسه',
    'created_by' => 'ارسال‌کننده',
    'status' => 'وضعیت',
    'date_created' => 'تاریخ ثبت',
    'date_created_human_readable' => 'نمایش تاریخ ثبت',
);
$after = InboxTableHeaderPresentation::filterColumns( $before, array( 'form_id' => 101 ) );
gpp_assert_same(
    array( 'id', '1', '3', '6', 'date_created', 'date_created_human_readable' ),
    array_map( 'strval', array_keys( $after ) ),
    'Header projection must keep the five visible Owner columns plus Gravity Flow native date display companion in host order.'
);
gpp_assert_same(
    array( 'عملیات', 'نام دانش‌آموز', 'کد ملی', 'مدرسه و پایه', 'تاریخ و ساعت ثبت' ),
    array_values( array_slice( $after, 0, 5, true ) ),
    'Visible Persian header labels must match the requested contract exactly.'
);
gpp_assert_same(
    'نمایش تاریخ ثبت',
    $after['date_created_human_readable'],
    'Gravity Flow native Submitted display companion must be preserved unchanged.'
);
foreach ( array( 'status', 'workflow_step', 'created_by', 'form_title' ) as $removed ) {
    gpp_assert_true( ! array_key_exists( $removed, $after ), 'Non-target native column remained visible: ' . $removed );
}

$entry = array(
    'id' => 7001,
    'form_id' => 101,
    '1' => '<b>رضا</b>',
    '2' => 'احمدی',
    '3' => '0012345678',
    '5' => 'هشتم',
    '6' => 'مدرسه نمونه',
);
gpp_assert_same(
    'رضا احمدی',
    InboxTableHeaderPresentation::filterFieldValue( '<b>رضا</b>', 101, 1, $entry ),
    'Student-name header must receive plain text composed only from the two proven bound fields.'
);
gpp_assert_same(
    'مدرسه نمونه — هشتم',
    InboxTableHeaderPresentation::filterFieldValue( 'مدرسه نمونه', 101, 6, $entry ),
    'School/grade header must receive plain text composed only from the two proven bound fields.'
);
gpp_assert_same(
    '0012345678',
    InboxTableHeaderPresentation::filterFieldValue( '0012345678', 101, 3, $entry ),
    'National-ID native value must remain host-owned and unchanged.'
);
gpp_assert_same(
    'native submitted display',
    InboxTableHeaderPresentation::filterFieldValue( 'native submitted display', 101, 'date_created_human_readable', $entry ),
    'Submitted display value must remain host-owned and unchanged.'
);
gpp_assert_same(
    'unchanged',
    InboxTableHeaderPresentation::filterFieldValue( 'unchanged', 999, 1, $entry ),
    'Rows from another form must not receive SRWF field-value composition.'
);

$second = $config;
$second['form_id'] = 202;
gpp_header_set_configs( array( 101 => $config, 202 => $second ) );
gpp_assert_same(
    $before,
    InboxTableHeaderPresentation::filterColumns( $before, array() ),
    'A generic multi-form Inbox must remain native when no authoritative form context selects one header mapping.'
);
$scoped = InboxTableHeaderPresentation::filterColumns( $before, array( 'form_id' => '101' ) );
gpp_assert_same( array_values( $after ), array_values( $scoped ), 'Native form-scoped Inbox args should select only the matching authoritative binding.' );
gpp_assert_same(
    $before,
    InboxTableHeaderPresentation::filterColumns( $before, array( 'form' => '101' ) ),
    'Shortcode attribute naming must not be mistaken for the native Inbox hook form_id contract.'
);

$missing_id = $before;
unset( $missing_id['id'] );
gpp_assert_same( $missing_id, InboxTableHeaderPresentation::filterColumns( $missing_id, array( 'form_id' => 101 ) ), 'If native Open/ID disappears, header projection must fail closed.' );

$missing_date_display = $before;
unset( $missing_date_display['date_created_human_readable'] );
gpp_assert_same( $missing_date_display, InboxTableHeaderPresentation::filterColumns( $missing_date_display, array( 'form_id' => 101 ) ), 'If native Submitted display companion disappears, header projection must fail closed.' );

gpp_header_set_configs( array() );
gpp_assert_same( $before, InboxTableHeaderPresentation::filterColumns( $before, array( 'form_id' => 101 ) ), 'Unresolved binding configuration must preserve the native Inbox unchanged.' );

echo "INBOX_TABLE_HEADER_PRESENTATION_PASS\n";
