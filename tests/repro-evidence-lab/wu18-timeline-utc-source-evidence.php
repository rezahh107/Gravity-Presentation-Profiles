<?php

function wu18_timeline_utc_source_evidence( $flow_root, $expected_main_sha256 ) {
    if ( ! is_string( $flow_root ) || '' === trim( $flow_root ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow source root is unavailable.' );
    }

    if ( ! is_string( $expected_main_sha256 ) || 1 !== preg_match( '/^[a-f0-9]{64}$/D', strtolower( $expected_main_sha256 ) ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow package identity evidence is unavailable.' );
    }

    $flow_root = rtrim( $flow_root, "/\\" );
    $main_file = $flow_root . '/gravityflow.php';
    if ( ! is_file( $main_file ) || ! is_readable( $main_file ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow main plugin source is unreadable.' );
    }

    $main_sha256 = hash_file( 'sha256', $main_file );
    if ( ! is_string( $main_sha256 ) || ! hash_equals( strtolower( $expected_main_sha256 ), strtolower( $main_sha256 ) ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow package identity changed.' );
    }

    $relative_source = 'class-gravity-flow.php';
    $source_file = $flow_root . '/' . $relative_source;
    if ( ! is_file( $source_file ) || ! is_readable( $source_file ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow UTC source is unreadable.' );
    }

    $lines = @file( $source_file, FILE_IGNORE_NEW_LINES );
    if ( ! is_array( $lines ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow UTC source could not be read.' );
    }

    $expected_statement = "'date_created' => current_time( 'mysql', true ),";
    $matches = array();
    foreach ( $lines as $index => $line ) {
        if ( $expected_statement === trim( $line ) ) {
            $matches[] = array(
                'line' => $index + 1,
                'text' => trim( $line ),
            );
        }
    }

    if ( 1 !== count( $matches ) ) {
        throw new RuntimeException( 'Pinned Gravity Flow UTC timestamp source statement changed or is unproven.' );
    }

    $source_sha256 = hash_file( 'sha256', $source_file );
    if ( ! is_string( $source_sha256 ) || '' === $source_sha256 ) {
        throw new RuntimeException( 'Pinned Gravity Flow UTC source identity could not be recorded.' );
    }

    return array(
        'file' => $relative_source,
        'line' => $matches[0]['line'],
        'text' => $matches[0]['text'],
        'source_sha256' => $source_sha256,
        'gravity_flow_main_sha256' => $main_sha256,
    );
}
