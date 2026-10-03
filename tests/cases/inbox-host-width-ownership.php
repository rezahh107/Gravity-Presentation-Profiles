<?php

require_once __DIR__ . '/../helpers.php';

$repo_root = dirname( __DIR__, 2 );
$shared_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox.css' );
$native_css = file_get_contents( $repo_root . '/assets/css/srwf-gravity-flow-inbox-native.css' );

gpp_assert_true( false !== $shared_css, 'Shared Inbox CSS could not be read.' );
gpp_assert_true( false !== $native_css, 'Native Inbox CSS could not be read.' );

/** Return declaration bodies for rules that directly target the admitted Full Width Inbox modifier. */
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

/** Return declaration bodies for the GPP-owned inner shell. */
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

/** Normalize separated CSS comments while preserving quoted data and failing closed on token-adjacent comments. */
function gpp_inbox_normalize_css_comments( $css ) {
    $normalized = '';
    $quote = null;
    $escaped = false;
    $in_comment = false;
    $comment_left_separated = true;
    $length = strlen( $css );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $css[ $i ];
        $next = $i + 1 < $length ? $css[ $i + 1 ] : null;

        if ( $in_comment ) {
            if ( '*' === $char && '/' === $next ) {
                $right_index = $i + 2;
                $comment_right_separated = $right_index >= $length || ctype_space( $css[ $right_index ] );
                if ( ! $comment_left_separated || ! $comment_right_separated ) {
                    return array( 'css' => '', 'error' => 'Token-adjacent CSS comment syntax is outside the bounded native Inbox verifier.' );
                }
                $normalized .= ' ';
                $in_comment = false;
                ++$i;
            }
            continue;
        }

        if ( null !== $quote ) {
            $normalized .= $char;
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
            $normalized .= $char;
            continue;
        }

        if ( '/' === $char && '*' === $next ) {
            $comment_left_separated = 0 === $i || ctype_space( $css[ $i - 1 ] );
            $in_comment = true;
            ++$i;
            continue;
        }

        if ( '*' === $char && '/' === $next ) {
            return array( 'css' => '', 'error' => 'Unclassifiable CSS comment terminator.' );
        }

        $normalized .= $char;
    }

    if ( $in_comment ) {
        return array( 'css' => '', 'error' => 'Unterminated CSS comment.' );
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

/** Split one selector member into top-level compounds and combinators. */
function gpp_inbox_split_selector_compounds( $selector ) {
    $compounds = array();
    $combinators = array();
    $current = '';
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $pending_descendant = false;
    $length = strlen( $selector );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $selector[ $i ];
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
            continue;
        }
        if ( '(' === $char ) {
            ++$paren;
            $current .= $char;
            continue;
        }
        if ( ')' === $char ) {
            --$paren;
            if ( $paren < 0 ) {
                return array( 'compounds' => array(), 'combinators' => array(), 'error' => 'Unbalanced selector compound syntax.' );
            }
            $current .= $char;
            continue;
        }
        if ( '[' === $char ) {
            ++$bracket;
            $current .= $char;
            continue;
        }
        if ( ']' === $char ) {
            --$bracket;
            if ( $bracket < 0 ) {
                return array( 'compounds' => array(), 'combinators' => array(), 'error' => 'Unbalanced selector compound syntax.' );
            }
            $current .= $char;
            continue;
        }

        if ( 0 === $paren && 0 === $bracket && ctype_space( $char ) ) {
            if ( '' !== trim( $current ) ) {
                $compounds[] = trim( $current );
                $current = '';
                $pending_descendant = true;
            }
            continue;
        }
        if ( 0 === $paren && 0 === $bracket && false !== strpos( '>+~', $char ) ) {
            if ( '' !== trim( $current ) ) {
                $compounds[] = trim( $current );
                $current = '';
            }
            if ( empty( $compounds ) || count( $combinators ) >= count( $compounds ) ) {
                return array( 'compounds' => array(), 'combinators' => array(), 'error' => 'Unclassifiable selector combinator syntax.' );
            }
            $combinators[] = $char;
            $pending_descendant = false;
            continue;
        }
        if ( $pending_descendant ) {
            if ( count( $combinators ) < count( $compounds ) ) {
                $combinators[] = ' ';
            }
            $pending_descendant = false;
        }
        $current .= $char;
    }

    if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
        return array( 'compounds' => array(), 'combinators' => array(), 'error' => 'Unbalanced selector compound syntax.' );
    }
    if ( '' !== trim( $current ) ) {
        $compounds[] = trim( $current );
    }
    if ( empty( $compounds ) || count( $combinators ) !== count( $compounds ) - 1 ) {
        return array( 'compounds' => array(), 'combinators' => array(), 'error' => 'Unclassifiable selector compound/combinator sequence.' );
    }

    return array( 'compounds' => $compounds, 'combinators' => $combinators, 'error' => null );
}

/** True when text explicitly names one of the authoritative native-root class tokens. */
function gpp_inbox_text_references_native_root_token( $text ) {
    return 1 === preg_match( '/(?:^|[^a-z0-9_-])(?:gflow-inbox|gflow-grid|gflow-common)(?=$|[^a-z0-9_-])/', $text );
}

/** Find a balanced closing delimiter while respecting quoted strings and escapes. */
function gpp_inbox_find_matching_delimiter( $text, $start, $open, $close ) {
    $depth = 0;
    $quote = null;
    $escaped = false;
    $length = strlen( $text );

    for ( $i = $start; $i < $length; ++$i ) {
        $char = $text[ $i ];
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
            continue;
        }
        if ( $open === $char ) {
            ++$depth;
        } elseif ( $close === $char ) {
            --$depth;
            if ( 0 === $depth ) {
                return array( 'index' => $i, 'error' => null );
            }
            if ( $depth < 0 ) {
                break;
            }
        }
    }

    return array( 'index' => null, 'error' => 'Unbalanced bounded CSS delimiter syntax.' );
}

