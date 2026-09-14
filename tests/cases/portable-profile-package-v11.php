<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\ContractViolation;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfileResolver;

Autoloader::register();

function gpp_v11_fixture( $name ) {
    $path = __DIR__ . '/../fixtures/' . $name;
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid fixture JSON: ' . $name );
    }
    return $data;
}

function gpp_v11_expect_violation( $callback, $message ) {
    try {
        $callback();
    } catch ( ContractViolation $exception ) {
        return;
    }
    gpp_fail( $message );
}

function gpp_v11_reverse_object_keys( $value ) {
    if ( ! is_array( $value ) ) {
        return $value;
    }

    $keys = array_keys( $value );
    $is_list = array() === $value || $keys === range( 0, count( $value ) - 1 );
    if ( $is_list ) {
        return array_map( 'gpp_v11_reverse_object_keys', $value );
    }

    $copy = array();
    foreach ( array_reverse( $keys ) as $key ) {
        $copy[ $key ] = gpp_v11_reverse_object_keys( $value[ $key ] );
    }
    return $copy;
}

$v1  = gpp_v11_fixture( 'wu09-visual-package.json' );
$v11 = gpp_v11_fixture( 'srwf-registration-visual-package-v1.1.json' );

// Schema 1.0.0 semantics remain accepted and frozen.
gpp_assert_true( VisualProfilePackage::validate( $v1 ), 'Existing schema 1.0.0 package must remain valid.' );
$v1_missing_surface = $v1;
array_pop( $v1_missing_surface['surface_profiles'] );
gpp_v11_expect_violation(
    static function () use ( $v1_missing_surface ) {
        VisualProfilePackage::validate( $v1_missing_surface );
    },
    'Schema 1.0.0 must continue requiring all three historical surfaces.'
);

// Schema 1.1.0 admits a deliberately selected surface subset and Gravity Forms.
gpp_assert_same( '1.1.0', VisualProfilePackage::LATEST_SCHEMA_VERSION, 'Latest visual package schema must be explicit.' );
gpp_assert_true( VisualProfilePackage::validate( $v11 ), 'Schema 1.1.0 SRWF Registration fixture must validate.' );
gpp_assert_same(
    array( 'gravity_forms.form' ),
    $v11['selected_surfaces'],
    'Registration fixture must target only the generic Gravity Forms form surface.'
);
gpp_assert_true(
    in_array( 'gravity_forms.form', VisualProfilePackage::admittedSurfaces(), true ),
    'Generic Gravity Forms form surface must be admitted by the evolved package API.'
);
gpp_assert_same( 1, count( $v11['surface_profiles'] ), 'Unrelated Inbox/Entry/Print profiles must not be required in schema 1.1.' );

$resolver = new VisualProfileResolver( $v11 );
gpp_assert_same(
    'srwf.registration.v1',
    $resolver->resolve( 'gravity_forms.form' )['profile_id'],
    'Selected Gravity Forms surface must resolve its shared default profile.'
);
gpp_assert_same( null, $resolver->resolve( 'gravity_flow.inbox' ), 'Unselected Inbox surface must not gain an implicit profile.' );
gpp_v11_expect_violation(
    static function () use ( $resolver ) {
        $resolver->resolve( 'gravity_forms.form', array( 'form_id' => 77 ) );
    },
    'Environment context must remain forbidden from visual-profile resolution.'
);

// The admitted Registration presentation is expressed through controlled generic vocabulary.
$tokens = $v11['design_tokens'];
$presentation = $v11['surface_profiles'][0]['presentation'];
gpp_assert_same( '#8690A1', $tokens['colors']['control_border'], 'Owner-approved control border must be preserved.' );
gpp_assert_same( 16, $tokens['spacing_px']['mobile_horizontal_padding'], 'Owner-approved mobile horizontal padding must be preserved.' );
gpp_assert_same( 840, $tokens['sizes_px']['content_max_width'], 'Canonical content max width must be expressible.' );
gpp_assert_same( 52, $tokens['sizes_px']['control_min_height'], 'Canonical control metric must be expressible.' );
gpp_assert_same( 56, $tokens['sizes_px']['primary_action_min_height'], 'Canonical primary-action metric must be expressible.' );
gpp_assert_same( 10, $tokens['radii_px']['control'], 'Canonical control radius must be expressible.' );
gpp_assert_same( 16, $tokens['radii_px']['surface'], 'Canonical card radius must be expressible.' );
gpp_assert_same( 18, $tokens['font_sizes_px']['section_heading'], 'Canonical section heading size must be expressible.' );
gpp_assert_same( 'Vazirmatn', $tokens['font_families']['primary'], 'Font-family target must be declarative without owning font delivery.' );
gpp_assert_same( 'rtl', $presentation['composition']['direction'], 'RTL composition must be explicit.' );
gpp_assert_same( 'single_column', $presentation['composition']['field_layout'], 'Fail-closed single-column composition must be explicit.' );
gpp_assert_same(
    'colors.primary_pressed',
    $presentation['primary_action']['pressed_background'],
    'Canonical pressed primary state must be represented without raw CSS.'
);
gpp_assert_same(
    array(
        'gravity_forms.orbital_control_metric_projection',
        'persian_gravity.jalali_validation_message_after_control',
    ),
    $presentation['capabilities'],
    'Only the two currently proven host-adapter capabilities may be requested by the Registration fixture.'
);

