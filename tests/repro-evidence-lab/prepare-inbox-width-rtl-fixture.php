<?php
/**
 * Build the two bounded frontend host contexts used by GPP-RP-WU-01.
 *
 * Both pages render Gravity Flow's authentic frontend Inbox shortcode. The
 * only difference is the page/theme host geometry around that shortcode.
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

$artifact_dir = getenv( 'WU21_ARTIFACT_DIR' );
if ( ! is_string( $artifact_dir ) || '' === $artifact_dir ) {
    fwrite( STDERR, "WU21_ARTIFACT_DIR required\n" );
    exit( 1 );
}

$theme = array(
    'template'   => (string) get_option( 'template' ),
    'stylesheet' => (string) get_option( 'stylesheet' ),
);
if ( 'twentytwentyfive' !== $theme['template'] || 'twentytwentyfive' !== $theme['stylesheet'] ) {
    fwrite( STDERR, 'Comparative fixture requires Twenty Twenty-Five; observed ' . wp_json_encode( $theme ) . "\n" );
    exit( 1 );
}

$contexts = array(
    'FULL_WIDTH_HOST' => array(
        'slug'    => 'gpp-rp-inbox-full-width-host',
        'title'   => 'GPP RP Inbox Full Width Host',
        'content' => '<!-- wp:group {"align":"full","className":"gpp-rp-comparative-host gpp-rp-comparative-host--full","layout":{"type":"default"}} -->'
            . '<div class="wp-block-group alignfull gpp-rp-comparative-host gpp-rp-comparative-host--full" data-gpp-comparative-host="FULL_WIDTH_HOST">'
            . '[gravityflow page="inbox"]'
            . '</div><!-- /wp:group -->',
        'intent'  => 'Theme/page shell supplies the available full page width; GPP owns only its bounded inner Inbox axis.',
    ),
    'CONSTRAINED_HOST' => array(
        'slug'    => 'gpp-rp-inbox-constrained-host',
        'title'   => 'GPP RP Inbox Constrained Host',
        'content' => '<!-- wp:group {"className":"gpp-rp-comparative-host gpp-rp-comparative-host--constrained","style":{"dimensions":{"minHeight":"0px"}},"layout":{"type":"constrained","contentSize":"48rem"}} -->'
            . '<div class="wp-block-group gpp-rp-comparative-host gpp-rp-comparative-host--constrained" data-gpp-comparative-host="CONSTRAINED_HOST">'
            . '[gravityflow page="inbox"]'
            . '</div><!-- /wp:group -->',
        'intent'  => 'Diagnostic bounded parent; GPP must remain truthful to the parent instead of claiming viewport ownership.',
    ),
);

$manifest = array(
    'schema'         => 'gpp.inbox_width_rtl_fixture.v1',
    'data_class'     => 'SYNTHETIC_NON_PII',
    'shortcode'      => '[gravityflow page="inbox"]',
    'theme'          => $theme,
    'wordpress'      => (string) get_bloginfo( 'version' ),
    'repository_sha' => (string) getenv( 'GPP_WU21_REPOSITORY_SHA' ),
    'contexts'       => array(),
);

foreach ( $contexts as $identity => $definition ) {
    $existing = get_page_by_path( $definition['slug'], OBJECT, 'page' );
    if ( $existing instanceof WP_Post ) {
        wp_delete_post( $existing->ID, true );
    }

    $page_id = wp_insert_post(
        array(
            'post_type'    => 'page',
            'post_status'  => 'publish',
            'post_name'    => $definition['slug'],
            'post_title'   => $definition['title'],
            'post_content' => $definition['content'],
        ),
        true
    );

    if ( is_wp_error( $page_id ) || ! $page_id ) {
        $message = is_wp_error( $page_id ) ? $page_id->get_error_message() : 'unknown page creation failure';
        fwrite( STDERR, $identity . ': ' . $message . "\n" );
        exit( 1 );
    }

    $url = get_permalink( $page_id );
    if ( ! is_string( $url ) || '' === $url ) {
        fwrite( STDERR, $identity . ": permalink unavailable\n" );
        exit( 1 );
    }

    $manifest['contexts'][ $identity ] = array(
        'page_id'      => (int) $page_id,
        'url'          => $url,
        'host_selector'=> '[data-gpp-comparative-host="' . $identity . '"]',
        'intent'       => $definition['intent'],
        'content_sha256' => hash( 'sha256', $definition['content'] ),
    );
}

$path = trailingslashit( $artifact_dir ) . 'inbox-width-rtl-fixture.json';
file_put_contents(
    $path,
    wp_json_encode( $manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n"
);
update_option( 'gpp_rp_inbox_width_rtl_fixture', $manifest, false );

echo wp_json_encode( $manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "\n";