/**
 * Extract authoritative class identity tokens from one compound. Supported
 * identity forms are ordinary `.class` and exact `[class~="token"]` selectors.
 */
function gpp_inbox_compound_class_tokens( $compound ) {
    $classes = array();
    $length = strlen( $compound );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $compound[ $i ];
        if ( '\\' === $char ) {
            return array( 'classes' => array(), 'error' => 'Escaped selector syntax is outside the bounded native-root classifier.' );
        }
        if ( '[' === $char ) {
            $closing = gpp_inbox_find_matching_delimiter( $compound, $i, '[', ']' );
            if ( null !== $closing['error'] ) {
                return array( 'classes' => array(), 'error' => $closing['error'] );
            }
            $attribute = substr( $compound, $i + 1, $closing['index'] - $i - 1 );
            if ( false !== strpos( $attribute, '\\' ) ) {
                return array( 'classes' => array(), 'error' => 'Escaped attribute selector syntax is outside the bounded native-root classifier.' );
            }
            if ( gpp_inbox_text_references_native_root_token( $attribute ) ) {
                $attribute_match = array();
                if ( 1 !== preg_match( '/^\s*class\s*~=\s*(["\'])(gflow-inbox|gflow-grid|gflow-common)\1\s*$/', $attribute, $attribute_match ) ) {
                    return array( 'classes' => array(), 'error' => 'Authoritative native Inbox class token appears in unsupported class-token attribute syntax.' );
                }
                $classes[] = $attribute_match[2];
            }
            $i = $closing['index'];
            continue;
        }
        if ( '(' === $char ) {
            $closing = gpp_inbox_find_matching_delimiter( $compound, $i, '(', ')' );
            if ( null !== $closing['error'] ) {
                return array( 'classes' => array(), 'error' => $closing['error'] );
            }
            $nested = substr( $compound, $i + 1, $closing['index'] - $i - 1 );
            if ( gpp_inbox_text_references_native_root_token( $nested ) ) {
                return array( 'classes' => array(), 'error' => 'Native Inbox root class appears in unsupported nested selector syntax.' );
            }
            $i = $closing['index'];
            continue;
        }
        if ( ')' === $char || ']' === $char ) {
            return array( 'classes' => array(), 'error' => 'Unbalanced selector compound syntax.' );
        }
        if ( '.' !== $char ) {
            continue;
        }

        $start = $i + 1;
        $end = $start;
        while ( $end < $length && 1 === preg_match( '/[a-z0-9_-]/i', $compound[ $end ] ) ) {
            ++$end;
        }
        if ( $end === $start ) {
            return array( 'classes' => array(), 'error' => 'Unclassifiable class selector syntax.' );
        }
        $classes[] = substr( $compound, $start, $end - $start );
        $i = $end - 1;
    }

    return array( 'classes' => $classes, 'error' => null );
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

function gpp_inbox_compound_is_native_root( $classes ) {
    foreach ( array( 'gflow-inbox', 'gflow-grid', 'gflow-common' ) as $required ) {
        if ( ! in_array( $required, $classes, true ) ) {
            return false;
        }
    }
    return true;
}

/** True only when a compound is nothing except the three native-root identity tokens. */
function gpp_inbox_compound_is_exact_native_root_identity( $compound ) {
    $tokens = gpp_inbox_compound_class_tokens( $compound );
    if ( null !== $tokens['error'] || ! gpp_inbox_compound_is_native_root( $tokens['classes'] ) ) {
        return false;
    }

    $actual = array_values( array_unique( $tokens['classes'] ) );
    $expected = array( 'gflow-inbox', 'gflow-grid', 'gflow-common' );
    sort( $actual );
    sort( $expected );
    if ( $actual !== $expected ) {
        return false;
    }

    $remainder = preg_replace( '/\.(?:gflow-inbox|gflow-grid|gflow-common)\b/', '', $compound );
    $remainder = preg_replace( '/\[\s*class\s*~=\s*(["\'])(?:gflow-inbox|gflow-grid|gflow-common)\1\s*\]/', '', $remainder );

    return is_string( $remainder ) && '' === trim( $remainder );
}

/** The host-shell exception is frozen semantically, with native class order/identity representation irrelevant. */
function gpp_inbox_is_admitted_host_shell_classification( $parsed, $root_index ) {
    return 1 === $root_index
        && 2 === count( $parsed['compounds'] )
        && 1 === count( $parsed['combinators'] )
        && ' ' === $parsed['combinators'][0]
        && '.gpp-inbox-surface' === $parsed['compounds'][0]
        && gpp_inbox_compound_is_exact_native_root_identity( $parsed['compounds'][1] );
}

/** Exact Owner-authorized MR-1 physical-axis selector set. */
function gpp_inbox_is_admitted_physical_axis_selector( $selector ) {
    $parsed = gpp_inbox_split_selector_compounds( trim( $selector ) );
    if ( null !== $parsed['error']
        || 3 !== count( $parsed['compounds'] )
        || 2 !== count( $parsed['combinators'] )
        || ' ' !== $parsed['combinators'][0]
        || ' ' !== $parsed['combinators'][1]
        || '.gpp-inbox-surface' !== $parsed['compounds'][0]
        || '[data-js="gflow-inbox"]' !== $parsed['compounds'][1]
    ) {
        return false;
    }

    return in_array(
        $parsed['compounds'][2],
        array(
            '.ag-root-wrapper',
            '.ag-header-viewport',
            '.ag-center-cols-viewport',
            '.ag-body-horizontal-scroll-viewport',
        ),
        true
    );
}

