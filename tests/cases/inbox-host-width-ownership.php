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
 * Strip CSS comments while preserving strings and line structure. Unterminated
 * comments or strings fail closed instead of being silently ignored.
 */
function gpp_inbox_normalize_css_comments( $css ) {
    $normalized = '';
    $length = strlen( $css );
    $quote = null;
    $escaped = false;

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $css[ $i ];

        if ( null !== $quote ) {
            $normalized .= $char;
            if ( $escaped ) {
                $escaped = false;
                continue;
            }
            if ( '\\' === $char ) {
                $escaped = true;
                continue;
            }
            if ( $quote === $char ) {
                $quote = null;
            }
            continue;
        }

        if ( '"' === $char || "'" === $char ) {
            $quote = $char;
            $normalized .= $char;
            continue;
        }

        if ( '/' === $char && $i + 1 < $length && '*' === $css[ $i + 1 ] ) {
            $normalized .= '  ';
            ++$i;
            $closed = false;
            while ( ++$i < $length ) {
                if ( '*' === $css[ $i ] && $i + 1 < $length && '/' === $css[ $i + 1 ] ) {
                    $normalized .= '  ';
                    ++$i;
                    $closed = true;
                    break;
                }
                $normalized .= "\n" === $css[ $i ] ? "\n" : ' ';
            }
            if ( ! $closed ) {
                return array( 'css' => '', 'error' => 'Unterminated CSS comment.' );
            }
            continue;
        }

        $normalized .= $char;
    }

    if ( null !== $quote ) {
        return array( 'css' => '', 'error' => 'Unterminated CSS string.' );
    }

    return array( 'css' => $normalized, 'error' => null );
}

/**
 * Find the matching closing brace for a block. Quotes are respected so braces
 * inside strings cannot change block ownership.
 */
function gpp_inbox_find_css_block_end( $css, $open_index ) {
    $depth = 1;
    $quote = null;
    $escaped = false;
    $length = strlen( $css );

    for ( $i = $open_index + 1; $i < $length; ++$i ) {
        $char = $css[ $i ];
        if ( null !== $quote ) {
            if ( $escaped ) {
                $escaped = false;
                continue;
            }
            if ( '\\' === $char ) {
                $escaped = true;
                continue;
            }
            if ( $quote === $char ) {
                $quote = null;
            }
            continue;
        }
        if ( '"' === $char || "'" === $char ) {
            $quote = $char;
            continue;
        }
        if ( '{' === $char ) {
            ++$depth;
        } elseif ( '}' === $char && 0 === --$depth ) {
            return $i;
        }
    }

    return false;
}

/**
 * Collect ordinary style rules recursively through at-rule blocks. This is a
 * bounded static classifier, not a runtime CSS parser. Any unbalanced syntax
 * that prevents safe classification is returned as an error.
 */
