<?php

if ( PHP_SAPI !== 'cli' ) {
    fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_EXTRACTOR_FAIL: CLI only\n" );
    exit( 1 );
}

$root = isset( $argv[1] ) ? $argv[1] : '.';
$source_arg = isset( $argv[2] ) ? $argv[2] : '';
$root_real = realpath( $root );

if ( false === $root_real || '' === $source_arg ) {
    fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_EXTRACTOR_FAIL: usage: php extract-production-references.php <root> <source-file>\n" );
    exit( 1 );
}

$source_path = $root_real . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $source_arg );
if ( ! is_file( $source_path ) ) {
    fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_EXTRACTOR_FAIL: missing source file: {$source_arg}\n" );
    exit( 1 );
}

$known_classes = array();
$src_root = $root_real . DIRECTORY_SEPARATOR . 'src';
$iterator = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $src_root, FilesystemIterator::SKIP_DOTS ) );
foreach ( $iterator as $file_info ) {
    if ( ! $file_info->isFile() || 'php' !== strtolower( $file_info->getExtension() ) ) {
        continue;
    }
    $absolute = $file_info->getPathname();
    $relative = str_replace( DIRECTORY_SEPARATOR, '/', substr( $absolute, strlen( $root_real ) + 1 ) );
    $class_tail = substr( $relative, strlen( 'src/' ), -strlen( '.php' ) );
    $fqcn = 'GravityPresentationProfiles\\' . str_replace( '/', '\\', $class_tail );
    $known_classes[ strtolower( $fqcn ) ] = array( 'class' => $fqcn, 'file' => $relative );
}

$code = file_get_contents( $source_path );
if ( false === $code ) {
    fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_EXTRACTOR_FAIL: could not read source file: {$source_arg}\n" );
    exit( 1 );
}

try {
    $tokens = token_get_all( $code, TOKEN_PARSE );
} catch ( ParseError $e ) {
    fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_EXTRACTOR_FAIL: {$source_arg}: PHP parse error: {$e->getMessage()}\n" );
    exit( 1 );
}

function gpp_token_text( $token ) {
    return is_array( $token ) ? $token[1] : $token;
}

function gpp_is_trivia( $token ) {
    return is_array( $token ) && in_array( $token[0], array( T_WHITESPACE, T_COMMENT, T_DOC_COMMENT ), true );
}

function gpp_next_significant( $tokens, $index ) {
    $count = count( $tokens );
    for ( $i = $index; $i < $count; $i++ ) {
        if ( ! gpp_is_trivia( $tokens[$i] ) ) {
            return $i;
        }
    }
    return null;
}

function gpp_is_name_token_id( $id ) {
    $ids = array( T_STRING );
    foreach ( array( 'T_NAME_QUALIFIED', 'T_NAME_FULLY_QUALIFIED', 'T_NAME_RELATIVE', 'T_NS_SEPARATOR' ) as $constant ) {
        if ( defined( $constant ) ) {
            $ids[] = constant( $constant );
        }
    }
    return in_array( $id, $ids, true );
}

function gpp_read_name( $tokens, $index ) {
    $count = count( $tokens );
    if ( $index >= $count ) {
        return null;
    }

    $text = '';
    $i = $index;
    $consumed = false;

    while ( $i < $count ) {
        $token = $tokens[$i];
        if ( is_array( $token ) && gpp_is_name_token_id( $token[0] ) ) {
            $text .= $token[1];
            $consumed = true;
            $i++;
            continue;
        }
        if ( '\\' === $token ) {
            $text .= '\\';
            $consumed = true;
            $i++;
            continue;
        }
        break;
    }

    return $consumed ? array( $text, $i - 1 ) : null;
}

function gpp_resolve_name( $raw, $namespace, $imports ) {
    $raw = trim( $raw );
    if ( '' === $raw ) {
        return null;
    }

    $lower = strtolower( $raw );
    if ( in_array( $lower, array( 'self', 'static', 'parent' ), true ) ) {
        return null;
    }

    if ( '\\' === $raw[0] ) {
        return ltrim( $raw, '\\' );
    }

    if ( 0 === stripos( $raw, 'namespace\\' ) ) {
        $tail = substr( $raw, strlen( 'namespace\\' ) );
        return '' === $namespace ? $tail : $namespace . '\\' . $tail;
    }

    $parts = explode( '\\', $raw );
    $first = strtolower( $parts[0] );
    if ( isset( $imports[$first] ) ) {
        array_shift( $parts );
        return $imports[$first] . ( $parts ? '\\' . implode( '\\', $parts ) : '' );
    }

    return '' === $namespace ? $raw : $namespace . '\\' . $raw;
}

