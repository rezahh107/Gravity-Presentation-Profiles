<?php

require_once __DIR__ . '/../helpers.php';

function gpp_wu18_extract_pull_request_paths( $workflow_path ) {
    $contents = file_get_contents( $workflow_path );
    gpp_assert_true( is_string( $contents ), 'Workflow must be readable: ' . $workflow_path );

    $paths           = array();
    $in_pull_request = false;
    $in_paths        = false;

    foreach ( preg_split( '/\R/', $contents ) as $line ) {
        if ( '  pull_request:' === $line ) {
            $in_pull_request = true;
            $in_paths        = false;
            continue;
        }

        if ( $in_pull_request && preg_match( '/^  [^ ]/', $line ) ) {
            break;
        }

        if ( ! $in_pull_request ) {
            continue;
        }

        if ( '    paths:' === $line ) {
            $in_paths = true;
            continue;
        }

        if ( ! $in_paths ) {
            continue;
        }

        if ( preg_match( "/^      - ['\"](.+)['\"]$/", $line, $matches ) ) {
            $paths[] = $matches[1];
            continue;
        }

        // YAML comments can appear between path entries without closing the
        // pull_request.paths sequence (as in Blocksy's existing annotations).
        if ( '' === trim( $line ) || preg_match( '/^\\s*#/', $line ) ) {
            continue;
        }
        break;
    }

    gpp_assert_true( ! empty( $paths ), 'pull_request.paths must be present and non-empty: ' . $workflow_path );

    return $paths;
}

function gpp_wu18_path_pattern_matches( $pattern, $path ) {
    $quoted = preg_quote( $pattern, '#' );
    $quoted = str_replace( '\*\*', '.*', $quoted );
    $quoted = str_replace( '\*', '[^/]*', $quoted );
    $quoted = str_replace( '\?', '[^/]', $quoted );

    return 1 === preg_match( '#^' . $quoted . '$#', $path );
}

function gpp_wu18_path_is_covered( array $patterns, $path ) {
    foreach ( $patterns as $pattern ) {
        if ( gpp_wu18_path_pattern_matches( $pattern, $path ) ) {
            return true;
        }
    }

    return false;
}

$root = dirname( __DIR__, 2 );
$workflows = array(
    'WU18' => $root . '/.github/workflows/wu18-entry-detail-runtime.yml',
    'WU19' => $root . '/.github/workflows/wu19-a4-print-runtime.yml',
);
$dependency_class = 'tests/repro-evidence-lab/wu18-*';
$positive_paths = array(
    'tests/repro-evidence-lab/wu18-timeline-semantic-runtime.php',
    'tests/repro-evidence-lab/wu18-timeline-utc-source-evidence.php',
);
$future_path   = 'tests/repro-evidence-lab/wu18-future-trigger-regression.php';
$negative_path = 'tests/repro-evidence-lab/wu17-unrelated-trigger-regression.php';

foreach ( $workflows as $label => $workflow_path ) {
    $paths = gpp_wu18_extract_pull_request_paths( $workflow_path );

    gpp_assert_true(
        in_array( $dependency_class, $paths, true ),
        $label . ' pull_request.paths must contain the bounded WU18 dependency-class wildcard.'
    );

    foreach ( $positive_paths as $positive_path ) {
        gpp_assert_true(
            gpp_wu18_path_is_covered( $paths, $positive_path ),
            $label . ' must trigger for current WU18 runtime dependency: ' . $positive_path
        );
    }

    gpp_assert_true(
        ! in_array( $future_path, $paths, true ) && gpp_wu18_path_is_covered( $paths, $future_path ),
        $label . ' must cover a future wu18-* dependency without per-file enumeration.'
    );

    gpp_assert_true(
        ! gpp_wu18_path_is_covered( $paths, $negative_path ),
        $label . ' must not admit unrelated repro-evidence-lab paths outside the WU18 dependency class.'
    );

    foreach ( $paths as $path_pattern ) {
        if ( $dependency_class === $path_pattern ) {
            continue;
        }

        gpp_assert_true(
            0 !== strpos( $path_pattern, 'tests/repro-evidence-lab/wu18-' ),
            $label . ' must not regress to manually synchronized wu18-* per-file trigger entries: ' . $path_pattern
        );
    }
}

