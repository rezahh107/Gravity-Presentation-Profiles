<?php

namespace GravityPresentationProfiles\SRWF\GravityFlow;

/** Stable lifecycle-backed visual identities for SRWF Entry Detail. */
final class EntryDetailVisualVariant {
    const SURFACE = 'gravity_flow.entry_detail';

    const CURRENT_SAFE = 'current_safe';
    const FULL_WIDTH = 'full_width';

    const CURRENT_SAFE_PROFILE_ID = 'srwf.operations.entry-detail.v1';

    const FULL_WIDTH_PACKAGE_ID = 'srwf.operations.entry-detail.full-width';
    const FULL_WIDTH_PACKAGE_VERSION = '1.0.0';
    const FULL_WIDTH_PROFILE_ID = 'srwf.operations.entry-detail.full-width.v1';

    const FULL_WIDTH_STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail-full-width';
    const FULL_WIDTH_STYLE_PATH = 'assets/css/srwf-gravity-flow-entry-detail-full-width.css';
    const FULL_WIDTH_WORKFLOW_PANEL_STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail-full-width-workflow-panel';
    const FULL_WIDTH_WORKFLOW_PANEL_STYLE_PATH = 'assets/css/srwf-gravity-flow-entry-detail-full-width-workflow-panel.css';
    const FULL_WIDTH_TIMELINE_STYLE_HANDLE = 'gpp-srwf-gravity-flow-entry-detail-full-width-timeline';
    const FULL_WIDTH_TIMELINE_STYLE_PATH = 'assets/css/srwf-gravity-flow-entry-detail-full-width-timeline.css';

    public static function labels() {
        return array(
            self::CURRENT_SAFE => ( function_exists( '__' ) ? __( 'Current / Safe — stable design', 'gravity-presentation-profiles' ) : 'Current / Safe — طرح فعلی و پایدار' ),
            self::FULL_WIDTH => ( function_exists( '__' ) ? __( 'Full Width — expanded design', 'gravity-presentation-profiles' ) : 'Full Width — طرح جدید تمام‌عرض' ),
        );
    }

    public static function label( $variant ) {
        $labels = self::labels();
        return isset( $labels[ $variant ] ) ? $labels[ $variant ] : null;
    }
}
