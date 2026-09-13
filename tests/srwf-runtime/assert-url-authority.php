<?php

$base_url = getenv( 'SRWF_BASE_URL' );
$evidence_path = getenv( 'SRWF_URL_EVIDENCE_PATH' );

if ( ! is_string( $base_url ) || '' === $base_url ) {
    fwrite( STDERR, "SRWF_URL_AUTHORITY_REJECTED: SRWF_BASE_URL is required.\n" );
    exit( 1 );
}

$base_url = rtrim( $base_url, '/' );
$plugin_root_url = $base_url . '/wp-content/plugins/gravity-presentation-profiles/';
$expected = array(
    'home_option'     => $base_url,
    'siteurl_option'  => $base_url,
    'home_url'        => $base_url,
    'site_url'        => $base_url,
    'wp_content_url'  => $base_url . '/wp-content',
    'wp_plugin_url'   => $base_url . '/wp-content/plugins',
    'base_css_url'    => $plugin_root_url . 'assets/css/base.css',
    'profile_css_url' => $plugin_root_url . 'profiles/srwf/registration/profile.css',
);

$observed = array(
    'home_option'     => get_option( 'home' ),
    'siteurl_option'  => get_option( 'siteurl' ),
    'home_url'        => home_url(),
    'site_url'        => site_url(),
    'wp_content_url'  => defined( 'WP_CONTENT_URL' ) ? WP_CONTENT_URL : null,
    'wp_plugin_url'   => defined( 'WP_PLUGIN_URL' ) ? WP_PLUGIN_URL : null,
    'base_css_url'    => defined( 'GPP_PLUGIN_FILE' ) ? plugins_url( 'assets/css/base.css', GPP_PLUGIN_FILE ) : null,
    'profile_css_url' => defined( 'GPP_PLUGIN_FILE' ) ? plugins_url( 'profiles/srwf/registration/profile.css', GPP_PLUGIN_FILE ) : null,
);

$failures = array();
foreach ( $expected as $key => $value ) {
    if ( $observed[ $key ] !== $value ) {
        $failures[] = sprintf( '%s=%s expected=%s', $key, var_export( $observed[ $key ], true ), var_export( $value, true ) );
    }
}

foreach ( array( 'base_css_url', 'profile_css_url' ) as $key ) {
    if ( is_string( $observed[ $key ] ) && false !== strpos( $observed[ $key ], '/srwf-wordpress/' ) ) {
        $failures[] = $key . ' exposes the temporary filesystem basename.';
    }
}

$evidence = array(
    'schema_version'   => '1.0.0',
    'expected_base_url'=> $base_url,
    'expected'         => $expected,
    'observed'         => $observed,
    'failures'         => $failures,
);

if ( is_string( $evidence_path ) && '' !== $evidence_path ) {
    $encoded = wp_json_encode( $evidence, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
    if ( ! is_string( $encoded ) || false === file_put_contents( $evidence_path, $encoded . PHP_EOL ) ) {
        fwrite( STDERR, "SRWF_URL_AUTHORITY_REJECTED: unable to write URL evidence.\n" );
        exit( 1 );
    }
}

if ( ! empty( $failures ) ) {
    fwrite( STDERR, "SRWF_URL_AUTHORITY_REJECTED: " . implode( '; ', $failures ) . "\n" );
    exit( 1 );
}

echo "SRWF_URL_AUTHORITY_PASS\n";
