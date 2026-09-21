<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
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

// The production setup service legitimately advances the independent Inbox
// binding version. Rebase the later workflow-transition invariant on that fully
// prepared fixture state so post-browser evidence proves that the Approval
// transition itself does not mutate/rebuild EnvironmentBindingSet state.
$binding_state_after_provider_setup = hash(
    'sha256',
    wp_json_encode( get_option( BindingSetLifecycle::OPTION_NAME ) )
);
wu18_assert( '' !== $binding_state_after_provider_setup, 'WU18 provider fixture binding-state baseline is unavailable.' );
$manifest['binding_state_sha256_before_inbox_provider_requalification'] = isset( $manifest['binding_state_sha256'] )
    ? $manifest['binding_state_sha256']
    : null;
$manifest['binding_state_sha256'] = $binding_state_after_provider_setup;
update_option( 'gpp_wu18_fixture_manifest', $manifest, false );

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( is_string( $artifact_dir ) && '' !== $artifact_dir ) {
    file_put_contents(
        trailingslashit( $artifact_dir ) . 'wu18-fixture-manifest.json',
        wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
    );
}

InboxPresentationAdapter::resetRuntimeCache();

echo "WU18_INBOX_PROVIDER_FIXTURE_READY\n";
