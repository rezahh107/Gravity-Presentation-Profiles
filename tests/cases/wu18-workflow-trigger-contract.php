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

        if ( '' !== trim( $line ) ) {
            break;
        }
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

echo "WU18_WORKFLOW_TRIGGER_CONTRACT_PASS\n";