/** Authoritative bounded semantic classifier for one effective selector-list member. */
function gpp_inbox_classify_native_selector_member( $selector ) {
    $parsed = gpp_inbox_split_selector_compounds( trim( $selector ) );
    if ( null !== $parsed['error'] ) {
        return array( 'kind' => 'error', 'error' => $parsed['error'] );
    }
    if ( gpp_inbox_is_admitted_physical_axis_selector( $selector ) ) {
        return array( 'kind' => 'physical-axis', 'error' => null );
    }

    $root_indexes = array();
    foreach ( $parsed['compounds'] as $index => $compound ) {
        $classes = gpp_inbox_compound_class_tokens( $compound );
        if ( null !== $classes['error'] ) {
            return array( 'kind' => 'error', 'error' => $classes['error'] );
        }
        if ( gpp_inbox_compound_is_native_root( $classes['classes'] ) ) {
            $root_indexes[] = $index;
        }
    }

    if ( empty( $root_indexes ) ) {
        return array( 'kind' => 'none', 'error' => null );
    }
    if ( 1 !== count( $root_indexes ) ) {
        return array( 'kind' => 'error', 'error' => 'Ambiguous selector contains more than one native Inbox root compound.' );
    }

    $root_index = $root_indexes[0];
    if ( 0 === $root_index ) {
        return array( 'kind' => 'native-root', 'error' => null );
    }
    if ( gpp_inbox_is_admitted_host_shell_classification( $parsed, $root_index ) ) {
        return array( 'kind' => 'host-shell', 'error' => null );
    }

    return array( 'kind' => 'ancestor', 'error' => null );
}

/** Positive Phase-B property contract for the authentic native Inbox subtree. */
/**
 * Direction remains presentation-only. RTL is admitted on text leaves, plus the
 * Owner-authorized MR-1 exception that establishes physical LTR on exactly four
 * runtime-proven AG Grid scroll participants.
 */
function gpp_inbox_is_admitted_native_text_direction_selector( $selector ) {
    return 1 === preg_match( '/(?:^|\\s)(?:\\.ag-header-cell-text|\\.ag-cell)(?:$|[:.#[\\s>+~])/', trim( $selector ) );
}

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

/** Find the closing structural brace while ignoring braces inside strings, [] and (). */
function gpp_inbox_find_matching_brace( $text, $start ) {
    $depth = 0;
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $length = strlen( $text );

    for ( $i = $start; $i < $length; ++$i ) {
        $char = $text[ $i ];
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
            continue;
        }
        if ( '(' === $char ) {
            ++$paren;
            continue;
        }
        if ( ')' === $char ) {
            --$paren;
            if ( $paren < 0 ) {
                return array( 'index' => null, 'error' => 'Unbalanced parenthesis while scanning CSS braces.' );
            }
            continue;
        }
        if ( '[' === $char ) {
            ++$bracket;
            continue;
        }
        if ( ']' === $char ) {
            --$bracket;
            if ( $bracket < 0 ) {
                return array( 'index' => null, 'error' => 'Unbalanced bracket while scanning CSS braces.' );
            }
            continue;
        }
        if ( 0 !== $paren || 0 !== $bracket ) {
            continue;
        }
        if ( '{' === $char ) {
            ++$depth;
        } elseif ( '}' === $char ) {
            --$depth;
            if ( 0 === $depth ) {
                return array( 'index' => $i, 'error' => null );
            }
            if ( $depth < 0 ) {
                break;
            }
        }
    }

    return array( 'index' => null, 'error' => 'Unbalanced bounded CSS brace structure.' );
}

/**
 * Scan one bounded block body into top-level statements and child blocks while
 * preserving brace structure. Braces inside quoted strings, [] and () are ignored.
 */
function gpp_inbox_scan_block_items( $text ) {
    $items = array();
    $buffer = '';
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $length = strlen( $text );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $text[ $i ];
        if ( null !== $quote ) {
            $buffer .= $char;
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
            $buffer .= $char;
            continue;
        }
        if ( '(' === $char ) {
            ++$paren;
            $buffer .= $char;
            continue;
        }
        if ( ')' === $char ) {
            --$paren;
            if ( $paren < 0 ) {
                return array( 'items' => array(), 'error' => 'Unbalanced parenthesis in bounded CSS block.' );
            }
            $buffer .= $char;
            continue;
        }
        if ( '[' === $char ) {
            ++$bracket;
            $buffer .= $char;
            continue;
        }
        if ( ']' === $char ) {
            --$bracket;
            if ( $bracket < 0 ) {
                return array( 'items' => array(), 'error' => 'Unbalanced bracket in bounded CSS block.' );
            }
            $buffer .= $char;
            continue;
        }
        if ( 0 === $paren && 0 === $bracket && ';' === $char ) {
            if ( '' !== trim( $buffer ) ) {
                $items[] = array( 'type' => 'statement', 'text' => trim( $buffer ) );
            }
            $buffer = '';
            continue;
        }
        if ( 0 === $paren && 0 === $bracket && '{' === $char ) {
            $prelude = trim( $buffer );
            if ( '' === $prelude ) {
                return array( 'items' => array(), 'error' => 'CSS child block has an empty prelude.' );
            }
            $closing = gpp_inbox_find_matching_brace( $text, $i );
            if ( null !== $closing['error'] ) {
                return array( 'items' => array(), 'error' => $closing['error'] );
            }
            $items[] = array(
                'type'    => 'block',
                'prelude' => $prelude,
                'body'    => substr( $text, $i + 1, $closing['index'] - $i - 1 ),
            );
            $buffer = '';
            $i = $closing['index'];
            continue;
        }
        if ( 0 === $paren && 0 === $bracket && '}' === $char ) {
            return array( 'items' => array(), 'error' => 'Unexpected closing brace in bounded CSS block.' );
        }

        $buffer .= $char;
    }

    if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
        return array( 'items' => array(), 'error' => 'Unbalanced bounded CSS block syntax.' );
    }
    if ( '' !== trim( $buffer ) ) {
        $items[] = array( 'type' => 'statement', 'text' => trim( $buffer ) );
    }

    return array( 'items' => $items, 'error' => null );
}

