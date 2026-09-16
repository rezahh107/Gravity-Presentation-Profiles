<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\Core\Portable\EnvironmentBindingSet;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\BoundHostValueReader;
use GravityPresentationProfiles\SRWF\GravityFlow\OperationsBindingManagementPolicy;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationModel;

$artifact_dir = getenv( 'GPP_BEHAVIOR_ARTIFACT_DIR' );
$command      = getenv( 'GPP_BEHAVIOR_STATE_COMMAND' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_string( $command ) || '' === $command ) {
    fwrite( STDERR, "GPP_BEHAVIOR_ARTIFACT_DIR and GPP_BEHAVIOR_STATE_COMMAND are required.\n" );
    exit( 1 );
}
$fixture_path = $artifact_dir . '/behavioral-host-fixture.json';
$fixture      = json_decode( (string) file_get_contents( $fixture_path ), true );
if ( ! is_array( $fixture ) ) {
    throw new RuntimeException( 'Behavioral host fixture manifest is unavailable.' );
}

$visual = new VisualPackageLifecycle(
    new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME )
);
$bindings = new BindingSetLifecycle(
    new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ),
    new EvidenceReferenceGate( array() )
);
$setup   = OperationsSetupService::forWordPress();
$form_id = (int) $fixture['form_id'];
$context = $setup->bindingContext( $form_id );
$key     = $bindings->contextKey( $context );

$visual_snapshot  = $visual->snapshot();
$binding_snapshot = $bindings->snapshot();
$activation       = $bindings->resolve( $context );
$artifact         = null;
if ( is_array( $activation ) ) {
    $id       = $activation['binding_set_id'];
    $version  = $activation['binding_set_version'];
    $artifact = isset( $binding_snapshot['installed'][ $id ][ $version ]['artifact'] )
        ? $binding_snapshot['installed'][ $id ][ $version ]['artifact']
        : null;
}

$binding_by_slot = array();
$binding_kinds   = array();
$claims_by_slot  = array();
if ( is_array( $artifact ) ) {
    foreach ( $artifact['bindings'] as $binding ) {
        $slot                     = $binding['semantic_slot_key'];
        $binding_by_slot[ $slot ] = $binding;
        $binding_kinds[ $slot ]   = OperationsBindingManagementPolicy::kind( $slot );
    }
    foreach ( $artifact['runtime_claims'] as $claim ) {
        if ( ! isset( $claims_by_slot[ $claim['semantic_slot_key'] ] ) ) {
            $claims_by_slot[ $claim['semantic_slot_key'] ] = array();
        }
        $claims_by_slot[ $claim['semantic_slot_key'] ][] = $claim;
    }
}
ksort( $binding_kinds );

$print_activation = $visual->resolve( 'print.dossier' );
$inbox_activation = $visual->resolve( 'gravity_flow.inbox' );
$entry_activation = $visual->resolve( 'gravity_flow.entry_detail' );
$package_record    = isset( $visual_snapshot['installed']['srwf.operations.presentation']['1.0.0'] )
    ? $visual_snapshot['installed']['srwf.operations.presentation']['1.0.0']
    : null;
$semantic_catalogue_keys = array();
if ( is_array( $package_record ) && isset( $package_record['artifact']['semantic_slots'] ) ) {
    foreach ( $package_record['artifact']['semantic_slots'] as $slot ) {
        if ( isset( $slot['semantic_slot_key'] ) ) {
            $semantic_catalogue_keys[] = $slot['semantic_slot_key'];
        }
    }
    sort( $semantic_catalogue_keys );
}

$installed_artifact_hashes = array();
if ( is_array( $activation ) && isset( $binding_snapshot['installed'][ $activation['binding_set_id'] ] ) ) {
    foreach ( $binding_snapshot['installed'][ $activation['binding_set_id'] ] as $version => $record ) {
        if ( isset( $record['artifact'] ) && is_array( $record['artifact'] ) ) {
            $installed_artifact_hashes[ (string) $version ] = EnvironmentBindingSet::contentHash( $record['artifact'] );
        }
    }
}
ksort( $installed_artifact_hashes );
$gf_plugin   = function_exists( 'get_file_data' ) ? get_file_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', array( 'Version' => 'Version' ) ) : array();
$flow_plugin = function_exists( 'get_file_data' ) ? get_file_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', array( 'Version' => 'Version' ) ) : array();
$gpp_plugin  = defined( 'GPP_PLUGIN_FILE' ) && function_exists( 'get_file_data' ) ? get_file_data( GPP_PLUGIN_FILE, array( 'Version' => 'Version' ) ) : array();

