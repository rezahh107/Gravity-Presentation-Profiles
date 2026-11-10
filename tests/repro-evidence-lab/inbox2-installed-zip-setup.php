<?php
/** Disposable WU21 installed-ZIP smoke setup; only existing synthetic host fixtures. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
$assert = static function ( $value, $reason ) {
    if ( ! $value ) { throw new RuntimeException( 'INBOX2_ZIP_SMOKE_' . $reason ); }
};
$assert( is_array( $manifest ) && isset( $manifest['forms'][0]['form_id'],
    $manifest['operator']['id'], $manifest['viewer']['id'], $manifest['frontend_inbox_page_id'] ), 'HOST_SETUP_MISSING' );
$plugin_root = WP_PLUGIN_DIR . '/gravity-presentation-profiles';
$assert( is_dir( $plugin_root ) && ! is_link( $plugin_root )
    && is_file( $plugin_root . '/src/SRWF/GravityFlow/Inbox2Shortcode.php' )
    && ! file_exists( $plugin_root . '/tests/qualification-custom-inbox/usability-mu.php' ), 'NOT_REAL_ZIP_INSTALL' );
$header = get_file_data( $plugin_root . '/gravity-presentation-profiles.php', array( 'version' => 'Version' ) );
$assert( '9999.0.0' === $header['version'] && defined( 'GRAVITY_FLOW_VERSION' )
    && '3.1.0' === GRAVITY_FLOW_VERSION && shortcode_exists( 'gpp_inbox_2' ), 'BOOTSTRAP_OR_HOST_UNSUPPORTED' );
$assert( ! file_exists( WPMU_PLUGIN_DIR . '/wu21-lab-plugin.php' ), 'TEST_MU_PLUGIN_STILL_PRESENT' );
$form_id = (int) $manifest['forms'][0]['form_id'];
// The shared WU21 fixture distributes 25 entries across two forms. Add only
// the missing Alpha entries for this installed-ZIP pagination test, then remove
// them in the smoke wrapper's EXIT trap so later WU21 checks see their baseline.
$extra_key = 'gpp_wu21_inbox2_extra_ids';
$assert( false === get_option( $extra_key, false ), 'LEFTOVER_EXTRA_ENTRIES' );
$alpha = $manifest['forms'][0];
$baseline_alpha = count( array_filter( $manifest['entry_records'], static function ( $record ) use ( $form_id ) {
    return (int) ( $record['form_id'] ?? 0 ) === $form_id;
} ) );
$assert( $baseline_alpha > 0 && $baseline_alpha < 25, 'BASELINE_COUNT_UNEXPECTED' );
$extra = array( 'form_id' => $form_id, 'ids' => array() );
update_option( $extra_key, $extra, false );
for ( $index = $baseline_alpha; $index < 25; ++$index ) {
    $entry = array(
        'form_id' => $form_id,
        'created_by' => (int) $manifest['operator']['id'],
        (string) $alpha['first_name_field_id'] => 'WU21 Alpha',
        (string) $alpha['last_name_field_id'] => sprintf( 'Paging %02d', $index ),
        (string) $alpha['national_id_field_id'] => sprintf( 'SYN-PAGING-%06d', $index ),
        (string) $alpha['grade_group_field_id'] => 'پایه آزمایشی صفحه‌بندی',
        (string) $alpha['school_field_id'] => 'مدرسهٔ ساختگی WU21',
    );
    $id = GFAPI::add_entry( $entry );
    $assert( ! is_wp_error( $id ) && (int) $id > 0, 'EXTRA_ENTRY_CREATION' );
    $extra['ids'][] = (int) $id;
    update_option( $extra_key, $extra, false );
    $created = gmdate( 'Y-m-d H:i:s', strtotime( '2026-01-02 00:00:00 UTC' ) + $index * 60 );
    $update_result = GFAPI::update_entry_property( (int) $id, 'date_created', $created );
    $stored = GFAPI::get_entry( (int) $id );
    $assert( false !== $update_result && ! is_wp_error( $update_result )
        && is_array( $stored ) && (string) ( $stored['date_created'] ?? '' ) === $created,
        'EXTRA_ENTRY_TIMESTAMP' );
    $api = new Gravity_Flow_API( $form_id );
    $api->process_workflow( (int) $id );
    $assert( (bool) $api->get_current_step( GFAPI::get_entry( (int) $id ) ), 'EXTRA_ENTRY_WORKFLOW' );
}
$native_page = (int) $manifest['frontend_inbox_page_id'];
$operator = (int) $manifest['operator']['id'];
$assert( is_array( GFAPI::get_form( $form_id ) ) && get_post( $native_page ), 'NATIVE_FORM_OR_PAGE_MISSING' );
wp_set_current_user( $operator );
$contract = \GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation::initialGeometryContract( array( 'form_id' => $form_id ) );
$assert( is_array( $contract ) && count( $contract['column_ids'] ?? array() ) === 5, 'EXISTING_BINDING_UNQUALIFIED' );
$args = apply_filters( 'gravityflow_inbox_args', array_merge( Gravity_Flow_Inbox::get_defaults(), array(
    'form_id' => $form_id, 'paging' => array( 'offset' => 0, 'page_size' => 2001 ),
) ) );
$total = 0;
$native = Gravity_Flow_API::get_inbox_entries( $args, $total );
$assert( is_array( $native ) && count( $native ) >= 25 && (int) $total <= 2000,
    'NATIVE_AUTHORIZED_PAGING_TASKS_MISSING' );
$ordered = $native;
usort( $ordered, static function ( $a, $b ) {
    $date = strcmp( (string) ( $a['date_created'] ?? '' ), (string) ( $b['date_created'] ?? '' ) );
    return 0 !== $date ? $date : ( (int) $a['id'] <=> (int) $b['id'] );
} );
$expected_fifo_ids = array_map( 'intval', array_column( $ordered, 'id' ) );
$ids = array_map( 'intval', array_column( $native, 'id' ) );
sort( $ids, SORT_NUMERIC );
// Independent direct Native Task Model oracle for the exact final cell texts.
// No Entry field reads and no GPP Inbox2Shortcode private helper is invoked.
$model = gravity_flow()->container()->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
$task_args = array(
    'form_id' => $form_id,
    'paging' => array( 'offset' => 0, 'page_size' => 2001 ),
    'is_shortcode' => true,
    'context_key' => '',
    'detail_base_url' => add_query_arg( array( 'page' => 'gravityflow-inbox', 'view' => 'entry' ), get_permalink( $native_page ) ),
);
$defs = $model->get_table_header_defs( $task_args );
$task_rows = $model->get_inbox_tasks( $task_args );
$assert( is_array( $defs ) && is_array( $task_rows ) && count( $task_rows ) === count( $ids ), 'NATIVE_TASK_ORACLE_INCOMPLETE' );
$semantic_columns = array(
    'student_name' => $contract['column_ids'][1],
    'national_id' => $contract['column_ids'][2],
    'school_grade' => $contract['column_ids'][3],
);
$display_keys = array();
foreach ( $semantic_columns as $semantic => $column_id ) {
    foreach ( $defs as $def ) {
        if ( (string) ( $def['field'] ?? '' ) === (string) $column_id
            && is_string( $def['displayKey'] ?? null ) ) {
            $display_keys[ $semantic ] = $def['displayKey'];
            break;
        }
    }
    $assert( isset( $display_keys[ $semantic ] ), 'NATIVE_DISPLAY_MAPPING_MISSING' );
}
$expected_cells = array();
foreach ( $task_rows as $task ) {
    $assert( is_array( $task ) && isset( $task['id'] ) &&
        ( is_string( $task['id'] ) || is_int( $task['id'] ) ) &&
        ctype_digit( (string) $task['id'] ), 'NATIVE_TASK_ID_INVALID' );
    $id = (int) $task['id'];
    $assert( in_array( $id, $ids, true ) && ! isset( $expected_cells[ (string) $id ] ), 'NATIVE_TASK_ID_MISMATCH' );
    foreach ( $display_keys as $semantic => $key ) {
        $assert( array_key_exists( $key, $task ) &&
            ( is_string( $task[ $key ] ) || is_numeric( $task[ $key ] ) ), 'NATIVE_DISPLAY_CELL_MISSING' );
        $raw = (string) $task[ $key ];
        $assert( ! preg_match( '/<[a-z\\/!][\\s\\S]*>/i', $raw ), 'NATIVE_CELL_NOT_PLAIN_TEXT' );
        $expected_cells[ (string) $id ][ $semantic ] = html_entity_decode( $raw, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
    }
}
$assert( count( $expected_cells ) === count( $ids ), 'NATIVE_FINAL_CELL_ORACLE_SET_MISMATCH' );
$page_id = wp_insert_post( array(
    'post_title' => 'Installed GPP Inbox 2 ZIP smoke',
    'post_status' => 'publish', 'post_type' => 'page',
    'post_content' => '[gpp_inbox_2 form="' . $form_id . '" native_page="' . $native_page . '"]',
), true );
$assert( ! is_wp_error( $page_id ) && (int) $page_id > 0, 'SHORTCODE_PAGE_NOT_CREATED' );
// Exercise two real shortcode renderings on one independently published page.
$multi_page = wp_insert_post( array(
    'post_title' => 'Installed Inbox 2 repeated-shortcode smoke',
    'post_status' => 'publish', 'post_type' => 'page',
    'post_content' => '[gpp_inbox_2 form="' . $form_id . '" native_page="' . $native_page . '"]' .
        "\n" . '[gpp_inbox_2 form="' . $form_id . '" native_page="' . $native_page . '"]',
), true );
$assert( ! is_wp_error( $multi_page ) && (int) $multi_page > 0, 'MULTI_SHORTCODE_PAGE_NOT_CREATED' );
$fixture = array(
    'status' => 'SETUP_PASS', 'version' => $header['version'],
    'url' => get_permalink( (int) $page_id ), 'multi_url' => get_permalink( (int) $multi_page ), 'page_id' => (int) $page_id,
    'form_id' => $form_id, 'native_page_id' => $native_page,
    'operator_id' => $operator, 'viewer_id' => (int) $manifest['viewer']['id'],
    'expected_native_ids' => $ids, 'expected_fifo_ids' => $expected_fifo_ids,
    'expected_count' => count( $ids ), 'added_synthetic_count' => count( $extra['ids'] ),
    'expected_final_cells' => $expected_cells,
);
$assert( false !== file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/gpp-inbox2-installed-fixture.json',
    wp_json_encode( $fixture, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) ), 'EVIDENCE_WRITE_FAILED' );
echo "GPP_INBOX2_INSTALLED_ZIP_SETUP_PASS\n";
