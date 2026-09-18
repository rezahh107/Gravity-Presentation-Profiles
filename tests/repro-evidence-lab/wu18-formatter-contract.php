<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\SRWF\GravityFlow\BoundHostValueReader;

$reader = new BoundHostValueReader();
$form_id = 91818;

$text = GF_Fields::create( array( 'id' => 1, 'label' => 'WU18 Text', 'type' => 'text' ) );
$phone = GF_Fields::create( array( 'id' => 2, 'label' => 'WU18 Phone', 'type' => 'phone' ) );
$radio = GF_Fields::create( array(
    'id' => 3,
    'label' => 'WU18 Radio',
    'type' => 'radio',
    'choices' => array(
        array( 'text' => 'گزینه الف', 'value' => 'raw-a' ),
        array( 'text' => 'گزینه ب', 'value' => 'raw-b' ),
    ),
) );
$select = GF_Fields::create( array(
    'id' => 4,
    'label' => 'WU18 Select',
    'type' => 'select',
    'choices' => array(
        array( 'text' => 'انتخاب یک', 'value' => 'select-1' ),
        array( 'text' => 'انتخاب دو', 'value' => 'select-2' ),
    ),
) );
$name = GF_Fields::create( array(
    'id' => 5,
    'label' => 'WU18 Name',
    'type' => 'name',
    'inputs' => array(
        array( 'id' => '5.3', 'label' => 'Given' ),
        array( 'id' => '5.6', 'label' => 'Family' ),
    ),
) );
$date = GF_Fields::create( array(
    'id' => 6,
    'label' => 'WU18 Date',
    'type' => 'date',
    'dateFormat' => 'ymd_dash',
) );

foreach ( array( $text, $phone, $radio, $select, $name, $date ) as $field ) {
    wu18_assert( is_object( $field ), 'Pinned Gravity Forms could not create a representative field object.' );
}

$form = array(
    'id' => $form_id,
    'fields' => array( $text, $phone, $radio, $select, $name, $date ),
);
$entry = array(
    'id' => 9181801,
    'form_id' => $form_id,
    '1' => 'Plain host text',
    '2' => '02112345678',
    '3' => 'raw-a',
    '4' => 'select-2',
    '5.3' => 'GivenPart',
    '5.6' => 'FamilyPart',
    '6' => '2026-09-19',
);

$cases = array(
    'text' => array( 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 1 ), 'raw' => 'Plain host text', 'display_contains' => 'Plain host text' ),
    'phone' => array( 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 2 ), 'raw' => '02112345678', 'display_contains' => '02112345678' ),
    'radio' => array( 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 3 ), 'raw' => 'raw-a', 'display_contains' => 'گزینه الف' ),
    'select' => array( 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 4 ), 'raw' => 'select-2', 'display_contains' => 'انتخاب دو' ),
    'compound_input' => array( 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => '5.3' ), 'raw' => 'GivenPart', 'display_contains' => 'GivenPart' ),
    'date' => array( 'source' => array( 'type' => 'gravity_forms.field', 'field_id' => 6 ), 'raw' => '2026-09-19', 'display_contains' => '2026' ),
);

$evidence = array();
foreach ( $cases as $name_key => $case ) {
    $raw = $reader->readRaw( $case['source'], $form, $entry );
    $display = $reader->readDisplay( $case['source'], $form, $entry );
    wu18_assert( $case['raw'] === $raw, 'Pinned GF raw identity changed for ' . $name_key . '.' );
    wu18_assert( is_scalar( $display ) && false !== strpos( (string) $display, $case['display_contains'] ), 'Pinned GF display formatter failed for ' . $name_key . '.' );
    $evidence[ $name_key ] = array(
        'raw_identity_preserved' => true,
        'display_formatter_returned_host_text' => true,
    );
}

// File/upload formatting is exercised against the real persisted WU18 file
// fixture because GF_Field_FileUpload may consult authentic entry/file context.
$manifest = get_option( 'gpp_wu18_fixture_manifest' );
wu18_assert( is_array( $manifest ) && ! empty( $manifest['beta']['fields']['documents.report_card'] ), 'WU18 file formatter fixture unavailable.' );
$beta_form = GFAPI::get_form( (int) $manifest['beta']['form_id'] );
$beta_entry = GFAPI::get_entry( (int) $manifest['beta']['entry_id'] );
$file_source = array( 'type' => 'gravity_forms.field', 'field_id' => $manifest['beta']['fields']['documents.report_card'] );
$file_raw = $reader->readRaw( $file_source, $beta_form, $beta_entry );
$file_display = $reader->readDisplay( $file_source, $beta_form, $beta_entry );
wu18_assert( is_string( $file_raw ) && '' !== $file_raw, 'Pinned GF file raw identity unavailable.' );
wu18_assert( is_scalar( $file_display ) && '' !== trim( (string) $file_display ), 'Pinned GF file display formatter returned no presentation output.' );
wu18_assert( $file_raw === $reader->readRaw( $file_source, $beta_form, $beta_entry ), 'Display formatting mutated persisted file raw identity.' );
$evidence['file_upload'] = array(
    'raw_identity_preserved' => true,
    'display_formatter_returned_host_text' => true,
);

$results_path = trailingslashit( getenv( 'WU21_ARTIFACT_DIR' ) ) . 'wu18-runtime-results.json';
$results = is_file( $results_path ) ? json_decode( file_get_contents( $results_path ), true ) : array();
if ( ! is_array( $results ) ) $results = array();
$results['gravity_forms_formatter_contract'] = array(
    'gravity_forms_version' => defined( 'GF_VERSION' ) ? GF_VERSION : null,
    'raw_and_display_separate' => true,
    'representative_types' => $evidence,
);
file_put_contents(
    $results_path,
    wp_json_encode( $results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "WU18_GF_FORMATTER_CONTRACT_PASS\n";
