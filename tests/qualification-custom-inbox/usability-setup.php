<?php
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
if ( ! get_option( 'ciq_gate_b_passed' ) || ! get_option( 'cellq_gate_b_passed' ) ) {
    throw new RuntimeException( 'Inherited authentic qualification must pass before usability page' );
}
$id = wp_insert_post( array(
    'post_title' => 'Inbox 2 — Usability Prototype',
    'post_status' => 'publish', 'post_type' => 'page',
    'post_name' => 'inbox2-usability',
    'post_content' => '[ciq2_usability_inbox]',
), true );
if ( is_wp_error( $id ) ) { throw new RuntimeException( 'Cannot create experimental page' ); }
update_option( 'ciq2_page_id', (int) $id, false );
$data = get_option( 'cellq_fixture', array() );
$data['custom_url'] = get_permalink( $id );
$data['head'] = getenv( 'GPP_WU21_REPOSITORY_SHA' );
file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq2-browser-fixture.json',
    wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
echo "CIQ2_USABILITY_PAGE_READY\n";
// Validate the exact pristine Officer fixture before comparative workflow transitions.
require_once __DIR__ . '/host-adapter-headless.php';
