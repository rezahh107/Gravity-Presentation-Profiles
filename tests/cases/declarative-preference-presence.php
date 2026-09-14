<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Core/Portable/ContractViolation.php';
require_once dirname( __DIR__, 2 ) . '/src/Core/Portable/VisualProfilePackage.php';
require_once dirname( __DIR__, 2 ) . '/src/Core/Portable/VisualProfilePackageV11.php';
require_once dirname( __DIR__, 2 ) . '/src/GravityForms/DeclarativeProfileDefinition.php';

use GravityPresentationProfiles\Core\Portable\VisualProfilePackageV11;
use GravityPresentationProfiles\GravityForms\DeclarativeProfileDefinition;

function gpp_sparse_definition( $canonical, $package_id, $profile_id, $presentation ) {
    $artifact = $canonical;
    $artifact['package_id'] = $package_id;
    $artifact['package_version'] = '1.0.0';
    $artifact['surface_profiles'][0]['profile_id'] = $profile_id;
    $artifact['surface_profiles'][0]['presentation'] = $presentation;

    gpp_assert_same( true, VisualProfilePackageV11::validate( $artifact ), 'Sparse schema-1.1 fixture must remain contract-valid.' );

    return new DeclarativeProfileDefinition(
        array(
            'package_id' => $artifact['package_id'],
            'package_version' => $artifact['package_version'],
            'profile_id' => $artifact['surface_profiles'][0]['profile_id'],
            'artifact' => $artifact,
            'profile' => $artifact['surface_profiles'][0],
        )
    );
}

function gpp_css_has_ungated_consumer( $css, $variable, $marker ) {
    preg_match_all( '/([^{}]+)\{([^{}]*)\}/s', $css, $rules, PREG_SET_ORDER );
    foreach ( $rules as $rule ) {
        if (
            false !== strpos( $rule[2], 'var(' . $variable . ')' ) &&
            false === strpos( trim( $rule[1] ), $marker )
        ) {
            return true;
        }
    }

    return false;
}

$canonical_path = dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json';
$canonical = json_decode( file_get_contents( $canonical_path ), true );
gpp_assert_true( is_array( $canonical ), 'Canonical schema-1.1 package fixture must decode.' );

$control = gpp_sparse_definition(
    $canonical,
    'sparse.control.presentation',
    'sparse.control.background',
    array(
        'controls' => array(
            'background' => 'colors.surface',
        ),
    )
);
$control_classes = $control->semanticClasses();
gpp_assert_true( in_array( 'gpp-has-controls-background', $control_classes, true ), 'Declared controls.background must emit its fixed presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-controls-min-height', $control_classes, true ), 'Absent controls.min_height must emit no presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-controls-radius', $control_classes, true ), 'Absent controls.radius must emit no presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-typography-font-family', $control_classes, true ), 'Absent typography.font_family must emit no presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-primary-action-background', $control_classes, true ), 'Absent primary_action.background must emit no presence marker.' );
gpp_assert_true( false !== strpos( $control->inlineCss(), '--gpp-control-background:#FFFFFF;' ), 'Sparse control fixture must emit its declared background token.' );
gpp_assert_true( false === strpos( $control->inlineCss(), '--gpp-control-min-height:' ), 'Sparse control fixture must not synthesize undeclared control size.' );

$composition = gpp_sparse_definition(
    $canonical,
    'sparse.composition.presentation',
    'sparse.composition.direction',
    array(
        'composition' => array(
            'direction' => 'rtl',
        ),
    )
);
$composition_classes = $composition->semanticClasses();
gpp_assert_true( in_array( 'gpp-has-composition-direction', $composition_classes, true ), 'Declared composition.direction must emit its fixed presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-composition-max-inline-size', $composition_classes, true ), 'Absent composition.max_inline_size must emit no presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-composition-inline-padding', $composition_classes, true ), 'Absent composition.inline_padding must emit no presence marker.' );
gpp_assert_true( ! in_array( 'gpp-has-composition-surface-background', $composition_classes, true ), 'Absent composition.surface_background must emit no presence marker.' );
gpp_assert_same(
    '.gpp-enabled_wrapper.gpp-declarative_wrapper.gpp-profile-' . $composition->key() . '_wrapper{--gpp-form-direction:rtl;}',
    $composition->inlineCss(),
    'Sparse composition fixture must emit only its declared direction value.'
);

