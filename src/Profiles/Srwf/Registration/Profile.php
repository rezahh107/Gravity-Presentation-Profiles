<?php

namespace GravityPresentationProfiles\Profiles\Srwf\Registration;

use GravityPresentationProfiles\Core\ProfileDefinition;

final class Profile {
    const KEY = 'srwf-registration';

    public static function definition() {
        return new ProfileDefinition(
            self::KEY,
            'SRWF Registration',
            'profiles/srwf/registration/profile.css'
        );
    }
}
