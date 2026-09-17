<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'SRWF_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'SRWF_ARTIFACT_DIR is required.' );
}
wp_mkdir_p( $artifact_dir );

if ( ! class_exists( 'GFAPI' ) ) {
    throw new RuntimeException( 'Gravity Forms runtime API is unavailable.' );
}

$addon_class = 'GravityPresentationProfiles\\GravityForms\\AddOn';
if ( ! class_exists( $addon_class ) ) {
    throw new RuntimeException( 'Gravity Presentation Profiles add-on is unavailable.' );
}

final class GppPresentationOwnershipRuntimeSettingsField {
    public $error = null;

    public function set_error( $message ) {
        $this->error = $message;
    }
}

function gpp_presentation_ownership_add_form( $title, $css_class, $enabled, $profile_ref ) {
    $form = array(
        'title' => $title,
        'description' => 'Synthetic authentic presentation-ownership fixture.',
        'labelPlacement' => 'top_label',
        'descriptionPlacement' => 'below',
        'cssClass' => $css_class,
        'fields' => array(
            array(
                'id' => 1,
                'label' => 'Required Name',
                'type' => 'text',
                'isRequired' => true,
                'description' => 'Native Gravity Forms validation must remain authoritative.',
            ),
            array(
                'id' => 2,
                'label' => 'Notes',
                'type' => 'text',
                'isRequired' => false,
                'description' => 'Synthetic non-PII field.',
            ),
        ),
        'button' => array( 'type' => 'text', 'text' => 'Submit Ownership Fixture' ),
        'gravity-presentation-profiles' => array(
            'enabled' => $enabled,
            'declarative_profile' => $profile_ref,
            'profile' => 'srwf-registration',
        ),
    );

    $form_id = GFAPI::add_form( $form );
    if ( is_wp_error( $form_id ) ) {
        throw new RuntimeException( $form_id->get_error_message() );
    }

    return (int) $form_id;
}

$addon = $addon_class::get_instance();
$canonical_path = dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json';
$canonical_json = file_get_contents( $canonical_path );
if ( false === $canonical_json ) {
    throw new RuntimeException( 'Canonical Registration package is unreadable.' );
}
$import_field = new GppPresentationOwnershipRuntimeSettingsField();
$addon->validate_visual_package_import( $import_field, $canonical_json );
if ( null !== $import_field->error ) {
    throw new RuntimeException( 'Canonical Registration package import failed: ' . $import_field->error );
}

$canonical_ref = \GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver::encodeReference(
    'srwf.registration.presentation',
    '1.1.0',
    'srwf.registration.v1'
);
$external_class = 'srwf-registration-theme';

$enabled_id = gpp_presentation_ownership_add_form(
    'GPP Enabled Ownership Fixture',
    'ownership-enabled-host',
    '1',
    $canonical_ref
);
$disabled_id = gpp_presentation_ownership_add_form(
    'GPP Disabled GTB Ownership Fixture',
    'ownership-disabled-host ' . $external_class,
    '0',
    $canonical_ref
);

$disabled = GFAPI::get_form( $disabled_id );
if ( ! is_array( $disabled ) ) {
    throw new RuntimeException( 'Disabled ownership form readback failed.' );
}
if ( $addon->resolve_form_state( $disabled )->isActive() ) {
    throw new RuntimeException( 'Disabled ownership form unexpectedly resolved active.' );
}
if ( $canonical_ref !== $disabled['gravity-presentation-profiles']['declarative_profile'] || 'srwf-registration' !== $disabled['gravity-presentation-profiles']['profile'] ) {
    throw new RuntimeException( 'Disabled ownership form lost its selected GPP configuration.' );
}
if ( ! in_array( $external_class, preg_split( '/\s+/', $disabled['cssClass'] ), true ) ) {
    throw new RuntimeException( 'Disabled ownership form lost the external presentation class.' );
}

