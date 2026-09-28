<?php

require_once __DIR__ . '/../helpers.php';

$repo_root = dirname( __DIR__, 2 );
$shared_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox.css' );
$native_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox-native.css' );

gpp_assert_true( false !== $shared_css, 'Shared Inbox CSS could not be read.' );
gpp_assert_true( false !== $native_css, 'Native Inbox CSS could not be read.' );

/**
 * Return declaration bodies for rules that directly target the admitted
 * Full Width Inbox modifier. This deliberately scopes the regression guard to
 * the ownership boundary instead of banning harmless viewport units elsewhere.
 */
function gpp_inbox_full_width_rule_bodies( $css ) {
    $matches = array();
    preg_match_all(
        '/([^{}]*\.gpp-inbox-surface--full-width[^{}]*)\{([^{}]*)\}/m',
        $css,
        $matches,
        PREG_SET_ORDER
    );

    return array_map(
        function ( $match ) {
            return trim( $match[2] );
        },
        $matches
    );
}

/**
 * Return declaration bodies for the GPP-owned inner shell. The Native-First
 * contract allows responsive gutters here, but no fixed historical content
 * width. A future calibrated width may arrive through a runtime-owned variable;
 * a literal fixed max width must not silently become the contract again.
 */
function gpp_inbox_inner_rule_bodies( $css ) {
    $matches = array();
    preg_match_all(
        '/([^{}]*\.gpp-inbox-surface__inner[^{}]*)\{([^{}]*)\}/m',
        $css,
        $matches,
        PREG_SET_ORDER
    );

    return array_map(
        function ( $match ) {
            return trim( $match[2] );
        },
        $matches
    );
}

/**
 * Return production rules whose selector list begins at the authentic native
 * Inbox root. GPP shell rules that merely supply the host width are excluded:
 * this guard is specifically for the host-owned Search/Grid/Pager topology.
 */
function gpp_inbox_native_host_rules( $css ) {
    $matches = array();
    preg_match_all(
        '/([^{}]*\.gflow-inbox\.gflow-grid\.gflow-common[^{}]*)\{([^{}]*)\}/m',
        $css,
        $matches,
        PREG_SET_ORDER
    );

    $rules = array();
    foreach ( $matches as $match ) {
        $selector = trim( $match[1] );
        if ( 0 !== strpos( $selector, '.gflow-inbox.gflow-grid.gflow-common' ) ) {
            continue;
        }
        $rules[] = array(
            'selector' => $selector,
            'body'     => trim( $match[2] ),
        );
    }

    return $rules;
}

/**
 * Paint-first Phase B deliberately rejects geometry/topology ownership on the
 * authentic host subtree. Keep this list property-based so harmless paint can
 * evolve without weakening the boundary.
 */
function gpp_inbox_is_forbidden_native_geometry_property( $property ) {
    $property = strtolower( trim( $property ) );

    if ( in_array(
        $property,
        array(
            'display',
            'position',
            'transform',
            'float',
            'clear',
            'direction',
            'unicode-bidi',
            'order',
            'line-height',
            'font-size',
        ),
        true
    ) ) {
        return true;
    }

    return 1 === preg_match(
        '/^(?:overflow(?:-[xy])?|(?:min-|max-)?(?:width|height|inline-size|block-size)|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|(?:row-|column-)?gap|(?:top|right|bottom|left)|inset(?:-[a-z-]+)?|grid(?:-[a-z-]+)?|flex(?:-[a-z-]+)?|place(?:-[a-z-]+)?|align(?:-[a-z-]+)?|justify(?:-[a-z-]+)?)$/',
        $property
    );
}

$shared_rules = gpp_inbox_full_width_rule_bodies( $shared_css );
$native_rules = gpp_inbox_full_width_rule_bodies( $native_css );
$rules = array_merge( $shared_rules, $native_rules );
$inner_rules = gpp_inbox_inner_rule_bodies( $shared_css );

gpp_assert_true( ! empty( $shared_rules ), 'Admitted Full Width Inbox ownership rule is missing.' );
gpp_assert_true(
    false !== strpos( $shared_rules[0], 'inline-size: 100%;' ),
    'Full Width Inbox must consume the width supplied by its host.'
);
gpp_assert_true(
    false !== strpos( $shared_rules[0], 'max-inline-size: none;' ),
    'Full Width Inbox host-relative maximum sizing is missing.'
);
gpp_assert_true(
    false !== strpos( $shared_rules[0], 'margin-inline: 0;' ),
    'Full Width Inbox must not use margin breakout geometry.'
);