/** Resolve exactly one top-level nesting `&` against one effective parent selector. */
function gpp_inbox_resolve_nested_selector_member( $member, $parent_selector ) {
    $positions = array();
    $quote = null;
    $escaped = false;
    $paren = 0;
    $bracket = 0;
    $length = strlen( $member );

    for ( $i = 0; $i < $length; ++$i ) {
        $char = $member[ $i ];
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
            continue;
        }
        if ( '(' === $char ) {
            ++$paren;
            continue;
        }
        if ( ')' === $char ) {
            --$paren;
            if ( $paren < 0 ) {
                return array( 'selector' => '', 'error' => 'Unbalanced nested selector syntax.' );
            }
            continue;
        }
        if ( '[' === $char ) {
            ++$bracket;
            continue;
        }
        if ( ']' === $char ) {
            --$bracket;
            if ( $bracket < 0 ) {
                return array( 'selector' => '', 'error' => 'Unbalanced nested selector syntax.' );
            }
            continue;
        }
        if ( 0 === $paren && 0 === $bracket && '&' === $char ) {
            $positions[] = $i;
        }
    }

    if ( null !== $quote || 0 !== $paren || 0 !== $bracket ) {
        return array( 'selector' => '', 'error' => 'Unbalanced nested selector syntax.' );
    }
    if ( 1 !== count( $positions ) ) {
        return array( 'selector' => '', 'error' => 'Supported nested selector grammar requires exactly one top-level `&`.' );
    }

    $position = $positions[0];
    return array(
        'selector' => trim( substr( $member, 0, $position ) . $parent_selector . substr( $member, $position + 1 ) ),
        'error'    => null,
    );
}

function gpp_inbox_supported_grouping_at_rule( $prelude ) {
    return 1 === preg_match( '/^@media\b.+$/is', trim( $prelude ) );
}

/** Classify effective selectors through the single authoritative path. */
function gpp_inbox_classify_effective_selectors( $selectors, &$errors, &$native_target_members ) {
    $targets = array();
    foreach ( $selectors as $selector ) {
        $classification = gpp_inbox_classify_native_selector_member( $selector );
        if ( 'error' === $classification['kind'] ) {
            $errors[] = $classification['error'] . ' Selector: ' . $selector;
            continue;
        }
        if ( 'none' === $classification['kind'] ) {
            continue;
        }
        ++$native_target_members;
        $targets[] = array( 'selector' => $selector, 'kind' => $classification['kind'] );
    }
    return $targets;
}

/** Apply the declaration allowlist to already classified target members. */
function gpp_inbox_enforce_native_declarations( $targets, $statement_texts, &$errors ) {
    if ( empty( $targets ) || empty( $statement_texts ) ) {
        return;
    }

    $declarations = gpp_inbox_parse_native_declarations( implode( ';', $statement_texts ) );
    if ( null !== $declarations['error'] ) {
        $errors[] = $declarations['error'] . ' Selector: ' . implode(
            ', ',
            array_map(
                function ( $target ) {
                    return $target['selector'];
                },
                $targets
            )
        );
        return;
    }

    foreach ( $targets as $target ) {
        if ( 'host-shell' === $target['kind'] ) {
            foreach ( gpp_inbox_host_shell_declaration_errors( $declarations['declarations'] ) as $error ) {
                $errors[] = $error . ' Selector: ' . $target['selector'];
            }
            continue;
        }
        if ( 'physical-axis' === $target['kind'] ) {
            $normalized_direction_value = 1 === count( $declarations['declarations'] )
                ? strtolower( preg_replace( '/\\s+/', ' ', trim( $declarations['declarations'][0]['value'] ) ) )
                : '';
            if ( 1 !== count( $declarations['declarations'] )
                || 'direction' !== $declarations['declarations'][0]['property']
                || 'ltr !important' !== $normalized_direction_value
            ) {
                $errors[] = 'Owner-authorized Inbox physical-axis selectors may contain only direction: ltr !important. Selector: ' . $target['selector'];
            }
            continue;
        }
        if ( 'ancestor' === $target['kind'] ) {
            $errors[] = 'Unadmitted ancestor-qualified selector targets the native Inbox subtree: ' . $target['selector'];
            continue;
        }
        foreach ( $declarations['declarations'] as $declaration ) {
            if ( 'direction' === $declaration['property'] ) {
                if ( gpp_inbox_is_admitted_native_text_direction_selector( $target['selector'] )
                    && 'rtl' === strtolower( trim( $declaration['value'] ) ) ) {
                    continue;
                }
                $errors[] = 'Native Inbox direction is admitted only as RTL text presentation on .ag-cell/.ag-header-cell-text leaves. Selector: ' . $target['selector'];
                continue;
            }
            if ( ! gpp_inbox_is_admitted_native_paint_property( $declaration['property'] ) ) {
                $errors[] = 'Unadmitted native Inbox property `' . $declaration['property'] . '` in selector: ' . $target['selector'];
            }
        }
    }
}

/** Walk one style-rule body, preserving current effective selector ancestry. */
function gpp_inbox_walk_style_body( $body, $effective_selectors, &$errors, &$native_target_members ) {
    $scanned = gpp_inbox_scan_block_items( $body );
    if ( null !== $scanned['error'] ) {
        $errors[] = $scanned['error'];
        return;
    }

    $statements = array();
    $blocks = array();
    foreach ( $scanned['items'] as $item ) {
        if ( 'statement' === $item['type'] ) {
            $statements[] = $item['text'];
        } else {
            $blocks[] = $item;
        }
    }

    $targets = gpp_inbox_classify_effective_selectors( $effective_selectors, $errors, $native_target_members );
    gpp_inbox_enforce_native_declarations( $targets, $statements, $errors );

    foreach ( $blocks as $block ) {
        $prelude = trim( $block['prelude'] );
        if ( 0 === strpos( $prelude, '@' ) ) {
            if ( ! gpp_inbox_supported_grouping_at_rule( $prelude ) ) {
                $errors[] = 'Unsupported grouping at-rule inside bounded style context: ' . $prelude;
                continue;
            }
            gpp_inbox_walk_style_body( $block['body'], $effective_selectors, $errors, $native_target_members );
            continue;
        }

        gpp_inbox_walk_style_rule( $prelude, $block['body'], $effective_selectors, $errors, $native_target_members );
    }
}