$capability = gpp_sparse_definition(
    $canonical,
    'sparse.capability.presentation',
    'sparse.capability.orbital',
    array(
        'capabilities' => array(
            'gravity_forms.orbital_control_metric_projection',
        ),
    )
);
$capability_classes = $capability->semanticClasses();
gpp_assert_true( in_array( 'gpp-cap-gf-orbital-control-metric-projection', $capability_classes, true ), 'Admitted capability must retain its fixed semantic marker.' );
gpp_assert_true( ! in_array( 'gpp-has-controls-min-height', $capability_classes, true ), 'Capability alone must not imply controls.min_height presence.' );
gpp_assert_true( ! in_array( 'gpp-has-controls-focus-border', $capability_classes, true ), 'Capability alone must not imply controls.focus_border presence.' );
gpp_assert_true( ! in_array( 'gpp-has-primary-action-min-height', $capability_classes, true ), 'Capability alone must not imply primary_action.min_height presence.' );
gpp_assert_true( ! in_array( 'gpp-has-primary-action-focus-border', $capability_classes, true ), 'Capability alone must not imply primary_action.focus_border presence.' );
gpp_assert_same( '', $capability->inlineCss(), 'Capability-only sparse fixture must not synthesize optional presentation values.' );

$canonical_definition = new DeclarativeProfileDefinition(
    array(
        'package_id' => $canonical['package_id'],
        'package_version' => $canonical['package_version'],
        'profile_id' => $canonical['surface_profiles'][0]['profile_id'],
        'artifact' => $canonical,
        'profile' => $canonical['surface_profiles'][0],
    )
);
$canonical_classes = $canonical_definition->semanticClasses();
gpp_assert_true( in_array( 'gpp-has-controls-min-height', $canonical_classes, true ), 'Canonical package must retain controls.min_height presence.' );
gpp_assert_true( in_array( 'gpp-has-primary-action-min-height', $canonical_classes, true ), 'Canonical package must retain primary_action.min_height presence.' );
gpp_assert_true( in_array( 'gpp-has-typography-font-family', $canonical_classes, true ), 'Canonical package must retain typography presence.' );
gpp_assert_true( in_array( 'gpp-field-layout-single-column', $canonical_classes, true ), 'Existing field_layout semantic class must remain intact.' );

$css_path = dirname( __DIR__, 2 ) . '/assets/css/gravity-forms-declarative.css';
$css = file_get_contents( $css_path );
gpp_assert_true( is_string( $css ) && '' !== $css, 'Generic declarative stylesheet must be readable.' );
$css_without_comments = preg_replace( '#/\*.*?\*/#s', '', $css );

$presence_by_variable = array(
    '--gpp-form-direction' => 'gpp-has-composition-direction_wrapper',
    '--gpp-form-max-inline-size' => 'gpp-has-composition-max-inline-size_wrapper',
    '--gpp-form-inline-padding' => 'gpp-has-composition-inline-padding_wrapper',
    '--gpp-form-surface-background' => 'gpp-has-composition-surface-background_wrapper',
    '--gpp-form-surface-radius' => 'gpp-has-composition-surface-radius_wrapper',
    '--gpp-form-font-family' => 'gpp-has-typography-font-family_wrapper',
    '--gpp-control-background' => 'gpp-has-controls-background_wrapper',
    '--gpp-control-text' => 'gpp-has-controls-text_wrapper',
    '--gpp-control-border' => 'gpp-has-controls-border_wrapper',
    '--gpp-control-focus-border' => 'gpp-has-controls-focus-border_wrapper',
    '--gpp-control-error-border' => 'gpp-has-controls-error-border_wrapper',
    '--gpp-control-radius' => 'gpp-has-controls-radius_wrapper',
    '--gpp-control-min-height' => 'gpp-has-controls-min-height_wrapper',
    '--gpp-control-font-size' => 'gpp-has-controls-font-size_wrapper',
    '--gpp-control-font-weight' => 'gpp-has-controls-font-weight_wrapper',
    '--gpp-label-text' => 'gpp-has-labels-text_wrapper',
    '--gpp-label-required-color' => 'gpp-has-labels-required-color_wrapper',
    '--gpp-label-font-size' => 'gpp-has-labels-font-size_wrapper',
    '--gpp-label-font-weight' => 'gpp-has-labels-font-weight_wrapper',
    '--gpp-description-text' => 'gpp-has-descriptions-text_wrapper',
    '--gpp-section-divider' => 'gpp-has-sections-divider_wrapper',
    '--gpp-section-heading-text' => 'gpp-has-sections-heading-text_wrapper',
    '--gpp-section-heading-font-size' => 'gpp-has-sections-heading-font-size_wrapper',
    '--gpp-section-heading-font-weight' => 'gpp-has-sections-heading-font-weight_wrapper',
    '--gpp-section-description-text' => 'gpp-has-sections-description-text_wrapper',
    '--gpp-primary-action-background' => 'gpp-has-primary-action-background_wrapper',
    '--gpp-primary-action-pressed-background' => 'gpp-has-primary-action-pressed-background_wrapper',
    '--gpp-primary-action-focus-border' => 'gpp-has-primary-action-focus-border_wrapper',
    '--gpp-primary-action-min-height' => 'gpp-has-primary-action-min-height_wrapper',
    '--gpp-primary-action-font-size' => 'gpp-has-primary-action-font-size_wrapper',
    '--gpp-primary-action-font-weight' => 'gpp-has-primary-action-font-weight_wrapper',
    '--gpp-validation-error-color' => 'gpp-has-validation-error-color_wrapper',
);