function gpp_decode_string_literal( $text ) {
    $length = strlen( $text );
    if ( $length < 2 ) {
        return null;
    }
    $quote = $text[0];
    if ( ( "'" !== $quote && '"' !== $quote ) || $text[$length - 1] !== $quote ) {
        return null;
    }
    $body = substr( $text, 1, -1 );
    if ( "'" === $quote ) {
        return str_replace( array( "\\\\", "\\'" ), array( "\\", "'" ), $body );
    }
    return stripcslashes( $body );
}

function gpp_expression_until_semicolon( $tokens, $index ) {
    $expr = array();
    $paren = 0;
    $bracket = 0;
    $brace = 0;
    $count = count( $tokens );
    for ( $i = $index; $i < $count; $i++ ) {
        $token = $tokens[$i];
        if ( ! is_array( $token ) ) {
            if ( '(' === $token ) { $paren++; }
            elseif ( ')' === $token ) { $paren--; }
            elseif ( '[' === $token ) { $bracket++; }
            elseif ( ']' === $token ) { $bracket--; }
            elseif ( '{' === $token ) { $brace++; }
            elseif ( '}' === $token ) { $brace--; }
            elseif ( ';' === $token && 0 === $paren && 0 === $bracket && 0 === $brace ) {
                return array( $expr, $i );
            }
        }
        $expr[] = $token;
    }
    return array( $expr, $count - 1 );
}

function gpp_classify_assignment_expression( $expr ) {
    $significant = array_values( array_filter( $expr, function ( $token ) {
        return ! gpp_is_trivia( $token );
    } ) );

    if ( 1 === count( $significant ) && is_array( $significant[0] ) && T_CONSTANT_ENCAPSED_STRING === $significant[0][0] ) {
        return array(
            'kind'  => 'literal',
            'value' => gpp_decode_string_literal( $significant[0][1] ),
        );
    }

    $contains_repo_prefix = false;
    foreach ( $significant as $token ) {
        if ( is_array( $token ) && T_CONSTANT_ENCAPSED_STRING === $token[0] ) {
            $value = gpp_decode_string_literal( $token[1] );
            if ( is_string( $value ) && false !== strpos( $value, 'GravityPresentationProfiles\\' ) ) {
                $contains_repo_prefix = true;
            }
        }
    }

    return array(
        'kind'                 => 'unknown',
        'contains_repo_prefix' => $contains_repo_prefix,
    );
}

$namespace = '';
$imports = array();
$brace_depth = 0;
$count = count( $tokens );

for ( $i = 0; $i < $count; $i++ ) {
    $token = $tokens[$i];
    if ( ! is_array( $token ) ) {
        if ( '{' === $token ) { $brace_depth++; }
        elseif ( '}' === $token ) { $brace_depth--; }
        continue;
    }

    if ( T_NAMESPACE === $token[0] && 0 === $brace_depth ) {
        $start = gpp_next_significant( $tokens, $i + 1 );
        if ( null !== $start ) {
            $name = gpp_read_name( $tokens, $start );
            if ( null !== $name ) {
                $namespace = ltrim( $name[0], '\\' );
            }
        }
        continue;
    }

    if ( T_USE !== $token[0] || 0 !== $brace_depth ) {
        continue;
    }

    $j = gpp_next_significant( $tokens, $i + 1 );
    if ( null === $j ) {
        continue;
    }
    if ( is_array( $tokens[$j] ) && in_array( $tokens[$j][0], array( T_FUNCTION, T_CONST ), true ) ) {
        while ( $j < $count && ';' !== $tokens[$j] ) { $j++; }
        $i = $j;
        continue;
    }

    $name = '';
    $alias = '';
    $reading_alias = false;
    for ( ; $j < $count; $j++ ) {
        $part = $tokens[$j];
        if ( is_array( $part ) && T_AS === $part[0] ) {
            $reading_alias = true;
            continue;
        }
        if ( ! is_array( $part ) && '{' === $part ) {
            fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_EXTRACTOR_FAIL: {$source_arg}: grouped use declarations are unsupported by the bounded extractor\n" );
            exit( 1 );
        }
        if ( ! is_array( $part ) && ( ',' === $part || ';' === $part ) ) {
            $fqcn = ltrim( trim( $name ), '\\' );
            if ( '' !== $fqcn ) {
                $effective_alias = trim( $alias );
                if ( '' === $effective_alias ) {
                    $segments = explode( '\\', $fqcn );
                    $effective_alias = end( $segments );
                }
                $imports[ strtolower( $effective_alias ) ] = $fqcn;
            }
            $name = '';
            $alias = '';
            $reading_alias = false;
            if ( ';' === $part ) {
                $i = $j;
                break;
            }
            continue;
        }
        if ( gpp_is_trivia( $part ) ) {
            continue;
        }
        $text = gpp_token_text( $part );
        if ( $reading_alias ) {
            $alias .= $text;
        } else {
            $name .= $text;
        }
    }
}

