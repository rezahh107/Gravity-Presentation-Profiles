<?php

$root = dirname( __DIR__, 2 );
$wait_path = $root . '/scripts/release/wait-qualifications.sh';
$release_path = $root . '/.github/workflows/release.yml';
$journey_path = $root . '/.github/workflows/srwf-journey-host-qualification.yml';

$wait = file_get_contents( $wait_path );
$release = file_get_contents( $release_path );
$journey = file_get_contents( $journey_path );

if ( false === $wait || false === $release || false === $journey ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: required source unavailable\n" );
    exit( 1 );
}

if ( 1 !== preg_match( '/WORKFLOWS=\(\s*(.*?)\n\)/s', $wait, $match ) ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: canonical workflow set unavailable\n" );
    exit( 1 );
}

preg_match_all( "/'([^']+\\.yml)'/", $match[1], $workflow_matches );
$actual = isset( $workflow_matches[1] ) ? array_values( $workflow_matches[1] ) : array();
$expected = array(
    'ci.yml',
    'wu21-repro-evidence-lab.yml',
    'srwf-registration-runtime.yml',
    'srwf-journey-host-qualification.yml',
    'wu18-entry-detail-runtime.yml',
    'wu19-a4-print-runtime.yml',
);

if ( $actual !== $expected ) {
    fwrite(
        STDERR,
        'GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: canonical workflow set drifted: ' .
        json_encode( array( 'expected' => $expected, 'actual' => $actual ), JSON_UNESCAPED_SLASHES ) . "\n"
    );
    exit( 1 );
}

if ( count( $actual ) !== count( array_unique( $actual ) ) ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: duplicate required workflow\n" );
    exit( 1 );
}

$required_wait_markers = array(
    'gh workflow run "$workflow" --ref "$BRANCH"',
    'select(.headSha == $sha)',
    '[[ "$observed_sha" == "$SHA" ]]',
    '[[ "$conclusion" == \'success\' ]]',
);
foreach ( $required_wait_markers as $marker ) {
    if ( false === strpos( $wait, $marker ) ) {
        fwrite( STDERR, 'GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: exact-candidate guard missing: ' . $marker . "\n" );
        exit( 1 );
    }
}

if ( false === strpos( $journey, "workflow_dispatch:" ) ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: Journey workflow is not dispatchable by the canonical waiter\n" );
    exit( 1 );
}

if ( false === strpos( $release, 'scripts/release/wait-qualifications.sh' ) ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: release workflow bypasses canonical waiter\n" );
    exit( 1 );
}

if ( false !== strpos( $release, 'srwf-journey-host-qualification.yml' ) ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: Journey qualification duplicated inside release.yml\n" );
    exit( 1 );
}

echo "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_PASS\n";
