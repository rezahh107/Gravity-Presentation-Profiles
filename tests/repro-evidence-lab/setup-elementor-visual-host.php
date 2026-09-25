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

if ( 'hello-elementor' !== get_option( 'stylesheet' ) || ! is_plugin_active( 'elementor/elementor.php' ) || ! is_plugin_active( 'elementor-pro/elementor-pro.php' ) || ! is_plugin_active( 'vazir-font-wp/vazir-font-wp.php' ) ) {
	$fail( 'pinned Hello Elementor + Elementor + Elementor Pro + Vazir host is not active.' );
}
$registered_host_companions = array_values(
	array_filter(
		array_keys( get_plugins() ),
		static fn( $plugin ) => str_starts_with( (string) $plugin, 'srwf-host-companion/' )
	)
);
$active_host_companions = array_values(
	array_filter(
		$registered_host_companions,
		static fn( $plugin ) => is_plugin_active( $plugin ) || is_plugin_active_for_network( $plugin )
	)
);
if ( ! empty( $registered_host_companions ) || ! empty( $active_host_companions ) ) {
	$fail( 'SRWF-Host-Companion must remain retired, unregistered, and non-executable in the forward visual runtime.' );
}
if ( count( $page_ids ) !== 2 ) {
	$fail( 'Inbox host pages are unavailable.' );
}
$font_contract_path = $artifact_dir . '/vazir-font-authority.json';
$font_contract = $contract['host_runtime']['vazir_font'] ?? null;
if ( ! is_array( $font_contract ) || ! is_file( $font_contract_path ) ) {
	$fail( 'Vazir font source authority is missing.' );
}
$font_source = json_decode( file_get_contents( $font_contract_path ), true );
if ( ! is_array( $font_source ) || JSON_ERROR_NONE !== json_last_error() ) {
	$fail( 'Vazir font source authority is malformed.' );
}
foreach ( array( 'repository', 'commit', 'plugin_version', 'plugin_file', 'family' ) as $field ) {
	if ( ( $font_source[ $field ] ?? null ) !== ( $font_contract[ $field ] ?? null ) ) {
		$fail( 'Vazir font source identity mismatch: ' . $field . '.' );
	}
}
if ( true !== ( $font_source['system_vazir_absent'] ?? null ) ) {
	$fail( 'Vazir system-font absence proof is missing.' );
}
$font_plugin_file = WP_PLUGIN_DIR . '/vazir-font-wp/vazir-font-wp.php';
$font_plugin = get_file_data( $font_plugin_file, array( 'version' => 'Version' ) );
if ( ( $font_plugin['version'] ?? null ) !== ( $font_contract['plugin_version'] ?? null ) || ! class_exists( 'VazirFontPlugin' ) || ! class_exists( 'VazirFont_Loader' ) ) {
	$fail( 'Vazir plugin runtime identity is invalid.' );
}
$font_options = VazirFontPlugin::get_options();
$selected_weights = VazirFont_Loader::get_instance()->get_selected_weights();
$expected_weights = array_map( 'strval', array_keys( $font_contract['weights'] ?? array() ) );
if ( empty( $font_options['enable_frontend'] ) || $selected_weights !== $expected_weights ) {
	$fail( 'Vazir frontend delivery/weight contract is not active.' );
}
foreach ( $expected_weights as $weight ) {
	$expected_font = $font_contract['weights'][ $weight ] ?? null;
	$actual_font = $font_source['weights'][ $weight ] ?? null;
	if (
		! is_array( $expected_font )
		|| ! is_array( $actual_font )
		|| ( $actual_font['source_path'] ?? null ) !== ( $expected_font['source_path'] ?? null )
		|| ( $actual_font['design_alias'] ?? null ) !== ( $expected_font['design_alias'] ?? null )
		|| ( $actual_font['expected_blob_sha'] ?? null ) !== ( $expected_font['blob_sha'] ?? null )
		|| ( $actual_font['actual_blob_sha'] ?? null ) !== ( $expected_font['blob_sha'] ?? null )
		|| ( $actual_font['staged_blob_sha'] ?? null ) !== ( $expected_font['blob_sha'] ?? null )
	) {
		$fail( 'Vazir font byte identity mismatch for weight ' . $weight . '.' );
	}
}
$font_identity = $font_source;
$font_identity['plugin_active'] = true;
$font_identity['frontend_enabled'] = true;
$font_identity['selected_weights'] = $selected_weights;
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
$fixture_container = $export['content'][0] ?? null;
$fixture_mount_widget = is_array( $fixture_container ) ? ( $fixture_container['elements'][0] ?? null ) : null;
if (
	! is_array( $fixture_container )
	|| 'container' !== ( $fixture_container['elType'] ?? null )
	|| empty( $fixture_container['id'] )
	|| ! is_array( $fixture_mount_widget )
	|| 'widget' !== ( $fixture_mount_widget['elType'] ?? null )
	|| 'shortcode' !== ( $fixture_mount_widget['widgetType'] ?? null )
	|| empty( $fixture_mount_widget['id'] )
	|| ! str_contains( (string) ( $fixture_mount_widget['settings']['shortcode'] ?? '' ), $mount_token )
) {
	$fail( 'Elementor fixture designated Inbox container/mount semantics are malformed.' );
}
$fixture_container_id = (string) $fixture_container['id'];
$fixture_mount_widget_id = (string) $fixture_mount_widget['id'];

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
		'container_element_id'    => $fixture_container_id,
		'mount_element_id'        => $fixture_mount_widget_id,
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
	'vazir_font'                  => $font_identity,
	'gtb'                        => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'capture_scope'              => 'GPP_INBOX_SURFACE_ONLY',
	'composition'                => 'repository-versioned Elementor export/template/site-settings fixture reconstructed for both Inbox page families with one authentic mount point each',
);
file_put_contents( $artifact_dir . '/integrated-visual-host.json', wp_json_encode( $identity, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL );
