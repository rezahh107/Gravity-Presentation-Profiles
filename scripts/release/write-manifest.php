<?php

$options = getopt(
    '',
    array(
        'output:', 'mode:', 'source-sha:', 'version:', 'zip:', 'sha256:',
        'validation:', 'smoke:', 'qualification:', 'run-id::', 'candidate-sha::',
    )
);
$required = array( 'output', 'mode', 'source-sha', 'version', 'zip', 'sha256', 'validation', 'smoke', 'qualification' );
foreach ( $required as $key ) {
    if ( ! isset( $options[ $key ] ) || '' === (string) $options[ $key ] ) {
        fwrite( STDERR, 'GPP_RELEASE_MANIFEST_FAIL: missing --' . $key . PHP_EOL );
        exit( 1 );
    }
}
if ( ! preg_match( '/^[0-9a-f]{40}$/', (string) $options['source-sha'] ) ) {
    fwrite( STDERR, "GPP_RELEASE_MANIFEST_FAIL: invalid source SHA.\n" );
    exit( 1 );
}
if ( ! preg_match( '/^[0-9a-f]{64}$/', (string) $options['sha256'] ) ) {
    fwrite( STDERR, "GPP_RELEASE_MANIFEST_FAIL: invalid ZIP SHA-256.\n" );
    exit( 1 );
}

$manifest = array(
    'schema_version' => '1.0.0',
    'release_unit' => 'gravity-presentation-profiles',
    'mode' => (string) $options['mode'],
    'source_commit' => (string) $options['source-sha'],
    'candidate_commit' => isset( $options['candidate-sha'] ) && '' !== (string) $options['candidate-sha'] ? (string) $options['candidate-sha'] : 'NOT_CREATED_DRY_RUN',
    'release_version' => (string) $options['version'],
    'zip_filename' => basename( (string) $options['zip'] ),
    'zip_sha256' => (string) $options['sha256'],
    'builder' => 'scripts/release/build-release.sh@1',
    'run_identity' => isset( $options['run-id'] ) ? (string) $options['run-id'] : 'local',
    'artifact_structure_validation' => (string) $options['validation'],
    'exact_zip_smoke_test' => (string) $options['smoke'],
    'required_qualification' => (string) $options['qualification'],
    'publication' => 'dry-run' === (string) $options['mode'] ? 'NOT_ATTEMPTED_DRY_RUN' : 'PENDING',
);

$json = json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
if ( false === file_put_contents( (string) $options['output'], $json ) ) {
    fwrite( STDERR, "GPP_RELEASE_MANIFEST_FAIL: cannot write manifest.\n" );
    exit( 1 );
}
echo "GPP_RELEASE_MANIFEST_PASS\n";
