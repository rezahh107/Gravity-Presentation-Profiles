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

/** Normalize comments before selector/declaration classification. */
function gpp_inbox_normalize_css_comments( $css ) {
    $normalized = preg_replace( '/\/\*.*?\*\//s', ' ', $css );
    if ( ! is_string( $normalized ) ) {
        return array( 'css' => '', 'error' => 'CSS comment normalization failed.' );
    }
    if ( false !== strpos( $normalized, '/*' ) || false !== strpos( $normalized, '*/' ) ) {
        return array( 'css' => '', 'error' => 'Unterminated or unclassifiable CSS comment syntax.' );
    }

    return array( 'css' => $normalized, 'error' => null );
}

/** Split a selector list only at top-level commas. */
function gpp_inbox_split_selector_list( $selector_text ) {
    $members = array();
    $current = '';
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $length = strlen( $selector_text );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $selector_text[ $i ];
        if ( null !== $quote ) {
            $current .= $char;
            if ( $escaped ) {
                $escaped = false;
            } elseif ( '\\' === $char ) {
                $escaped = true;
            } elseif ( $quote === $char ) {
                $quote = null;
            }
            continue;
        }

        if ( '"' === $char || "'" === $char ) {
            $quote = $char;
            $current .= $char;
        } elseif ( '(' === $char ) {
            ++$paren;
            $current .= $char;
        } elseif ( ')' === $char ) {
            --$paren;
            $current .= $char;
        } elseif ( '[' === $char ) {
            ++$bracket;
            $current .= $char;
        } elseif ( ']' === $char ) {
            --$bracket;
            $current .= $char;
        } elseif ( ',' === $char && 0 === $paren && 0 === $bracket ) {
            $members[] = trim( $current );
            $current = '';
        } else {
            $current .= $char;
        }

        if ( $paren < 0 || $bracket < 0 ) {
            return array( 'members' => array(), 'error' => 'Unbalanced selector-list syntax.' );
        }
    }

    if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
        return array( 'members' => array(), 'error' => 'Unbalanced selector-list syntax.' );
    }

    $members[] = trim( $current );
    foreach ( $members as $member ) {
        if ( '' === $member ) {
            return array( 'members' => array(), 'error' => 'Empty selector-list member.' );
        }
    }

    return array( 'members' => $members, 'error' => null );
}

/** Parse the bounded declaration grammar used by the current Inbox CSS. */
function gpp_inbox_parse_native_declarations( $body ) {
    $pattern = '/(?:^|;)\s*((?:--[a-z0-9_-]+)|(?:[a-z-]+))\s*:\s*([^;{}]+)(?=;|$)/i';
    $matches = array();
    preg_match_all( $pattern, $body, $matches, PREG_SET_ORDER );

    $residue = preg_replace( $pattern, '', $body );
    if ( ! is_string( $residue ) || '' !== trim( $residue, " \t\r\n;" ) ) {
        return array( 'declarations' => array(), 'error' => 'Unclassifiable CSS declaration syntax.' );
    }

    $declarations = array();
    foreach ( $matches as $match ) {
        $declarations[] = array(
            'property' => strtolower( $match[1] ),
            'value'    => trim( $match[2] ),
        );
    }

    return array( 'declarations' => $declarations, 'error' => null );
}

/** Native host selectors begin at Gravity Flow's authoritative Inbox root. */
function gpp_inbox_is_native_root_selector( $selector ) {
    return 1 === preg_match(
        '/^\.gflow-inbox\.gflow-grid\.gflow-common(?=$|[\s>+~.#:\[\(])/',
        trim( $selector )
    );
}

/** The only ancestor-qualified native-root selector admitted is the GPP host shell. */
function gpp_inbox_is_admitted_host_shell_selector( $selector ) {
    return '.gpp-inbox-surface .gflow-inbox.gflow-grid.gflow-common' === trim( $selector );
}

/** Positive Phase-B property contract for the authentic native Inbox subtree. */
function gpp_inbox_is_admitted_native_paint_property( $property ) {
    $custom_properties = array(
        '--gpp-inbox-canvas',
        '--gpp-inbox-surface',
        '--gpp-inbox-group-surface',
        '--gpp-inbox-text',
        '--gpp-inbox-text-muted',
        '--gpp-inbox-border',
        '--gpp-inbox-control-border',
        '--gpp-inbox-accent',
        '--gpp-inbox-focus',
        '--gpp-inbox-row-hover',
        '--gpp-inbox-elevation',
    );
    if ( in_array( $property, $custom_properties, true ) ) {
        return true;
    }

    return in_array(
        $property,
        array(
            'background-color',
            'border-color',
            'border-radius',
            'box-shadow',
            'color',
            'font-family',
            'font-weight',
            'opacity',
            'outline',
            'outline-offset',
            'transition-property',
        ),
        true
    );
}

