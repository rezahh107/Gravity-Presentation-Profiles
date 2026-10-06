(function (contract) {
    'use strict';

    if (!contract || !Number.isInteger(contract.form_id) || contract.form_id < 1
        || !Array.isArray(contract.column_ids) || contract.column_ids.length !== 5) {
        return;
    }

    const expectedIds = contract.column_ids.map(String);
    if (new Set(expectedIds).size !== 5 || !window.gflow_config || !gflow_config.grids) {
        return;
    }

    const sameShape = ids => Array.isArray(ids)
        && ids.length === expectedIds.length
        && new Set(ids).size === ids.length
        && ids.every(id => expectedIds.includes(String(id)));

    const admittedDisplayedShape = ids => Array.isArray(ids)
        && ids.length > 0
        && new Set(ids).size === ids.length
        && ids.every(id => expectedIds.includes(String(id)));

    const formMatches = options => {
        if (!options || !options.searchArgs || typeof options.searchArgs !== 'object') {
            return false;
        }
        const formId = options.searchArgs.form_id;
        if (typeof formId !== 'string' && typeof formId !== 'number') {
            return false;
        }
        return String(formId) === String(contract.form_id);
    };

    const roots = Array.from(document.querySelectorAll(
        '[data-gpp-inbox-surface="gravity_flow.inbox"] [data-js="gflow-inbox"]'
    ));

    for (const [gridId, grid] of Object.entries(gflow_config.grids)) {
        const options = grid && grid.grid_options;
        const root = roots.find(node => node.dataset.gridId === gridId);
        if (!root || !options || root.querySelector('.ag-root-wrapper') || !formMatches(options)) {
            continue;
        }

        if (!Array.isArray(options.columnDefs)
            || !sameShape(options.columnDefs.map(column => String(column.colId ?? column.field)))) {
            continue;
        }

        const previous = options.onGridSizeChanged;
        if (previous != null && typeof previous !== 'function') {
            continue;
        }

        // Mount-local state only. A new public API identity represents a fresh
        // native Grid mount; later events from the same API remain inert.
        let currentMountApi = null;
        let unknownMountConsumed = false;

        options.onGridSizeChanged = function () {
            const args = arguments;
            const params = args[0];
            let firstOpportunity = false;

            // Consume before invoking either the previous callback or the
            // sizing operation so exceptions/reentrancy cannot create retries.
            if (params && params.api) {
                if (currentMountApi === null && !unknownMountConsumed) {
                    currentMountApi = params.api;
                    firstOpportunity = true;
                } else if (currentMountApi !== null && currentMountApi !== params.api) {
                    currentMountApi = params.api;
                    firstOpportunity = true;
                }
            } else if (currentMountApi === null && !unknownMountConsumed) {
                unknownMountConsumed = true;
                firstOpportunity = true;
            }

            const result = typeof previous === 'function'
                ? Reflect.apply(previous, this, args)
                : undefined;

            if (!firstOpportunity || !params || !params.api) {
                return result;
            }

            if (!document.contains(root)
                || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) {
                return result;
            }

            if ((options.domLayout != null && options.domLayout !== 'normal')
                || (options.rowModelType != null && options.rowModelType !== 'clientSide')
                || options.autoSizeStrategy != null
                || options.suppressHorizontalScroll === true) {
                return result;
            }

            const columnApi = params.columnApi;
            if (!columnApi
                || typeof columnApi.getColumnState !== 'function'
                || typeof columnApi.getAllDisplayedColumns !== 'function'
                || typeof params.api.sizeColumnsToFit !== 'function') {
                return result;
            }

            const state = columnApi.getColumnState();
            if (!Array.isArray(state) || !sameShape(state.map(column => String(column.colId)))) {
                return result;
            }

            const centerViewport = root.querySelector('.ag-center-cols-viewport');
            const usableWidth = centerViewport && centerViewport.clientWidth;
            if (!Number.isFinite(usableWidth) || usableWidth <= 0) {
                return result;
            }

            const displayed = columnApi.getAllDisplayedColumns();
            if (!Array.isArray(displayed) || displayed.length === 0) {
                return result;
            }

            const geometry = [];
            for (const column of displayed) {
                if (!column || [
                    'getColId',
                    'getActualWidth',
                    'getMinWidth',
                    'getMaxWidth',
                    'getPinned',
                    'getFlex',
                    'getColDef',
                ].some(method => typeof column[method] !== 'function')) {
                    return result;
                }

                const definition = column.getColDef();
                if (!definition || typeof definition !== 'object') {
                    return result;
                }

                geometry.push({
                    id: String(column.getColId()),
                    width: column.getActualWidth(),
                    min: column.getMinWidth(),
                    max: column.getMaxWidth(),
                    pinned: column.getPinned(),
                    flex: column.getFlex(),
                    suppressSizeToFit: definition.suppressSizeToFit === true,
                });
            }

            if (!admittedDisplayedShape(geometry.map(column => column.id))) {
                return result;
            }
            if (geometry.some(column => column.pinned != null)) {
                return result;
            }
            if (geometry.some(column => !Number.isFinite(column.flex) || column.flex !== 0)) {
                return result;
            }
            if (geometry.some(column => column.suppressSizeToFit
                || !Number.isFinite(column.width) || column.width <= 0
                || !Number.isFinite(column.min) || column.min <= 0
                || column.width < column.min
                || (column.max != null && (!Number.isFinite(column.max)
                    || column.max < column.min || column.width > column.max)))) {
                return result;
            }

            const displayedWidth = geometry.reduce((sum, column) => sum + column.width, 0);
            const minimumWidth = geometry.reduce((sum, column) => sum + column.min, 0);

            if (displayedWidth <= usableWidth + 1) {
                return result;
            }
            if (minimumWidth > usableWidth) {
                return result;
            }

            params.api.sizeColumnsToFit();
            return result;
        };
    }
})(__GPP_INITIAL_GEOMETRY_CONTRACT__);
