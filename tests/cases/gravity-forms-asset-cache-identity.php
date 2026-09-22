<?php

require __DIR__ . '/gravity-forms-addon.php';

$repo_root = dirname( __DIR__, 2 );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $legacy_form, false );

$legacy_styles = $GLOBALS['gpp_enqueued_styles'];
gpp_assert_same( 2, count( $legacy_styles ), 'Active legacy form must enqueue exactly Base + selected profile assets.' );
gpp_assert_same( 'gpp-base', $legacy_styles[0]['handle'], 'Base handle must remain compatible with the existing WordPress enqueue contract.' );
gpp_assert_same( 'https://example.test/wp-content/plugins/gravity-presentation-profiles/assets/css/base.css', $legacy_styles[0]['src'], 'Base URL must remain compatible with the existing WordPress enqueue contract.' );
gpp_assert_same( array(), $legacy_styles[0]['dependencies'], 'Base dependency ordering must remain unchanged.' );
gpp_assert_true( is_string( $legacy_styles[0]['version'] ) && '' !== $legacy_styles[0]['version'], 'Base enqueue must receive a non-empty deterministic version identity.' );
gpp_assert_same(
    substr( hash_file( 'sha256', $repo_root . '/assets/css/base.css' ), 0, 16 ),
    $legacy_styles[0]['version'],
    'Base enqueue version must be derived from the exact distributed CSS bytes.'
);

gpp_assert_same( 'gpp-profile-srwf-registration', $legacy_styles[1]['handle'], 'Profile handle must remain compatible with the existing WordPress enqueue contract.' );
gpp_assert_same( 'https://example.test/wp-content/plugins/gravity-presentation-profiles/profiles/srwf/registration/profile.css', $legacy_styles[1]['src'], 'Profile URL must remain compatible with the existing WordPress enqueue contract.' );
gpp_assert_same( array( 'gpp-base' ), $legacy_styles[1]['dependencies'], 'Profile stylesheet must remain ordered after Base through its dependency.' );
gpp_assert_true( is_string( $legacy_styles[1]['version'] ) && '' !== $legacy_styles[1]['version'], 'Active-profile enqueue must receive a non-empty deterministic version identity.' );
gpp_assert_same(
    substr( hash_file( 'sha256', $repo_root . '/profiles/srwf/registration/profile.css' ), 0, 16 ),
    $legacy_styles[1]['version'],
    'Active-profile enqueue version must be derived from the exact distributed CSS bytes.'
);

gpp_assert_true( $legacy_styles[0]['version'] !== $legacy_styles[1]['version'], 'Independent asset bytes must retain independent cache identities.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $plain_form, false );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Disabled/native Gravity Forms fallback must not begin enqueueing GPP presentation assets.' );
gpp_assert_same( array(), $GLOBALS['gpp_inline_styles'], 'Disabled/native Gravity Forms fallback must not emit GPP inline presentation CSS.' );

$reimport_probe = new GppAddonSettingsField();
$addon->validate_visual_package_import( $reimport_probe, $canonical_json );
gpp_assert_same( null, $reimport_probe->error, 'Canonical declarative package must be restorable for enqueue identity verification.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $declarative_form, true );
$declarative_styles = $GLOBALS['gpp_enqueued_styles'];
gpp_assert_same( 2, count( $declarative_styles ), 'Declarative AJAX path must retain Base + one admitted generic stylesheet.' );
gpp_assert_same( 'gpp-gravity-forms-declarative', $declarative_styles[1]['handle'], 'Declarative stylesheet handle must remain unchanged.' );
gpp_assert_same( array( 'gpp-base' ), $declarative_styles[1]['dependencies'], 'Declarative stylesheet ordering must remain dependent on Base.' );
gpp_assert_same(
    substr( hash_file( 'sha256', $repo_root . '/assets/css/gravity-forms-declarative.css' ), 0, 16 ),
    $declarative_styles[1]['version'],
    'Declarative active-profile enqueue version must be derived from the exact distributed CSS bytes.'
);

echo "GRAVITY_FORMS_ASSET_CACHE_IDENTITY_PASS\n";
