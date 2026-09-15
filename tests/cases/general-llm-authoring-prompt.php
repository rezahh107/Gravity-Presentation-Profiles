<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Authoring\GeneralLlmAuthoringPrompt;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackageV11;
use GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver;
use GravityPresentationProfiles\GravityForms\DeclarativeProfileDefinition;

Autoloader::register();

function gpp_authoring_expect_violation( $callback, $message ) {
    try {
        $callback();
    } catch ( ContractViolation $exception ) {
        return;
    }
    gpp_fail( $message );
}

function gpp_authoring_expect_drift( $contract, $message ) {
    try {
        GeneralLlmAuthoringPrompt::assertContractParity( $contract );
    } catch ( RuntimeException $exception ) {
        return;
    }
    gpp_fail( $message );
}

function gpp_authoring_normalize_rules( $rules ) {
    foreach ( $rules as &$block ) {
        ksort( $block, SORT_STRING );
    }
    unset( $block );
    ksort( $rules, SORT_STRING );
    return $rules;
}

function gpp_authoring_schema_presentation_rules() {
    $source = file_get_contents( dirname( __DIR__, 2 ) . '/src/Core/Portable/VisualProfilePackageV11.php' );
    $pattern = "/if \\( isset\\( \\$presentation\\['([^']+)'\\] \\) \\) \\{\\s*self::validatePreferenceBlock\\(\\s*\\$presentation\\['\\1'\\],\\s*array\\((.*?)\\),\\s*\\$token_refs,\\s*\\$profile_token_refs,/s";
    preg_match_all( $pattern, $source, $blocks, PREG_SET_ORDER );
    if ( 8 !== count( $blocks ) ) {
        gpp_fail( 'Unable to mechanically extract all V1.1 presentation preference blocks from the production validator.' );
    }

    $rules = array();
    foreach ( $blocks as $match ) {
        $block_name = $match[1];
        $body = $match[2];
        $rules[ $block_name ] = array();

        preg_match_all( "/'([^']+)'\\s*=>\\s*array\\(\\s*'token'\\s*,\\s*'([^']+)'\\s*\\)/", $body, $token_matches, PREG_SET_ORDER );
        foreach ( $token_matches as $token_match ) {
            $rules[ $block_name ][ $token_match[1] ] = array( 'kind' => 'token', 'token_category' => $token_match[2] );
        }

        preg_match_all( "/'([^']+)'\\s*=>\\s*array\\(\\s*'enum'\\s*,\\s*array\\((.*?)\\)\\s*\\)/s", $body, $enum_matches, PREG_SET_ORDER );
        foreach ( $enum_matches as $enum_match ) {
            preg_match_all( "/'([^']+)'/", $enum_match[2], $values );
            $rules[ $block_name ][ $enum_match[1] ] = array( 'kind' => 'enum', 'values' => $values[1] );
        }
    }

    return gpp_authoring_normalize_rules( $rules );
}

function gpp_authoring_runtime_paths() {
    $reflection = new ReflectionClass( DeclarativeProfileDefinition::class );
    $constant = $reflection->getReflectionConstant( 'PREFERENCE_CLASSES' );
    $paths = array();
    foreach ( $constant->getValue() as $block => $preferences ) {
        foreach ( array_keys( $preferences ) as $preference ) {
            $paths[] = $block . '.' . $preference;
        }
    }
    $paths[] = 'composition.field_layout';
    sort( $paths, SORT_STRING );
    return $paths;
}

function gpp_authoring_contract_paths( $contract ) {
    $paths = array();
    foreach ( $contract['presentation'] as $block => $preferences ) {
        foreach ( array_keys( $preferences ) as $preference ) {
            $paths[] = $block . '.' . $preference;
        }
    }
    sort( $paths, SORT_STRING );
    return $paths;
}

