<?php
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

\GravityPresentationProfiles\Autoloader::register();
use GravityPresentationProfiles\Elementor\Inbox2AtomicIntegration as Boundary;

$id = 'a1b2c3d4';
$prop = static function ( $value ) { return array( '$$type' => 'string', 'value' => $value ); };
$widget = static function ( $settings, $id = 'a1b2c3d4' ) {
    return array( 'id' => $id, 'elType' => 'widget', 'widgetType' => Boundary::TYPE,
        'settings' => $settings, 'elements' => array() );
};
$good = $widget( array( 'form_id' => $prop( '27' ), 'native_page_id' => $prop( '31' ) ) );
$encode = static function ( $nodes ) { return json_encode( $nodes ); };
$valid = $encode( array( array( 'id' => 'aabbccdd', 'elType' => 'container',
    'elements' => array( $good ) ) ) );
gpp_assert_same( array( 'form_id' => 27, 'native_page_id' => 31 ),
    Boundary::locateSavedInstance( $valid, $id ), 'Ordinary unique persisted Atomic instance must be found.' );

foreach ( array(
    'duplicate_element_id' => $encode( array( $good, $good ) ),
    'wrong_widget_type' => $encode( array( array_merge( $good, array( 'widgetType' => 'e-other' ) ) ) ),
    'unsupported_popup_parent' => $encode( array( array( 'elType' => 'template', 'elements' => array( $good ) ) ) ),
    'missing_form' => $encode( array( $widget( array( 'native_page_id' => $prop( '31' ) ) ) ) ),
    'zero_form' => $encode( array( $widget( array( 'form_id' => $prop( '0' ), 'native_page_id' => $prop( '31' ) ) ) ) ),
    'leading_zero_form' => $encode( array( $widget( array( 'form_id' => $prop( '027' ), 'native_page_id' => $prop( '31' ) ) ) ) ),
    'wrong_prop_type' => $encode( array( $widget( array( 'form_id' => array( '$$type' => 'number', 'value' => 27 ),
        'native_page_id' => $prop( '31' ) ) ) ) ),
    'dynamic_prop' => $encode( array( $widget( array( 'form_id' => array( '$$type' => 'string',
        'value' => '27', 'dynamic' => array( 'enabled' => true ) ), 'native_page_id' => $prop( '31' ) ) ) ) ),
    'invalid_json' => '{',
    'absent_element' => $encode( array( $widget( array( 'form_id' => $prop( '27' ),
        'native_page_id' => $prop( '31' ) ), 'deadbeef' ) ) ),
) as $label => $raw ) {
    gpp_assert_same( null, Boundary::locateSavedInstance( $raw, $id ), $label . ' must fail closed.' );
}
gpp_assert_same( false, Boundary::validElementId( '<script>' ), 'Untrusted DOM identity syntax is refused.' );
gpp_assert_same( null, Boundary::locateSavedInstance( $valid, 'bad' ), 'Short identity is refused.' );
echo "INBOX2_ATOMIC_DOCUMENT_BOUNDARY_PASS\n";
