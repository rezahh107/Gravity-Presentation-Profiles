<?php
/**
 * Qualification-only source probe for SRWF Correction / User Input UX.
 *
 * This script never changes production behavior. It inspects the exact pinned
 * Gravity Flow / Gravity Forms packages installed by the qualification job and
 * records the native User Input submit topology plus supported label seams.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}

$flow_root = WP_PLUGIN_DIR . '/gravityflow';
$gf_root   = WP_PLUGIN_DIR . '/gravityforms';
if ( ! is_dir( $flow_root ) || ! is_dir( $gf_root ) ) {
    throw new RuntimeException( 'Pinned Gravity packages are unavailable.' );
}

$flow = get_file_data( $flow_root . '/gravityflow.php', array( 'Version' => 'Version' ) );
$gf   = get_file_data( $gf_root . '/gravityforms.php', array( 'Version' => 'Version' ) );
if ( '3.1.0' !== (string) $flow['Version'] || '3.1.1.1' !== (string) $gf['Version'] ) {
    throw new RuntimeException( 'Pinned Gravity package identity changed.' );
}

$needles = array(
    'gravityflow_update_button_text_user_input',
    'gravityflow_submit_button_text_user_input',
    'gravityflow_save_progress_button_text_user_input',
    'gravityflow_update_button_user_input',
    'gravityflow_complete_label_user_input',
    'gravityflow_update_button',
    'gravityflow_submit_button',
    'gravityflow_save_progress_button',
);

$scan_root = static function ( $root, $root_key ) use ( $needles ) {
    $hits = array();
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
            foreach ( $lines as $index => $line ) {
                if ( false === stripos( $line, $needle ) ) {
                    continue;
                }
                $start = max( 0, $index - 12 );
                $end   = min( count( $lines ) - 1, $index + 18 );
                $snippet = array();
                for ( $i = $start; $i <= $end; $i++ ) {
                    $snippet[] = array(
                        'line' => $i + 1,
                        'text' => rtrim( $lines[ $i ] ),
                    );
                }
                $hits[ $needle ][] = array(
                    'root' => $root_key,
                    'file' => $relative,
                    'line' => $index + 1,
                    'file_sha256' => hash_file( 'sha256', $file->getPathname() ),
                    'snippet' => $snippet,
                );
            }
        }
    }

    return $hits;
};

$merge_hits = static function ( array $a, array $b ) {
    foreach ( $b as $needle => $entries ) {
        if ( ! isset( $a[ $needle ] ) ) {
            $a[ $needle ] = array();
        }
        $a[ $needle ] = array_merge( $a[ $needle ], $entries );
    }
    return $a;
};

$hits = $merge_hits(
    $scan_root( $flow_root, 'gravityflow' ),
    $scan_root( $gf_root, 'gravityforms' )
);

$hook_presence = array();
foreach ( array(
    'gravityflow_update_button_text_user_input',
    'gravityflow_submit_button_text_user_input',
    'gravityflow_save_progress_button_text_user_input',
    'gravityflow_update_button_user_input',
    'gravityflow_complete_label_user_input',
) as $hook ) {
    $hook_presence[ $hook ] = ! empty( $hits[ $hook ] );
}

$reflection = array();
foreach ( array( 'Gravity_Flow_Entry_Detail', 'Gravity_Flow_Step_User_Input' ) as $class_name ) {
    if ( ! class_exists( $class_name ) ) {
        $reflection[ $class_name ] = array( 'exists' => false );
        continue;
    }
    $class = new ReflectionClass( $class_name );
    $methods = array();
    foreach ( $class->getMethods() as $method ) {
        if ( ! preg_match( '/button|submit|update|render|display|input|process/i', $method->getName() ) ) {
            continue;
        }
        $methods[] = array(
            'name' => $method->getName(),
            'visibility' => $method->isPublic() ? 'public' : ( $method->isProtected() ? 'protected' : 'private' ),
            'declaring_class' => $method->getDeclaringClass()->getName(),
            'file' => $method->getFileName() ? ltrim( str_replace( $flow_root, '', $method->getFileName() ), '/\\' ) : null,
            'start_line' => $method->getStartLine(),
            'end_line' => $method->getEndLine(),
        );
    }
    $reflection[ $class_name ] = array(
        'exists' => true,
        'file' => $class->getFileName() ? ltrim( str_replace( $flow_root, '', $class->getFileName() ), '/\\' ) : null,
        'methods' => $methods,
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
    'package_identity' => array(
        'gravity_forms_main_sha256' => hash_file( 'sha256', $gf_root . '/gravityforms.php' ),
        'gravity_flow_main_sha256' => hash_file( 'sha256', $flow_root . '/gravityflow.php' ),
    ),
    'hook_presence' => $hook_presence,
    'source_hits' => $hits,
    'reflection' => $reflection,
);

wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'srwf-correction-ux-source-probe.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);

echo "SRWF_CORRECTION_UX_SOURCE_PROBE_CAPTURED\n";
