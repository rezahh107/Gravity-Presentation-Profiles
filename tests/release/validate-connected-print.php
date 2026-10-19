<?php
// Behavioral acceptance of one connected installed-ZIP → GF admin → native Flow
// Print journey. Read-only artifacts; no test-side GPP state mutation.
if ( PHP_SAPI !== 'cli' ) { exit( 1 ); }
$dir = rtrim( (string) ( $argv[1] ?? '' ), '/\\' );
if ( '' === $dir ) { throw new RuntimeException( 'Evidence directory required.' ); }
$load = static function ( $name ) use ( $dir ) {
    $path = $dir . '/' . $name . '.json';
    $raw = is_file( $path ) ? file_get_contents( $path ) : false;
    $data = false !== $raw ? json_decode( $raw, true ) : null;
    if ( ! is_array( $data ) ) { throw new RuntimeException( 'Missing valid connected evidence: ' . $name ); }
    return $data;
};
$assert = static function ( $ok, $reason ) {
    if ( ! $ok ) { throw new RuntimeException( 'GPP_CONNECTED_PRINT_FAIL: ' . $reason ); }
};
$binding = static function ( $state, $slot ) {
    foreach ( (array) ( $state['binding']['artifact']['bindings'] ?? array() ) as $row ) {
        if ( ( $row['semantic_slot_key'] ?? null ) === $slot ) { return $row; }
    }
    return null;
};
$claim = static function ( $state, $slot ) {
    foreach ( (array) ( $state['binding']['artifact']['runtime_claims'] ?? array() ) as $row ) {
        if ( ( $row['semantic_slot_key'] ?? null ) === $slot && ( $row['claim'] ?? null ) === 'print_mapping' ) { return $row; }
    }
    return null;
};
$host = $load( 'behavioral-host-fixture' );
$last = $load( 'after-last-name' );
$bound = $load( 'after-gender-bind' );
$confirmed = $load( 'after-choice-confirm' );
$changed = $load( 'after-choice-change' );
$rebound = $load( 'after-choice-rebind' );
$final = $load( 'after-connected-final' );
$view = array();
foreach ( array( 'unproven', 'confirmed', 'invalidated', 'final' ) as $stage ) {
    $view[ $stage ] = $load( 'connected-print-' . $stage );
    $assert( ( $view[ $stage ]['stage'] ?? null ) === $stage, 'Browser stage identity mismatch.' );
    $assert( ( $view[ $stage ]['pages_dom'] ?? null ) === array( 'front', 'back' ), 'Dossier page/order mismatch.' );
    $assert( ( $view[ $stage ]['source_names'] ?? null ) === array(
        $host['expected_first_name_value'] . ' ' . $host['expected_last_name_value'],
        $host['expected_first_name_value'] . ' ' . $host['expected_last_name_value'],
    ), 'Rendered full name lost original split GF values.' );
    $assert( ! empty( $view[ $stage ]['finance_blank'] ) && ! empty( $view[ $stage ]['no_raw_label_confusion'] ), 'Unresolved finance or raw-versus-display contract violated.' );
}
$assert( ! $view['unproven']['female_selected'] && ! $view['invalidated']['female_selected'], 'Missing/stale proof populated Print choice.' );
$assert( $view['confirmed']['female_selected'] && $view['final']['female_selected'], 'Explicit actual-host-choice proof did not select canonical option.' );
foreach ( $view as $stage => $item ) {
    $assert( empty( $item['male_selected'] ), 'Unrelated canonical choice selected at ' . $stage );
}
$first = $binding( $final, 'student.first_name' );
$family = $binding( $final, 'student.last_name' );
$gender = $binding( $final, 'student.gender' );
$assert( ( $first['state'] ?? null ) === 'PROVEN' && (string) ( $first['source_ref']['field_id'] ?? '' ) === (string) $host['fields']['first_name']['id'], 'First-name field mapping wrong.' );
$assert( ( $family['state'] ?? null ) === 'PROVEN' && (string) ( $family['source_ref']['field_id'] ?? '' ) === (string) $host['fields']['last_name']['id'], 'Last-name field mapping wrong.' );
$assert( ( $gender['state'] ?? null ) === 'PROVEN' && (string) ( $gender['source_ref']['field_id'] ?? '' ) === (string) $host['fields']['choice']['id'], 'Final choice source field mapping wrong.' );
$assert( (string) ( $binding( $changed, 'student.gender' )['source_ref']['field_id'] ?? '' ) === (string) $host['fields']['alternate_choice']['id'], 'Stale-proof negative did not actually change GF source.' );
$assert( ( $claim( $bound, 'student.gender' )['evidence_state'] ?? null ) === 'NOT_PROVEN', 'Plain source binding falsely proved choice meaning.' );
$assert( ( $claim( $changed, 'student.gender' )['evidence_state'] ?? null ) === 'NOT_PROVEN', 'Mapping change failed to invalidate dependent choice proof.' );
$assert( ( $claim( $rebound, 'student.gender' )['evidence_state'] ?? null ) === 'NOT_PROVEN', 'Old proof reappeared when original field was rebound.' );
$final_claim = $claim( $final, 'student.gender' );
$assert( ( $final_claim['evidence_state'] ?? null ) === 'PROVEN' && ! empty( $final_claim['evidence_refs'] ), 'Explicit admin confirmation failed to create actual evidence.' );
$expected = $host['expected_choice'];
$assert( ( $final_claim['print_option_map'] ?? null ) === array( array(
    'canonical_option' => $expected['canonical_option'],
    'host_raw_value' => $expected['host_raw_value'],
) ), 'The confirmed canonical option mapping does not contain the actual GF source raw value.' );
$assert( ( $final['binding']['artifact']['provenance']['producer'] ?? null ) === 'Gravity Presentation Profiles admin print option confirmation', 'Print proof did not originate from the supported administrator action.' );
$native = $final['native_source_readback'] ?? array();
$assert( ( $native['first_name_raw'] ?? null ) === $host['expected_first_name_value'] && ( $native['last_name_raw'] ?? null ) === $host['expected_last_name_value'], 'Native GF source values were altered or misread.' );
$assert( ( $native['choice_raw'] ?? null ) === $expected['host_raw_value'] && ( $native['alternate_choice_raw'] ?? null ) === $expected['host_raw_value'], 'Raw host identity negative is not actually comparable.' );
$choice_found = false;
foreach ( (array) ( $native['choice_definitions'] ?? array() ) as $choice ) {
    if ( ( $choice['value'] ?? null ) === $expected['host_raw_value'] && ( $choice['text'] ?? null ) === $expected['host_display_value'] ) { $choice_found = true; }
}
$assert( $choice_found && $expected['host_display_value'] !== $expected['host_raw_value'], 'Declared choice raw and host display meanings are not supported by actual GF field choices.' );
$assert( ( $native['native_approval_step_id'] ?? null ) === $host['native_authority']['approval_step_id'] && ( $native['native_approval_step_type'] ?? null ) === 'approval', 'Entry is not on the authentic native approval step.' );
$history = array( $last, $bound, $confirmed, $changed, $rebound, $final );
$versions = array();
foreach ( $history as $state ) {
    $version = (string) ( $state['binding']['activation']['binding_set_version'] ?? '' );
    $hash = (string) ( $state['binding']['artifact_hash'] ?? '' );
    $assert( '' !== $version && '' !== $hash && ! isset( $versions[ $version ] ), 'Each actual change must publish a unique immutable binding version.' );
    $versions[ $version ] = $hash;
}
foreach ( $versions as $version => $hash ) {
    $assert( ( $final['binding']['installed_artifact_hashes'][ $version ] ?? null ) === $hash, 'Immutable mapping history was lost or rewritten.' );
}
foreach ( array( 'finance.tuition_amount', 'finance.discount_amount', 'finance.net_payable_amount' ) as $slot ) {
    $row = $binding( $final, $slot );
    $assert( ( $row['state'] ?? null ) === 'UNBOUND', 'Inactive finance semantic was unexpectedly bound: ' . $slot );
}
$positive = $view['final'];
$assert( ! empty( $positive['native_print_preserved'] ) && ! empty( $positive['bulk_failed_closed'] ) && ! empty( $positive['unauthorized_authenticated_viewer_denied'] ), 'Native non-dossier/bulk/permission negative was not exercised.' );
$assert( ( $positive['pdf']['pages'] ?? null ) === 2 && ( $positive['layout']['clipped_values'] ?? -1 ) === 0 && ( $positive['layout']['clipped_sheets'] ?? -1 ) === 0, 'Chromium PDF/presentation geometry was not proven.' );

