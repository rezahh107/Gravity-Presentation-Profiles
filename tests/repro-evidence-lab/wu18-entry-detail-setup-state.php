<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\GravityForms\SupportBundleBuilder;

if ( ! function_exists( 'gpp_wu18_entry_detail_setup_state' ) ) {
    function gpp_wu18_entry_detail_setup_state( $label ) {
        $artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
        if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_string( $label ) || 1 !== preg_match( '/^[a-z0-9_-]+$/', $label ) ) {
            throw new RuntimeException( 'WU18 setup-state capture requires bounded artifact directory and label.' );
        }

        $requested_form_id = getenv( 'WU18_SETUP_FORM_ID' );
        $form_id = is_string( $requested_form_id ) && ctype_digit( $requested_form_id ) && (int) $requested_form_id > 0
            ? (int) $requested_form_id
            : 0;

        if ( $form_id <= 0 ) {
            $base = get_option( 'gpp_wu21_fixture_manifest' );
            if ( ! is_array( $base ) || empty( $base['forms'][0]['form_id'] ) ) {
                throw new RuntimeException( 'WU18 setup-state capture requires WU21 fixtures or an explicit setup form ID.' );
            }
            $form_id = (int) $base['forms'][0]['form_id'];
        }

        $operations = OperationsSetupService::forWordPress();
        $context = $operations->bindingContext( $form_id );

        $bindings = new BindingSetLifecycle(
            new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
            new EvidenceReferenceGate( array() )
        );
        $binding_activation = $bindings->resolve( $context );
        $workflow_status = null;
        if ( is_array( $binding_activation ) ) {
            $snapshot = $bindings->snapshot();
            $id = $binding_activation['binding_set_id'];
            $version = $binding_activation['binding_set_version'];
            if ( ! empty( $snapshot['installed'][ $id ][ $version ]['artifact'] ) ) {
                $binding_artifact = $snapshot['installed'][ $id ][ $version ]['artifact'];
                foreach ( $binding_artifact['bindings'] as $binding ) {
                    if ( 'workflow.status' === $binding['semantic_slot_key'] ) {
                        $workflow_status = $binding;
                        break;
                    }
                }
            }
        }

        $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
        $active_profiles = array();
        foreach ( array( 'gravity_flow.inbox', 'gravity_flow.entry_detail', 'print.dossier' ) as $surface ) {
            $active_profiles[ $surface ] = $visual->resolve( $surface );
        }

        $support = SupportBundleBuilder::forWordPress()->build();
        $setup_diagnostic = isset( $support['observed']['entry_detail_setup'] ) && is_array( $support['observed']['entry_detail_setup'] )
            ? $support['observed']['entry_detail_setup']
            : null;

        $out = array(
            'schema_version' => '1.0.0',
            'label' => $label,
            'form_id' => $form_id,
            'binding_activation' => $binding_activation,
            'workflow_status' => $workflow_status,
            'active_profiles' => $active_profiles,
            'entry_detail_setup_diagnostic' => $setup_diagnostic,
            'runtime' => isset( $support['observed']['runtime'] ) ? $support['observed']['runtime'] : null,
        );

        wp_mkdir_p( $artifact_dir );
        $file = trailingslashit( $artifact_dir ) . 'wu18-entry-detail-setup-' . $label . '.json';
        file_put_contents( $file, wp_json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
        return $out;
    }
}

$label = getenv( 'WU18_SETUP_STATE_LABEL' );
if ( is_string( $label ) && '' !== $label ) {
    echo wp_json_encode( gpp_wu18_entry_detail_setup_state( $label ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
}
