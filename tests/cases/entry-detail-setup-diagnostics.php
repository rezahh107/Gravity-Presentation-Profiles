<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\LifecycleException;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupDiagnosticStore;

Autoloader::register();

final class EntryDetailDiagnosticMemoryStore implements StateStore {
    private $state = null;
    public function load() { return $this->state; }
    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) return false;
        $this->state = $next_state;
        return true;
    }
}

$store = new EntryDetailSetupDiagnosticStore( new EntryDetailDiagnosticMemoryStore() );
$initial = $store->snapshot();
gpp_assert_same( null, $initial['latest_attempt'], 'No setup attempt is invented before an explicit action.' );

$completed = $store->record(
    array(
        'selected_form_id' => 11,
        'result' => 'COMPLETED',
        'step' => 'cross_surface_preservation',
        'reason_code' => 'entry_detail_setup_completed',
        'binding_set' => array(
            'binding_set_id' => 'srwf.operations.environment.f11',
            'binding_set_version' => '1.0.27',
        ),
        'entry_detail_activation' => array(
            'package_id' => 'srwf.operations.presentation',
            'package_version' => '1.0.1',
            'profile_id' => 'srwf.operations.entry-detail.v1',
        ),
    )
);
gpp_assert_same( true, $completed['attempted'], 'Successful setup is explicitly recorded as attempted.' );
gpp_assert_same( 11, $completed['selected_form_id'], 'Selected form id is diagnostic context.' );
gpp_assert_same( 'COMPLETED', $completed['result'], 'Success result is bounded.' );
gpp_assert_same( '1.0.27', $completed['binding_set']['binding_set_version'], 'Successful binding lifecycle identity is retained.' );
gpp_assert_same( 'srwf.operations.entry-detail.v1', $completed['entry_detail_activation']['profile_id'], 'Successful visual activation identity is retained.' );
gpp_assert_true( ! isset( $completed['entry_id'] ) && ! isset( $completed['user_id'] ) && ! isset( $completed['message'] ) && ! isset( $completed['exception'] ), 'Diagnostic record contains no request-local or arbitrary exception payload.' );

$failed = $store->record(
    array(
        'selected_form_id' => 12,
        'result' => 'FAILED',
        'step' => 'binding_context',
        'reason_code' => 'entry_detail_binding_context_missing',
        'binding_set' => null,
        'entry_detail_activation' => null,
    )
);
gpp_assert_same( 'FAILED', $failed['result'], 'Failure result is bounded.' );
gpp_assert_same( 'binding_context', $failed['step'], 'Failure identifies the bounded setup stage.' );
gpp_assert_same( 'entry_detail_binding_context_missing', $failed['reason_code'], 'Failure retains only the lifecycle reason code.' );
gpp_assert_same( null, $failed['binding_set'], 'Failed setup does not fabricate a resulting binding identity.' );
gpp_assert_same( null, $failed['entry_detail_activation'], 'Failed setup does not fabricate an activation identity.' );

$rejected = false;
try {
    $store->record(
        array(
            'selected_form_id' => 12,
            'result' => 'FAILED',
            'step' => 'binding_context',
            'reason_code' => 'site path /home/example and user data',
        )
    );
} catch ( LifecycleException $exception ) {
    $rejected = 'invalid_entry_detail_setup_diagnostic' === $exception->reasonCode();
}
gpp_assert_true( $rejected, 'Arbitrary diagnostic text is rejected rather than persisted.' );

echo "ENTRY_DETAIL_SETUP_DIAGNOSTICS_TESTS_PASS\n";
