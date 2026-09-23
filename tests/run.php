<?php

$cases = array(
    'bootstrap-without-gravity-forms.php',
    'persian-gravity-bridge-absent.php',
    'persian-gravity-bridge-disabled.php',
    'persian-gravity-bridge-incompatible.php',
    'persian-gravity-bridge-unqualified-future.php',
    'persian-gravity-bridge-provider.php',
    'core-resolution.php',
    'gravity-forms-addon.php',
    'gravity-forms-asset-cache-identity.php',
    'plugin-settings-atomicity-controller.php',
    'form-presentation-ownership-settings.php',
    'form-presentation-ownership-runtime.php',
    'gravity-forms-json-settings-compat.php',
    'binding-health-addon.php',
    'declarative-preference-presence.php',
    'srwf-registration-profile.php',
    'portable-profile-substrate.php',
    'portable-profile-package-v11.php',
    'general-llm-authoring-prompt.php',
    'general-llm-generated-packages.php',
    'semantic-binding-selected-identity.php',
    'reserved-extension-seam-version.php',
    'package-lifecycle.php',
    'binding-health-management.php',
    'binding-health-compound-input.php',
    'binding-activation-cas.php',
    'entry-detail-mapping-workflow.php',
    'entry-detail-mapping-settings-seam.php',
    'pr25-root-repairs.php',
    'pr2-binding-repair-identity.php',
    'pr3-mapping-ux-unmap.php',
    'pr2-print-font-contract.php',
    'runtime-diagnostics.php',
    'package-lifecycle-v11.php',
    'reserved-extension-seam-lifecycle.php',
    'package-lifecycle-deactivation.php',
    'wordpress-option-state-store.php',
    'inbox-presentation-model.php',
    'inbox-manual-refresh.php',
    'inbox-package-authority.php',
    'inbox-production-activation.php',
    'inbox-settings-contract.php',
    'inbox-field-presentation.php',
    'inbox-asset-reachability.php',
    'inbox-asset-versioning.php',
    'inbox-host-width-ownership.php',
    'entry-detail-presentation-model.php',
    'entry-detail-review-architecture.php',
    'entry-detail-asset-versioning.php',
    'entry-detail-report-card-selection.php',
    'entry-detail-print-utility-availability.php',
    'entry-detail-production-activation.php',
    'entry-detail-setup-conflict.php',
    'entry-detail-setup-diagnostics.php',
    'entry-detail-settings-contract.php',
    'entry-detail-visual-variant.php',
    'entry-detail-full-width-css-contract.php',
    'entry-detail-timeline-semantic-presentation.php',
    'timeline-utc-source-evidence.php',
    'wu18-workflow-trigger-contract.php',
    'gravity-flow-host-dependency-regressions.php',
    'entry-detail-full-width-workflow-panel-presentation.php',
    'entry-detail-full-width-asset-scope.php',
    'print-dossier-presentation-model.php',
    'print-dossier-data-path.php',
    'operations-setup-production-path.php',
    'operations-setup-legacy-print-compat.php',
);

foreach ( $cases as $case ) {
    $path    = __DIR__ . '/cases/' . $case;
    $command = escapeshellarg( PHP_BINARY ) . ' ' . escapeshellarg( $path );

    passthru( $command, $exit_code );

    if ( 0 !== $exit_code ) {
        fwrite( STDERR, 'GPP_CORE_TESTS_FAIL: ' . $case . PHP_EOL );
        exit( $exit_code );
    }
}

echo "GPP_CORE_TESTS_PASS\n";