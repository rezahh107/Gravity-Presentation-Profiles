<?php
/** Ephemeral WU21 production-verification harness; never installed by GPP. */
if ( ! defined( 'ABSPATH' ) ) { exit( 1 ); }

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
            $grid['fetch_enabled'] = true;
            $grid['fetch_interval'] = 1;
        }
        unset( $grid );
    }
    if ( isset( $_GET['width_lab_empty'] ) && isset( $config['grids'] ) ) {
        foreach ( $config['grids'] as &$grid ) {
            $grid['grid_options']['rowData'] = array();
        }
        unset( $grid );
    }
    if ( isset( $_GET['width_lab_wrong_columns'] ) && isset( $config['grids'] ) ) {
        foreach ( $config['grids'] as &$grid ) {
            if ( empty( $grid['grid_options']['columnDefs'] ) || ! is_array( $grid['grid_options']['columnDefs'] ) ) {
                continue;
            }
            $index = array_key_last( $grid['grid_options']['columnDefs'] );
            $grid['grid_options']['columnDefs'][ $index ]['field'] = 'gpp_unrelated_column';
            $grid['grid_options']['columnDefs'][ $index ]['colId'] = 'gpp_unrelated_column';
        }
        unset( $grid );
    }
    return $config;
}, 999 );

/**
 * Install only test observers/controls and a known prior callback before the
 * product's priority-0 attachment. The production Candidate C code itself is
 * never copied into this MU plugin.
 */
add_action( 'wp_print_footer_scripts', static function () {
    $lab = get_option( 'gpp_width_candidate_d_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true )
        || ! class_exists( 'Gravity_Flow' ) || ! wp_script_is( Gravity_Flow::THEME_JS, 'enqueued' ) ) { return; }

    $observer = file_get_contents( $lab['observer_path'] );
    $controls = file_get_contents( dirname( $lab['observer_path'] ) . '/inbox-width-candidate-d-controls.js' );
    if ( false === $observer || false === $controls ) {
        throw new RuntimeException( 'Candidate C production verification observer/control unreadable.' );
    }

    $prefix = 'window.__gppWidthLab = ' . wp_json_encode( array(
        'phase' => 'PRODUCTION_IMPLEMENTATION_VERIFICATION',
        'accepted_ids' => $lab['accepted_ids'],
        'discriminator' => isset( $_GET['width_lab_discriminator'] ),
        'control' => isset( $_GET['width_lab_startup'] ) ? 'startup' : null,
        'seeded' => isset( $_GET['width_lab_seeded'] ),
        'control_state' => $lab['control_state'] ?? null,
    ) ) . ';';

    if ( isset( $_GET['width_lab_fake_wrapper'] ) ) {
        $prefix .= <<<'JS'
for (const root of document.querySelectorAll('[data-js="gflow-inbox"]')) {
    if (root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) continue;
    const wrapper=document.createElement('div');
    wrapper.setAttribute('data-gpp-inbox-surface','gravity_flow.inbox');
    root.parentNode.insertBefore(wrapper,root);
    wrapper.appendChild(root);
}
JS;
    }

    if ( isset( $_GET['width_lab_discriminator'] ) ) {
        $prefix .= $controls;
    }

    $prefix .= <<<'JS'
window.__gppWidthPrior = [];
for (const [id, grid] of Object.entries(gflow_config.grids)) {
    for (const name of ['onColumnEverythingChanged','onFirstDataRendered','onGridSizeChanged']) {
        const prior=grid.grid_options[name];
        if(prior!=null&&typeof prior!=="function")throw new Error('Fixture refuses non-callable callback');
        grid.grid_options[name] = function () {
            const result=typeof prior==="function"?Reflect.apply(prior,this,arguments):undefined;
            window.__gppWidthPrior.push({name, argument_count: arguments.length,
                this_probe: this && this.probe === 'this-preserved', argument_probe: arguments[1] === 'argument-preserved',
                native_this_api: !!(this && arguments[0] && arguments[0].api && this.api === arguments[0].api)});
            return result===undefined?'prior-return':result;
        };
    }
}
JS;

    if ( isset( $_GET['width_lab_before_guard'] ) ) {
        $prefix .= 'for (const grid of Object.values(gflow_config.grids)) { const prior=grid.grid_options.onGridSizeChanged; let done=false; grid.grid_options.onGridSizeChanged=function(){ const result=typeof prior==="function" ? Reflect.apply(prior,this,arguments):undefined; if(!done){done=true;window.__gppWidthControl.run("unrelated_before_geometry_guard",' . wp_json_encode( $lab['control_state'] ) . ');} return result; }; }';
    }

    $prefix .= $observer;
    $prefix .= <<<'JS'
window.__gppWidthPreProduct = {};
for (const [id, grid] of Object.entries(gflow_config.grids)) {
    window.__gppWidthPreProduct[id] = grid.grid_options.onGridSizeChanged;
}
JS;

    if ( ! wp_add_inline_script( Gravity_Flow::THEME_JS, $prefix, 'before' ) ) {
        throw new RuntimeException( 'Candidate C production pre-product probe attachment failed.' );
    }
}, -1 );

