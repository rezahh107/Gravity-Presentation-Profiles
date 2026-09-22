<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    throw new RuntimeException( 'WU12 artifact directory unavailable.' );
}

if ( ! function_exists( 'get_plugin_data' ) ) {
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
}

$flow_file = WP_PLUGIN_DIR . '/gravityflow/gravityflow.php';
$gf_file   = WP_PLUGIN_DIR . '/gravityforms/gravityforms.php';
$flow_root = dirname( $flow_file );

if ( ! is_readable( $flow_file ) || ! is_readable( $gf_file ) || ! is_dir( $flow_root ) ) {
    throw new RuntimeException( 'Pinned Gravity package source is unavailable.' );
}

$flow_data = get_plugin_data( $flow_file, false, false );
$gf_data   = get_plugin_data( $gf_file, false, false );

$source_files = array();
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator( $flow_root, FilesystemIterator::SKIP_DOTS )
);

foreach ( $iterator as $file_info ) {
    if ( ! $file_info->isFile() ) {
        continue;
    }

    $extension = strtolower( pathinfo( $file_info->getFilename(), PATHINFO_EXTENSION ) );
    if ( ! in_array( $extension, array( 'js', 'php' ), true ) ) {
        continue;
    }

    $path = $file_info->getPathname();
    $contents = @file_get_contents( $path );
    if ( ! is_string( $contents ) || '' === $contents ) {
        continue;
    }

    if ( false === strpos( $contents, 'printPage' ) && false === strpos( $contents, 'gravityflow_print_entries' ) ) {
        continue;
    }

    $relative = ltrim( str_replace( '\\', '/', substr( $path, strlen( $flow_root ) ) ), '/' );
    $lines = preg_split( '/\R/', $contents );
    $record = array(
        'path' => 'gravityflow/' . $relative,
        'sha256' => hash( 'sha256', $contents ),
        'print_page_lines' => array(),
        'print_page_definition_lines' => array(),
        'native_action_lines' => array(),
        'iframe_lines' => array(),
        'load_lines' => array(),
        'browser_print_lines' => array(),
    );

    foreach ( $lines as $index => $line ) {
        $line_number = $index + 1;
        if ( false !== strpos( $line, 'printPage' ) ) {
            $record['print_page_lines'][] = $line_number;
        }
        if (
            preg_match( '/\bfunction\s+printPage\s*\(/', $line )
            || preg_match( '/(?:window\.)?printPage\s*=\s*function\b/', $line )
        ) {
            $record['print_page_definition_lines'][] = $line_number;
        }
        if ( false !== strpos( $line, 'gravityflow_print_entries' ) ) {
            $record['native_action_lines'][] = $line_number;
        }
        if ( false !== stripos( $line, 'iframe' ) ) {
            $record['iframe_lines'][] = $line_number;
        }
        if ( preg_match( '/\.(?:on|one)\s*\(\s*[\'\"]load[\'\"]|addEventListener\s*\(\s*[\'\"]load[\'\"]|\.load\s*\(/i', $line ) ) {
            $record['load_lines'][] = $line_number;
        }
        if ( preg_match( '/\.print\s*\(/', $line ) ) {
            $record['browser_print_lines'][] = $line_number;
        }
    }

    $source_files[] = $record;
}

$print_page_files = array_values( array_filter( $source_files, static function ( $file ) {
    return ! empty( $file['print_page_lines'] );
} ) );
$definition_files = array_values( array_filter( $print_page_files, static function ( $file ) {
    return ! empty( $file['print_page_definition_lines'] );
} ) );
$action_files = array_values( array_filter( $source_files, static function ( $file ) {
    return ! empty( $file['native_action_lines'] );
} ) );
$iframe_in_print_page_files = array_values( array_filter( $print_page_files, static function ( $file ) {
    return ! empty( $file['iframe_lines'] );
} ) );

$hard_gates = array(
    'print_page_source_observed' => ! empty( $print_page_files ),
    'print_page_definition_observed' => ! empty( $definition_files ),
    'native_print_action_source_observed' => ! empty( $action_files ),
    'iframe_behavior_in_print_page_source_observed' => ! empty( $iframe_in_print_page_files ),
);

foreach ( $hard_gates as $gate => $passed ) {
    if ( ! $passed ) {
        throw new RuntimeException( 'Pinned Gravity Flow Print seam gate failed: ' . $gate );
    }
}

global $wp_version;
$evidence = array(
    'objective' => 'Identify the exact source/runtime seam that provides native Gravity Flow Print dispatch in the pinned evidence lab.',
    'runtime' => array(
        'wordpress' => (string) $wp_version,
        'gravity_forms' => (string) ( $gf_data['Version'] ?? '' ),
        'gravity_flow' => (string) ( $flow_data['Version'] ?? '' ),
        'php' => PHP_VERSION,
        'gravity_forms_package_sha256' => (string) getenv( 'WU21_GF_SHA256' ),
        'gravity_flow_package_sha256' => (string) getenv( 'WU21_FLOW_SHA256' ),
    ),
    'host_seam' => array(
        'print_page_files' => $print_page_files,
        'definition_files' => $definition_files,
        'native_action_files' => $action_files,
        'iframe_in_print_page_files' => $iframe_in_print_page_files,
    ),
    'hard_gates' => $hard_gates,
    'scope' => 'Exact owner-supplied Gravity Flow package installed in this pinned CI runtime only.',
);

$path = trailingslashit( $artifact_dir ) . 'gravityflow-print-host-seam.json';
if ( false === file_put_contents( $path, wp_json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n" ) ) {
    throw new RuntimeException( 'Could not write Gravity Flow Print seam evidence.' );
}

echo "PRINT_DISPATCH_HOST_SEAM_PASS\n";
