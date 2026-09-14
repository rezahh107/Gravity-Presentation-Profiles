<?php

namespace GravityPresentationProfiles\GravityForms;

final class DeclarativeProfileDefinition {
    const STYLE_HANDLE = 'gpp-gravity-forms-declarative';
    const ASSET_PATH   = 'assets/css/gravity-forms-declarative.css';

    private const CAPABILITY_CLASSES = array(
        'gravity_forms.orbital_control_metric_projection' => 'gpp-cap-gf-orbital-control-metric-projection',
        'persian_gravity.jalali_validation_message_after_control' => 'gpp-cap-pgr-jalali-validation-message-after-control',
    );

    private const TOKEN_PROPERTIES = array(
        'composition' => array(
            'max_inline_size' => '--gpp-form-max-inline-size',
            'inline_padding' => '--gpp-form-inline-padding',
            'surface_background' => '--gpp-form-surface-background',
            'surface_radius' => '--gpp-form-surface-radius',
        ),
        'typography' => array(
            'font_family' => '--gpp-form-font-family',
        ),
        'controls' => array(
            'background' => '--gpp-control-background',
            'text' => '--gpp-control-text',
            'border' => '--gpp-control-border',
            'focus_border' => '--gpp-control-focus-border',
            'error_border' => '--gpp-control-error-border',
            'radius' => '--gpp-control-radius',
            'min_height' => '--gpp-control-min-height',
            'font_size' => '--gpp-control-font-size',
            'font_weight' => '--gpp-control-font-weight',
        ),
        'labels' => array(
            'text' => '--gpp-label-text',
            'required_color' => '--gpp-label-required-color',
            'font_size' => '--gpp-label-font-size',
            'font_weight' => '--gpp-label-font-weight',
        ),
        'descriptions' => array(
            'text' => '--gpp-description-text',
        ),
        'sections' => array(
            'divider' => '--gpp-section-divider',
            'heading_text' => '--gpp-section-heading-text',
            'heading_font_size' => '--gpp-section-heading-font-size',
            'heading_font_weight' => '--gpp-section-heading-font-weight',
            'description_text' => '--gpp-section-description-text',
        ),
        'primary_action' => array(
            'background' => '--gpp-primary-action-background',
            'pressed_background' => '--gpp-primary-action-pressed-background',
            'focus_border' => '--gpp-primary-action-focus-border',
            'min_height' => '--gpp-primary-action-min-height',
            'font_size' => '--gpp-primary-action-font-size',
            'font_weight' => '--gpp-primary-action-font-weight',
        ),
        'validation' => array(
            'error_color' => '--gpp-validation-error-color',
        ),
    );

    private $package_id;
    private $package_version;
    private $profile_id;
    private $artifact;
    private $profile;
    private $key;

    public function __construct( $resolution ) {
        $this->package_id      = $resolution['package_id'];
        $this->package_version = $resolution['package_version'];
        $this->profile_id      = $resolution['profile_id'];
        $this->artifact        = $resolution['artifact'];
        $this->profile         = $resolution['profile'];
        $this->key             = 'declarative-' . substr(
            hash( 'sha256', $this->package_id . "\n" . $this->package_version . "\n" . $this->profile_id ),
            0,
            16
        );
    }

    public function key() {
        return $this->key;
    }

    public function styleHandle() {
        return self::STYLE_HANDLE;
    }

    public function assetPath() {
        return self::ASSET_PATH;
    }

    public function packageId() {
        return $this->package_id;
    }

    public function packageVersion() {
        return $this->package_version;
    }

    public function profileId() {
        return $this->profile_id;
    }

    public function semanticClasses() {
        $classes      = array( 'gpp-declarative' );
        $presentation = $this->profile['presentation'];

        if (
            isset( $presentation['composition']['field_layout'] ) &&
            'single_column' === $presentation['composition']['field_layout']
        ) {
            $classes[] = 'gpp-field-layout-single-column';
        }

        $capabilities = isset( $presentation['capabilities'] ) ? $presentation['capabilities'] : array();
        foreach ( $capabilities as $capability ) {
            if ( isset( self::CAPABILITY_CLASSES[ $capability ] ) ) {
                $classes[] = self::CAPABILITY_CLASSES[ $capability ];
            }
        }

        return $classes;
    }

    public function inlineCss() {
        $declarations = array();
        $presentation = $this->profile['presentation'];

        if ( isset( $presentation['composition']['direction'] ) ) {
            $declarations['--gpp-form-direction'] = $presentation['composition']['direction'];
        }

        foreach ( self::TOKEN_PROPERTIES as $block_name => $property_map ) {
            if ( ! isset( $presentation[ $block_name ] ) || ! is_array( $presentation[ $block_name ] ) ) {
                continue;
            }

            foreach ( $property_map as $preference => $property_name ) {
                if ( ! isset( $presentation[ $block_name ][ $preference ] ) ) {
                    continue;
                }

                $declarations[ $property_name ] = $this->resolveTokenValue(
                    $presentation[ $block_name ][ $preference ]
                );
            }
        }

        if ( array() === $declarations ) {
            return '';
        }

        ksort( $declarations, SORT_STRING );
        $css = '.gpp-enabled_wrapper.gpp-declarative_wrapper.gpp-profile-' . $this->key . '_wrapper{';
        foreach ( $declarations as $property => $value ) {
            $css .= $property . ':' . $value . ';';
        }

        return $css . '}';
    }

    public static function supportsCapabilities( $profile ) {
        if ( ! isset( $profile['presentation']['capabilities'] ) ) {
            return true;
        }
        if ( ! is_array( $profile['presentation']['capabilities'] ) ) {
            return false;
        }
        foreach ( $profile['presentation']['capabilities'] as $capability ) {
            if ( ! isset( self::CAPABILITY_CLASSES[ $capability ] ) ) {
                return false;
            }
        }
        return true;
    }

    private function resolveTokenValue( $reference ) {
        $parts    = explode( '.', $reference, 2 );
        $category = $parts[0];
        $name     = $parts[1];
        $value    = $this->artifact['design_tokens'][ $category ][ $name ];

        if ( in_array( $category, array( 'spacing_px', 'radii_px', 'sizes_px', 'font_sizes_px' ), true ) ) {
            return (string) $value . 'px';
        }
        if ( 'font_families' === $category ) {
            return '"' . $value . '"';
        }
        if ( is_int( $value ) || is_float( $value ) ) {
            return (string) $value;
        }

        return $value;
    }
}
