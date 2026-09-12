<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$flow_source = getenv( 'WU21_GRAVITYFLOW_SOURCE' );
$repo_root = getenv( 'GITHUB_WORKSPACE' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
$results = array();

function wu21_test( $id, $name, $fn ) {
    global $results;
    try {
        $details = $fn();
        $results[] = array( 'id' => $id, 'name' => $name, 'status' => 'PASS', 'details' => $details );
    } catch ( Throwable $e ) {
        $results[] = array( 'id' => $id, 'name' => $name, 'status' => 'FAIL', 'details' => $e->getMessage() );
    }
}
function wu21_assert( $condition, $message ) {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}
function wu21_entries( $user_id, $extra = array(), &$total = 0 ) {
    $args = array_merge(
        array(
            'filter_key' => 'workflow_user_id_' . (int) $user_id,
            'user_id' => (int) $user_id,
        ),
        $extra
    );
    return Gravity_Flow_API::get_inbox_entries( $args, $total );
}

wu21_test( 'WU21-PHP-001', 'exact runtime plugin versions', function () {
    $gf = get_file_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', array( 'Version' => 'Version' ) );
    $flow = get_file_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', array( 'Version' => 'Version' ) );
    wu21_assert( '3.1.1.1' === $gf['Version'], 'Gravity Forms runtime version mismatch.' );
    wu21_assert( '3.1.0' === $flow['Version'], 'Gravity Flow runtime version mismatch.' );
    return array( 'gravity_forms' => $gf['Version'], 'gravity_flow' => $flow['Version'] );
} );

wu21_test( 'WU21-PHP-002', 'source-backed seam inventory exists in exact package', function () use ( $flow_source ) {
    $task = file_get_contents( $flow_source . '/includes/inbox/models/class-task.php' );
    $api = file_get_contents( $flow_source . '/includes/class-api.php' );
    $page = file_get_contents( $flow_source . '/includes/pages/class-inbox.php' );
    $endpoint = file_get_contents( $flow_source . '/includes/inbox/endpoints/refresh-inbox-items/class-endpoint.php' );
    $js = '';
    foreach ( glob( $flow_source . '/assets/js/dist/common-inbox.*.js' ) as $bundle ) {
        $js .= file_get_contents( $bundle );
    }
    foreach ( array( 'gravityflow_columns_inbox_table', 'gravityflow_inbox_field_value' ) as $needle ) {
        wu21_assert( false !== strpos( $task, $needle ), 'Missing task seam: ' . $needle );
    }
    foreach ( array( 'get_inbox_entries', 'get_inbox_search_criteria', 'get_inbox_paging', 'get_inbox_sorting', 'get_current_step' ) as $needle ) {
        wu21_assert( false !== strpos( $api, $needle ), 'Missing API seam: ' . $needle );
    }
    wu21_assert( false !== strpos( $page, 'gflow-inbox gflow-grid gflow-common' ), 'Native Inbox wrapper not found.' );
    wu21_assert( false !== strpos( $page, 'data-js="gflow-inbox"' ), 'Native Inbox grid target not found.' );
    foreach ( array( "'add'", "'remove'", "'update'" ) as $needle ) {
        wu21_assert( false !== strpos( $endpoint, $needle ), 'Refresh transaction member absent: ' . $needle );
    }
    foreach ( array( 'gflow-inbox-search', 'setQuickFilter', 'inbox/changes', 'applyTransaction' ) as $needle ) {
        wu21_assert( false !== strpos( $js, $needle ), 'Native grid JavaScript seam absent: ' . $needle );
    }
    return 'Exact Gravity Flow 3.1.0 package contains every tested seam.';
} );

wu21_test( 'WU21-PHP-003', 'shared Inbox visual profile remains surface-only', function () use ( $repo_root ) {
    $package = json_decode( file_get_contents( $repo_root . '/tests/fixtures/wu09-visual-package.json' ), true );
    $resolver = new \GravityPresentationProfiles\Core\Portable\VisualProfileResolver( $package );
    $profile = $resolver->resolve( 'gravity_flow.inbox' );
    wu21_assert( 'shared.inbox.v1' === $profile['profile_id'], 'Unexpected Inbox profile.' );
    $thrown = false;
    try {
        $resolver->resolve( 'gravity_flow.inbox', array( 'form_id' => 999 ) );
    } catch ( Throwable $e ) {
        $thrown = true;
    }
    wu21_assert( $thrown, 'Environment context was allowed to influence visual profile resolution.' );
    return $profile['profile_id'];
} );

wu21_test( 'WU21-PHP-004', 'native Inbox assignment contains all 25 synthetic tasks across two forms', function () use ( $manifest ) {
    $total = 0;
    $entries = wu21_entries( $manifest['operator']['id'], array( 'paging' => array( 'page_size' => 100 ) ), $total );
    $forms = array_values( array_unique( array_map( function ( $e ) { return (int) $e['form_id']; }, $entries ) ) );
    sort( $forms );
    $expected = array( (int) $manifest['forms'][0]['form_id'], (int) $manifest['forms'][1]['form_id'] );
    sort( $expected );
    wu21_assert( 25 === $total, 'Expected 25 operator tasks; got ' . $total );
    wu21_assert( $expected === $forms, 'Inbox tasks did not span both fixture forms.' );
    return array( 'total' => $total, 'forms' => $forms );
} );

wu21_test( 'WU21-PHP-005', 'native assignment and authorization are not broadened', function () use ( $manifest ) {
    $operator_total = 0;
    wu21_entries( $manifest['operator']['id'], array( 'paging' => array( 'page_size' => 100 ) ), $operator_total );
    $viewer_total = 0;
    wu21_entries( $manifest['viewer']['id'], array( 'paging' => array( 'page_size' => 100 ) ), $viewer_total );
    wu21_assert( 25 === $operator_total, 'Operator task count mismatch.' );
    wu21_assert( 0 === $viewer_total, 'Unassigned viewer received Inbox tasks.' );
    return array( 'operator' => $operator_total, 'viewer' => $viewer_total );
} );

wu21_test( 'WU21-PHP-006', 'adapter columns are bounded and optional School/Due remain omitted', function () {
    $columns = apply_filters( 'gravityflow_columns_inbox_table', array(), array() );
    foreach ( array( 'gpp_wu21_student_name', 'gpp_wu21_student_photo', 'gpp_wu21_current_step', 'gpp_wu21_created_at' ) as $column ) {
        wu21_assert( isset( $columns[ $column ] ), 'Missing adapter column ' . $column );
    }
    wu21_assert( ! isset( $columns['gpp_wu21_school'] ), 'School must remain omitted.' );
    wu21_assert( ! isset( $columns['gpp_wu21_due_at'] ), 'Due must remain omitted.' );
    return array_keys( $columns );
} );

wu21_test( 'WU21-PHP-007', 'per-form semantic name resolution uses each originating form binding', function () use ( $manifest ) {
    foreach ( $manifest['forms'] as $form ) {
        $record = null;
        foreach ( $manifest['entry_records'] as $candidate ) {
            if ( (int) $candidate['form_id'] === (int) $form['form_id'] ) { $record = $candidate; break; }
        }
        $entry = GFAPI::get_entry( $record['entry_id'] );
        $value = apply_filters( 'gravityflow_inbox_field_value', '', (int) $form['form_id'], 'gpp_wu21_student_name', $entry );
        wu21_assert( $record['student_name'] === $value, 'Name binding failed for form ' . $form['form_id'] );
    }
    return 'Alpha field 1 and Beta field 7 resolved independently.';
} );

wu21_test( 'WU21-PHP-008', 'photo binding fails closed without cross-form fallback', function () use ( $manifest ) {
    $alpha = $manifest['entry_records'][0];
    $beta = $manifest['entry_records'][1];
    $alpha_entry = GFAPI::get_entry( $alpha['entry_id'] );
    $beta_entry = GFAPI::get_entry( $beta['entry_id'] );
    $alpha_value = apply_filters( 'gravityflow_inbox_field_value', '', (int) $alpha['form_id'], 'gpp_wu21_student_photo', $alpha_entry );
    $beta_value = apply_filters( 'gravityflow_inbox_field_value', '', (int) $beta['form_id'], 'gpp_wu21_student_photo', $beta_entry );
    wu21_assert( '' !== $alpha_value, 'Alpha proven photo did not resolve.' );
    wu21_assert( '' === $beta_value, 'Beta NOT_PROVEN photo did not fail closed.' );
    wu21_assert( ! empty( $beta_entry['9'] ), 'Negative control invalid: Beta host value should exist while binding remains NOT_PROVEN.' );
    return array( 'alpha_resolved' => true, 'beta_failed_closed' => true );
} );

wu21_test( 'WU21-PHP-009', 'current-step and created-at extraction execute through proven bindings', function () use ( $manifest ) {
    $record = $manifest['entry_records'][0];
    $entry = GFAPI::get_entry( $record['entry_id'] );
    $step = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], 'gpp_wu21_current_step', $entry );
    $created = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], 'gpp_wu21_created_at', $entry );
    wu21_assert( $record['step_name'] === $step, 'Current-step extraction mismatch.' );
    wu21_assert( $record['date_created'] === $created, 'Created-at extraction mismatch.' );
    return array( 'step' => $step, 'created_at' => $created );
} );

