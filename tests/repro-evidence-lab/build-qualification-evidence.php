<?php
$dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! $dir || ! is_dir( $dir ) ) {
    throw new RuntimeException( 'Qualification artifact directory unavailable.' );
}

function gppq_read_json( $dir, $name ) {
    $path = rtrim( $dir, '/\\' ) . DIRECTORY_SEPARATOR . $name;
    if ( ! is_file( $path ) ) {
        throw new RuntimeException( 'Missing qualification input: ' . $name );
    }
    $value = json_decode( file_get_contents( $path ), true );
    if ( ! is_array( $value ) ) {
        throw new RuntimeException( 'Invalid JSON qualification input: ' . $name );
    }
    return $value;
}

function gppq_result_status( $suite, $id ) {
    foreach ( $suite['results'] as $result ) {
        if ( isset( $result['id'] ) && $id === $result['id'] ) {
            return $result['status'];
        }
    }
    return 'MISSING';
}

function gppq_entry_result( $suite, $id ) {
    if ( ! isset( $suite['results'] ) || ! is_array( $suite['results'] ) ) {
        throw new RuntimeException( 'Entry visual qualification results are absent or malformed.' );
    }
    $matches = array_values(
        array_filter(
            $suite['results'],
            static function ( $result ) use ( $id ) {
                return is_array( $result ) && isset( $result['id'] ) && $id === $result['id'];
            }
        )
    );
    if ( 1 !== count( $matches ) ) {
        throw new RuntimeException( 'Required executable Entry Detail result must exist exactly once: ' . $id );
    }
    return $matches[0];
}

function gppq_require_entry_result(
    $suite,
    $id,
    $scenario_type,
    $expected_comparator_result,
    $repository_sha,
    $authority_size,
    $authority_sha,
    $mutation_id = null,
    $expected_failed_rule_id = null
) {
    $result = gppq_entry_result( $suite, $id );
    $suite_comparator = isset( $suite['comparator_version'] ) ? (string) $suite['comparator_version'] : '';

    if ( '' === $suite_comparator || empty( $result['comparator_version'] ) || $suite_comparator !== $result['comparator_version'] ) {
        throw new RuntimeException( 'Executable Entry Detail result comparator version mismatch: ' . $id );
    }
    if ( ! isset( $result['repository_head'] ) || $repository_sha !== $result['repository_head'] ) {
        throw new RuntimeException( 'Executable Entry Detail result belongs to a different Head: ' . $id );
    }
    if ( ! isset( $result['owner_authority']['size'], $result['owner_authority']['sha256'] )
        || $authority_size !== $result['owner_authority']['size']
        || $authority_sha !== $result['owner_authority']['sha256'] ) {
        throw new RuntimeException( 'Executable Entry Detail result belongs to a different Owner authority: ' . $id );
    }
    if ( ! isset( $result['scenario_type'] ) || $scenario_type !== $result['scenario_type'] ) {
        throw new RuntimeException( 'Executable Entry Detail result scenario mismatch: ' . $id );
    }
    if ( ! isset( $result['status'] ) || 'PASS' !== $result['status'] ) {
        throw new RuntimeException( 'Executable Entry Detail result did not complete successfully: ' . $id );
    }
    if ( ! array_key_exists( 'comparator_executed', $result ) || true !== $result['comparator_executed'] ) {
        throw new RuntimeException( 'Executable Entry Detail comparator did not execute: ' . $id );
    }
    if ( ! isset( $result['comparator_result'] ) || $expected_comparator_result !== $result['comparator_result'] ) {
        throw new RuntimeException( 'Executable Entry Detail comparator result mismatch: ' . $id );
    }
    if ( ! isset( $result['failed_rule_ids'] ) || ! is_array( $result['failed_rule_ids'] ) ) {
        throw new RuntimeException( 'Executable Entry Detail result lacks named comparator rules: ' . $id );
    }

    if ( 'positive' === $scenario_type ) {
        if ( ! empty( $result['failed_rule_ids'] ) ) {
            throw new RuntimeException( 'Positive Entry Detail qualification contains failed comparator rules: ' . $id );
        }
        if ( array_key_exists( 'mutation_id', $result ) && null !== $result['mutation_id'] ) {
            throw new RuntimeException( 'Positive Entry Detail qualification unexpectedly contains a mutation: ' . $id );
        }
        return 'PASS';
    }

    if ( 'falsification' !== $scenario_type ) {
        throw new RuntimeException( 'Unsupported executable Entry Detail scenario: ' . $id );
    }
    if ( ! isset( $result['mutation_id'] ) || $mutation_id !== $result['mutation_id'] ) {
        throw new RuntimeException( 'Executable Entry Detail mutation identity mismatch: ' . $id );
    }
    if ( ! array_key_exists( 'mutation_confirmed', $result ) || true !== $result['mutation_confirmed'] ) {
        throw new RuntimeException( 'Executable Entry Detail mutation was not mechanically confirmed: ' . $id );
    }
    if ( ! isset( $result['baseline_comparator_result'] ) || 'PASS' !== $result['baseline_comparator_result'] ) {
        throw new RuntimeException( 'Executable Entry Detail falsification did not start from a clean comparator PASS: ' . $id );
    }
    if ( empty( $result['failed_rule_ids'] ) ) {
        throw new RuntimeException( 'Executable Entry Detail falsification lacks failed comparator rules: ' . $id );
    }
    if ( null !== $expected_failed_rule_id && ! in_array( $expected_failed_rule_id, $result['failed_rule_ids'], true ) ) {
        throw new RuntimeException( 'Executable Entry Detail falsification rejected for unrelated rules: ' . $id );
    }
    if ( ! isset( $result['mutation_evidence'] ) || ! is_array( $result['mutation_evidence'] ) ) {
        throw new RuntimeException( 'Executable Entry Detail falsification lacks mutation evidence: ' . $id );
    }

    return 'REJECTED_AS_EXPECTED';
}

function gppq_expect_validation_failure( $label, $callback ) {
    try {
        $callback();
    } catch ( RuntimeException $exception ) {
        return 'PASS';
    }
    throw new RuntimeException( 'Qualification builder failed to reject invalid executable evidence: ' . $label );
}

$repository_sha = trim( (string) shell_exec( 'git rev-parse HEAD 2>/dev/null' ) );
if ( 1 !== preg_match( '/^[0-9a-f]{40}$/', $repository_sha ) ) {
    throw new RuntimeException( 'Exact checkout repository SHA unavailable.' );
}

$core = gppq_read_json( $dir, 'core-spine-results.json' );
$entry_visual = gppq_read_json( $dir, 'entry-visual-contract-results.json' );
$print_visual = gppq_read_json( $dir, 'print-visual-contract-results.json' );
$wu18_runtime = gppq_read_json( $dir, 'wu18-runtime-results.json' );
$wu18_browser = gppq_read_json( $dir, 'wu18-browser-results.json' );
$wu19_runtime = gppq_read_json( $dir, 'wu19-runtime-results.json' );
$wu19_browser = gppq_read_json( $dir, 'wu19-browser-results.json' );

$legacy_html_sha = '666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81';
$entry_vnext_size = 119765;
$entry_vnext_sha = '1934967b81d82ee77c60ffd547dde6fa7c8a310dbde94556686bd3d515d62a69';
$print_pdf_sha = '34d9b4e137667ca103d5c6e7752f7148f0c92e36f0f1d182d7d87a890c55fec5';

if ( ! isset( $entry_visual['authority']['size'], $entry_visual['authority']['sha256'] )
    || $entry_vnext_size !== $entry_visual['authority']['size']
    || $entry_vnext_sha !== $entry_visual['authority']['sha256'] ) {
    throw new RuntimeException( 'Entry Detail qualification did not use the exact current vNext Owner authority.' );
}
if ( ! isset( $entry_visual['repository_head'] ) || $repository_sha !== $entry_visual['repository_head'] ) {
    throw new RuntimeException( 'Entry Detail qualification suite belongs to a different repository Head.' );
}
if ( empty( $print_visual['owner_reference_sha256'] ) || $print_pdf_sha !== $print_visual['owner_reference_sha256'] ) {
    throw new RuntimeException( 'Print qualification did not preserve the locked Print authority.' );
}

