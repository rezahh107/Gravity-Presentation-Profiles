/* WU21-only mutation prototype. Never loaded by product assets. */
(function () {
    'use strict';
    const settings = window.__gppWidthLab;
    const report = window.__gppCandidateC = {mode:'MUTATION_PROTOTYPE_ONLY', attachment:[], evaluations:[], deliveries:[], repair_count:0};
    const scope = document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    if (!settings || !scope || !window.gflow_config || !gflow_config.grids) return;
    const accepted = settings.accepted_ids;
    const shape = ids => Array.isArray(accepted) && accepted.length === 5 && new Set(accepted).size === 5
        && ids.length === 5 && new Set(ids).size === 5 && ids.every(id => accepted.includes(id));
    for (const [id, grid] of Object.entries(gflow_config.grids)) {
        const root = [...scope.querySelectorAll('[data-js="gflow-inbox"]')].find(n=>n.dataset.gridId===id);
        const options = grid.grid_options;
        if (!root || !options || root.querySelector('.ag-root-wrapper')) continue;
        // The five-column contract comes from the existing synthetic SRWF fixture,
        // not page IDs or a second persistence authority.
        if (!Array.isArray(options.columnDefs) || !shape(options.columnDefs.map(c=>String(c.colId ?? c.field)))) continue;
        const prior = options.onGridSizeChanged;
        if (prior != null && typeof prior !== 'function') continue;
        report.attachment.push({grid_id:id,callback:'onGridSizeChanged',prior_present:typeof prior==='function',before_mount:true});
        // One current API identity and one consumed bit inside this callback;
        // no global API registry, retained mount history, or column-state store.
        let currentMount = null, consumed = false, mountNumber = 0;
        options.onGridSizeChanged = function () {
            const args=arguments, params=args[0];
            const result = typeof prior==='function' ? Reflect.apply(prior,this,args) : undefined;
            try {
                if (!params || !params.api) return result;
                if (currentMount !== params.api) {currentMount=params.api;consumed=false;mountNumber++;}
                report.deliveries.push({at:performance.now(),mount:mountNumber,already_consumed:consumed,type:params.type});
                if (consumed) return result;
                consumed=true; // Consume before any eligibility read or reentrant sizing call.
                const e={at:performance.now(),mount:mountNumber,grid_id:id,type:params.type,source:params.source||null,
                    keys:Object.keys(params).sort(),decision:'FAIL_CLOSED',repair_count:0};
                report.evaluations.push(e);
                const reject = reason => {e.reason=reason;return result;};
                if (!document.contains(root) || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) return reject('inactive_scope');
                if ((options.domLayout!=null && options.domLayout!=='normal')
                    || (options.rowModelType!=null && options.rowModelType!=='clientSide')
                    || options.autoSizeStrategy!=null || options.suppressHorizontalScroll===true) return reject('unsupported_grid_mode');
                const columns=params.columnApi;
                if (!columns || typeof columns.getColumnState!=='function' || typeof columns.getAllDisplayedColumns!=='function'
                    || typeof params.api.sizeColumnsToFit!=='function') return reject('missing_public_capability');
                e.state_before=columns.getColumnState();
                if (!shape(e.state_before.map(c=>c.colId))) return reject('unsupported_identity');
                const viewport=root.querySelector('.ag-center-cols-viewport');
                e.center_width=viewport && viewport.clientWidth;
                if (!Number.isFinite(e.center_width) || e.center_width<=0) return reject('unusable_geometry');
                const displayed=columns.getAllDisplayedColumns();
                if (!displayed.length) return reject('no_displayed_columns');
                e.displayed=displayed.map(c=>({id:c.getColId(),width:c.getActualWidth(),min:c.getMinWidth(),max:c.getMaxWidth(),
                    pinned:c.getPinned(),flex:c.getFlex(),suppress:c.getColDef().suppressSizeToFit===true}));
                if (e.displayed.some(c=>c.pinned!=null)) return reject('pinned');
                if (e.displayed.some(c=>!Number.isFinite(c.flex) || c.flex!==0)) return reject('flex_or_unknown');
                if (e.displayed.some(c=>!accepted.includes(c.id) || c.suppress || !Number.isFinite(c.width) || c.width<=0
                    || !Number.isFinite(c.min) || c.min<=0 || c.width<c.min
                    || (c.max!=null && (!Number.isFinite(c.max) || c.max<c.min || c.width>c.max)))) return reject('unsupported_sizing');
                e.displayed_width=e.displayed.reduce((sum,c)=>sum+c.width,0);
                e.minimum_width=e.displayed.reduce((sum,c)=>sum+c.min,0);
                e.tolerance=1;
                if (e.displayed_width<=e.center_width+e.tolerance) {e.decision='UNCHANGED_FITS';return result;}
                if (e.minimum_width>e.center_width) {e.decision='UNCHANGED_MINIMUM_OVERFLOW';return result;}
                e.decision='NATIVE_NORMALIZATION';e.repair_count=1;report.repair_count++;
                params.api.sizeColumnsToFit();
                e.state_after=columns.getColumnState();
            } catch (error) {const e=report.evaluations.at(-1);if(e)e.error=String(error);}
            return result;
        };
    }
})();