wu21_test( 'WU21-PHP-010', 'native Inbox form filtering is host-owned', function () use ( $manifest ) {
    $form_id = (int) $manifest['forms'][0]['form_id'];
    $total = 0;
    $entries = wu21_entries( $manifest['operator']['id'], array( 'form_id' => $form_id, 'paging' => array( 'page_size' => 100 ) ), $total );
    wu21_assert( $total > 0 && $total < 25, 'Filtered total is not bounded to one form.' );
    foreach ( $entries as $entry ) {
        wu21_assert( $form_id === (int) $entry['form_id'], 'Native form filter leaked another form.' );
    }
    return array( 'form_id' => $form_id, 'count' => $total );
} );

wu21_test( 'WU21-PHP-011', 'native Inbox sorting criteria execute through Gravity Flow API', function () use ( $manifest ) {
    $total = 0;
    $asc = wu21_entries( $manifest['operator']['id'], array( 'sorting' => array( 'key' => 'date_created', 'direction' => 'ASC' ), 'paging' => array( 'page_size' => 100 ) ), $total );
    $desc = wu21_entries( $manifest['operator']['id'], array( 'sorting' => array( 'key' => 'date_created', 'direction' => 'DESC' ), 'paging' => array( 'page_size' => 100 ) ), $total );
    wu21_assert( $asc[0]['date_created'] < $asc[count( $asc ) - 1]['date_created'], 'Ascending sort did not order dates.' );
    wu21_assert( $desc[0]['date_created'] > $desc[count( $desc ) - 1]['date_created'], 'Descending sort did not order dates.' );
    return array( 'asc_first' => $asc[0]['date_created'], 'desc_first' => $desc[0]['date_created'] );
} );

