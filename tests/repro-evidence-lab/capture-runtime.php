<?php
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
global $wpdb;
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$repo = getenv( 'GITHUB_WORKSPACE' );
$config_path = $repo . '/tests/repro-evidence-lab/lab-config.json';
$workflow_path = $repo . '/.github/workflows/wu21-repro-evidence-lab.yml';
$gf_zip = getenv( 'WU21_GF_ZIP' );
$flow_zip = getenv( 'WU21_FLOW_ZIP' );
$gf = get_file_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', array( 'Version' => 'Version' ) );
$flow = get_file_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', array( 'Version' => 'Version' ) );
$runtime = array(
    'captured_at_utc' => gmdate( 'c' ),
    'wordpress' => array( 'version' => get_bloginfo( 'version' ) ),
    'php' => array( 'version' => PHP_VERSION ),
    'database' => array( 'reported_version' => $wpdb->db_version() ),
    'plugins' => array(
        'gravity_forms' => array( 'runtime_version' => $gf['Version'], 'zip_sha256' => hash_file( 'sha256', $gf_zip ), 'zip_size_bytes' => filesize( $gf_zip ) ),
        'gravity_flow' => array( 'runtime_version' => $flow['Version'], 'zip_sha256' => hash_file( 'sha256', $flow_zip ), 'zip_size_bytes' => filesize( $flow_zip ) ),
    ),
    'repository' => array(
        'full_name' => getenv( 'GITHUB_REPOSITORY' ),
        'commit_sha' => getenv( 'GPP_WU21_REPOSITORY_SHA' ),
    ),
    'workflow' => array(
        'path' => '.github/workflows/wu21-repro-evidence-lab.yml',
        'definition_sha256' => hash_file( 'sha256', $workflow_path ),
        'run_id' => getenv( 'GITHUB_RUN_ID' ),
        'run_attempt' => getenv( 'GITHUB_RUN_ATTEMPT' ),
        'event_name' => getenv( 'GITHUB_EVENT_NAME' ),
        'ref' => getenv( 'GITHUB_REF' ),
        'server_url' => getenv( 'GITHUB_SERVER_URL' ),
    ),
    'configuration' => array(
        'path' => 'tests/repro-evidence-lab/lab-config.json',
        'sha256' => hash_file( 'sha256', $config_path ),
    ),
);
file_put_contents( $artifact_dir . '/runtime.json', json_encode( $runtime, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
echo json_encode( $runtime, JSON_UNESCAPED_SLASHES ) . "\n";
