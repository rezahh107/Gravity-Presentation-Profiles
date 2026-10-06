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

    const PROVENANCE_VERSION = 1;
    const STORAGE_PREFIX = 'gpp:srwf-inbox-fit:v1:';
    const GROW_SETTLE_MS = 180;
    const GROW_MIN_DELTA_PX = 24;
    const WIDTH_TOLERANCE_PX = 1;

    const sameShape = ids => Array.isArray(ids)
        && ids.length === expectedIds.length
        && new Set(ids).size === ids.length
        && ids.every(id => expectedIds.includes(String(id)));

    const sameOrderedIds = (actual, expected) => Array.isArray(actual)
        && Array.isArray(expected)
        && actual.length === expected.length
        && actual.every((id, index) => String(id) === String(expected[index]));

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

    const storage = () => {
        try {
            return window.localStorage || null;
        } catch (error) {
            return null;
        }
    };

    const safeRemove = key => {
        const target = storage();
        if (!target || typeof target.removeItem !== 'function') {
            return;
        }
        try {
            target.removeItem(key);
        } catch (error) {
            // Provenance is disposable presentation state. Storage failure must
            // never affect the native Grid or the existing overflow repair.
        }
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

        const previousSize = options.onGridSizeChanged;
        const previousResize = options.onColumnResized;
        if ((previousSize != null && typeof previousSize !== 'function')
            || (previousResize != null && typeof previousResize !== 'function')) {
            continue;
        }

        const storageKey = `${STORAGE_PREFIX}${contract.form_id}:${gridId}`;
        let currentMountApi = null;
        let unknownMountConsumed = false;
        let firstSizeOpportunityConsumed = false;
        let firstSizeDeliveryInProgress = false;
        let growRecoveryUsed = false;
        let growTimer = null;
        let gppFitInProgress = false;

        const clearGrowTimer = () => {
            if (growTimer !== null && typeof window.clearTimeout === 'function') {
                window.clearTimeout(growTimer);
            }
            growTimer = null;
        };

        const clearProvenance = () => {
            clearGrowTimer();
            safeRemove(storageKey);
        };

        const readProvenance = () => {
            const target = storage();
            if (!target || typeof target.getItem !== 'function') {
                return null;
            }

            let raw;
            try {
                raw = target.getItem(storageKey);
            } catch (error) {
                return null;
            }
            if (!raw) {
                return null;
            }

            let value;
            try {
                value = JSON.parse(raw);
            } catch (error) {
                safeRemove(storageKey);
                return null;
            }

            if (!value || value.version !== PROVENANCE_VERSION
                || String(value.form_id) !== String(contract.form_id)
                || String(value.grid_id) !== String(gridId)
                || !Array.isArray(value.column_ids)
                || !sameShape(value.column_ids.map(String))
                || !Array.isArray(value.displayed_ids)
                || !admittedDisplayedShape(value.displayed_ids.map(String))
                || !Array.isArray(value.widths)
                || value.widths.length !== value.displayed_ids.length
                || value.widths.some(width => !Number.isFinite(width) || width <= 0)
                || !Number.isFinite(value.usable_width) || value.usable_width <= 0) {
                safeRemove(storageKey);
                return null;
            }

            return value;
        };

        const writeProvenance = snapshot => {
            const target = storage();
            if (!target || typeof target.setItem !== 'function') {
                return;
            }

            const value = {
                version: PROVENANCE_VERSION,
                form_id: String(contract.form_id),
                grid_id: String(gridId),
                column_ids: expectedIds.slice(),
                displayed_ids: snapshot.geometry.map(column => column.id),
                widths: snapshot.geometry.map(column => column.width),
                usable_width: snapshot.usableWidth,
            };

            try {
                target.setItem(storageKey, JSON.stringify(value));
            } catch (error) {
                // Native state is still authoritative; provenance is optional.
            }
        };

        const inspectGeometry = params => {
            if (!params || !params.api || !document.contains(root)
                || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) {
                return null;
            }

            if ((options.domLayout != null && options.domLayout !== 'normal')
                || (options.rowModelType != null && options.rowModelType !== 'clientSide')
                || options.autoSizeStrategy != null
                || options.suppressHorizontalScroll === true) {
                return null;
            }

            const columnApi = params.columnApi;
            if (!columnApi
                || typeof columnApi.getColumnState !== 'function'
                || typeof columnApi.getAllDisplayedColumns !== 'function'
                || typeof params.api.sizeColumnsToFit !== 'function') {
                return null;
            }

            const state = columnApi.getColumnState();
            if (!Array.isArray(state) || !sameShape(state.map(column => String(column.colId)))) {
                return null;
            }

            const centerViewport = root.querySelector('.ag-center-cols-viewport');
            const usableWidth = centerViewport && centerViewport.clientWidth;
            if (!Number.isFinite(usableWidth) || usableWidth <= 0) {
                return null;
            }

            const displayed = columnApi.getAllDisplayedColumns();
            if (!Array.isArray(displayed) || displayed.length === 0) {
                return null;
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
                    return null;
                }

                const definition = column.getColDef();
                if (!definition || typeof definition !== 'object') {
                    return null;
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

            if (!admittedDisplayedShape(geometry.map(column => column.id))
                || geometry.some(column => column.pinned != null)
                || geometry.some(column => !Number.isFinite(column.flex) || column.flex !== 0)
                || geometry.some(column => column.suppressSizeToFit
                    || !Number.isFinite(column.width) || column.width <= 0
                    || !Number.isFinite(column.min) || column.min <= 0
                    || column.width < column.min
                    || (column.max != null && (!Number.isFinite(column.max)
                        || column.max < column.min || column.width > column.max)))) {
                return null;
            }

            return {
                state,
                geometry,
                usableWidth,
                displayedWidth: geometry.reduce((sum, column) => sum + column.width, 0),
                minimumWidth: geometry.reduce((sum, column) => sum + column.min, 0),
            };
        };

        const matchingProvenance = snapshot => {
            const value = readProvenance();
            if (!value) {
                return null;
            }

            const ids = snapshot.geometry.map(column => column.id);
            if (!sameOrderedIds(value.displayed_ids, ids)
                || value.widths.some((width, index) => Math.abs(width - snapshot.geometry[index].width) > WIDTH_TOLERANCE_PX)) {
                clearProvenance();
                return null;
            }

            return value;
        };

        const fitAndRecord = params => {
            gppFitInProgress = true;
            try {
                params.api.sizeColumnsToFit();
            } finally {
                gppFitInProgress = false;
            }

            const after = inspectGeometry(params);
            if (after) {
                writeProvenance(after);
            } else {
                clearProvenance();
            }
        };

        const scheduleGrowRecovery = params => {
            if (growRecoveryUsed || typeof window.setTimeout !== 'function') {
                return;
            }

            clearGrowTimer();
            const api = params.api;
            growTimer = window.setTimeout(() => {
                growTimer = null;
                if (growRecoveryUsed || currentMountApi !== api) {
                    return;
                }

                const snapshot = inspectGeometry(params);
                if (!snapshot || snapshot.displayedWidth > snapshot.usableWidth + WIDTH_TOLERANCE_PX) {
                    return;
                }

                const provenance = matchingProvenance(snapshot);
                if (!provenance
                    || snapshot.usableWidth < provenance.usable_width + GROW_MIN_DELTA_PX) {
                    return;
                }

                growRecoveryUsed = true;
                fitAndRecord(params);
            }, GROW_SETTLE_MS);
        };

        options.onColumnResized = function () {
            const args = arguments;
            const params = args[0];

            // Gravity Flow restores its persisted column state with source=api
            // before the first Grid-size opportunity. That startup restore must
            // not erase valid GPP fit provenance needed for direct reload.
            // After startup, any width mutation not made by this guard revokes
            // GPP provenance so manual/API choices remain host-owned.
            const belongsToCurrentMount = params && params.api && params.api === currentMountApi;
            if (firstSizeOpportunityConsumed && belongsToCurrentMount
                && !firstSizeDeliveryInProgress && !gppFitInProgress) {
                clearProvenance();
            }

            return typeof previousResize === 'function'
                ? Reflect.apply(previousResize, this, args)
                : undefined;
        };

        options.onGridSizeChanged = function () {
            const args = arguments;
            const params = args[0];
            let firstOpportunity = false;

            // Consume before invoking either the previous callback or any sizing
            // operation so exceptions/reentrancy cannot create retries.
            if (params && params.api) {
                if (currentMountApi === null && !unknownMountConsumed) {
                    currentMountApi = params.api;
                    firstOpportunity = true;
                    growRecoveryUsed = false;
                    clearGrowTimer();
                } else if (currentMountApi !== null && currentMountApi !== params.api) {
                    currentMountApi = params.api;
                    firstOpportunity = true;
                    growRecoveryUsed = false;
                    clearGrowTimer();
                }
            } else if (currentMountApi === null && !unknownMountConsumed) {
                unknownMountConsumed = true;
                firstOpportunity = true;
                clearGrowTimer();
            }

            if (firstOpportunity) {
                firstSizeOpportunityConsumed = true;
            }

            let result;
            if (firstOpportunity) {
                firstSizeDeliveryInProgress = true;
            }
            try {
                result = typeof previousSize === 'function'
                    ? Reflect.apply(previousSize, this, args)
                    : undefined;
            } finally {
                if (firstOpportunity) {
                    firstSizeDeliveryInProgress = false;
                }
            }

            if (!params || !params.api) {
                return result;
            }

            const snapshot = inspectGeometry(params);
            if (!snapshot) {
                if (firstOpportunity) {
                    clearProvenance();
                }
                return result;
            }

            if (firstOpportunity) {
                if (snapshot.displayedWidth > snapshot.usableWidth + WIDTH_TOLERANCE_PX) {
                    if (snapshot.minimumWidth <= snapshot.usableWidth) {
                        fitAndRecord(params);
                    }
                    return result;
                }

                const provenance = matchingProvenance(snapshot);
                if (provenance
                    && snapshot.usableWidth >= provenance.usable_width + GROW_MIN_DELTA_PX) {
                    growRecoveryUsed = true;
                    fitAndRecord(params);
                }
                return result;
            }

            if (snapshot.displayedWidth > snapshot.usableWidth + WIDTH_TOLERANCE_PX) {
                // Preserve the existing live-shrink policy. A later initial
                // restore may normalize fit-capable overflow.
                clearGrowTimer();
                return result;
            }

            const provenance = matchingProvenance(snapshot);
            if (!provenance) {
                return result;
            }

            if (snapshot.usableWidth >= provenance.usable_width + GROW_MIN_DELTA_PX) {
                scheduleGrowRecovery(params);
            } else {
                clearGrowTimer();
            }

            return result;
        };
    }
})(__GPP_INITIAL_GEOMETRY_CONTRACT__);
