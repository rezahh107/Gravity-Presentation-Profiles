<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

\GravityPresentationProfiles\Autoloader::register();

$registry = \GravityPresentationProfiles\ProfileCatalog::create();
$profiles = $registry->all();

gpp_assert_same( 1, count( $profiles ), 'Exactly one profile should be admitted in WU1.' );
gpp_assert_same( 'srwf-registration', $profiles[0]->key(), 'The admitted profile key must be exact.' );
gpp_assert_same( null, $registry->get( 'unknown-profile' ), 'Unknown profiles must not resolve by fallback.' );

$resolver  = new \GravityPresentationProfiles\Core\PresentationResolver();
$repo_root = dirname( __DIR__, 2 );
$assets    = new \GravityPresentationProfiles\Core\AssetResolver( $repo_root );

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
gpp_assert_same( array(), $style_decisions[0]['dependencies'], 'Base style must keep no dependencies.' );
gpp_assert_same( 'gpp-profile-srwf-registration', $style_decisions[1]['handle'], 'Selected profile handle must be deterministic.' );
gpp_assert_same( 'profiles/srwf/registration/profile.css', $style_decisions[1]['path'], 'Selected profile path must stay compatible with the existing enqueue contract.' );
gpp_assert_same( array( 'gpp-base' ), $style_decisions[1]['dependencies'], 'Profile style must depend on Base.' );
gpp_assert_true( is_string( $style_decisions[0]['version'] ) && '' !== $style_decisions[0]['version'], 'Base style must receive a non-empty content-derived identity.' );
gpp_assert_true( is_string( $style_decisions[1]['version'] ) && '' !== $style_decisions[1]['version'], 'Active profile style must receive a non-empty content-derived identity.' );
gpp_assert_same(
    substr( hash_file( 'sha256', $repo_root . '/assets/css/base.css' ), 0, 16 ),
    $style_decisions[0]['version'],
    'Base style identity must be derived from the exact distributed CSS bytes.'
);
gpp_assert_same(
    substr( hash_file( 'sha256', $repo_root . '/profiles/srwf/registration/profile.css' ), 0, 16 ),
    $style_decisions[1]['version'],
    'Profile style identity must be derived from the exact distributed CSS bytes.'
);

$temp_root = sys_get_temp_dir() . '/gpp-asset-version-' . str_replace( '.', '-', uniqid( '', true ) );
$base_dir = $temp_root . '/assets/css';
$profile_dir = $temp_root . '/profiles/srwf/registration';
if ( ! mkdir( $base_dir, 0777, true ) || ! mkdir( $profile_dir, 0777, true ) ) {
    gpp_fail( 'Could not create the asset-versioning test fixture.' );
}
register_shutdown_function(
    static function () use ( $temp_root ) {
        $paths = array(
            $temp_root . '/assets/css/base.css',
            $temp_root . '/profiles/srwf/registration/profile.css',
        );
        foreach ( $paths as $path ) {
            if ( is_file( $path ) ) {
                @unlink( $path );
            }
        }
        @rmdir( $temp_root . '/profiles/srwf/registration' );
        @rmdir( $temp_root . '/profiles/srwf' );
        @rmdir( $temp_root . '/profiles' );
        @rmdir( $temp_root . '/assets/css' );
        @rmdir( $temp_root . '/assets' );
        @rmdir( $temp_root );
    }
);

file_put_contents( $base_dir . '/base.css', 'base-v1' );
file_put_contents( $profile_dir . '/profile.css', 'profile-v1' );
$fixture_assets = new \GravityPresentationProfiles\Core\AssetResolver( $temp_root );
$identity_v1 = $fixture_assets->stylesFor( $active );
$identity_v1_repeat = $fixture_assets->stylesFor( $active );
gpp_assert_same( $identity_v1, $identity_v1_repeat, 'Identical asset bytes must preserve identical descriptor identities.' );

file_put_contents( $base_dir . '/base.css', 'base-v2' );
$base_changed = ( new \GravityPresentationProfiles\Core\AssetResolver( $temp_root ) )->stylesFor( $active );
gpp_assert_true( $identity_v1[0]['version'] !== $base_changed[0]['version'], 'Changing Base CSS bytes must change the Base cache identity.' );
gpp_assert_same( $identity_v1[1]['version'], $base_changed[1]['version'], 'Changing Base CSS must not falsely change the profile cache identity.' );
gpp_assert_same(
    substr( hash( 'sha256', 'base-v2' ), 0, 16 ),
    $base_changed[0]['version'],
    'A changed Base payload must not retain its old version token.'
);

file_put_contents( $profile_dir . '/profile.css', 'profile-v2' );
$profile_changed = ( new \GravityPresentationProfiles\Core\AssetResolver( $temp_root ) )->stylesFor( $active );
gpp_assert_same( $base_changed[0]['version'], $profile_changed[0]['version'], 'Changing profile CSS must not falsely change the Base cache identity.' );
gpp_assert_true( $base_changed[1]['version'] !== $profile_changed[1]['version'], 'Changing profile CSS bytes must change the profile cache identity.' );
gpp_assert_same(
    substr( hash( 'sha256', 'profile-v2' ), 0, 16 ),
    $profile_changed[1]['version'],
    'A changed profile payload must not retain its old version token.'
);

$form_17_settings = array( 'enabled' => '1', 'profile' => 'srwf-registration' );
$form_99_settings = array( 'enabled' => '1', 'profile' => 'srwf-registration' );
gpp_assert_same(
    $resolver->resolve( $form_17_settings, $registry )->semanticClasses(),
    $resolver->resolve( $form_99_settings, $registry )->semanticClasses(),
    'Presentation identity must not depend on Form/Page IDs.'
);

echo "CORE_RESOLUTION_PASS\n";