// Every proof stage must export and verify real PDF/raster evidence, not just DOM.
foreach ( $view as $stage => $item ) {
    $assert( ! empty( $item['post_export_pdf_raster_verified'] ) && ( $item['pdf']['pages'] ?? null ) === 2,
        'Missing stage-scoped PDF/raster verification: ' . $stage );
}
$assert( ! empty( $positive['post_export_pdf_raster_verified'] ), 'Browser did not verify the actual exported PDF and raster pages.' );
$falsified = $load( 'connected-print-falsification' );
$expected_falsifications = array(
    'first_page_name_print_only_hidden' => 'REJECTED_AS_REQUIRED',
    'second_page_name_print_only_hidden' => 'REJECTED_AS_REQUIRED',
    'selected_gender_indicator_print_only_hidden' => 'REJECTED_AS_REQUIRED',
    'blank_raster_substitution' => 'REJECTED_AS_REQUIRED',
    'original_pdf_and_rasters_preserved' => 'ACCEPTED_AS_REQUIRED',
);
$actual_falsifications = array();
foreach ( (array) ( $falsified['results'] ?? array() ) as $result ) {
    $key = $result['case'] ?? '';
    $assert( isset( $expected_falsifications[ $key ] ) && ! isset( $actual_falsifications[ $key ] ), 'Unexpected or duplicate PDF falsification scenario.' );
    $actual_falsifications[ $key ] = $result['result'] ?? '';
}
$assert( $actual_falsifications === $expected_falsifications, 'Post-export PDF/raster falsifications did not exercise every required control.' );

