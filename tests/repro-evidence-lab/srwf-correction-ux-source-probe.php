<?php
/**
 * Qualification-only source probe for SRWF Correction / User Input UX.
 *
 * This file inspects the pinned Gravity Flow / Gravity Forms packages in the
 * disposable WU21 lab. It does not register hooks or change production state.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}

$roots = array(
    'gravity_flow'  => WP_PLUGIN_DIR . '/gravityflow',
    'gravity_forms' => WP_PLUGIN_DIR . '/gravityforms',
);
foreach ( $roots as $name => $root ) {
    if ( ! is_dir( $root ) ) {
        throw new RuntimeException( 'Pinned package unavailable: ' . $name );
    }
}

$flow = get_file_data( $roots['gravity_flow'] . '/gravityflow.php', array( 'Version' => 'Version' ) );
$gf   = get_file_data( $roots['gravity_forms'] . '/gravityforms.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $flow['Version'] || '3.1.1.1' !== (string) $gf['Version'] ) {
    throw new RuntimeException( 'Pinned Gravity package identity changed.' );
}

$needles = array(
    'gravityflow_update_button',
    'gravityflow_submit_button',
    'gravityflow_save_progress_button',
    'gform_submit_button',
    'gform_submit_button_',
    'user_input',
    'User Input',
);

$result_hits = array();
$button_files = array();
foreach ( $roots as $package => $root ) {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS )
    );
    foreach ( $iterator as $file ) {
        if ( ! $file->isFile() || 'php' !== strtolower( $file->getExtension() ) ) {
            continue;
        }
        $lines = @file( $file->getPathname(), FILE_IGNORE_NEW_LINES );
        if ( ! is_array( $lines ) ) {
            continue;
        }
        $relative = ltrim( str_replace( $root, '', $file->getPathname() ), '/\\' );
        foreach ( $needles as $needle ) {
            $per_file = 0;
            foreach ( $lines as $index => $line ) {
                if ( false === stripos( $line, $needle ) ) {
                    continue;
                }
                $start = max( 0, $index - 18 );
                $end   = min( count( $lines ) - 1, $index + 28 );
                $snippet = array();
                for ( $i = $start; $i <= $end; $i++ ) {
                    $snippet[] = array( 'line' => $i + 1, 'text' => rtrim( $lines[ $i ] ) );
                }
                $result_hits[] = array(
                    'package' => $package,
                    'needle' => $needle,
                    'file' => $relative,
                    'line' => $index + 1,
                    'snippet' => $snippet,
                );
                if ( in_array( $needle, array( 'gravityflow_update_button', 'gravityflow_submit_button', 'gravityflow_save_progress_button' ), true ) ) {
                    $button_files[ $package . ':' . $relative ] = array( $package, $root, $relative, $file->getPathname() );
                }
                $per_file++;
                if ( $per_file >= 12 ) {
                    break;
                }
            }
        }
    }
}

$button_file_filters = array();
foreach ( $button_files as $key => $record ) {
    list( $package, $root, $relative, $pathname ) = $record;
    $lines = @file( $pathname, FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        continue;
    }
    $filters = array();
    foreach ( $lines as $index => $line ) {
        if ( false === stripos( $line, 'apply_filters' ) && false === stripos( $line, 'do_action' ) ) {
            continue;
        }
        $start = max( 0, $index - 5 );
        $end   = min( count( $lines ) - 1, $index + 8 );
        $snippet = array();
        for ( $i = $start; $i <= $end; $i++ ) {
            $snippet[] = array( 'line' => $i + 1, 'text' => rtrim( $lines[ $i ] ) );
        }
        $filters[] = array( 'line' => $index + 1, 'snippet' => $snippet );
    }
    $button_file_filters[] = array(
        'package' => $package,
        'file' => $relative,
        'filters_and_actions' => $filters,
    );
}

$result = array(
    'schema_version' => '1.0.0',
    'scope' => 'QUALIFICATION_ONLY',
    'runtime' => array(
        'wordpress' => get_bloginfo( 'version' ),
        'php' => PHP_VERSION,
        'gravity_forms' => (string) $gf['Version'],
        'gravity_flow' => (string) $flow['Version'],
    ),
    'source_hits' => $result_hits,
    'button_rendering_files' => array_values( $button_files ),
    'button_file_filters_and_actions' => $button_file_filters,
);

wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'srwf-correction-ux-source-probe.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "SRWF_CORRECTION_UX_SOURCE_PROBE_CAPTURED\n";
