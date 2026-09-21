<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

/**
 * Keep WU19's historical Print E/F structural comparator on its admitted
 * synthetic content envelope after WU18 moved to the current Operations
 * Package. This changes only test entry values; it does not install a visual
 * package, alter bindings, or create a direct student.full_name source.
 *
 * setup-wu19-fixtures.php loads this file while establishing the shared runtime.
 * Do not mutate WU18/Core-Spine/Entry-visual data there. The workflow opts in
 * explicitly only immediately before the historical Print E/F comparator.
 */
if ( '1' !== getenv( 'GPP_WU19_VISUAL_CONTROL_NORMALIZE' ) ) {
    echo "WU19 visual control normalization deferred to Print E/F gate.\n";
    return;
}

$wu18 = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_array( $wu18 ) || empty( $wu18['alpha']['fields'] ) || empty( $wu18['beta']['fields'] ) ) {
    throw new RuntimeException( 'WU19 visual control normalization requires current WU18 fixtures.' );
}

function wu19_normalize_current_components( $item, $first, $last ) {
    $fields = $item['fields'];
    foreach ( array( 'student.first_name', 'student.last_name', 'education.grade_group' ) as $slot ) {
        if ( empty( $fields[ $slot ] ) ) {
            throw new RuntimeException( 'WU19 visual control field missing: ' . $slot );
        }
    }

    $values = array(
        'student.first_name' => $first,
        'student.last_name' => $last,
        'education.grade_group' => 'پایه دهم',
    );
    foreach ( $values as $slot => $value ) {
        $result = GFAPI::update_entry_field( (int) $item['entry_id'], $fields[ $slot ], $value );
        if ( is_wp_error( $result ) ) {
            throw new RuntimeException( $result->get_error_message() );
        }
    }

    $entry = GFAPI::get_entry( (int) $item['entry_id'] );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    foreach ( $values as $slot => $expected ) {
        $actual = isset( $entry[ (string) $fields[ $slot ] ] ) ? (string) $entry[ (string) $fields[ $slot ] ] : '';
        if ( $expected !== $actual ) {
            throw new RuntimeException( 'WU19 visual control normalization did not persist ' . $slot );
        }
    }
}

wu19_normalize_current_components( $wu18['alpha'], 'Alpha First', 'Alpha Last' );
wu19_normalize_current_components( $wu18['beta'], 'Beta First', 'Beta Last' );

// GPP-RP-WU-03 reuses this already-admitted WU19 browser/PDF boundary. The
// candidate is implemented only by temporary MU-plugin plumbing created and
// removed during qualification; production Print delivery remains untouched.
$wu03_script = __DIR__ . '/wu03-print-stylesheet-seam.mjs';
$wu03_output = array();
$wu03_status = 0;

// actions/checkout writes an authenticated GitHub extraheader into the local
// repository config. A nested public clone must not inherit that header: doing
// so makes Git prompt for credentials in the non-interactive runner. Clearing
// only this runner-local checkout header leaves repository content untouched.
$git_config_output = array();
$git_config_status = 0;
exec( 'git config --local --unset-all ' . escapeshellarg( 'http.https://github.com/.extraheader' ) . ' 2>/dev/null', $git_config_output, $git_config_status );
if ( 0 !== $git_config_status && 5 !== $git_config_status ) {
    throw new RuntimeException( 'WU03 could not clear the runner-local GitHub checkout extraheader.' );
}

// The production dossier uses 400/500/700, while the admitted Vazir authority
// publishes 300/400/500/700/900. Exercise every authoritative face without
// changing visible Print output so the browser proves delivery rather than only
// parsing @font-face source. This probe is test-only and removed immediately.
$wu03_probe_dir = WP_CONTENT_DIR . '/mu-plugins';
wp_mkdir_p( $wu03_probe_dir );
$wu03_probe = $wu03_probe_dir . '/gpp-wu03-font-probe.php';
$wu03_probe_php = <<<'PHP'
<?php
add_action( 'gravityflow_print_entry_footer', static function () {
    if ( ! isset( $_GET['gpp_presentation'] ) || 'dossier' !== sanitize_key( wp_unslash( $_GET['gpp_presentation'] ) ) ) {
        return;
    }
    echo '<div data-gpp-wu03-font-probe aria-hidden="true" style="position:absolute;inset:auto auto -10000px -10000px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none">';
    foreach ( array( 300, 400, 500, 700, 900 ) as $weight ) {
        echo '<span style="font-family:Vazir,sans-serif;font-weight:' . (int) $weight . '">آ</span>';
    }
    echo '</div>';
}, 18, 0 );
PHP;
if ( false === file_put_contents( $wu03_probe, $wu03_probe_php ) ) {
    throw new RuntimeException( 'WU03 could not create the temporary Vazir delivery probe.' );
}

try {
    exec( 'node ' . escapeshellarg( $wu03_script ) . ' 2>&1', $wu03_output, $wu03_status );
} finally {
    if ( is_file( $wu03_probe ) ) {
        unlink( $wu03_probe );
    }
}
if ( 0 !== $wu03_status || empty( $wu03_output ) ) {
    throw new RuntimeException( 'WU03 Print stylesheet seam qualification failed to produce evidence: ' . implode( "\n", array_slice( $wu03_output, -12 ) ) );
}
$wu03_summary = json_decode( end( $wu03_output ), true );
if ( ! is_array( $wu03_summary ) || 'EVIDENCE_COMPLETE' !== ( $wu03_summary['status'] ?? null ) ) {
    throw new RuntimeException( 'WU03 Print stylesheet seam evidence summary is incomplete.' );
}

echo "WU19 visual control data normalized without direct full-name authority.\n";
echo "WU03_PRINT_STYLESHEET_SEAM_EVIDENCE_COMPLETE\n";
