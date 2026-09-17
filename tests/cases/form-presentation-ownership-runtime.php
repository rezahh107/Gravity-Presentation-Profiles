<?php

require_once dirname( __DIR__ ) . '/helpers.php';

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['gpp_pr35_actions'] = array();
$GLOBALS['gpp_pr35_filters'] = array();
$GLOBALS['gpp_pr35_enqueued_styles'] = array();
$GLOBALS['gpp_pr35_inline_styles'] = array();

function add_action( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_pr35_actions'][] = array( $hook, $callback, $priority, $accepted_args );
}

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_pr35_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function plugins_url( $path, $plugin_file ) {
    unset( $plugin_file );
    return 'https://example.test/wp-content/plugins/gravity-presentation-profiles/' . ltrim( $path, '/' );
}

function plugin_dir_path( $file ) {
    return dirname( $file ) . '/';
}

function wp_enqueue_style( $handle, $src = '', $dependencies = array(), $version = false, $media = 'all' ) {
    $GLOBALS['gpp_pr35_enqueued_styles'][] = array(
        'handle' => $handle,
        'src' => $src,
        'dependencies' => $dependencies,
        'version' => $version,
        'media' => $media,
    );
}

function wp_add_inline_style( $handle, $css ) {
    $GLOBALS['gpp_pr35_inline_styles'][] = array( 'handle' => $handle, 'css' => $css );
    return true;
}

class GFForms {
    public static function include_addon_framework() {
    }
}

class GFAddOn {
    public static $registered = array();

    public static function register( $class ) {
        self::$registered[] = $class;
    }

    public function get_form_settings( $form ) {
        return isset( $form[ $this->_slug ] ) && is_array( $form[ $this->_slug ] )
            ? $form[ $this->_slug ]
            : array();
    }
}

require dirname( __DIR__, 2 ) . '/gravity-presentation-profiles.php';

use GravityPresentationProfiles\Core\Diagnostics\RuntimeDecisionTrace;
use GravityPresentationProfiles\Core\Diagnostics\RuntimeDiagnostics;
use GravityPresentationProfiles\Core\Lifecycle\BindingSetLifecycle;
use GravityPresentationProfiles\Core\Lifecycle\EvidenceReferenceGate;
use GravityPresentationProfiles\Core\Lifecycle\SettingsLifecycleWorkflow;
use GravityPresentationProfiles\Core\Lifecycle\StateStore;
use GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle;
use GravityPresentationProfiles\GravityForms\DeclarativePresentationResolver;
use GravityPresentationProfiles\SRWF\GravityForms\GtbCoexistenceGuard;