preg_match_all( '/([^{}]+)\{([^{}]*)\}/s', $css_without_comments, $rules, PREG_SET_ORDER );
$observed_variables = array();
foreach ( $rules as $rule ) {
    $selector = trim( $rule[1] );
    $body = $rule[2];
    foreach ( $presence_by_variable as $variable => $marker ) {
        if ( false === strpos( $body, 'var(' . $variable . ')' ) ) {
            continue;
        }
        $observed_variables[ $variable ] = true;
        gpp_assert_true(
            false !== strpos( $selector, $marker ),
            'Every consumer of ' . $variable . ' must require its exact preference-presence marker. Selector: ' . $selector
        );
    }
}

foreach ( $presence_by_variable as $variable => $marker ) {
    unset( $marker );
    gpp_assert_true( isset( $observed_variables[ $variable ] ), 'Conformance map must cover an actual CSS consumer for ' . $variable . '.' );
}

gpp_assert_true(
    0 === preg_match( '/var\(\s*--gpp-[^,)]+\s*,/', $css_without_comments ),
    'Generic adapter must not hide missing preference evidence behind fallback values.'
);

gpp_assert_true(
    1 === preg_match( '/gpp-has-composition-max-inline-size_wrapper[^{}]*\{[^{}]*margin-inline:\s*auto;/s', $css_without_comments ),
    'Centering side effect must be tied to declared composition.max_inline_size presence.'
);

gpp_assert_true(
    1 === preg_match( '/gpp-cap-gf-orbital-control-metric-projection_wrapper\.gpp-has-controls-min-height_wrapper[^{}]*\{[^{}]*var\(--gpp-control-min-height\)/s', $css_without_comments ),
    'Orbital metric capability must require controls.min_height presence before consuming that value.'
);
gpp_assert_true(
    1 === preg_match( '/gpp-cap-gf-orbital-control-metric-projection_wrapper\.gpp-has-primary-action-min-height_wrapper[^{}]*\{[^{}]*var\(--gpp-primary-action-min-height\)/s', $css_without_comments ),
    'Orbital metric capability must require primary_action.min_height presence before consuming that value.'
);
gpp_assert_true(
    1 === preg_match( '/gpp-cap-gf-orbital-control-metric-projection_wrapper\.gpp-has-controls-focus-border_wrapper[^{}]*\{[^{}]*var\(--gpp-control-focus-border\)/s', $css_without_comments ),
    'Orbital metric capability must require controls.focus_border presence before consuming that value.'
);
gpp_assert_true(
    1 === preg_match( '/gpp-cap-gf-orbital-control-metric-projection_wrapper\.gpp-has-primary-action-focus-border_wrapper[^{}]*\{[^{}]*var\(--gpp-primary-action-focus-border\)/s', $css_without_comments ),
    'Orbital metric capability must require primary_action.focus_border presence before consuming that value.'
);

$ungated_mutant = str_replace(
    '.gpp-enabled_wrapper.gpp-declarative_wrapper.gpp-has-controls-background_wrapper {',
    '.gpp-enabled_wrapper.gpp-declarative_wrapper {',
    $css_without_comments,
    $ungated_mutation_count
);
gpp_assert_same( 1, $ungated_mutation_count, 'Ungated-consumer falsification must mutate exactly one controls.background gate.' );
gpp_assert_true(
    gpp_css_has_ungated_consumer( $ungated_mutant, '--gpp-control-background', 'gpp-has-controls-background_wrapper' ),
    'Conformance control must reject an implementation that projects a preference without its presence marker.'
);

$fallback_mutant = str_replace(
    'var(--gpp-control-background)',
    'var(--gpp-control-background, #fff)',
    $css_without_comments,
    $fallback_mutation_count
);
gpp_assert_same( 1, $fallback_mutation_count, 'Fallback falsification must mutate exactly one controls.background consumer.' );
gpp_assert_true(
    1 === preg_match( '/var\(\s*--gpp-[^,)]+\s*,/', $fallback_mutant ),
    'Conformance control must reject fallback values that impersonate package intent for an absent preference.'
);

$partial_capability_mutant = preg_replace(
    '/\.gpp-has-controls-min-height_wrapper(?= \.gfield--type-text)/',
    '',
    $css_without_comments,
    1,
    $partial_capability_mutation_count
);
gpp_assert_same( 1, $partial_capability_mutation_count, 'Partial capability falsification must mutate exactly one control metric adapter selector.' );
gpp_assert_true(
    gpp_css_has_ungated_consumer( $partial_capability_mutant, '--gpp-control-min-height', 'gpp-has-controls-min-height_wrapper' ),
    'Conformance control must reject a one-manifestation repair that leaves a capability value consumer ungated.'
);

echo "GPP_DECLARATIVE_PREFERENCE_PRESENCE_PASS\n";