$references = array();
$assignments = array();

$add_reference = function ( $resolved ) use ( &$references, $known_classes ) {
    if ( null === $resolved ) {
        return;
    }
    $key = strtolower( ltrim( $resolved, '\\' ) );
    if ( isset( $known_classes[$key] ) ) {
        $references[$known_classes[$key]['file']] = true;
    }
};

$unsupported_dynamic = function ( $detail ) use ( $source_arg ) {
    fwrite( STDERR, "GPP_PRODUCTION_REACHABILITY_UNSUPPORTED_DYNAMIC: {$source_arg}: {$detail}\n" );
    exit( 2 );
};

$consume_dynamic = function ( $arg_index, $sink ) use ( &$assignments, $tokens, $known_classes, $add_reference, $unsupported_dynamic ) {
    if ( null === $arg_index || ! isset( $tokens[$arg_index] ) ) {
        $unsupported_dynamic( "{$sink} has no analyzable class argument" );
    }
    $arg = $tokens[$arg_index];
    $value = null;

    if ( is_array( $arg ) && T_CONSTANT_ENCAPSED_STRING === $arg[0] ) {
        $value = gpp_decode_string_literal( $arg[1] );
    } elseif ( is_array( $arg ) && T_VARIABLE === $arg[0] ) {
        $var = $arg[1];
        if ( ! isset( $assignments[$var] ) || 'literal' !== $assignments[$var]['kind'] ) {
            $unsupported_dynamic( "{$sink} uses {$var} without a single provable literal class assignment" );
        }
        $value = $assignments[$var]['value'];
    } else {
        $unsupported_dynamic( "{$sink} uses a non-literal/non-local-variable class argument" );
    }

    if ( ! is_string( $value ) || '' === $value ) {
        $unsupported_dynamic( "{$sink} resolved to an empty or invalid class literal" );
    }

    $normalized = ltrim( $value, '\\' );
    $key = strtolower( $normalized );
    if ( isset( $known_classes[$key] ) ) {
        $add_reference( $known_classes[$key]['class'] );
        return;
    }

    if ( 0 === strpos( $normalized, 'GravityPresentationProfiles\\' ) ) {
        $unsupported_dynamic( "{$sink} names repository class {$normalized} but no matching src/*.php file exists" );
    }
};

