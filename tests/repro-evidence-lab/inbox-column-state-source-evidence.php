<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
$flow_source  = getenv( 'WU21_GRAVITYFLOW_SOURCE' );

if ( ! is_string( $artifact_dir ) || '' === $artifact_dir || ! is_dir( $artifact_dir ) ) {
    throw new RuntimeException( 'WU21 artifact directory is unavailable.' );
}
if ( ! is_string( $flow_source ) || '' === $flow_source || ! is_dir( $flow_source ) ) {
    throw new RuntimeException( 'Exact Gravity Flow source directory is unavailable.' );
}

function gpp_wu21_persistence_snippet( $content, $needle, $radius = 340 ) {
    $offset = strpos( $content, $needle );
    if ( false === $offset ) {
        return null;
    }

    $start  = max( 0, $offset - $radius );
    $length = min( strlen( $content ) - $start, strlen( $needle ) + ( 2 * $radius ) );
    return substr( $content, $start, $length );
}

function gpp_wu21_method_source( $content, $method_name ) {
    $needle = 'function ' . $method_name;
    $start  = strpos( $content, $needle );
    if ( false === $start ) {
        return null;
    }

    $brace = strpos( $content, '{', $start );
    if ( false === $brace ) {
        return null;
    }

    $depth = 0;
    $len   = strlen( $content );
    for ( $index = $brace; $index < $len; $index++ ) {
        if ( '{' === $content[ $index ] ) {
            $depth++;
        } elseif ( '}' === $content[ $index ] ) {
            $depth--;
            if ( 0 === $depth ) {
                return substr( $content, $start, $index - $start + 1 );
            }
        }
    }

    return null;
}

$js_markers = array(
    'gridMutationEvents',
    'localStorage',
    'getColumnState',
    'applyColumnState',
    'columnDefs.map',
    'sizeColumnsToFit',
    'data-grid-id',
);

$source_files = array();
$js_paths = array_merge(
    glob( $flow_source . '/assets/js/dist/common-inbox.*.js' ) ?: array(),
    glob( $flow_source . '/assets/js/dist/common-grid*.js' ) ?: array(),
    glob( $flow_source . '/assets/js/dist/*grid*.js' ) ?: array()
);
$js_paths = array_values( array_unique( $js_paths ) );
sort( $js_paths );

foreach ( $js_paths as $path ) {
    $content = file_get_contents( $path );
    if ( false === $content ) {
        continue;
    }

    $hits = array();
    foreach ( $js_markers as $marker ) {
        $snippet = gpp_wu21_persistence_snippet( $content, $marker );
        if ( null !== $snippet ) {
            $hits[ $marker ] = $snippet;
        }
    }

    if ( $hits ) {
        $source_files[] = array(
            'path'       => ltrim( str_replace( $flow_source, '', $path ), '/' ),
            'sha256'     => hash_file( 'sha256', $path ),
            'size_bytes' => filesize( $path ),
            'hits'       => $hits,
        );
    }
}

$php_evidence = array();
$php_candidates = array(
    'includes/pages/class-inbox.php',
    'includes/inbox/models/class-task.php',
);
$php_markers = array(
    'data-grid-id',
    'get_unique_grid_id_from_args',
    'gravityflow_inbox_args',
    'add_args_for_shortcode',
    'gravityflow_js_config_shared',
);
foreach ( $php_candidates as $relative ) {
    $path = $flow_source . '/' . $relative;
    if ( ! is_file( $path ) ) {
        continue;
    }
    $content = file_get_contents( $path );
    if ( false === $content ) {
        continue;
    }
    $hits = array();
    foreach ( $php_markers as $marker ) {
        $snippet = gpp_wu21_persistence_snippet( $content, $marker, 700 );
        if ( null !== $snippet ) {
            $hits[ $marker ] = $snippet;
        }
    }

    $methods = array();
    foreach ( array( 'get_unique_grid_id_from_args', 'get_args', 'add_args_for_shortcode' ) as $method ) {
        $method_source = gpp_wu21_method_source( $content, $method );
        if ( null !== $method_source ) {
            $methods[ $method ] = $method_source;
        }
    }

    if ( $hits || $methods ) {
        $php_evidence[] = array(
            'path'    => $relative,
            'sha256'  => hash_file( 'sha256', $path ),
            'hits'    => $hits,
            'methods' => $methods,
        );
    }
}

$plugin_header = get_file_data(
    WP_PLUGIN_DIR . '/gravityflow/gravityflow.php',
    array( 'Version' => 'Version' )
);

$evidence = array(
    'contract'         => 'SRWF_INBOX_COLUMN_STATE_SOURCE_V1',
    'execution_status' => 'CAPTURED',
    'gravity_flow'     => array(
        'version'        => isset( $plugin_header['Version'] ) ? $plugin_header['Version'] : null,
        'package_sha256' => getenv( 'WU21_FLOW_SHA256' ) ?: null,
        'source_root'    => $flow_source,
    ),
    'javascript_sources' => $source_files,
    'php_sources'        => $php_evidence,
);

file_put_contents(
    $artifact_dir . '/inbox-column-state-source-evidence.json',
    wp_json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
);

echo 'INBOX_COLUMN_STATE_SOURCE_EVIDENCE_CAPTURED ' . wp_json_encode( array(
    'gravity_flow'            => $evidence['gravity_flow'],
    'javascript_source_count' => count( $source_files ),
    'php_source_count'        => count( $php_evidence ),
), JSON_UNESCAPED_SLASHES ) . PHP_EOL;