$state = array(
    'command' => $command,
    'plugin' => array(
        'gpp_plugin_file' => defined( 'GPP_PLUGIN_FILE' ) ? GPP_PLUGIN_FILE : null,
        'gpp_plugin_realpath' => defined( 'GPP_PLUGIN_FILE' ) ? realpath( GPP_PLUGIN_FILE ) : null,
        'gpp_plugin_dir_is_link' => defined( 'GPP_PLUGIN_FILE' ) ? is_link( dirname( GPP_PLUGIN_FILE ) ) : null,
        'addon_file' => ( new ReflectionClass( 'GravityPresentationProfiles\\GravityForms\\AddOn' ) )->getFileName(),
        'wordpress_version' => get_bloginfo( 'version' ),
        'gpp_version' => isset( $gpp_plugin['Version'] ) ? $gpp_plugin['Version'] : null,
        'gravity_forms_version' => isset( $gf_plugin['Version'] ) ? $gf_plugin['Version'] : null,
        'gravity_flow_version' => isset( $flow_plugin['Version'] ) ? $flow_plugin['Version'] : null,
    ),
    'form_id' => $form_id,
    'entry_id' => (int) $fixture['entry_id'],
    'context_key' => $key,
    'visual' => array(
        'revision' => isset( $visual_snapshot['revision'] ) ? $visual_snapshot['revision'] : 0,
        'operations_package_installed' => is_array( $package_record ),
        'print_activation' => $print_activation,
        'inbox_activation' => $inbox_activation,
        'entry_detail_activation' => $entry_activation,
        'semantic_catalogue_keys' => $semantic_catalogue_keys,
    ),
    'binding' => array(
        'revision' => isset( $binding_snapshot['revision'] ) ? $binding_snapshot['revision'] : 0,
        'activation' => $activation,
        'artifact_hash' => is_array( $artifact ) ? EnvironmentBindingSet::contentHash( $artifact ) : null,
        'artifact' => $artifact,
        'installed_artifact_hashes' => $installed_artifact_hashes,
        'student_first_name' => isset( $binding_by_slot['student.first_name'] ) ? $binding_by_slot['student.first_name'] : null,
        'semantic_count' => count( $binding_by_slot ),
        'management_kinds' => $binding_kinds,
        'runtime_claims' => $claims_by_slot,
    ),
);

if ( 'runtime' === $command ) {
    if ( ! is_array( $package_record ) || ! is_array( $artifact ) ) {
        throw new RuntimeException( 'Runtime resolution requires product-created package and binding state.' );
    }
    $profile = $visual->effectiveProfile( 'print.dossier' );
    $entry   = GFAPI::get_entry( (int) $fixture['entry_id'] );
    $form    = GFAPI::get_form( $form_id );
    if ( ! is_array( $profile ) || ! is_array( $entry ) || ! is_array( $form ) ) {
        throw new RuntimeException( 'Real persisted runtime inputs are unavailable.' );
    }
    $model    = new PrintDossierPresentationModel( $profile, array( $artifact ), $package_record['artifact']['semantic_slots'] );
    $resolved = $model->resolve( $entry, 'student.first_name' );
    $decision = $model->fieldDecision( $entry, 'student.first_name' );
    $value    = null;
    if ( ! empty( $decision['populate'] ) ) {
        $value = ( new BoundHostValueReader() )->readDisplay( $decision['source_ref'], $form, $entry );
    }
    $state['runtime'] = array(
        'print_profile_id' => isset( $profile['profile_id'] ) ? $profile['profile_id'] : null,
        'binding_context_status' => $model->bindingContextStatus( $entry ),
        'student_first_name_resolution' => $resolved,
        'student_first_name_decision' => $decision,
        'student_first_name_value' => $value,
    );
}

$output = wp_json_encode( $state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
if ( false === $output ) {
    throw new RuntimeException( 'Behavioral state could not be encoded.' );
}
echo $output . PHP_EOL;
