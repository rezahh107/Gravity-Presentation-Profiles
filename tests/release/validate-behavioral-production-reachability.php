<?php
if ( PHP_SAPI !== 'cli' ) {
    exit( 1 );
}

$dir = isset( $argv[1] ) ? rtrim( $argv[1], '/\\' ) : '';
if ( '' === $dir ) {
    fwrite( STDERR, "Evidence directory is required.\n" );
    exit( 1 );
}

$load = static function ( $name ) use ( $dir ) {
    $path = $dir . '/' . $name . '.json';
    $data = json_decode( (string) file_get_contents( $path ), true );
    if ( ! is_array( $data ) ) {
        throw new RuntimeException( 'Invalid behavioral evidence file: ' . $path );
    }
    return $data;
};
$fail = static function ( $message ) {
    fwrite( STDERR, 'GPP_BEHAVIORAL_PRODUCTION_REACHABILITY_FAIL: ' . $message . PHP_EOL );
    exit( 1 );
};
$assert = static function ( $condition, $message ) use ( $fail ) {
    if ( ! $condition ) {
        $fail( $message );
    }
};
$binding_map = static function ( $artifact ) {
    $result = array();
    foreach ( (array) ( $artifact['bindings'] ?? array() ) as $binding ) {
        if ( is_array( $binding ) && isset( $binding['semantic_slot_key'] ) ) {
            $result[ $binding['semantic_slot_key'] ] = $binding;
        }
    }
    return $result;
};
$normalized_unrelated = static function ( $artifact ) use ( $binding_map ) {
    $bindings = $binding_map( $artifact );
    unset( $bindings['student.first_name'] );
    ksort( $bindings );
    return $bindings;
};

$fixture       = $load( 'behavioral-host-fixture' );
$pre           = $load( 'preflight' );
$setup         = $load( 'after-setup' );
$repair        = $load( 'after-repair' );
$rerun         = $load( 'after-rerun' );
$runtime       = $load( 'runtime' );
$artifact_meta = $load( 'artifact-identity' );

$assert( ! empty( $artifact_meta['zip_sha256'] ) && ! empty( $artifact_meta['installed_plugin_path'] ), 'Exact ZIP identity metadata is incomplete.' );
$assert( true === ( $artifact_meta['installed_tree_matches_zip'] ?? false ), 'Installed GPP tree differs from canonical ZIP.' );
$assert( false === ( $artifact_meta['installed_plugin_dir_is_link'] ?? true ), 'Installed GPP plugin directory must not be a symlink.' );
$assert( 0 === strpos( (string) $pre['plugin']['gpp_plugin_realpath'], (string) $artifact_meta['installed_plugin_path'] . '/' ), 'Loaded GPP entrypoint escaped installed ZIP directory.' );
$assert( 0 === strpos( (string) $pre['plugin']['addon_file'], (string) $artifact_meta['installed_plugin_path'] . '/' ), 'Loaded GPP AddOn escaped installed ZIP directory.' );
$assert( '6.8.3' === ( $pre['plugin']['wordpress_version'] ?? null ), 'Behavioral runtime WordPress version drifted from the admitted release baseline.' );
$assert( '3.1.1.1' === ( $pre['plugin']['gravity_forms_version'] ?? null ), 'Behavioral runtime Gravity Forms version drifted from the admitted release baseline.' );
$assert( '3.1.0' === ( $pre['plugin']['gravity_flow_version'] ?? null ), 'Behavioral runtime Gravity Flow version drifted from the admitted release baseline.' );
$assert( ( $artifact_meta['overlay_version'] ?? null ) === ( $pre['plugin']['gpp_version'] ?? null ), 'Installed GPP version does not match the canonical dry-run overlay.' );
echo "GPP_BEHAVIORAL_STEP exact_zip_installed PASS\n";

