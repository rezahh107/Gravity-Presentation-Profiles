<?php
namespace GravityPresentationProfiles\Elementor;

/**
 * Elementor 4.4 Native Atomic registration and authoritative *saved document*
 * lookup. No user/task data is ever rendered by a Twig template.
 */
final class Inbox2AtomicIntegration {
    const TYPE = 'e-gpp-inbox-2';

    public static function register() {
        if ( function_exists( 'add_action' ) ) {
            add_action( 'elementor/widgets/register', array( __CLASS__, 'registerWidget' ) );
        }
    }

    public static function registerWidget( $manager ) {
        if ( ! self::atomicAvailable() || ! is_object( $manager ) || ! is_callable( array( $manager, 'register' ) ) ) {
            return;
        }
        $manager->register( new Inbox2AtomicWidget() );
    }

    private static function atomicAvailable() {
        $base = 'Elementor\\Modules\\AtomicWidgets\\Elements\\Base\\Atomic_Widget_Base';
        if ( ! class_exists( $base ) || ! class_exists( 'Elementor\\Plugin' ) ) { return false; }
        $plugin = \Elementor\Plugin::instance();
        return isset( $plugin->experiments )
            && is_callable( array( $plugin->experiments, 'is_feature_active' ) )
            && $plugin->experiments->is_feature_active( 'e_atomic_elements' );
    }

    public static function validElementId( $element_id ) {
        return is_string( $element_id ) && (bool) preg_match( '/^[a-zA-Z0-9]{6,32}$/D', $element_id );
    }

    private static function validPositiveId( $id ) {
        return is_string( $id ) && (bool) preg_match( '/^[1-9][0-9]*$/D', $id )
            && (int) $id > 0 && (string) (int) $id === $id;
    }

    private static function literalId( $settings, $key ) {
        $prop = $settings[ $key ] ?? null;
        if ( ! is_array( $prop ) || ( $prop['$$type'] ?? null ) !== 'string'
            || ! self::validPositiveId( $prop['value'] ?? null ) ) {
            return null;
        }
        // A dynamic/bound setting is not a server-authorized form/page identity.
        if ( isset( $prop['binding'] ) || isset( $prop['dynamic'] ) || ! empty( $prop['disabled'] ) ) {
            return null;
        }
        return (int) $prop['value'];
    }

    /**
     * Testable pure boundary. The id must occur exactly once in the entire
     * persisted tree, and only a direct ordinary-page container placement is
     * admitted (no templates, loops, widgets-as-parents or inferred ownership).
     */
    public static function locateSavedInstance( $raw, $element_id ) {
        if ( ! self::validElementId( $element_id ) || ! is_string( $raw )
            || '' === $raw || strlen( $raw ) > 2097152 ) { return null; }
        $nodes = json_decode( $raw, true, 64 );
        if ( ! is_array( $nodes ) ) { return null; }

        $seen = 0;
        $count = 0;
        $admitted = null;
        $malformed = false;
        $walk = static function ( $items, $depth, $ordinary ) use ( &$walk, &$seen, &$count, &$admitted, &$malformed, $element_id ) {
            if ( ! is_array( $items ) || $depth > 32 ) { $malformed = true; return; }
            foreach ( $items as $node ) {
                if ( ! is_array( $node ) || ++$seen > 5000 ) { $malformed = true; return; }
                $id = $node['id'] ?? null;
                $type = $node['elType'] ?? null;
                if ( $id === $element_id ) {
                    ++$count;
                    if ( $ordinary && 'widget' === $type && ( $node['widgetType'] ?? null ) === self::TYPE
                        && empty( $node['elements'] ) && is_array( $node['settings'] ?? null ) ) {
                        $settings = $node['settings'];
                        $form = self::literalId( $settings, 'form_id' );
                        $native = self::literalId( $settings, 'native_page_id' );
                        if ( $form && $native ) {
                            $admitted = array( 'form_id' => $form, 'native_page_id' => $native );
                        }
                    }
                }
                $children = $node['elements'] ?? array();
                if ( ! is_array( $children ) ) { $malformed = true; return; }
                if ( $children ) {
                    $allowed_container = in_array( $type, array( 'container', 'section', 'column', 'e-div-block', 'e-flexbox', 'e-grid' ), true );
                    $walk( $children, $depth + 1, $ordinary && $allowed_container );
                }
                if ( $malformed ) { return; }
            }
        };
        $walk( $nodes, 0, true );
        return ! $malformed && 1 === $count ? $admitted : null;
    }

    /** Only a published, directly owned Elementor page; not a template, loop, popup or revision. */
    public static function resolvePublishedInstance( $page_id, $element_id ) {
        if ( ! self::atomicAvailable() || ! is_user_logged_in()
            || ! is_int( $page_id ) || $page_id <= 0
            || ! self::validElementId( $element_id ) ) { return null; }
        $post = get_post( $page_id );
        if ( ! $post instanceof \WP_Post || 'page' !== $post->post_type
            || 'publish' !== $post->post_status || ! current_user_can( 'read_post', $page_id )
            || 'builder' !== get_post_meta( $page_id, '_elementor_edit_mode', true ) ) {
            return null;
        }
        return self::locateSavedInstance( get_post_meta( $page_id, '_elementor_data', true ), $element_id );
    }

    /** Asset discovery only; NOT authority. Every request independently re-reads the saved document. */
    public static function pageMayContainWidget( $post ) {
        return $post instanceof \WP_Post && 'page' === $post->post_type
            && false !== strpos( (string) get_post_meta( $post->ID, '_elementor_data', true ), self::TYPE );
    }
}