for ( $i = 0; $i < $count; $i++ ) {
    $token = $tokens[$i];

    if ( is_array( $token ) && T_VARIABLE === $token[0] ) {
        $next = gpp_next_significant( $tokens, $i + 1 );
        if ( null !== $next && '=' === $tokens[$next] ) {
            list( $expr, $end ) = gpp_expression_until_semicolon( $tokens, $next + 1 );
            $classification = gpp_classify_assignment_expression( $expr );
            if ( isset( $assignments[$token[1]] ) ) {
                $classification = array(
                    'kind'                 => 'unknown',
                    'contains_repo_prefix' => ! empty( $classification['contains_repo_prefix'] )
                        || ( isset( $assignments[$token[1]]['value'] ) && false !== strpos( $assignments[$token[1]]['value'], 'GravityPresentationProfiles\\' ) )
                        || ! empty( $assignments[$token[1]]['contains_repo_prefix'] ),
                );
            }
            $assignments[$token[1]] = $classification;
        }

        $double_colon = gpp_next_significant( $tokens, $i + 1 );
        if ( null !== $double_colon && is_array( $tokens[$double_colon] ) && T_DOUBLE_COLON === $tokens[$double_colon][0] ) {
            $consume_dynamic( $i, 'dynamic static class reference' );
        }
        continue;
    }

    if ( is_array( $token ) && in_array( $token[0], array( T_NEW, T_INSTANCEOF ), true ) ) {
        $target = gpp_next_significant( $tokens, $i + 1 );
        if ( null === $target ) {
            continue;
        }
        if ( is_array( $tokens[$target] ) && T_VARIABLE === $tokens[$target][0] ) {
            $consume_dynamic( $target, T_NEW === $token[0] ? 'new $class' : 'instanceof $class' );
            continue;
        }
        $name = gpp_read_name( $tokens, $target );
        if ( null !== $name ) {
            $add_reference( gpp_resolve_name( $name[0], $namespace, $imports ) );
        }
        continue;
    }

    if ( is_array( $token ) && T_EXTENDS === $token[0] ) {
        $target = gpp_next_significant( $tokens, $i + 1 );
        $name = null === $target ? null : gpp_read_name( $tokens, $target );
        if ( null !== $name ) {
            $add_reference( gpp_resolve_name( $name[0], $namespace, $imports ) );
        }
        continue;
    }

    if ( is_array( $token ) && T_IMPLEMENTS === $token[0] ) {
        $j = gpp_next_significant( $tokens, $i + 1 );
        while ( null !== $j && $j < $count && '{' !== $tokens[$j] ) {
            $name = gpp_read_name( $tokens, $j );
            if ( null !== $name ) {
                $add_reference( gpp_resolve_name( $name[0], $namespace, $imports ) );
                $j = gpp_next_significant( $tokens, $name[1] + 1 );
                if ( null !== $j && ',' === $tokens[$j] ) {
                    $j = gpp_next_significant( $tokens, $j + 1 );
                }
                continue;
            }
            break;
        }
        continue;
    }

    if ( is_array( $token ) && gpp_is_name_token_id( $token[0] ) ) {
        $name = gpp_read_name( $tokens, $i );
        if ( null === $name ) {
            continue;
        }
        $after = gpp_next_significant( $tokens, $name[1] + 1 );

        if ( null !== $after && is_array( $tokens[$after] ) && T_DOUBLE_COLON === $tokens[$after][0] ) {
            $resolved = gpp_resolve_name( $name[0], $namespace, $imports );
            $add_reference( $resolved );

            $method_index = gpp_next_significant( $tokens, $after + 1 );
            $open_index = null === $method_index ? null : gpp_next_significant( $tokens, $method_index + 1 );
            $method_name = null;
            if ( null !== $method_index && is_array( $tokens[$method_index] ) && T_STRING === $tokens[$method_index][0] ) {
                $method_name = strtolower( $tokens[$method_index][1] );
            }
            $normalized_static = null === $resolved ? ltrim( $name[0], '\\' ) : ltrim( $resolved, '\\' );
            if ( 'gfaddon' === strtolower( $normalized_static ) && 'register' === $method_name && null !== $open_index && '(' === $tokens[$open_index] ) {
                $arg = gpp_next_significant( $tokens, $open_index + 1 );
                $consume_dynamic( $arg, 'GFAddOn::register()' );
            }
            $i = $name[1];
            continue;
        }

        if ( null !== $after && '(' === $tokens[$after] ) {
            $function_name = strtolower( ltrim( $name[0], '\\' ) );
            if ( in_array( $function_name, array( 'class_exists', 'interface_exists', 'trait_exists' ), true ) ) {
                $arg = gpp_next_significant( $tokens, $after + 1 );
                $consume_dynamic( $arg, $function_name . '()' );
            }
        }

        $i = $name[1];
    }
}

ksort( $references, SORT_STRING );
foreach ( array_keys( $references ) as $file ) {
    echo $file, "\n";
}
