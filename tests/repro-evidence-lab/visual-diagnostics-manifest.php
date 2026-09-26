<?php
function wu21_visual_diagnostics_policy() {
    return array(
        'schema_version' => '1.0.0',
        'root' => 'visual-regression-diagnostics',
        'inclusion_policy' => 'RECURSIVE_MACHINE_READABLE_JSON_JSONL_V1',
        'included_extensions' => array( '.json', '.jsonl' ),
        'required_paths' => array( 'empty-state-seam.json', 'matrix-j-browser-zoom.json', 'manifest.json' ),
    );
}

function wu21_visual_diagnostics_manifest( $artifact_dir ) {
    $policy = wu21_visual_diagnostics_policy();
    $root = rtrim( $artifact_dir, DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR . $policy['root'];
    if ( ! is_dir( $root ) ) {
        throw new RuntimeException( 'Missing visual diagnostics evidence tree: ' . $root );
    }
    $files = array();
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ( $iterator as $file ) {
        if ( $file->isLink() ) {
            throw new RuntimeException( 'Visual diagnostics evidence must not use symlinks: ' . $file->getPathname() );
        }
        if ( ! $file->isFile() ) {
            continue;
        }
        $relative = substr( $file->getPathname(), strlen( $root ) + 1 );
        $relative = str_replace( DIRECTORY_SEPARATOR, '/', $relative );
        $extension = strtolower( pathinfo( $relative, PATHINFO_EXTENSION ) );
        if ( ! in_array( '.' . $extension, $policy['included_extensions'], true ) ) {
            continue;
        }
        $sha256 = hash_file( 'sha256', $file->getPathname() );
        if ( false === $sha256 ) {
            throw new RuntimeException( 'Unable to hash visual diagnostics evidence: ' . $relative );
        }
        $files[ $relative ] = array(
            'path' => $relative,
            'sha256' => $sha256,
            'size_bytes' => $file->getSize(),
        );
    }
    ksort( $files, SORT_STRING );
    foreach ( $policy['required_paths'] as $required ) {
        if ( ! isset( $files[ $required ] ) ) {
            throw new RuntimeException( 'Missing required proof-bearing visual diagnostic: ' . $required );
        }
    }
    if ( ! $files ) {
        throw new RuntimeException( 'Visual diagnostics evidence manifest is empty.' );
    }
    return array_merge( $policy, array( 'files' => array_values( $files ) ) );
}

function wu21_visual_manifest_canonicalize( $value ) {
    if ( ! is_array( $value ) ) return $value;
    $is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
    if ( $is_list ) return array_map( 'wu21_visual_manifest_canonicalize', $value );
    ksort( $value, SORT_STRING );
    foreach ( $value as $key => $item ) $value[ $key ] = wu21_visual_manifest_canonicalize( $item );
    return $value;
}

function wu21_visual_manifest_canonical_json( $value ) {
    return json_encode( wu21_visual_manifest_canonicalize( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
}

function wu21_assert_visual_diagnostics_manifest( $artifact_dir, $bound_manifest ) {
    if ( ! is_array( $bound_manifest ) ) {
        throw new RuntimeException( 'Canonical WU21 evidence is missing the bound visual diagnostics manifest.' );
    }
    $actual = wu21_visual_diagnostics_manifest( $artifact_dir );
    if ( ! hash_equals( hash( 'sha256', wu21_visual_manifest_canonical_json( $bound_manifest ) ), hash( 'sha256', wu21_visual_manifest_canonical_json( $actual ) ) ) ) {
        throw new RuntimeException( 'Visual diagnostics evidence manifest mismatch.' );
    }
    return $actual;
}