/** Walk one style rule, resolving bounded nesting against parent effective selectors. */
function gpp_inbox_walk_style_rule( $selector_text, $body, $parent_selectors, &$errors, &$native_target_members ) {
    $split = gpp_inbox_split_selector_list( $selector_text );
    if ( null !== $split['error'] ) {
        $errors[] = $split['error'] . ' Selector: ' . $selector_text;
        return;
    }

    $effective = array();
    if ( null === $parent_selectors ) {
        $effective = $split['members'];
    } else {
        foreach ( $split['members'] as $member ) {
            foreach ( $parent_selectors as $parent_selector ) {
                $resolved = gpp_inbox_resolve_nested_selector_member( $member, $parent_selector );
                if ( null !== $resolved['error'] ) {
                    $errors[] = $resolved['error'] . ' Nested selector: ' . $member;
                    continue;
                }
                $effective[] = $resolved['selector'];
            }
        }
    }

    if ( empty( $effective ) ) {
        return;
    }
    gpp_inbox_walk_style_body( $body, $effective, $errors, $native_target_members );
}

/** Walk a stylesheet/grouping-rule list. Only ordinary style rules and @media are admitted. */
function gpp_inbox_walk_rule_list( $css, &$errors, &$native_target_members ) {
    $scanned = gpp_inbox_scan_block_items( $css );
    if ( null !== $scanned['error'] ) {
        $errors[] = $scanned['error'];
        return;
    }

    foreach ( $scanned['items'] as $item ) {
        if ( 'statement' === $item['type'] ) {
            $errors[] = 'Unsupported top-level CSS statement in bounded native Inbox contract: ' . $item['text'];
            continue;
        }

        $prelude = trim( $item['prelude'] );
        if ( 0 === strpos( $prelude, '@' ) ) {
            if ( ! gpp_inbox_supported_grouping_at_rule( $prelude ) ) {
                $errors[] = 'Unsupported grouping at-rule in bounded native Inbox contract: ' . $prelude;
                continue;
            }
            gpp_inbox_walk_rule_list( $item['body'], $errors, $native_target_members );
            continue;
        }

        gpp_inbox_walk_style_rule( $prelude, $item['body'], null, $errors, $native_target_members );
    }
}

/** Enforce the positive paint/typography contract through one structure-aware classification path. */
function gpp_inbox_native_paint_contract_errors( $css ) {
    $normalized = gpp_inbox_normalize_css_comments( $css );
    if ( null !== $normalized['error'] ) {
        return array( $normalized['error'] );
    }

    $errors = array();
    $native_target_members = 0;
    gpp_inbox_walk_rule_list( $normalized['css'], $errors, $native_target_members );

    if ( 0 === $native_target_members ) {
        $errors[] = 'No native Inbox selector was found for paint-contract validation.';
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

function gpp_inbox_assert_rejected_with_message( $label, $css, $needle ) {
    $errors = gpp_inbox_native_paint_contract_errors( $css );
    gpp_assert_true( ! empty( $errors ), $label . ' unexpectedly passed the native paint contract.' );
    gpp_assert_true(
        false !== stripos( implode( "\n", $errors ), $needle ),
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
gpp_assert_true( false !== strpos( $shared_rules[0], 'inline-size: 100%;' ), 'Full Width Inbox must consume the width supplied by its host.' );
gpp_assert_true( false !== strpos( $shared_rules[0], 'max-inline-size: none;' ), 'Full Width Inbox host-relative maximum sizing is missing.' );
gpp_assert_true( false !== strpos( $shared_rules[0], 'margin-inline: 0;' ), 'Full Width Inbox must not use margin breakout geometry.' );

gpp_assert_true( ! empty( $inner_rules ), 'GPP Inbox inner shell rule is missing.' );
$host_width_rule_count = 0;
foreach ( $inner_rules as $rule ) {
    if ( false !== strpos( $rule, 'inline-size: 100%;' ) ) {
        ++$host_width_rule_count;
        gpp_assert_true( false !== strpos( $rule, 'padding-inline:' ), 'Host-width Inbox inner shell lost its bounded responsive gutter.' );
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

$physical_axis_selectors = array(
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-root-wrapper',
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-header-viewport',
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-center-cols-viewport',
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport',
);
foreach ( $physical_axis_selectors as $physical_axis_selector ) {
    gpp_assert_true(
        false !== strpos( $shared_css, $physical_axis_selector ),
        'Owner-authorized Inbox physical-axis selector is missing: ' . $physical_axis_selector
    );
    gpp_assert_same(
        array(),
        gpp_inbox_native_paint_contract_errors( $physical_axis_selector . ' { direction: ltr !important; }' ),
        'Owner-authorized Inbox physical-axis selector must admit only its exact LTR direction exception: ' . $physical_axis_selector
    );
}
gpp_assert_true(
    1 === preg_match( '/\\.ag-header-cell-text\\s*,\\s*\\n?\\s*\\.gflow-inbox\\.gflow-grid\\.gflow-common \\.ag-cell\\s*\\{[^}]*direction\\s*:\\s*rtl\\s*;/s', $shared_css ),
    'Native Inbox Persian text leaves must restore RTL independently of the physical Grid axis.'
);

$paint_errors = array_merge(
    gpp_inbox_native_paint_contract_errors( $shared_css ),
    gpp_inbox_native_paint_contract_errors( $native_css )
);
gpp_assert_same( array(), $paint_errors, 'Current production Inbox CSS violates the positive native paint contract: ' . implode( ' | ', $paint_errors ) );

$historical_errors = gpp_inbox_historical_regression_errors( $shared_css, $native_css );
gpp_assert_same( array(), $historical_errors, 'Current production Inbox CSS violates an existing historical regression guard: ' . implode( ' | ', $historical_errors ) );

/* Comment-normalization closure. */
$comment_spliced_root_combined = <<<'CSS'
.gflow-inbox.gflow-grid.gflow-common .ag-row {
    color: #172033;
}

.gflow-inbox/**/.gflow-grid.gflow-common .ag-cell {
    width: 10px;
}
CSS;
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_COMMENT_SPLICED_ROOT_COMBINED_REJECT',
    $comment_spliced_root_combined,
    'Token-adjacent CSS comment syntax'
);

gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_COMMENT_SPLICED_ROOT_SECOND_PAIR_REJECT',
    '.gflow-inbox.gflow-grid/**/.gflow-common .ag-cell { width: 10px; }',
    'Token-adjacent CSS comment syntax'
);

gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_COMMENT_SPLICED_CLASS_DELIMITER_REJECT',
    './**/gflow-inbox.gflow-grid.gflow-common .ag-cell { width: 10px; }',
    'Token-adjacent CSS comment syntax'
);

$whitespace_comment_fixture = '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* ordinary separated comment */ font-weight: 600; }';
gpp_assert_same(
    array(),
    gpp_inbox_native_paint_contract_errors( $whitespace_comment_fixture ),
    'Whitespace-separated ordinary CSS comment unexpectedly failed the bounded native paint contract.'
);
echo "PRI_FND_001_WHITESPACE_COMMENT_ADMITTED_PASS\n";

gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_COMMENT_BEFORE_WIDTH_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* still classify */ width: 10px; }',
    'width'
);

$quoted_double_comment_fixture = <<<'CSS'
.gflow-inbox.gflow-grid.gflow-common .ag-row {
    font-family: "/*";
    width: 10px;
    font-family: "*/";
}
CSS;
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_QUOTED_COMMENT_DOUBLE_WIDTH_REJECT',
    $quoted_double_comment_fixture,
    'width'
);