function gpp_inbox_collect_css_rules( $css ) {
    $rules = array();
    $errors = array();
    $length = strlen( $css );
    $offset = 0;

    while ( $offset < $length ) {
        while ( $offset < $length && preg_match( '/\s/', $css[ $offset ] ) ) {
            ++$offset;
        }
        if ( $offset >= $length ) {
            break;
        }

        $start = $offset;
        $quote = null;
        $escaped = false;
        $paren = 0;
        $bracket = 0;
        $terminator = null;

        for ( ; $offset < $length; ++$offset ) {
            $char = $css[ $offset ];
            if ( null !== $quote ) {
                if ( $escaped ) {
                    $escaped = false;
                    continue;
                }
                if ( '\\' === $char ) {
                    $escaped = true;
                    continue;
                }
                if ( $quote === $char ) {
                    $quote = null;
                }
                continue;
            }
            if ( '"' === $char || "'" === $char ) {
                $quote = $char;
                continue;
            }
            if ( '(' === $char ) {
                ++$paren;
                continue;
            }
            if ( ')' === $char ) {
                if ( 0 === $paren ) {
                    $errors[] = 'Unbalanced CSS parenthesis before rule block.';
                    return array( 'rules' => $rules, 'errors' => $errors );
                }
                --$paren;
                continue;
            }
            if ( '[' === $char ) {
                ++$bracket;
                continue;
            }
            if ( ']' === $char ) {
                if ( 0 === $bracket ) {
                    $errors[] = 'Unbalanced CSS bracket before rule block.';
                    return array( 'rules' => $rules, 'errors' => $errors );
                }
                --$bracket;
                continue;
            }
            if ( 0 === $paren && 0 === $bracket && ( '{' === $char || ';' === $char || '}' === $char ) ) {
                $terminator = $char;
                break;
            }
        }

        if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
            $errors[] = 'Unbalanced CSS selector/prelude syntax.';
            break;
        }
        if ( null === $terminator ) {
            if ( '' !== trim( substr( $css, $start ) ) ) {
                $errors[] = 'Unterminated CSS rule/prelude.';
            }
            break;
        }
        if ( '}' === $terminator ) {
            $errors[] = 'Unexpected CSS closing brace.';
            break;
        }

        $prelude = trim( substr( $css, $start, $offset - $start ) );
        if ( ';' === $terminator ) {
            ++$offset;
            continue;
        }
        if ( '' === $prelude ) {
            $errors[] = 'Empty CSS rule prelude.';
            break;
        }

        $close = gpp_inbox_find_css_block_end( $css, $offset );
        if ( false === $close ) {
            $errors[] = 'Unterminated CSS block for prelude: ' . $prelude;
            break;
        }
        $body = substr( $css, $offset + 1, $close - $offset - 1 );
        if ( '@' === $prelude[0] ) {
            $nested = gpp_inbox_collect_css_rules( $body );
            $rules = array_merge( $rules, $nested['rules'] );
            $errors = array_merge( $errors, $nested['errors'] );
        } else {
            $rules[] = array( 'selector' => $prelude, 'body' => $body );
        }
        $offset = $close + 1;
    }

    return array( 'rules' => $rules, 'errors' => $errors );
}

/** Split a selector list on top-level commas only. */
function gpp_inbox_split_selector_list( $selector_text ) {
    $members = array();
    $start = 0;
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $length = strlen( $selector_text );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $selector_text[ $i ];
        if ( null !== $quote ) {
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
        } elseif ( '(' === $char ) {
            ++$paren;
        } elseif ( ')' === $char ) {
            --$paren;
        } elseif ( '[' === $char ) {
            ++$bracket;
        } elseif ( ']' === $char ) {
            --$bracket;
        } elseif ( ',' === $char && 0 === $paren && 0 === $bracket ) {
            $members[] = trim( substr( $selector_text, $start, $i - $start ) );
            $start = $i + 1;
        }
        if ( $paren < 0 || $bracket < 0 ) {
            return array( 'members' => array(), 'error' => 'Unbalanced selector-list syntax.' );
        }
    }

    if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
        return array( 'members' => array(), 'error' => 'Unbalanced selector-list syntax.' );
    }
    $members[] = trim( substr( $selector_text, $start ) );
    foreach ( $members as $member ) {
        if ( '' === $member ) {
            return array( 'members' => array(), 'error' => 'Empty selector-list member.' );
        }
    }

    return array( 'members' => $members, 'error' => null );
}

/**
 * Parse declarations in a native-host rule. Semicolons/colons inside strings,
 * functions and attribute-like bracket groups are ignored for splitting.
 */