$entry_positive_desktop = gppq_require_entry_result(
    $entry_visual,
    'ENTRY-VNEXT-POSITIVE-DESKTOP-C',
    'positive',
    'PASS',
    $repository_sha,
    $entry_vnext_size,
    $entry_vnext_sha
);
$entry_positive_mobile = gppq_require_entry_result(
    $entry_visual,
    'ENTRY-VNEXT-POSITIVE-MOBILE-D',
    'positive',
    'PASS',
    $repository_sha,
    $entry_vnext_size,
    $entry_vnext_sha
);
$entry_task_displacement = gppq_require_entry_result(
    $entry_visual,
    'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT',
    'falsification',
    'REJECTED',
    $repository_sha,
    $entry_vnext_size,
    $entry_vnext_sha,
    'task_translate_y_120px',
    'CURRENT_TASK_RELATIVE_POSITION'
);
$entry_narrow_layout = gppq_require_entry_result(
    $entry_visual,
    'ENTRY-VNEXT-NEGATIVE-NARROW-LAYOUT',
    'falsification',
    'REJECTED',
    $repository_sha,
    $entry_vnext_size,
    $entry_vnext_sha,
    'dossier_width_72_percent',
    'DOSSIER_INLINE_GEOMETRY'
);
$entry_owned_visual = gppq_require_entry_result(
    $entry_visual,
    'ENTRY-VNEXT-NEGATIVE-OWNED-VISUAL-TOKEN',
    'falsification',
    'REJECTED',
    $repository_sha,
    $entry_vnext_size,
    $entry_vnext_sha,
    'h1_font_size_plus_7px',
    'H1_TYPOGRAPHY'
);

$builder_fail_closed = array();
$missing = $entry_visual;
$missing['results'] = array_values(
    array_filter(
        $missing['results'],
        static function ( $result ) {
            return ! isset( $result['id'] ) || 'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT' !== $result['id'];
        }
    )
);
$builder_fail_closed['missing_result'] = gppq_expect_validation_failure(
    'missing_result',
    static function () use ( $missing, $repository_sha, $entry_vnext_size, $entry_vnext_sha ) {
        gppq_require_entry_result( $missing, 'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT', 'falsification', 'REJECTED', $repository_sha, $entry_vnext_size, $entry_vnext_sha, 'task_translate_y_120px', 'CURRENT_TASK_RELATIVE_POSITION' );
    }
);

$wrong_head = $entry_visual;
foreach ( $wrong_head['results'] as &$result ) {
    if ( isset( $result['id'] ) && 'ENTRY-VNEXT-NEGATIVE-NARROW-LAYOUT' === $result['id'] ) {
        $result['repository_head'] = str_repeat( '0', 40 );
    }
}
unset( $result );
$builder_fail_closed['wrong_head'] = gppq_expect_validation_failure(
    'wrong_head',
    static function () use ( $wrong_head, $repository_sha, $entry_vnext_size, $entry_vnext_sha ) {
        gppq_require_entry_result( $wrong_head, 'ENTRY-VNEXT-NEGATIVE-NARROW-LAYOUT', 'falsification', 'REJECTED', $repository_sha, $entry_vnext_size, $entry_vnext_sha, 'dossier_width_72_percent', 'DOSSIER_INLINE_GEOMETRY' );
    }
);

$unconfirmed = $entry_visual;
foreach ( $unconfirmed['results'] as &$result ) {
    if ( isset( $result['id'] ) && 'ENTRY-VNEXT-NEGATIVE-OWNED-VISUAL-TOKEN' === $result['id'] ) {
        $result['mutation_confirmed'] = false;
    }
}
unset( $result );
$builder_fail_closed['mutation_not_confirmed'] = gppq_expect_validation_failure(
    'mutation_not_confirmed',
    static function () use ( $unconfirmed, $repository_sha, $entry_vnext_size, $entry_vnext_sha ) {
        gppq_require_entry_result( $unconfirmed, 'ENTRY-VNEXT-NEGATIVE-OWNED-VISUAL-TOKEN', 'falsification', 'REJECTED', $repository_sha, $entry_vnext_size, $entry_vnext_sha, 'h1_font_size_plus_7px', 'H1_TYPOGRAPHY' );
    }
);