$quoted_single_comment_fixture = <<<'CSS'
.gflow-inbox.gflow-grid.gflow-common .ag-row {
    font-family: '/*';
    width: 10px;
    font-family: '*/';
}
CSS;
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_QUOTED_COMMENT_SINGLE_WIDTH_REJECT',
    $quoted_single_comment_fixture,
    'width'
);

$escaped_quote_comment_fixture = <<<'CSS'
.gflow-inbox.gflow-grid.gflow-common .ag-row {
    font-family: "safe\"/*quoted*/tail";
    width: 10px;
}
CSS;
$escaped_quote_normalized = gpp_inbox_normalize_css_comments( $escaped_quote_comment_fixture );
gpp_assert_same( null, $escaped_quote_normalized['error'], 'Escaped quoted comment-looking text unexpectedly failed normalization.' );
gpp_assert_true(
    false !== strpos( $escaped_quote_normalized['css'], 'font-family: "safe\"/*quoted*/tail";' ),
    'Escaped quoted comment-looking text was altered during normalization.'
);
gpp_assert_true(
    false !== strpos( $escaped_quote_normalized['css'], 'width: 10px;' ),
    'Quoted comment-looking text caused unrelated declaration text to be deleted.'
);
echo "PRI_FND_001_QUOTED_COMMENT_ESCAPED_VALUE_PRESERVE_PASS\n";
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_QUOTED_COMMENT_ESCAPED_VALUE_WIDTH_REJECT',
    $escaped_quote_comment_fixture,
    'width'
);

$production_comment_fixture = $shared_css . "\n" . $native_css;
gpp_assert_true( false !== strpos( $production_comment_fixture, '/*' ), 'Production Inbox CSS no longer contains an ordinary comment normalization fixture.' );
$production_comment_normalized = gpp_inbox_normalize_css_comments( $production_comment_fixture );
gpp_assert_same( null, $production_comment_normalized['error'], 'Ordinary production Inbox comments unexpectedly failed normalization.' );
gpp_assert_true(
    false === strpos( $production_comment_normalized['css'], 'SRWF Native-First Gravity Flow Inbox presentation.' ),
    'Ordinary production Inbox comment text was not removed.'
);
gpp_assert_true(
    false !== strpos( $production_comment_normalized['css'], '.gflow-inbox.gflow-grid.gflow-common .ag-row {' ),
    'Production comment normalization removed adjacent authentic native Inbox source.'
);
echo "PRI_FND_001_PRODUCTION_COMMENT_NORMALIZATION_PASS\n";

gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_UNTERMINATED_COMMENT_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* unterminated',
    'Unterminated CSS comment'
);

gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_UNBALANCED_QUOTED_VALUE_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-row { font-family: "unterminated; width: 10px; }',
    'Unbalanced bounded CSS brace structure'
);

