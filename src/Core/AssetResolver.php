<?php

namespace GravityPresentationProfiles\Core;

final class AssetResolver {
    const BASE_HANDLE = 'gpp-base';
    const BASE_PATH   = 'assets/css/base.css';

    private $asset_root;

    public function __construct( $asset_root = null ) {
        $this->asset_root = is_string( $asset_root ) && '' !== $asset_root
            ? rtrim( $asset_root, '/\\' ) . DIRECTORY_SEPARATOR
            : null;
    }

    public function stylesFor( $state ) {
        if ( ! $state instanceof RuntimeState || ! $state->isActive() ) {
            return array();
        }

        $profile = $state->profile();

        return array(
            $this->styleDescriptor(
                self::BASE_HANDLE,
                self::BASE_PATH,
                array()
            ),
            $this->styleDescriptor(
                $profile->styleHandle(),
                $profile->assetPath(),
                array( self::BASE_HANDLE )
            ),
        );
    }

    private function styleDescriptor( $handle, $path, $dependencies ) {
        return array(
            'handle'       => $handle,
            'path'         => $path,
            'dependencies' => $dependencies,
            'version'      => $this->contentVersion( $path ),
        );
    }

    private function contentVersion( $path ) {
        if ( null === $this->asset_root || ! is_string( $path ) || '' === $path || ! function_exists( 'hash_file' ) ) {
            return false;
        }

        $absolute_path = $this->asset_root . ltrim( $path, '/\\' );
        if ( ! is_file( $absolute_path ) || ! is_readable( $absolute_path ) ) {
            return false;
        }

        $hash = hash_file( 'sha256', $absolute_path );
        return is_string( $hash ) && '' !== $hash ? substr( $hash, 0, 16 ) : false;
    }
}
