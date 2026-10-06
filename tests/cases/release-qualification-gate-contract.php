<?php

/**
 * Return release-qualification ownership contract violations for the supplied
 * source strings.
 *
 * Mechanical scope is intentionally bounded. This contract proves the current
 * supported release representations: one canonical waiter path/reference,
 * one supported canonical waiter shell invocation, no direct Journey workflow
 * filename/name reference, and no direct literal repo-owned Journey PHP/MJS
 * runtime entrypoint that is itself referenced by the canonical Journey
 * workflow. It does not claim semantic detection of arbitrary aliases,
 * generated command strings, opaque wrapper scripts, or future representations
 * outside this bounded set.
 *
 * @param string $wait    Canonical waiter source.
 * @param string $release Production release workflow source.
 * @param string $journey Canonical Journey workflow source.
 * @return array<int,string>
 */
function gpp_release_qualification_contract_errors( $wait, $release, $journey ) {
    $errors = array();

    if ( 1 !== preg_match( '/WORKFLOWS=\(\s*(.*?)\n\)/s', $wait, $match ) ) {
        $errors[] = 'canonical workflow set unavailable';
        return $errors;
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

    $journey_cardinality = 0;
    foreach ( $actual as $workflow ) {
        if ( 'srwf-journey-host-qualification.yml' === $workflow ) {
            $journey_cardinality++;
        }
    }
    if ( 1 !== $journey_cardinality ) {
        $errors[] = 'Journey workflow cardinality must be exactly one in canonical waiter set';
    }

    if ( $actual !== $expected ) {
        $errors[] = 'canonical workflow set drifted: ' . json_encode(
            array( 'expected' => $expected, 'actual' => $actual ),
            JSON_UNESCAPED_SLASHES
        );
    }

    if ( count( $actual ) !== count( array_unique( $actual ) ) ) {
        $errors[] = 'duplicate required workflow in canonical waiter set';
    }

    $required_wait_markers = array(
        'gh workflow run "$workflow" --ref "$BRANCH"',
        'select(.headSha == $sha)',
        '[[ "$observed_sha" == "$SHA" ]]',
        '[[ "$conclusion" == \'success\' ]]',
    );
    foreach ( $required_wait_markers as $marker ) {
        if ( false === strpos( $wait, $marker ) ) {
            $errors[] = 'exact-candidate guard missing: ' . $marker;
        }
    }

    if ( false === strpos( $journey, 'workflow_dispatch:' ) ) {
        $errors[] = 'Journey workflow is not dispatchable by canonical waiter';
    }

    $waiter_path = 'scripts/release/wait-qualifications.sh';
    if ( 1 !== substr_count( $release, $waiter_path ) ) {
        $errors[] = 'canonical waiter path cardinality must be exactly one in release.yml';
    }

    $waiter_invocation_pattern = '~(?m)^[ \t]*(?:run:[ \t]*)?(?:bash[ \t]+)?(?:\./)?scripts/release/wait-qualifications\.sh(?=[ \t"\']|$)~';
    $waiter_invocation_count = preg_match_all( $waiter_invocation_pattern, $release, $waiter_invocations );
    if ( 1 !== $waiter_invocation_count ) {
        $errors[] = 'supported canonical waiter invocation cardinality must be exactly one in release.yml';
    }

    $direct_journey_workflow_markers = array(
        'srwf-journey-host-qualification.yml',
        'SRWF Journey Host Qualification',
    );
    foreach ( $direct_journey_workflow_markers as $marker ) {
        if ( false !== strpos( $release, $marker ) ) {
            $errors[] = 'direct Journey workflow reference forbidden in release.yml: ' . $marker;
        }
    }

    preg_match_all(
        '~tests/repro-evidence-lab/srwf-journey-(?:host|production)-[A-Za-z0-9._-]+\.(?:php|mjs)~',
        $journey,
        $journey_entrypoint_matches
    );
    $journey_entrypoints = isset( $journey_entrypoint_matches[0] )
        ? array_values( array_unique( $journey_entrypoint_matches[0] ) )
        : array();

    if ( array() === $journey_entrypoints ) {
        $errors[] = 'canonical Journey workflow exposes no bounded repo-owned PHP/MJS entrypoint set';
    }

    foreach ( $journey_entrypoints as $entrypoint ) {
        if ( false !== strpos( $release, $entrypoint ) ) {
            $errors[] = 'direct Journey runtime entrypoint forbidden in release.yml: ' . $entrypoint;
        }
    }

    return array_values( array_unique( $errors ) );
}

/**
 * @param string            $label   Control label.
 * @param array<int,string> $errors  Observed errors.
 * @param string|null       $needle  Required error substring for negative controls.
 * @return void
 */
function gpp_release_qualification_assert_control( $label, $errors, $needle = null ) {
    if ( null === $needle ) {
        if ( array() !== $errors ) {
            fwrite(
                STDERR,
                'GPP_RELEASE_QUALIFICATION_CONTROL_FAIL: ' . $label . ': ' . implode( ' | ', $errors ) . "\n"
            );
            exit( 1 );
        }

        echo 'GPP_RELEASE_QUALIFICATION_CONTROL_PASS: ' . $label . "\n";
        return;
    }

    if ( array() === $errors ) {
        fwrite( STDERR, 'GPP_RELEASE_QUALIFICATION_CONTROL_FAIL: ' . $label . ": mutation was accepted\n" );
        exit( 1 );
    }

    foreach ( $errors as $error ) {
        if ( false !== strpos( $error, $needle ) ) {
            echo 'GPP_RELEASE_QUALIFICATION_CONTROL_PASS: ' . $label . ' -> ' . $error . "\n";
            return;
        }
    }

    fwrite(
        STDERR,
        'GPP_RELEASE_QUALIFICATION_CONTROL_FAIL: ' . $label . ': expected rejection containing ' .
        $needle . '; observed ' . implode( ' | ', $errors ) . "\n"
    );
    exit( 1 );
}

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

// Positive control: the current canonical waiter + production release delegation.
$current_errors = gpp_release_qualification_contract_errors( $wait, $release, $journey );
gpp_release_qualification_assert_control( 'POSITIVE_CURRENT_VALID', $current_errors );

// Positive representation control: the normal source must expose one supported
// canonical waiter invocation and no second direct supported Journey path.
gpp_release_qualification_assert_control( 'POSITIVE_SINGLE_CANONICAL_DELEGATION', $current_errors );

$journey_line = "  'srwf-journey-host-qualification.yml'\n";

$omitted_wait = str_replace( $journey_line, '', $wait, $omitted_count );
if ( 1 !== $omitted_count ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: omitted-Journey mutation setup drifted\n" );
    exit( 1 );
}
gpp_release_qualification_assert_control(
    'OMITTED_JOURNEY_REJECTED',
    gpp_release_qualification_contract_errors( $omitted_wait, $release, $journey ),
    'Journey workflow cardinality must be exactly one'
);

$duplicate_wait = str_replace( $journey_line, $journey_line . $journey_line, $wait, $duplicate_wait_count );
if ( 1 !== $duplicate_wait_count ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: duplicate-waiter-set mutation setup drifted\n" );
    exit( 1 );
}
gpp_release_qualification_assert_control(
    'DUPLICATE_WAITER_SET_REJECTED',
    gpp_release_qualification_contract_errors( $duplicate_wait, $release, $journey ),
    'Journey workflow cardinality must be exactly one'
);

$release_waiter_line = '        run: bash scripts/release/wait-qualifications.sh "$GPP_RELEASE_CANDIDATE_BRANCH" "$GPP_RELEASE_CANDIDATE_SHA" build/release/qualification.json';
$duplicate_release_step = $release_waiter_line . "\n\n" .
    "      - name: EC mutation duplicate canonical waiter\n" .
    "        shell: bash\n" .
    '        run: bash scripts/release/wait-qualifications.sh "$GPP_RELEASE_CANDIDATE_BRANCH" "$GPP_RELEASE_CANDIDATE_SHA" build/release/qualification-duplicate.json';
$duplicate_release = str_replace( $release_waiter_line, $duplicate_release_step, $release, $duplicate_release_count );
if ( 1 !== $duplicate_release_count ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: duplicate-release-delegation mutation setup drifted\n" );
    exit( 1 );
}
gpp_release_qualification_assert_control(
    'DUPLICATE_RELEASE_DELEGATION_REJECTED',
    gpp_release_qualification_contract_errors( $wait, $duplicate_release, $journey ),
    'canonical waiter path cardinality must be exactly one'
);

$direct_workflow_step = $release_waiter_line . "\n\n" .
    "      - name: EC mutation direct Journey workflow\n" .
    "        shell: bash\n" .
    '        run: gh workflow run srwf-journey-host-qualification.yml --ref "$GPP_RELEASE_CANDIDATE_BRANCH"';
$direct_workflow_release = str_replace( $release_waiter_line, $direct_workflow_step, $release, $direct_workflow_count );
if ( 1 !== $direct_workflow_count ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: direct-Journey-workflow mutation setup drifted\n" );
    exit( 1 );
}
gpp_release_qualification_assert_control(
    'DIRECT_JOURNEY_WORKFLOW_REFERENCE_REJECTED',
    gpp_release_qualification_contract_errors( $wait, $direct_workflow_release, $journey ),
    'direct Journey workflow reference forbidden'
);

$direct_runtime_step = $release_waiter_line . "\n\n" .
    "      - name: EC mutation direct MR-6 runtime path\n" .
    "        shell: bash\n" .
    '        run: node tests/repro-evidence-lab/srwf-journey-production-mr6-integrated-browser.mjs';
$direct_runtime_release = str_replace( $release_waiter_line, $direct_runtime_step, $release, $direct_runtime_count );
if ( 1 !== $direct_runtime_count ) {
    fwrite( STDERR, "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_FAIL: direct-Journey-runtime mutation setup drifted\n" );
    exit( 1 );
}
gpp_release_qualification_assert_control(
    'DIRECT_JOURNEY_RUNTIME_PATH_REJECTED',
    gpp_release_qualification_contract_errors( $wait, $direct_runtime_release, $journey ),
    'direct Journey runtime entrypoint forbidden'
);

echo "GPP_RELEASE_QUALIFICATION_GATE_CONTRACT_PASS\n";
