<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_actions'] = array();
$GLOBALS['gpp_filters'] = array();
$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();

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

function esc_html( $text ) {
    return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . ltrim( $path, '/' );
}

function plugin_dir_path( $file ) {
    return dirname( $file ) . '/';
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_enqueued_styles'][] = array(
        'handle'       => $handle,
        'src'          => $src,
        'dependencies' => $dependencies,
        'version'      => $version,
        'media'        => $media,
    );
}

function wp_add_inline_style( $handle, $css ) {
    $GLOBALS['gpp_inline_styles'][] = array( 'handle' => $handle, 'css' => $css );
    return true;
}

class GFForms {
    public static $framework_included = false;

    public static function include_addon_framework() {
        self::$framework_included = true;
    }
}

class GFAddOn {
    public static $registered = array();

    public static function register( $class ) {
        self::$registered[] = $class;
    }

    public function init_frontend() {
    }

    public function get_form_settings( $form ) {
        return isset( $form[ $this->_slug ] ) && is_array( $form[ $this->_slug ] )
            ? $form[ $this->_slug ]
            : array();
    }
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver;

final class GppAddonMemoryStateStore implements StateStore {
    private $state = null;

    public function load() {
        return $this->state;
    }

    public function commit( $expected_revision, $next_state ) {
        $revision = is_array( $this->state ) && isset( $this->state['revision'] ) ? $this->state['revision'] : 0;
        if ( $revision !== $expected_revision ) {
            return false;
        }
        $this->state = $next_state;
        return true;
    }
}

final class GppAddonSettingsField {
    public $error = null;

