<?php
/** Reconstruct the deterministic versioned Elementor host fixture for Inbox-only visual diagnostics. */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$repo_root    = realpath( __DIR__ . '/../..' );
$contract     = json_decode( file_get_contents( $repo_root . '/tests/visual-regression/inbox-visual-contract.json' ), true );
$fixture_ref  = $contract['host_runtime']['fixture'] ?? null;
$fixture      = json_decode( file_get_contents( $artifact_dir . '/fixture-manifest.json' ), true );
$p06          = get_option( 'gpp_p06_fixture_manifest' );
$page_bindings = array(
	'frontend_shortcode' => (int) ( $fixture['frontend_inbox_page_id'] ?? 0 ),
	'frontend_block'     => (int) ( $p06['authentic_block_page']['page_id'] ?? 0 ),
);
$page_ids = array_values( array_filter( $page_bindings ) );

$fail = static function ( $message ) {
	throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: ' . $message );
};

if ( 'hello-elementor' !== get_option( 'stylesheet' ) || ! is_plugin_active( 'elementor/elementor.php' ) || ! is_plugin_active( 'elementor-pro/elementor-pro.php' ) ) {
	$fail( 'pinned Hello Elementor + Elementor + Elementor Pro host is not active.' );
}
$companion_file = WP_PLUGIN_DIR . '/srwf-host-companion/srwf-host-companion.php';
if ( is_plugin_active( 'srwf-host-companion/srwf-host-companion.php' ) || is_file( $companion_file ) ) {
	$fail( 'SRWF-Host-Companion must remain retired and unregistered in the forward visual runtime.' );
}
if ( count( $page_ids ) !== 2 ) {
	$fail( 'Inbox host pages are unavailable.' );
}
if ( ! is_array( $fixture_ref ) || empty( $fixture_ref['path'] ) || empty( $fixture_ref['sha256'] ) ) {
	$fail( 'versioned Elementor host fixture contract is missing.' );
}
$fixture_path = realpath( $repo_root . '/' . $fixture_ref['path'] );
if ( ! $fixture_path || ! is_file( $fixture_path ) || ! str_starts_with( $fixture_path, $repo_root . DIRECTORY_SEPARATOR ) ) {
	$fail( 'versioned Elementor host fixture is missing.' );
}
$fixture_sha = hash_file( 'sha256', $fixture_path );
if ( ! hash_equals( (string) $fixture_ref['sha256'], $fixture_sha ) ) {
	$fail( 'versioned Elementor host fixture SHA-256 mismatch.' );
}
$host_fixture = json_decode( file_get_contents( $fixture_path ), true );
if ( ! is_array( $host_fixture ) || JSON_ERROR_NONE !== json_last_error() ) {
	$fail( 'versioned Elementor host fixture is malformed.' );
}
foreach ( array( 'fixture_id', 'classification', 'schema_version' ) as $field ) {
	if ( ( $host_fixture[ $field ] ?? null ) !== ( $fixture_ref[ $field ] ?? null ) ) {
		$fail( 'versioned Elementor host fixture identity mismatch: ' . $field . '.' );
	}
}
if ( 'ELEMENTOR_EXPORT_RECONSTRUCTION' !== ( $fixture_ref['import_mode'] ?? null ) ) {
	$fail( 'unsupported Elementor host fixture import mode.' );
}
$export = $host_fixture['elementor_export'] ?? null;
$site_settings = $host_fixture['site_settings']['active_kit_page_settings'] ?? null;
$mount_token = $host_fixture['mount']['token'] ?? null;
if ( ! is_array( $export ) || ! is_array( $export['content'] ?? null ) || ! is_array( $export['page_settings'] ?? null ) || ! is_array( $site_settings ) || ! is_string( $mount_token ) || '' === $mount_token ) {
	$fail( 'Elementor export/template/site-settings fixture is incomplete.' );
}
if ( ( $export['page_settings']['template'] ?? null ) !== $contract['host_runtime']['page_template'] || 'wp-page' !== ( $export['document_type'] ?? null ) ) {
	$fail( 'Elementor fixture page/document type does not match the runtime contract.' );
}
if ( 'shortcode' !== ( $host_fixture['mount']['widget_type'] ?? null ) ) {
	$fail( 'Elementor fixture mount widget identity is invalid.' );
}

$replace_mount = static function ( $value, $token, $replacement, &$count ) use ( &$replace_mount ) {
	if ( is_array( $value ) ) {
		foreach ( $value as $key => $child ) {
			$value[ $key ] = $replace_mount( $child, $token, $replacement, $count );
		}
		return $value;
	}
	if ( is_string( $value ) && str_contains( $value, $token ) ) {
		$count += substr_count( $value, $token );
		return str_replace( $token, $replacement, $value );
	}
	return $value;
};

