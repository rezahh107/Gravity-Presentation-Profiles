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

$shared_rules = gpp_inbox_full_width_rule_bodies( $shared_css );
$native_rules = gpp_inbox_full_width_rule_bodies( $native_css );
$rules = array_merge( $shared_rules, $native_rules );

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

echo "INBOX_HOST_WIDTH_OWNERSHIP_PASS\n";