$wu18_paths = gpp_wu18_extract_pull_request_paths( $workflows['WU18'] );
foreach ( array(
    'tests/repro-evidence-lab/setup-wu18-fixtures.php',
    'tests/repro-evidence-lab/inspect-wu18-host-seams.php',
    'tests/repro-evidence-lab/create-wu18-unbound-form.php',
) as $non_class_dependency ) {
    gpp_assert_true(
        in_array( $non_class_dependency, $wu18_paths, true ),
        'WU18 must preserve required helper paths that are not matched by the selected wu18-* wildcard: ' . $non_class_dependency
    );
}

// FND-004: the real WU18 operational schema 1.1 browser entrypoint,
// negative controls, WP-CLI lifecycle driver, package and PHP contracts must
// each independently trigger WU18. A bare test runner trigger cannot stand in
// for the exact dependency changed in a projector-only/future test PR.
$operational_v11_dependencies = array(
    'tests/repro-evidence-lab/generic-operational-v11-browser.mjs',
    'tests/repro-evidence-lab/generic-operational-v11-negative-browser.mjs',
    'tests/repro-evidence-lab/generic-operational-v11-control.php',
    'tests/fixtures/generic-operational-paint-v11.json',
    'tests/cases/operational-visual-preferences.php',
);
foreach ( $operational_v11_dependencies as $dependency ) {
    gpp_assert_true(
        in_array( $dependency, $wu18_paths, true ) && gpp_wu18_path_is_covered( $wu18_paths, $dependency ),
        'WU18 must explicitly trigger for its real schema 1.1 dependency: ' . $dependency
    );
    $without_dependency = array_values( array_diff( $wu18_paths, array( $dependency ) ) );
    gpp_assert_true(
        ! gpp_wu18_path_is_covered( $without_dependency, $dependency ),
        'Removing the schema 1.1 dependency path must falsify WU18 coverage: ' . $dependency
    );
}
foreach ( array(
    'tests/repro-evidence-lab/generic-operational-v10-browser.mjs',
    'tests/repro-evidence-lab/unrelated-operational-test.mjs',
    'tests/fixtures/unrelated-visual-package.json',
    'tests/cases/unrelated-visual-contract.php',
    'docs/unrelated-note.md',
) as $unrelated ) {
    gpp_assert_true(
        ! gpp_wu18_path_is_covered( $wu18_paths, $unrelated ),
        'WU18 must not broaden to unrelated files while covering operational schema 1.1: ' . $unrelated
    );
}

$wu19_paths = gpp_wu18_extract_pull_request_paths( $workflows['WU19'] );
foreach ( array(
    'tests/repro-evidence-lab/setup-wu18-fixtures.php',
    'tests/repro-evidence-lab/inspect-wu18-host-seams.php',
) as $non_class_dependency ) {
    gpp_assert_true(
        in_array( $non_class_dependency, $wu19_paths, true ),
        'WU19 must preserve required helper paths that are not matched by the selected wu18-* wildcard: ' . $non_class_dependency
    );
}

// Operational schema 1.1 paint is now projected in SRWF-scoped owner files.
// A projector-only PR must start the appropriate native smoke / ZIP gate even
// when neither the Core interpreter nor the calling adapter is modified.
$paint_workflows = array(
    'Blocksy' => array(
        'file' => $root . '/.github/workflows/blocksy-free-inbox-smoke.yml',
        'positive' => array( 'src/SRWF/GravityFlow/InboxOperationalPaint.php' ),
        'negative' => array(
            'src/SRWF/GravityFlow/EntryDetailOperationalPaint.php',
            'src/SRWF/GravityFlow/UnrelatedPaint.php',
            'docs/unrelated-note.md',
        ),
    ),
    'Release dry-run' => array(
        'file' => $root . '/.github/workflows/release.yml',
        'positive' => array(
            'src/SRWF/GravityFlow/InboxOperationalPaint.php',
            'src/SRWF/GravityFlow/EntryDetailOperationalPaint.php',
        ),
        'negative' => array(
            'src/SRWF/GravityFlow/UnrelatedPaint.php',
            'docs/unrelated-note.md',
        ),
    ),
);
foreach ( $paint_workflows as $label => $spec ) {
    $paths = gpp_wu18_extract_pull_request_paths( $spec['file'] );
    foreach ( $spec['positive'] as $owned ) {
        gpp_assert_true(
            in_array( $owned, $paths, true ) && gpp_wu18_path_is_covered( $paths, $owned ),
            $label . ' must explicitly trigger for changed paint projector: ' . $owned
        );
        $removed = array_values( array_diff( $paths, array( $owned ) ) );
        gpp_assert_true(
            ! gpp_wu18_path_is_covered( $removed, $owned ),
            $label . ' trigger mutation removing exact projector path must be rejected: ' . $owned
        );
    }
    foreach ( $spec['negative'] as $unrelated ) {
        gpp_assert_true(
            ! gpp_wu18_path_is_covered( $paths, $unrelated ),
            $label . ' must not expand into unrelated paths: ' . $unrelated
        );
    }
}

