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
req( '1.1.0' === ( $e['schema_version'] ?? null ), 'Evidence schema mismatch' );
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

$a = isset( $e['architecture_reset'] ) && is_array( $e['architecture_reset'] ) ? $e['architecture_reset'] : array();
req( 'PROVEN_IN_REPRODUCIBLE_SIMULATION' === ( $a['state'] ?? null ), 'Native-First architecture reset is not proven' );
req( 'NATIVE_FIRST' === ( $a['mode'] ?? null ), 'Architecture reset mode mismatch' );
req( 'CARD_MODE' === ( $a['superseded_mode'] ?? null ), 'Superseded architecture identity mismatch' );
req( 'NOT_ATTEMPTED_OUT_OF_SCOPE' === ( $a['visual_golden_admission'] ?? null ), 'Reset must not claim visual Golden admission' );
req( 'inbox-card-geometry.json' === ( $a['geometry_artifact'] ?? null ), 'Native-First geometry artifact binding mismatch' );

$g = isset( $e['native_first_geometry'] ) && is_array( $e['native_first_geometry'] ) ? $e['native_first_geometry'] : array();
req( '2.0.0' === ( $g['schema_version'] ?? null ), 'Native-First geometry schema mismatch' );
req( getenv( 'GPP_WU21_REPOSITORY_SHA' ) === ( $g['repository_sha'] ?? null ), 'Native-First geometry repository SHA mismatch' );
req( 'NATIVE_FIRST' === ( $g['architecture'] ?? null ), 'Native-First geometry architecture mismatch' );
req( 'CARD_MODE' === ( $g['superseded_architecture'] ?? null ), 'Geometry does not identify retired Card Mode' );
req( 'PASS' === ( $g['status'] ?? null ), 'Native-First geometry status is not PASS' );
req( isset( $g['measurements'] ) && 2 === count( $g['measurements'] ), 'Native-First desktop/mobile geometry matrix incomplete' );
foreach ( $g['measurements'] as $measurement ) {
    req( 1 === ( $measurement['native_wrapper_count'] ?? null ), 'Native wrapper count mismatch' );
    req( 1 === ( $measurement['native_grid_count'] ?? null ), 'Native grid count mismatch' );
    req( 1 === ( $measurement['search_count'] ?? null ), 'Native Search count mismatch' );
    req( 1 === ( $measurement['pager_count'] ?? null ), 'Native pager count mismatch' );
    req( 1 === ( $measurement['manual_refresh_count'] ?? null ), 'Manual reload utility count mismatch' );
    req( 0 === ( $measurement['card_node_count'] ?? null ), 'Card Mode markup remains in geometry evidence' );
    req( 0 === ( $measurement['card_column_count'] ?? null ), 'gpp_case_card remains in geometry evidence' );
    req( 0 === ( $measurement['replacement_widget_count'] ?? null ), 'Replacement Inbox remains in geometry evidence' );
    req( ( $measurement['native_row_count'] ?? 0 ) > 0, 'Native geometry captured no rows' );
    req( ( $measurement['document_horizontal_overflow_px'] ?? 9999 ) <= 4, 'Native geometry document overflow' );
}

$bound_visual = isset( $e['visual_regression_diagnostics'] ) && is_array( $e['visual_regression_diagnostics'] ) ? $e['visual_regression_diagnostics'] : null;
$actual_visual = wu21_assert_visual_diagnostics_manifest( $dir, $bound_visual );
req( 'RECURSIVE_EVIDENCE_JSON_JSONL_PNG_V1' === ( $actual_visual['inclusion_policy'] ?? null ), 'Visual diagnostics inclusion policy mismatch' );
req( array( '.json', '.jsonl', '.png' ) === ( $actual_visual['included_extensions'] ?? null ), 'Visual diagnostics included extensions mismatch' );
$paths = array_map( function ( $file ) { return $file['path'] ?? null; }, $actual_visual['files'] ?? array() );
foreach ( array( 'empty-state-seam.json', 'matrix-j-browser-zoom.json', 'manifest.json', 'native-first-desktop-1440.json', 'native-first-mobile-390.json' ) as $required_visual ) {
    req( in_array( $required_visual, $paths, true ), 'Required Native-First diagnostic is unbound: ' . $required_visual );
}
$visual_manifest = rjson( $dir . '/visual-regression-diagnostics/manifest.json' );
req( '2.0.0' === ( $visual_manifest['schema_version'] ?? null ), 'Native-First diagnostic manifest schema mismatch' );
req( 'NATIVE_FIRST_STRUCTURAL_DIAGNOSTIC' === ( $visual_manifest['evidence_kind'] ?? null ), 'Native-First diagnostic kind mismatch' );
req( getenv( 'GPP_WU21_REPOSITORY_SHA' ) === ( $visual_manifest['repository_sha'] ?? null ), 'Native-First diagnostic repository SHA mismatch' );
req( 'NATIVE_FIRST' === ( $visual_manifest['architecture'] ?? null ), 'Native-First diagnostic architecture mismatch' );
req( 'CARD_MODE' === ( $visual_manifest['superseded_architecture'] ?? null ), 'Diagnostic does not identify retired Card Mode' );
req( 'NOT_ATTEMPTED_OUT_OF_SCOPE' === ( $visual_manifest['visual_golden_admission'] ?? null ), 'Diagnostic improperly claims visual Golden admission' );
req( 'PASS' === ( $visual_manifest['status'] ?? null ), 'Native-First structural diagnostic is not PASS' );
foreach ( array( 'empty-state-seam.json', 'matrix-j-browser-zoom.json' ) as $legacy_file ) {
    $legacy = rjson( $dir . '/visual-regression-diagnostics/' . $legacy_file );
    req( 'NOT_APPLICABLE_NATIVE_FIRST_RESET' === ( $legacy['status'] ?? null ), $legacy_file . ' must be explicitly retired rather than treated as PASS' );
}

$copy = $e; $actual = $copy['content_digest']['value']; unset( $copy['content_digest'] ); $expected = hash( 'sha256', cj( $copy ) );
req( hash_equals( $expected, $actual ), 'Content digest mismatch' );
req( 'wu21-repro-evidence-' . $actual . '.json' === $filename, 'Content-addressed filename mismatch' );
echo "PASS WU21 Native-First evidence validation digest={$actual}\n";