/* Existing flat-selector closure. */
gpp_inbox_assert_rejected_with_property( 'PRI_FND_001_DIRECT_WIDTH_REJECT', '.gflow-inbox.gflow-grid.gflow-common .ag-row { width: 10px; }', 'width' );
gpp_assert_same(
    array(),
    gpp_inbox_native_paint_contract_errors( '.gflow-inbox.gflow-grid.gflow-common .ag-cell { direction: rtl; }' ),
    'RTL text direction on the admitted native cell leaf must remain presentation-only.'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_GRID_ROOT_DIRECTION_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-root-wrapper { direction: rtl; }',
    'direction is admitted only'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_GRID_VIEWPORT_DIRECTION_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-center-cols-viewport { direction: rtl; }',
    'direction is admitted only'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_GRID_ROOT_LTR_UNSCOPED_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-root-wrapper { direction: ltr !important; }',
    'direction is admitted only'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_PHYSICAL_AXIS_WRONG_VALUE_REJECT',
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-root-wrapper { direction: rtl !important; }',
    'physical-axis selectors may contain only'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_PHYSICAL_AXIS_IMPORTANT_REQUIRED_REJECT',
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-root-wrapper { direction: ltr; }',
    'physical-axis selectors may contain only'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_PHYSICAL_AXIS_EXTRA_PROPERTY_REJECT',
    '.gpp-inbox-surface [data-js="gflow-inbox"] .ag-root-wrapper { direction: ltr !important; width: 10px; }',
    'physical-axis selectors may contain only'
);
gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_PHYSICAL_AXIS_UNLISTED_NODE_REJECT',
    '.gflow-inbox.gflow-grid.gflow-common .ag-body-viewport { direction: ltr !important; }',
    'direction is admitted only'
);
gpp_inbox_assert_rejected_with_property( 'PRI_FND_001_REORDERED_WIDTH_REJECT', '.gflow-grid.gflow-inbox.gflow-common .ag-row { width: 10px; }', 'width' );
gpp_inbox_assert_rejected_with_property( 'PRI_FND_001_ADDITIONAL_PERMUTATION_WIDTH_REJECT', '.gflow-common.gflow-grid.gflow-inbox .ag-row { width: 10px; }', 'width' );
gpp_inbox_assert_rejected_with_property( 'PRI_FND_001_GROUPED_NONFIRST_WIDTH_REJECT', '.decoy-selector, .gflow-inbox.gflow-grid.gflow-common .ag-row { width: 10px; }', 'width' );
gpp_inbox_assert_rejected_with_property( 'PRI_FND_001_REORDERED_GROUPED_NONFIRST_WIDTH_REJECT', '.decoy-selector, .gflow-common.gflow-inbox.gflow-grid .ag-row { width: 10px; }', 'width' );
foreach ( array( 'box-sizing', 'border-width', 'scale' ) as $property ) {
    gpp_inbox_assert_rejected_with_property(
        'PRI_FND_001_UNENUMERATED_' . strtoupper( str_replace( '-', '_', $property ) ) . '_REJECT',
        '.gflow-inbox.gflow-grid.gflow-common .ag-row { ' . $property . ': 1; }',
        $property
    );
}
gpp_inbox_assert_rejected_with_property( 'PRI_FND_001_UNKNOWN_CUSTOM_PROPERTY_REJECT', '.gflow-inbox.gflow-grid.gflow-common { --gpp-inbox-geometry: 10px; }', '--gpp-inbox-geometry' );

$reordered_paint_errors = gpp_inbox_native_paint_contract_errors( '.gflow-grid.gflow-common.gflow-inbox .ag-row { color: #172033; }' );
gpp_assert_same( array(), $reordered_paint_errors, 'Reordered authentic native Inbox root with admitted paint unexpectedly failed: ' . implode( ' | ', $reordered_paint_errors ) );
echo "PRI_FND_001_REORDERED_ADMITTED_PAINT_PASS\n";

$incomplete_root = gpp_inbox_classify_native_selector_member( '.gflow-grid.gflow-inbox .ag-row' );
gpp_assert_same( 'none', $incomplete_root['kind'], 'Incomplete native Inbox class set was accidentally classified as the authentic root.' );
echo "PRI_FND_001_INCOMPLETE_ROOT_NOT_CLASSIFIED_PASS\n";

/* Attribute-selector representation closure. */
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_ATTRIBUTE_FULL_WIDTH_REJECT',
    '[class~="gflow-inbox"][class~="gflow-grid"][class~="gflow-common"] .ag-row { width: 10px; }',
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_ATTRIBUTE_MIXED_WIDTH_REJECT',
    '.gflow-inbox.gflow-grid[class~="gflow-common"] .ag-row { width: 10px; }',
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_ATTRIBUTE_REORDERED_MIXED_WIDTH_REJECT',
    '[class~="gflow-common"].gflow-grid[class~="gflow-inbox"] .ag-row { width: 10px; }',
    'width'
);
$attribute_paint_errors = gpp_inbox_native_paint_contract_errors( '[class~="gflow-grid"].gflow-inbox[class~="gflow-common"] .ag-row { color: #172033; }' );
gpp_assert_same( array(), $attribute_paint_errors, 'Supported attribute/mixed native-root representation with admitted paint unexpectedly failed: ' . implode( ' | ', $attribute_paint_errors ) );
echo "PRI_FND_001_ATTRIBUTE_ADMITTED_PAINT_PASS\n";

$attribute_incomplete = gpp_inbox_classify_native_selector_member( '[class~="gflow-grid"].gflow-inbox .ag-row' );
gpp_assert_same( 'none', $attribute_incomplete['kind'], 'Incomplete attribute/mixed native Inbox token set was accidentally classified as authentic root.' );
echo "PRI_FND_001_ATTRIBUTE_INCOMPLETE_NOT_CLASSIFIED_PASS\n";

gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_ATTRIBUTE_UNSUPPORTED_FORM_REJECT',
    '[class*="gflow-inbox"].gflow-grid.gflow-common .ag-row { width: 10px; }',
    'unsupported class-token attribute syntax'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_ATTRIBUTE_COMBINED_STYLESHEET_REJECT',
    ".gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; }\n[class~=\"gflow-inbox\"][class~=\"gflow-grid\"][class~=\"gflow-common\"] .ag-cell { width: 10px; }",
    'width'
);

