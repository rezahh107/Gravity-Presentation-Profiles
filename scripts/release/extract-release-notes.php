<?php

$options = getopt( '', array( 'changelog:', 'version:', 'output:' ) );
$path = isset( $options['changelog'] ) ? (string) $options['changelog'] : 'CHANGELOG.md';
$version = isset( $options['version'] ) ? (string) $options['version'] : '';
$output = isset( $options['output'] ) ? (string) $options['output'] : '';
if ( '' === $version || '' === $output || ! is_file( $path ) ) {
    fwrite( STDERR, "GPP_RELEASE_NOTES_FAIL: invalid arguments.\n" );
    exit( 1 );
}
$text = file_get_contents( $path );
$pattern = '/^## \[' . preg_quote( $version, '/' ) . '\](?:\s+-\s+\d{4}-\d{2}-\d{2})?\s*$\R(.*?)(?=^## \[|\z)/ms';
if ( 1 !== preg_match( $pattern, $text, $m ) ) {
    fwrite( STDERR, "GPP_RELEASE_NOTES_FAIL: release section not found.\n" );
    exit( 1 );
}
$body = trim( $m[1] );
if ( '' === $body ) {
    fwrite( STDERR, "GPP_RELEASE_NOTES_FAIL: release section is empty.\n" );
    exit( 1 );
}
file_put_contents( $output, "# Gravity Presentation Profiles v{$version}\n\n{$body}\n" );
echo "GPP_RELEASE_NOTES_PASS\n";