$non_rejecting = $entry_visual;
foreach ( $non_rejecting['results'] as &$result ) {
    if ( isset( $result['id'] ) && 'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT' === $result['id'] ) {
        $result['comparator_result'] = 'PASS';
        $result['failed_rule_ids'] = array();
    }
}
unset( $result );
$builder_fail_closed['non_rejecting_negative'] = gppq_expect_validation_failure(
    'non_rejecting_negative',
    static function () use ( $non_rejecting, $repository_sha, $entry_vnext_size, $entry_vnext_sha ) {
        gppq_require_entry_result( $non_rejecting, 'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT', 'falsification', 'REJECTED', $repository_sha, $entry_vnext_size, $entry_vnext_sha, 'task_translate_y_120px', 'CURRENT_TASK_RELATIVE_POSITION' );
    }
);

$evidence = array(
    'schema_version' => '1.1.0',
    'repository_sha' => $repository_sha,
    'evidence_class' => 'PROVEN_IN_REPRODUCIBLE_SIMULATION',
    'data_class' => 'SYNTHETIC_NON_PII',
    'focused_gates' => array(
        'wu21_wu17' => 'REUSED_SEPARATE_FOCUSED_GATE',
        'wu18' => 'REUSED_IN_SHARED_RUNTIME',
        'wu19' => 'REUSED_IN_SHARED_RUNTIME',
    ),
    'core_spine' => array(
        'happy_path' => gppq_result_status( $core, 'CORE-SPINE-001' ),
        'schema_drift' => gppq_result_status( $core, 'CORE-SPINE-002' ),
        'binding_ambiguity' => gppq_result_status( $core, 'CORE-SPINE-003' ),
        'permission_mutation' => gppq_result_status( $core, 'CORE-SPINE-004' ),
        'evidence_degradation' => gppq_result_status( $core, 'CORE-SPINE-005' ),
        'lifecycle_mutation' => gppq_result_status( $core, 'CORE-SPINE-006' ),
        'same_entry_continuity' => $core['same_entry_continuity'],
        'cross_surface_semantic_consistency' => $core['cross_surface_semantic_consistency'],
    ),
    'visual_contract' => array(
        'entry_desktop_C' => $entry_positive_desktop,
        'entry_mobile_D' => $entry_positive_mobile,
        'entry_vnext_negative_task_displacement' => $entry_task_displacement,
        'entry_vnext_negative_narrow_layout' => $entry_narrow_layout,
        'entry_vnext_negative_owned_visual_token' => $entry_owned_visual,
        'print_front_E' => $print_visual['surfaces']['print_front_E'],
        'print_back_F' => $print_visual['surfaces']['print_back_F'],
        'print_content_variation' => isset( $print_visual['content_variation'] ) ? $print_visual['content_variation'] : 'MISSING',
        'deliberate_print_regression' => $print_visual['deliberate_regression'],
        'deliberate_print_management_regression' => isset( $print_visual['deliberate_management_regression'] ) ? $print_visual['deliberate_management_regression'] : 'MISSING',
    ),
    'entry_vnext_executable_evidence' => array(
        'comparator_version' => $entry_visual['comparator_version'],
        'required_result_ids' => array(
            'ENTRY-VNEXT-POSITIVE-DESKTOP-C',
            'ENTRY-VNEXT-POSITIVE-MOBILE-D',
            'ENTRY-VNEXT-NEGATIVE-TASK-DISPLACEMENT',
            'ENTRY-VNEXT-NEGATIVE-NARROW-LAYOUT',
            'ENTRY-VNEXT-NEGATIVE-OWNED-VISUAL-TOKEN',
        ),
        'builder_fail_closed_controls' => $builder_fail_closed,
        'sha_inequality_visual_proof' => 'ABSENT',
    ),
    'owner_reference_sha256' => array(
        'html' => $legacy_html_sha,
        'entry_vnext_html' => $entry_vnext_sha,
        'pdf' => $print_pdf_sha,
    ),
    'entry_detail_authority_supersession' => array(
        'scope' => 'gravity_flow.entry_detail',
        'superseded_html_sha256' => $legacy_html_sha,
        'current_html_sha256' => $entry_vnext_sha,
        'inbox_authority_changed' => false,
        'print_authority_changed' => false,
    ),
    'focused_runtime_reuse' => array(
        'wu18_php_runtime' => isset( $wu18_runtime['profile_id'], $wu18_runtime['runtime_decision_trace']['status'] )
            && 'srwf.operations.entry-detail.v1' === $wu18_runtime['profile_id']
            && 'PASS' === $wu18_runtime['runtime_decision_trace']['status'] ? 'PASS' : 'FAIL',
        'wu18_browser' => count( array_filter( $wu18_browser['results'], static function ( $r ) { return 'PASS' !== $r['status']; } ) ) ? 'FAIL' : 'PASS',
        'wu19_php_runtime' => ! empty( $wu19_runtime['happy_ready'] ) ? 'PASS' : 'FAIL',
        'wu19_browser' => count( array_filter( $wu19_browser['results'], static function ( $r ) { return 'PASS' !== $r['status']; } ) ) ? 'FAIL' : 'PASS',
    ),
    'limits' => array(
        'target_production_equivalence' => 'NOT_PROVEN',
        'production_form_field_step_ids' => 'NOT_PROVEN',
        'production_server_theme_cache_cdn_permalink_interaction' => 'NOT_PROVEN',
        'real_site_plugin_license_configuration' => 'NOT_PROVEN',
        'physical_printer_margins_toner_driver_behavior' => 'NOT_PROVEN',
    ),
);