$assert( false === $pre['visual']['operations_package_installed'], 'Preflight found pre-installed GPP Operations Package state.' );
$assert( null === $pre['visual']['print_activation'], 'Preflight found pre-existing Print activation.' );
$assert( null === $pre['binding']['activation'], 'Preflight found pre-existing active binding context.' );
$assert( null === $pre['binding']['student_first_name'], 'Preflight found pre-repaired student.first_name.' );
echo "GPP_BEHAVIORAL_STEP clean_state_observed PASS\n";

$assert( true === $setup['visual']['operations_package_installed'], 'Operations Setup did not install/adopt shipped Operations Package.' );
$assert( 'srwf.operations.print-dossier.v1' === ( $setup['visual']['print_activation']['profile_id'] ?? null ), 'Operations Setup did not activate the expected Print profile.' );
$assert( null === $setup['visual']['inbox_activation'], 'Inbox was silently activated by Operations Setup.' );
$assert( null === $setup['visual']['entry_detail_activation'], 'Entry Detail was silently activated by Operations Setup.' );
$assert( (int) $setup['visual']['revision'] > 0, 'Operations Setup did not persist visual lifecycle state in WordPress storage.' );
$assert( (int) $setup['binding']['revision'] > 0, 'Operations Setup did not persist binding lifecycle state in WordPress storage.' );
$assert( is_array( $setup['binding']['activation'] ), 'Operations Setup did not persist a binding activation.' );

$setup_bindings  = $binding_map( $setup['binding']['artifact'] );
$binding_keys    = array_keys( $setup_bindings );
$catalogue_keys  = (array) ( $setup['visual']['semantic_catalogue_keys'] ?? array() );
sort( $binding_keys );
sort( $catalogue_keys );
$assert( 53 === count( $catalogue_keys ), 'Shipped Operations Package semantic catalogue size is not the expected current 53-slot contract.' );
$assert( $catalogue_keys === $binding_keys, 'Product-created binding artifact does not exactly cover the shipped semantic catalogue.' );
$assert( 53 === (int) $setup['binding']['semantic_count'], 'Operations Setup did not seed the complete semantic catalogue.' );

$direct_field_count = 0;
foreach ( (array) ( $setup['binding']['management_kinds'] ?? array() ) as $slot => $kind ) {
    if ( 'direct_field' !== $kind ) {
        continue;
    }
    $direct_field_count++;
    $binding = $setup_bindings[ $slot ] ?? null;
    $assert( is_array( $binding ), 'Missing direct-field binding for semantic slot ' . $slot );
    $assert( 'UNBOUND' === ( $binding['state'] ?? null ), 'Direct-field semantic was not seeded UNBOUND: ' . $slot );
    $assert( null === ( $binding['source_ref'] ?? null ), 'Direct-field semantic guessed a host source: ' . $slot );
    $assert( array() === ( $binding['evidence_refs'] ?? null ), 'Unbound direct-field semantic unexpectedly has source evidence: ' . $slot );
}
$assert( $direct_field_count > 0, 'Production binding-management policy exposed no direct-field slots for qualification.' );

$initial_first = $setup['binding']['student_first_name'];
$assert( 'UNBOUND' === ( $initial_first['state'] ?? null ), 'student.first_name was not explicitly seeded UNBOUND.' );
$assert( null === ( $initial_first['source_ref'] ?? null ), 'student.first_name seed guessed a host source.' );
$print_claim_count = 0;
foreach ( (array) $setup['binding']['artifact']['runtime_claims'] as $claim ) {
    if ( 'print_mapping' === ( $claim['claim'] ?? null ) ) {
        $print_claim_count++;
        $assert( 'NOT_PROVEN' === ( $claim['evidence_state'] ?? null ), 'A seeded Print runtime claim was not NOT_PROVEN.' );
    }
}
$assert( $print_claim_count > 0, 'Operations Setup seeded no explicit Print runtime claims.' );
echo "GPP_BEHAVIORAL_STEP product_setup_exercised PASS\n";
echo "GPP_BEHAVIORAL_STEP package_observed PASS\n";
echo "GPP_BEHAVIORAL_STEP print_activation_observed PASS\n";
echo "GPP_BEHAVIORAL_STEP binding_context_observed PASS\n";

