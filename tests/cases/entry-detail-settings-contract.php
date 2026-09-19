<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function is_admin() { return true; }
function wp_unslash( $value ) { return $value; }
function sanitize_key( $value ) { return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $value ) ); }

class GFForms {
    public static function include_addon_framework() {
    }
}

class GppSettingsRendererStub {
    public $fields = array();
    public function set_fields( $fields ) { $this->fields = $fields; }
}

class GFAddOn {
    public static $registered = array();
    protected $gpp_test_renderer = null;

    public static function register( $class ) {
        self::$registered[] = $class;
    }

    public function get_settings_renderer() { return $this->gpp_test_renderer; }
    public function set_settings_renderer( $renderer ) { $this->gpp_test_renderer = $renderer; }
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

$gform_loaded = array_values(
    array_filter(
        $GLOBALS['gpp_actions'],
        static function ( $item ) {
            return 'gform_loaded' === $item[0];
        }
    )
);
gpp_assert_same( 1, count( $gform_loaded ), 'Expected one Gravity Forms bootstrap callback.' );
gpp_assert_same( true, call_user_func( $gform_loaded[0][1] ), 'Gravity Forms bootstrap should register the GPP add-on.' );
gpp_assert_same( array( 'GravityPresentationProfiles\\GravityForms\\AddOn' ), GFAddOn::$registered, 'GPP should still register exactly one add-on class.' );

$addon_class = GFAddOn::$registered[0];
$addon = $addon_class::get_instance();
$sections = $addon->plugin_settings_fields();
$entry_detail = null;
foreach ( $sections as $section ) {
    if ( isset( $section['title'] ) && 'Operations Setup (Entry Detail)' === $section['title'] ) {
        $entry_detail = $section;
        break;
    }
}

gpp_assert_true( is_array( $entry_detail ), 'Entry Detail setup must be rendered by the native GF Add-On plugin-settings lifecycle.' );
gpp_assert_same( 1, count( $entry_detail['fields'] ), 'Base Entry Detail setup definition should keep its existing setup action unchanged.' );
$field = $entry_detail['fields'][0];
gpp_assert_same( 'entry_detail_setup_action', $field['name'], 'Entry Detail settings action name must be stable.' );
gpp_assert_same( 'select', $field['type'], 'Entry Detail setup must use a native Settings API select field.' );
gpp_assert_same( array( $addon, 'validate_entry_detail_setup_action' ), $field['validation_callback'], 'Entry Detail setup must run through the GF settings-save validation callback.' );
gpp_assert_same( array( $addon, 'discard_entry_detail_setup_action' ), $field['save_callback'], 'Entry Detail setup action must never persist as ordinary plugin settings state.' );
gpp_assert_same( '', $addon->discard_entry_detail_setup_action( null, 'form:11' ), 'Entry Detail action value must be discarded after processing.' );

$hooks = array_map(
    static function ( $item ) {
        return $item[0];
    },
    $GLOBALS['gpp_actions']
);
gpp_assert_true( in_array( 'admin_post_gpp_initialize_entry_detail_presentation', $hooks, true ), 'Legacy explicit admin-post endpoint should remain available.' );
gpp_assert_true( ! in_array( 'admin_notices', $hooks, true ), 'Entry Detail setup UI must not depend on the admin_notices lifecycle.' );
gpp_assert_true( in_array( 'admin_init', $hooks, true ) && in_array( 'admin_head', $hooks, true ), 'Entry Detail design selector must use the existing native plugin-settings renderer lifecycle.' );

// Prove the bounded controller augments the existing Entry Detail section only,
// while its value remains a transient lifecycle command rather than an option.
$_GET['page'] = 'gf_settings';
$_GET['subview'] = 'gravity-presentation-profiles';
$renderer = new GppSettingsRendererStub();
$addon->set_settings_renderer( $renderer );
\GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantSettingsController::augmentSettingsRenderer();

gpp_assert_true( is_array( $renderer->fields ) && count( $renderer->fields ) === count( $sections ), 'Visual selector must augment the existing settings renderer rather than create a parallel settings page.' );
$augmented = null;
foreach ( $renderer->fields as $section ) {
    if ( isset( $section['title'] ) && 'Operations Setup (Entry Detail)' === $section['title'] ) {
        $augmented = $section;
        break;
    }
}
gpp_assert_true( is_array( $augmented ), 'Augmented Entry Detail settings section must remain present.' );
gpp_assert_same( 3, count( $augmented['fields'] ), 'Entry Detail section should contain setup, visual selector and truthful feedback.' );
$visual = $augmented['fields'][1];
gpp_assert_same( 'entry_detail_visual_variant_action', $visual['name'], 'Visual selector action name must be stable.' );
gpp_assert_same( 'Entry Detail design', $visual['label'], 'Owner-facing selector label must be plain language.' );
gpp_assert_same( 'select', $visual['type'], 'Visual selector must use the native GF Settings select type.' );
gpp_assert_same( array( 'GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantSettingsController', 'validateSelection' ), $visual['validation_callback'], 'Visual switching must execute through the settings validation seam.' );
gpp_assert_same( array( 'GravityPresentationProfiles\\GravityForms\\EntryDetailVisualVariantSettingsController', 'discardSelection' ), $visual['save_callback'], 'Visual selector command must not persist as plugin settings state.' );
gpp_assert_same( '', \GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantSettingsController::discardSelection( null, 'opaque-command' ), 'Visual selector must discard every submitted command after lifecycle processing.' );
gpp_assert_true( false !== strpos( $visual['description'], 'Appearance only' ) && false !== strpos( $visual['description'], 'Current / Safe' ), 'Selector description must explain appearance-only switching and rollback.' );

echo "ENTRY_DETAIL_SETTINGS_CONTRACT_PASS\n";