foreach ( $evidence['core_spine'] as $key => $status ) {
    if ( 'PASS' !== $status ) {
        throw new RuntimeException( 'Core Spine qualification is not fully PASS: ' . $key . '=' . $status );
    }
}
foreach ( array( 'entry_desktop_C', 'entry_mobile_D', 'print_front_E', 'print_back_F' ) as $key ) {
    if ( 'PASS' !== $evidence['visual_contract'][ $key ] ) {
        throw new RuntimeException( 'Visual qualification is not fully PASS: ' . $key );
    }
}
foreach ( array( 'entry_vnext_negative_task_displacement', 'entry_vnext_negative_narrow_layout', 'entry_vnext_negative_owned_visual_token', 'deliberate_print_regression', 'deliberate_print_management_regression' ) as $key ) {
    if ( 'REJECTED_AS_EXPECTED' !== $evidence['visual_contract'][ $key ] ) {
        throw new RuntimeException( 'Deliberate visual regression proof missing: ' . $key );
    }
}
if ( 'PASS' !== $evidence['visual_contract']['print_content_variation'] ) {
    throw new RuntimeException( 'Print content-variation structural invariance is not proven.' );
}
foreach ( $builder_fail_closed as $key => $status ) {
    if ( 'PASS' !== $status ) {
        throw new RuntimeException( 'Qualification builder fail-closed control failed: ' . $key );
    }
}
foreach ( $evidence['focused_runtime_reuse'] as $key => $status ) {
    if ( 'PASS' !== $status ) {
        throw new RuntimeException( 'Focused gate reuse failed: ' . $key );
    }
}

$json = json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
$forbidden = array( '0917', '0912', 'محمدرضا', 'علی رضایی' );
foreach ( $forbidden as $needle ) {
    if ( false !== strpos( $json, $needle ) ) {
        throw new RuntimeException( 'Machine-readable qualification evidence contains fixture-person detail: ' . $needle );
    }
}
file_put_contents( rtrim( $dir, '/\\' ) . DIRECTORY_SEPARATOR . 'gpp-qualification.json', $json );
echo "GPP_QUALIFICATION_EVIDENCE_PASS\n";
