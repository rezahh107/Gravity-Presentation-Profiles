<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;

Autoloader::register();

$adapter = new ReflectionClass( EntryDetailPresentationAdapter::class );
$selector = $adapter->getMethod( 'singleAuthoritativeFile' );
$selector->setAccessible( true );

gpp_assert_same(
    'https://example.test/report.pdf',
    $selector->invoke( null, array( ' https://example.test/report.pdf ' ) ),
    'Exactly one non-empty host file is the only admitted report-card selection.'
);
gpp_assert_same(
    null,
    $selector->invoke( null, array() ),
    'Missing report-card files remain unresolved.'
);
gpp_assert_same(
    null,
    $selector->invoke( null, array( 'https://example.test/a.pdf', 'https://example.test/b.pdf' ) ),
    'Multiple report-card files must fail closed instead of choosing the first.'
);
gpp_assert_same(
    null,
    $selector->invoke( null, array( '', '   ' ) ),
    'Blank file identities do not become an authoritative report card.'
);

echo "ENTRY_DETAIL_REPORT_CARD_SELECTION_PASS\n";
