/* Bounded lab controls. Public APIs only; not loaded by the product. */
(function () {
    'use strict';
    const settings = window.__gppWidthLab;
    const origins = new WeakMap();
    const trace = [];
    const pending = [];
    let active = null, owner = null, run, inspect;
    function bind(id, params) {
        if (!params || !params.api || !params.columnApi) return;
        if (owner !== null) {
            if (owner !== id) throw new Error('Control refuses multiple grids');
            return;
        }
        owner = id;
        const columns = params.columnApi;
        // Public listener registered from the public row-height option before
        // ready dispatch when rows exist. No synchronous/private event service.
        params.api.addEventListener('gridReady', event => {
            const report = window.__gppWidthQualification;
            if (report) report.events.push({sequence:report.events.length,callback:'earlyPublicGridReady',
                at:performance.now(),event_type:event.type,source:event.source||null,
                event_keys:Object.keys(event).sort(),state:columns.getColumnState(),
                row_count:params.api.getDisplayedRowCount()});
        });
        params.api.addEventListener('columnEverythingChanged', event => {
            const origin = event.source === 'api' && pending.length ? pending.shift()
                : (settings.seeded ? 'native_restore_fixture' : 'unattributed');
            origins.set(event, origin);
            trace.push({kind:'public_listener_delivery', origin, at:performance.now(), type:event.type,
                source:event.source, keys:Object.keys(event).sort(), state:columns.getColumnState()});
        });
        inspect = () => ({state:columns.getColumnState(), rows:params.api.getDisplayedRowCount()});
        run = (label, requestedState) => {
            if (active) throw new Error('Reentrant control');
            const before = columns.getColumnState();
            active = label;
            pending.push(label);
            trace.push({kind:'begin', origin:label, at:performance.now(), before});
            try {
                const accepted = columns.applyColumnState({state:requestedState || before, applyOrder:true});
                trace.push({kind:'end', origin:label, at:performance.now(), accepted,
                    after:columns.getColumnState()});
                return accepted;
            } finally { active = null; }
        };
    }
    window.__gppWidthControl = {
        run: (label, state) => { if (!run) throw new Error('Public control not bound'); return run(label, state); },
        inspect: () => inspect && inspect(), trace,
        origin: event => origins.get(event) || (settings.seeded && event.source === 'api'
            ? 'native_restore_fixture' : 'native_non_restore')
    };
    for (const [id, grid] of Object.entries(gflow_config.grids)) {
        const options = grid.grid_options;
        const priorHeight = options.getRowHeight;
        if (priorHeight != null && typeof priorHeight !== 'function') throw new Error('Non-callable row-height callback');
        let startupFired = false;
        options.getRowHeight = function (params) {
            bind(id, {api:params.api, columnApi:this && this.columnApi});
            if (settings.control === 'startup' && !startupFired && run) {
                startupFired = true;
                run('unrelated_startup', settings.control_state);
            }
            return typeof priorHeight === 'function' ? Reflect.apply(priorHeight, this, arguments) : undefined;
        };
        const priorEverything = options.onColumnEverythingChanged;
        if (priorEverything != null && typeof priorEverything !== 'function') throw new Error('Non-callable column callback');
        options.onColumnEverythingChanged = function (params) {
            bind(id, params);
            if (settings.control === 'startup' && !startupFired && run && params.source === 'gridInitializing') {
                startupFired = true;
                run('unrelated_startup', settings.control_state);
            }
            return typeof priorEverything === 'function' ? Reflect.apply(priorEverything, this, arguments) : undefined;
        };
    }
})();