wu21_test( 'WU21-PHP-012', 'native Inbox API paging obeys explicit page size and offset', function () use ( $manifest ) {
    $total = 0;
    $first = wu21_entries( $manifest['operator']['id'], array( 'sorting' => array( 'key' => 'date_created', 'direction' => 'ASC' ), 'paging' => array( 'page_size' => 5, 'offset' => 0 ) ), $total );
    $second = wu21_entries( $manifest['operator']['id'], array( 'sorting' => array( 'key' => 'date_created', 'direction' => 'ASC' ), 'paging' => array( 'page_size' => 5, 'offset' => 5 ) ), $total );
    wu21_assert( 5 === count( $first ) && 5 === count( $second ), 'Paging did not return expected page size.' );
    wu21_assert( (int) $first[0]['id'] !== (int) $second[0]['id'], 'Paging offset did not advance.' );
    return array( 'total' => $total, 'page_size' => 5 );
} );

wu21_test( 'WU21-PHP-013', 'native task navigation retains Gravity Flow Entry Details route', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    $container = Gravity_Flow::get_instance()->container();
    $model = $container->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
    $tasks = $model->get_inbox_tasks( array() );
    wu21_assert( ! empty( $tasks ), 'No native Inbox tasks returned.' );
    $url = $tasks[0]['url_entry'];
    wu21_assert( false !== strpos( $url, 'admin.php?page=gravityflow-inbox&view=entry' ), 'Native Entry Details route changed.' );
    wu21_assert( false !== strpos( $url, '&id=' ) && false !== strpos( $url, '&lid=' ), 'Native route lacks form/entry identity.' );
    return $url;
} );

