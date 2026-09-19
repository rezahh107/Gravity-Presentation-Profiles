<?php

namespace GravityPresentationProfiles\GravityForms;

use GravityPresentationProfiles\Core\Diagnostics\RuntimeIncidentStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;

final class SupportBundleBuilder {
    const SCHEMA_VERSION = '1.1.0';

    private $binding_health;
    private $incidents;
    private $visual;
    private $entry_detail_setup;

    public function __construct(
        BindingHealthService $binding_health,
        RuntimeIncidentStore $incidents,
        VisualPackageLifecycle $visual,
        EntryDetailSetupDiagnosticStore $entry_detail_setup = null
    ) {
        $this->binding_health = $binding_health;
        $this->incidents = $incidents;
        $this->visual = $visual;
        $this->entry_detail_setup = $entry_detail_setup;
    }

    public static function forWordPress() {
        return new self(
            BindingHealthService::forWordPress(),
            RuntimeIncidentStore::forWordPress(),
            new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) ),
            EntryDetailSetupDiagnosticStore::forWordPress()
        );
    }

    public function build() {
        $unknown = array();
        $binding_health = null;
        $diagnostics = null;
        $profiles = array();
        $entry_detail_setup = array( 'attempted' => false );

        try {
            $binding_health = $this->binding_health->diagnosticFacts();
        } catch ( \Throwable $exception ) {
            $unknown[] = 'binding_health_unavailable';
        }
        try {
            $diagnostics = $this->sanitizedDiagnostics( $this->incidents->snapshot() );
        } catch ( \Throwable $exception ) {
            $unknown[] = 'runtime_diagnostics_unavailable';
        }
        try {
            $profiles = $this->activeProfiles( $this->visual->snapshot(), $unknown );
        } catch ( \Throwable $exception ) {
            $unknown[] = 'active_profile_identity_unavailable';
        }
        if ( null !== $this->entry_detail_setup ) {
            try {
                $setup_state = $this->entry_detail_setup->snapshot();
                if ( ! empty( $setup_state['latest_attempt'] ) && is_array( $setup_state['latest_attempt'] ) ) {
                    $entry_detail_setup = $setup_state['latest_attempt'];
                }
            } catch ( \Throwable $exception ) {
                $unknown[] = 'entry_detail_setup_diagnostic_unavailable';
            }
        }

        $runtime = $this->runtimeFacts( $unknown );

        return array(
            'schema_version' => self::SCHEMA_VERSION,
            'bundle_type' => 'gpp.support_bundle',
            'generated_at_utc' => gmdate( 'c' ),
            'observed' => array(
                'gpp' => array(
                    'plugin' => 'Gravity Presentation Profiles',
                    'version' => $this->gppVersion( $unknown ),
                ),
                'runtime' => $runtime,
                'active_profiles' => $profiles,
                'binding_health' => $binding_health,
                'diagnostics' => $diagnostics,
                'entry_detail_setup' => $entry_detail_setup,
            ),
            'unknown_or_unproven' => array_values( array_unique( $unknown ) ),
            'privacy_boundary' => array(
                'submitted_entry_values' => 'OMITTED',
                'uploaded_file_names_and_contents' => 'OMITTED',
                'cookies_tokens_credentials_headers' => 'OMITTED',
                'absolute_server_paths' => 'OMITTED',
                'exception_messages_and_stack_arguments' => 'OMITTED',
            ),
        );
    }

    public function json() {
        $flags = JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
        return function_exists( 'wp_json_encode' ) ? wp_json_encode( $this->build(), $flags ) : json_encode( $this->build(), $flags );
    }

    private function activeProfiles( $state, &$unknown ) {
        $result = array();
        if ( ! is_array( $state ) || ! isset( $state['activations'], $state['installed'] ) ) {
            $unknown[] = 'active_profile_identity_unavailable';
            return $result;
        }
        foreach ( $state['activations'] as $surface => $activation ) {
            if ( ! isset( $activation['package_id'], $activation['package_version'], $activation['profile_id'] ) ) {
                $unknown[] = 'active_profile_identity_incomplete';
                continue;
            }
            $id = $activation['package_id'];
            $version = $activation['package_version'];
            $artifact = isset( $state['installed'][ $id ][ $version ]['artifact'] ) ? $state['installed'][ $id ][ $version ]['artifact'] : null;
            $result[] = array(
                'surface' => $surface,
                'package_id' => $id,
                'package_version' => $version,
                'profile_id' => $activation['profile_id'],
                'artifact_type' => is_array( $artifact ) && isset( $artifact['artifact_type'] ) ? $artifact['artifact_type'] : null,
                'schema_version' => is_array( $artifact ) && isset( $artifact['schema_version'] ) ? $artifact['schema_version'] : null,
            );
            if ( null === $artifact ) {
                $unknown[] = 'active_profile_artifact_missing';
            }
        }
        usort( $result, static function ( $a, $b ) { return strcmp( $a['surface'], $b['surface'] ); } );
        return $result;
    }

    private function sanitizedDiagnostics( $state ) {
        if ( ! is_array( $state ) ) {
            return null;
        }
        return array(
            'schema_version' => isset( $state['schema_version'] ) ? $state['schema_version'] : null,
            'recent_incidents' => isset( $state['incidents'] ) && is_array( $state['incidents'] ) ? $state['incidents'] : array(),
            'recent_success' => isset( $state['recent_success'] ) && is_array( $state['recent_success'] ) ? $state['recent_success'] : array(),
        );
    }

    private function runtimeFacts( &$unknown ) {
        $wordpress = function_exists( 'get_bloginfo' ) ? get_bloginfo( 'version' ) : null;
        $gravity_forms = class_exists( 'GFForms' ) && isset( \GFForms::$version ) ? \GFForms::$version : $this->pluginVersionFromFile( 'gravityforms/gravityforms.php' );
        $gravity_flow = defined( 'GRAVITY_FLOW_VERSION' ) ? GRAVITY_FLOW_VERSION : $this->pluginVersionFromFile( 'gravityflow/gravityflow.php' );
        if ( null === $wordpress ) $unknown[] = 'wordpress_version_unavailable';
        if ( null === $gravity_forms ) $unknown[] = 'gravity_forms_version_unavailable';
        if ( null === $gravity_flow ) $unknown[] = 'gravity_flow_version_unavailable';

        return array(
            'wordpress_version' => $wordpress,
            'php_version' => PHP_VERSION,
            'gravity_forms_version' => $gravity_forms,
            'gravity_flow_version' => $gravity_flow,
        );
    }

    private function gppVersion( &$unknown ) {
        if ( defined( 'GPP_PLUGIN_FILE' ) && function_exists( 'get_file_data' ) ) {
            $data = get_file_data( GPP_PLUGIN_FILE, array( 'Version' => 'Version' ) );
            if ( ! empty( $data['Version'] ) ) {
                return $data['Version'];
            }
        }
        $unknown[] = 'gpp_version_unavailable';
        return null;
    }

    private function pluginVersionFromFile( $relative ) {
        if ( ! defined( 'WP_PLUGIN_DIR' ) || ! function_exists( 'get_file_data' ) ) {
            return null;
        }
        $file = trailingslashit( WP_PLUGIN_DIR ) . $relative;
        if ( ! is_readable( $file ) ) {
            return null;
        }
        $data = get_file_data( $file, array( 'Version' => 'Version' ) );
        return ! empty( $data['Version'] ) ? $data['Version'] : null;
    }
}