    public function set_error( $message ) {
        $this->error = $message;
    }
}

$gform_loaded_actions = array_values(
    array_filter(
        $GLOBALS['gpp_actions'],
        static function ( $item ) {
            return 'gform_loaded' === $item[0];
        }
    )
);
gpp_assert_same( 1, count( $gform_loaded_actions ), 'Plugin bootstrap should register exactly one Gravity Forms integration callback through gform_loaded.' );
$bootstrap_callback = $gform_loaded_actions[0][1];
gpp_assert_same( true, call_user_func( $bootstrap_callback ), 'Gravity Forms availability should load and register the add-on.' );
gpp_assert_same( true, GFForms::$framework_included, 'Bootstrap should ask Gravity Forms to include its Add-On Framework.' );
gpp_assert_same( array( 'GravityPresentationProfiles\\GravityForms\\AddOn' ), GFAddOn::$registered, 'Exactly the GPP add-on class should register.' );

$addon_class = GFAddOn::$registered[0];
$addon       = $addon_class::get_instance();

$visual_store  = new GppAddonMemoryStateStore();
$binding_store = new GppAddonMemoryStateStore();
$visual        = new VisualPackageLifecycle( $visual_store );
$workflow      = new SettingsLifecycleWorkflow(
    $visual,
    new BindingSetLifecycle( $binding_store, new EvidenceReferenceGate( array() ) )
);
$workflow_property = new ReflectionProperty( $addon_class, 'visual_workflow' );
$workflow_property->setAccessible( true );
$workflow_property->setValue( $addon, $workflow );

$plugin_sections = $addon->plugin_settings_fields();
$import_field     = $plugin_sections[0]['fields'][0];
gpp_assert_same( 'visual_profile_package_json', $import_field['name'], 'Plugin settings must expose lifecycle-backed package JSON import.' );
gpp_assert_same( array( $addon, 'validate_visual_package_import' ), $import_field['validation_callback'], 'Package import must be rooted through the production Settings API callback.' );
gpp_assert_same( array( $addon, 'discard_visual_package_json' ), $import_field['save_callback'], 'Raw package JSON must not be retained as a second settings store.' );

$canonical_json = file_get_contents( dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json' );
$import_probe   = new GppAddonSettingsField();
$addon->validate_visual_package_import( $import_probe, $canonical_json );
gpp_assert_same( null, $import_probe->error, 'Canonical schema 1.1 package must import through the production plugin-settings callback.' );
gpp_assert_same( '', $addon->discard_visual_package_json( null, $canonical_json ), 'Raw imported package JSON must be discarded from plugin settings persistence.' );

$invalid_probe = new GppAddonSettingsField();
$before_invalid = $visual->snapshot();
$addon->validate_visual_package_import( $invalid_probe, '{not-json' );
gpp_assert_true( is_string( $invalid_probe->error ) && '' !== $invalid_probe->error, 'Invalid JSON must preserve an explicit settings validation error.' );
gpp_assert_same( $before_invalid, $visual->snapshot(), 'Invalid JSON must create zero partial installation state.' );

$alternate = json_decode( $canonical_json, true );
$alternate['package_id'] = 'alternate.registration.presentation';
$alternate['package_version'] = '2.0.0';
$alternate['surface_profiles'][0]['profile_id'] = 'alternate.registration.v2';
$alternate['design_tokens']['colors']['primary'] = '#7C3AED';
$alternate['design_tokens']['colors']['primary_pressed'] = '#6D28D9';
$alternate_json = json_encode( $alternate, JSON_UNESCAPED_SLASHES );
$alternate_probe = new GppAddonSettingsField();
$addon->validate_visual_package_import( $alternate_probe, $alternate_json );
gpp_assert_same( null, $alternate_probe->error, 'A second valid declarative package must import through the same production settings callback.' );

$sections = $addon->form_settings_fields( array( 'id' => 17 ) );
$fields   = $sections[0]['fields'];
gpp_assert_same( 'enabled', $fields[0]['name'], 'Form settings must preserve the canonical enable setting.' );
gpp_assert_same( 'declarative_profile', $fields[1]['name'], 'Form settings must expose exact installed declarative profile selection.' );
gpp_assert_same( 'profile', $fields[2]['name'], 'Legacy profile selection must remain available.' );

$declarative_values = array_column( $fields[1]['choices'], 'value' );
$canonical_ref = DeclarativePresentationResolver::encodeReference(
    'srwf.registration.presentation',
    '1.1.0',
    'srwf.registration.v1'
);
$alternate_ref = DeclarativePresentationResolver::encodeReference(
    'alternate.registration.presentation',
    '2.0.0',
    'alternate.registration.v2'
);
gpp_assert_true( in_array( $canonical_ref, $declarative_values, true ), 'Imported canonical package/version/profile must become an exact form-selection choice.' );
gpp_assert_true( in_array( $alternate_ref, $declarative_values, true ), 'Second imported package/version/profile must become an exact form-selection choice.' );
$legacy_values = array_column( $fields[2]['choices'], 'value' );
gpp_assert_true( in_array( 'srwf-registration', $legacy_values, true ), 'Legacy SRWF Registration profile must remain selectable.' );

$addon->init_frontend();
$frontend_action_hooks = array_map( static function ( $item ) { return $item[0]; }, $GLOBALS['gpp_actions'] );
$frontend_filter_hooks = array_map( static function ( $item ) { return $item[0]; }, $GLOBALS['gpp_filters'] );
gpp_assert_true( in_array( 'gform_enqueue_scripts', $frontend_action_hooks, true ), 'Frontend integration must use the documented per-form enqueue hook.' );
gpp_assert_true( in_array( 'gform_pre_render', $frontend_filter_hooks, true ), 'Frontend integration must derive semantic classes through the documented Form Object lifecycle.' );
gpp_assert_true( ! in_array( 'gform_form_tag', $frontend_filter_hooks, true ), 'Frontend integration must not rewrite rendered host markup for presentation identity.' );

$legacy_form = array(
    'id' => 17,
    'cssClass' => 'host-legacy-class',
    'gravity-presentation-profiles' => array( 'enabled' => '1', 'declarative_profile' => '', 'profile' => 'srwf-registration' ),
);
$declarative_form = array(
    'id' => 18,
    'cssClass' => 'host-declarative-class',
    'gravity-presentation-profiles' => array( 'enabled' => '1', 'declarative_profile' => $canonical_ref, 'profile' => 'srwf-registration' ),
);
$same_selection_form = array(
    'id' => 118,
    'cssClass' => 'host-same-selection-class',
    'gravity-presentation-profiles' => array( 'enabled' => '1', 'declarative_profile' => $canonical_ref, 'profile' => '' ),
);
$alternate_form = array(
    'id' => 19,
    'cssClass' => 'host-alternate-class',
    'gravity-presentation-profiles' => array( 'enabled' => '1', 'declarative_profile' => $alternate_ref, 'profile' => 'srwf-registration' ),
);
$plain_form = array(
    'id' => 20,
    'cssClass' => 'host-plain-class',
    'gravity-presentation-profiles' => array( 'enabled' => '0', 'declarative_profile' => $canonical_ref, 'profile' => 'srwf-registration' ),
);
$missing_form = array(
    'id' => 21,
    'cssClass' => 'host-missing-class',
    'gravity-presentation-profiles' => array(
        'enabled' => '1',
        'declarative_profile' => DeclarativePresentationResolver::encodeReference( 'srwf.registration.presentation', '9.9.9', 'srwf.registration.v1' ),
        'profile' => 'srwf-registration',
    ),
);
$malformed_form = array(
    'id' => 22,
    'cssClass' => 'host-malformed-class',
    'gravity-presentation-profiles' => array( 'enabled' => '1', 'declarative_profile' => 'broken-reference', 'profile' => 'srwf-registration' ),
);

$legacy_state = $addon->resolve_form_state( $legacy_form );
gpp_assert_true( $legacy_state->isActive(), 'Legacy selected profile must remain active.' );
gpp_assert_same( 'srwf-registration', $legacy_state->profile()->key(), 'Legacy resolver behavior must remain unchanged.' );

$declarative_state    = $addon->resolve_form_state( $declarative_form );
$same_selection_state = $addon->resolve_form_state( $same_selection_form );
$alternate_state      = $addon->resolve_form_state( $alternate_form );
gpp_assert_true( $declarative_state->isActive(), 'Exact installed declarative selection must resolve active.' );
gpp_assert_true( $same_selection_state->isActive(), 'The same declarative selection must resolve on a different form.' );
gpp_assert_true( $alternate_state->isActive(), 'Second exact installed declarative selection must resolve active.' );
gpp_assert_same( $declarative_state->profile()->key(), $same_selection_state->profile()->key(), 'Runtime profile identity must depend on package/version/profile selection rather than Form ID.' );
gpp_assert_true( $declarative_state->profile()->key() !== $alternate_state->profile()->key(), 'Distinct declarative package/profile references must receive distinct runtime scope identities.' );
gpp_assert_true( ! $addon->resolve_form_state( $plain_form )->isActive(), 'Disabled form must remain native.' );
gpp_assert_true( ! $addon->resolve_form_state( $missing_form )->isActive(), 'Missing declarative version must fail closed instead of falling back to legacy.' );
gpp_assert_true( ! $addon->resolve_form_state( $malformed_form )->isActive(), 'Malformed persisted declarative reference must fail closed instead of falling back to legacy.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $legacy_form, false );
gpp_assert_same( 2, count( $GLOBALS['gpp_enqueued_styles'] ), 'Legacy enabled form must still enqueue Base + legacy profile stylesheet.' );
gpp_assert_same( 'gpp-profile-srwf-registration', $GLOBALS['gpp_enqueued_styles'][1]['handle'], 'Legacy profile stylesheet handle must remain unchanged.' );
gpp_assert_same( array(), $GLOBALS['gpp_inline_styles'], 'Legacy profile must not receive declarative inline variables.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $declarative_form, true );
gpp_assert_same( 2, count( $GLOBALS['gpp_enqueued_styles'] ), 'Declarative AJAX/re-render path must enqueue Base + one generic stylesheet.' );
gpp_assert_same( 'gpp-gravity-forms-declarative', $GLOBALS['gpp_enqueued_styles'][1]['handle'], 'Declarative selection must use repository-owned generic stylesheet.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_inline_styles'] ), 'Declarative selection must emit one isolated validated-variable rule.' );
$canonical_css = $GLOBALS['gpp_inline_styles'][0]['css'];
gpp_assert_true( false !== strpos( $canonical_css, '--gpp-primary-action-background:#1D4ED8;' ), 'Canonical declarative package must project its controlled primary token.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $same_selection_form, false );
gpp_assert_same( $canonical_css, $GLOBALS['gpp_inline_styles'][0]['css'], 'Two different Form IDs selecting the same portable profile must receive the same runtime CSS scope.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $alternate_form, false );
$alternate_css = $GLOBALS['gpp_inline_styles'][0]['css'];
gpp_assert_true( false !== strpos( $alternate_css, '--gpp-primary-action-background:#7C3AED;' ), 'Second declarative package must project its own token value.' );
gpp_assert_true( false === strpos( $alternate_css, '#1D4ED8' ), 'Second declarative package must not leak the canonical primary token into its isolated rule.' );
gpp_assert_true( $canonical_css !== $alternate_css, 'Distinct declarative selections must not share one mutable token rule.' );

$GLOBALS['gpp_enqueued_styles'] = array();
$GLOBALS['gpp_inline_styles'] = array();
$addon->enqueue_form_assets( $missing_form, false );
gpp_assert_same( array(), $GLOBALS['gpp_enqueued_styles'], 'Unresolved declarative selection must enqueue no GPP stylesheet.' );
gpp_assert_same( array(), $GLOBALS['gpp_inline_styles'], 'Unresolved declarative selection must emit no partial inline style.' );

$declarative_render = $addon->add_form_state_css_classes( $declarative_form );
$alternate_render   = $addon->add_form_state_css_classes( $alternate_form );
$plain_render       = $addon->add_form_state_css_classes( $plain_form );
$missing_render     = $addon->add_form_state_css_classes( $missing_form );
$declarative_twice  = $addon->add_form_state_css_classes( $declarative_render );

gpp_assert_true( false !== strpos( $declarative_render['cssClass'], 'gpp-enabled' ), 'Declarative form must receive GPP enabled identity.' );
gpp_assert_true( false !== strpos( $declarative_render['cssClass'], 'gpp-declarative' ), 'Declarative form must receive generic declarative identity.' );
gpp_assert_true( false !== strpos( $declarative_render['cssClass'], 'gpp-field-layout-single-column' ), 'Controlled composition enum must map to a fixed semantic class.' );
gpp_assert_true( false !== strpos( $declarative_render['cssClass'], 'gpp-cap-gf-orbital-control-metric-projection' ), 'Admitted Orbital capability must map to its fixed adapter class.' );
gpp_assert_true( false !== strpos( $declarative_render['cssClass'], 'gpp-cap-pgr-jalali-validation-message-after-control' ), 'Admitted PersianGravity capability must map to its fixed adapter class.' );
gpp_assert_true( $declarative_render['cssClass'] !== $alternate_render['cssClass'], 'Two differently selected forms must have distinct runtime scope classes.' );
gpp_assert_same( $declarative_render['cssClass'], $declarative_twice['cssClass'], 'AJAX/re-render class application must remain idempotent.' );
gpp_assert_same( $plain_form, $plain_render, 'Ordinary disabled form must remain untouched.' );
gpp_assert_same( $missing_form, $missing_render, 'Failed declarative form must remain untouched and cannot contaminate native presentation.' );

$visual->remove( array( 'package_id' => 'srwf.registration.presentation', 'package_version' => '1.1.0' ) );
gpp_assert_true( ! $addon->resolve_form_state( $declarative_form )->isActive(), 'Removing an installed version after form selection must make that form fail closed.' );
$after_removal = $addon->add_form_state_css_classes( $declarative_form );
gpp_assert_same( $declarative_form, $after_removal, 'Removed declarative version must not leave an apparently active presentation.' );

gpp_assert_same( false, $addon->add_form_state_css_classes( false ), 'Form-not-found sentinel must pass through unchanged.' );

echo "GRAVITY_FORMS_ADDON_PASS\n";
