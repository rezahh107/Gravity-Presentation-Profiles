<?php
if ( PHP_SAPI !== 'cli' ) {
    exit( 1 );
}

$mode      = isset( $argv[1] ) ? $argv[1] : '';
$html_path = isset( $argv[2] ) ? $argv[2] : '';
$fixture   = isset( $argv[3] ) ? json_decode( (string) file_get_contents( $argv[3] ), true ) : null;
if ( ! in_array( $mode, array( 'setup', 'inbox', 'entry', 'repair', 'print-option' ), true ) || ! is_file( $html_path ) || ! is_array( $fixture ) ) {
    fwrite( STDERR, "Usage: behavioral-http-form.php <setup|inbox|entry|repair|print-option> <settings.html> <fixture.json> [slot] [host-field-key]\n" );
    exit( 1 );
}

libxml_use_internal_errors( true );
$dom = new DOMDocument();
if ( ! $dom->loadHTML( (string) file_get_contents( $html_path ) ) ) {
    fwrite( STDERR, "Unable to parse Gravity Forms settings HTML.\n" );
    exit( 1 );
}
$xpath      = new DOMXPath( $dom );
$form_nodes = $xpath->query( '//form[.//input[@name="gform_settings_save_nonce"]]' );
if ( 1 !== $form_nodes->length ) {
    fwrite( STDERR, "Exactly one Gravity Forms settings form with nonce was expected.\n" );
    exit( 1 );
}
$form   = $form_nodes->item( 0 );
$fields = array();

foreach ( $xpath->query( './/input', $form ) as $input ) {
    $name = $input->getAttribute( 'name' );
    if ( '' === $name || $input->hasAttribute( 'disabled' ) ) {
        continue;
    }
    $type = strtolower( $input->getAttribute( 'type' ) );
    if ( in_array( $type, array( 'submit', 'button', 'image', 'file' ), true ) ) {
        continue;
    }
    if ( in_array( $type, array( 'checkbox', 'radio' ), true ) && ! $input->hasAttribute( 'checked' ) ) {
        continue;
    }
    $fields[ $name ] = $input->getAttribute( 'value' );
}
foreach ( $xpath->query( './/textarea', $form ) as $textarea ) {
    $name = $textarea->getAttribute( 'name' );
    if ( '' !== $name && ! $textarea->hasAttribute( 'disabled' ) ) {
        $fields[ $name ] = $textarea->textContent;
    }
}
foreach ( $xpath->query( './/select', $form ) as $select ) {
    $name = $select->getAttribute( 'name' );
    if ( '' === $name || $select->hasAttribute( 'disabled' ) ) {
        continue;
    }
    $selected = null;
    foreach ( $xpath->query( './option', $select ) as $option ) {
        if ( $option->hasAttribute( 'selected' ) ) {
            $selected = $option->getAttribute( 'value' );
            break;
        }
    }
    if ( null === $selected ) {
        $first    = $xpath->query( './option', $select )->item( 0 );
        $selected = $first ? $first->getAttribute( 'value' ) : '';
    }
    $fields[ $name ] = $selected;
}

