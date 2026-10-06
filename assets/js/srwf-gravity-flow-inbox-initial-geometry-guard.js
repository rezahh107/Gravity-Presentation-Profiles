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
    const PROVENANCE_PREFIX = 'gpp:srwf-inbox-fit:v1:';
    const GROW_SETTLE_MS = 180;
    const GROW_MIN_DELTA_PX = 24;
    const WIDTH_TOLERANCE_PX = 1;

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

        const previousGridSizeChanged = options.onGridSizeChanged;
        const previousColumnsChanged = options.onColumnEverythingChanged;
        if ((previousGridSizeChanged != null && typeof previousGridSizeChanged !== 'function')
            || (previousColumnsChanged != null && typeof previousColumnsChanged !== 'function')) {
            continue;
        }

        const provenanceKey = `${PROVENANCE_PREFIX}${contract.form_id}:${gridId}`;
        let currentMountApi = null;
        let unknownMountConsumed = false;
        let resizeListenerApi = null;
        let resizeListener = null;
        let initialOpportunityConsumed = false;
        let growTimer = null;
        let growRecoveryConsumed = false;
        let mountProvenance = null;
        let mountDisabled = false;

        const clearGrowTimer = () => {
            if (growTimer !== null) {
                window.clearTimeout(growTimer);
                growTimer = null;
            }
        };

        const storage = () => {
            try {
                return window.localStorage || null;
            } catch (error) {
                return null;
            }
        };

        const clearStoredProvenance = () => {
            const area = storage();
            if (!area) {
                return;
            }
            try {
                area.removeItem(provenanceKey);
            } catch (error) {
                // Presentation provenance is disposable. Native Grid behavior wins.
            }
        };

        const writeStoredProvenance = record => {
            mountProvenance = record;
            const area = storage();
            if (!area) {
                return;
            }
            try {
                area.setItem(provenanceKey, JSON.stringify(record));
            } catch (error) {
                // Live-mount recovery can still use mountProvenance; reload recovery fails closed.
            }
        };

        const parseStoredProvenance = () => {
            const area = storage();
            if (!area) {
                return null;
            }
            let raw;
            try {
                raw = area.getItem(provenanceKey);
            } catch (error) {
                return null;
            }
            if (!raw) {
                return null;
            }
            try {
                const record = JSON.parse(raw);
                if (!record || record.v !== PROVENANCE_VERSION
                    || String(record.form_id) !== String(contract.form_id)
                    || record.grid_id !== gridId
                    || !sameShape(record.column_ids)
                    || record.kind !== 'auto_fit'
                    || !Array.isArray(record.displayed)
                    || record.displayed.length === 0
                    || new Set(record.displayed.map(column => String(column.id))).size !== record.displayed.length
                    || record.displayed.some(column => !expectedIds.includes(String(column.id))
                        || !Number.isFinite(column.width) || column.width <= 0)
                    || !Number.isFinite(record.usable_width) || record.usable_width <= 0) {
                    clearStoredProvenance();
                    return null;
                }
                return record;
            } catch (error) {
                clearStoredProvenance();
                return null;
            }
        };

        const recordMatchesGeometry = (record, geometry) => {
            if (!record || !geometry || record.displayed.length !== geometry.columns.length) {
                return false;
            }
            for (let index = 0; index < geometry.columns.length; index += 1) {
                const expected = record.displayed[index];
                const actual = geometry.columns[index];
                if (String(expected.id) !== actual.id
                    || Math.abs(expected.width - actual.width) > WIDTH_TOLERANCE_PX) {
                    return false;
                }
            }
            return true;
        };

        const makeRecord = geometry => ({
            v: PROVENANCE_VERSION,
            kind: 'auto_fit',
            form_id: contract.form_id,
            grid_id: gridId,
            column_ids: expectedIds.slice(),
            displayed: geometry.columns.map(column => ({id: column.id, width: column.width})),
            usable_width: geometry.usableWidth,
        });

        const inspectGeometry = params => {
            if (!params || !params.api) {
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

            const columns = [];
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

                columns.push({
                    id: String(column.getColId()),
                    width: column.getActualWidth(),
                    min: column.getMinWidth(),
                    max: column.getMaxWidth(),
                    pinned: column.getPinned(),
                    flex: column.getFlex(),
                    suppressSizeToFit: definition.suppressSizeToFit === true,
                });
            }

            if (!admittedDisplayedShape(columns.map(column => column.id))) {
                return null;
            }
            if (columns.some(column => column.pinned != null)) {
                return null;
            }
            if (columns.some(column => !Number.isFinite(column.flex) || column.flex !== 0)) {
                return null;
            }
            if (columns.some(column => column.suppressSizeToFit
                || !Number.isFinite(column.width) || column.width <= 0
                || !Number.isFinite(column.min) || column.min <= 0
                || column.width < column.min
                || (column.max != null && (!Number.isFinite(column.max)
                    || column.max < column.min || column.width > column.max)))) {
                return null;
            }

            return {
                columns,
                displayedWidth: columns.reduce((sum, column) => sum + column.width, 0),
                minimumWidth: columns.reduce((sum, column) => sum + column.min, 0),
                usableWidth,
            };
        };

        const fitAndRecord = (params, reason) => {
            params.api.sizeColumnsToFit();
            const fitted = inspectGeometry(params);
            if (fitted) {
                writeStoredProvenance(makeRecord(fitted));
            } else {
                mountProvenance = null;
                clearStoredProvenance();
            }
            return reason;
        };

        const growCandidate = (record, geometry) => record
            && record.kind === 'auto_fit'
            && recordMatchesGeometry(record, geometry)
            && geometry.minimumWidth <= geometry.usableWidth
            && geometry.usableWidth - record.usable_width >= GROW_MIN_DELTA_PX
            && geometry.usableWidth - geometry.displayedWidth >= GROW_MIN_DELTA_PX;

        const installResizeListener = params => {
            if (!params || !params.api || resizeListenerApi === params.api
                || typeof params.api.addEventListener !== 'function') {
                return;
            }
            if (resizeListenerApi && resizeListener
                && typeof resizeListenerApi.removeEventListener === 'function') {
                resizeListenerApi.removeEventListener('columnResized', resizeListener);
            }

            resizeListenerApi = params.api;
            initialOpportunityConsumed = false;
            growRecoveryConsumed = false;
            mountDisabled = false;
            clearGrowTimer();

            resizeListener = event => {
                if (!event || event.finished !== true || mountDisabled) {
                    return;
                }
                if (!document.contains(root)
                    || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) {
                    return;
                }

                const geometry = inspectGeometry({
                    api: event.api || params.api,
                    columnApi: event.columnApi || params.columnApi,
                });

                if (event.source === 'sizeColumnsToFit') {
                    if (geometry) {
                        writeStoredProvenance(makeRecord(geometry));
                    } else {
                        mountProvenance = null;
                        clearStoredProvenance();
                        clearGrowTimer();
                    }
                    return;
                }

                const stored = parseStoredProvenance();
                const record = stored || mountProvenance;
                if (!record) {
                    return;
                }

                // Native startup restore is also reported as source=api and is
                // not distinguishable from an unrelated API call. Before the
                // first size opportunity we therefore defer that decision and
                // validate the resulting width signature at onGridSizeChanged.
                if (geometry && recordMatchesGeometry(record, geometry)) {
                    mountProvenance = record;
                    return;
                }
                if (!initialOpportunityConsumed && event.source === 'api') {
                    return;
                }

                // A completed non-fit width mutation that materially changes
                // the recorded width signature revokes only GPP provenance.
                // Gravity Flow remains owner of the resulting native state.
                mountProvenance = null;
                clearStoredProvenance();
                clearGrowTimer();
            };
            params.api.addEventListener('columnResized', resizeListener);
        };

        const scheduleGrowRecovery = params => {
            if (mountDisabled || growRecoveryConsumed || !params || !params.api
                || params.api !== currentMountApi) {
                return;
            }
            const geometry = inspectGeometry(params);
            if (!geometry) {
                clearGrowTimer();
                return;
            }
            const stored = parseStoredProvenance();
            const record = stored || mountProvenance;
            if (!growCandidate(record, geometry)) {
                clearGrowTimer();
                return;
            }

            clearGrowTimer();
            growTimer = window.setTimeout(() => {
                growTimer = null;
                if (mountDisabled || growRecoveryConsumed || !document.contains(root)
                    || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) {
                    return;
                }
                const current = inspectGeometry(params);
                const latestStored = parseStoredProvenance();
                const latest = latestStored || mountProvenance;
                if (!current || !growCandidate(latest, current)) {
                    return;
                }
                growRecoveryConsumed = true;
                fitAndRecord(params, 'live-grow');
            }, GROW_SETTLE_MS);
        };

        // Candidate A proved that columnEverythingChanged cannot distinguish a
        // native restore from unrelated API mutation. It is used here only as
        // the exact public pre-ready lifecycle point already observed in the
        // pinned runtime, so a public columnResized listener exists before
        // Gravity Flow's ready-time restore/sizeColumnsToFit work begins.
        options.onColumnEverythingChanged = function () {
            const args = arguments;
            const params = args[0];
            const result = typeof previousColumnsChanged === 'function'
                ? Reflect.apply(previousColumnsChanged, this, args)
                : undefined;

            if (!params || params.source !== 'gridInitializing' || !params.api) {
                return result;
            }
            if (!document.contains(root)
                || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) {
                return result;
            }

            installResizeListener(params);
            return result;
        };

        options.onGridSizeChanged = function () {
            const args = arguments;
            const params = args[0];
            let firstOpportunity = false;
            let newApiIdentity = false;

            if (params && params.api) {
                // Fallback listener installation keeps later manual invalidation
                // available even if an otherwise-supported host omits the exact
                // early callback. It cannot recover a fit event already missed.
                installResizeListener(params);

                if (currentMountApi === null && !unknownMountConsumed) {
                    currentMountApi = params.api;
                    firstOpportunity = true;
                    newApiIdentity = true;
                } else if (currentMountApi !== null && currentMountApi !== params.api) {
                    currentMountApi = params.api;
                    firstOpportunity = true;
                    newApiIdentity = true;
                }
            } else if (currentMountApi === null && !unknownMountConsumed) {
                unknownMountConsumed = true;
                firstOpportunity = true;
            }

            if (newApiIdentity) {
                clearGrowTimer();
                growRecoveryConsumed = false;
                mountDisabled = false;
            }
            if (firstOpportunity) {
                initialOpportunityConsumed = true;
            }

            let result;
            try {
                result = typeof previousGridSizeChanged === 'function'
                    ? Reflect.apply(previousGridSizeChanged, this, args)
                    : undefined;
            } catch (error) {
                if (firstOpportunity) {
                    mountDisabled = true;
                    clearGrowTimer();
                }
                throw error;
            }

            if (mountDisabled || !params || !params.api) {
                return result;
            }

            if (!document.contains(root)
                || !root.closest('[data-gpp-inbox-surface="gravity_flow.inbox"]')) {
                return result;
            }

            if (!firstOpportunity) {
                scheduleGrowRecovery(params);
                return result;
            }

            const geometry = inspectGeometry(params);
            if (!geometry) {
                return result;
            }

            const stored = parseStoredProvenance();
            if (stored && recordMatchesGeometry(stored, geometry)) {
                mountProvenance = stored;
            } else if (stored) {
                clearStoredProvenance();
                mountProvenance = null;
            }

            // Preserve Candidate C's released rule: any fit-capable overflow is
            // normalized exactly once on the initial native mount opportunity.
            if (geometry.displayedWidth > geometry.usableWidth + WIDTH_TOLERANCE_PX) {
                if (geometry.minimumWidth <= geometry.usableWidth) {
                    fitAndRecord(params, 'initial-overflow');
                }
                return result;
            }

            const record = mountProvenance;
            if (growCandidate(record, geometry)) {
                growRecoveryConsumed = true;
                fitAndRecord(params, 'initial-provenance-grow');
            }

            return result;
        };
    }
})(__GPP_INITIAL_GEOMETRY_CONTRACT__);
