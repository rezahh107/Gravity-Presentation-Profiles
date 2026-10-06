<?php

$root = dirname( __DIR__, 2 );
$workflow_path = $root . '/.github/workflows/srwf-journey-host-qualification.yml';
$split_setup_path = $root . '/tests/repro-evidence-lab/srwf-journey-production-split-assignee-setup.php';

$workflow = file_get_contents( $workflow_path );
$split_setup = file_get_contents( $split_setup_path );
if ( false === $workflow || false === $split_setup ) {
    fwrite( STDERR, "GPP_SRWF_JOURNEY_WORKFLOW_ISOLATION_CONTRACT_FAIL: qualification source unavailable\n" );
    exit( 1 );
}

$mr6_setup = strpos( $workflow, 'eval-file tests/repro-evidence-lab/srwf-journey-production-mr6-setup.php' );
$mr6_browser = strpos( $workflow, 'node tests/repro-evidence-lab/srwf-journey-production-mr6-integrated-browser.mjs' );
$negative_controls = strpos( $workflow, 'node tests/repro-evidence-lab/srwf-journey-production-negative-controls.mjs' );

if ( false === $mr6_setup || false === $mr6_browser || false === $negative_controls ) {
    fwrite( STDERR, "GPP_SRWF_JOURNEY_WORKFLOW_ISOLATION_CONTRACT_FAIL: required Journey execution marker missing\n" );
    exit( 1 );
}

if ( ! ( $mr6_setup < $mr6_browser && $mr6_browser < $negative_controls ) ) {
    fwrite( STDERR, "GPP_SRWF_JOURNEY_WORKFLOW_ISOLATION_CONTRACT_FAIL: positive MR-6 journey must complete before topology-mutating negative controls\n" );
    exit( 1 );
}

foreach ( array(
    "'topology_mutation_scope' => 'shared_form_until_end_of_run'",
    "'topology_cleanup' => false",
    '$api->add_step(',
) as $marker ) {
    if ( false === strpos( $split_setup, $marker ) ) {
        fwrite( STDERR, 'GPP_SRWF_JOURNEY_WORKFLOW_ISOLATION_CONTRACT_FAIL: destructive split-assignee marker missing: ' . $marker . "\n" );
        exit( 1 );
    }
}

if ( substr_count( $split_setup, '$api->add_step(' ) < 2 ) {
    fwrite( STDERR, "GPP_SRWF_JOURNEY_WORKFLOW_ISOLATION_CONTRACT_FAIL: split-assignee control no longer proves both workflow-step mutations\n" );
    exit( 1 );
}

echo "GPP_SRWF_JOURNEY_WORKFLOW_ISOLATION_CONTRACT_PASS\n";
