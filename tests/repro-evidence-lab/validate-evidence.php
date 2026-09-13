<?php
$repo = dirname( __DIR__, 2 );
$dir = getenv( 'WU21_ARTIFACT_DIR' );
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
req( 'shared.inbox.v1' === $e['fixture_manifest']['surface_profile_id'], 'Shared Inbox profile mismatch' );
$expected_ids = array_merge(
    array_map( function ( $i ) { return sprintf( 'WU21-PHP-%03d', $i ); }, range( 1, 17 ) ),
    array_map( function ( $i ) { return sprintf( 'WU21-BROWSER-%03d', $i ); }, range( 1, 6 ) )
);
$actual_ids = array_map( function ( $t ) { return isset( $t['id'] ) ? $t['id'] : null; }, $e['tests'] );
$unique_ids = array_values( array_unique( $actual_ids ) );
sort( $unique_ids, SORT_STRING );
sort( $expected_ids, SORT_STRING );
req( count( $actual_ids ) === count( $unique_ids ) && $unique_ids === $expected_ids, 'Required test ID set mismatch' );
req( 'UNBOUND' === $e['fixture_manifest']['optional_capabilities']['school.name'], 'School must remain UNBOUND' );
req( 'NOT_PROVEN' === $e['fixture_manifest']['optional_capabilities']['workflow.due_at'], 'Due must remain NOT_PROVEN' );
foreach ( $e['tests'] as $t ) req( 'PASS' === $t['status'], 'Required test failed/not-run: ' . $t['id'] );
foreach ( $e['mechanics'] as $name => $m ) req( 'PROVEN_IN_REPRODUCIBLE_SIMULATION' === $m['state'], 'Mechanic not proven: ' . $name );
for ( $i=1; $i<=10; $i++ ) { $id=sprintf('AC-WU21-%03d',$i); req( 'PASS' === $e['acceptance_criteria'][$id]['status'], 'Acceptance criterion not PASS: ' . $id ); }
req( 'UNBOUND' === $e['target_production_facts']['form_ids'], 'Production form IDs must remain UNBOUND' );
req( 'NOT_PROVEN' === $e['target_production_facts']['plugin_license_configuration'], 'Production plugin/license config must remain NOT_PROVEN' );
$copy = $e; $actual = $copy['content_digest']['value']; unset( $copy['content_digest'] ); $expected = hash( 'sha256', cj( $copy ) );
req( hash_equals( $expected, $actual ), 'Content digest mismatch' );
req( 'wu21-repro-evidence-' . $actual . '.json' === $filename, 'Content-addressed filename mismatch' );
echo "PASS WU21 evidence validation digest={$actual}\n";
