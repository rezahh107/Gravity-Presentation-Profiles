<?php

require_once dirname( __DIR__ ) . '/helpers.php';
require_once dirname( __DIR__, 2 ) . '/src/Autoloader.php';

use GravityPresentationProfiles\Autoloader;
use GravityPresentationProfiles\GravityForms\FormPresentationOwnershipSettings;
use GravityPresentationProfiles\SRWF\GravityForms\GtbCoexistenceGuard;

Autoloader::register();

$GLOBALS['gpp_pr35_filters'] = array();

function add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 ) {
    $GLOBALS['gpp_pr35_filters'][] = array( $hook, $callback, $priority, $accepted_args );
}

function esc_html__( $text, $domain = null ) {
    unset( $domain );
    return $text;
}

function gpp_pr35_base_sections() {
    return array(
        array(
            'title' => 'Gravity Presentation Profiles',
            'fields' => array(
                array(
                    'label' => 'Enable',
                    'type' => 'checkbox',
                    'name' => 'enabled',
                    'choices' => array(
                        array( 'label' => 'Enable Gravity Presentation Profiles for this form', 'name' => 'enabled' ),
                    ),
                ),
                array(
                    'label' => 'Installed declarative profile',
                    'description' => 'Existing declarative lifecycle explanation.',
                    'type' => 'select',
                    'name' => 'declarative_profile',
                    'choices' => array( array( 'label' => 'Selected', 'value' => 'package|1.0.0|profile' ) ),
                ),
                array(
                    'label' => 'Legacy profile',
                    'type' => 'select',
                    'name' => 'profile',
                    'choices' => array( array( 'label' => 'SRWF', 'value' => 'srwf-registration' ) ),
                ),
            ),
        ),
    );
}

function gpp_pr35_apply_filters( $sections, $form ) {
    $filters = $GLOBALS['gpp_pr35_filters'];
    usort(
        $filters,
        static function ( $left, $right ) {
            return $left[2] <=> $right[2];
        }
    );

    foreach ( $filters as $filter ) {
        if ( FormPresentationOwnershipSettings::SETTINGS_HOOK === $filter[0] ) {
            $sections = call_user_func( $filter[1], $sections, $form );
        }
    }

    return $sections;
}

FormPresentationOwnershipSettings::register();
GtbCoexistenceGuard::register();

gpp_assert_same( 2, count( $GLOBALS['gpp_pr35_filters'] ), 'Ownership UX and bounded GTB coexistence warning must use exactly two settings filters.' );
gpp_assert_same( FormPresentationOwnershipSettings::SETTINGS_HOOK, $GLOBALS['gpp_pr35_filters'][0][0], 'Ownership UX must use the add-on-specific Gravity Forms form-settings seam.' );
gpp_assert_same( 10, $GLOBALS['gpp_pr35_filters'][0][2], 'Canonical ownership wording must run before optional coexistence warnings.' );
gpp_assert_same( 2, $GLOBALS['gpp_pr35_filters'][0][3], 'Ownership settings filter must receive the current form configuration.' );
gpp_assert_same( GtbCoexistenceGuard::SETTINGS_HOOK, $GLOBALS['gpp_pr35_filters'][1][0], 'GTB warning must use the same admitted form-settings seam.' );
gpp_assert_same( 20, $GLOBALS['gpp_pr35_filters'][1][2], 'GTB warning must decorate the already clarified canonical setting.' );

$disabled_form = array(
    'id' => 35,
    'cssClass' => 'host-class srwf-registration-theme',
    'gravity-presentation-profiles' => array(
        'enabled' => '0',
        'declarative_profile' => 'package|1.0.0|profile',
        'profile' => 'srwf-registration',
    ),
);
$disabled_before = $disabled_form;
$disabled_sections = gpp_pr35_apply_filters( gpp_pr35_base_sections(), $disabled_form );
$disabled_fields = $disabled_sections[0]['fields'];