final class GppPr35MemoryStateStore implements StateStore {
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

$bootstrap = array_values(
    array_filter(
        $GLOBALS['gpp_pr35_actions'],
        static function ( $item ) {
            return 'gform_loaded' === $item[0];
        }
    )
);
gpp_assert_same( 1, count( $bootstrap ), 'Plugin must keep one deferred Gravity Forms bootstrap.' );
gpp_assert_same( true, call_user_func( $bootstrap[0][1] ), 'Gravity Forms integration should bootstrap in the test host.' );
gpp_assert_same( 1, count( GFAddOn::$registered ), 'Exactly one GPP add-on must register.' );

$addon_class = GFAddOn::$registered[0];
$addon = $addon_class::get_instance();

$visual_store = new GppPr35MemoryStateStore();
$binding_store = new GppPr35MemoryStateStore();
$visual = new VisualPackageLifecycle( $visual_store );
$binding_artifact = json_decode( file_get_contents( dirname( __DIR__ ) . '/fixtures/wu09-binding-set-a.json' ), true );
$bindings = new BindingSetLifecycle(
    $binding_store,
    new EvidenceReferenceGate(
        array(
            'fixture:fixture.bindings.a.v1:full_name',
            'fixture:fixture.bindings.a.v1:national_id',
            'fixture:fixture.bindings.a.v1:current_step',
            'fixture:fixture.bindings.a.v1:created_at',
            'fixture:fixture.bindings.a.v1:school',
        )
    )
);
$workflow = new SettingsLifecycleWorkflow( $visual, $bindings );
$workflow_property = new ReflectionProperty( $addon_class, 'visual_workflow' );
$workflow_property->setAccessible( true );
$workflow_property->setValue( $addon, $workflow );

$registration = json_decode( file_get_contents( dirname( __DIR__, 2 ) . '/profiles/srwf/registration/profile-package-v1.1.json' ), true );
$flow_package = json_decode( file_get_contents( dirname( __DIR__ ) . '/fixtures/wu09-visual-package.json' ), true );
$visual->import( $registration );
$visual->import( $flow_package );

$flow_profiles = array(
    'gravity_flow.inbox' => 'shared.inbox.v1',
    'gravity_flow.entry_detail' => 'shared.entry_detail.v1',
    'print.dossier' => 'shared.print.v1',
);
foreach ( $flow_profiles as $surface => $profile_id ) {
    $visual->activate(
        array(
            'surface' => $surface,
            'package_id' => 'gpp.portable.shared.v1',
            'package_version' => '1.0.0',
            'profile_id' => $profile_id,
        )
    );
}
$bindings->import( $binding_artifact );
$bindings->activate(
    array(
        'context' => $binding_artifact['context'],
        'binding_set_id' => $binding_artifact['binding_set_id'],
        'binding_set_version' => $binding_artifact['binding_set_version'],
    )
);

$canonical_ref = DeclarativePresentationResolver::encodeReference(
    'srwf.registration.presentation',
    '1.1.0',
    'srwf.registration.v1'
);
$enabled_form = array(
    'id' => 3501,
    'cssClass' => 'host-enabled-class',
    'gravity-presentation-profiles' => array(
        'enabled' => '1',
        'declarative_profile' => $canonical_ref,
        'profile' => 'srwf-registration',
    ),
);
$disabled_form = array(
    'id' => 3502,
    'cssClass' => 'host-disabled-class ' . GtbCoexistenceGuard::OPT_IN_CLASS,
    'gravity-presentation-profiles' => array(
        'enabled' => '0',
        'declarative_profile' => $canonical_ref,
        'profile' => 'srwf-registration',
    ),
);
$disabled_original = $disabled_form;
$flow_before = array(
    'inbox' => $visual->resolve( 'gravity_flow.inbox' ),
    'entry_detail' => $visual->resolve( 'gravity_flow.entry_detail' ),
    'print' => $visual->resolve( 'print.dossier' ),
    'bindings' => $bindings->snapshot(),
);

$enabled_state = $addon->resolve_form_state( $enabled_form );
gpp_assert_true( $enabled_state->isActive(), 'GPP enabled plus valid declarative profile must preserve current presentation behavior.' );

$GLOBALS['gpp_pr35_enqueued_styles'] = array();
$GLOBALS['gpp_pr35_inline_styles'] = array();
$addon->enqueue_form_assets( $enabled_form, false );
gpp_assert_same( 2, count( $GLOBALS['gpp_pr35_enqueued_styles'] ), 'Enabled declarative form must enqueue Base + declarative presentation CSS.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_pr35_inline_styles'] ), 'Enabled declarative form must receive its validated inline presentation tokens.' );
$enabled_render = $addon->add_form_state_css_classes( $enabled_form );
gpp_assert_true( in_array( 'gpp-enabled', preg_split( '/\s+/', $enabled_render['cssClass'] ), true ), 'Enabled form must receive GPP presentation identity.' );

RuntimeDiagnostics::resetSurface( DeclarativePresentationResolver::SURFACE );
$GLOBALS['gpp_pr35_enqueued_styles'] = array();
$GLOBALS['gpp_pr35_inline_styles'] = array();
$disabled_state = $addon->resolve_form_state( $disabled_form );
gpp_assert_same( false, $disabled_state->isActive(), 'GPP OFF must make an otherwise valid declarative form inactive.' );
gpp_assert_same( 'disabled', $disabled_state->reason(), 'GPP OFF must preserve the existing disabled runtime reason.' );
$addon->enqueue_form_assets( $disabled_form, true );
gpp_assert_same( array(), $GLOBALS['gpp_pr35_enqueued_styles'], 'GPP OFF must enqueue zero GPP form-presentation styles for the disabled form path.' );
gpp_assert_same( array(), $GLOBALS['gpp_pr35_inline_styles'], 'GPP OFF must emit zero profile-derived inline CSS/tokens for the disabled form path.' );
$disabled_render = $addon->add_form_state_css_classes( $disabled_form );
gpp_assert_same( $disabled_original, $disabled_render, 'GPP OFF must leave the complete Gravity Forms form object and CSS classes untouched.' );
gpp_assert_same( $canonical_ref, $disabled_render['gravity-presentation-profiles']['declarative_profile'], 'GPP OFF must preserve the selected declarative profile.' );
gpp_assert_same( 'srwf-registration', $disabled_render['gravity-presentation-profiles']['profile'], 'GPP OFF must preserve the selected legacy profile.' );
gpp_assert_true( in_array( GtbCoexistenceGuard::OPT_IN_CLASS, preg_split( '/\s+/', $disabled_render['cssClass'] ), true ), 'GPP OFF must preserve the GTB opt-in class exactly.' );
gpp_assert_true( false === strpos( $disabled_render['cssClass'], 'gpp-' ), 'GPP OFF must add no GPP presentation identity, legacy, declarative, or capability class.' );

