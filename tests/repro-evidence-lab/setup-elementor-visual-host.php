<?php
/** Configure the neutral, supported Elementor Canvas host for visual diagnostics. */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$fixture      = json_decode( file_get_contents( $artifact_dir . '/fixture-manifest.json' ), true );
$p06          = get_option( 'gpp_p06_fixture_manifest' );
$page_ids     = array_filter( array( $fixture['frontend_inbox_page_id'] ?? 0, $p06['authentic_block_page']['id'] ?? 0 ) );

if ( 'hello-elementor' !== get_option( 'stylesheet' ) || ! is_plugin_active( 'elementor/elementor.php' ) ) {
	throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: pinned Hello Elementor + Elementor host is not active.' );
}
if ( is_plugin_active( 'srwf-host-companion/srwf-host-companion.php' ) ) {
	throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: SRWF-Host-Companion must not be required by the forward visual host.' );
}
if ( count( $page_ids ) !== 2 ) {
	throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: Inbox host pages are unavailable.' );
}
foreach ( $page_ids as $page_id ) {
	$container_id = substr( hash( 'sha256', 'gpp-wu21-elementor-container-' . $page_id ), 0, 8 );
	$widget_id    = substr( hash( 'sha256', 'gpp-wu21-elementor-widget-' . $page_id ), 0, 8 );
	$elementor_data = array(
		array(
			'id'       => $container_id,
			'elType'   => 'container',
			'settings' => array( 'content_width' => 'full' ),
			'elements' => array(
				array(
					'id'         => $widget_id,
					'elType'     => 'widget',
					'widgetType' => 'shortcode',
					'settings'   => array( 'shortcode' => sprintf( '[gpp_wu21_elementor_inbox page_id="%d"]', $page_id ) ),
					'elements'   => array(),
				),
			),
		),
	);
	update_post_meta( $page_id, '_wp_page_template', 'elementor_canvas' );
	update_post_meta( $page_id, '_elementor_edit_mode', 'builder' );
	update_post_meta( $page_id, '_elementor_template_type', 'wp-page' );
	update_post_meta( $page_id, '_elementor_version', getenv( 'WU21_ELEMENTOR_VERSION' ) );
	update_post_meta( $page_id, '_elementor_data', wp_slash( wp_json_encode( $elementor_data ) ) );
	if ( 'elementor_canvas' !== get_page_template_slug( $page_id ) ) {
		throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: Elementor Canvas was not applied.' );
	}
	$document = \Elementor\Plugin::$instance->documents->get( $page_id );
	if ( ! $document || ! $document->is_built_with_elementor() || empty( $document->get_elements_data() ) ) {
		throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: Elementor does not recognize the neutral host page.' );
	}
}

$theme     = wp_get_theme();
$elementor = get_file_data( WP_PLUGIN_DIR . '/elementor/elementor.php', array( 'version' => 'Version' ) );
$identity  = array(
	'classification'              => 'INTEGRATED_SRWF_VISUAL_HOST',
	'hello_elementor'             => array( 'version' => $theme->get( 'Version' ), 'commit' => getenv( 'WU21_HELLO_COMMIT' ), 'expected_package_sha256' => getenv( 'WU21_HELLO_SHA256' ), 'actual_package_sha256' => getenv( 'WU21_HELLO_ACTUAL_SHA256' ) ),
	'elementor'                   => array( 'version' => $elementor['version'], 'expected_package_sha256' => getenv( 'WU21_ELEMENTOR_SHA256' ), 'actual_package_sha256' => getenv( 'WU21_ELEMENTOR_ACTUAL_SHA256' ) ),
	'page_template'               => 'elementor_canvas',
	'elementor_recognized'        => true,
	'page_ids'                    => array_values( $page_ids ),
	'srwf_host_companion_active'  => false,
	'persian_gravity'             => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'vazir_vazirmatn'             => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'gtb'                         => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'composition'                 => 'neutral Elementor Canvas/container/shortcode widget rendering the existing fixture content; no Inbox components are recreated by Elementor',
);
file_put_contents( $artifact_dir . '/integrated-visual-host.json', wp_json_encode( $identity, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL );
