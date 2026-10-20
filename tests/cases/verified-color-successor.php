<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackageV11;
use GravityPresentationProfiles\GravityForms\VerifiedColorSuccessor;

Autoloader::register();

$fixture_path = __DIR__ . '/../repro-evidence-lab/fixtures/generic-no-code-form-e2e.json';
$source = json_decode( file_get_contents( $fixture_path ), true );
VisualProfilePackageV11::validate( $source );
$original = serialize( $source );

function gpp_color_resolution( $artifact ) {
    return array(
        'schema_version' => $artifact['schema_version'],
        'artifact' => $artifact,
        'profile' => $artifact['surface_profiles'][0],
        'content_hash' => VisualProfilePackage::contentHash( $artifact ),
        'package_version' => $artifact['package_version'],
    );
}

function gpp_color_reject( $callback, $message ) {
    try {
        $callback();
    } catch ( \InvalidArgumentException $exception ) {
        return;
    }
    gpp_fail( $message );
}

$resolution = gpp_color_resolution( $source );
gpp_assert_same(
    array( 'surface_background' => '#E7F3FF', 'control_border' => '#155E75', 'submit_background' => '#D4571B' ),
    VerifiedColorSuccessor::colors( $resolution ),
    'Editor must read exact current preferences without guessing absent fields.'
);
$changed = VerifiedColorSuccessor::build(
    $resolution, $resolution['content_hash'], '1.0.1',
    array( 'control_border' => '#aabbcc', 'submit_background' => '#112233' )
);
VisualProfilePackageV11::validate( $changed );
gpp_assert_same( '1.0.1', $changed['package_version'], 'Successor version must change.' );
gpp_assert_same( '#AABBCC', $changed['design_tokens']['colors']['gpp_editor_control_border'], 'Border color normalized.' );
gpp_assert_same( '#112233', $changed['design_tokens']['colors']['gpp_editor_submit_background'], 'Submit color retained.' );
gpp_assert_same(
    $source['surface_profiles'][0]['presentation']['composition'],
    $changed['surface_profiles'][0]['presentation']['composition'],
    'Unedited presentation block must be identical.'
);
gpp_assert_same( $original, serialize( $source ), 'Source object cannot be mutated.' );
gpp_assert_same( $resolution['content_hash'], VisualProfilePackage::contentHash( $source ), 'Source hash cannot change.' );
gpp_assert_same( array(), $changed['provenance']['evidence_refs'], 'Source evidence must not be falsely attributed to the new colors.' );

$shared = $source;
$shared['surface_profiles'][0]['presentation']['labels'] = array( 'text' => 'colors.border' );
$shared_resolution = gpp_color_resolution( $shared );
$next = VerifiedColorSuccessor::build(
    $shared_resolution, $shared_resolution['content_hash'], '1.0.1',
    array( 'control_border' => '#445566' )
);
gpp_assert_same( 'colors.border', $next['surface_profiles'][0]['presentation']['labels']['text'], 'Other preferences sharing source token remain untouched.' );
gpp_assert_same( '#155E75', $next['design_tokens']['colors']['border'], 'Old shared token is immutable.' );
gpp_assert_true(
    $next['surface_profiles'][0]['presentation']['controls']['border'] !== 'colors.border',
    'Selected control must get a new dedicated token.'
);

$collision = $source;
$collision['design_tokens']['colors']['gpp_editor_control_border'] = '#ABCDEF';
$collision_resolution = gpp_color_resolution( $collision );
$collision_next = VerifiedColorSuccessor::build(
    $collision_resolution, $collision_resolution['content_hash'], '1.0.1',
    array( 'control_border' => '#445566' )
);
gpp_assert_same( '#ABCDEF', $collision_next['design_tokens']['colors']['gpp_editor_control_border'], 'Existing editor-named token cannot be overwritten.' );
gpp_assert_same( '#445566', $collision_next['design_tokens']['colors']['gpp_editor_control_border_1'], 'Collisions must allocate unique tokens.' );

gpp_color_reject(
    static function () use ( $resolution ) { VerifiedColorSuccessor::build( $resolution, $resolution['content_hash'], '1.0.1', array() ); },
    'Empty selection must fail.'
);
gpp_color_reject(
    static function () use ( $resolution ) { VerifiedColorSuccessor::build( $resolution, $resolution['content_hash'], '1.0.1', array( 'labels_text' => '#112233' ) ); },
    'Unsupported preference must fail.'
);
gpp_color_reject(
    static function () use ( $resolution ) { VerifiedColorSuccessor::build( $resolution, $resolution['content_hash'], '1.0.1', array( 'control_border' => 'red; body{}' ) ); },
    'CSS injection must fail.'
);
gpp_color_reject(
    static function () use ( $resolution ) { VerifiedColorSuccessor::build( $resolution, 'stale', '1.0.1', array( 'control_border' => '#112233' ) ); },
    'Stale source hash must fail.'
);
gpp_color_reject(
    static function () use ( $resolution ) { VerifiedColorSuccessor::build( $resolution, $resolution['content_hash'], '1.0.0', array( 'control_border' => '#112233' ) ); },
    'Existing same version must fail.'
);
gpp_color_reject(
    static function () use ( $resolution ) { VerifiedColorSuccessor::build( $resolution, $resolution['content_hash'], '0.9.9', array( 'control_border' => '#112233' ) ); },
    'Downgrade must fail.'
);
$multi = $resolution;
$multi['artifact']['selected_surfaces'][] = 'gravity_flow.inbox';
gpp_color_reject(
    static function () use ( $multi ) { VerifiedColorSuccessor::colors( $multi ); },
    'Multi-surface package is not admitted by editor.'
);
gpp_assert_same(
    '1.0.0', $source['package_version'],
    'Original immutable package must remain unchanged for rollback.'
);
echo "VERIFIED_COLOR_SUCCESSOR_PASS\n";