$kit_id = (int) get_option( 'elementor_active_kit' );
if ( $kit_id <= 0 || ! get_post( $kit_id ) ) {
	$fail( 'Elementor active kit is unavailable for site-settings reconstruction.' );
}
update_post_meta( $kit_id, '_elementor_page_settings', $site_settings );
if ( get_post_meta( $kit_id, '_elementor_page_settings', true ) !== $site_settings ) {
	$fail( 'Elementor site-settings reconstruction did not persist exactly.' );
}

foreach ( $page_bindings as $family => $page_id ) {
	$count = 0;
	$elementor_data = $replace_mount(
		$export['content'],
		$mount_token,
		sprintf( '[gpp_wu21_elementor_inbox page_id="%d"]', $page_id ),
		$count
	);
	if ( 1 !== $count ) {
		$fail( 'Elementor host fixture must expose exactly one Inbox mount point for ' . $family . '.' );
	}
	$page_settings = $export['page_settings'];
	unset( $page_settings['template'] );
	update_post_meta( $page_id, '_wp_page_template', $contract['host_runtime']['page_template'] );
	update_post_meta( $page_id, '_elementor_edit_mode', 'builder' );
	update_post_meta( $page_id, '_elementor_template_type', $export['document_type'] );
	update_post_meta( $page_id, '_elementor_version', getenv( 'WU21_ELEMENTOR_VERSION' ) );
	update_post_meta( $page_id, '_elementor_page_settings', $page_settings );
	update_post_meta( $page_id, '_elementor_data', wp_slash( wp_json_encode( $elementor_data ) ) );
	delete_post_meta( $page_id, '_elementor_css' );
	if ( $contract['host_runtime']['page_template'] !== get_page_template_slug( $page_id ) ) {
		$fail( 'Elementor fixture page template was not applied.' );
	}
	$stored_data = json_decode( get_post_meta( $page_id, '_elementor_data', true ), true );
	if ( $stored_data !== $elementor_data ) {
		$fail( 'Elementor fixture composition did not persist exactly.' );
	}
	$document = \Elementor\Plugin::$instance->documents->get( $page_id );
	if ( ! $document || ! $document->is_built_with_elementor() || empty( $document->get_elements_data() ) ) {
		$fail( 'Elementor does not recognize the reconstructed host page.' );
	}
}

$theme         = wp_get_theme();
$elementor     = get_file_data( WP_PLUGIN_DIR . '/elementor/elementor.php', array( 'version' => 'Version' ) );
$elementor_pro = get_file_data( WP_PLUGIN_DIR . '/elementor-pro/elementor-pro.php', array( 'version' => 'Version' ) );
$identity      = array(
	'classification'             => 'INTEGRATED_SRWF_VISUAL_HOST',
	'composition_authority'      => 'VERSIONED_ELEMENTOR_HOST_FIXTURE',
	'host_fixture'               => array(
		'path'                    => $fixture_ref['path'],
		'fixture_id'              => $host_fixture['fixture_id'],
		'classification'          => $host_fixture['classification'],
		'schema_version'          => $host_fixture['schema_version'],
		'import_mode'             => $fixture_ref['import_mode'],
		'expected_sha256'         => $fixture_ref['sha256'],
		'actual_sha256'           => $fixture_sha,
		'elementor_export_type'   => $export['type'],
		'elementor_document_type' => $export['document_type'],
		'page_bindings'           => $page_bindings,
		'active_kit_id'           => $kit_id,
	),
	'hello_elementor'            => array( 'version' => $theme->get( 'Version' ), 'commit' => getenv( 'WU21_HELLO_COMMIT' ), 'expected_package_sha256' => getenv( 'WU21_HELLO_SHA256' ), 'actual_package_sha256' => getenv( 'WU21_HELLO_ACTUAL_SHA256' ) ),
	'elementor'                  => array( 'version' => $elementor['version'], 'expected_package_sha256' => getenv( 'WU21_ELEMENTOR_SHA256' ), 'actual_package_sha256' => getenv( 'WU21_ELEMENTOR_ACTUAL_SHA256' ) ),
	'elementor_pro'              => array( 'version' => $elementor_pro['version'], 'classification' => 'OWNER_SUPPLIED_MODIFIED_PACKAGE', 'expected_package_sha256' => getenv( 'WU21_ELEMENTOR_PRO_SHA256' ), 'actual_package_sha256' => getenv( 'WU21_ELEMENTOR_PRO_ACTUAL_SHA256' ) ),
	'page_template'              => $contract['host_runtime']['page_template'],
	'elementor_recognized'       => true,
	'page_ids'                   => $page_ids,
	'srwf_host_companion_active' => false,
	'srwf_host_companion_registered' => false,
	'persian_gravity'            => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'vazir_vazirmatn'            => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'gtb'                        => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'capture_scope'              => 'GPP_INBOX_SURFACE_ONLY',
	'composition'                => 'repository-versioned Elementor export/template/site-settings fixture reconstructed for both Inbox page families with one authentic mount point each',
);
file_put_contents( $artifact_dir . '/integrated-visual-host.json', wp_json_encode( $identity, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL );
