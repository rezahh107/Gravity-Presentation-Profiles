<?php

$root = dirname( __DIR__, 2 );
$workflow_path = $root . '/.github/workflows/srwf-journey-host-qualification.yml';
$setup_path = $root . '/tests/repro-evidence-lab/srwf-journey-production-mr6-setup.php';
$browser_path = $root . '/tests/repro-evidence-lab/srwf-journey-production-mr6-integrated-browser.mjs';

$workflow = file_get_contents( $workflow_path );
$setup = file_get_contents( $setup_path );
$browser = file_get_contents( $browser_path );
if ( false === $workflow || false === $setup || false === $browser ) {
    fwrite( STDERR, "GPP_SRWf_JOURNEY_MR6_CONTRACT_FAIL: integrated acceptance source unavailable\n" );
    exit( 1 );
}

foreach ( array(
    'tests/repro-evidence-lab/srwf-journey-production-mr6-setup.php',
    'tests/repro-evidence-lab/srwf-journey-production-mr6-integrated-browser.mjs',
    'REPRODUCIBLE_PINNED_FORWARD_HELLO',
    'j.results.length!==6',
) as $marker ) {
    if ( false === strpos( $workflow, $marker ) ) {
        fwrite( STDERR, 'GPP_SRWF_JOURNEY_MR6_CONTRACT_FAIL: Journey workflow marker missing: ' . $marker . "\n" );
        exit( 1 );
    }
}

foreach ( array(
    'InboxSetupService::forWordPress()->initialize',
    'BindingRepairService::forWordPress()',
    '[gravityflow page="inbox" form="',
    'rtl_host_control_enabled',
) as $marker ) {
    if ( false === strpos( $setup, $marker ) ) {
        fwrite( STDERR, 'GPP_SRWF_JOURNEY_MR6_CONTRACT_FAIL: production-path setup marker missing: ' . $marker . "\n" );
        exit( 1 );
    }
}

foreach ( array(
    'for (const width of [1440, 390, 320])',
    'Inbox → Review → Correction → Review → Approved → Inbox',
    'Inbox → Review → Rejected → Inbox',
    "await openFromInbox(page, entryId, width",
    "await correctionAndValidation(page, entryId, width)",
    "await accept(page, 'approved')",
    "await accept(page, 'rejected')",
    'await returnToInbox(page, width)',
    "hostFacts.theme !== 'hello-elementor'",
    'hostFacts.gtb_active !== true',
    'hostFacts.host_companion_active !== false',
) as $marker ) {
    if ( false === strpos( $browser, $marker ) ) {
        fwrite( STDERR, 'GPP_SRWF_JOURNEY_MR6_CONTRACT_FAIL: connected acceptance marker missing: ' . $marker . "\n" );
        exit( 1 );
    }
}

if ( false !== strpos( $browser, 'page.route(' ) ) {
    fwrite( STDERR, "GPP_SRWF_JOURNEY_MR6_CONTRACT_FAIL: integrated happy paths must not fake host responses\n" );
    exit( 1 );
}

echo "GPP_SRWF_JOURNEY_MR6_CONTRACT_PASS\n";
