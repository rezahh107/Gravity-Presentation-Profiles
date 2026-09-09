<?php

namespace GravityPresentationProfiles;

use GravityPresentationProfiles\Core\ProfileRegistry;
use GravityPresentationProfiles\Profiles\Srwf\Registration\Profile as SrwfRegistrationProfile;

final class ProfileCatalog {
    public static function create() {
        $registry = new ProfileRegistry();
        $registry->register( SrwfRegistrationProfile::definition() );

        return $registry;
    }
}
