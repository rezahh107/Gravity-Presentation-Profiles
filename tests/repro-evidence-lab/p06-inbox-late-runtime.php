<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit( 1 );
}

use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

$mode = getenv( 'P06_LATE_SURFACE' );
$manifest = get_option( 'gpp_wu21_fixture_manifest' );
$fixture = get_option( 'gpp_p06_fixture_manifest' );
if ( ! in_array( $mode, array( 'shortcode', 'block' ), true )
    || ! is_array( $manifest ) || empty( $manifest['operator']['id'] )
    || ! is_array( $fixture ) || empty( $fixture['unrelated_page']['page_id'] ) ) {
    throw new RuntimeException( 'P06 late delivery requires an authentic WU21 operator and unrelated page fixture.' );
}

wp_set_current_user( (int) $manifest['operator']['id'] );
global $wp_query, $wp_the_query, $post;
$query = new WP_Query( array( 'page_id' => (int) $fixture['unrelated_page']['page_id'], 'post_type' => 'page' ) );
if ( ! $query->is_singular() || ! $query->post || false !== strpos( $query->post->post_content, 'gravityflow' ) ) {
    throw new RuntimeException( 'P06 late delivery requires a singular page without an Inbox in post_content.' );
}
$wp_query = $query;
$wp_the_query = $query;
$post = $query->post;
setup_postdata( $post );

do_action( 'wp_enqueue_scripts' );
ob_start();
wp_print_styles();
$head = ob_get_clean();
$handles = array( InboxPresentationAdapter::STYLE_HANDLE, InboxPresentationAdapter::NATIVE_STYLE_HANDLE );
foreach ( $handles as $handle ) {
    if ( wp_style_is( $handle, 'enqueued' ) || false !== strpos( $head, $handle . '-css' ) ) {
        throw new RuntimeException( 'Unrelated page received an Inbox stylesheet during head printing: ' . $handle );
    }
}
if ( ! did_action( 'wp_print_styles' ) ) {
    throw new RuntimeException( 'P06 late delivery did not pass WordPress head style printing.' );
}

$lookalike = '<div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div>';
$unrelated = do_blocks( '<!-- wp:html -->' . $lookalike . '<!-- /wp:html -->' );
if ( false !== strpos( $unrelated, '-inbox-css"' ) || wp_style_is( $handles[0], 'enqueued' ) ) {
    throw new RuntimeException( 'Unrelated lookalike block emitted late Inbox styles.' );
}

$render = static function () use ( $mode ) {
    return 'shortcode' === $mode
        ? do_shortcode( '[gravityflow page="inbox"]' )
        : do_blocks( '<!-- wp:' . InboxPresentationAdapter::NATIVE_BLOCK . ' /-->' );
};
$output = $render();
if ( false === strpos( $output, 'data-js="gflow-inbox"' ) ) {
    throw new RuntimeException( 'Authentic late ' . $mode . ' render did not produce the native Inbox.' );
}
foreach ( $handles as $handle ) {
    if ( 1 !== substr_count( $output, $handle . '-css' ) || ! wp_style_is( $handle, 'done' ) ) {
        throw new RuntimeException(
            'Authentic late ' . $mode . ' did not emit exactly one completed style: ' . $handle
            . ' count=' . substr_count( $output, $handle . '-css' )
            . ' registered=' . (int) wp_style_is( $handle, 'registered' )
            . ' enqueued=' . (int) wp_style_is( $handle, 'enqueued' )
            . ' done=' . (int) wp_style_is( $handle, 'done' )
            . ' concat=' . (int) wp_styles()->do_concat
            . ' wrapper=' . (int) ( false !== strpos( $output, 'data-gpp-inbox-surface="gravity_flow.inbox"' ) )
            . ' links=' . substr_count( $output, '<link' )
        );
    }
}
$presentation = strpos( $output, $handles[0] . '-css' );
$native = strpos( $output, $handles[1] . '-css' );
$inbox = strpos( $output, 'data-js="gflow-inbox"' );
if ( ! ( $presentation < $native && $native < $inbox ) ) {
    throw new RuntimeException( 'Late Inbox styles did not precede output in dependency order.' );
}
$styles = wp_styles();
foreach ( array( 'assets/css/srwf-gravity-flow-inbox.css', 'assets/css/srwf-gravity-flow-inbox-native.css' ) as $index => $path ) {
    $registered = isset( $styles->registered[ $handles[ $index ] ] ) ? $styles->registered[ $handles[ $index ] ] : null;
    $expected = substr( hash_file( 'sha256', dirname( GPP_PLUGIN_FILE ) . '/' . $path ), 0, 16 );
    if ( ! $registered || $expected !== $registered->ver || false === strpos( $output, '?ver=' . $expected ) ) {
        throw new RuntimeException( 'Late Inbox stylesheet lost its content-derived version: ' . $path );
    }
}
$second = $render();
foreach ( $handles as $handle ) {
    if ( false !== strpos( $second, $handle . '-css' ) ) {
        throw new RuntimeException( 'Second late ' . $mode . ' render duplicated a stylesheet: ' . $handle );
    }
}

echo 'P06_LATE_INBOX_RUNTIME_PASS=' . $mode . PHP_EOL;
