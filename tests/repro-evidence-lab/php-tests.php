<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxRuntimeEvidence;

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$flow_source = getenv( 'WU21_GRAVITYFLOW_SOURCE' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
$GLOBALS['wu21_results'] = array();

function wu21_test( $id, $name, $fn ) {
    try {
        $details = $fn();
        $GLOBALS['wu21_results'][] = array( 'id' => $id, 'name' => $name, 'status' => 'PASS', 'details' => $details );
    } catch ( Throwable $e ) {
        $GLOBALS['wu21_results'][] = array( 'id' => $id, 'name' => $name, 'status' => 'FAIL', 'details' => $e->getMessage() );
    }
}
function wu21_assert( $condition, $message ) {
    if ( ! $condition ) throw new RuntimeException( $message );
}
function wu21_entries( $user_id, $extra = array(), &$total = 0 ) {
    $args = array_merge( array( 'filter_key' => 'workflow_user_id_' . (int) $user_id, 'user_id' => (int) $user_id ), $extra );
    return Gravity_Flow_API::get_inbox_entries( $args, $total );
}
function wu21_active_bindings() {
    $lifecycle = new BindingSetLifecycle( new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ), new EvidenceReferenceGate( array() ) );
    $snapshot = $lifecycle->snapshot();
    $active = array();
    foreach ( $snapshot['activations'] as $context_key => $identity ) {
        $id = $identity['binding_set_id'];
        $version = $identity['binding_set_version'];
        if ( isset( $snapshot['installed'][ $id ][ $version ]['artifact'] ) && $snapshot['installed'][ $id ][ $version ]['context_key'] === $context_key ) {
            $active[] = $snapshot['installed'][ $id ][ $version ]['artifact'];
        }
    }
    return $active;
}
function wu21_binding_for_form( $form_id ) {
    foreach ( wu21_active_bindings() as $artifact ) {
        if ( (int) $artifact['context']['form_source_ref']['form_id'] === (int) $form_id ) return $artifact;
    }
    throw new RuntimeException( 'Active product binding for form not found.' );
}
function wu21_record_for_form( $manifest, $form_id ) {
    foreach ( $manifest['entry_records'] as $record ) {
        if ( (int) $record['form_id'] === (int) $form_id ) return $record;
    }
    throw new RuntimeException( 'Fixture record for form not found.' );
}

wu21_test( 'WU21-PHP-001', 'exact runtime plugin versions', function () {
    $gf = get_file_data( WP_PLUGIN_DIR . '/gravityforms/gravityforms.php', array( 'Version' => 'Version' ) );
    $flow = get_file_data( WP_PLUGIN_DIR . '/gravityflow/gravityflow.php', array( 'Version' => 'Version' ) );
    wu21_assert( '3.1.1.1' === $gf['Version'], 'Gravity Forms runtime version mismatch.' );
    wu21_assert( '3.1.0' === $flow['Version'], 'Gravity Flow runtime version mismatch.' );
    return array( 'gravity_forms' => $gf['Version'], 'gravity_flow' => $flow['Version'] );
} );

wu21_test( 'WU21-PHP-002', 'source-backed native Inbox and frontend shortcode seams exist in exact Gravity Flow 3.1.0 package', function () use ( $flow_source ) {
    $task = file_get_contents( $flow_source . '/includes/inbox/models/class-task.php' );
    $api = file_get_contents( $flow_source . '/includes/class-api.php' );
    $page = file_get_contents( $flow_source . '/includes/pages/class-inbox.php' );
    $endpoint = file_get_contents( $flow_source . '/includes/inbox/endpoints/refresh-inbox-items/class-endpoint.php' );
    $gravity_flow = file_get_contents( $flow_source . '/class-gravity-flow.php' );
    $js = '';
    foreach ( glob( $flow_source . '/assets/js/dist/common-inbox.*.js' ) as $bundle ) $js .= file_get_contents( $bundle );
    foreach ( array( 'gravityflow_columns_inbox_table', 'gravityflow_inbox_field_value' ) as $needle ) wu21_assert( false !== strpos( $task, $needle ), 'Missing task seam: ' . $needle );
    foreach ( array( 'get_inbox_entries', 'get_inbox_search_criteria', 'get_inbox_paging', 'get_inbox_sorting', 'get_current_step' ) as $needle ) wu21_assert( false !== strpos( $api, $needle ), 'Missing API seam: ' . $needle );
    wu21_assert( false !== strpos( $page, 'gflow-inbox gflow-grid gflow-common' ) && false !== strpos( $page, 'data-js="gflow-inbox"' ), 'Native Inbox DOM markers not found.' );
    wu21_assert( false !== strpos( $gravity_flow, 'gravityflow_shortcode_' ), 'Gravity Flow shortcode render filter family missing.' );
    foreach ( array( "'add'", "'remove'", "'update'" ) as $needle ) wu21_assert( false !== strpos( $endpoint, $needle ), 'Refresh transaction member absent: ' . $needle );
    foreach ( array( 'gflow-inbox-search', 'setQuickFilter', 'inbox/changes', 'applyTransaction' ) as $needle ) wu21_assert( false !== strpos( $js, $needle ), 'Native grid JavaScript seam absent: ' . $needle );
    return 'Exact Gravity Flow 3.1.0 package contains every PR4 host seam exercised by GPP.';
} );

