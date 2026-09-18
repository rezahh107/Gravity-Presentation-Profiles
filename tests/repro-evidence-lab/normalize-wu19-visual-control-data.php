<?php
if ( ! defined( 'ABSPATH' ) ) exit( 1 );

/**
 * Keep WU19's historical Print E/F structural comparator on its admitted
 * synthetic content envelope after WU18 moved to the current Operations
 * Package. This changes only test entry values; it does not install a visual
 * package, alter bindings, or create a direct student.full_name source.
 */
$wu18 = get_option( 'gpp_wu18_fixture_manifest' );
if ( ! is_array( $wu18 ) || empty( $wu18['alpha']['fields'] ) || empty( $wu18['beta']['fields'] ) ) {
    throw new RuntimeException( 'WU19 visual control normalization requires current WU18 fixtures.' );
}

function wu19_normalize_current_components( $item, $first, $last ) {
    $fields = $item['fields'];
    foreach ( array( 'student.first_name', 'student.last_name', 'education.grade_group' ) as $slot ) {
        if ( empty( $fields[ $slot ] ) ) {
            throw new RuntimeException( 'WU19 visual control field missing: ' . $slot );
        }
    }

    $values = array(
        'student.first_name' => $first,
        'student.last_name' => $last,
        'education.grade_group' => 'پایه دهم',
    );
    foreach ( $values as $slot => $value ) {
        $result = GFAPI::update_entry_field( (int) $item['entry_id'], $fields[ $slot ], $value );
        if ( is_wp_error( $result ) ) {
            throw new RuntimeException( $result->get_error_message() );
        }
    }

    $entry = GFAPI::get_entry( (int) $item['entry_id'] );
    if ( is_wp_error( $entry ) ) {
        throw new RuntimeException( $entry->get_error_message() );
    }
    foreach ( $values as $slot => $expected ) {
        $actual = isset( $entry[ (string) $fields[ $slot ] ] ) ? (string) $entry[ (string) $fields[ $slot ] ] : '';
        if ( $expected !== $actual ) {
            throw new RuntimeException( 'WU19 visual control normalization did not persist ' . $slot );
        }
    }
}

wu19_normalize_current_components( $wu18['alpha'], 'Alpha First', 'Alpha Last' );
wu19_normalize_current_components( $wu18['beta'], 'Beta First', 'Beta Last' );

echo "WU19 visual control data normalized without direct full-name authority.\n";