/** The GPP host shell exception is frozen to the existing width handoff only. */
function gpp_inbox_host_shell_declaration_errors( $declarations ) {
    $expected = array(
        'box-sizing'      => 'border-box',
        'inline-size'     => '100%',
        'max-inline-size' => 'none',
        'margin-inline'   => '0',
    );
    $actual = array();
    foreach ( $declarations as $declaration ) {
        if ( isset( $actual[ $declaration['property'] ] ) ) {
            return array( 'Duplicate GPP Inbox host-shell declaration `' . $declaration['property'] . '`.' );
        }
        $actual[ $declaration['property'] ] = strtolower( trim( $declaration['value'] ) );
    }

    ksort( $actual );
    ksort( $expected );
    if ( $actual !== $expected ) {
        return array( 'GPP Inbox host-shell declaration set/value changed outside the admitted width handoff.' );
    }

    return array();
}

/**
 * Enforce the positive paint/typography contract on every selector-list member
 * that targets the authentic native root/subtree. Unknown ancestor-qualified
 * native selectors and unclassifiable syntax fail closed.
 */
function gpp_inbox_native_paint_contract_errors( $css ) {
    $normalized = gpp_inbox_normalize_css_comments( $css );
    if ( null !== $normalized['error'] ) {
        return array( $normalized['error'] );
    }
    $css = $normalized['css'];

    $rules = array();
    preg_match_all( '/([^{}]+)\{([^{}]*)\}/m', $css, $rules, PREG_SET_ORDER );

    $errors = array();
    $classified_target_members = 0;
    foreach ( $rules as $rule ) {
        $selector_text = trim( $rule[1] );
        $selectors = gpp_inbox_split_selector_list( $selector_text );
        if ( null !== $selectors['error'] ) {
            if ( false !== strpos( $selector_text, '.gflow-inbox.gflow-grid.gflow-common' ) ) {
                $errors[] = $selectors['error'] . ' Selector: ' . $selector_text;
            }
            continue;
        }

        $target_members = array();
        foreach ( $selectors['members'] as $member ) {
            if ( false !== strpos( $member, '.gflow-inbox.gflow-grid.gflow-common' ) ) {
                $target_members[] = $member;
            }
        }
        if ( empty( $target_members ) ) {
            continue;
        }
        $classified_target_members += count( $target_members );

        $declarations = gpp_inbox_parse_native_declarations( $rule[2] );
        if ( null !== $declarations['error'] ) {
            $errors[] = $declarations['error'] . ' Selector: ' . implode( ', ', $target_members );
            continue;
        }

        foreach ( $target_members as $member ) {
            if ( gpp_inbox_is_admitted_host_shell_selector( $member ) ) {
                foreach ( gpp_inbox_host_shell_declaration_errors( $declarations['declarations'] ) as $error ) {
                    $errors[] = $error . ' Selector: ' . $member;
                }
                continue;
            }
            if ( ! gpp_inbox_is_native_root_selector( $member ) ) {
                $errors[] = 'Unadmitted ancestor-qualified selector targets the native Inbox subtree: ' . $member;
                continue;
            }

            foreach ( $declarations['declarations'] as $declaration ) {
                if ( ! gpp_inbox_is_admitted_native_paint_property( $declaration['property'] ) ) {
                    $errors[] = 'Unadmitted native Inbox property `' . $declaration['property'] . '` in selector: ' . $member;
                }
            }
        }
    }

    $candidate_matches = array();
    preg_match_all( '/\.gflow-inbox\.gflow-grid\.gflow-common/', $css, $candidate_matches );
    $candidate_count = count( $candidate_matches[0] );
    if ( 0 === $candidate_count ) {
        $errors[] = 'No native Inbox selector was found for paint-contract validation.';
    } elseif ( $candidate_count !== $classified_target_members ) {
        $errors[] = 'Native Inbox selector syntax could not be classified deterministically.';
    }

    return $errors;
}