wu21_test( 'WU21-PHP-003', 'explicit product setup owns one surface-scoped Operations Inbox activation with optional Due', function () {
    $visual = new VisualPackageLifecycle( new WordPressOptionStateStore( VisualPackageLifecycle::OPTION_NAME ) );
    $activation = $visual->resolve( 'gravity_flow.inbox' );
    $profile = $visual->effectiveProfile( 'gravity_flow.inbox' );
    $snapshot = $visual->snapshot();
    wu21_assert( is_array( $activation ), 'Inbox profile was not explicitly activated by product setup.' );
    wu21_assert( 'srwf.operations.presentation' === $activation['package_id'], 'Wrong Operations Package identity.' );
    wu21_assert( '1.0.1' === $activation['package_version'], 'Wrong due-optional Operations Package version.' );
    wu21_assert( 'srwf.operations.inbox.v1' === $activation['profile_id'] && 'gravity_flow.inbox' === $profile['surface'], 'Visual identity is not surface-scoped Inbox.' );
    $package = $snapshot['installed'][ $activation['package_id'] ][ $activation['package_version'] ]['artifact'];
    $due = null;
    foreach ( $package['semantic_slots'] as $slot ) if ( 'workflow.due_at' === $slot['semantic_slot_key'] ) foreach ( $slot['surface_usage'] as $usage ) if ( 'gravity_flow.inbox' === $usage['surface'] ) $due = $usage['required'];
    wu21_assert( false === $due, 'workflow.due_at is still mandatory in active Inbox contract.' );
    return $activation;
} );

wu21_test( 'WU21-PHP-004', 'native Inbox assignment contains all 25 synthetic tasks across two forms', function () use ( $manifest ) {
    $total = 0;
    $entries = wu21_entries( $manifest['operator']['id'], array( 'paging' => array( 'page_size' => 100 ) ), $total );
    $forms = array_values( array_unique( array_map( static function ( $e ) { return (int) $e['form_id']; }, $entries ) ) );
    sort( $forms );
    $expected = array( (int) $manifest['forms'][0]['form_id'], (int) $manifest['forms'][1]['form_id'] );
    sort( $expected );
    wu21_assert( 25 === $total, 'Expected 25 operator tasks; got ' . $total );
    wu21_assert( $expected === $forms, 'Inbox tasks did not span both fixture forms.' );
    return array( 'total' => $total, 'forms' => $forms );
} );

wu21_test( 'WU21-PHP-005', 'native Gravity Flow assignment and authorization are not broadened', function () use ( $manifest ) {
    $operator_total = 0; wu21_entries( $manifest['operator']['id'], array( 'paging' => array( 'page_size' => 100 ) ), $operator_total );
    $viewer_total = 0; wu21_entries( $manifest['viewer']['id'], array( 'paging' => array( 'page_size' => 100 ) ), $viewer_total );
    wu21_assert( 25 === $operator_total, 'Operator task count mismatch.' );
    wu21_assert( 0 === $viewer_total, 'Unassigned viewer received Inbox tasks.' );
    foreach ( wu21_active_bindings() as $artifact ) foreach ( $artifact['runtime_claims'] as $claim ) wu21_assert( 'authorization' !== $claim['claim'], 'Configuration proof contains an authorization claim.' );
    return array( 'operator' => $operator_total, 'viewer' => $viewer_total );
} );

wu21_test( 'WU21-PHP-006', 'production adapter inserts one bounded card column while preserving native columns', function () {
    $input = array( 'id' => 'Entry ID', 'date_created' => 'Date Created', 'workflow_step' => 'Step' );
    $columns = apply_filters( 'gravityflow_columns_inbox_table', $input, array() );
    foreach ( array_keys( $input ) as $column ) wu21_assert( isset( $columns[ $column ] ), 'Production adapter removed host column ' . $column );
    wu21_assert( isset( $columns[ InboxPresentationAdapter::CARD_COLUMN ] ), 'Production GPP card column missing.' );
    return array_keys( $columns );
} );