/* Existing pseudo-function fail-closed control remains distinct from real block nesting. */
$nested_root_errors = gpp_inbox_native_paint_contract_errors( ':is(.gflow-grid.gflow-inbox.gflow-common) .ag-row { width: 10px; }' );
gpp_assert_true( false !== strpos( implode( "\n", $nested_root_errors ), 'unsupported nested selector syntax' ), 'Unsupported pseudo-function native-root selector syntax must fail closed.' );
echo "PRI_FND_001_NESTED_NATIVE_ROOT_SYNTAX_REJECT_PASS\n";

/* Real CSS nesting closure. */
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_REAL_NESTED_WIDTH_REJECT',
    ".gflow-inbox.gflow-grid.gflow-common {\n & .ag-row { width: 10px; }\n}",
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_REAL_NESTED_REORDERED_BORDER_WIDTH_REJECT',
    ".gflow-common.gflow-inbox.gflow-grid {\n & .ag-row { border-width: 2px; }\n}",
    'border-width'
);
$nested_paint_errors = gpp_inbox_native_paint_contract_errors(
    ".gflow-grid.gflow-common.gflow-inbox {\n & .ag-row { color: #172033; }\n}"
);
gpp_assert_same( array(), $nested_paint_errors, 'Real nested native selector with admitted paint unexpectedly failed: ' . implode( ' | ', $nested_paint_errors ) );
echo "PRI_FND_001_REAL_NESTED_ADMITTED_PAINT_PASS\n";

gpp_inbox_assert_rejected_with_message(
    'PRI_FND_001_REAL_NESTED_UNRESOLVED_REJECT',
    ".gflow-inbox.gflow-grid.gflow-common {\n .ag-row { width: 10px; }\n}",
    'requires exactly one top-level `&`'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_REAL_NESTED_COMBINED_STYLESHEET_REJECT',
    ".gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; }\n.gflow-inbox.gflow-grid.gflow-common {\n & .ag-cell { width: 10px; }\n}",
    'width'
);

/* @media/context preservation. */
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_MEDIA_FLAT_WIDTH_REJECT',
    "@media (max-width: 782px) {\n .gflow-inbox.gflow-grid.gflow-common .ag-row { width: 10px; }\n}",
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_MEDIA_OUTER_NESTED_WIDTH_REJECT',
    "@media (max-width: 782px) {\n .gflow-inbox.gflow-grid.gflow-common {\n  & .ag-row { width: 10px; }\n }\n}",
    'width'
);
gpp_inbox_assert_rejected_with_property(
    'PRI_FND_001_MEDIA_INSIDE_STYLE_NESTED_WIDTH_REJECT',
    ".gflow-inbox.gflow-grid.gflow-common {\n @media (max-width: 782px) {\n  & .ag-row { width: 10px; }\n }\n}",
    'width'
);
$media_gpp_only = gpp_inbox_native_paint_contract_errors(
    ".gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; }\n@media (max-width: 782px) { .gpp-inbox-surface { padding-inline: 1rem; } }"
);
gpp_assert_same( array(), $media_gpp_only, 'Existing-style GPP-owned @media rule produced a false positive: ' . implode( ' | ', $media_gpp_only ) );
echo "PRI_FND_001_MEDIA_GPP_ONLY_CONTEXT_PASS\n";

$ancestor_errors = gpp_inbox_native_paint_contract_errors( '.unexpected-wrapper .gflow-grid.gflow-common.gflow-inbox .ag-row { color: #172033; }' );
gpp_assert_true( false !== strpos( implode( "\n", $ancestor_errors ), 'Unadmitted ancestor-qualified selector' ), 'Unknown ancestor-qualified native Inbox selector unexpectedly escaped classification.' );
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
gpp_assert_same( array(), gpp_inbox_native_paint_contract_errors( $admitted_fixture ), 'Legitimate admitted native paint/typography/custom-property fixture was rejected.' );
echo "PRI_FND_001_ADMITTED_PAINT_FIXTURE_PASS\n";

$syntax_errors = gpp_inbox_native_paint_contract_errors( '.gflow-inbox.gflow-grid.gflow-common .ag-row { color: #172033; /* unterminated' );
gpp_assert_true( ! empty( $syntax_errors ), 'Unclassifiable CSS syntax must fail closed.' );
echo "PRI_FND_001_UNCLASSIFIABLE_SYNTAX_REJECT_PASS\n";

gpp_inbox_assert_historical_rejection( 'PRI_FND_001_FIXED_WIDTH_HISTORY_REJECT', $shared_css . "\n.gpp-inbox-surface__inner { max-inline-size: 70rem; }", $native_css, '70rem' );
gpp_inbox_assert_historical_rejection( 'PRI_FND_001_BREAKOUT_HISTORY_REJECT', $shared_css . "\n.gpp-inbox-surface--full-width { transform: translateX(1px); }", $native_css, 'transform-based breakout' );
gpp_inbox_assert_historical_rejection( 'PRI_FND_001_CARD_MODE_HISTORY_REJECT', $shared_css . "\n.gpp-inbox-card { color: #172033; }", $native_css, 'Card Mode' );
gpp_inbox_assert_historical_rejection( 'PRI_FND_001_AG_RTL_HISTORY_REJECT', $shared_css . "\n.ag-rtl { color: #172033; }", $native_css, 'AG Grid RTL' );

$focus_mutation_count = 0;
$focus_mutation = preg_replace(
    '/(\.gflow-inbox\.gflow-grid\.gflow-common \[data-js="gflow-inbox-search"\]:focus-visible\s*\{[^}]*outline\s*:\s*)3px/',
    '${1}2px',
    $shared_css,
    1,
    $focus_mutation_count
);
gpp_assert_same( 1, $focus_mutation_count, 'Focus falsification fixture could not mutate the native Search rule.' );
gpp_inbox_assert_historical_rejection( 'PRI_FND_001_FOCUS_HISTORY_REJECT', $focus_mutation, $native_css, 'Native Search lost' );

echo "INBOX_HOST_WIDTH_OWNERSHIP_PASS\n";
