<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! class_exists( 'GFAPI' ) ) {
    throw new RuntimeException( 'WU18 unbound form control requires the pinned Gravity Forms runtime.' );
}

$form_id = GFAPI::add_form(
    array(
        'title' => 'WU18 Unbound Entry Detail Setup Control',
        'description' => 'Synthetic control form with no GPP operations binding context.',
        'fields' => array(
            array( 'id' => 1, 'label' => 'Synthetic control value', 'type' => 'text', 'isRequired' => false ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit' ),
    )
);
if ( is_wp_error( $form_id ) || (int) $form_id <= 0 ) {
    throw new RuntimeException( 'Unable to create WU18 unbound setup control form.' );
}

wp_mkdir_p( $artifact_dir );
file_put_contents( trailingslashit( $artifact_dir ) . 'wu18-unbound-form-id.txt', (string) (int) $form_id . "\n" );
echo (int) $form_id . "\n";
