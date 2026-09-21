<?php

namespace GravityPresentationProfiles;

use GravityPresentationProfiles\GravityForms\BindingRowAdminController;
use GravityPresentationProfiles\GravityForms\EntryDetailMappingAdminController;
use GravityPresentationProfiles\GravityForms\EntryDetailSetupAdminController;
use GravityPresentationProfiles\GravityForms\EntryDetailVisualVariantSettingsController;
use GravityPresentationProfiles\GravityForms\FormPresentationOwnershipSettings;
use GravityPresentationProfiles\GravityForms\PluginSettingsAtomicityController;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailFullWidthPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\EntryDetailTimelineSemanticPresentation;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxManualRefreshControl;
use GravityPresentationProfiles\SRWF\GravityFlow\InboxPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityFlow\PrintDossierPresentationAdapter;
use GravityPresentationProfiles\SRWF\GravityForms\GtbCoexistenceGuard;

final class Bootstrap {
    private static $initialized = false;

    public static function init() {
        if ( self::$initialized ) {
            return;
        }

        self::$initialized = true;

        if ( function_exists( 'add_action' ) ) {
            add_action( 'gform_loaded', array( __CLASS__, 'loadGravityFormsIntegration' ), 5 );
        }
    }

    public static function loadGravityFormsIntegration() {
        if ( ! class_exists( 'GFForms' ) || ! method_exists( 'GFForms', 'include_addon_framework' ) ) {
            return false;
        }

        \GFForms::include_addon_framework();

        if ( ! class_exists( 'GFAddOn' ) ) {
            return false;
        }

        $addon_class = 'GravityPresentationProfiles\\GravityForms\\AddOn';

        if ( ! class_exists( $addon_class ) ) {
            return false;
        }

        \GFAddOn::register( $addon_class );
        FormPresentationOwnershipSettings::register();
        GtbCoexistenceGuard::register();
        BindingRowAdminController::register();
        EntryDetailMappingAdminController::register();
        EntryDetailSetupAdminController::register();
        EntryDetailVisualVariantSettingsController::register();
        PluginSettingsAtomicityController::register();

        // Preserve the repository's single deferred bootstrap path. Gravity Flow
        // depends on Gravity Forms, so native-surface presentation adapters are
        // registered only after Gravity Forms has loaded successfully.
        InboxManualRefreshControl::register();
        InboxPresentationAdapter::register();
        EntryDetailPresentationAdapter::register();
        EntryDetailFullWidthPresentationAdapter::register();
        EntryDetailTimelineSemanticPresentation::register();
        PrintDossierPresentationAdapter::register();

        return true;
    }
}