// Independently re-run the SAME verifier on CURRENT exported PDF/raster
// bytes for all stages before publishing the PASS report.
$evidence = array();
foreach ( array( 'unproven', 'confirmed', 'invalidated', 'final' ) as $stage ) {
    $prefix = 'final' === $stage ? 'connected-print' : 'connected-print-' . $stage;
    $verify_args = array(
        __DIR__ . '/verify-connected-print-output.mjs',
        $dir . '/' . $prefix . '.pdf',
        $dir . '/' . $prefix . '-page-1.png',
        $dir . '/' . $prefix . '-page-2.png',
        $host['expected_first_name_value'] . ' ' . $host['expected_last_name_value'],
        $expected['canonical_print_label'],
        $expected['host_raw_value'],
        $expected['host_display_value'],
        $stage,
    );
    $command = 'node ' . implode( ' ', array_map( 'escapeshellarg', $verify_args ) ) . ' 2>&1';
    $verification_log = array();
    $verification_exit = -1;
    exec( $command, $verification_log, $verification_exit );
    $expected_pass = 'GPP_CONNECTED_PRINT_OUTPUT_PASS stage=' . $stage . ' pdf_pages=2 names=2 female_mark=' .
        ( in_array( $stage, array( 'confirmed', 'final' ), true ) ? '1' : '0' ) . ' raster_pages=2';
    $assert( 0 === $verification_exit && in_array( $expected_pass, $verification_log, true ),
        'Current stage-exported PDF/raster verification failed at ' . $stage . ': ' . implode( ' | ', array_slice( $verification_log, -4 ) ) );
    foreach ( array( $prefix . '.pdf', $prefix . '-page-1.png', $prefix . '-page-2.png' ) as $file ) {
        $path = $dir . '/' . $file;
        $assert( is_file( $path ) && filesize( $path ) > 100, 'Rendered stage evidence absent: ' . $file );
        $evidence[ $file ] = array( 'bytes' => filesize( $path ), 'sha256' => hash_file( 'sha256', $path ) );
    }
}
$html_path = $dir . '/connected-print-dossier.html';
$assert( is_file( $html_path ) && filesize( $html_path ) > 100, 'Final rendered dossier HTML absent.' );
$evidence['connected-print-dossier.html'] = array( 'bytes' => filesize( $html_path ), 'sha256' => hash_file( 'sha256', $html_path ) );

