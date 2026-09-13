<?php

require dirname( __DIR__ ) . '/helpers.php';

$root     = dirname( __DIR__, 2 );
$css_path = $root . '/profiles/srwf/registration/profile.css';
$map_path = $root . '/profiles/srwf/registration/IMPLEMENTATION_MAP.md';
$scope    = '.gpp-enabled_wrapper.gpp-profile-srwf-registration_wrapper';

$css = file_get_contents( $css_path );
gpp_assert_true( false !== $css, 'SRWF Registration profile CSS must be readable.' );

$css_without_comments = preg_replace( '#/\*.*?\*/#s', '', $css );
gpp_assert_true( is_string( $css_without_comments ), 'Profile CSS comments must be removable for static inspection.' );

preg_match_all( '/([^{}]+)\{([^{}]*)\}/', $css_without_comments, $rules, PREG_SET_ORDER );
gpp_assert_true( ! empty( $rules ), 'Profile CSS must contain production rules.' );

foreach ( $rules as $rule ) {
    $selector_list = trim( $rule[1] );
    gpp_assert_true( 0 !== strpos( $selector_list, '@' ), 'Production at-rules are not expected in the SRWF profile baseline.' );

    foreach ( explode( ',', $selector_list ) as $selector ) {
        $selector = trim( $selector );
        gpp_assert_true(
            0 === strpos( $selector, $scope ),
            'Every SRWF Registration selector must start from the selected-profile wrapper scope: ' . $selector
        );
    }
}

gpp_assert_true(
    ! preg_match( '/@media[^{}]*(?:min|max)-width\s*:/i', $css_without_comments ),
    'SRWF profile must not author a width-based production breakpoint.'
);
gpp_assert_true(
    ! preg_match( '/(?:^|[;\s{])(?:box-shadow|--[\w-]*shadow[\w-]*)\s*:/im', $css_without_comments ),
    'SRWF profile must not author a shadow value.'
);
gpp_assert_true(
    ! preg_match( '/(?:^|[;\s{])(?:outline|outline-[\w-]+|--[\w-]*outline[\w-]*)\s*:/im', $css_without_comments ),
    'SRWF profile must not author focus-ring outline geometry or alpha.'
);
gpp_assert_true(
    ! preg_match( '/outline\s*:\s*none\b/i', $css_without_comments ),
    'SRWF profile must not reset native/host focus outlines.'
);
gpp_assert_true(
    ! preg_match( '/\b(?:body|html)\b|#gform_wrapper_|#page[-_\d]|:has\s*\(/i', $css_without_comments ),
    'SRWF profile must not use broad page/body, Form-ID, Page-ID, or :has() targeting.'
);
gpp_assert_true(
    false === stripos( $css_without_comments, '#8993A4' ),
    'Historical control-border candidate must not enter production CSS.'
);
gpp_assert_true(
    ! preg_match( '/padding(?:-[a-z-]+)?\s*:[^;{}]*\b18px\b/i', $css_without_comments ),
    'Historical mobile padding must not enter production CSS.'
);
gpp_assert_true(
    ! preg_match( '/\b(?:13\.5|14|24|26|32)px\b/i', $css_without_comments ),
    'Reference-only typography/rhythm values must not be promoted to production CSS.'
);
gpp_assert_true(
    ! preg_match( '/line-height\s*:\s*1\.5\b/i', $css_without_comments ),
    'Reference-only form-title line-height must not be promoted to production CSS.'
);
gpp_assert_true(
    ! preg_match( '/(?:^|[;\s{])(?:height|min-height|block-size|min-block-size)\s*:\s*(?:52|56)px\b/im', $css_without_comments ),
    'Canonical control/button sizes must be projected through Gravity Forms CSS API tokens, not hard-coded height properties.'
);

foreach ( array(
    '--gf-form-validation-bg-color:',
    '--gf-form-validation-border-color:',
    '--gf-form-validation-heading-icon-bg-color:',
) as $forbidden_derived_override ) {
    gpp_assert_true(
        false === strpos( $css_without_comments, $forbidden_derived_override ),
        'RGB companion synchronization must not be replaced by a direct validation-summary derived color override: ' . $forbidden_derived_override
    );
}
gpp_assert_true(
    ! preg_match( '/\.gform_validation_errors\b[^{}]*\{[^{}]*(?:background(?:-color)?|border(?:-color)?|color)\s*:/is', $css_without_comments ),
    'RGB companion synchronization must not be replaced by direct validation-summary color styling.'
);

$required_mappings = array(
    '--gf-color-primary: #1D4ED8;',
    '--gf-color-primary-rgb: 29, 78, 216;',
    '--gf-color-danger: #B42318;',
    '--gf-color-danger-rgb: 180, 35, 24;',
    '--gf-color-success: #18794E;',
    '--gf-color-success-rgb: 24, 121, 78;',
    '--gf-ctrl-bg-color: #FFFFFF;',
    '--gf-ctrl-color: #172033;',
    '--gf-ctrl-border-color: #8690A1;',
    '--gf-ctrl-border-color-focus: #1D4ED8;',
    '--gf-ctrl-border-color-error: #B42318;',
    '--gf-ctrl-radius: 10px;',
    '--gf-ctrl-size: 52px;',
    '--gf-ctrl-font-size: 16px;',
    '--gf-ctrl-font-weight: 400;',
    '--gf-ctrl-label-font-size-primary: 15px;',
    '--gf-ctrl-label-font-weight-primary: 600;',
    '--gf-ctrl-desc-color: #667085;',
    '--gf-field-section-border-color: #E4E7EC;',
    '--gf-ctrl-btn-bg-color-primary: #1D4ED8;',
    '--gf-ctrl-btn-size: 56px;',
    '--gf-ctrl-btn-font-size: 16px;',
    '--gf-ctrl-btn-font-weight: 700;',
    '--gf-ctrl-btn-border-color-focus-primary: #1D4ED8;',
    '--gf-form-validation-color: #B42318;',
    'max-inline-size: 840px;',
    'padding-inline: 16px;',
    'border-radius: 16px;',
    'font-size: 18px;',
    'font-weight: 700;',
    'background-color: #1E40AF;',
    'direction: rtl;',
);

