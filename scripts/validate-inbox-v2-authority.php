<?php

declare(strict_types=1);

const INBOX_V2_REFERENCE = 'docs/design/references/GPP_INBOX_VISUAL_DESIGN_V2_OWNER_APPROVED_1440.png';
const INBOX_V2_CONTRACT = 'docs/visual/SRWF_INBOX_V2_VISUAL_UX_CONTRACT_v1.0.0.md';
const INBOX_V2_OLD_CONTRACT = 'docs/visual/SRWF_GRAVITY_FLOW_A4_VISUAL_BASELINE_CONTRACT_v1.0.0.md';
const INBOX_V2_INDEX = 'docs/visual/README.md';
const INBOX_V2_CSS = 'assets/css/srwf-gravity-flow-inbox-native.css';
const INBOX_V2_DIAGNOSTIC = 'tests/visual-regression/inbox-visual-contract.json';
const INBOX_V2_REFERENCE_SHA = 'f89d689f9b04f7e8558814239ed71512cd29d7ac417f8d3f09e5d25c5eda00b0';

function inbox_v2_require( bool $condition, string $message ): void {
    if ( ! $condition ) {
        throw new RuntimeException( $message );
    }
}

function inbox_v2_sources( string $root ): array {
    $sources = array();
    foreach ( array( INBOX_V2_REFERENCE, INBOX_V2_CONTRACT, INBOX_V2_OLD_CONTRACT, INBOX_V2_INDEX, INBOX_V2_CSS, INBOX_V2_DIAGNOSTIC ) as $file ) {
        $content = file_get_contents( $root . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $file ) );
        inbox_v2_require( false !== $content, 'Missing Inbox V2 authority source: ' . $file );
        $sources[ $file ] = $content;
    }
    return $sources;
}

function inbox_v2_exact_line( string $source, string $line, string $label ): void {
    $lines = preg_split( '/\r?\n/', $source );
    inbox_v2_require( 1 === count( array_filter( $lines, static fn ( string $candidate ): bool => $candidate === $line ) ), $label . ' must occur exactly once: ' . $line );
}

function inbox_v2_validate( array $source ): void {
    $contract = $source[ INBOX_V2_CONTRACT ];
    $old      = $source[ INBOX_V2_OLD_CONTRACT ];
    $index    = $source[ INBOX_V2_INDEX ];
    $css      = preg_replace( '~\/\*[\s\S]*?\*\/~', '', $source[ INBOX_V2_CSS ] );
    $image    = $source[ INBOX_V2_REFERENCE ];
    $diagnostic = json_decode( $source[ INBOX_V2_DIAGNOSTIC ], true, 512, JSON_THROW_ON_ERROR );

    foreach ( array(
        'document_id: GPP-SRWF-INBOX-V2-VISUAL-UX-CONTRACT',
        'status: OWNER_LOCKED__ADMITTED_IN_PR_HEAD',
        'scope: GRAVITY_FLOW_INBOX_ONLY',
        'supersedes: WU15_INBOX_PORTION_ONLY',
        'reference_repository_path: ' . INBOX_V2_REFERENCE,
        'reference_drive_id: 1mGOydyezwOWV5KypzfUJGT5uc7KFftaN',
        'reference_size_bytes: 1271343',
        'reference_sha256: ' . INBOX_V2_REFERENCE_SHA,
        'runtime_golden: NOT_ACTIVATED',
        'approved_visual_contract: NOT_ACTIVATED',
        'target_production_pixel_fidelity: NOT_PROVEN',
    ) as $line ) {
        inbox_v2_exact_line( $contract, $line, 'Successor contract binding' );
    }
    inbox_v2_require( 1271343 === strlen( $image ), 'Owner reference byte length changed' );
    inbox_v2_require( INBOX_V2_REFERENCE_SHA === hash( 'sha256', $image ), 'Owner reference bytes changed' );
    inbox_v2_require( 1 === preg_match( '/\*\*Inbox-only successor notice:\*\*.*SRWF_INBOX_V2_VISUAL_UX_CONTRACT_v1\.0\.0\.md.*supersedes only.*§5.*OD-004 through OD-008/u', $old ), 'WU15 Inbox-only successor notice missing' );
    inbox_v2_require( 1 === preg_match( '/### Current SRWF Inbox V2 successor authority[\s\S]*SRWF_INBOX_V2_VISUAL_UX_CONTRACT_v1\.0\.0\.md/u', $index ), 'Canonical visual index does not admit successor' );
    inbox_v2_require( str_contains( $index, 'historical_wu15_inbox_card_composition: SUPERSEDED_FOR_INBOX_V2_ONLY' ), 'Canonical visual index leaves WU15 Inbox rules ambiguous' );

    preg_match_all( '/font-weight:\s*(\d+)/', $css, $weight_matches );
    foreach ( $weight_matches[1] as $weight ) {
        inbox_v2_require( in_array( (int) $weight, array( 300, 400, 500, 700, 900 ), true ), 'Native Inbox CSS uses an unadmitted font weight' );
    }
    inbox_v2_require( 1 === preg_match( '/\.ag-cell\[col-id="workflow_step"\]\s*\{([^}]*)\}/', $css, $step_match ), 'Native workflow-step paint rule missing' );
    inbox_v2_require( 0 === preg_match( '/font-weight\s*:/', $step_match[1] ), 'Workflow-step weight lacks exact Owner authority and must inherit' );
    inbox_v2_require( 0 === preg_match( '/font-family\s*:/', $css ), 'Native Inbox CSS introduced a separate font family' );
    inbox_v2_require( 'PREVIEW_DIAGNOSTIC' === ( $diagnostic['mode'] ?? null ), 'Historical Inbox visual diagnostic changed mode' );
    inbox_v2_require( false === ( $diagnostic['approved_visual_contract_activated'] ?? null ), 'APPROVED_VISUAL_CONTRACT was activated' );
}

