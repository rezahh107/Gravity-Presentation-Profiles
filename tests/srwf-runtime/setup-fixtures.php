<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'SRWF_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'SRWF_ARTIFACT_DIR is required.' );
}
wp_mkdir_p( $artifact_dir );

if ( ! class_exists( 'GFAPI' ) || ! class_exists( 'GF_Fields' ) ) {
    throw new RuntimeException( 'Gravity Forms runtime APIs are unavailable.' );
}

if ( ! class_exists( 'PGR_GF_Field_Jalali_Date' ) || ! GF_Fields::get( 'pgr_jalali_date' ) ) {
    throw new RuntimeException( 'PersianGravity Jalali field is unavailable.' );
}

$addon_class = 'GravityPresentationProfiles\\GravityForms\\AddOn';
if ( ! class_exists( $addon_class ) ) {
    throw new RuntimeException( 'Gravity Presentation Profiles add-on is unavailable.' );
}

function gpp_srwf_runtime_add_form( $title, $css_class, $settings, $with_jalali ) {
    $fields = array(
        array(
            'id'          => 1,
            'label'       => 'Student Name',
            'type'        => 'text',
            'isRequired'  => true,
            'description' => 'Persistent student-name guidance.',
        ),
        array(
            'id'          => 2,
            'label'       => 'School',
            'type'        => 'select',
            'isRequired'  => true,
            'description' => 'Choose the current school.',
            'choices'     => array(
                array( 'text' => 'School Alpha', 'value' => 'alpha' ),
                array( 'text' => 'School Beta', 'value' => 'beta' ),
            ),
        ),
    );

    if ( $with_jalali ) {
        $fields[] = array(
            'id'            => 3,
            'label'         => 'Jalali Date',
            'type'          => 'pgr_jalali_date',
            'isRequired'    => true,
            'description'   => 'Enter a Jalali date in YYYY/MM/DD format.',
            'jalali_format' => 'ymd_slash',
        );
    }

    $fields[] = array(
        'id'          => 4,
        'label'       => 'Registration Notes',
        'type'        => 'section',
        'description' => 'Authentic Gravity Forms section markup.',
    );

    $form = array(
        'title'                => $title,
        'description'          => 'Authentic SRWF runtime evidence form.',
        'labelPlacement'       => 'top_label',
        'descriptionPlacement' => 'below',
        'cssClass'             => $css_class,
        'fields'               => $fields,
        'button'               => array( 'type' => 'text', 'text' => 'Submit Registration' ),
        'gravity-presentation-profiles' => $settings,
    );

    $form_id = GFAPI::add_form( $form );
    if ( is_wp_error( $form_id ) ) {
        throw new RuntimeException( $form_id->get_error_message() );
    }

    return (int) $form_id;
}

$selected_id = gpp_srwf_runtime_add_form(
    'SRWF Selected Runtime Form',
    'host-selected-class',
    array( 'enabled' => '1', 'profile' => 'srwf-registration' ),
    true
);

$plain_id = gpp_srwf_runtime_add_form(
    'Unrelated Gravity Form',
    'host-unselected-class',
    array( 'enabled' => '0', 'profile' => 'srwf-registration' ),
    true
);

$selected_form = GFAPI::get_form( $selected_id );
$plain_form    = GFAPI::get_form( $plain_id );
if ( ! is_array( $selected_form ) || ! is_array( $plain_form ) ) {
    throw new RuntimeException( 'Unable to read back runtime forms.' );
}

$addon = $addon_class::get_instance();
$selected_state = $addon->resolve_form_state( $selected_form );
$plain_state    = $addon->resolve_form_state( $plain_form );
$selected_profile = $selected_state->profile();
if ( ! $selected_state->isActive() || ! $selected_profile || 'srwf-registration' !== $selected_profile->key() ) {
    throw new RuntimeException( 'Authentic Gravity Forms readback did not preserve the selected GPP per-form state.' );
}
if ( $plain_state->isActive() ) {
    throw new RuntimeException( 'Unrelated Gravity Form unexpectedly resolved to an active GPP profile.' );
}

$content = sprintf(
    '<h1>SRWF Runtime Evidence</h1>[gravityform id="%1$d" title="true" description="true" ajax="false" theme="orbital"]<hr>[gravityform id="%2$d" title="true" description="true" ajax="false" theme="orbital"]',
    $selected_id,
    $plain_id
);

$page_id = wp_insert_post(
    array(
        'post_type'    => 'page',
        'post_status'  => 'publish',
        'post_title'   => 'SRWF Runtime Evidence',
        'post_name'    => 'srwf-runtime-evidence',
        'post_content' => $content,
    ),
    true
);
if ( is_wp_error( $page_id ) ) {
    throw new RuntimeException( $page_id->get_error_message() );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'data_class'     => 'SYNTHETIC_NON_PII_CONTENT__AUTHENTIC_HOST_RUNTIME',
    'page_id'        => (int) $page_id,
    'selected_form'  => array(
        'id'                => $selected_id,
        'jalali_field_id'   => 3,
        'expected_profile'  => 'srwf-registration',
        'host_css_class'    => 'host-selected-class',
    ),
    'plain_form'     => array(
        'id'                => $plain_id,
        'jalali_field_id'   => 3,
        'host_css_class'    => 'host-unselected-class',
    ),
    'runtime'        => array(
        'gravity_forms_version' => GFForms::$version,
        'persiangravity_version' => defined( 'PGR_VERSION' ) ? PGR_VERSION : null,
        'gpp_version' => defined( 'GPP_VERSION' ) ? GPP_VERSION : null,
    ),
);

update_option( 'gpp_srwf_runtime_manifest', $manifest, false );
file_put_contents(
    $artifact_dir . '/fixture-manifest.json',
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);

echo wp_json_encode( $manifest, JSON_UNESCAPED_SLASHES ) . "\n";