wu21_test( 'WU21-PHP-007', 'derived full name and mapped field semantics render from each real host form', function () use ( $manifest ) {
    $observed = array();
    foreach ( $manifest['forms'] as $form ) {
        $record = wu21_record_for_form( $manifest, $form['form_id'] );
        $entry = GFAPI::get_entry( $record['entry_id'] );
        wu21_assert( ! is_wp_error( $entry ), 'Entry unavailable.' );
        $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $form['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
        wu21_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--ready' ), 'Mapped row is not ready.' );
        foreach ( array( $record['student_name'], $record['grade_group'], $record['school'] ) as $value ) wu21_assert( false !== strpos( $html, esc_html( $value ) ), 'Mapped/derived value missing from production card: ' . $value );
        $observed[] = array( 'form_id' => (int) $form['form_id'], 'name' => $record['student_name'] );
    }
    return $observed;
} );

wu21_test( 'WU21-PHP-008', 'runtime availability proof is bound to exact active source and binding version', function () use ( $manifest ) {
    $required = array( 'student.photo', 'student.first_name', 'student.last_name', 'student.national_id', 'education.grade_group', 'school.name', 'entry.created_at', 'workflow.current_step' );
    $out = array();
    foreach ( $manifest['forms'] as $form ) {
        $artifact = wu21_binding_for_form( $form['form_id'] );
        $bindings = array(); foreach ( $artifact['bindings'] as $binding ) $bindings[ $binding['semantic_slot_key'] ] = $binding;
        $claims = array(); foreach ( $artifact['runtime_claims'] as $claim ) $claims[ $claim['semantic_slot_key'] . '|' . $claim['claim'] ] = $claim;
        foreach ( $required as $slot ) {
            $key = $slot . '|availability';
            wu21_assert( isset( $claims[ $key ] ) && 'PROVEN' === $claims[ $key ]['evidence_state'], 'Missing availability proof for ' . $slot );
            $expected = InboxRuntimeEvidence::availabilityRef( $artifact, $slot, $bindings[ $slot ]['source_ref'] );
            wu21_assert( in_array( $expected, $claims[ $key ]['evidence_refs'], true ), 'Availability evidence does not match exact source/version: ' . $slot );
        }
        wu21_assert( 'UNBOUND' === $bindings['student.full_name']['state'] && null === $bindings['student.full_name']['source_ref'], 'Derived full name acquired duplicate binding.' );
        wu21_assert( 'UNBOUND' === $bindings['workflow.due_at']['state'] && ! isset( $claims['workflow.due_at|availability'] ), 'Optional Due was fabricated/proven.' );
        $out[] = array( 'form_id' => (int) $form['form_id'], 'binding_version' => $artifact['binding_set_version'] );
    }
    return $out;
} );

wu21_test( 'WU21-PHP-009', 'current-step and created-at extraction use authentic Gravity Flow/GF host state', function () use ( $manifest ) {
    $record = $manifest['entry_records'][0];
    $entry = GFAPI::get_entry( $record['entry_id'] );
    wu21_assert( ! is_wp_error( $entry ) && $entry['date_created'] === $record['date_created'], 'Authoritative date_created mismatch.' );
    $api = new Gravity_Flow_API( (int) $record['form_id'] );
    $step = $api->get_current_step( $entry );
    wu21_assert( $step && $step->get_name() === $record['step_name'], 'Authoritative current step mismatch.' );
    $html = apply_filters( 'gravityflow_inbox_field_value', '', (int) $record['form_id'], InboxPresentationAdapter::CARD_COLUMN, $entry );
    wu21_assert( false !== strpos( $html, esc_html( $record['step_name'] ) ), 'Production card did not display current host step.' );
    wu21_assert( false !== strpos( $html, '۱۴۰۴/۱۰/۱۱، ۰۰:۰۰' ), 'Production card did not present authentic created-at value.' );
    return array( 'step' => $step->get_name(), 'created_at' => $entry['date_created'] );
} );

wu21_test( 'WU21-PHP-010', 'native Inbox form filtering remains host-owned', function () use ( $manifest ) {
    $form_id = (int) $manifest['forms'][0]['form_id']; $total = 0;
    $entries = wu21_entries( $manifest['operator']['id'], array( 'form_id' => $form_id, 'paging' => array( 'page_size' => 100 ) ), $total );
    wu21_assert( $total > 0 && $total < 25, 'Filtered total is not bounded to one form.' );
    foreach ( $entries as $entry ) wu21_assert( $form_id === (int) $entry['form_id'], 'Native form filter leaked another form.' );
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

wu21_test( 'WU21-PHP-013', 'native task navigation retains Gravity Flow Entry Detail route', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    $container = Gravity_Flow::get_instance()->container();
    $model = $container->get( \Gravity_Flow\Gravity_Flow\Inbox\Inbox_Service_Provider::TASK_MODEL );
    $tasks = $model->get_inbox_tasks( array() );
    wu21_assert( ! empty( $tasks ), 'No native Inbox tasks returned.' );
    $url = $tasks[0]['url_entry'];
    wu21_assert( false !== strpos( $url, 'admin.php?page=gravityflow-inbox&view=entry' ) && false !== strpos( $url, '&id=' ) && false !== strpos( $url, '&lid=' ), 'Native Entry Detail route changed.' );
    return $url;
} );

wu21_test( 'WU21-PHP-014', 'native Inbox render emits repository-evidenced wrapper and grid target', function () use ( $manifest ) {
    wp_set_current_user( (int) $manifest['operator']['id'] );
    ob_start(); Gravity_Flow_Inbox::display( array() ); $html = ob_get_clean();
    wu21_assert( false !== strpos( $html, 'gflow-inbox gflow-grid gflow-common' ), 'Native wrapper absent.' );
    wu21_assert( false !== strpos( $html, 'data-js="gflow-inbox"' ), 'Native grid target absent.' );
    return 'Native Gravity_Flow_Inbox::display markup rendered.';
} );

wu21_test( 'WU21-PHP-015', 'native refresh endpoint and grid transaction mechanics remain source-backed', function () use ( $flow_source ) {
    $endpoint = file_get_contents( $flow_source . '/includes/inbox/endpoints/refresh-inbox-items/class-endpoint.php' );
    $js = ''; foreach ( glob( $flow_source . '/assets/js/dist/common-inbox.*.js' ) as $path ) $js .= file_get_contents( $path );
    foreach ( array( "'add'", "'remove'", "'update'" ) as $needle ) wu21_assert( false !== strpos( $endpoint, $needle ), 'Refresh endpoint lost ' . $needle );
    foreach ( array( 'inbox/changes', 'applyTransaction', 'setQuickFilter' ) as $needle ) wu21_assert( false !== strpos( $js, $needle ), 'Native common Inbox JS lost ' . $needle );
    return 'Native polling endpoint and AG Grid transaction/search behavior are present.';
} );

wu21_test( 'WU21-PHP-016', 'missing binding context fails presentation closed without fabricating a card', function () use ( $manifest ) {
    $entry = array( 'id' => 999999, 'form_id' => 999999, 'date_created' => '2026-01-01 00:00:00' );
    $html = apply_filters( 'gravityflow_inbox_field_value', '', 999999, InboxPresentationAdapter::CARD_COLUMN, $entry );
    wu21_assert( false !== strpos( $html, 'gpp-inbox-card__readiness--unready' ), 'Missing environment did not emit unready marker.' );
    wu21_assert( false === strpos( $html, '<article class="gpp-inbox-card"' ), 'Missing environment emitted a guessed card.' );
    wu21_assert( 'UNBOUND' === $manifest['optional_capabilities']['workflow.due_at'], 'Optional Due fixture truth changed unexpectedly.' );
    return 'Presentation fails closed while native Gravity Flow remains fallback owner.';
} );

wu21_test( 'WU21-PHP-017', 'fixture manifest and entries are synthetic non-PII', function () use ( $manifest ) {
    wu21_assert( 'SYNTHETIC_NON_PII' === $manifest['data_class'], 'Fixture data class is not synthetic.' );
    wu21_assert( 'example.invalid' === $manifest['operator']['email_domain'] && 'example.invalid' === $manifest['viewer']['email_domain'], 'Fixture accounts are not reserved-domain identities.' );
    foreach ( $manifest['entry_records'] as $record ) {
        wu21_assert( 0 === strpos( $record['national_id'], 'SYN-' ), 'Synthetic national-ID marker missing.' );
        wu21_assert( 0 === strpos( $record['first_name'], 'WU21 ' ), 'Synthetic first-name marker missing.' );
    }
    return array( 'data_class' => $manifest['data_class'], 'entry_count' => count( $manifest['entry_records'] ) );
} );

file_put_contents( trailingslashit( $artifact_dir ) . 'php-results.json', wp_json_encode( array( 'suite' => 'WU21 authentic native host and PR4 production path', 'results' => $GLOBALS['wu21_results'] ), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" );
foreach ( $GLOBALS['wu21_results'] as $result ) echo $result['status'] . ' ' . $result['id'] . ' ' . $result['name'] . PHP_EOL;
foreach ( $GLOBALS['wu21_results'] as $result ) if ( 'PASS' !== $result['status'] ) exit( 1 );
