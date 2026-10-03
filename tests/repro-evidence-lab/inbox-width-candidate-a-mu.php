<?php
/** Ephemeral WU21 lab attachment, never installed by the product. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

add_filter( 'gravityflow_js_config_shared', static function ( $config ) {
    $lab = get_option( 'gpp_width_candidate_a_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true ) ) { return $config; }
    if ( isset( $_GET['width_lab_empty'] ) && isset( $config['grids'] ) ) {
        foreach ( $config['grids'] as &$grid ) { $grid['grid_options']['rowData'] = array(); }
        unset( $grid );
    }
    return $config;
}, 999 );

add_action( 'wp_print_footer_scripts', static function () {
    $lab = get_option( 'gpp_width_candidate_a_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true )
        || ! class_exists( 'Gravity_Flow' ) || ! wp_script_is( Gravity_Flow::THEME_JS, 'enqueued' ) ) { return; }
    $script = file_get_contents( $lab['observer_path'] );
    if ( false === $script ) { throw new RuntimeException( 'Qualification observer unreadable.' ); }
    $prefix = 'window.__gppWidthLab = ' . wp_json_encode( array( 'phase' => 'OBSERVATION_ONLY' ) ) . ';';
    // The test-only fixture installs a real function BEFORE observer inspection.
    if ( isset( $_GET['width_lab_compose'] ) ) {
        $prefix .= <<<'JS'
window.__gppWidthPrior = [];
for (const [id, grid] of Object.entries(gflow_config.grids)) {
    for (const name of ['onColumnEverythingChanged','onFirstDataRendered','onGridSizeChanged']) {
        if (grid.grid_options[name] != null) throw new Error('Fixture refuses to overwrite existing callback');
        grid.grid_options[name] = function () {
            window.__gppWidthPrior.push({name, argument_count: arguments.length,
                this_probe: this && this.probe === 'this-preserved', argument_probe: arguments[1] === 'argument-preserved'});
            return 'prior-return';
        };
    }
}
JS;
    }
    if ( ! wp_add_inline_script( Gravity_Flow::THEME_JS, $prefix . $script, 'before' ) ) {
        throw new RuntimeException( 'Qualification inline attachment failed.' );
    }
}, 0 );