$disabled_trace = RuntimeDiagnostics::snapshot( DeclarativePresentationResolver::SURFACE );
gpp_assert_same( 'NOT_APPLICABLE', $disabled_trace['status'], 'Disabled form diagnostics must remain NOT_APPLICABLE rather than a failure.' );
foreach ( $disabled_trace['events'] as $event ) {
    gpp_assert_same( RuntimeDecisionTrace::RESULT_NOT_APPLICABLE, $event['result'], 'Every disabled-path presentation decision must remain NOT_APPLICABLE.' );
    gpp_assert_same( 'settings_disabled', $event['reason_code'], 'Disabled form diagnostics must keep the existing settings_disabled reason.' );
    gpp_assert_same( 'native_gravity_forms_form', $event['fallback'], 'Disabled form diagnostics must keep native Gravity Forms authoritative.' );
}

$reenabled_form = $disabled_form;
$reenabled_form['gravity-presentation-profiles']['enabled'] = '1';
$reenabled_state = $addon->resolve_form_state( $reenabled_form );
gpp_assert_true( $reenabled_state->isActive(), 'Turning the same canonical switch back ON must reactivate the prior valid selection.' );
gpp_assert_same( $canonical_ref, $reenabled_form['gravity-presentation-profiles']['declarative_profile'], 'Re-enable must not require destructive profile reset or repair.' );
gpp_assert_same( 'srwf-registration', $reenabled_form['gravity-presentation-profiles']['profile'], 'Re-enable must preserve legacy configuration too.' );
$reenabled_render = $addon->add_form_state_css_classes( $reenabled_form );
gpp_assert_true( in_array( 'gpp-enabled', preg_split( '/\s+/', $reenabled_render['cssClass'] ), true ), 'Re-enabled form must regain GPP presentation identity.' );
gpp_assert_true( in_array( GtbCoexistenceGuard::OPT_IN_CLASS, preg_split( '/\s+/', $reenabled_render['cssClass'] ), true ), 'Re-enable must never remove the external GTB class.' );

$GLOBALS['gpp_pr35_enqueued_styles'] = array();
$GLOBALS['gpp_pr35_inline_styles'] = array();
$mixed_enabled = $addon->add_form_state_css_classes( $enabled_form );
$mixed_disabled = $addon->add_form_state_css_classes( $disabled_form );
$addon->enqueue_form_assets( $enabled_form, false );
$addon->enqueue_form_assets( $disabled_form, false );
gpp_assert_true( false !== strpos( $mixed_enabled['cssClass'], 'gpp-enabled' ), 'Mixed request enabled Form A must receive GPP presentation.' );
gpp_assert_same( $disabled_original, $mixed_disabled, 'Mixed request disabled Form B must remain untouched.' );
gpp_assert_same( 2, count( $GLOBALS['gpp_pr35_enqueued_styles'] ), 'Disabled Form B must not add presentation styles on a mixed request.' );
gpp_assert_same( 1, count( $GLOBALS['gpp_pr35_inline_styles'] ), 'Disabled Form B must not add profile tokens on a mixed request.' );
gpp_assert_true( false !== strpos( $GLOBALS['gpp_pr35_inline_styles'][0]['css'], '.gpp-enabled_wrapper.gpp-declarative_wrapper.' ), 'Shared-page inline tokens must remain scoped behind GPP enabled presentation identity.' );

$flow_after = array(
    'inbox' => $visual->resolve( 'gravity_flow.inbox' ),
    'entry_detail' => $visual->resolve( 'gravity_flow.entry_detail' ),
    'print' => $visual->resolve( 'print.dossier' ),
    'bindings' => $bindings->snapshot(),
);
gpp_assert_same( $flow_before, $flow_after, 'Toggling one gravity_forms.form presentation must not mutate Inbox, Entry Detail, Print, or EnvironmentBindingSet lifecycle state.' );

gpp_assert_same( $disabled_original, $disabled_form, 'All runtime checks must leave the disabled form configuration itself unchanged.' );

echo "FORM_PRESENTATION_OWNERSHIP_RUNTIME_PASS\n";