gpp_assert_true( ! empty( $inner_rules ), 'GPP Inbox inner shell rule is missing.' );
$host_width_rule_count = 0;
foreach ( $inner_rules as $rule ) {
    if ( false !== strpos( $rule, 'inline-size: 100%;' ) ) {
        ++$host_width_rule_count;
        gpp_assert_true(
            false !== strpos( $rule, 'padding-inline:' ),
            'Host-width Inbox inner shell lost its bounded responsive gutter.'
        );
    }

    $max_matches = array();
    preg_match_all( '/max-inline-size\s*:\s*([^;}]*)/i', $rule, $max_matches );
    foreach ( isset( $max_matches[1] ) ? $max_matches[1] : array() as $max_value ) {
        $max_value = trim( $max_value );
        gpp_assert_true(
            'none' === strtolower( $max_value ) || 0 === stripos( $max_value, 'var(' ),
            'Native-First Inbox inner shell reintroduced a fixed max-inline-size contract: ' . $max_value
        );
    }
}
gpp_assert_same( 1, $host_width_rule_count, 'Inbox inner shell must have exactly one host-width ownership rule.' );

gpp_assert_true(
    false === stripos( $shared_css . "\n" . $native_css, '70rem' ),
    'Superseded 70rem Inbox content-width lock was reintroduced.'
);
gpp_assert_true(
    false === stripos( $shared_css . "\n" . $native_css, '1120px' ),
    'Superseded ~1120px Inbox content-width lock was reintroduced.'
);

foreach ( $rules as $rule ) {
    gpp_assert_true(
        0 === preg_match( '/\b\d*\.?\d+(?:d|s|l)?vw\b/i', $rule ),
        'Full Width Inbox reintroduced viewport-owned sizing.'
    );
    gpp_assert_true(
        0 === preg_match( '/(?:^|;)\s*margin(?:-[a-z-]+)?\s*:\s*-(?!0)/i', $rule ),
        'Full Width Inbox reintroduced a negative-margin viewport escape.'
    );
    gpp_assert_true(
        0 === preg_match( '/(?:^|;)\s*(?:left|right)\s*:\s*(?!auto\b)/i', $rule ),
        'Full Width Inbox reintroduced a physical offset breakout.'
    );
    gpp_assert_true(
        0 === preg_match( '/(?:^|;)\s*transform\s*:\s*(?!none\b)/i', $rule ),
        'Full Width Inbox reintroduced a transform-based breakout.'
    );
}

gpp_assert_true(
    false === strpos( $native_css, 'calc(50% - 50vw)' ),
    'Native Inbox CSS still contains the historical physical viewport offset.'
);

$native_host_rules = array_merge(
    gpp_inbox_native_host_rules( $shared_css ),
    gpp_inbox_native_host_rules( $native_css )
);
gpp_assert_true( ! empty( $native_host_rules ), 'Native-First Inbox paint rules are unavailable for geometry ownership validation.' );

foreach ( $native_host_rules as $rule ) {
    $declarations = array();
    preg_match_all( '/(?:^|;)\s*([a-z-]+)\s*:/i', $rule['body'], $declarations );
    foreach ( isset( $declarations[1] ) ? $declarations[1] : array() as $property ) {
        gpp_assert_true(
            ! gpp_inbox_is_forbidden_native_geometry_property( $property ),
            'Paint-first Inbox rule owns forbidden native geometry/topology property `' . strtolower( $property ) . '` in selector: ' . $rule['selector']
        );
    }
}

$combined_css = $shared_css . "\n" . $native_css;
gpp_assert_true(
    false === strpos( $combined_css, '.ag-rtl' ),
    'Native-First Inbox CSS must not force or target AG Grid RTL mode.'
);
gpp_assert_true(
    false === strpos( $combined_css, 'gpp_case_card' ),
    'Retired gpp_case_card identity was reintroduced in Inbox production CSS.'
);
gpp_assert_true(
    false === strpos( $combined_css, '.gpp-inbox-card' ),
    'Retired Card Mode presentation was reintroduced in Inbox production CSS.'
);

gpp_assert_same(
    1,
    preg_match(
        '/\.gflow-inbox\.gflow-grid\.gflow-common \[data-js="gflow-inbox-search"\]:focus-visible\s*\{[^}]*outline\s*:\s*3px solid var\(--gpp-inbox-focus\)\s*!important;[^}]*outline-offset\s*:\s*3px;/s',
        $shared_css
    ),
    'Native Search lost the Entry-Detail-family visible focus treatment.'
);
gpp_assert_same(
    1,
    preg_match(
        '/\.gflow-inbox\.gflow-grid\.gflow-common \.gflow-grid__button:focus-visible\s*\{[^}]*outline\s*:\s*3px solid var\(--gpp-inbox-focus\)\s*!important;[^}]*outline-offset\s*:\s*3px;/s',
        $native_css
    ),
    'Native utility controls lost the Entry-Detail-family visible focus treatment.'
);
gpp_assert_true(
    false !== strpos( $shared_css, '.gflow-inbox.gflow-grid.gflow-common .ag-paging-button:focus-visible' ),
    'Native pager keyboard focus selector is missing.'
);

echo "INBOX_HOST_WIDTH_OWNERSHIP_PASS\n";
