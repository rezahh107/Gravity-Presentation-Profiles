<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;

Autoloader::register();

final class GppReservedSeamMemoryStateStore implements StateStore {
    private $state = null;
    public $write_count = 0;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] )
            ? $this->state['revision']
            : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }

        $this->state = $next_state;
        $this->write_count++;
        return true;
    }
}

function gpp_reserved_seam_lifecycle_package( $path ) {
    $data = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) {
        gpp_fail( 'Invalid lifecycle visual-package fixture: ' . $path );
    }

    return $data;
}

function gpp_reserved_seam_expect_lifecycle_violation( $callback, $message ) {
    try {
        $callback();
    } catch ( LifecycleException $exception ) {
        gpp_assert_same( 'visual_contract_violation', $exception->reasonCode(), $message . ' reason' );
        return;
    }

    gpp_fail( $message );
}

$store = new GppReservedSeamMemoryStateStore();
$lifecycle = new VisualPackageLifecycle( $store );
$v1 = gpp_reserved_seam_lifecycle_package( __DIR__ . '/../fixtures/wu09-visual-package.json' );
$v11 = gpp_reserved_seam_lifecycle_package( dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json' );

// Establish legitimate schema 1.0 lifecycle state and an active Inbox before falsification.
gpp_assert_same( 'INSTALLED_INACTIVE', $lifecycle->import( $v1 )['status'], 'Valid schema 1.0 package must import.' );
$lifecycle->activate(
    array(
        'surface' => 'gravity_flow.inbox',
        'package_id' => $v1['package_id'],
        'package_version' => $v1['package_version'],
        'profile_id' => 'shared.inbox.v1',
    )
);
$inbox_before = $lifecycle->resolve( 'gravity_flow.inbox' );
$snapshot_before = $lifecycle->snapshot();
$writes_before = $store->write_count;

// Schema 1.0 unsupported seam versions must be rejected before lifecycle persistence.
$bad_v1 = $v1;
$bad_v1['reserved_extension_seam']['version'] = '1.0.1';
gpp_reserved_seam_expect_lifecycle_violation(
    static function () use ( $lifecycle, $bad_v1 ) {
        $lifecycle->import( $bad_v1 );
    },
    'Schema 1.0 unsupported seam version import must fail closed.'
);
gpp_assert_same( $snapshot_before, $lifecycle->snapshot(), 'Failed schema 1.0 seam import must not mutate lifecycle state.' );
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'Failed schema 1.0 seam import must preserve active Inbox state.' );
gpp_assert_same( $writes_before, $store->write_count, 'Failed schema 1.0 seam import must not commit state.' );

// The same common import validator boundary must reject schema 1.1 without touching prior state.
$bad_v11 = $v11;
$bad_v11['reserved_extension_seam']['version'] = '2.0.0';
gpp_reserved_seam_expect_lifecycle_violation(
    static function () use ( $lifecycle, $bad_v11 ) {
        $lifecycle->import( $bad_v11 );
    },
    'Schema 1.1 unsupported seam version import must fail closed.'
);
gpp_assert_same( $snapshot_before, $lifecycle->snapshot(), 'Failed schema 1.1 seam import must not mutate lifecycle state.' );
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'Failed schema 1.1 seam import must preserve active Inbox state.' );
gpp_assert_same( $writes_before, $store->write_count, 'Failed schema 1.1 seam import must not commit state.' );

// A valid canonical schema 1.1 package still imports after both failed attempts and does not disturb Inbox.
gpp_assert_same( 'INSTALLED_INACTIVE', $lifecycle->import( $v11 )['status'], 'Canonical schema 1.1 package must still import.' );
gpp_assert_same( $inbox_before, $lifecycle->resolve( 'gravity_flow.inbox' ), 'Valid schema 1.1 import must preserve active Inbox state.' );

echo "GPP_RESERVED_EXTENSION_SEAM_LIFECYCLE_TESTS_PASS\n";