/** Existing historical regression protections, reused by production and falsification checks. */
function gpp_inbox_historical_regression_errors( $shared_css, $native_css ) {
    $errors = array();
    $combined_css = $shared_css . "\n" . $native_css;

    if ( false !== stripos( $combined_css, '70rem' ) ) {
        $errors[] = 'Superseded 70rem Inbox content-width lock was reintroduced.';
    }
    if ( false !== stripos( $combined_css, '1120px' ) ) {
        $errors[] = 'Superseded ~1120px Inbox content-width lock was reintroduced.';
    }

    foreach ( array_merge( gpp_inbox_full_width_rule_bodies( $shared_css ), gpp_inbox_full_width_rule_bodies( $native_css ) ) as $rule ) {
        if ( 1 === preg_match( '/\b\d*\.?\d+(?:d|s|l)?vw\b/i', $rule ) ) {
            $errors[] = 'Full Width Inbox reintroduced viewport-owned sizing.';
        }
        if ( 1 === preg_match( '/(?:^|;)\s*margin(?:-[a-z-]+)?\s*:\s*-(?!0)/i', $rule ) ) {
            $errors[] = 'Full Width Inbox reintroduced a negative-margin viewport escape.';
        }
        if ( 1 === preg_match( '/(?:^|;)\s*(?:left|right)\s*:\s*(?!auto\b)/i', $rule ) ) {
            $errors[] = 'Full Width Inbox reintroduced a physical offset breakout.';
        }
        if ( 1 === preg_match( '/(?:^|;)\s*transform\s*:\s*(?!none\b)/i', $rule ) ) {
            $errors[] = 'Full Width Inbox reintroduced a transform-based breakout.';
        }
    }

    if ( false !== strpos( $native_css, 'calc(50% - 50vw)' ) ) {
        $errors[] = 'Native Inbox CSS still contains the historical physical viewport offset.';
    }
    if ( false !== strpos( $combined_css, '.ag-rtl' ) ) {
        $errors[] = 'Native-First Inbox CSS must not force or target AG Grid RTL mode.';
    }
    if ( false !== strpos( $combined_css, 'gpp_case_card' ) ) {
        $errors[] = 'Retired gpp_case_card identity was reintroduced in Inbox production CSS.';
    }
    if ( false !== strpos( $combined_css, '.gpp-inbox-card' ) ) {
        $errors[] = 'Retired Card Mode presentation was reintroduced in Inbox production CSS.';
    }
    if ( 1 !== preg_match(
        '/\.gflow-inbox\.gflow-grid\.gflow-common \[data-js="gflow-inbox-search"\]:focus-visible\s*\{[^}]*outline\s*:\s*3px solid var\(--gpp-inbox-focus\)\s*!important;[^}]*outline-offset\s*:\s*3px;/s',
        $shared_css
    ) ) {
        $errors[] = 'Native Search lost the Entry-Detail-family visible focus treatment.';
    }
    if ( 1 !== preg_match(
        '/\.gflow-inbox\.gflow-grid\.gflow-common \.gflow-grid__button:focus-visible\s*\{[^}]*outline\s*:\s*3px solid var\(--gpp-inbox-focus\)\s*!important;[^}]*outline-offset\s*:\s*3px;/s',
        $native_css
    ) ) {
        $errors[] = 'Native utility controls lost the Entry-Detail-family visible focus treatment.';
    }
    if ( false === strpos( $shared_css, '.gflow-inbox.gflow-grid.gflow-common .ag-paging-button:focus-visible' ) ) {
        $errors[] = 'Native pager keyboard focus selector is missing.';
    }

    return $errors;
}

function gpp_inbox_assert_rejected_with_property( $label, $css, $property ) {
    $errors = gpp_inbox_native_paint_contract_errors( $css );
    gpp_assert_true( ! empty( $errors ), $label . ' unexpectedly passed the native paint contract.' );
    gpp_assert_true(
        false !== strpos( implode( "\n", $errors ), '`' . $property . '`' ),
        $label . ' failed for the wrong reason: ' . implode( ' | ', $errors )
    );
    echo $label . "_PASS\n";
}

