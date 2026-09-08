<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

\GravityPresentationProfiles\Autoloader::register();

$registry = \GravityPresentationProfiles\ProfileCatalog::create();
$profiles = $registry->all();

gpp_assert_same( 1, count( $profiles ), 'Exactly one profile should be admitted in WU1.' );
gpp_assert_same( 'srwf-registration', $profiles[0]->key(), 'The admitted profile key must be exact.' );
gpp_assert_same( null, $registry->get( 'unknown-profile' ), 'Unknown profiles must not resolve by fallback.' );

$resolver = new \GravityPresentationProfiles\Core\PresentationResolver();
$assets   = new \GravityPresentationProfiles\Core\AssetResolver();

$disabled = $resolver->resolve(
    array( 'enabled' => '0', 'profile' => 'srwf-registration' ),
    $registry
);
gpp_assert_same( false, $disabled->isActive(), 'Disabled settings must be inactive even with a valid profile value.' );
gpp_assert_same( 'disabled', $disabled->reason(), 'Disabled state should report a deterministic reason.' );
gpp_assert_same( array(), $disabled->semanticClasses(), 'Disabled forms must derive no GPP semantic classes.' );
gpp_assert_same( array(), $assets->stylesFor( $disabled ), 'Disabled forms must derive no GPP assets.' );

$missing = $resolver->resolve( array( 'enabled' => '1', 'profile' => '' ), $registry );
gpp_assert_same( false, $missing->isActive(), 'Enabled forms without a profile must fail closed.' );
gpp_assert_same( 'missing_profile', $missing->reason(), 'Missing profile should report a deterministic fail-closed reason.' );

$unknown = $resolver->resolve( array( 'enabled' => '1', 'profile' => 'not-registered' ), $registry );
gpp_assert_same( false, $unknown->isActive(), 'Unknown profiles must fail closed.' );
gpp_assert_same( 'unknown_profile', $unknown->reason(), 'Unknown profile should not silently fall back.' );
gpp_assert_same( array(), $assets->stylesFor( $unknown ), 'Unknown profiles must derive no assets.' );

$active = $resolver->resolve( array( 'enabled' => '1', 'profile' => 'srwf-registration' ), $registry );
gpp_assert_same( true, $active->isActive(), 'Enabled admitted profile must resolve active.' );
gpp_assert_same( 'srwf-registration', $active->profile()->key(), 'Resolved profile identity must come from settings.' );
gpp_assert_same(
    array( 'gpp-enabled', 'gpp-profile-srwf-registration' ),
    $active->semanticClasses(),
    'Active state should derive deterministic semantic classes.'
);

$style_decisions = $assets->stylesFor( $active );
gpp_assert_same( 2, count( $style_decisions ), 'Active admitted profile must resolve Base + selected-profile styles.' );
gpp_assert_same( 'gpp-base', $style_decisions[0]['handle'], 'Base style must resolve first.' );
gpp_assert_same( 'assets/css/base.css', $style_decisions[0]['path'], 'Base style path must be deterministic.' );
gpp_assert_same( 'gpp-profile-srwf-registration', $style_decisions[1]['handle'], 'Selected profile handle must be deterministic.' );
gpp_assert_same( array( 'gpp-base' ), $style_decisions[1]['dependencies'], 'Profile style must depend on Base.' );

$form_17_settings = array( 'enabled' => '1', 'profile' => 'srwf-registration' );
$form_99_settings = array( 'enabled' => '1', 'profile' => 'srwf-registration' );
gpp_assert_same(
    $resolver->resolve( $form_17_settings, $registry )->semanticClasses(),
    $resolver->resolve( $form_99_settings, $registry )->semanticClasses(),
    'Presentation identity must not depend on Form/Page IDs.'
);

echo "CORE_RESOLUTION_PASS\n";