// FND-005: the authentic frontend schema 1.1 Chromium scenario must run
// even when a PR changes only one input, its fixture producer, its current-post
// Block composition, or the immutable lifecycle exercised by the driver.
$blocksy_frontend_paths = gpp_wu18_extract_pull_request_paths(
    $root . '/.github/workflows/blocksy-free-inbox-smoke.yml'
);
$frontend_paint_direct_dependencies = array(
    // These are read directly by pr159-schema11-frontend-paint-qualification.mjs.
    'tests/fixtures/generic-operational-paint-v11.json',
    'tests/repro-evidence-lab/generic-operational-v11-control.php',
    // These create the fixture-manifest and P06 authentic current-post Block.
    'tests/repro-evidence-lab/setup-fixtures.php',
    'tests/repro-evidence-lab/p06-inbox-asset-reachability-runtime.php',
    // The real Block markup and native scoped wrapper depend on this bridge.
    'src/SRWF/GravityFlow/InboxBlockCompositionBridge.php',
    // The WP-CLI control directly uses these immutable-state classes.
    'src/Core/Lifecycle/VisualPackageLifecycle.php',
    'src/Core/Lifecycle/WordPressOptionStateStore.php',
);
foreach ( $frontend_paint_direct_dependencies as $dependency ) {
    gpp_assert_true(
        1 === count( array_keys( $blocksy_frontend_paths, $dependency, true ) )
            && gpp_wu18_path_is_covered( $blocksy_frontend_paths, $dependency ),
        'Blocksy must trigger on a change to only frontend paint dependency: ' . $dependency
    );
    $without_dependency = array_values( array_diff( $blocksy_frontend_paths, array( $dependency ) ) );
    gpp_assert_true(
        ! gpp_wu18_path_is_covered( $without_dependency, $dependency ),
        'Removing Blocksy frontend dependency coverage must fail: ' . $dependency
    );
}
foreach ( array(
    'tests/repro-evidence-lab/pr159-schema11-frontend-paint-qualification.mjs',
    'src/Core/Presentation/OperationalVisualPreferences.php',
    'src/SRWF/GravityFlow/InboxOperationalPaint.php',
    'src/SRWF/GravityFlow/InboxPresentationAdapter.php',
) as $preserved_dependency ) {
    gpp_assert_true(
        in_array( $preserved_dependency, $blocksy_frontend_paths, true ),
        'Existing frontend/projection trigger must stay intact: ' . $preserved_dependency
    );
}
foreach ( array(
    'src/**',
    'tests/**',
    'tests/repro-evidence-lab/**',
    'tests/fixtures/**',
) as $broad_pattern ) {
    gpp_assert_true(
        ! in_array( $broad_pattern, $blocksy_frontend_paths, true ),
        'Blocksy frontend dependency qualification must not expand to broad paths: ' . $broad_pattern
    );
}
foreach ( array(
    'tests/fixtures/unrelated-operational-package.json',
    'tests/repro-evidence-lab/unrelated-frontend-qualification.mjs',
    'src/SRWF/GravityFlow/EntryDetailOperationalPaint.php',
    'src/SRWF/GravityFlow/UnrelatedPaint.php',
    'docs/unrelated-note.md',
) as $unrelated ) {
    gpp_assert_true(
        ! gpp_wu18_path_is_covered( $blocksy_frontend_paths, $unrelated ),
        'Unrelated paths must not select Blocksy frontend qualification: ' . $unrelated
    );
}

echo "WU18_WORKFLOW_TRIGGER_CONTRACT_PASS\n";
