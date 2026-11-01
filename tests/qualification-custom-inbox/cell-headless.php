<?php
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }
require_once __DIR__ . '/cell-boundary.php';
use GravityPresentationProfiles\SRWF\GravityFlow\InboxTableHeaderPresentation;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore;
use GravityPresentationProfiles\GravityForms\OperationsSetupService;
use GravityPresentationProfiles\GravityForms\BindingRepairService;
use GravityPresentationProfiles\GravityForms\InboxSetupService;

function cellq_assert( $ok, $message ) { if ( ! $ok ) { throw new RuntimeException( $message ); } }
function cellq_native_reference( $scope ) {
    $total = Gravity_Flow_API::get_inbox_entries_count( $scope ); $rows = array();
    for ( $offset = 0; $offset < max( 1, $total ); ++$offset ) {
        foreach ( cellq_model()->get_inbox_tasks( cellq_args( $scope, $offset ) ) as $r ) {
            cellq_assert( ! isset( $rows[ (int) $r['id'] ] ), 'Repeated native reference identity' );
            $e = GFAPI::get_entry( (int) $r['id'] ); $s = ( new Gravity_Flow_API( $e['form_id'] ) )->get_current_step( $e );
            $rows[ (int) $r['id'] ] = array( 'entry_id' => (int) $r['id'], 'form_id' => (int) $e['form_id'],
                'step_id' => (int) $s->get_id(), 'native' => $r );
        }
    }
    cellq_assert( count( $rows ) === (int) $total, 'Incomplete native reference enumeration' );
    return $rows;
}
function cellq_dom_text( $value ) {
    cellq_assert( is_string( $value ) || is_numeric( $value ), 'Reference is not a scalar cell' );
    $dom = new DOMDocument();
    $previous = libxml_use_internal_errors( true );
    $dom->loadHTML( '<?xml encoding="utf-8"?><span id="oracle">' . $value . '</span>', LIBXML_NONET );
    libxml_clear_errors(); libxml_use_internal_errors( $previous );
    return $dom->getElementById( 'oracle' )->textContent;
}
function cellq_same( $native, $candidate, $scope, $require_cells = true ) {
    cellq_assert( ! is_wp_error( $candidate ), 'Candidate task/entry access failed' );
    $ids = array_column( $candidate, 'id' ); sort( $ids ); $expected = array_keys( $native ); sort( $expected );
    cellq_assert( $ids === $expected, 'Unauthorized, missing or extra candidate task' );
    $contract = InboxTableHeaderPresentation::initialGeometryContract( $scope );
    foreach ( $candidate as $r ) {
        $ref = $native[ $r['id'] ];
        cellq_assert( $r['form_id'] === $ref['form_id'] && $r['step_id'] === $ref['step_id'], 'Task tuple mismatch' );
        if ( ! $require_cells ) { continue; }
        cellq_assert( null !== $contract, 'Missing qualified table binding' );
        foreach ( array( 'student_name' => 1, 'national_id' => 2, 'school_grade' => 3 ) as $semantic => $position ) {
            $column = (string) $contract['column_ids'][ $position ];
            cellq_assert( isset( $r['cells'][ $semantic ] ) && $r['cells'][ $semantic ]['column_id'] === $column, 'Cell identity missing: ' . $semantic );
            cellq_assert( $r['cells'][ $semantic ]['text'] === cellq_dom_text( $ref['native'][ $column ] ), 'Native/candidate effective cell differs: ' . $semantic );
        }
    }
}
function cellq_rejects( $fn ) {
    try { $fn(); } catch ( Throwable $error ) { return true; }
    return false;
}
function cellq_rebind( $form, $field ) {
    $operations = OperationsSetupService::forWordPress(); $context = $operations->bindingContext( $form );
    $reader = new BindingSetLifecycle( new WordPressOptionStateStore( BindingSetLifecycle::OPTION_NAME ), new EvidenceReferenceGate( array() ) );
    $before = $reader->resolve( $context );
    $r = BindingRepairService::forWordPress()->repairField( array( 'context_key' => $reader->contextKey( $context ),
        'binding_set_id' => $before['binding_set_id'], 'binding_set_version' => $before['binding_set_version'],
        'semantic_slot_key' => 'student.national_id', 'field_id' => (string) $field ) );
    cellq_assert( $r['status'] === 'REPAIRED_AND_ACTIVATED', 'Real binding remap failed' );
    InboxTableHeaderPresentation::resetRuntimeCache(); // Existing PR162 request-bound cache reset seam.
    return $before['binding_set_version'];
}

