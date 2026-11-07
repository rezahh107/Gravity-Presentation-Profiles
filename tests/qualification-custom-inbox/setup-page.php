<?php
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
if ( ! get_option( 'ciq_gate_b_passed' ) ) { throw new RuntimeException( 'Gate B did not pass' ); }
$id = wp_insert_post( array( 'post_title' => 'اینباکس مستقل آزمایشی', 'post_status' => 'publish',
    'post_type' => 'page', 'post_name' => 'ciq-readonly', 'post_content' => '[ciq_readonly_inbox]' ), true );
if ( is_wp_error( $id ) ) { throw new RuntimeException( 'Cannot create test page' ); }
update_option( 'ciq_page_id', (int) $id, false );
$data = get_option( 'ciq_fixture' );
$data['custom_url'] = get_permalink( $id );
$data['native_url'] = get_option( 'ciq_native_url' );
$data['head'] = getenv( 'GPP_WU21_REPOSITORY_SHA' );
file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/ciq-browser-fixture.json', wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
echo "CIQ_READONLY_PAGE_CREATED_AFTER_GATE_B\n";
