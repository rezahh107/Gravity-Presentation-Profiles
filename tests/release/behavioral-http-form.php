<?php
if ( PHP_SAPI !== 'cli' ) {
    exit( 1 );
}

$mode      = isset( $argv[1] ) ? $argv[1] : '';
$html_path = isset( $argv[2] ) ? $argv[2] : '';
$fixture   = isset( $argv[3] ) ? json_decode( (string) file_get_contents( $argv[3] ), true ) : null;
if ( ! in_array( $mode, array( 'setup', 'repair' ), true ) || ! is_file( $html_path ) || ! is_array( $fixture ) ) {
    fwrite( STDERR, "Usage: behavioral-http-form.php <setup|repair> <settings.html> <fixture.json>\n" );
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

if ( 'setup' === $mode ) {
    $wanted  = 'form:' . (int) $fixture['form_id'];
    $matched = false;
    foreach ( $xpath->query( './/select', $form ) as $select ) {
        foreach ( $xpath->query( './option', $select ) as $option ) {
            if ( $option->getAttribute( 'value' ) === $wanted ) {
                $name = $select->getAttribute( 'name' );
                if ( '' === $name ) {
                    throw new RuntimeException( 'Operations Setup select has no submitted name.' );
                }
                $fields[ $name ] = $wanted;
                $matched = true;
                break 2;
            }
        }
    }
    if ( ! $matched ) {
        throw new RuntimeException( 'Exact synthetic form is not offered by Operations Setup.' );
    }
    $submit = $xpath->query( './/input[@type="submit" and not(@name="gpp_binding_row_action")] | .//button[@type="submit" and not(@name="gpp_binding_row_action")]', $form )->item( 0 );
    if ( ! $submit ) {
        throw new RuntimeException( 'Gravity Forms settings Save control was not found.' );
    }
    if ( '' !== $submit->getAttribute( 'name' ) ) {
        $fields[ $submit->getAttribute( 'name' ) ] = $submit->getAttribute( 'value' );
    }
} else {
    $slot = 'student.first_name';
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
    $select = $xpath->query( './/select[starts-with(@name,"gpp_binding_row[")]', $row )->item( 0 );
    $button = $xpath->query( './/button[@name="gpp_binding_row_action"]', $row )->item( 0 );
    if ( ! $select || ! $button ) {
        throw new RuntimeException( 'Exact row Mapping controls were not found.' );
    }
    $field_id = (string) $fixture['fields']['first_name']['id'];
    $selected = null;
    foreach ( $xpath->query( './option', $select ) as $option ) {
        $text = preg_replace( '/\s+/u', ' ', trim( $option->textContent ) );
        if ( false !== strpos( $text, 'Field ' . $field_id ) && false !== strpos( $text, 'Behavioral First Name' ) ) {
            $selected = $option->getAttribute( 'value' );
            break;
        }
    }
    if ( null === $selected || '' === $selected ) {
        throw new RuntimeException( 'Exact real first-name field is not offered on its semantic row.' );
    }
    $fields[ $select->getAttribute( 'name' ) ] = $selected;
    $fields['gpp_binding_row_action'] = $button->getAttribute( 'value' );
}

if ( empty( $fields['gform_settings_save_nonce'] ) ) {
    throw new RuntimeException( 'Gravity Forms settings nonce is missing from qualifying request.' );
}

echo http_build_query( $fields, '', '&', PHP_QUERY_RFC3986 );