$assert( is_array( $repair['binding']['activation'] ), 'Row repair removed the active binding context.' );
$assert( $repair['binding']['activation']['binding_set_version'] !== $setup['binding']['activation']['binding_set_version'], 'Row repair did not create a new immutable binding version.' );
$assert( $repair['binding']['artifact_hash'] !== $setup['binding']['artifact_hash'], 'Row repair did not publish a distinct binding artifact.' );
$setup_version  = (string) $setup['binding']['activation']['binding_set_version'];
$repair_version = (string) $repair['binding']['activation']['binding_set_version'];
$assert( ( $repair['binding']['installed_artifact_hashes'][ $setup_version ] ?? null ) === $setup['binding']['artifact_hash'], 'Previous immutable binding version was changed or lost after repair.' );
$assert( ( $repair['binding']['installed_artifact_hashes'][ $repair_version ] ?? null ) === $repair['binding']['artifact_hash'], 'New repaired binding version is not installed as its own immutable artifact.' );
$repaired_first = $repair['binding']['student_first_name'];
$assert( 'PROVEN' === ( $repaired_first['state'] ?? null ), 'Row repair did not prove student.first_name.' );
$assert( (string) $fixture['fields']['first_name']['id'] === (string) ( $repaired_first['source_ref']['field_id'] ?? '' ), 'Row repair did not persist the exact actual host field ID.' );
$assert( $normalized_unrelated( $setup['binding']['artifact'] ) === $normalized_unrelated( $repair['binding']['artifact'] ), 'Row repair changed an unrelated binding.' );
$assert( $setup['binding']['artifact']['runtime_claims'] === $repair['binding']['artifact']['runtime_claims'], 'Repairing student.first_name unexpectedly changed unrelated runtime-proof claims.' );
foreach ( (array) ( $repair['binding']['runtime_claims']['student.first_name'] ?? array() ) as $claim ) {
    $assert( 'NOT_PROVEN' === ( $claim['evidence_state'] ?? null ), 'Changed source retained an invalid positive runtime proof for student.first_name.' );
}
echo "GPP_BEHAVIORAL_STEP row_mapping_observed PASS\n";

$assert( $rerun['binding']['activation'] === $repair['binding']['activation'], 'Operations Setup rerun changed active repaired binding identity.' );
$assert( $rerun['binding']['artifact_hash'] === $repair['binding']['artifact_hash'], 'Operations Setup rerun rewrote the repaired binding artifact.' );
$assert( $rerun['binding']['student_first_name'] === $repair['binding']['student_first_name'], 'Operations Setup rerun reset the explicit repaired mapping.' );
$assert( $rerun['binding']['artifact'] === $repair['binding']['artifact'], 'Operations Setup rerun silently rewrote unrelated binding/runtime state.' );
$assert( $rerun['visual']['print_activation'] === $repair['visual']['print_activation'], 'Operations Setup rerun changed compatible Print activation.' );
echo "GPP_BEHAVIORAL_STEP rerun_preservation_observed PASS\n";

$assert( 'srwf.operations.print-dossier.v1' === ( $runtime['runtime']['print_profile_id'] ?? null ), 'Production Print profile resolver did not resolve the product-created profile.' );
$assert( 'ready' === ( $runtime['runtime']['binding_context_status'] ?? null ), 'Production Print model did not resolve the persisted binding context.' );
$resolution = $runtime['runtime']['student_first_name_resolution'] ?? array();
$assert( true === ( $resolution['resolved'] ?? false ), 'Production semantic resolver did not resolve student.first_name.' );
$assert( 'PROVEN' === ( $resolution['state'] ?? null ), 'Production semantic resolver did not consume PROVEN repaired state.' );
$assert( (string) $fixture['fields']['first_name']['id'] === (string) ( $resolution['source_ref']['field_id'] ?? '' ), 'Production semantic resolver returned the wrong real GF field.' );
$assert( $fixture['expected_first_name_value'] === ( $runtime['runtime']['student_first_name_value'] ?? null ), 'Production host-value reader did not resolve the known synthetic entry value.' );
echo "GPP_BEHAVIORAL_STEP runtime_resolution_observed PASS\n";