// The print-only mutation must be material in the current PDF and fail under
// stage-aware Poppler validation. These per-stage falsification reports are
// generated by Chromium, not synthesized by the final PHP validator.
foreach ( array( 'unproven', 'invalidated' ) as $stage ) {
    $mutation = $load( 'connected-print-' . $stage . '-falsification' );
    $assert( ( $mutation['stage'] ?? null ) === $stage &&
        ( $mutation['source'] ?? null ) === 'PRINT_ONLY_CSS_IN_NATIVE_CHROMIUM_PDF' &&
        ( $mutation['dom_female_unselected'] ?? null ) === true &&
        ( $mutation['mutation_materialized_in_pdf'] ?? null ) === true &&
        ( $mutation['mutant_first_page_raster_changed'] ?? null ) === true &&
        ( $mutation['extracted_text_indicator'] ?? null ) === '✓' &&
        ( $mutation['mutated_pdf_result'] ?? null ) === 'REJECTED_AS_REQUIRED' &&
        ( $mutation['original_pdf_raster_result'] ?? null ) === 'ACCEPTED_AS_REQUIRED',
        'Unselected PDF mutation/positive control not exercised: ' . $stage );
    $prefix = 'connected-print-' . $stage . '-negative/selected-gender-in-unselected';
    $mutant = $dir . '/' . $prefix . '.pdf';
    $mutant_first = $dir . '/' . $prefix . '-1.png';
    $mutant_second = $dir . '/' . $prefix . '-2.png';
    foreach ( array( $mutant, $mutant_first, $mutant_second ) as $path ) {
        $assert( is_file( $path ) && filesize( $path ) > 100, 'Retained print-only mutation absent: ' . $path );
        $relative = substr( $path, strlen( $dir ) + 1 );
        $evidence[ $relative ] = array( 'bytes' => filesize( $path ), 'sha256' => hash_file( 'sha256', $path ) );
    }
    $baseline_png = $dir . '/connected-print-' . $stage . '-page-1.png';
    $assert( hash_file( 'sha256', $mutant_first ) !== hash_file( 'sha256', $baseline_png ),
        'Print-only mutation has identical first-page raster pixels: ' . $stage );
    // Recheck the original unselected DOC->PDF false-acceptance mechanism from
    // retained bytes, not the browser's JSON statement.
    $mutant_args = array(
        __DIR__ . '/verify-connected-print-output.mjs',
        $mutant, $mutant_first, $mutant_second,
        $host['expected_first_name_value'] . ' ' . $host['expected_last_name_value'],
        $expected['canonical_print_label'],
        $expected['host_raw_value'],
        $expected['host_display_value'],
        $stage,
    );
    $mutant_log = array();
    $mutant_exit = -1;
    exec( 'node ' . implode( ' ', array_map( 'escapeshellarg', $mutant_args ) ) . ' 2>&1', $mutant_log, $mutant_exit );
    $assert( 0 !== $mutant_exit && false !== strpos(
        implode( "\n", $mutant_log ),
        'Unexpected selected canonical gender indicator in unselected printed PDF page 1'
    ), 'The current mutant PDF was not rejected for its printed canonical indicator: ' . $stage );
    $printed = array();
    $printed_exit = -1;
    exec( 'pdftotext -f 1 -l 1 -layout ' . escapeshellarg( $mutant ) . ' - 2>&1', $printed, $printed_exit );
    $assert( 0 === $printed_exit && false !== strpos( implode( "\n", $printed ), '✓' ),
        'Retained mutant PDF does not contain an extractable selected checkmark: ' . $stage );
}

$meta = $load( 'artifact-identity' );
$assert( ! empty( $meta['zip_sha256'] ) && ! empty( $meta['installed_tree_matches_zip'] ) && empty( $meta['installed_plugin_dir_is_link'] ), 'Connected acceptance not tied to exact installed ZIP.' );
$report = array(
    'schema_version' => '1.0.0',
    'evidence_class' => 'CONNECTED_EXACT_ZIP_SYNTHETIC_HOST_NATIVE_PRINT',
    'zip_sha256' => $meta['zip_sha256'],
    'installed_tree_matches_zip' => true,
    'administrator_setup_and_mapping' => 'GF Add-On settings POST with native nonce',
    'source_relationships' => array(
        'first_name_field_id' => $native['first_name_field_id'],
        'last_name_field_id' => $native['last_name_field_id'],
        'choice_field_id' => $native['choice_field_id'],
        'raw_host_choice' => $native['choice_raw'],
        'display_host_choice' => $expected['host_display_value'],
        'canonical_option' => $expected['canonical_option'],
        'printed_name' => $positive['source_names'][0],
        'selected_canonical_option_proven' => true,
    ),
    'evidence' => $evidence,
    'status' => array(
        'authorized_native_print' => 'PASS',
        'raw_vs_display' => 'PASS',
        'full_name_derivation' => 'PASS',
        'unproven_and_invalidated_blank' => 'PASS',
        'immutable_binding_history' => 'PASS',
        'authenticated_unauthorized_native_denial' => 'PASS',
        'ordinary_native_and_unsupported_bulk' => 'PASS',
        'two_page_a4_portrait_chromium_pdf' => 'PASS',
        'page_scoped_pdf_semantics_and_raster_visibility' => 'PASS',
        'post_export_falsifications' => 'PASS',
        'four_stage_pdf_raster_semantics' => 'PASS',
        'unproven_invalidated_print_only_falsification' => 'PASS',
        'target_production' => 'NOT_PROVEN',
        'physical_printer' => 'NOT_PROVEN',
    ),
);
file_put_contents( $dir . '/connected-print-acceptance.json', json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . "\n" );
echo "GPP_CONNECTED_EXACT_ZIP_PRINT_ACCEPTANCE_PASS\n";
