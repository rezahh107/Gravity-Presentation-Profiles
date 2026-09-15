<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;

Autoloader::register();

final class GppGeneralLlmStateStore implements StateStore {
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

function gpp_general_llm_fixture_text( $name ) {
    return file_get_contents( __DIR__ . '/../fixtures/' . $name );
}

function gpp_general_llm_assert_rejected_without_mutation( $workflow, $visual, $json, $message ) {
    $before = $visual->snapshot();
    $report = $workflow->validateVisualJson( $json );
    gpp_assert_same( false, $report['valid'], $message . ' validation report must reject.' );
    try {
        $workflow->importVisualJson( $json );
    } catch ( Throwable $exception ) {
        gpp_assert_same( $before, $visual->snapshot(), $message . ' must not mutate lifecycle state.' );
        return;
    }
    gpp_fail( $message . ' import must throw through the production workflow.' );
}

$visual_store = new GppGeneralLlmStateStore();
$binding_store = new GppGeneralLlmStateStore();
$visual = new VisualPackageLifecycle( $visual_store );
$workflow = new SettingsLifecycleWorkflow(
    $visual,
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) )
);

$minimal = gpp_general_llm_fixture_text( 'general-llm-minimal-valid.json' );
$minimal_report = $workflow->validateVisualJson( $minimal );
gpp_assert_same( true, $minimal_report['valid'], 'Minimal external-LLM fixture must validate through the production JSON workflow.' );
$minimal_import = $workflow->importVisualJson( $minimal );
gpp_assert_same( 'INSTALLED_INACTIVE', $minimal_import['status'], 'Minimal external-LLM fixture must install inactive through production lifecycle.' );
gpp_assert_same( 'portable.minimal.presentation', $minimal_import['package_id'], 'Minimal fixture package identity must remain exact.' );

$rich = gpp_general_llm_fixture_text( 'general-llm-rich-valid.json' );
$rich_report = $workflow->validateVisualJson( $rich );
gpp_assert_same( true, $rich_report['valid'], 'Rich external-LLM fixture must validate through the production JSON workflow.' );
$rich_import = $workflow->importVisualJson( $rich );
gpp_assert_same( 'INSTALLED_INACTIVE', $rich_import['status'], 'Rich external-LLM fixture must install inactive through production lifecycle.' );
gpp_assert_same( 'portable.reference.presentation', $rich_import['package_id'], 'Rich fixture package identity must remain exact.' );

$snapshot_after_valid = $visual->snapshot();
gpp_assert_true( isset( $snapshot_after_valid['installed']['portable.minimal.presentation']['1.0.0'] ), 'Minimal generated package must exist in authoritative visual lifecycle state.' );
gpp_assert_true( isset( $snapshot_after_valid['installed']['portable.reference.presentation']['2.3.0'] ), 'Rich generated package must exist in authoritative visual lifecycle state.' );
gpp_assert_same( array(), $snapshot_after_valid['activations'], 'Importing LLM-authored packages must not auto-activate them.' );

gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    gpp_general_llm_fixture_text( 'general-llm-malformed.json' ),
    'Malformed JSON'
);
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    gpp_general_llm_fixture_text( 'general-llm-unsupported-field.json' ),
    'Unsupported fictional field'
);
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    gpp_general_llm_fixture_text( 'general-llm-invalid-enum.json' ),
    'Invalid enum'
);
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    gpp_general_llm_fixture_text( 'general-llm-invalid-range.json' ),
    'Invalid numeric range'
);
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    gpp_general_llm_fixture_text( 'general-llm-environment-identity.json' ),
    'Environment-specific visual identity'
);
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    gpp_general_llm_fixture_text( 'general-llm-escape-hatch.json' ),
    'Arbitrary CSS escape hatch'
);

$rich_data = json_decode( $rich, true );
$invalid_type = $rich_data;
$invalid_type['design_tokens']['sizes_px']['control_height'] = '52';
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    json_encode( $invalid_type, JSON_UNESCAPED_SLASHES ),
    'Invalid token type'
);

$javascript = $rich_data;
$javascript['provenance']['producer'] = 'javascript:alert(1)';
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    json_encode( $javascript, JSON_UNESCAPED_SLASHES ),
    'JavaScript escape hatch'
);

$html = $rich_data;
$html['provenance']['producer'] = '<script>alert</script>';
gpp_general_llm_assert_rejected_without_mutation(
    $workflow,
    $visual,
    json_encode( $html, JSON_UNESCAPED_SLASHES ),
    'HTML escape hatch'
);

gpp_assert_same( $snapshot_after_valid, $visual->snapshot(), 'Every rejected generated package must leave the authoritative visual lifecycle unchanged.' );

echo "GENERAL_LLM_GENERATED_PACKAGE_TESTS_PASS\n";
