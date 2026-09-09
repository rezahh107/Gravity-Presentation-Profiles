<?php

namespace GravityPresentationProfiles\Core;

final class ProfileDefinition {
    private $key;
    private $label;
    private $asset_path;

    public function __construct( $key, $label, $asset_path ) {
        $this->key        = (string) $key;
        $this->label      = (string) $label;
        $this->asset_path = ltrim( (string) $asset_path, '/' );
    }

    public function key() {
        return $this->key;
    }

    public function label() {
        return $this->label;
    }

    public function assetPath() {
        return $this->asset_path;
    }

    public function styleHandle() {
        return 'gpp-profile-' . $this->key;
    }
}
