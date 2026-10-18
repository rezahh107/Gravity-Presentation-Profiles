<?php
// WU18-only real WordPress lifecycle control. Never installed in production.
if ( ! defined( 'ABSPATH' ) || ! defined( 'WP_CLI' ) || ! WP_CLI ) {
    throw new RuntimeException( 'WP-CLI pinned fixture is required.' );
}

use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

$action = getenv( 'GPP_OPERATIONAL_ACTION' );
$surface = getenv( 'GPP_OPERATIONAL_SURFACE' );
$fixture = json_decode( file_get_contents( __DIR__ . '/../fixtures/generic-operational-paint-v11.json' ), true );
$visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
$result = null;
if ( 'snapshot' === $action ) {
    $result = $visual->snapshot();
} elseif ( 'import' === $action ) {
    $result = $visual->import( $fixture );
} elseif ( in_array( $action, array( 'activate', 'rollback', 'deactivate' ), true )
    && in_array( $surface, array( 'gravity_flow.entry_detail', 'gravity_flow.inbox' ), true ) ) {
    if ( 'deactivate' === $action ) {
        $result = $visual->deactivate( array( 'surface' => $surface ) );
    } elseif ( 'rollback' === $action ) {
        $previous = json_decode( (string) getenv( 'GPP_OPERATIONAL_PREVIOUS' ), true );
        if ( ! is_array( $previous ) || count( $previous ) !== 3 ) {
            throw new RuntimeException( 'Explicit prior immutable activation identity required.' );
        }
        $result = $visual->rollback( array_merge( array( 'surface' => $surface ), $previous ) );
    } else {
        $chosen = null;
        foreach ( $fixture['surface_profiles'] as $profile ) {
            if ( $profile['surface'] === $surface ) {
                $chosen = $profile;
            }
        }
        if ( null === $chosen ) {
            throw new RuntimeException( 'Missing requested profile.' );
        }
        $result = $visual->activate( array(
            'surface' => $surface,
            'package_id' => $fixture['package_id'],
            'package_version' => $fixture['package_version'],
            'profile_id' => $chosen['profile_id'],
        ) );
    }
} else {
    throw new RuntimeException( 'Unknown operational fixture command.' );
}
echo 'GPP_OPERATIONAL_JSON:' . wp_json_encode( $result, JSON_UNESCAPED_SLASHES ) . PHP_EOL;
