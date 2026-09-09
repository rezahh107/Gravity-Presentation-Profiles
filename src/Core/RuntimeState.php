<?php

namespace GravityPresentationProfiles\Core;

final class RuntimeState {
    private $setting_enabled;
    private $profile;
    private $reason;

    private function __construct( $setting_enabled, $profile, $reason ) {
        $this->setting_enabled = (bool) $setting_enabled;
        $this->profile         = $profile;
        $this->reason          = (string) $reason;
    }

    public static function inactive( $setting_enabled, $reason ) {
        return new self( $setting_enabled, null, $reason );
    }

    public static function active( $profile ) {
        return new self( true, $profile, 'active' );
    }

    public function isActive() {
        return null !== $this->profile;
    }

    public function isSettingEnabled() {
        return $this->setting_enabled;
    }

    public function profile() {
        return $this->profile;
    }

    public function reason() {
        return $this->reason;
    }

    public function semanticClasses() {
        if ( ! $this->isActive() ) {
            return array();
        }

        return array(
            'gpp-enabled',
            'gpp-profile-' . $this->profile->key(),
        );
    }
}