wu21_test( 'WU21-PHP-014', 'native Inbox render emits the repository-evidenced wrapper and grid target', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    ob_start();
    Gravity_Flow_Inbox::display( array() );
    $html = ob_get_clean();
    wu21_assert( false !== strpos( $html, 'gflow-inbox gflow-grid gflow-common' ), 'Native wrapper absent.' );
    wu21_assert( false !== strpos( $html, 'data-js="gflow-inbox"' ), 'Native grid target absent.' );
    return 'Native Gravity_Flow_Inbox::display markup rendered.';
} );

wu21_test( 'WU21-PHP-015', 'native refresh endpoint and grid transaction mechanics are source-backed', function () use ( $flow_source ) {
    $endpoint = file_get_contents( $flow_source . '/includes/inbox/endpoints/refresh-inbox-items/class-endpoint.php' );
    $js = '';
    foreach ( glob( $flow_source . '/assets/js/dist/common-inbox.*.js' ) as $path ) { $js .= file_get_contents( $path ); }
    foreach ( array( "'add'", "'remove'", "'update'" ) as $needle ) { wu21_assert( false !== strpos( $endpoint, $needle ), 'Endpoint lacks ' . $needle ); }
    wu21_assert( false !== strpos( $js, 'applyTransaction' ) && false !== strpos( $js, 'inbox/changes' ), 'Native refresh transaction JavaScript absent.' );
    return 'Browser test WU21-BROWSER-005 performs the live add/remove poll proof.';
} );

wu21_test( 'WU21-PHP-016', 'lab adapter introduces no replacement host state path', function () use ( $repo_root ) {
    $source = file_get_contents( $repo_root . '/tests/repro-evidence-lab/wu21-lab-plugin.php' );
    foreach ( array( 'register_rest_route', 'CREATE TABLE', 'wp_schedule_event', 'setQuickFilter(', 'applyTransaction(' ) as $forbidden ) {
        wu21_assert( false === stripos( $source, $forbidden ), 'Lab adapter contains forbidden replacement primitive: ' . $forbidden );
    }
    return 'Adapter is two source-backed filters plus read-only host API extraction.';
} );

wu21_test( 'WU21-PHP-017', 'fixtures are synthetic/non-PII only', function () use ( $manifest ) {
    wu21_assert( 'SYNTHETIC_NON_PII' === $manifest['data_class'], 'Fixture data class mismatch.' );
    wu21_assert( 'example.invalid' === $manifest['operator']['email_domain'] && 'example.invalid' === $manifest['viewer']['email_domain'], 'Synthetic email domain mismatch.' );
    foreach ( $manifest['entry_records'] as $record ) {
        wu21_assert( 0 === strpos( $record['student_name'], 'WU21 ' ), 'Unexpected non-synthetic name.' );
    }
    return array( 'entry_count' => count( $manifest['entry_records'] ), 'email_domain' => 'example.invalid' );
} );

$out = array( 'suite' => 'WU21 PHP/runtime', 'results' => $results );
file_put_contents( $artifact_dir . '/php-results.json', json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n" );
$failed = array_filter( $results, function ( $r ) { return 'PASS' !== $r['status']; } );
foreach ( $results as $result ) {
    echo $result['status'] . ' ' . $result['id'] . ' ' . $result['name'] . "\n";
}
if ( $failed ) {
    exit( 1 );
}
