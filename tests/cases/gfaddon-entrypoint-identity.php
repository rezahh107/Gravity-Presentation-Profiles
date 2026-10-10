<?php

require_once __DIR__ . '/../helpers.php';

define( 'GPP_PLUGIN_FILE', dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php' );

/** The real GFAddOn constructor reads path identity before init. */
class GFAddOn {
    public $observed_full_path;
    public $observed_relative_path;
    public function __construct() {
        $this->observed_full_path = $this->_full_path;
        $this->observed_relative_path = $this->_path;
    }
}

require_once __DIR__ . '/../../src/Autoloader.php';
\GravityPresentationProfiles\Autoloader::register();

$addon = \GravityPresentationProfiles\GravityForms\AddOn::get_instance();

gpp_assert_same( GPP_PLUGIN_FILE, $addon->observed_full_path, 'GFAddOn parent constructor must receive the canonical plugin entrypoint before running.' );
gpp_assert_same( 'gravity-presentation-profiles/gravity-presentation-profiles.php', $addon->observed_relative_path, 'Native GFAddOn relative path must remain the authoritative plugin identity.' );
gpp_assert_same( $addon, \GravityPresentationProfiles\GravityForms\AddOn::get_instance(), 'GFAddOn singleton identity must remain stable.' );

echo "GFADDON_ENTRYPOINT_IDENTITY_PASS\n";
