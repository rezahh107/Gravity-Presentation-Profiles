<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;

Autoloader::register();

final class Wu10DeactivateStateStore implements StateStore {
    private $state = null;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

function wu10_deactivate_fixture( $name ) {
    $data = json_decode( file_get_contents( __DIR__ . '/../fixtures/' . $name ), true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid WU10 deactivation fixture: ' . $name );
    }
    return $data;
}

function wu10_profile_id_for_surface( $artifact, $surface ) {
    foreach ( $artifact['surface_profiles'] as $profile ) {
        if ( $profile['surface'] === $surface ) {
            return $profile['profile_id'];
        }
    }
    gpp_fail( 'Missing profile for surface: ' . $surface );
}

$visual_v1  = wu10_deactivate_fixture( 'wu09-visual-package.json' );
$visual_v2  = $visual_v1;
$visual_v2['package_version'] = '1.1.0';
$binding_v1 = wu10_deactivate_fixture( 'wu09-binding-set-a.json' );
$binding_v2 = $binding_v1;
$binding_v2['binding_set_version'] = '1.1.0';

$evidence_refs = array();
foreach ( $binding_v1['bindings'] as $binding ) {
    if ( 'PROVEN' === $binding['state'] ) {
        foreach ( $binding['evidence_refs'] as $ref ) {
            $evidence_refs[] = $ref;
        }
    }
}

$visual   = new VisualPackageLifecycle( new Wu10DeactivateStateStore() );
$bindings = new BindingSetLifecycle( new Wu10DeactivateStateStore(), new EvidenceReferenceGate( $evidence_refs ) );
$surface  = 'gravity_flow.inbox';
$profile  = wu10_profile_id_for_surface( $visual_v1, $surface );
$context  = $binding_v1['context'];

$visual->import( $visual_v1 );
$visual->import( $visual_v2 );
$bindings->import( $binding_v1 );
$bindings->import( $binding_v2 );

$visual->activate(
    array(
        'surface' => $surface,
        'package_id' => $visual_v1['package_id'],
        'package_version' => '1.1.0',
        'profile_id' => $profile,
    )
);
$bindings->activate(
    array(
        'context' => $context,
        'binding_set_id' => $binding_v1['binding_set_id'],
        'binding_set_version' => '1.1.0',
    )
);

// Rolling back either artifact class cannot mutate the other class.
$binding_before_visual_rollback = $bindings->snapshot();
$visual->rollback(
    array(
        'surface' => $surface,
        'package_id' => $visual_v1['package_id'],
        'package_version' => '1.0.0',
        'profile_id' => $profile,
    )
);
gpp_assert_same( $binding_before_visual_rollback, $bindings->snapshot(), 'Visual rollback must not mutate binding lifecycle state.' );

$visual_before_binding_rollback = $visual->snapshot();
$bindings->rollback(
    array(
        'context' => $context,
        'binding_set_id' => $binding_v1['binding_set_id'],
        'binding_set_version' => '1.0.0',
    )
);
gpp_assert_same( $visual_before_binding_rollback, $visual->snapshot(), 'Binding rollback must not mutate visual lifecycle state.' );

// Explicit deactivation has deterministic null postcondition and never substitutes another version.
$binding_before_visual_deactivate = $bindings->snapshot();
$visual->deactivate( array( 'surface' => $surface ) );
gpp_assert_same( null, $visual->resolve( $surface ), 'Visual deactivation must leave the surface with no active profile.' );
gpp_assert_same( $binding_before_visual_deactivate, $bindings->snapshot(), 'Visual deactivation must not mutate binding lifecycle state.' );

$visual_before_binding_deactivate = $visual->snapshot();
$bindings->deactivate( array( 'context' => $context ) );
gpp_assert_same( null, $bindings->resolve( $context ), 'Binding deactivation must leave the context with no active binding set.' );
gpp_assert_same( $visual_before_binding_deactivate, $visual->snapshot(), 'Binding deactivation must not mutate visual lifecycle state.' );

// Once deactivated, the formerly selected versions may be removed without hidden substitution.
gpp_assert_true(
    $visual->remove( array( 'package_id' => $visual_v1['package_id'], 'package_version' => '1.0.0' ) ),
    'Deactivated visual version must be removable.'
);
gpp_assert_same( null, $visual->resolve( $surface ), 'Visual removal after deactivation must not auto-select another version.' );
gpp_assert_true(
    $bindings->remove( array( 'binding_set_id' => $binding_v1['binding_set_id'], 'binding_set_version' => '1.0.0' ) ),
    'Deactivated binding version must be removable.'
);
gpp_assert_same( null, $bindings->resolve( $context ), 'Binding removal after deactivation must not auto-select another version.' );

echo "GPP_WU10_DEACTIVATION_INDEPENDENCE_PASS\n";
