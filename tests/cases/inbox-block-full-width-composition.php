<?php

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../../src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxBlockCompositionBridge;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;

Autoloader::register();

$GLOBALS['gpp_block_filters'] = array();
$GLOBALS['gpp_filter_stack'] = array();
$GLOBALS['gpp_block_is_admin'] = false;
$GLOBALS['gpp_block_is_singular'] = true;
$GLOBALS['gpp_block_registered'] = true;
$GLOBALS['gpp_block_instance_post_id'] = null;
$GLOBALS['gpp_block_queried_object'] = (object) array( 'ID' => 42, 'post_content' => '' );
$GLOBALS['post'] = (object) array( 'ID' => 42 );
$GLOBALS['gpp_native_inbox'] = '<div class="gflow-inbox gflow-grid gflow-common"><div data-js="gflow-inbox"></div></div>';
$GLOBALS['gpp_native_block'] = array( 'blockName' => InboxPresentationAdapter::NATIVE_BLOCK );

class WP_Block_Type_Registry {
    private static $instance;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function is_registered( $name ) {
        return InboxPresentationAdapter::NATIVE_BLOCK === $name && ! empty( $GLOBALS['gpp_block_registered'] );
    }
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_block_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function doing_filter( $hook = null ) {
    if ( null === $hook ) {
        return ! empty( $GLOBALS['gpp_filter_stack'] );
    }
    return in_array( $hook, $GLOBALS['gpp_filter_stack'], true );
}

function gpp_apply_test_filters( $hook, $value ) {
    $args = func_get_args();
    array_shift( $args );
    array_shift( $args );

    $filters = array();
    foreach ( $GLOBALS['gpp_block_filters'] as $index => $filter ) {
        if ( $hook === $filter[0] ) {
            $filter[] = $index;
            $filters[] = $filter;
        }
    }
    usort(
        $filters,
        static function ( $left, $right ) {
            if ( $left[2] === $right[2] ) {
                return $left[4] <=> $right[4];
            }
            return $left[2] <=> $right[2];
        }
    );

    $GLOBALS['gpp_filter_stack'][] = $hook;
    foreach ( $filters as $filter ) {
        $callback_args = array_merge( array( $value ), $args );
        $value = call_user_func_array( $filter[1], array_slice( $callback_args, 0, $filter[3] ) );
    }
    array_pop( $GLOBALS['gpp_filter_stack'] );

    return $value;
}

function is_admin() {
    return (bool) $GLOBALS['gpp_block_is_admin'];
}

function is_singular() {
    return (bool) $GLOBALS['gpp_block_is_singular'];
}

function get_queried_object() {
    return $GLOBALS['gpp_block_queried_object'];
}

function has_block( $name, $content = null ) {
    return InboxPresentationAdapter::NATIVE_BLOCK === $name
        && is_string( $content )
        && false !== strpos( $content, '<!-- wp:gravityflow/inbox' );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
}

function gpp_test_do_blocks( $content ) {
    $marker = '<!-- wp:gravityflow/inbox /-->';
    $count = substr_count( $content, $marker );
    if ( 0 === $count ) {
        return $content;
    }

    $rendered = '';
    for ( $index = 0; $index < $count; $index++ ) {
        $post_id = null !== $GLOBALS['gpp_block_instance_post_id']
            ? (int) $GLOBALS['gpp_block_instance_post_id']
            : (int) $GLOBALS['post']->ID;
        $instance = (object) array( 'context' => array( 'postId' => $post_id ) );
        $rendered .= gpp_apply_test_filters(
            'render_block_' . InboxPresentationAdapter::NATIVE_BLOCK,
            $GLOBALS['gpp_native_inbox'],
            $GLOBALS['gpp_native_block'],
            $instance
        );
    }

    return $rendered;
}

$adapter = new ReflectionClass( InboxPresentationAdapter::class );
$model_loaded = $adapter->getProperty( 'model_loaded' );
$model_loaded->setAccessible( true );
$model = $adapter->getProperty( 'model' );
$model->setAccessible( true );
$surface_reached = $adapter->getProperty( 'surface_reached' );
$surface_reached->setAccessible( true );

$set_profile = static function ( $active ) use ( $model_loaded, $model, $surface_reached ) {
    $model_loaded->setValue( null, true );
    $model->setValue( null, $active ? new stdClass() : null );
    $surface_reached->setValue( null, false );
};
$set_page = static function ( $content, $queried_id = 42, $current_id = 42 ) {
    $GLOBALS['gpp_block_queried_object'] = (object) array(
        'ID' => $queried_id,
        'post_content' => $content,
    );
    $GLOBALS['post'] = (object) array( 'ID' => $current_id );
    $GLOBALS['gpp_block_instance_post_id'] = null;
};

InboxBlockCompositionBridge::register();

$registered = array();
foreach ( $GLOBALS['gpp_block_filters'] as $filter ) {
    $registered[ $filter[0] ][] = $filter;
}
gpp_assert_same( 1, count( $registered['the_content'] ?? array() ) > 0 ? count( array_filter( $registered['the_content'], static fn( $filter ) => PHP_INT_MIN === $filter[2] ) ) : 0, 'Current-content scope must begin at the earliest the_content boundary.' );
gpp_assert_same( 1, count( $registered['the_content'] ?? array() ) > 0 ? count( array_filter( $registered['the_content'], static fn( $filter ) => PHP_INT_MAX === $filter[2] ) ) : 0, 'Current-content scope must clear after downstream the_content processing.' );
$block_hook = 'render_block_' . InboxPresentationAdapter::NATIVE_BLOCK;
gpp_assert_same( 1, count( $registered[ $block_hook ] ?? array() ), 'Block composition bridge must register exactly one block-specific render filter.' );
gpp_assert_same( array( InboxBlockCompositionBridge::class, 'filterFrontendBlock' ), $registered[ $block_hook ][0][1], 'Registered Block callback changed unexpectedly.' );
gpp_assert_same( 20, $registered[ $block_hook ][0][2], 'Block composition should use the normal presentation priority on its exact Block hook.' );
gpp_assert_same( 3, $registered[ $block_hook ][0][3], 'Block composition requires rendered content, block identity and WP_Block context.' );

// Simulate WordPress core do_blocks on the_content priority 9. This makes the
// positive path exercise the same lifecycle boundary that the bridge enforces.
add_filter( 'the_content', 'gpp_test_do_blocks', 9, 1 );

$native = $GLOBALS['gpp_native_inbox'];
$block = $GLOBALS['gpp_native_block'];
$marker = '<!-- wp:gravityflow/inbox /-->';

// Positive current-content control: queried/current post identity matches and
// the exact source content is running through the_content.
$set_profile( true );
$set_page( $marker );
$composed = gpp_apply_test_filters( 'the_content', $marker );
gpp_assert_same( 1, substr_count( $composed, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Current queried post content must receive exactly one GPP Inbox surface.' );
gpp_assert_true( false !== strpos( $composed, $native ), 'Composition must preserve the exact native Gravity Flow Inbox markup.' );
gpp_assert_true( false !== strpos( $composed, 'gpp-inbox-surface__helper' ), 'Current-content Block must retain the canonical Inbox helper.' );
gpp_assert_true( false !== strpos( $composed, 'id="gpp-inbox-title-block-1"' ), 'First composed Block must receive a deterministic Block-specific heading ID.' );
gpp_assert_true( false !== strpos( $composed, 'aria-labelledby="gpp-inbox-title-block-1"' ), 'Surface aria-labelledby must reference its deterministic heading ID.' );
gpp_assert_same( array(), $GLOBALS['gpp_filter_stack'], 'the_content scope must be fully cleared after the current post render.' );

// Preserve single-shortcode compatibility: the canonical shortcode primitive
// still emits its historical single-instance heading identity.
$shortcode = InboxPresentationAdapter::filterShortcodeInbox( $native, array(), '' );
gpp_assert_true( false !== strpos( $shortcode, 'id="gpp-inbox-title"' ), 'Single shortcode compatibility must retain gpp-inbox-title.' );
gpp_assert_true( false !== strpos( $shortcode, 'aria-labelledby="gpp-inbox-title"' ), 'Single shortcode aria-labelledby compatibility changed.' );

// Out-of-content same-request negative: the queried page contains the Block,
// but a separate same-type render outside the_content must stay native.
$instance = (object) array( 'context' => array( 'postId' => 42 ) );
$out_of_content = gpp_apply_test_filters( $block_hook, $native, $block, $instance );
gpp_assert_same( $native, $out_of_content, 'Same-request direct/programmatic Block render outside current content must remain native.' );
gpp_assert_same( 0, substr_count( $out_of_content, 'data-gpp-inbox-surface=' ), 'Out-of-content Block render gained GPP composition.' );

// Secondary-content negative: even inside a nested the_content call, content
// that is not the queried post's exact source must push a false scope.
$secondary = gpp_apply_test_filters( 'the_content', $marker . '<p>secondary</p>' );
gpp_assert_same( $native, $secondary, 'Secondary content must not inherit current-post Inbox composition admission.' );
gpp_assert_same( 0, substr_count( $secondary, 'data-gpp-inbox-surface=' ), 'Secondary content gained GPP composition.' );

// Current/queried post mismatch must fail closed.
$set_page( $marker, 42, 99 );
$mismatched_post = gpp_apply_test_filters( 'the_content', $marker );
gpp_assert_same( $native, $mismatched_post, 'Current post identity mismatch must leave Inbox Block native.' );

// WP_Block context must independently bind the rendered block to the query.
$set_page( $marker );
$GLOBALS['gpp_block_instance_post_id'] = 99;
$mismatched_context = gpp_apply_test_filters( 'the_content', $marker );
gpp_assert_same( $native, $mismatched_context, 'Mismatched WP_Block postId context must fail closed.' );
$GLOBALS['gpp_block_instance_post_id'] = null;

// Multiple legitimate Block instances must produce unique document IDs and
// each aria-labelledby must point at the heading inside its own surface.
$multi_source = $marker . $marker;
$set_page( $multi_source );
$multi = gpp_apply_test_filters( 'the_content', $multi_source );
gpp_assert_same( 2, substr_count( $multi, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Two legitimate Inbox Blocks must produce two composed surfaces.' );
gpp_assert_same( 2, substr_count( $multi, $native ), 'Two composed surfaces must retain two host-owned native Inbox instances.' );
gpp_assert_same( 0, substr_count( $multi, 'gpp-custom-inbox-app' ), 'Multiple composition must not introduce a replacement Grid/app.' );

preg_match_all( '/\sid="([^"]+)"/', $multi, $id_matches );
gpp_assert_same( count( $id_matches[1] ), count( array_unique( $id_matches[1] ) ), 'Multiple composed Inbox instances must not produce duplicate document IDs.' );
preg_match_all( '/<section[^>]*aria-labelledby="([^"]+)"[^>]*>.*?<h1[^>]*id="([^"]+)"/sU', $multi, $surface_matches, PREG_SET_ORDER );
gpp_assert_same( 2, count( $surface_matches ), 'Each composed Inbox surface must expose a heading relationship.' );
foreach ( $surface_matches as $surface_match ) {
    gpp_assert_same( $surface_match[1], $surface_match[2], 'Each aria-labelledby must reference the heading belonging to its own surface.' );
}

// A shortcode plus a composed Block must also remain collision-free.
preg_match_all( '/\sid="([^"]+)"/', $shortcode . $composed, $mixed_id_matches );
gpp_assert_same( count( $mixed_id_matches[1] ), count( array_unique( $mixed_id_matches[1] ) ), 'Shortcode + authentic Block composition must not duplicate document IDs.' );

// Re-filtering already-composed output outside the admitted content boundary
// must not nest wrappers or rewrite it.
$recomposed = gpp_apply_test_filters( $block_hook, $composed, $block, $instance );
gpp_assert_same( $composed, $recomposed, 'Repeated filtering of composed output must remain idempotent.' );
gpp_assert_same( 1, substr_count( $recomposed, 'data-gpp-inbox-surface="gravity_flow.inbox"' ), 'Repeated filtering must not nest GPP Inbox surfaces.' );

// Existing negative controls.
$set_page( '<p>No Inbox Block.</p>' );
gpp_assert_same( '<p>No Inbox Block.</p>', gpp_apply_test_filters( 'the_content', '<p>No Inbox Block.</p>' ), 'Page without an admitted Inbox Block must remain unchanged.' );

gpp_assert_same( $native, InboxBlockCompositionBridge::filterFrontendBlock( $native, array( 'blockName' => 'core/html' ), $instance ), 'Unrelated blocks must remain untouched.' );

$set_page( $marker );
$GLOBALS['gpp_block_is_admin'] = true;
gpp_assert_same( $native, gpp_apply_test_filters( 'the_content', $marker ), 'Admin/editor Block rendering must remain native and unwrapped.' );
$GLOBALS['gpp_block_is_admin'] = false;

$GLOBALS['gpp_block_registered'] = false;
gpp_assert_same( $native, gpp_apply_test_filters( 'the_content', $marker ), 'Unregistered native Block identity must fail closed.' );
$GLOBALS['gpp_block_registered'] = true;

$set_profile( false );
gpp_assert_same( $native, gpp_apply_test_filters( 'the_content', $marker ), 'Inactive Inbox presentation must preserve the native authentic Block output.' );

$set_profile( true );
echo "INBOX_BLOCK_FULL_WIDTH_COMPOSITION_PASS current_scope=true out_of_content_native=true multiple_ids_unique=true\n";