gpp_assert_same( 'enabled', $disabled_fields[0]['name'], 'The existing enabled key must remain the one canonical presentation switch.' );
gpp_assert_same( 'Form presentation', $disabled_fields[0]['label'], 'The canonical switch should have an owner-facing presentation label.' );
gpp_assert_same( 'Apply GPP presentation to this form', $disabled_fields[0]['choices'][0]['label'], 'The checkbox must state the presentation ownership action directly.' );
gpp_assert_true( false !== strpos( $disabled_fields[0]['description'], 'affects only GPP presentation of this Gravity Forms form' ), 'The switch description must bound OFF to this form presentation only.' );
gpp_assert_true( false !== strpos( $disabled_fields[0]['description'], 'Inbox, Entry Detail, Print, mappings, diagnostics, or other forms' ), 'The switch description must explicitly preserve other GPP capabilities.' );
gpp_assert_true( false === strpos( $disabled_fields[0]['description'], GtbCoexistenceGuard::OPT_IN_CLASS ), 'GTB overlap must not warn when GPP presentation is disabled.' );
gpp_assert_same( 'package|1.0.0|profile', $disabled_fields[1]['choices'][0]['value'], 'Declarative profile choices must not be rewritten while OFF.' );
gpp_assert_same( 'srwf-registration', $disabled_fields[2]['choices'][0]['value'], 'Legacy profile choices must not be rewritten while OFF.' );
gpp_assert_true( false !== strpos( $disabled_fields[1]['description'], 'selection is preserved while GPP presentation is off' ), 'Declarative selector must explain preserved inactive configuration.' );
gpp_assert_true( false !== strpos( $disabled_fields[2]['description'], 'selection is preserved while GPP presentation is off' ), 'Legacy selector must explain preserved inactive configuration.' );
gpp_assert_same( $disabled_before, $disabled_form, 'Settings decoration must never mutate the Gravity Forms form object.' );

$enabled_gtb = $disabled_form;
$enabled_gtb['gravity-presentation-profiles']['enabled'] = '1';
$enabled_sections = gpp_pr35_apply_filters( gpp_pr35_base_sections(), $enabled_gtb );
$enabled_description = $enabled_sections[0]['fields'][0]['description'];
gpp_assert_true( false !== strpos( $enabled_description, 'Gravity Theme Builder / srwf-registration-theme' ), 'Exact GTB opt-in plus GPP enabled must produce a non-blocking overlap warning.' );
gpp_assert_same( '1', $enabled_gtb['gravity-presentation-profiles']['enabled'], 'Overlap warning must not auto-disable GPP.' );
gpp_assert_true( in_array( GtbCoexistenceGuard::OPT_IN_CLASS, preg_split( '/\s+/', $enabled_gtb['cssClass'] ), true ), 'Overlap warning must not remove the GTB opt-in class.' );

$enabled_twice = gpp_pr35_apply_filters( $enabled_sections, $enabled_gtb );
gpp_assert_same( 1, substr_count( $enabled_twice[0]['fields'][0]['description'], 'Gravity Theme Builder / srwf-registration-theme' ), 'Repeated settings filtering must not duplicate the overlap warning.' );
gpp_assert_same( 1, substr_count( $enabled_twice[0]['fields'][1]['description'], 'selection is preserved while GPP presentation is off' ), 'Repeated settings filtering must not duplicate inactive-selection guidance.' );

foreach ( array( 'srwf-registration-theme-extra', 'prefix-srwf-registration-theme', 'srwf-registration-theme2' ) as $lookalike ) {
    $lookalike_form = $enabled_gtb;
    $lookalike_form['cssClass'] = 'host-class ' . $lookalike;
    $lookalike_sections = gpp_pr35_apply_filters( gpp_pr35_base_sections(), $lookalike_form );
    gpp_assert_true( false === strpos( $lookalike_sections[0]['fields'][0]['description'], 'Gravity Theme Builder / srwf-registration-theme' ), 'GTB overlap detection must use an exact CSS class token, never a substring.' );
}

$native_form = $enabled_gtb;
$native_form['cssClass'] = 'host-class';
$native_sections = gpp_pr35_apply_filters( gpp_pr35_base_sections(), $native_form );
gpp_assert_true( false === strpos( $native_sections[0]['fields'][0]['description'], 'Gravity Theme Builder / srwf-registration-theme' ), 'GPP enabled alone must not infer GTB ownership.' );

echo "FORM_PRESENTATION_OWNERSHIP_SETTINGS_PASS\n";
