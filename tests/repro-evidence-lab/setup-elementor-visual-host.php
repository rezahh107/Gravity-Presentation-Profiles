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
	update_post_meta( $page_id, '_wp_page_template', 'elementor_canvas' );
	if ( 'elementor_canvas' !== get_page_template_slug( $page_id ) ) {
		throw new RuntimeException( 'VISUAL_TEST_INFRASTRUCTURE_FAILURE: Elementor Canvas was not applied.' );
	}
}

$theme     = wp_get_theme();
$elementor = get_file_data( WP_PLUGIN_DIR . '/elementor/elementor.php', array( 'version' => 'Version' ) );
$identity  = array(
	'classification'              => 'INTEGRATED_SRWF_VISUAL_HOST',
	'hello_elementor'             => array( 'version' => $theme->get( 'Version' ), 'commit' => getenv( 'WU21_HELLO_COMMIT' ), 'package_sha256' => getenv( 'WU21_HELLO_SHA256' ) ),
	'elementor'                   => array( 'version' => $elementor['version'], 'package_sha256' => getenv( 'WU21_ELEMENTOR_SHA256' ) ),
	'page_template'               => 'elementor_canvas',
	'page_ids'                    => array_values( $page_ids ),
	'srwf_host_companion_active'  => false,
	'persian_gravity'             => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'vazir_vazirmatn'             => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'gtb'                         => array( 'status' => 'NOT_ADMITTED_FOR_THIS_WU21_INBOX_FIXTURE' ),
	'composition'                 => 'neutral Elementor Canvas using the native WordPress content pipeline; no Inbox components are recreated by Elementor',
);
file_put_contents( $artifact_dir . '/integrated-visual-host.json', wp_json_encode( $identity, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL );
