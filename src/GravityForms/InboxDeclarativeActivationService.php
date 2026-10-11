<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Lifecycle\InstalledVisualProfileCatalog;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityFlow\DeclarativeInboxPresentation;

/**
 * Native GF Settings command adapter. Selection is transient; the existing
 * visual lifecycle is the only shared Inbox activation authority.
 */
final class InboxDeclarativeActivationService {
    const SURFACE = 'gravity_flow.inbox';

    private $visual;

    public function __construct( VisualPackageLifecycle $visual ) {
        $this->visual = $visual;
    }

    public static function forWordPress() {
        return new self( new VisualPackageLifecycle(
            new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
        ) );
    }

    public function current() {
        return $this->visual->resolve( self::SURFACE );
    }

    public function choices() {
        $current = $this->current();
        $choices = array(
            array( 'label' => __( 'No Inbox appearance change', 'gravity-presentation-profiles' ), 'value' => '' ),
        );
        if ( null !== $current ) {
            $choices[] = array(
                'label' => __( 'Disable shared Inbox appearance', 'gravity-presentation-profiles' ),
                'value' => $this->encode( array( 'operation' => 'deactivate', 'target' => null, 'expected' => $current ) ),
            );
        }

        $catalog = new InstalledVisualProfileCatalog( $this->visual );
        foreach ( $catalog->listForSurface( self::SURFACE ) as $item ) {
            $resolution = $catalog->resolveExact( self::SURFACE, $item['package_id'], $item['package_version'], $item['profile_id'] );
            $legacy_srwf = '1.0.0' === $resolution['schema_version']
                && 'srwf.operations.presentation' === $item['package_id']
                && 'srwf.operations.inbox.v1' === $item['profile_id'];
            if ( ! $legacy_srwf && ! DeclarativeInboxPresentation::supported( $resolution ) ) {
                continue;
            }
            $target = array(
                'package_id' => $item['package_id'],
                'package_version' => $item['package_version'],
                'profile_id' => $item['profile_id'],
            );
            if ( $target === $current ) {
                continue;
            }
            $label = $item['package_id'] . ' @ ' . $item['package_version'] . ' — ' . $item['profile_id'];
            $choices[] = array(
                'label' => $legacy_srwf
                    ? sprintf( __( 'Restore bound SRWF Inbox: %s', 'gravity-presentation-profiles' ), $label )
                    : sprintf( __( 'Apply shared Inbox appearance: %s', 'gravity-presentation-profiles' ), $label ),
                'value' => $this->encode( array( 'operation' => 'activate', 'target' => $target, 'expected' => $current ) ),
            );
        }
        return $choices;
    }

    public function apply( $encoded ) {
        if ( ! is_string( $encoded ) || '' === $encoded ) {
            return array( 'status' => 'NO_CHANGE', 'activation' => $this->current() );
        }
        $json = base64_decode( $encoded, true );
        $command = is_string( $json ) ? json_decode( $json, true ) : null;
        if ( ! is_array( $command ) || array_keys( $command ) !== array( 'operation', 'target', 'expected' ) ) {
            throw new LifecycleException( 'invalid_inbox_visual_action', 'Invalid Inbox visual selection.' );
        }
        $expected = $command['expected'];
        if ( null !== $expected && ! $this->isIdentity( $expected ) ) {
            throw new LifecycleException( 'invalid_inbox_visual_action', 'Invalid current Inbox visual identity.' );
        }

        if ( 'deactivate' === $command['operation'] && null === $command['target'] ) {
            if ( null === $expected ) {
                throw new LifecycleException( 'invalid_inbox_visual_action', 'Deactivation requires an observed active Inbox profile.' );
            }
            $this->visual->deactivateIfCurrent( array(
                'surface' => self::SURFACE,
                'expected_current_activation' => $expected,
            ) );
            return array( 'status' => 'DEACTIVATED', 'activation' => null );
        }
        if ( 'activate' !== $command['operation'] || ! $this->isIdentity( $command['target'] ) ) {
            throw new LifecycleException( 'invalid_inbox_visual_action', 'Unsupported Inbox visual selection.' );
        }
        $target = $command['target'];
        $resolution = ( new InstalledVisualProfileCatalog( $this->visual ) )->resolveExact(
            self::SURFACE, $target['package_id'], $target['package_version'], $target['profile_id']
        );
        $legacy_srwf = '1.0.0' === $resolution['schema_version']
            && 'srwf.operations.presentation' === $target['package_id']
            && 'srwf.operations.inbox.v1' === $target['profile_id'];
        if ( ! $legacy_srwf && ! DeclarativeInboxPresentation::supported( $resolution ) ) {
            throw new LifecycleException( 'unsupported_inbox_presentation', 'Installed Inbox preferences have no supported runtime consumer.' );
        }

        if ( $target === $expected ) {
            if ( $this->current() !== $expected ) {
                throw new LifecycleException( 'visual_activation_conflict', 'The shared Inbox activation changed.' );
            }
            return array( 'status' => 'NO_CHANGE', 'activation' => $expected );
        }
        $activated = $this->visual->activateIfCurrent( array(
            'surface' => self::SURFACE,
            'package_id' => $target['package_id'],
            'package_version' => $target['package_version'],
            'profile_id' => $target['profile_id'],
            'expected_current_activation' => $expected,
        ) );
        return array( 'status' => 'ACTIVATED', 'activation' => $activated );
    }

    private function isIdentity( $value ) {
        if ( ! is_array( $value ) || array_keys( $value ) !== array( 'package_id', 'package_version', 'profile_id' ) ) {
            return false;
        }
        foreach ( $value as $part ) {
            if ( ! is_string( $part ) || '' === $part ) {
                return false;
            }
        }
        return true;
    }

    private function encode( $command ) {
        return base64_encode( json_encode( $command, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
    }
}