// Prove authentic Gravity Forms persistence is non-destructive across OFF -> ON -> OFF.
$disabled['gravity-presentation-profiles']['enabled'] = '1';
$updated = GFAPI::update_form( $disabled );
if ( is_wp_error( $updated ) || false === $updated ) {
    throw new RuntimeException( is_wp_error( $updated ) ? $updated->get_error_message() : 'Re-enable update failed.' );
}
$reenabled = GFAPI::get_form( $disabled_id );
if ( ! is_array( $reenabled ) || ! $addon->resolve_form_state( $reenabled )->isActive() ) {
    throw new RuntimeException( 'Authentic OFF -> ON transition did not restore the prior valid GPP presentation.' );
}
if ( $canonical_ref !== $reenabled['gravity-presentation-profiles']['declarative_profile'] || 'srwf-registration' !== $reenabled['gravity-presentation-profiles']['profile'] ) {
    throw new RuntimeException( 'Authentic OFF -> ON transition rewrote GPP profile configuration.' );
}
if ( ! in_array( $external_class, preg_split( '/\s+/', $reenabled['cssClass'] ), true ) ) {
    throw new RuntimeException( 'Authentic OFF -> ON transition removed the external presentation class.' );
}

$reenabled['gravity-presentation-profiles']['enabled'] = '0';
$updated = GFAPI::update_form( $reenabled );
if ( is_wp_error( $updated ) || false === $updated ) {
    throw new RuntimeException( is_wp_error( $updated ) ? $updated->get_error_message() : 'Disable restore update failed.' );
}
$disabled = GFAPI::get_form( $disabled_id );
if ( ! is_array( $disabled ) || $addon->resolve_form_state( $disabled )->isActive() ) {
    throw new RuntimeException( 'Authentic restored OFF state did not remain inactive.' );
}
if ( $canonical_ref !== $disabled['gravity-presentation-profiles']['declarative_profile'] || 'srwf-registration' !== $disabled['gravity-presentation-profiles']['profile'] ) {
    throw new RuntimeException( 'Authentic restored OFF state lost GPP profile configuration.' );
}
if ( ! in_array( $external_class, preg_split( '/\s+/', $disabled['cssClass'] ), true ) ) {
    throw new RuntimeException( 'Authentic restored OFF state removed the external presentation class.' );
}

$content = sprintf(
    '<h1>GPP Presentation Ownership Runtime</h1>[gravityform id="%1$d" title="true" description="true" ajax="false" theme="orbital"]<hr>[gravityform id="%2$d" title="true" description="true" ajax="false" theme="orbital"]',
    $enabled_id,
    $disabled_id
);
$page_id = wp_insert_post(
    array(
        'post_type' => 'page',
        'post_status' => 'publish',
        'post_title' => 'GPP Presentation Ownership Runtime',
        'post_name' => 'gpp-presentation-ownership-runtime',
        'post_content' => $content,
    ),
    true
);
if ( is_wp_error( $page_id ) ) {
    throw new RuntimeException( $page_id->get_error_message() );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII_CONTENT__AUTHENTIC_HOST_RUNTIME',
    'page_id' => (int) $page_id,
    'enabled_form' => array(
        'id' => $enabled_id,
        'host_css_class' => 'ownership-enabled-host',
        'declarative_profile' => $canonical_ref,
    ),
    'disabled_form' => array(
        'id' => $disabled_id,
        'host_css_class' => 'ownership-disabled-host',
        'external_presentation_class' => $external_class,
        'declarative_profile' => $canonical_ref,
        'legacy_profile' => 'srwf-registration',
    ),
    'runtime' => array(
        'gravity_forms_version' => GFForms::$version,
        'gpp_version' => defined( 'GPP_VERSION' ) ? GPP_VERSION : null,
    ),
);

file_put_contents(
    $artifact_dir . '/presentation-ownership-manifest.json',
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);

echo "GPP_PRESENTATION_OWNERSHIP_FIXTURES_PASS\n";
