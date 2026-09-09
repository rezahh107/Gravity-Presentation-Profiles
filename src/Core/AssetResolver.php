<?php

namespace GravityPresentationProfiles\Core;

final class AssetResolver {
    const BASE_HANDLE = 'gpp-base';
    const BASE_PATH   = 'assets/css/base.css';

    public function stylesFor( $state ) {
        if ( ! $state instanceof RuntimeState || ! $state->isActive() ) {
            return array();
        }

        $profile = $state->profile();

        return array(
            array(
                'handle'       => self::BASE_HANDLE,
                'path'         => self::BASE_PATH,
                'dependencies' => array(),
            ),
            array(
                'handle'       => $profile->styleHandle(),
                'path'         => $profile->assetPath(),
                'dependencies' => array( self::BASE_HANDLE ),
            ),
        );
    }
}