/**
 * Run after the product priority-0 action but still before native Grid
 * construction. This wrapper is observation-only: it proves whether GPP
 * composed the callback and records the native return/receiver. Repair
 * attribution uses the public observer timestamps: a native sizeColumnsToFit
 * event belongs to the Grid-size delivery whose interval contains that event.
 * This separates startup host sizing (before the callback) from Candidate C
 * sizing without assuming synchronous listener delivery or an arbitrary delay.
 */
add_action( 'wp_print_footer_scripts', static function () {
    $lab = get_option( 'gpp_width_candidate_d_lab' );
    if ( ! is_array( $lab ) || ! in_array( get_queried_object_id(), $lab['pages'], true )
        || ! class_exists( 'Gravity_Flow' ) || ! wp_script_is( Gravity_Flow::THEME_JS, 'enqueued' ) ) { return; }

    $probe = <<<'JS'
const production=window.__gppCandidateCProduction={mode:'PRODUCTION_IMPLEMENTATION',attachment:[],deliveries:[]};
const repairedDuring=delivery=>{
    const report=window.__gppWidthQualification;
    if(!report||!Array.isArray(report.resize_events)) return false;
    const index=production.deliveries.indexOf(delivery);
    const next=index>=0 ? production.deliveries[index+1] : null;
    const end=next ? next.started_at : Infinity;
    return report.resize_events.some(event=>event.source==='sizeColumnsToFit'
        && Number.isFinite(event.at) && event.at>=delivery.started_at && event.at<end);
};
Object.defineProperty(production,'repair_count',{enumerable:true,get(){
    return this.deliveries.filter(repairedDuring).length;
}});
for (const [id, grid] of Object.entries(gflow_config.grids)) {
    const options=grid.grid_options;
    const before=window.__gppWidthPreProduct && window.__gppWidthPreProduct[id];
    const current=options.onGridSizeChanged;
    const attached=typeof current==='function' && current!==before;
    production.attachment.push({grid_id:id,attached,before_type:typeof before,after_type:typeof current});
    if(!attached) continue;
    options.onGridSizeChanged=function(){
        const args=arguments,params=args[0];
        const delivery={grid_id:id,threw:false,previous_return:null,argument_count:args.length,
            this_api:!!(this&&params&&params.api&&this.api===params.api),type:params&&params.type||null,
            started_at:performance.now()};
        Object.defineProperty(delivery,'repaired',{enumerable:true,get(){return repairedDuring(delivery);}});
        let result;
        try { result=Reflect.apply(current,this,args); }
        catch(error) {
            delivery.threw=true;
            delivery.error=String(error);
            production.deliveries.push(delivery);
            throw error;
        }
        delivery.previous_return=result===undefined?null:String(result);
        production.deliveries.push(delivery);
        return result;
    };
}
JS;

    if ( ! wp_add_inline_script( Gravity_Flow::THEME_JS, $probe, 'before' ) ) {
        throw new RuntimeException( 'Candidate C production post-product probe attachment failed.' );
    }
}, 1 );
