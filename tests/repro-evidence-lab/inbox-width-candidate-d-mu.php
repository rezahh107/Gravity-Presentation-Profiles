<?php
/** Ephemeral WU21 lab attachment, never installed by the product. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

// Reuse the established WU21 presentation-direction fixture technique on the
// explicit temporary lab pages. No AG Grid enableRtl or production CSS changes.
add_action( 'wp', static function () {
    $lab = get_option( 'gpp_width_candidate_d_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true ) ) { return; }
    global $wp_locale;
    if ( is_object( $wp_locale ) ) { $wp_locale->text_direction = 'rtl'; }
}, PHP_INT_MIN );

add_filter( 'gravityflow_js_config_shared', static function ( $config ) {
    $lab = get_option( 'gpp_width_candidate_d_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true ) ) { return $config; }
    if ( isset( $_GET['width_lab_live'] ) && isset( $config['grids'] ) ) {
        foreach ( $config['grids'] as &$grid ) {
            $grid['fetch_enabled'] = true; $grid['fetch_interval'] = 1;
        }
        unset( $grid );
    }
    if ( isset( $_GET['width_lab_empty'] ) && isset( $config['grids'] ) ) {
        foreach ( $config['grids'] as &$grid ) { $grid['grid_options']['rowData'] = array(); }
        unset( $grid );
    }
    return $config;
}, 999 );

add_action( 'wp_print_footer_scripts', static function () {
    $lab = get_option( 'gpp_width_candidate_d_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true )
        || ! class_exists( 'Gravity_Flow' ) || ! wp_script_is( Gravity_Flow::THEME_JS, 'enqueued' ) ) { return; }
    $script = file_get_contents( $lab['observer_path'] );
    if ( false === $script ) { throw new RuntimeException( 'Qualification observer unreadable.' ); }
    $prefix = 'window.__gppWidthLab = ' . wp_json_encode( array(
        'phase' => 'OBSERVATION_ONLY',
        'discriminator' => isset( $_GET['width_lab_discriminator'] ),
        'control' => isset( $_GET['width_lab_startup'] ) ? 'startup' : null,
        'seeded' => isset( $_GET['width_lab_seeded'] ),
        'control_state' => $lab['control_state'] ?? null,
    ) ) . ';';
    if ( isset( $_GET['width_lab_discriminator'] ) ) {
        $controls = file_get_contents( dirname( $lab['observer_path'] ) . '/inbox-width-candidate-d-controls.js' );
        if ( false === $controls ) { throw new RuntimeException( 'Qualification controls unreadable.' ); }
        $prefix .= $controls;
    }
    // The test-only fixture installs a real function BEFORE observer inspection.
    if ( isset( $_GET['width_lab_compose'] ) ) {
        $prefix .= <<<'JS'
window.__gppWidthPrior = [];
for (const [id, grid] of Object.entries(gflow_config.grids)) {
    for (const name of ['onColumnEverythingChanged','onFirstDataRendered','onGridSizeChanged']) {
        if (grid.grid_options[name] != null) throw new Error('Fixture refuses to overwrite existing callback');
        grid.grid_options[name] = function () {
            window.__gppWidthPrior.push({name, argument_count: arguments.length,
                this_probe: this && this.probe === 'this-preserved', argument_probe: arguments[1] === 'argument-preserved',
                native_this_api: !!(this && arguments[0] && arguments[0].api && this.api === arguments[0].api)});
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
