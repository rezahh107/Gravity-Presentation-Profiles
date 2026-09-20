<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\GravityForms\InboxSetupService;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

$base = get_option( 'gpp_wu21_fixture_manifest' );
if ( ! is_array( $base ) || empty( $base['forms'] ) || ! isset( $manifest['alpha']['form_id'] ) ) {
    throw new RuntimeException( 'WU18 Inbox provider fixture context is unavailable.' );
}

$entry_detail_form_id = (int) $manifest['alpha']['form_id'];
$inbox_form_id = 0;
foreach ( $base['forms'] as $form_meta ) {
    if ( is_array( $form_meta ) && ! empty( $form_meta['form_id'] ) && (int) $form_meta['form_id'] !== $entry_detail_form_id ) {
        $inbox_form_id = (int) $form_meta['form_id'];
        break;
    }
}

wu18_assert( $inbox_form_id > 0, 'WU18 has no independent Inbox form to re-qualify after form extension.' );
$result = InboxSetupService::forWordPress()->initialize( array( 'form_id' => $inbox_form_id ) );
wu18_assert(
    is_array( $result ) && InboxSetupService::STATUS_COMPLETED === $result['status'],
    'Production Inbox setup could not re-qualify the independent form after WU18 form extension.'
);
wu18_assert(
    isset( $result['steps']['runtime_readiness']['outcome'] )
        && in_array( $result['steps']['runtime_readiness']['outcome'], array( 'qualified', 'already_qualified' ), true ),
    'Production Inbox setup did not establish runtime readiness for provider evidence.'
);

InboxPresentationAdapter::resetRuntimeCache();

echo "WU18_INBOX_PROVIDER_FIXTURE_READY\n";
