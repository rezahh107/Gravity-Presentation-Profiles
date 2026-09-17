<?php
/**
 * Authentic Gravity Flow 3.1.0 host-seam inventory for WU18.
 *
 * Runs only inside the pinned disposable runtime and records source/runtime
 * capability evidence. It never records entry values, users, nonces, action
 * payloads, filenames, or URLs.
 */
$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    throw new RuntimeException( 'WU21_ARTIFACT_DIR is required.' );
}
if ( ! defined( 'WP_PLUGIN_DIR' ) ) {
    throw new RuntimeException( 'WordPress plugin directory is unavailable.' );
}

$flow_root = WP_PLUGIN_DIR . '/gravityflow';
$gf_root   = WP_PLUGIN_DIR . '/gravityforms';
if ( ! is_dir( $flow_root ) || ! is_dir( $gf_root ) ) {
    throw new RuntimeException( 'Pinned Gravity packages are not installed.' );
}

$plugin_version = static function ( $file ) {
    $data = get_file_data( $file, array( 'Version' => 'Version' ) );
    return isset( $data['Version'] ) ? (string) $data['Version'] : '';
};

$flow_version = $plugin_version( $flow_root . '/gravityflow.php' );
$gf_version   = $plugin_version( $gf_root . '/gravityforms.php' );
if ( '3.1.0' !== $flow_version || '3.1.1.1' !== $gf_version ) {
    throw new RuntimeException( 'Pinned host version identity changed.' );
}

$patterns = array(
    'entry_detail_post_permission_hook' => 'gravityflow_entry_detail_content_before',
    'approve_label_filter'              => 'gravityflow_approve_label_workflow_detail',
    'reject_label_filter'               => 'gravityflow_reject_label_workflow_detail',
    'timeline_markup'                   => 'gravityflow-timeline',
    'entry_detail_class'                => 'class Gravity_Flow_Entry_Detail',
    'approval_step_class'               => 'class Gravity_Flow_Step_Approval',
    'current_step_api'                  => 'function get_current_step',
    'entry_detail_can_update'           => 'function can_update',
    'approval_button_text'              => 'approve',
    'reject_button_text'                => 'reject',
    'instructions_key'                  => 'instructionsValue',
);

$occurrences = array();
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator( $flow_root, FilesystemIterator::SKIP_DOTS )
);
foreach ( $iterator as $file ) {
    if ( ! $file->isFile() || 'php' !== strtolower( $file->getExtension() ) ) {
        continue;
    }
    $path = $file->getPathname();
    $relative = ltrim( str_replace( $flow_root, '', $path ), '/\\' );
    $lines = @file( $path, FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        continue;
    }
    foreach ( $patterns as $key => $needle ) {
        foreach ( $lines as $index => $line ) {
            if ( false === strpos( $line, $needle ) ) {
                continue;
            }
            $start = max( 0, $index - 3 );
            $end   = min( count( $lines ) - 1, $index + 5 );
            $snippet = array();
            for ( $i = $start; $i <= $end; $i++ ) {
                $snippet[] = array( 'line' => $i + 1, 'text' => trim( $lines[ $i ] ) );
            }
            $occurrences[ $key ][] = array(
                'file' => $relative,
                'line' => $index + 1,
                'snippet' => $snippet,
            );
            if ( count( $occurrences[ $key ] ) >= 12 ) {
                break;
            }
        }
    }
}

$reflection = array();
foreach ( array( 'Gravity_Flow_API', 'Gravity_Flow_Entry_Detail', 'Gravity_Flow_Step_Approval' ) as $class ) {
    if ( ! class_exists( $class ) ) {
        $reflection[ $class ] = array( 'exists' => false );
        continue;
    }
    $rc = new ReflectionClass( $class );
    $methods = array();
    foreach ( $rc->getMethods() as $method ) {
        if ( $method->getDeclaringClass()->getName() !== $class ) {
            continue;
        }
        $methods[] = array(
            'name' => $method->getName(),
            'visibility' => $method->isPublic() ? 'public' : ( $method->isProtected() ? 'protected' : 'private' ),
            'static' => $method->isStatic(),
            'file' => $method->getFileName() ? ltrim( str_replace( $flow_root, '', $method->getFileName() ), '/\\' ) : null,
            'start_line' => $method->getStartLine(),
            'end_line' => $method->getEndLine(),
        );
    }
    usort( $methods, static function ( $a, $b ) { return strcmp( $a['name'], $b['name'] ); } );
    $reflection[ $class ] = array(
        'exists' => true,
        'file' => $rc->getFileName() ? ltrim( str_replace( $flow_root, '', $rc->getFileName() ), '/\\' ) : null,
        'methods' => $methods,
    );
}

$result = array(
    'schema_version' => '1.0.0',
    'gravity_forms_version' => $gf_version,
    'gravity_flow_version' => $flow_version,
    'gravity_flow_main_sha256' => hash_file( 'sha256', $flow_root . '/gravityflow.php' ),
    'occurrences' => $occurrences,
    'reflection' => $reflection,
);
wp_mkdir_p( $artifact_dir );
file_put_contents(
    trailingslashit( $artifact_dir ) . 'wu18-host-seam-inventory.json',
    wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);
echo "WU18 authentic host seam inventory written.\n";
