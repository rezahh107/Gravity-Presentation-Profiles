<?php
/**
 * Test-only real GPP/Gravity Flow fixture, disposable WP installation only.
 * Reuses pinned GPP WU21 product setup and creates enough assigned tasks for paging.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$root = getenv( 'G014_OUTPUT_DIR' );
$original = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! $root || ! is_array( $original ) || empty( $original['forms'][0] ) || empty( $original['frontend_inbox_url'] ) ) {
    throw new RuntimeException( 'Real GPP WU21 product bindings must be installed first.' );
}
if ( '3.1.0' !== (string) GRAVITY_FLOW_VERSION || ! class_exists( 'Gravity_Flow_API' ) ) {
    throw new RuntimeException( 'Authentic licensed Flow 3.1.0 unavailable.' );
}
if ( ! function_exists( 'pgr_gravity_flow_inbox_rtl_status' ) ) {
    throw new RuntimeException( 'Exact-Head PGR status API absent.' );
}
$alpha = $original['forms'][0];
$form_id = (int) $alpha['form_id'];
$operator = (int) $original['operator']['id'];
$api = new Gravity_Flow_API( $form_id );
$seed_entry = GFAPI::get_entry( (int) $original['entry_ids'][0] );
if ( is_wp_error( $seed_entry ) || ! is_array( $seed_entry ) ) {
    throw new RuntimeException( 'GPP synthetic photo seed unavailable.' );
}
$photo = (string) ( $seed_entry[ (string) $alpha['photo_field_id'] ] ?? '' );
if ( '' === $photo ) {
    throw new RuntimeException( 'Synthetic image seed is blank; GPP readiness cannot be established.' );
}
$ids = array();
for ( $i = 0; $i < 22; $i++ ) {
    $unique = 0 === $i ? 'G014UNIQUESEARCH42095' : sprintf( 'G014STUDENT%03d', $i );
    $entry = array(
        'form_id' => $form_id,
        'created_by' => $operator,
        (string) $alpha['first_name_field_id'] => $unique,
        (string) $alpha['last_name_field_id'] => sprintf( 'Synthetic%03d', $i ),
        (string) $alpha['photo_field_id'] => $photo,
        (string) $alpha['national_id_field_id'] => sprintf( 'SYN-G014-%06d', $i ),
        (string) $alpha['grade_group_field_id'] => 'Synthetic Grade',
        (string) $alpha['school_field_id'] => 'Synthetic School',
    );
    $id = GFAPI::add_entry( $entry );
    if ( is_wp_error( $id ) || (int) $id <= 0 ) {
        throw new RuntimeException( 'Cannot create synthetic Gravity Forms Entry.' );
    }
    $api->process_workflow( (int) $id );
    $step = $api->get_current_step( GFAPI::get_entry( (int) $id ) );
    if ( ! $step ) {
        throw new RuntimeException( 'Entry not in a real Gravity Flow workflow step.' );
    }
    $assignees = array_map( static function ( $assignee ) { return $assignee->get_key(); }, $step->get_assignees() );
    if ( ! in_array( 'user_id|' . $operator, $assignees, true ) ) {
        throw new RuntimeException( 'Synthetic entry does not belong to the Inbox operator.' );
    }
    $ids[] = (int) $id;
}
$page_id = wp_insert_post( array(
    'post_type' => 'page',
    'post_status' => 'publish',
    'post_name' => 'g014-synthetic-inbox',
    'post_title' => 'G014 Synthetic Frontend Inbox',
    'post_content' => sprintf( '[gravityflow page="inbox" form="%d" display_filter="true"]', $form_id ),
), true );
if ( is_wp_error( $page_id ) || (int) $page_id <= 0 ) {
    throw new RuntimeException( 'Could not create frontend Inbox with actual shortcode.' );
}
$manifest = array(
    'schema' => 'g014-gpp-fixture-v1',
    'data_class' => 'SYNTHETIC_NON_PII',
    'subject_sha' => getenv( 'SUBJECT_SHA' ),
    'gpp_sha' => getenv( 'GPP_SHA' ),
    'flow_version' => (string) GRAVITY_FLOW_VERSION,
    'operator_login' => 'bootstrap_admin',
    'frontend_url' => get_permalink( (int) $page_id ),
    'admin_url' => admin_url( 'admin.php?page=gravityflow-inbox' ),
    'settings_url' => admin_url( 'admin.php?page=persian-gravityforms-settings' ),
    'marker' => 'G014UNIQUESEARCH42095',
    'marker_entry_id' => $ids[0],
    'extra_ids_count' => count( $ids ),
    'original_gpp_fixture_count' => count( $original['entry_ids'] ),
    'expected_labels' => array( 'نام دانش‌آموز', 'کد ملی', 'مدرسه و پایه', 'تاریخ و ساعت ثبت', 'عملیات' ),
);
wp_mkdir_p( $root );
file_put_contents( trailingslashit( $root ) . 'fixture.json', wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
if ( pgr_gravity_flow_inbox_rtl_status()['requested'] !== 'off' ) {
    throw new RuntimeException( 'Default OFF precondition violated before any UI save.' );
}
echo 'G014_GPP_AUTHENTIC_SYNTHETIC_FIXTURE_PASS entries=' . count( $ids ) . PHP_EOL;
