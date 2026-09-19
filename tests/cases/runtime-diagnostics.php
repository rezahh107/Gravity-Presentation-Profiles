<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeIncidentStore;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierDecisionTrace;

Autoloader::register();

final class GppDiagnosticsMemoryStore implements StateStore {
    private $state = null;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

$trace = new RuntimeDecisionTrace( 'gravity_flow.inbox' );
gpp_assert_true( $trace->record( 'INBOX_PROFILE_RESOLUTION', RuntimeDecisionTrace::RESULT_PASS ), 'Profile stage must accept the shared PASS vocabulary.' );
gpp_assert_true( $trace->record( 'INBOX_BINDING_READINESS', RuntimeDecisionTrace::RESULT_FAIL, 'availability_not_proven', 'native_gravity_flow_inbox' ), 'Binding failure must accept stable reason/fallback identifiers.' );
gpp_assert_true( $trace->record( 'INBOX_PRESENTATION_OUTPUT', RuntimeDecisionTrace::RESULT_SKIP, 'presentation_not_ready', 'native_gravity_flow_inbox' ), 'Output fallback must be ordered after the actual readiness decision.' );
$snapshot = $trace->snapshot();
gpp_assert_same( 'FAIL', $snapshot['status'], 'Any material failed decision must make the request trace failed.' );
gpp_assert_same( array( 'INBOX_PROFILE_RESOLUTION', 'INBOX_BINDING_READINESS', 'INBOX_PRESENTATION_OUTPUT' ), array_column( $snapshot['events'], 'stage' ), 'Runtime trace order must preserve actual branch execution order.' );
gpp_assert_same( array( 1, 2, 3 ), array_column( $snapshot['events'], 'seq' ), 'Runtime events must retain deterministic local sequence numbers.' );
gpp_assert_same( 'availability_not_proven', $snapshot['events'][1]['reason_code'], 'Observed failure reason must not be replaced by a guessed diagnosis.' );

$store = new RuntimeIncidentStore( new GppDiagnosticsMemoryStore() );
$store->recordTrace( $snapshot );
$persisted = $store->snapshot();
gpp_assert_same( 1, count( $persisted['incidents'] ), 'A failed trace must be persisted as bounded local incident evidence.' );
gpp_assert_same( 'gravity_flow.inbox', $persisted['incidents'][0]['surface'], 'Incident persistence must retain only the shared safe surface identity.' );

$success = new RuntimeDecisionTrace( 'gravity_flow.entry_detail' );
$success->record( 'ENTRY_DETAIL_HOST_SEAM', RuntimeDecisionTrace::RESULT_PASS, 'post_permission_seam_reached', 'host_authorization_preserved' );
$success->record( 'ENTRY_DETAIL_PROFILE_RESOLUTION', RuntimeDecisionTrace::RESULT_PASS );
$success->record( 'ENTRY_DETAIL_BINDING_READINESS', RuntimeDecisionTrace::RESULT_PASS );
$success->record( 'ENTRY_DETAIL_APPROVAL_ELIGIBILITY', RuntimeDecisionTrace::RESULT_PASS, 'native_current_assignee_can_update' );
$success->record( 'ENTRY_DETAIL_PRESENTATION_OUTPUT', RuntimeDecisionTrace::RESULT_PASS );
gpp_assert_true(
    $success->record(
        'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION',
        RuntimeDecisionTrace::RESULT_PASS,
        'server_admitted_read_only_gpp_review',
        'marker_emitted_css_suppression_expected_not_browser_proven'
    ),
    'Entry Detail native-table suppression must be a registered diagnostics stage.'
);
$success_snapshot = $success->snapshot();
gpp_assert_true( RuntimeDecisionTrace::validateSnapshot( $success_snapshot ), 'Entry Detail suppression diagnostics must remain valid under the shared trace schema.' );
gpp_assert_same( 'ENTRY_DETAIL_NATIVE_TABLE_SUPPRESSION', end( $success_snapshot['events'] )['stage'], 'Suppression evidence must be retained as its own stage.' );
gpp_assert_same( 'server_admitted_read_only_gpp_review', end( $success_snapshot['events'] )['reason_code'], 'Suppression stage must retain the server admission reason.' );
$store->recordTrace( $success_snapshot );
$persisted = $store->snapshot();
gpp_assert_same( 'PASS', $persisted['recent_success']['gravity_flow.entry_detail']['status'], 'Successful requests must be compacted to one recent-success reference per surface.' );

$secret_message = 'PASSWORD=super-secret TOKEN=abc123 uploaded=private-passport.jpg';
try {
    throw new RuntimeException( $secret_message, 731 );
} catch ( Throwable $exception ) {
    $safe = RuntimeDecisionTrace::safeException( $exception );
}
$safe_json = json_encode( $safe );
gpp_assert_same( 'RuntimeException', $safe['class'], 'Safe exception context may expose the exception class.' );
gpp_assert_same( 731, $safe['code'], 'Stable numeric exception codes may be retained.' );
gpp_assert_true( false === strpos( $safe_json, 'super-secret' ), 'Exception messages must never enter diagnostics.' );
gpp_assert_true( false === strpos( $safe_json, 'abc123' ), 'Token-like values must never enter diagnostics.' );
gpp_assert_true( false === strpos( $safe_json, 'private-passport.jpg' ), 'Uploaded-file names must never enter diagnostics.' );
gpp_assert_true( false === strpos( $safe_json, dirname( __DIR__, 2 ) ), 'Absolute repository/server paths must never enter diagnostics.' );

$legacy = new PrintDossierDecisionTrace();
$legacy->record( 'PRINT_DOSSIER_REQUEST', 'intent_admitted' );
$legacy->record( 'HOST_PRINT_CONTEXT_ADMITTED', 'post_permission_seam_reached' );
$legacy->record( 'PRINT_PROFILE_RESOLVED', 'profile_resolved' );
$legacy->record( 'PRINT_BINDINGS_EVALUATED', 'source_unavailable' );
$legacy->record( 'PRINT_COMPOSITION_READY', 'ready_two_pages' );
gpp_assert_same(
    array(
        array( 'stage' => 'PRINT_DOSSIER_REQUEST', 'outcome' => 'intent_admitted' ),
        array( 'stage' => 'HOST_PRINT_CONTEXT_ADMITTED', 'outcome' => 'post_permission_seam_reached' ),
        array( 'stage' => 'PRINT_PROFILE_RESOLVED', 'outcome' => 'profile_resolved' ),
        array( 'stage' => 'PRINT_BINDINGS_EVALUATED', 'outcome' => 'source_unavailable' ),
        array( 'stage' => 'PRINT_COMPOSITION_READY', 'outcome' => 'ready_two_pages' ),
    ),
    $legacy->events(),
    'Existing WU19 legacy trace shape must remain compatible.'
);
$shared_print = RuntimeDiagnostics::snapshot( 'print.dossier' );
gpp_assert_same(
    array( 'PRINT_DOSSIER_REQUEST', 'HOST_PRINT_CONTEXT_ADMITTED', 'PRINT_PROFILE_RESOLVED', 'PRINT_BINDINGS_EVALUATED', 'PRINT_COMPOSITION_READY' ),
    array_column( $shared_print['events'], 'stage' ),
    'Print legacy adapter must emit the same ordered stages into the shared model.'
);
gpp_assert_same( RuntimeDecisionTrace::RESULT_SKIP, $shared_print['events'][3]['result'], 'A missing source must be represented as a degraded blank-value decision, not a fabricated successful value.' );
gpp_assert_same( 'blank_unproven_value', $shared_print['events'][3]['fallback'], 'Print source failure must report the actual blank-value fail-closed behavior.' );

$hostile = json_encode( array(
    'password' => 'PASSWORD=never-export',
    'token' => 'TOKEN=never-export',
    'personal_value' => '09121234567',
    'upload' => 'secret-document.pdf',
) );
gpp_assert_true( false === strpos( json_encode( $snapshot ), $hostile ), 'Trace events must not contain arbitrary request/personal payloads.' );

echo "RUNTIME_DIAGNOSTICS_TESTS_PASS\n";