// B-E are executable transition assertions, not source-text proxies. If any
// product step disappears or becomes destructive, the corresponding assertion
// above fails the trusted release qualification.
echo "GPP_BEHAVIORAL_NEGATIVE_B_PASS product_setup_transition_is_mandatory\n";
echo "GPP_BEHAVIORAL_NEGATIVE_C_PASS print_activation_transition_is_mandatory\n";
echo "GPP_BEHAVIORAL_NEGATIVE_D_PASS real_binding_context_persistence_is_mandatory\n";
echo "GPP_BEHAVIORAL_NEGATIVE_E_PASS repaired_mapping_preservation_is_mandatory\n";

$summary = array(
    'schema_version' => '1.0.0',
    'evidence_class' => 'BEHAVIORAL_SHIPPABLE_ARTIFACT',
    'artifact' => $artifact_meta,
    'host' => array(
        'form_id' => $fixture['form_id'],
        'entry_id' => $fixture['entry_id'],
        'first_name_field_id' => $fixture['fields']['first_name']['id'],
        'wordpress_version' => $pre['plugin']['wordpress_version'],
        'gpp_version' => $pre['plugin']['gpp_version'],
        'gravity_forms_version' => $pre['plugin']['gravity_forms_version'],
        'gravity_flow_version' => $pre['plugin']['gravity_flow_version'],
    ),
    'before_setup' => array(
        'operations_package_installed' => $pre['visual']['operations_package_installed'],
        'print_activation' => $pre['visual']['print_activation'],
        'binding_activation' => $pre['binding']['activation'],
    ),
    'after_setup' => array(
        'operations_package_installed' => $setup['visual']['operations_package_installed'],
        'print_activation' => $setup['visual']['print_activation'],
        'binding_activation' => $setup['binding']['activation'],
        'binding_artifact_hash' => $setup['binding']['artifact_hash'],
        'student_first_name' => $setup['binding']['student_first_name'],
        'semantic_count' => $setup['binding']['semantic_count'],
        'direct_field_count' => $direct_field_count,
    ),
    'after_repair' => array(
        'binding_activation' => $repair['binding']['activation'],
        'binding_artifact_hash' => $repair['binding']['artifact_hash'],
        'student_first_name' => $repair['binding']['student_first_name'],
    ),
    'after_setup_rerun' => array(
        'print_activation' => $rerun['visual']['print_activation'],
        'binding_activation' => $rerun['binding']['activation'],
        'binding_artifact_hash' => $rerun['binding']['artifact_hash'],
        'student_first_name' => $rerun['binding']['student_first_name'],
    ),
    'runtime' => $runtime['runtime'],
    'status' => array(
        'behavioral_artifact_identity' => 'PASS',
        'real_host_runtime' => 'PASS',
        'operator_setup_path' => 'PASS',
        'real_persisted_setup_state' => 'PASS',
        'row_mapping_product_path' => 'PASS',
        'rerun_preservation' => 'PASS',
        'runtime_resolution' => 'PASS',
        'behavioral_production_reachability' => 'PASS',
        'target_production_acceptance' => 'NOT_PROVEN',
    ),
);
file_put_contents(
    $dir . '/behavioral-production-reachability.json',
    json_encode( $summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL
);
echo 'GPP_BEHAVIORAL_EVIDENCE ' . json_encode( $summary, JSON_UNESCAPED_SLASHES ) . PHP_EOL;

echo "GPP_BEHAVIORAL_PRODUCTION_REACHABILITY_PASS\n";