function gpp_authoring_token_probe( $category, $value ) {
    $map = array(
        'colors' => array( 'controls', 'border' ),
        'spacing_px' => array( 'composition', 'inline_padding' ),
        'radii_px' => array( 'controls', 'radius' ),
        'sizes_px' => array( 'controls', 'min_height' ),
        'font_sizes_px' => array( 'controls', 'font_size' ),
        'font_weights' => array( 'controls', 'font_weight' ),
        'font_families' => array( 'typography', 'font_family' ),
    );
    $path = $map[ $category ];
    $ref = $category . '.probe';
    return array(
        'artifact_type' => VisualProfilePackage::ARTIFACT_TYPE,
        'schema_version' => VisualProfilePackageV11::SCHEMA_VERSION,
        'package_id' => 'portable.tokenprobe.presentation',
        'package_version' => '1.0.0',
        'provenance' => array( 'producer' => 'contract parity probe', 'evidence_refs' => array() ),
        'selected_surfaces' => array( 'gravity_forms.form' ),
        'design_tokens' => array( $category => array( 'probe' => $value ) ),
        'semantic_slots' => array(),
        'surface_profiles' => array(
            array(
                'surface' => 'gravity_forms.form',
                'profile_id' => 'portable.tokenprobe.v1',
                'token_refs' => array( $ref ),
                'semantic_slots' => array(),
                'presentation' => array( $path[0] => array( $path[1] => $ref ) ),
            ),
        ),
        'reserved_extension_seam' => array( 'version' => '1.0.0', 'state' => 'INERT' ),
    );
}

$contract = GeneralLlmAuthoringPrompt::contract();
$prompt = GeneralLlmAuthoringPrompt::contents();

gpp_assert_same( '1.0.0', $contract['prompt_version'], 'Fixed authoring prompt version must be explicit.' );
gpp_assert_same( VisualProfilePackageV11::SCHEMA_VERSION, $contract['schema_version'], 'Authoring prompt must emit the current schema 1.1 contract.' );
gpp_assert_same( array( DeclarativePresentationResolver::SURFACE ), $contract['authorable_surfaces'], 'General authoring must be limited to the runtime-supported Gravity Forms form surface.' );
gpp_assert_same(
    gpp_authoring_schema_presentation_rules(),
    gpp_authoring_normalize_rules( $contract['presentation'] ),
    'Prompt presentation vocabulary must exactly match the production V1.1 validator rules.'
);
gpp_assert_same( gpp_authoring_runtime_paths(), gpp_authoring_contract_paths( $contract ), 'Every prompt preference must be consumed by the production Gravity Forms declarative runtime, with no runtime preference omitted.' );

$schema_reflection = new ReflectionClass( VisualProfilePackageV11::class );
$schema_capabilities = $schema_reflection->getReflectionConstant( 'CAPABILITIES' )->getValue();
$runtime_reflection = new ReflectionClass( DeclarativeProfileDefinition::class );
$runtime_capabilities = array_keys( $runtime_reflection->getReflectionConstant( 'CAPABILITY_CLASSES' )->getValue() );
gpp_assert_same( $schema_capabilities, $contract['capabilities'], 'Prompt capabilities must match the production schema capability allowlist.' );
gpp_assert_same( $runtime_capabilities, $contract['capabilities'], 'Prompt capabilities must match the runtime-supported capability classes.' );

$rich = json_decode( file_get_contents( __DIR__ . '/../fixtures/general-llm-rich-valid.json' ), true );
gpp_assert_true( is_array( $rich ) && VisualProfilePackage::validate( $rich ), 'Rich generated-package fixture must validate through the production package validator.' );
gpp_assert_same( gpp_authoring_contract_paths( $contract ), gpp_authoring_contract_paths( array( 'presentation' => $rich['surface_profiles'][0]['presentation'] ) ), 'Rich fixture must exercise every authorable presentation preference.' );
gpp_assert_same( array_keys( $contract['token_categories'] ), array_keys( $rich['design_tokens'] ), 'Rich fixture must exercise every authorable token category.' );
gpp_assert_same( $contract['capabilities'], $rich['surface_profiles'][0]['presentation']['capabilities'], 'Rich fixture must exercise the complete admitted capability list.' );

