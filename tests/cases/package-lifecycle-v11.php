<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Portable\VisualProfilePackage;

Autoloader::register();

final class GppV11MemoryStateStore implements StateStore {
    private $state = null;
    private $fail_next = false;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        if ( $this->fail_next ) {
            $this->fail_next = false;
            return false;
        }

        $revision = is_array( $this->state ) && isset( $this->state['revision'] )
            ? $this->state['revision']
            : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }

        $this->state = $next_state;
        return true;
    }

    public function failNextCommit() {
        $this->fail_next = true;
    }
}

function gpp_v11_lifecycle_fixture( $name ) {
    $data = json_decode( file_get_contents( __DIR__ . '/../fixtures/' . $name ), true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid lifecycle fixture JSON: ' . $name );
    }
    return $data;
}

function gpp_v11_lifecycle_registration_package() {
    $path = dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json';
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid SRWF Registration declarative profile package.' );
    }
    return $data;
}

function gpp_v11_lifecycle_throws( $reason, $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( $reason, $exception->reasonCode(), $message . ' reason' );
        return;
    }
    gpp_fail( $message );
}

$store = new GppV11MemoryStateStore();
$lifecycle = new VisualPackageLifecycle( $store );
$v1 = gpp_v11_lifecycle_fixture( 'wu09-visual-package.json' );
$v11 = gpp_v11_lifecycle_registration_package();

// Existing schema 1.0.0 package remains installable and active Inbox state is authoritative.
$v1_import = $lifecycle->import( $v1 );
gpp_assert_same( 'INSTALLED_INACTIVE', $v1_import['status'], 'Schema 1.0 package must import unchanged.' );
$lifecycle->activate(
    array(
        'surface' => 'gravity_flow.inbox',
        'package_id' => $v1['package_id'],
        'package_version' => $v1['package_version'],
        'profile_id' => 'shared.inbox.v1',
    )
);
$inbox_before = $lifecycle->resolve( 'gravity_flow.inbox' );
gpp_assert_same( 'shared.inbox.v1', $inbox_before['profile_id'], 'Existing Inbox profile must be active before schema 1.1 import.' );

// Schema 1.1 import is inactive and must not disturb the already-active Inbox.
$v11_import = $lifecycle->import( $v11 );
gpp_assert_same( 'INSTALLED_INACTIVE', $v11_import['status'], 'Schema 1.1 import must remain inactive.' );
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'Schema 1.1 import must not change active Inbox state.' );
gpp_assert_same(
    VisualProfilePackage::canonicalJson( $v11 ),
    $lifecycle->export( $v11['package_id'], $v11['package_version'] ),
    'Schema 1.1 export must preserve canonical package content.'
);

gpp_assert_same( 'IDEMPOTENT', $lifecycle->import( $v11 )['status'], 'Schema 1.1 same-hash import must be idempotent.' );

// Identity/version immutability remains exact across the evolved schema.
$conflict = $v11;
$conflict['design_tokens']['colors']['primary'] = '#2563EB';
gpp_v11_lifecycle_throws(
    'identity_version_conflict',
    static function () use ( $lifecycle, $conflict ) {
        $lifecycle->import( $conflict );
    },
    'Schema 1.1 same identity/version with different content must be rejected.'
);
$stored_hash = $lifecycle->snapshot()['installed'][ $v11['package_id'] ][ $v11['package_version'] ]['content_hash'];
gpp_assert_same( VisualProfilePackage::contentHash( $v11 ), $stored_hash, 'Conflict must preserve original schema 1.1 content.' );

// A new package version installs separately and remains inactive until explicitly selected.
$v11_next = $v11;
$v11_next['package_version'] = '1.1.1';
$v11_next['design_tokens']['colors']['primary_pressed'] = '#1D3A9A';
$next_import = $lifecycle->import( $v11_next );
gpp_assert_same( 'INSTALLED_INACTIVE', $next_import['status'], 'New schema 1.1 package version must install separately and inactive.' );
gpp_assert_same( null, $lifecycle->resolve( 'gravity_forms.form' ), 'Import alone must not activate Gravity Forms presentation.' );

// Activation stays surface-only: no concrete form/user/role/binding identity can enter the visual registry.
$activation = $lifecycle->activate(
    array(
        'surface' => 'gravity_forms.form',
        'package_id' => $v11['package_id'],
        'package_version' => $v11['package_version'],
        'profile_id' => 'srwf.registration.v1',
    )
);
gpp_assert_same(
    array( 'package_id', 'package_version', 'profile_id' ),
    array_keys( $activation ),
    'Schema 1.1 visual activation registry must remain free of environment identity.'
);
gpp_assert_same(
    'srwf.registration.v1',
    $lifecycle->effectiveProfile( 'gravity_forms.form' )['profile_id'],
    'Schema 1.1 selected Gravity Forms profile must resolve through the existing lifecycle.'
);
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'Gravity Forms activation must not alter active Inbox state.' );

$forbidden_request = array(
    'surface' => 'gravity_forms.form',
    'package_id' => $v11['package_id'],
    'package_version' => $v11['package_version'],
    'profile_id' => 'srwf.registration.v1',
    'form_id' => 77,
);
gpp_v11_lifecycle_throws(
    'invalid_request_keys',
    static function () use ( $lifecycle, $forbidden_request ) {
        $lifecycle->activate( $forbidden_request );
    },
    'Schema 1.1 activation must reject form-specific targeting.'
);

// Explicit version selection and rollback retain the existing lifecycle semantics.
$lifecycle->activate(
    array(
        'surface' => 'gravity_forms.form',
        'package_id' => $v11_next['package_id'],
        'package_version' => $v11_next['package_version'],
        'profile_id' => 'srwf.registration.v1',
    )
);
gpp_assert_same( '1.1.1', $lifecycle->resolve( 'gravity_forms.form' )['package_version'], 'Explicit activation may select the new package version.' );
$lifecycle->rollback(
    array(
        'surface' => 'gravity_forms.form',
        'package_id' => $v11['package_id'],
        'package_version' => $v11['package_version'],
        'profile_id' => 'srwf.registration.v1',
    )
);
gpp_assert_same( '1.1.0', $lifecycle->resolve( 'gravity_forms.form' )['package_version'], 'Rollback must restore the prior schema 1.1 version.' );

// Failed state commit remains atomic for the new surface too.
$before_failed_activation = $lifecycle->resolve( 'gravity_forms.form' );
$store->failNextCommit();
gpp_v11_lifecycle_throws(
    'state_commit_failed',
    static function () use ( $lifecycle, $v11_next ) {
        $lifecycle->activate(
            array(
                'surface' => 'gravity_forms.form',
                'package_id' => $v11_next['package_id'],
                'package_version' => $v11_next['package_version'],
                'profile_id' => 'srwf.registration.v1',
            )
        );
    },
    'Schema 1.1 failed activation must remain atomic.'
);
gpp_assert_same( $before_failed_activation, $lifecycle->resolve( 'gravity_forms.form' ), 'Failed schema 1.1 activation must preserve prior state.' );
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'All schema 1.1 lifecycle operations must preserve active Inbox state.' );

$lifecycle->deactivate( array( 'surface' => 'gravity_forms.form' ) );
gpp_assert_same( null, $lifecycle->resolve( 'gravity_forms.form' ), 'Schema 1.1 Gravity Forms surface must deactivate independently.' );
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'Gravity Forms deactivation must not touch Inbox activation.' );

echo "GPP_PACKAGE_LIFECYCLE_V11_TESTS_PASS\n";