function gpp_inbox_assert_historical_rejection( $label, $shared_css, $native_css, $needle ) {
    $errors = gpp_inbox_historical_regression_errors( $shared_css, $native_css );
    gpp_assert_true( ! empty( $errors ), $label . ' unexpectedly passed historical regression protection.' );
    gpp_assert_true(
        false !== stripos( implode( "\n", $errors ), $needle ),
        $label . ' failed for the wrong reason: ' . implode( ' | ', $errors )
    );
    echo $label . "_PASS\n";
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

$paint_errors = array_merge(
    gpp_inbox_native_paint_contract_errors( $shared_css ),
    gpp_inbox_native_paint_contract_errors( $native_css )
);
gpp_assert_same( array(), $paint_errors, 'Current production Inbox CSS violates the positive native paint contract: ' . implode( ' | ', $paint_errors ) );

$historical_errors = gpp_inbox_historical_regression_errors( $shared_css, $native_css );
gpp_assert_same( array(), $historical_errors, 'Current production Inbox CSS violates an existing historical regression guard: ' . implode( ' | ', $historical_errors ) );

/* PRI-FND-001 deterministic falsification controls. */
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_DIRECT_WIDTH_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { width: 10px; }',
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_GROUPED_NONFIRST_WIDTH_REJECT',
    '.decoy-selector, .gflow-inbox.gflow-grid.gflow-common .ag-row { width: 10px; }',
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_COMMENT_BEFORE_WIDTH_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* still classify */ width: 10px; }',
    'width'
);
foreach ( array( 'box-sizing', 'border-width', 'scale' ) as $property ) {
    gpp_inbox_assert_rejected_with_property(
        'PRI_FND_001_UNENUMERATED_' . strtoupper( str_replace( '-', '_', $property ) ) . '_REJECT',
        '.gflow-inbox.gflow-grid.gflow-common .ag-row { ' . $property . ': 1; }',
        $property
    );
}
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_UNKNOWN_CUSTOM_PROPERTY_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common { --gpp-inbox-geometry: 10px; }',
    '--gpp-inbox-geometry'
);

$ancestor_errors = gpp_inbox_native_paint_contract_errors(
    '.unexpected-wrapper .gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; }'
);
gpp_assert_true(
    false !== strpos( implode( "\n", $ancestor_errors ), 'Unadmitted ancestor-qualified selector' ),
    'Unknown ancestor-qualified native Inbox selector unexpectedly escaped classification.'
);
echo "PRI_FND_001_ANCESTOR_NATIVE_SELECTOR_REJECT_PASS\n";

$admitted_fixture = <<<'CSS'
.decoy-selector,
.gflow-inbox.gflow-grid.gflow-common .ag-row {
    --gpp-inbox-surface: #fff;
    background-color: var(--gpp-inbox-surface);
    border-color: #e4e7ec;
    border-radius: 8px;
    box-shadow: none;
    color: #172033;
    font-family: inherit;
    font-weight: 600;
    opacity: 1;
    outline: 3px solid #1d4ed8;
    outline-offset: 3px;
    transition-property: color, border-color, background-color;
}
CSS;
gpp_assert_same(
    array(),
    gpp_inbox_native_paint_contract_errors( $admitted_fixture ),
    'Legitimate admitted native paint/typography/custom-property fixture was rejected.'
);
echo "PRI_FND_001_ADMITTED_PAINT_FIXTURE_PASS\n";

$syntax_errors = gpp_inbox_native_paint_contract_errors(
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* unterminated'
);
gpp_assert_true( ! empty( $syntax_errors ), 'Unclassifiable CSS syntax must fail closed.' );
echo "PRI_FND_001_UNCLASSIFIABLE_SYNTAX_REJECT_PASS\n";

gpp_inbox_assert_historical_rejection(
    'PRI_FND_001_FIXED_WIDTH_HISTORY_REJECT',
    $shared_css . "\n.gpp-inbox-surface__inner { max-inline-size: 70rem; }",
    $native_css,
    '70rem'
);
gpp_inbox_assert_historical_rejection(
    'PRI_FND_001_BREAKOUT_HISTORY_REJECT',
    $shared_css . "\n.gpp-inbox-surface--full-width { transform: translateX(1px); }",
    $native_css,
    'transform-based breakout'
);
gpp_inbox_assert_historical_rejection(
    'PRI_FND_001_CARD_MODE_HISTORY_REJECT',
    $shared_css . "\n.gpp-inbox-card { color: #172033; }",
    $native_css,
    'Card Mode'
);
gpp_inbox_assert_historical_rejection(
    'PRI_FND_001_AG_RTL_HISTORY_REJECT',
    $shared_css . "\n.ag-rtl { color: #172033; }",
    $native_css,
    'AG Grid RTL'
);

$focus_mutation_count = 0;
$focus_mutation = preg_replace(
    '/(\.gflow-inbox\.gflow-grid\.gflow-common \[data-js="gflow-inbox-search"\]:focus-visible\s*\{[^}]*outline\s*:\s*)3px/',
    '${1}2px',
    $shared_css,
    1,
    $focus_mutation_count
);
gpp_assert_same( 1, $focus_mutation_count, 'Focus falsification fixture could not mutate the native Search rule.' );
gpp_inbox_assert_historical_rejection(
    'PRI_FND_001_FOCUS_HISTORY_REJECT',
    $focus_mutation,
    $native_css,
    'Native Search lost'
);

echo "INBOX_HOST_WIDTH_OWNERSHIP_PASS\n";