function inbox_v2_expect_reject( array $source, string $file, string $from, string $to, string $label ): void {
    inbox_v2_require( str_contains( $source[ $file ], $from ), $label . ' negative fixture could not mutate' );
    $source[ $file ] = str_replace( $from, $to, $source[ $file ] );
    try {
        inbox_v2_validate( $source );
    } catch ( Throwable $error ) {
        return;
    }
    throw new RuntimeException( $label . ' drift was accepted' );
}

function inbox_v2_falsification( array $source ): void {
    inbox_v2_expect_reject( $source, INBOX_V2_CONTRACT, 'status: OWNER_LOCKED__ADMITTED_IN_PR_HEAD', 'status: NOT_ADMITTED', 'Successor admission' );
    inbox_v2_expect_reject( $source, INBOX_V2_OLD_CONTRACT, '**Inbox-only successor notice:**', '**Historical note:**', 'WU15 Inbox-only successor' );
    inbox_v2_expect_reject( $source, INBOX_V2_INDEX, 'historical_wu15_inbox_card_composition: SUPERSEDED_FOR_INBOX_V2_ONLY', 'historical_wu15_inbox_card_composition: ACTIVE', 'Canonical visual index' );
    inbox_v2_expect_reject( $source, INBOX_V2_CSS, '.ag-cell[col-id="workflow_step"] {', '.ag-cell[col-id="workflow_step"] { font-weight: 600;', 'Synthetic workflow-step weight' );
    inbox_v2_expect_reject( $source, INBOX_V2_DIAGNOSTIC, '"approved_visual_contract_activated": false', '"approved_visual_contract_activated": true', 'Runtime Golden activation' );
    $source[ INBOX_V2_REFERENCE ][0] = chr( ord( $source[ INBOX_V2_REFERENCE ][0] ) ^ 1 );
    try {
        inbox_v2_validate( $source );
    } catch ( Throwable $error ) {
        return;
    }
    throw new RuntimeException( 'Owner reference byte drift was accepted' );
}

try {
    $root = $argv[1] ?? '.';
    $source = inbox_v2_sources( $root );
    inbox_v2_validate( $source );
    if ( in_array( '--self-test', $argv, true ) ) {
        inbox_v2_falsification( $source );
    }
    echo "INBOX_V2_AUTHORITY_PASS admitted_successor=true scoped_wu15_supersession=true reference_bytes_verified=true typography_guarded=true runtime_golden_inactive=true\n";
} catch ( Throwable $error ) {
    fwrite( STDERR, 'INBOX_V2_AUTHORITY_FAIL: ' . $error->getMessage() . "\n" );
    exit( 1 );
}
