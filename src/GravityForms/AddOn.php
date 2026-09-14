<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\AssetResolver;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\PresentationResolver;
use GravityPresentationProfiles\ProfileCatalog;

final class AddOn extends \GFAddOn {
    private static $_instance = null;
    private $visual_workflow = null;

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

    public function plugin_settings_fields() {
        return array(
            array(
                'title'       => esc_html__( 'Declarative Profile Packages', 'gravity-presentation-profiles' ),
                'description' => esc_html__( 'Paste a validated GPP Profile Package JSON document and save settings to import it. Package JSON is validated and installed through the GPP lifecycle and is not retained as a second settings store.', 'gravity-presentation-profiles' ),
                'fields'      => array(
                    array(
                        'name'                => 'visual_profile_package_json',
                        'label'               => esc_html__( 'Profile Package JSON', 'gravity-presentation-profiles' ),
                        'type'                => 'textarea',
                        'class'               => 'large',
                        'validation_callback' => array( $this, 'validate_visual_package_import' ),
                        'save_callback'       => array( $this, 'discard_visual_package_json' ),
                    ),
                    array(
                        'name'  => 'installed_visual_profiles',
                        'label' => esc_html__( 'Installed Gravity Forms profiles', 'gravity-presentation-profiles' ),
                        'type'  => 'gpp_visual_inventory',
                    ),
                ),
            ),
        );
    }

    public function validate_visual_package_import( $field, $value ) {
        if ( is_string( $value ) && '' === trim( $value ) ) {
            return;
        }
        if ( ! is_string( $value ) ) {
            $this->setSettingsFieldError( $field, 'Profile Package JSON must be text.' );
            return;
        }

        $workflow   = $this->visualWorkflow();
        $validation = $workflow->validateVisualJson( $value );
        if ( ! $validation['valid'] ) {
            $this->setSettingsFieldError( $field, $validation['message'] );
            return;
        }

        try {
            $workflow->importVisualJson( $value );
        } catch ( LifecycleException $exception ) {
            $this->setSettingsFieldError( $field, $exception->getMessage() );
        }
    }

    public function discard_visual_package_json( $field, $value ) {
        unset( $field, $value );
        return '';
    }

    public function settings_gpp_visual_inventory( $field ) {
        unset( $field );

        try {
            $installed = $this->visualWorkflow()->visualProfilesForSurface( DeclarativePresentationResolver::SURFACE );
        } catch ( LifecycleException $exception ) {
            echo '<p>' . esc_html( $exception->getMessage() ) . '</p>';
            return;
        }

        if ( array() === $installed ) {
            echo '<p>' . esc_html__( 'No installed declarative Gravity Forms profiles.', 'gravity-presentation-profiles' ) . '</p>';
            return;
        }

        echo '<table class="widefat striped"><thead><tr>';
        echo '<th>' . esc_html__( 'Package', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Version', 'gravity-presentation-profiles' ) . '</th>';
        echo '<th>' . esc_html__( 'Profile', 'gravity-presentation-profiles' ) . '</th>';
        echo '</tr></thead><tbody>';
        foreach ( $installed as $item ) {
            echo '<tr><td><code>' . esc_html( $item['package_id'] ) . '</code></td>';
            echo '<td><code>' . esc_html( $item['package_version'] ) . '</code></td>';
            echo '<td><code>' . esc_html( $item['profile_id'] ) . '</code></td></tr>';
        }
        echo '</tbody></table>';
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

        $declarative_choices = array(
            array(
                'label' => esc_html__( 'Use legacy profile selection', 'gravity-presentation-profiles' ),
                'value' => '',
            ),
        );
        try {
            foreach ( ( new DeclarativePresentationResolver( $this->visualWorkflow() ) )->choices() as $choice ) {
                $declarative_choices[] = array(
                    'label' => esc_html( $choice['label'] ),
                    'value' => $choice['value'],
                );
            }
        } catch ( LifecycleException $exception ) {
            $declarative_choices[] = array(
                'label' => esc_html__( 'Installed profile catalog unavailable', 'gravity-presentation-profiles' ),
                'value' => '',
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
                        'label'       => esc_html__( 'Installed declarative profile', 'gravity-presentation-profiles' ),
                        'description' => esc_html__( 'Selects one exact installed package version and profile for this form. A declarative selection takes precedence over the legacy profile field and fails closed if it can no longer be resolved.', 'gravity-presentation-profiles' ),
                        'type'        => 'select',
                        'name'        => 'declarative_profile',
                        'choices'     => $declarative_choices,
                    ),
                    array(
                        'label'   => esc_html__( 'Legacy profile', 'gravity-presentation-profiles' ),
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
        $settings = is_array( $settings ) ? $settings : array();

        if ( DeclarativePresentationResolver::hasSelection( $settings ) ) {
            return ( new DeclarativePresentationResolver( $this->visualWorkflow() ) )->resolve( $settings );
        }

        return ( new PresentationResolver() )->resolve( $settings, ProfileCatalog::create() );
    }

    public function enqueue_form_assets( $form, $is_ajax ) {
        unset( $is_ajax );

        if ( ! function_exists( 'wp_enqueue_style' ) || ! function_exists( 'plugins_url' ) || ! function_exists( 'plugin_dir_path' ) ) {
            return;
        }

        $state  = $this->resolve_form_state( $form );
        $assets = ( new AssetResolver() )->stylesFor( $state );

        if ( empty( $assets ) ) {
            return;
        }

        $profile = $state->profile();
        if ( $profile instanceof DeclarativeProfileDefinition && ! function_exists( 'wp_add_inline_style' ) ) {
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

        if ( $profile instanceof DeclarativeProfileDefinition ) {
            $css = $profile->inlineCss();
            if ( '' !== $css ) {
                wp_add_inline_style( $profile->styleHandle(), $css );
            }
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
        $derived = $state->semanticClasses();
        $profile = $state->profile();
        if ( $profile instanceof DeclarativeProfileDefinition ) {
            $derived = array_merge( $derived, $profile->semanticClasses() );
        }

        foreach ( $derived as $class_name ) {
            if ( ! in_array( $class_name, $classes, true ) ) {
                $classes[] = $class_name;
            }
        }

        $form['cssClass'] = implode( ' ', $classes );

        return $form;
    }

    private function visualWorkflow() {
        if ( null === $this->visual_workflow ) {
            $this->visual_workflow = SettingsLifecycleWorkflow::forWordPress();
        }

        return $this->visual_workflow;
    }

    private function setSettingsFieldError( $field, $message ) {
        if ( is_object( $field ) && method_exists( $field, 'set_error' ) ) {
            $field->set_error( $message );
        }
    }
}
