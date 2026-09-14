<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'SRWF_ARTIFACT_DIR' );
$manifest_path = getenv( 'SRWF_MANIFEST_PATH' );
if ( ! $artifact_dir || ! $manifest_path || ! is_file( $manifest_path ) ) {
    throw new RuntimeException( 'Existing authentic runtime manifest is required for sparse fixtures.' );
}

$manifest = json_decode( file_get_contents( $manifest_path ), true );
if ( ! is_array( $manifest ) || empty( $manifest['page_id'] ) || empty( $manifest['plain_form']['id'] ) ) {
    throw new RuntimeException( 'Authentic runtime manifest is incomplete.' );
}

if ( ! class_exists( 'GFAPI' ) || ! class_exists( 'GF_Fields' ) ) {
    throw new RuntimeException( 'Gravity Forms runtime APIs are unavailable.' );
}

$addon_class = 'GravityPresentationProfiles\\GravityForms\\AddOn';
if ( ! class_exists( $addon_class ) ) {
    throw new RuntimeException( 'Gravity Presentation Profiles add-on is unavailable.' );
}

function gpp_sparse_runtime_add_form( $title, $css_class, $declarative_ref ) {
    $form = array(
        'title'                => $title,
        'description'          => 'Sparse declarative projection evidence form.',
        'labelPlacement'       => 'top_label',
        'descriptionPlacement' => 'below',
        'cssClass'             => $css_class,
        'fields'               => array(
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
            array(
                'id'            => 3,
                'label'         => 'Jalali Date',
                'type'          => 'pgr_jalali_date',
                'isRequired'    => true,
                'description'   => 'Enter a Jalali date in YYYY/MM/DD format.',
                'jalali_format' => 'ymd_slash',
            ),
            array(
                'id'          => 4,
                'label'       => 'Registration Notes',
                'type'        => 'section',
                'description' => 'Authentic Gravity Forms section markup.',
            ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit Registration' ),
        'gravity-presentation-profiles' => array(
            'enabled' => '1',
            'profile' => 'srwf-registration',
            'declarative_profile' => $declarative_ref,
        ),
    );

    $form_id = GFAPI::add_form( $form );
    if ( is_wp_error( $form_id ) ) {
        throw new RuntimeException( $form_id->get_error_message() );
    }

    return (int) $form_id;
}

final class GppSparseRuntimeSettingsField {
    public $error = null;

    public function set_error( $message ) {
        $this->error = $message;
    }
}

function gpp_sparse_runtime_import( $addon, $canonical, $package_id, $profile_id, $presentation, $token_overrides = array() ) {
    $artifact = $canonical;
    $artifact['package_id'] = $package_id;
    $artifact['package_version'] = '1.0.0';
    $artifact['surface_profiles'][0]['profile_id'] = $profile_id;
    $artifact['surface_profiles'][0]['presentation'] = $presentation;

    foreach ( $token_overrides as $category => $values ) {
        foreach ( $values as $name => $value ) {
            $artifact['design_tokens'][ $category ][ $name ] = $value;
        }
    }

    $field = new GppSparseRuntimeSettingsField();
    $addon->validate_visual_package_import( $field, wp_json_encode( $artifact, JSON_UNESCAPED_SLASHES ) );
    if ( null !== $field->error ) {
        throw new RuntimeException( 'Production settings import rejected sparse package ' . $package_id . ': ' . $field->error );
    }

    return $artifact;
}

$canonical_path = dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json';
$canonical = json_decode( file_get_contents( $canonical_path ), true );
if ( ! is_array( $canonical ) ) {
    throw new RuntimeException( 'Canonical schema 1.1 package is unavailable for sparse fixture derivation.' );
}

$addon = $addon_class::get_instance();

$control_package = gpp_sparse_runtime_import(
    $addon,
    $canonical,
    'sparse.control.presentation',
    'sparse.control.background',
    array(
        'controls' => array(
            'background' => 'colors.surface',
        ),
    ),
    array(
        'colors' => array(
            'surface' => '#E0F2FE',
        ),
    )
);

$composition_package = gpp_sparse_runtime_import(
    $addon,
    $canonical,
    'sparse.composition.presentation',
    'sparse.composition.direction',
    array(
        'composition' => array(
            'direction' => 'rtl',
        ),
    )
);

$capability_package = gpp_sparse_runtime_import(
    $addon,
    $canonical,
    'sparse.capability.presentation',
    'sparse.capability.orbital',
    array(
        'capabilities' => array(
            'gravity_forms.orbital_control_metric_projection',
        ),
    )
);

$control_ref = \GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver::encodeReference(
    $control_package['package_id'],
    $control_package['package_version'],
    $control_package['surface_profiles'][0]['profile_id']
);
$composition_ref = \GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver::encodeReference(
    $composition_package['package_id'],
    $composition_package['package_version'],
    $composition_package['surface_profiles'][0]['profile_id']
);
$capability_ref = \GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver::encodeReference(
    $capability_package['package_id'],
    $capability_package['package_version'],
    $capability_package['surface_profiles'][0]['profile_id']
);

$control_id = gpp_sparse_runtime_add_form( 'Sparse Control Background', 'host-sparse-control-class', $control_ref );
$composition_id = gpp_sparse_runtime_add_form( 'Sparse Composition Direction', 'host-sparse-composition-class', $composition_ref );
$capability_id = gpp_sparse_runtime_add_form( 'Sparse Capability Only', 'host-sparse-capability-class', $capability_ref );

foreach (
    array(
        $control_id => 'sparse.control.presentation',
        $composition_id => 'sparse.composition.presentation',
        $capability_id => 'sparse.capability.presentation',
    ) as $form_id => $expected_package
) {
    $form = GFAPI::get_form( $form_id );
    if ( ! is_array( $form ) ) {
        throw new RuntimeException( 'Unable to read back sparse runtime form.' );
    }
    $state = $addon->resolve_form_state( $form );
    if ( ! $state->isActive() || $expected_package !== $state->profile()->packageId() ) {
        throw new RuntimeException( 'Sparse runtime form did not resolve through the exact installed declarative package.' );
    }
}

$page = get_post( (int) $manifest['page_id'] );
if ( ! $page instanceof WP_Post ) {
    throw new RuntimeException( 'Authentic runtime page is unavailable for sparse fixtures.' );
}

$append = sprintf(
    '<hr>[gravityform id="%1$d" title="true" description="true" ajax="false" theme="orbital"]<hr>[gravityform id="%2$d" title="true" description="true" ajax="false" theme="orbital"]<hr>[gravityform id="%3$d" title="true" description="true" ajax="false" theme="orbital"]',
    $control_id,
    $composition_id,
    $capability_id
);
$result = wp_update_post(
    array(
        'ID' => (int) $manifest['page_id'],
        'post_content' => $page->post_content . $append,
    ),
    true
);
if ( is_wp_error( $result ) ) {
    throw new RuntimeException( $result->get_error_message() );
}

$manifest['sparse_control_form'] = array(
    'id' => $control_id,
    'package_id' => $control_package['package_id'],
    'package_version' => $control_package['package_version'],
    'profile_id' => $control_package['surface_profiles'][0]['profile_id'],
    'host_css_class' => 'host-sparse-control-class',
    'expected_control_background' => '#E0F2FE',
);
$manifest['sparse_composition_form'] = array(
    'id' => $composition_id,
    'package_id' => $composition_package['package_id'],
    'package_version' => $composition_package['package_version'],
    'profile_id' => $composition_package['surface_profiles'][0]['profile_id'],
    'host_css_class' => 'host-sparse-composition-class',
    'expected_direction' => 'rtl',
);
$manifest['sparse_capability_form'] = array(
    'id' => $capability_id,
    'package_id' => $capability_package['package_id'],
    'package_version' => $capability_package['package_version'],
    'profile_id' => $capability_package['surface_profiles'][0]['profile_id'],
    'host_css_class' => 'host-sparse-capability-class',
    'expected_capability_class' => 'gpp-cap-gf-orbital-control-metric-projection_wrapper',
);

update_option( 'gpp_srwf_runtime_manifest', $manifest, false );
file_put_contents(
    $manifest_path,
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);

echo 'GPP_SPARSE_FIXTURES_PASS=' . wp_json_encode(
    array(
        'control_form_id' => $control_id,
        'composition_form_id' => $composition_id,
        'capability_form_id' => $capability_id,
    ),
    JSON_UNESCAPED_SLASHES
) . "\n";
