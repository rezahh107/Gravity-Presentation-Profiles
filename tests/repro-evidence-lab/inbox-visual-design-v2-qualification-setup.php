<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}

$manifest = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $manifest ) || empty( $manifest['forms'][0] ) || empty( $manifest['entry_records'] ) ) {
    throw new RuntimeException( 'WU21 synthetic fixture must exist before Inbox V2 qualification setup.' );
}

$form_meta = $manifest['forms'][0];
$form_id = (int) $form_meta['form_id'];
$form = GFAPI::get_form( $form_id );
if ( ! is_array( $form ) ) {
    throw new RuntimeException( 'Synthetic Alpha form is unavailable.' );
}

$probe_field_id = 13;
$probe_exists = false;
foreach ( $form['fields'] as $field ) {
    if ( (int) $field->id === $probe_field_id ) {
        $probe_exists = true;
        break;
    }
}
if ( ! $probe_exists ) {
    $form['fields'][] = GF_Fields::create(
        array(
            'id' => $probe_field_id,
            'label' => 'Q1 Rich Probe',
            'type' => 'text',
            'isRequired' => false,
        )
    );
    $updated = GFAPI::update_form( $form );
    if ( is_wp_error( $updated ) || false === $updated ) {
        throw new RuntimeException( is_wp_error( $updated ) ? $updated->get_error_message() : 'Unable to add Q1 Rich Probe field.' );
    }
}

$alpha_entry_ids = array();
foreach ( $manifest['entry_records'] as $record ) {
    if ( (int) $record['form_id'] === $form_id ) {
        $alpha_entry_ids[] = (int) $record['entry_id'];
    }
}
if ( count( $alpha_entry_ids ) < 2 ) {
    throw new RuntimeException( 'Q1 requires at least two synthetic Alpha entries.' );
}

$entry_a = $alpha_entry_ids[0];
$entry_z = $alpha_entry_ids[1];
foreach ( array( $entry_a => 'IVD2_RAW_A', $entry_z => 'IVD2_RAW_Z' ) as $entry_id => $raw ) {
    $result = GFAPI::update_entry_field( (int) $entry_id, $probe_field_id, $raw );
    if ( is_wp_error( $result ) || false === $result ) {
        throw new RuntimeException( is_wp_error( $result ) ? $result->get_error_message() : 'Unable to write Q1 raw probe value.' );
    }
}

$flow = function_exists( 'gravity_flow' ) ? gravity_flow() : null;
$flow_version = is_object( $flow ) && method_exists( $flow, 'get_version' ) ? $flow->get_version() : null;

$config = array(
    'schema_version' => '1.0.0',
    'data_class' => 'SYNTHETIC_NON_PII',
    'q1_enabled' => true,
    'form_id' => $form_id,
    'probe_field_id' => $probe_field_id,
    'entry_a' => $entry_a,
    'entry_z' => $entry_z,
    'raw_values' => array(
        (string) $entry_a => 'IVD2_RAW_A',
        (string) $entry_z => 'IVD2_RAW_Z',
    ),
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => class_exists( 'GFForms' ) ? GFForms::$version : null,
        'gravity_flow' => $flow_version,
    ),
    'mechanism' => array(
        'column_selection' => 'gravityflow_inbox_fields',
        'form_scope' => 'gravityflow_inbox_filter',
        'display_value' => 'gravityflow_inbox_field_value',
        'custom_renderer_registry' => false,
        'mutation_observer' => false,
        'post_render_patch_loop' => false,
    ),
);
update_option( 'gpp_inbox_visual_design_v2_qualification', $config, false );

$readback = array();
foreach ( array( $entry_a, $entry_z ) as $entry_id ) {
    $entry = GFAPI::get_entry( $entry_id );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    $readback[ (string) $entry_id ] = isset( $entry[ (string) $probe_field_id ] ) ? (string) $entry[ (string) $probe_field_id ] : null;
}
$config['raw_readback'] = $readback;

file_put_contents(
    trailingslashit( $artifact_dir ) . 'inbox-visual-design-v2-qualification-setup.json',
    wp_json_encode( $config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . PHP_EOL;