$valid_token_values = array(
    'colors' => array( '#000000', '#Aa12Ff' ),
    'spacing_px' => array( 0, 512 ),
    'radii_px' => array( 0, 512 ),
    'sizes_px' => array( 0, 4096 ),
    'font_sizes_px' => array( 0, 512 ),
    'font_weights' => array( 100, 900 ),
    'font_families' => array( 'A', 'Noto Sans' ),
);
$invalid_token_values = array(
    'colors' => array( '#FFF', 'red' ),
    'spacing_px' => array( -1, 513, 1.5 ),
    'radii_px' => array( -1, 513, '10' ),
    'sizes_px' => array( -1, 4097, 10.5 ),
    'font_sizes_px' => array( -1, 513, '16' ),
    'font_weights' => array( 99, 550, 1000 ),
    'font_families' => array( '', str_repeat( 'A', 97 ), 'Arial;body' ),
);
foreach ( $contract['token_categories'] as $category => $rule ) {
    foreach ( $valid_token_values[ $category ] as $value ) {
        gpp_assert_true( VisualProfilePackage::validate( gpp_authoring_token_probe( $category, $value ) ), 'Declared token constraint must admit its valid boundary/value: ' . $category );
    }
    foreach ( $invalid_token_values[ $category ] as $value ) {
        gpp_authoring_expect_violation(
            static function () use ( $category, $value ) { VisualProfilePackage::validate( gpp_authoring_token_probe( $category, $value ) ); },
            'Declared token constraint drifted from the production validator: ' . $category
        );
    }
}

foreach ( $contract['root_fields'] as $field ) {
    gpp_assert_true( false !== strpos( $prompt, '`' . $field . '`' ), 'Prompt must name every required package field: ' . $field );
}
foreach ( $contract['presentation'] as $block => $preferences ) {
    foreach ( $preferences as $preference => $rule ) {
        gpp_assert_true( false !== strpos( $prompt, '`' . $block . '.' . $preference . '`' ), 'Prompt must name every supported presentation preference.' );
        if ( 'enum' === $rule['kind'] ) {
            foreach ( $rule['values'] as $value ) {
                gpp_assert_true( false !== strpos( $prompt, '`' . $value . '`' ), 'Prompt must expose every exact enum value.' );
            }
        }
    }
}
foreach ( array_keys( $contract['token_categories'] ) as $category ) {
    gpp_assert_true( false !== strpos( $prompt, '`' . $category . '`' ), 'Prompt must explain every authorable token category.' );
}
foreach ( $contract['capabilities'] as $capability ) {
    gpp_assert_true( false !== strpos( $prompt, '`' . $capability . '`' ), 'Prompt must expose every admitted capability.' );
}

gpp_assert_true( false !== strpos( $prompt, 'GPP does not contact you or any AI service' ), 'Prompt must state the offline/no-provider boundary.' );
gpp_assert_true( false !== strpos( $prompt, 'Do not wrap it in Markdown fences' ), 'Prompt must require importer-ready JSON without Markdown fences.' );
gpp_assert_true( false !== strpos( $prompt, 'resolve it with the user instead of guessing' ), 'Prompt must require uncertainty to be resolved rather than guessed.' );
gpp_assert_true( false === strpos( $prompt, 'srwf.registration.v1' ), 'General prompt must not hard-code the SRWF Registration profile identity.' );
gpp_assert_true( false === strpos( $prompt, '#8690A1' ), 'General prompt must not hard-code an Owner-locked SRWF color.' );
gpp_assert_true( false === strpos( $prompt, 'Vazirmatn' ), 'General prompt must not hard-code the SRWF Registration font.' );
gpp_assert_true( false === strpos( $prompt, 'http://' ) && false === strpos( $prompt, 'https://' ), 'Packaged prompt must contain no remote URL dependency.' );

$mutated = $contract;
unset( $mutated['presentation']['controls']['border'] );
gpp_authoring_expect_drift( $mutated, 'Removing a supported preference must fail prompt-contract parity.' );
$mutated = $contract;
$mutated['presentation']['controls']['fictional'] = array( 'kind' => 'token', 'token_category' => 'colors' );
gpp_authoring_expect_drift( $mutated, 'Adding a fictional preference must fail prompt-contract parity.' );
$mutated = $contract;
$mutated['presentation']['composition']['direction']['values'][] = 'auto';
gpp_authoring_expect_drift( $mutated, 'Changing an enum must fail prompt-contract parity.' );
$mutated = $contract;
$mutated['token_categories']['sizes_px']['maximum'] = 9999;
gpp_authoring_expect_drift( $mutated, 'Changing a range must fail prompt-contract parity.' );
$mutated = $contract;
$mutated['authorable_surfaces'][] = 'gravity_flow.inbox';
gpp_authoring_expect_drift( $mutated, 'Changing surface applicability must fail prompt-contract parity.' );

echo "GENERAL_LLM_AUTHORING_PROMPT_TESTS_PASS\n";