if ( in_array( $mode, array( 'setup', 'inbox', 'entry' ), true ) ) {
    $wanted       = 'form:' . (int) $fixture['form_id'];
    $field_suffix = 'setup' === $mode ? 'operations_setup_action' : ( 'inbox' === $mode ? 'inbox_setup_action' : 'entry_detail_setup_action' );
    $matched      = false;
    foreach ( $xpath->query( './/select[contains(@name,"' . $field_suffix . '")]', $form ) as $select ) {
        foreach ( $xpath->query( './option', $select ) as $option ) {
            if ( $option->getAttribute( 'value' ) === $wanted ) {
                $name = $select->getAttribute( 'name' );
                if ( '' === $name ) {
                    throw new RuntimeException( ucfirst( $mode ) . ' Setup select has no submitted name.' );
                }
                $fields[ $name ] = $wanted;
                $matched = true;
                break 2;
            }
        }
    }
    if ( ! $matched ) {
        throw new RuntimeException( 'Exact synthetic form is not offered by ' . ucfirst( $mode ) . ' Setup.' );
    }
    $submit = $xpath->query( './/input[@type="submit" and not(@name="gpp_binding_row_action")] | .//button[@type="submit" and not(@name="gpp_binding_row_action")]', $form )->item( 0 );
    if ( ! $submit ) {
        throw new RuntimeException( 'Gravity Forms settings Save control was not found.' );
    }
    if ( '' !== $submit->getAttribute( 'name' ) ) {
        $fields[ $submit->getAttribute( 'name' ) ] = $submit->getAttribute( 'value' );
    }
} else {
    $slot = isset( $argv[4] ) ? (string) $argv[4] : 'student.first_name';
    $field_key = isset( $argv[5] ) ? (string) $argv[5] : 'first_name';
    $allowed = array(
        'student.first_name' => array( 'first_name' ),
        'student.last_name' => array( 'last_name' ),
        'student.home_phone' => array( 'empty_phone', 'replacement_empty_phone' ),
        'student.gender' => array( 'choice', 'alternate_choice' ),
    );
    if ( ! isset( $allowed[ $slot ] ) || ( 'repair' === $mode && ! in_array( $field_key, $allowed[ $slot ], true ) ) || ( 'print-option' === $mode && 'student.gender' !== $slot ) ) {
        throw new RuntimeException( 'The requested synthetic semantic mapping is outside the admitted connected Print cases.' );
    }
    $row  = null;
    foreach ( $xpath->query( './/tr[@data-gpp-semantic-slot]' ) as $candidate ) {
        if ( $candidate->getAttribute( 'data-gpp-semantic-slot' ) === $slot ) {
            $row = $candidate;
            break;
        }
    }
    if ( ! $row ) {
        throw new RuntimeException( 'student.first_name Mapping & Binding Health row was not found.' );
    }
    if ( 'print-option' === $mode ) {
        $expected = $fixture['expected_choice'];
        $option_row = null;
        foreach ( $xpath->query( './/*[contains(concat(" ",normalize-space(@class)," ")," gpp-print-option-row ")]', $row ) as $candidate ) {
            $code = $xpath->query( './code', $candidate )->item( 0 );
            if ( $code && trim( $code->textContent ) === $expected['canonical_option'] ) {
                $option_row = $candidate;
                break;
            }
        }
        if ( ! $option_row ) {
            throw new RuntimeException( 'The canonical Print choice control was not offered by the shipped UI.' );
        }
        $select = $xpath->query( './/select[starts-with(@name,"gpp_binding_row[")]', $option_row )->item( 0 );
        $button = $xpath->query( './/button[@name="gpp_binding_row_action"]', $option_row )->item( 0 );
        $choice_text = $expected['host_display_value'] . ' — raw: ' . $expected['host_raw_value'];
        $selected = null;
        foreach ( $xpath->query( './option', $select ) as $option ) {
            $label = preg_replace( '/\\s+/u', ' ', trim( $option->textContent ) );
            if ( $label === $choice_text ) {
                $selected = $option->getAttribute( 'value' );
                break;
            }
        }
    } else {
        $select = $xpath->query( './/select[starts-with(@name,"gpp_binding_row[")]', $row )->item( 0 );
        $button = $xpath->query( './/button[@name="gpp_binding_row_action"]', $row )->item( 0 );
        $field_id = (string) $fixture['fields'][ $field_key ]['id'];
        $selected = null;
        foreach ( $xpath->query( './option', $select ) as $option ) {
            $text = preg_replace( '/\\s+/u', ' ', trim( $option->textContent ) );
            if ( false !== strpos( $text, 'Field ' . $field_id ) && false !== strpos( $text, $fixture['fields'][ $field_key ]['label'] ) ) {
                $selected = $option->getAttribute( 'value' );
                break;
            }
        }
    }
    if ( ! $select || ! $button || null === $selected || '' === $selected ) {
        throw new RuntimeException( 'The exact host-backed mapping/choice confirmation is not available on the shipped admin form.' );
    }
    $fields[ $select->getAttribute( 'name' ) ] = $selected;
    $fields['gpp_binding_row_action'] = $button->getAttribute( 'value' );
}

if ( empty( $fields['gform_settings_save_nonce'] ) ) {
    throw new RuntimeException( 'Gravity Forms settings nonce is missing from qualifying request.' );
}

echo http_build_query( $fields, '', '&', PHP_QUERY_RFC3986 );