function gpp_inbox_parse_css_declarations( $body ) {
    if ( false !== strpos( $body, '{' ) || false !== strpos( $body, '}' ) ) {
        return array( 'declarations' => array(), 'errors' => array( 'Nested CSS syntax inside a native-host style rule is not admitted.' ) );
    }

    $segments = array();
    $start = 0;
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $length = strlen( $body );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $body[ $i ];
        if ( null !== $quote ) {
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
        } elseif ( '(' === $char ) {
            ++$paren;
        } elseif ( ')' === $char ) {
            --$paren;
        } elseif ( '[' === $char ) {
            ++$bracket;
        } elseif ( ']' === $char ) {
            --$bracket;
        } elseif ( ';' === $char && 0 === $paren && 0 === $bracket ) {
            $segments[] = substr( $body, $start, $i - $start );
            $start = $i + 1;
        }
        if ( $paren < 0 || $bracket < 0 ) {
            return array( 'declarations' => array(), 'errors' => array( 'Unbalanced CSS declaration syntax.' ) );
        }
    }
    if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
        return array( 'declarations' => array(), 'errors' => array( 'Unbalanced CSS declaration syntax.' ) );
    }
    $segments[] = substr( $body, $start );

    $declarations = array();
    $errors = array();
    foreach ( $segments as $segment ) {
        $segment = trim( $segment );
        if ( '' === $segment ) {
            continue;
        }

        $colon = null;
        $quote = null;
        $escaped = false;
        $paren = 0;
        $bracket = 0;
        $segment_length = strlen( $segment );
        for ( $i = 0; $i < $segment_length; ++$i ) {
            $char = $segment[ $i ];
            if ( null !== $quote ) {
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
            } elseif ( '(' === $char ) {
                ++$paren;
            } elseif ( ')' === $char ) {
                --$paren;
            } elseif ( '[' === $char ) {
                ++$bracket;
            } elseif ( ']' === $char ) {
                --$bracket;
            } elseif ( ':' === $char && 0 === $paren && 0 === $bracket ) {
                $colon = $i;
                break;
            }
        }

        if ( null === $colon ) {
            $errors[] = 'Unclassifiable CSS declaration: ' . $segment;
            continue;
        }
        $property = strtolower( trim( substr( $segment, 0, $colon ) ) );
        $value = trim( substr( $segment, $colon + 1 ) );
        if ( 1 !== preg_match( '/^(?:--[a-z0-9_-]+|[a-z-]+)$/', $property ) || '' === $value ) {
            $errors[] = 'Invalid CSS declaration syntax: ' . $segment;
            continue;
        }
        $declarations[] = array( 'property' => $property, 'value' => $value );
    }

    return array( 'declarations' => $declarations, 'errors' => $errors );
}

/** Positive Phase-B property contract for authentic native Inbox selectors. */
function gpp_inbox_is_admitted_native_paint_property( $property ) {
    if ( 1 === preg_match( '/^--gpp-inbox-[a-z0-9-]+$/', $property ) ) {
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

/** Validate the positive paint/typography contract for native-root selectors. */
function gpp_inbox_native_paint_contract_errors( $css ) {
    $normalized = gpp_inbox_normalize_css_comments( $css );
    if ( null !== $normalized['error'] ) {
        return array( $normalized['error'] );
    }

    $parsed = gpp_inbox_collect_css_rules( $normalized['css'] );
    $errors = $parsed['errors'];
    $matched_rules = 0;
    foreach ( $parsed['rules'] as $rule ) {
        $selectors = gpp_inbox_split_selector_list( $rule['selector'] );
        if ( null !== $selectors['error'] ) {
            $errors[] = $selectors['error'] . ' Selector: ' . $rule['selector'];
            continue;
        }

        $targets_native_host = false;
        foreach ( $selectors['members'] as $member ) {
            if ( false !== strpos( $member, '.gflow-inbox.gflow-grid.gflow-common' ) ) {
                $targets_native_host = true;
                break;
            }
        }
        if ( ! $targets_native_host ) {
            continue;
        }
        ++$matched_rules;

        $declarations = gpp_inbox_parse_css_declarations( $rule['body'] );
        foreach ( $declarations['errors'] as $error ) {
            $errors[] = $error . ' Selector: ' . $rule['selector'];
        }
        foreach ( $declarations['declarations'] as $declaration ) {
            if ( ! gpp_inbox_is_admitted_native_paint_property( $declaration['property'] ) ) {
                $errors[] = 'Unadmitted native Inbox property `' . $declaration['property'] . '` in selector: ' . $rule['selector'];
            }
        }
    }

    if ( 0 === $matched_rules ) {
        $errors[] = 'No native Inbox selector was safely classified.';
    }

    return $errors;
}

/** Existing historical regression protections, exposed for falsification. */
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
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* geometry must still be parsed */ width: 10px; }',
    'width'
);
foreach ( array( 'box-sizing', 'border-width', 'scale' ) as $property ) {
    gpp_inbox_assert_rejected_with_property(
        'PRI_FND_001_UNENUMERATED_' . strtoupper( str_replace( '-', '_', $property ) ) . '_REJECT',
        '.gflow-inbox.gflow-grid.gflow-common .ag-row { ' . $property . ': 1; }',
        $property
    );
}

$admitted_fixture = <<<'CSS'
.gpp-owned-decoy,
.gflow-inbox.gflow-grid.gflow-common .ag-row {
    --gpp-inbox-test-paint: #fff;
    background-color: var(--gpp-inbox-test-paint);
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