foreach ( $required_mappings as $mapping ) {
    gpp_assert_true(
        false !== strpos( $css_without_comments, $mapping ),
        'Missing required exact-contract mapping: ' . $mapping
    );
}

gpp_assert_true(
    preg_match( '/\.gform_fields\s*>\s*\.gfield\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1\s*;/s', $css_without_comments ),
    'SRWF Registration must fail closed to a single-column field grid.'
);
gpp_assert_true(
    false !== strpos( $css_without_comments, '.gfield--type-section .gsection_title' ),
    'Section-heading direct selector must remain present and profile-scoped.'
);
gpp_assert_true(
    false !== strpos( $css_without_comments, '.gform_button:active' ),
    'Canonical pressed color must target an authentic submit active state.'
);

foreach ( array(
    '.gfield--type-text input[type="text"]',
    '.gfield--type-select select',
    '.gfield--type-pgr_jalali_date input.pgr_jalali_date',
) as $runtime_control_selector ) {
    gpp_assert_true(
        false !== strpos( $css_without_comments, $runtime_control_selector ),
        'Runtime-proven Orbital control selector must remain profile-scoped: ' . $runtime_control_selector
    );
}
gpp_assert_true(
    substr_count( $css_without_comments, '--gf-ctrl-size: 52px' ) >= 2,
    'Canonical 52px control token must be preserved at the wrapper and projected to the authentic local control scope.'
);
gpp_assert_true(
    preg_match( '/\.gpp-enabled_wrapper\.gpp-profile-srwf-registration_wrapper\.gform-theme--framework\s*\{[^}]*--gf-ctrl-size\s*:\s*52px\s*!important\s*;[^}]*--gf-ctrl-btn-size\s*:\s*56px\s*!important\s*;/s', $css_without_comments ),
    'Authentic Orbital wrapper cascade must retain the canonical sizing values without introducing a second authority.'
);
gpp_assert_true(
    false !== strpos( $css_without_comments, ':focus-visible' )
    && preg_match( '/:focus-visible\s*\{[^}]*border-color\s*:\s*#1D4ED8\s*!important\s*;/s', $css_without_comments ),
    'Runtime-proven focus fallback must change only the canonical border color with the bounded cascade priority required by authentic Orbital.'
);
gpp_assert_true(
    preg_match( '/\.gfield--type-pgr_jalali_date\.gfield_error\s*\{[^}]*display\s*:\s*flex\s*;[^}]*flex-direction\s*:\s*column\s*;/s', $css_without_comments ),
    'Authentic invalid PersianGravity field must use the bounded CSS-only vertical layout adapter.'
);
gpp_assert_true(
    preg_match( '/\.gfield--type-pgr_jalali_date\.gfield_error\s*>\s*\.gfield_validation_message\s*\{[^}]*order\s*:\s*1\s*;/s', $css_without_comments ),
    'Authentic PersianGravity validation node must be visually placed below the input without DOM mutation.'
);

$generic_paths = array(
    $root . '/assets/css/base.css',
);
$generic_paths = array_merge( $generic_paths, glob( $root . '/src/Core/*.php' ) ?: array() );
$forbidden_generic_fragments = array(
    'gpp-profile-srwf-registration',
    'Vazirmatn',
    '#F6F8FB',
    '#172033',
    '#475467',
    '#667085',
    '#1D4ED8',
    '#1E40AF',
    '#B42318',
    '#18794E',
    '#E4E7EC',
    '#8690A1',
);

foreach ( $generic_paths as $generic_path ) {
    $generic_source = file_get_contents( $generic_path );
    gpp_assert_true( false !== $generic_source, 'Generic source must be readable: ' . $generic_path );

    foreach ( $forbidden_generic_fragments as $fragment ) {
        gpp_assert_true(
            false === stripos( $generic_source, $fragment ),
            'SRWF visual rule/token leaked into generic core/Base: ' . $fragment . ' in ' . $generic_path
        );
    }
}

foreach ( array(
    $root . '/profiles/srwf/registration',
    $root . '/src/Profiles/Srwf/Registration',
) as $production_dir ) {
    $iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $production_dir ) );

    foreach ( $iterator as $item ) {
        if ( $item->isFile() && 'js' === strtolower( $item->getExtension() ) ) {
            gpp_fail( 'SRWF profile must not introduce production JavaScript: ' . $item->getPathname() );
        }
    }
}

$implementation_map = file_get_contents( $map_path );
gpp_assert_true( false !== $implementation_map, 'SRWF implementation map must be readable.' );
foreach ( array(
    'Page background `#F6F8FB`: not authored',
    'Upload radius `12px`: deferred',
    'Desktop short-field pairing and exact production breakpoint: not authored',
    'Shadow: no SRWF `box-shadow` declaration is authored',
    'Focus ring geometry remains deferred',
    'GP Advanced Select and GP File Upload Pro adapters remain deferred',
    'PersianGravity validation-layout adapter: runtime-proven',
) as $required_gap ) {
    gpp_assert_true(
        false !== strpos( $implementation_map, $required_gap ),
        'Implementation map must retain the correct deferred/runtime-proven boundary: ' . $required_gap
    );
}

echo "SRWF_REGISTRATION_PROFILE_TESTS_PASS\n";