$serialized = json_encode( $v11 );
foreach ( array( 'form_id', 'field_id', 'step_id', 'page_id', 'user_id', 'role_id', 'selector', 'javascript', 'gp_advanced_select', 'file_upload_pro' ) as $forbidden_fragment ) {
    gpp_assert_true(
        false === stripos( $serialized, $forbidden_fragment ),
        'Registration visual package must not contain environment identity or unproven executable/GP adapter surface: ' . $forbidden_fragment
    );
}

// Unknown keys, dangerous syntax and unknown/unproven capabilities fail closed.
$bad = $v11;
$bad['surface_profiles'][0]['presentation']['css'] = 'body display none';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Raw CSS channel must be rejected.' );

$bad = $v11;
$bad['surface_profiles'][0]['presentation']['controls']['selector'] = '.gfield';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Raw selector targeting must be rejected.' );

$bad = $v11;
$bad['surface_profiles'][0]['presentation']['capabilities'][] = 'gravity_perks.advanced_select';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Unproven/unknown GP capability must fail closed.' );

$bad = $v11;
$bad['design_tokens']['font_families']['primary'] = 'Vazirmatn; body{display:none}';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Font token must not become an unrestricted CSS channel.' );

$bad = $v11;
$bad['surface_profiles'][0]['profile_id'] = 'srwf.form-77.registration';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Concrete form identity must remain forbidden from profile identity.' );

$bad = $v11;
$bad['package_id'] = 'srwf.role-officer.registration';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Concrete role identity must remain forbidden from package identity.' );

$bad = $v11;
$bad['selected_surfaces'][] = 'gravity_flow.unknown';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Unknown surface must fail closed.' );

$bad = $v11;
$bad['selected_surfaces'][] = 'gravity_flow.inbox';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Every selected surface must have exactly one profile.' );

$bad = $v11;
$bad['surface_profiles'][0]['token_refs'] = array_values(
    array_filter(
        $bad['surface_profiles'][0]['token_refs'],
        static function ( $ref ) { return 'sizes_px.content_max_width' !== $ref; }
    )
);
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Presentation token must be declared by the surface profile.' );

$bad = $v11;
$bad['reserved_extension_seam']['form_id'] = 77;
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Reserved Extension Seam must remain inert and untargeted.' );

// Semantic binding remains unable to choose or override visual identity.
$binding = gpp_v11_fixture( 'wu09-binding-set-a.json' );
$binding['profile_id'] = 'srwf.registration.v1';
gpp_v11_expect_violation(
    static function () use ( $binding ) {
        EnvironmentBindingSet::validate( $binding );
    },
    'Environment binding artifact must reject visual profile selection.'
);

// Canonicalization remains deterministic while semantic changes change content identity.
$reordered = gpp_v11_reverse_object_keys( $v11 );
gpp_assert_same(
    VisualProfilePackage::contentHash( $v11 ),
    VisualProfilePackage::contentHash( $reordered ),
    'Schema 1.1 canonical hash must ignore associative object-key order.'
);
$changed = $v11;
$changed['surface_profiles'][0]['presentation']['composition']['direction'] = 'ltr';
gpp_assert_true(
    VisualProfilePackage::contentHash( $v11 ) !== VisualProfilePackage::contentHash( $changed ),
    'Schema 1.1 canonical hash must change when declarative presentation semantics change.'
);

// Unsupported schema versions remain rejected rather than guessed/migrated implicitly.
$bad = $v11;
$bad['schema_version'] = '2.0.0';
gpp_v11_expect_violation( static function () use ( $bad ) { VisualProfilePackage::validate( $bad ); }, 'Unknown future schema must fail closed.' );

echo "GPP_PORTABLE_PROFILE_PACKAGE_V11_TESTS_PASS\n";