$f = get_option( 'cellq_fixture' ); $scope = array( 'form_id' => $f['form_id'] );
$report = array( 'status' => 'RUNNING', 'head' => getenv( 'GPP_WU21_REPOSITORY_SHA' ), 'scenarios' => array(), 'falsifications' => array() );
$save = static function () use ( &$report ) { file_put_contents( getenv( 'WU21_ARTIFACT_DIR' ) . '/cellq-headless.json', wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ); };
try {
    foreach ( array( 'officer', 'viewer', 'admin' ) as $user ) {
        wp_set_current_user( $f[ $user ] );
        foreach ( array( 'form' => $scope, 'global' => array() ) as $context => $args ) {
            $native = cellq_native_reference( $args ); $candidate = cellq_rows( $args );
            cellq_same( $native, $candidate, $args, 'form' === $context );
            if ( 'global' === $context ) {
                foreach ( $candidate as $r ) { cellq_assert( empty( $r['cells'] ), 'Global fallback invented a form projection' ); }
            }
            $report['scenarios'][ $user . '_' . $context ] = array( 'native' => $native, 'candidate' => $candidate, 'all_pages' => true );
        }
    }
    cellq_assert( count( $report['scenarios']['officer_form']['candidate'] ) === 3, 'Officer fixture missing tasks' );
    cellq_assert( count( $report['scenarios']['admin_form']['candidate'] ) === 3, 'Admin actual same-form tasks absent' );
    cellq_assert( empty( $report['scenarios']['viewer_form']['candidate'] ), 'Viewer student data leak' );
    wp_set_current_user( $f['officer'] );
    $base_native = cellq_native_reference( $scope ); $base = cellq_rows( $scope );
    $by_id = array_column( $base, null, 'id' );
    cellq_assert( $by_id[ $f['entries'][0] ]['cells']['student_name']['text'] === 'آرین & همکار کاظمی «الف»', 'Independent full name witness differs' );
    cellq_assert( $by_id[ $f['entries'][0] ]['cells']['school_grade']['text'] === 'مدرسه «آفتاب» & نوآوری — دهم — گروه آزمایشی', 'Choice label/composition witness differs' );
    cellq_assert( $by_id[ $f['entries'][1] ]['cells']['student_name']['text'] === 'آزمایش نیمه‌کامل', 'Missing last name fallback invented' );
    cellq_assert( $by_id[ $f['entries'][1] ]['cells']['school_grade']['text'] === 'دهم — گروه آزمایشی', 'Missing school did not preserve native grade-only result' );
    foreach ( array( 'student_name', 'school_grade' ) as $semantic ) {
        $mutant = $base; $mutant[0]['cells'][ $semantic ]['text'] = 'CQ_WRONG_COMPOSITION';
        cellq_assert( cellq_rejects( static function () use ( $base_native, $mutant, $scope ) { cellq_same( $base_native, $mutant, $scope ); } ), 'Comparator accepted wrong composition' );
        $report['falsifications'][ 'wrong_' . $semantic ] = 'REJECTED_BY_SAME_COMPARATOR';
    }
    cellq_assert( cellq_rejects( static function () use ( $base, $scope ) { cellq_same( array(), $base, $scope ); } ), 'Comparator accepted unauthorized user values' );
    $report['falsifications']['unauthorized_user_values'] = 'REJECTED_BY_SAME_COMPARATOR';
    $scan = static function ( $x ) { return strpos( wp_json_encode( $x ), 'CQ_SECRET_DO_NOT_EXPOSE_' ) === false; };
    cellq_assert( $scan( $base ) && ! $scan( array( 'hidden' => GFAPI::get_entry( $f['entries'][0] )['9'] ) ), 'Sensitive response scanner accepted hidden payload' );
    $report['falsifications']['hidden_sensitive_value'] = 'REJECTED_BY_SAME_SCANNER';

    foreach ( array( 'list_mask', 'final_mask', 'detail_mask', 'content_unrelated', 'content_participating', 'early_mask' ) as $mode ) {
        update_option( 'cellq_mode', $mode, false ); $GLOBALS['cellq_trace'] = array();
        $native = cellq_native_reference( $scope ); $candidate = cellq_rows( $scope );
        cellq_same( $native, $candidate, $scope );
        $trace = $GLOBALS['cellq_trace']; $one = array_column( $candidate, null, 'id' )[ $f['entries'][0] ];
        if ( 'final_mask' === $mode || 'list_mask' === $mode || 'content_participating' === $mode ) {
            $expected = array( 'final_mask' => 'CQ_FINAL_MASKED', 'list_mask' => 'CQ_LIST_MASKED', 'content_participating' => 'CQ_CONTENT_MASKED' )[ $mode ];
            cellq_assert( $one['cells']['national_id']['text'] === $expected, 'Effective native Inbox mask was bypassed' );
        }
        if ( 'final_mask' === $mode ) {
            $mutant = $candidate; $mutant[0]['cells']['national_id']['text'] = 'CQ_RAW_NID_A<&"';
            cellq_assert( cellq_rejects( static function () use ( $native, $mutant, $scope ) { cellq_same( $native, $mutant, $scope ); } ), 'Comparator accepted unmasked raw value' );
            $report['falsifications']['unmasked_raw_value'] = 'REJECTED_BY_SAME_COMPARATOR';
        }
        if ( in_array( $mode, array( 'detail_mask', 'content_unrelated' ), true ) ) {
            cellq_assert( $one['cells'] === $by_id[ $f['entries'][0] ]['cells'], 'Detail-only filter changed native Inbox output' );
            cellq_assert( ! array_filter( $trace, static function ( $e ) { return in_array( $e['event'], array( 'field_content', 'entry_detail_value' ), true ); } ), 'Unrelated Detail filter unexpectedly participated in Inbox' );
            $e = GFAPI::get_entry( $f['entries'][0] );
            ob_start(); Gravity_Flow_Entry_Detail::entry_detail( GFAPI::get_form( $f['form_id'] ), $e, ( new Gravity_Flow_API( $f['form_id'] ) )->get_current_step( $e ) ); $detail = ob_get_clean();
            $marker = 'detail_mask' === $mode ? 'CQ_DETAIL_ONLY_MASK' : 'CQ_DETAIL_CONTENT_ONLY';
            cellq_assert( strpos( $detail, $marker ) !== false, 'Discriminating Detail-only callback did not affect its actual view' );
            cellq_assert( strpos( $detail, 'CQ_RAW_NID_A' ) === false, 'Step-withheld NID leaked through Entry Detail' );
        }
        if ( 'early_mask' === $mode ) {
            cellq_assert( $one['cells']['student_name']['text'] !== 'CQ_EARLY_MASK', 'Expected late GPP composition was not exercised' );
            $report['early_mask_interaction'] = 'NATIVE_GPP_COMPOSITION_OVERRIDES_EARLIER_NAME_FILTER__NOT_A_GENERAL_MASKING_GUARANTEE';
        }
        $report['scenarios'][ $mode ] = array( 'native' => $native, 'candidate' => $candidate, 'trace' => $trace );
    }
    update_option( 'cellq_mode', 'opaque', false );
    $opaque = cellq_rows( $scope );
    foreach ( $opaque as $r ) { cellq_assert( ! isset( $r['cells']['school_grade'] ) && isset( $r['cells']['student_name'], $r['cells']['national_id'] ), 'Ambiguous independent cell did not remain isolated' ); }
    $report['scenarios']['opaque_cell'] = $opaque;
    update_option( 'cellq_mode', 'deny_entry', false );
    cellq_assert( is_wp_error( cellq_rows( $scope ) ), 'Entry authorization failure partially rendered data' );
    $report['entry_denial'] = 'PASS_NO_PARTIAL_TASK_OUTPUT';
    update_option( 'cellq_mode', 'baseline', false );
    $old_version = cellq_rebind( $f['form_id'], 7 );
    cellq_assert( null === InboxTableHeaderPresentation::initialGeometryContract( $scope ), 'Stale source proof retained GPP table contract' );
    $stale = cellq_rows( $scope ); foreach ( $stale as $r ) { cellq_assert( empty( $r['cells'] ), 'Stale binding exposed student data' ); }
    cellq_assert( cellq_rejects( static function () use ( $base_native, $base, $scope ) { cellq_same( $base_native, $base, $scope ); } ), 'Stale comparator accepted old binding cells' );
    $report['falsifications']['stale_binding'] = 'OLD_BINDING_CELLS_REJECTED';
    $report['scenarios']['stale_binding'] = array( 'prior_binding_version' => $old_version, 'candidate' => $stale );
    cellq_rebind( $f['form_id'], 4 );
    $r = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $f['form_id'] ) );
    cellq_assert( $r['status'] === InboxSetupService::STATUS_COMPLETED, 'Native binding requalification failed' );
    InboxTableHeaderPresentation::resetRuntimeCache();
    cellq_same( cellq_native_reference( $scope ), cellq_rows( $scope ), $scope );
    $mixed = get_option( 'gpp_wu21_mixed_readiness_fixture' ); wp_set_current_user( $f['admin'] );
    foreach ( array( 'unproven', 'unconfigured' ) as $kind ) {
        $args = array( 'form_id' => $mixed['forms'][ $kind ] ); $rows = cellq_rows( $args );
        cellq_same( cellq_native_reference( $args ), $rows, $args, false );
        foreach ( $rows as $row ) { cellq_assert( empty( $row['cells'] ), 'Unbound form acquired invented source mapping' ); }
        $report['scenarios'][ $kind ] = $rows;
    }
    wp_set_current_user( $f['viewer'] );
    cellq_assert( empty( ciq_entries( array( 'form_id' => $f['form_id'], 'filter_key' => 'workflow_user_id_' . $f['officer'], 'user_id' => $f['officer'], 'step_id' => $f['step_id'] ) ) ), 'Query identity injection escaped PR169 boundary' );
    $report['identity_injection'] = 'PASS';
    update_option( 'cellq_mode', 'final_mask', false );
    $report['fields'] = array_fill_keys( array( 'student_name', 'national_id', 'school', 'grade_group' ), 'NATIVE_INBOX_FIELD_PARITY_QUALIFIED_HEADLESS' );
    $report['status'] = 'PASS_HEADLESS_CELL_GATE'; update_option( 'cellq_gate_b_passed', true, false );
    $save(); echo "CELLQ_HEADLESS_GATE_PASS\n";
} catch ( Throwable $error ) { $report['status'] = 'FAIL'; $report['error'] = $error->getMessage(); $save(); throw $error; }
