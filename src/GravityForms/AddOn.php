<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\AssetResolver;
use GravityPresentationProfiles\Core\PresentationResolver;
use GravityPresentationProfiles\ProfileCatalog;

final class AddOn extends \GFAddOn {
    private static $_instance = null;

    protected $_version     = '0.0.0-dev';
    protected $_slug        = 'gravity-presentation-profiles';
    protected $_path        = 'gravity-presentation-profiles/gravity-presentation-profiles.php';
    protected $_full_path   = __FILE__;
    protected $_title       = 'Gravity Presentation Profiles';
    protected $_short_title = 'Presentation Profiles';

    public static function get_instance() {
        if ( null === self::$_instance ) {
            self::$_instance = new self();
        }

        return self::$_instance;
    }

    public function form_settings_fields( $form ) {
        $profile_choices = array(
            array(
                'label' => esc_html__( 'Select a profile', 'gravity-presentation-profiles' ),
                'value' => '',
            ),
        );

        foreach ( ProfileCatalog::create()->all() as $profile ) {
            $profile_choices[] = array(
                'label' => esc_html__( $profile->label(), 'gravity-presentation-profiles' ),
                'value' => $profile->key(),
            );
        }

        return array(
            array(
                'title'  => esc_html__( 'Gravity Presentation Profiles', 'gravity-presentation-profiles' ),
                'fields' => array(
                    array(
                        'label'   => esc_html__( 'Enable', 'gravity-presentation-profiles' ),
                        'type'    => 'checkbox',
                        'name'    => 'enabled',
                        'choices' => array(
                            array(
                                'label' => esc_html__( 'Enable Gravity Presentation Profiles for this form', 'gravity-presentation-profiles' ),
                                'name'  => 'enabled',
                            ),
                        ),
                    ),
                    array(
                        'label'   => esc_html__( 'Profile', 'gravity-presentation-profiles' ),
                        'type'    => 'select',
                        'name'    => 'profile',
                        'choices' => $profile_choices,
                    ),
                ),
            ),
        );
    }

    public function init_frontend() {
        parent::init_frontend();

        add_action( 'gform_enqueue_scripts', array( $this, 'enqueue_form_assets' ), 10, 2 );
        add_filter( 'gform_pre_render', array( $this, 'add_form_state_css_classes' ), 10, 1 );
    }

    public function resolve_form_state( $form ) {
        $settings = $this->get_form_settings( $form );
        $resolver = new PresentationResolver();

        return $resolver->resolve( is_array( $settings ) ? $settings : array(), ProfileCatalog::create() );
    }

    public function enqueue_form_assets( $form, $is_ajax ) {
        unset( $is_ajax );

        if ( ! function_exists( 'wp_enqueue_style' ) || ! function_exists( 'plugins_url' ) || ! function_exists( 'plugin_dir_path' ) ) {
            return;
        }

        $assets = ( new AssetResolver() )->stylesFor( $this->resolve_form_state( $form ) );

        if ( empty( $assets ) ) {
            return;
        }

        $plugin_root = plugin_dir_path( GPP_PLUGIN_FILE );

        foreach ( $assets as $asset ) {
            if ( ! is_readable( $plugin_root . $asset['path'] ) ) {
                return;
            }
        }

        foreach ( $assets as $asset ) {
            wp_enqueue_style(
                $asset['handle'],
                plugins_url( $asset['path'], GPP_PLUGIN_FILE ),
                $asset['dependencies'],
                null
            );
        }
    }

    public function add_form_state_css_classes( $form ) {
        if ( ! is_array( $form ) ) {
            return $form;
        }

        $state = $this->resolve_form_state( $form );

        if ( ! $state->isActive() ) {
            return $form;
        }

        $class_string = isset( $form['cssClass'] ) && is_string( $form['cssClass'] )
            ? trim( $form['cssClass'] )
            : '';
        $classes = '' === $class_string
            ? array()
            : preg_split( '/\s+/', $class_string );

        foreach ( $state->semanticClasses() as $class_name ) {
            if ( ! in_array( $class_name, $classes, true ) ) {
                $classes[] = $class_name;
            }
        }

        $form['cssClass'] = implode( ' ', $classes );

        return $form;
    }
}
