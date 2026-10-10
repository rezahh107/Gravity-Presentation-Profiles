<?php
/**
 * Host-only fixture for the connected generic no-code journey.
 * Deliberately does NOT install a package or configure GPP form settings.
 */
if ( ! defined( 'ABSPATH' ) || ! class_exists( 'GFAPI' ) ) {
    throw new RuntimeException( 'Authentic WordPress/Gravity Forms host required.' );
}
$dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $dir || ! is_dir( $dir ) ) {
    throw new RuntimeException( 'Existing WU21 artifact directory required.' );
}
function gpp_generic_e2e_host_form( $title ) {
    $form = array(
        'title' => $title,
        'description' => 'Independent synthetic, non-SRWF acceptance fixture',
        'labelPlacement' => 'top_label',
        'fields' => array(
            array( 'id' => 1, 'label' => 'Synthetic Name', 'type' => 'text', 'isRequired' => true ),
            array( 'id' => 2, 'label' => 'Synthetic Email', 'type' => 'email', 'isRequired' => true ),
            array(
                'id' => 3, 'label' => 'Synthetic Choice', 'type' => 'select', 'isRequired' => true,
                'placeholder' => 'Choose a synthetic option',
                'choices' => array(
                    array( 'text' => 'Synthetic Blue', 'value' => 'blue' ),
                    array( 'text' => 'Synthetic Amber', 'value' => 'amber' ),
                ),
            ),
            array( 'id' => 4, 'label' => 'Synthetic Notes', 'type' => 'textarea', 'isRequired' => true ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Send Synthetic Entry' ),
    );
    $id = GFAPI::add_form( $form );
    if ( is_wp_error( $id ) || ! $id ) {
        throw new RuntimeException( is_wp_error( $id ) ? $id->get_error_message() : 'Form creation failed.' );
    }
    $page_id = wp_insert_post(
        array(
            'post_type' => 'page', 'post_status' => 'publish',
            'post_title' => $title . ' public host',
            'post_content' => sprintf(
                '<div dir="ltr">[gravityform id="%d" title="false" description="false" ajax="false" theme="orbital"]</div>',
                (int) $id
            ),
        ),
        true
    );
    if ( is_wp_error( $page_id ) || ! $page_id ) {
        throw new RuntimeException( is_wp_error( $page_id ) ? $page_id->get_error_message() : 'Page creation failed.' );
    }
    $saved = GFAPI::get_form( $id );
    if ( ! is_array( $saved ) || isset( $saved['gravity-presentation-profiles']['declarative_profile'] ) ) {
        throw new RuntimeException( 'Fixture must not preselect a GPP profile.' );
    }
    return array( 'id' => (int) $id, 'url' => get_permalink( $page_id ) );
}
$manifest = array(
    'data_class' => 'SYNTHETIC_NON_PII_AUTHENTIC_HOST',
    'target' => gpp_generic_e2e_host_form( 'Generic Profile Acceptance' ),
    'control' => gpp_generic_e2e_host_form( 'Unrelated Native Form' ),
);
file_put_contents(
    $dir . '/generic-no-code-form-fixtures.json',
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);
echo "GPP_GENERIC_E2E_HOST_FIXTURE_PASS\n";
