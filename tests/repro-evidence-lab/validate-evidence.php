<?php
$repo = dirname( __DIR__, 2 );
$dir = getenv( 'WU21_ARTIFACT_DIR' );
require_once __DIR__ . '/visual-diagnostics-manifest.php';
function rjson( $p ) { $d = json_decode( file_get_contents( $p ), true ); if ( ! is_array( $d ) ) throw new RuntimeException( 'Invalid JSON ' . $p ); return $d; }
function canon( $v ) { if ( ! is_array( $v ) ) return $v; $list=array_keys($v)===range(0,count($v)-1); if($list)return array_map('canon',$v); ksort($v,SORT_STRING); foreach($v as $k=>$x)$v[$k]=canon($x); return $v; }
function cj( $v ) { return json_encode( canon( $v ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ); }
function req( $c, $m ) { if ( ! $c ) throw new RuntimeException( $m ); }
$config = rjson( $repo . '/tests/repro-evidence-lab/lab-config.json' );
$filename = trim( file_get_contents( $dir . '/evidence-path.txt' ) );
$e = rjson( $dir . '/' . $filename );
req( 'gpp.reproducible_simulation_evidence' === $e['artifact_type'], 'artifact_type mismatch' );
req( 'REPRODUCIBLE_SIMULATION' === $e['environment_class'], 'environment_class mismatch' );
req( 'PASS' === $e['overall_status'], 'Evidence overall_status is not PASS' );
req( 'NOT_PROVEN' === $e['production_equivalence']['state'], 'Production equivalence must remain NOT_PROVEN' );
req( $config['wordpress']['version'] === $e['environment']['wordpress']['version'], 'WordPress runtime version mismatch' );
req( $config['php']['version'] === $e['environment']['php']['version'], 'PHP runtime version mismatch' );
req( false !== strpos( $e['environment']['database']['reported_version'], $config['database']['version'] ), 'Database runtime version mismatch' );
foreach ( array( 'gravity_forms', 'gravity_flow' ) as $p ) {
    req( $config['plugins'][$p]['version'] === $e['packages'][$p]['runtime_version'], $p . ' runtime version mismatch' );
    req( $config['plugins'][$p]['sha256'] === $e['packages'][$p]['zip_sha256'], $p . ' package hash mismatch' );
    req( $config['plugins'][$p]['size_bytes'] === $e['packages'][$p]['zip_size_bytes'], $p . ' package size mismatch' );
}
req( getenv( 'GPP_WU21_REPOSITORY_SHA' ) === $e['repository']['commit_sha'], 'Repository SHA mismatch' );
req( hash_file( 'sha256', $repo . '/.github/workflows/wu21-repro-evidence-lab.yml' ) === $e['workflow']['definition_sha256'], 'Workflow definition hash mismatch' );
req( hash_file( 'sha256', $repo . '/tests/repro-evidence-lab/lab-config.json' ) === $e['configuration']['sha256'], 'Configuration hash mismatch' );
req( 2 === count( $e['fixture_manifest']['forms'] ), 'Expected exactly two synthetic forms' );
req( 25 === $e['fixture_manifest']['base_entry_count'], 'Expected 25 base synthetic entries' );
req( 'SYNTHETIC_NON_PII' === $e['fixture_manifest']['data_class'], 'Fixture data class mismatch' );
req( 'srwf.operations.inbox.v1' === $e['fixture_manifest']['surface_profile_id'], 'Operations Inbox profile mismatch' );
req( '1.0.1' === $e['fixture_manifest']['operations_package_version'], 'Operations package version mismatch' );
$expected_ids = array_merge(
    array_map( function ( $i ) { return sprintf( 'WU21-PHP-%03d', $i ); }, range( 1, 17 ) ),
    array_map( function ( $i ) { return sprintf( 'WU21-BROWSER-%03d', $i ); }, range( 1, 7 ) )
);
$actual_ids = array_map( function ( $t ) { return isset( $t['id'] ) ? $t['id'] : null; }, $e['tests'] );
$unique_ids = array_values( array_unique( $actual_ids ) );
sort( $unique_ids, SORT_STRING );
sort( $expected_ids, SORT_STRING );
req( count( $actual_ids ) === count( $unique_ids ) && $unique_ids === $expected_ids, 'Required test ID set mismatch' );
req( 'UNBOUND' === $e['fixture_manifest']['optional_capabilities']['workflow.due_at'], 'Optional Due must remain UNBOUND' );
foreach ( $e['tests'] as $t ) req( 'PASS' === $t['status'], 'Required test failed/not-run: ' . $t['id'] );
foreach ( $e['mechanics'] as $name => $m ) req( 'PROVEN_IN_REPRODUCIBLE_SIMULATION' === $m['state'], 'Mechanic not proven: ' . $name );
for ( $i=1; $i<=10; $i++ ) { $id=sprintf('AC-WU21-%03d',$i); req( 'PASS' === $e['acceptance_criteria'][$id]['status'], 'Acceptance criterion not PASS: ' . $id ); }
req( 'UNBOUND' === $e['target_production_facts']['form_ids'], 'Production form IDs must remain UNBOUND' );
req( 'NOT_PROVEN' === $e['target_production_facts']['plugin_license_configuration'], 'Production plugin/license config must remain NOT_PROVEN' );

$bound_visual = isset( $e['visual_regression_diagnostics'] ) && is_array( $e['visual_regression_diagnostics'] ) ? $e['visual_regression_diagnostics'] : null;
$actual_visual = wu21_assert_visual_diagnostics_manifest( $dir, $bound_visual );
req( 'RECURSIVE_EVIDENCE_JSON_JSONL_PNG_V1' === ( $actual_visual['inclusion_policy'] ?? null ), 'Visual diagnostics inclusion policy mismatch' );
req( array( '.json', '.jsonl', '.png' ) === ( $actual_visual['included_extensions'] ?? null ), 'Visual diagnostics included extensions mismatch' );
foreach ( array( 'empty-state-seam.json', 'matrix-j-browser-zoom.json', 'manifest.json' ) as $required_visual ) {
    $paths = array_map( function ( $file ) { return $file['path'] ?? null; }, $actual_visual['files'] ?? array() );
    req( in_array( $required_visual, $paths, true ), 'Required visual diagnostic is unbound: ' . $required_visual );
}

$c = isset( $e['comparative_repair_qualification'] ) && is_array( $e['comparative_repair_qualification'] ) ? $e['comparative_repair_qualification'] : array();
req( 'gpp.comparative_repair_qualification.v1' === ( $c['schema'] ?? null ), 'Comparative schema mismatch' );
req( getenv( 'GPP_WU21_REPOSITORY_SHA' ) === ( $c['repository_sha'] ?? null ), 'Comparative repository SHA mismatch' );
req( '8265507e7330a1e444ee10eec0592e816e03fad3' === ( $c['authorized_baseline_sha'] ?? null ), 'Comparative authorized baseline mismatch' );
req( '8f2f83e46450a3f6165bb560a74771053517ad22' === ( $c['qualified_pr65_head'] ?? null ), 'Qualified PR65 Head mismatch' );
req( 'twentytwentyfive' === ( $c['theme']['observed']['template'] ?? null ), 'Comparative template identity mismatch' );
req( 'twentytwentyfive' === ( $c['theme']['observed']['stylesheet'] ?? null ), 'Comparative stylesheet identity mismatch' );
req( 'NOT_PROVEN' === ( $c['production_equivalence'] ?? null ), 'Comparative production equivalence must remain NOT_PROVEN' );
req( array( 'FULL_WIDTH_HOST', 'CONSTRAINED_HOST' ) === ( $c['contexts'] ?? null ), 'Comparative host contexts mismatch' );
req( array( 'rtl', 'ltr' ) === ( $c['directions'] ?? null ), 'Comparative direction matrix mismatch' );
req( 'REPRODUCED' === ( $c['control_reproduction']['status'] ?? null ), 'Historical PR65 control defect was not reproduced' );
req( isset( $c['candidates'] ) && 2 === count( $c['candidates'] ), 'Exactly CONTROL and CANDIDATE_HOST_OWNED must execute' );
req( 'CONTROL' === ( $c['candidates'][0]['id'] ?? null ), 'CONTROL must execute first' );
req( 'historical_production_control_replay' === ( $c['candidates'][0]['kind'] ?? null ), 'CONTROL must remain the historical production mechanism replay' );
req( 'CANDIDATE_HOST_OWNED' === ( $c['candidates'][1]['id'] ?? null ), 'Host-owned production repair candidate missing' );
req( 'production_repair' === ( $c['candidates'][1]['kind'] ?? null ), 'Host-owned candidate must be current production repair' );
req( false === ( $c['candidates'][1]['identity']['test_css_injected'] ?? null ), 'Production candidate must not rely on test-only CSS injection' );
req( 'CANDIDATE_HOST_OWNED' === ( $c['production_repair']['candidate'] ?? null ), 'Production repair candidate identity mismatch' );
req( false === ( $c['production_repair']['test_css_injected'] ?? null ), 'Production repair evidence used test-only CSS injection' );
req( isset( $c['production_repair']['files'] ) && 2 === count( $c['production_repair']['files'] ), 'Production repair CSS identity is incomplete' );
foreach ( array( 'assets/css/srwf-gravity-flow-inbox.css', 'assets/css/srwf-gravity-flow-inbox-native.css' ) as $file ) {
    req( ! empty( $c['production_repair']['files'][ $file ]['git_blob_sha'] ), 'Missing production CSS git blob identity: ' . $file );
    req( ! empty( $c['production_repair']['files'][ $file ]['sha256'] ), 'Missing production CSS sha256 identity: ' . $file );
}
req( isset( $c['measurements'] ) && count( $c['measurements'] ) >= 18, 'Comparative measurement matrix is incomplete' );

$expected_control = array(
    'G1' => 'PASS',
    'G2' => 'PASS',
    'G3' => 'PASS',
    'G4' => 'PASS',
    'G5' => 'FAIL',
    'G6' => 'PASS',
    'G7' => 'FAIL',
    'G8' => 'PASS',
    'G9' => 'PASS',
    'G10' => 'PASS',
);
foreach ( $expected_control as $gate => $status ) {
    req( isset( $c['hard_gates'][ $gate ] ), 'Missing declared hard gate ' . $gate );
    req( $status === ( $c['per_candidate_gate_results']['CONTROL'][ $gate ]['status'] ?? null ), 'Historical CONTROL gate changed unexpectedly: ' . $gate );
}
for ( $i = 1; $i <= 10; $i++ ) {
    $gate = 'G' . $i;
    req( isset( $c['hard_gates'][ $gate ] ), 'Missing declared hard gate ' . $gate );
    req( 'PASS' === ( $c['per_candidate_gate_results']['CANDIDATE_HOST_OWNED'][ $gate ]['status'] ?? null ), 'Production Host-Owned repair did not pass ' . $gate );
}
req( array( 'CANDIDATE_HOST_OWNED' ) === ( $c['surviving_candidates'] ?? null ), 'Production Host-Owned repair is not the sole surviving candidate' );
req( 'METHOD_CLOSED_IN_REPRODUCIBLE_SIMULATION' === ( $c['outcome'] ?? null ), 'Production repair method is not closed in reproducible simulation' );

$copy = $e; $actual = $copy['content_digest']['value']; unset( $copy['content_digest'] ); $expected = hash( 'sha256', cj( $copy ) );
req( hash_equals( $expected, $actual ), 'Content digest mismatch' );
req( 'wu21-repro-evidence-' . $actual . '.json' === $filename, 'Content-addressed filename mismatch' );
echo "PASS WU21 evidence validation digest={$actual}\n";
