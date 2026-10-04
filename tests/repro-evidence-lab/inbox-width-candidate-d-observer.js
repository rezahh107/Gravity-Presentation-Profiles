/* Qualification only. No sizing, storage, DOM, or post-mount config writes. */
(function () {
    'use strict';
    const report = window.__gppWidthQualification = {
        phase: 'OBSERVATION_ONLY', attachment: [], events: [], resize_events: [], repair_count: 0,
        installed_at: performance.now(), config_present: !!window.gflow_config,
        function_was_attached_before_mount: false
    };
    const names = ['onColumnEverythingChanged', 'onFirstDataRendered', 'onGridSizeChanged', 'onNewColumnsLoaded', 'onDisplayedColumnsChanged', 'onRowDataChanged', 'onRowDataUpdated'];
    const settings = window.__gppWidthLab;
    const scope = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    if (!settings || !scope || !window.gflow_config || !gflow_config.grids) {
        report.failure = 'Missing lab settings, active profile wrapper, or localized config';
        return;
    }
    function snapshot(id, params) {
        const root = [...scope.querySelectorAll('[data-js="gflow-inbox"]')].find(n => n.dataset.gridId === id);
        const metric = selector => {
            const node = root && root.querySelector(selector);
            if (!node) return null;
            return {clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
                rectWidth: node.getBoundingClientRect().width, direction: getComputedStyle(node).direction};
        };
        const api = params && params.api, columns = params && params.columnApi;
        const displayed = columns && typeof columns.getAllDisplayedColumns === 'function'
            ? columns.getAllDisplayedColumns().map(c => ({id: c.getColId(), width: c.getActualWidth(),
                pinned: c.getPinned(), flex: typeof c.getFlex === 'function' ? c.getFlex() : null,
                minWidth: c.getMinWidth(), maxWidth: c.getMaxWidth(),
                suppressSizeToFit: !!c.getColDef().suppressSizeToFit})) : [];
        const center = metric('.ag-center-cols-viewport');
        return {grid_id: id, displayed, displayed_width: displayed.reduce((s,c) => s+c.width,0),
            state: columns && typeof columns.getColumnState === 'function' ? columns.getColumnState() : null,
            api_available: !!api, column_api_available: !!columns,
            row_count: api && typeof api.getDisplayedRowCount === 'function' ? api.getDisplayedRowCount() : null,
            pixel_range: api && typeof api.getHorizontalPixelRange === 'function' ? api.getHorizontalPixelRange() : null,
            center_viewport: center, center_container: metric('.ag-center-cols-container'),
            body_viewport: metric('.ag-body-viewport'), horizontal_scroll: metric('.ag-body-horizontal-scroll-viewport'),
            pinned_left: metric('.ag-pinned-left-cols-container'), pinned_right: metric('.ag-pinned-right-cols-container'),
            horizontal_range: center ? center.scrollWidth-center.clientWidth : null,
            ag_ltr: !!(root && root.querySelector('.ag-ltr')), ag_rtl: !!(root && root.querySelector('.ag-rtl'))};
    }
    for (const [id, grid] of Object.entries(gflow_config.grids)) {
        const root = [...scope.querySelectorAll('[data-js="gflow-inbox"]')].find(n => n.dataset.gridId === id);
        if (!root || !grid.grid_options) continue;
        const options = grid.grid_options;
        let readyListenerInstalled = false;
        const attachment = {grid_id: id, mounted_before_attachment: !!root.querySelector('.ag-root-wrapper'), callbacks: []};
        report.attachment.push(attachment);
        if (attachment.mounted_before_attachment) { report.failure = 'Already mounted'; continue; }
        const inspected = names.map(name => ({name, prior: options[name]}));
        if (inspected.some(({prior}) => prior != null && typeof prior !== 'function')) {
            attachment.failure = 'Non-callable pre-existing callback; no callback replaced';
            continue;
        }
        for (const {name, prior} of inspected) {
            const record = {name, original_type: typeof prior, original_present: prior != null, chained: typeof prior === 'function'};
            attachment.callbacks.push(record);
            options[name] = function () {
                const args = arguments, params = args[0];
                let result;
                try { if (typeof prior === 'function') result = Reflect.apply(prior, this, args); }
                catch (error) { record.original_threw = true; throw error; }
                // Diagnostics must not alter the callback's result/exception behavior.
                try {
                    if (!readyListenerInstalled && name === 'onColumnEverythingChanged' && params.source === 'gridInitializing'
                        && params.api && typeof params.api.addEventListener === 'function') {
                        readyListenerInstalled = true;
                        if (settings.discriminator) params.api.addEventListener('columnResized', resized => {
                            report.resize_events.push({sequence:report.resize_events.length, at:performance.now(),
                                event_type:resized.type, source:resized.source, event_keys:Object.keys(resized).sort(),
                                finished:resized.finished, ...snapshot(id, resized)});
                        });
                        const onReady = ready => {
                            report.events.push({sequence: report.events.length, callback: 'publicGridReady',
                                source: null, at: performance.now(), ...snapshot(id, ready)});
                            params.api.removeEventListener('gridReady', onReady);
                            queueMicrotask(() => report.events.push({sequence: report.events.length, callback: 'afterGridReady',
                                source: null, at: performance.now(), ...snapshot(id, ready)}));
                        };
                        params.api.addEventListener('gridReady', onReady);
                    }
                    const event = {sequence: report.events.length, at: performance.now(), callback: name,
                        source: params && params.source || null, event_type: params && params.type || null,
                        event_keys: params ? Object.keys(params).sort() : [], argument_count: args.length,
                        previous_return: result === undefined ? null : String(result), ...snapshot(id, params)};
                    if (window.__gppWidthControl) event.fixture_origin = window.__gppWidthControl.origin(params);
                    report.events.push(event);
                    requestAnimationFrame(() => {
                        try { event.after_frame = snapshot(id, params); }
                        catch (error) { event.after_frame_error = String(error); }
                    });
                } catch (error) { record.observation_error = String(error); }
                return result;
            };
        }
        report.function_was_attached_before_mount = true;
    }
})();
