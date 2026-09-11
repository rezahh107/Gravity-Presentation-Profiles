<?php

namespace GravityPresentationProfiles\Core\Portable;

final class VisualProfileResolver {
    private $package;

    public function __construct( $package ) {
        VisualProfilePackage::validate( $package );
        $this->package = $package;
    }

    public function resolve( $surface, $environment_context = null ) {
        if ( null !== $environment_context ) {
            throw new ContractViolation( 'Visual profile resolution accepts surface only; environment context cannot participate.' );
        }
        if ( ! is_string( $surface ) || ! in_array( $surface, VisualProfilePackage::admittedSurfaces(), true ) ) {
            return null;
        }
        foreach ( $this->package['surface_profiles'] as $profile ) {
            if ( $surface === $profile['surface'] ) {
                return $profile;
            }
        }
        return null;
    }
}
