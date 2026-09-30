(function (window, document) {
    'use strict';

    var contracts = window.gppSrwfInboxColumnOrderContracts;
    if (!Array.isArray(contracts) || !contracts.length) {
        return;
    }

    var pending = [];
    var seen = Object.create(null);
    var maxFrames = 240;

    function sameOrder(left, right) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }

        for (var index = 0; index < left.length; index += 1) {
            if (String(left[index]) !== String(right[index])) {
                return false;
            }
        }

        return true;
    }

    function sameIdentities(left, right) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }

        var sortedLeft = left.map(String).sort();
        var sortedRight = right.map(String).sort();
        return sameOrder(sortedLeft, sortedRight);
    }

    function hasCompatiblePersistedState(gridId, physicalColumnIds) {
        var raw;

        try {
            raw = window.localStorage.getItem(gridId);
        } catch (error) {
            return false;
        }

        if (typeof raw !== 'string' || !raw) {
            return false;
        }

        try {
            var state = JSON.parse(raw);
            if (!Array.isArray(state)) {
                return false;
            }

            var stateIds = state.map(function (item) {
                return item && item.colId !== undefined ? String(item.colId) : '';
            });

            return sameIdentities(stateIds, physicalColumnIds);
        } catch (error) {
            return false;
        }
    }

    contracts.forEach(function (contract) {
        if (!contract || typeof contract.gridId !== 'string' || !contract.gridId || !Array.isArray(contract.physicalColumnIds)) {
            return;
        }

        var ids = contract.physicalColumnIds.map(String);
        if (!ids.length || new Set(ids).size !== ids.length || seen[contract.gridId]) {
            return;
        }

        seen[contract.gridId] = true;
        pending.push({
            gridId: contract.gridId,
            physicalColumnIds: ids,
            waitForNativeRestore: hasCompatiblePersistedState(contract.gridId, ids)
        });
    });

    if (!pending.length) {
        return;
    }

    function hasExactGridRoot(gridId) {
        var roots = document.querySelectorAll('[data-js="gflow-inbox"][data-grid-id]');
        var matches = 0;

        for (var index = 0; index < roots.length; index += 1) {
            if (roots[index].getAttribute('data-grid-id') === gridId) {
                matches += 1;
            }
        }

        return matches === 1;
    }

    function runtimeOptions(gridId) {
        if (!window.gflow_config || !window.gflow_config.grids || !window.gflow_config.grids[gridId]) {
            return null;
        }

        return window.gflow_config.grids[gridId].grid_options || null;
    }

    function liveState(contract) {
        var options = runtimeOptions(contract.gridId);
        if (!hasExactGridRoot(contract.gridId)
            || !options
            || !Array.isArray(options.columnDefs)
            || !options.columnApi
            || typeof options.columnApi.getColumnState !== 'function'
            || typeof options.columnApi.applyColumnState !== 'function') {
            return null;
        }

        var definitionIds = options.columnDefs.map(function (definition) {
            return definition && definition.field !== undefined ? String(definition.field) : '';
        });

        // The exact native Grid ID is necessary but not sufficient authority.
        // Reconcile only while the live host definition still equals the
        // server-admitted GPP physical column contract.
        if (!sameOrder(definitionIds, contract.physicalColumnIds)) {
            return false;
        }

        var state = options.columnApi.getColumnState();
        if (!Array.isArray(state)) {
            return null;
        }

        var stateIds = state.map(function (item) {
            return item && item.colId !== undefined ? String(item.colId) : '';
        });

        if (!sameIdentities(stateIds, contract.physicalColumnIds)) {
            return false;
        }

        return {
            options: options,
            state: state,
            stateIds: stateIds
        };
    }

    function reconcile(contract, current) {
        var byId = Object.create(null);
        current.state.forEach(function (item) {
            byId[String(item.colId)] = item;
        });

        var orderedState = contract.physicalColumnIds.map(function (columnId) {
            return byId[columnId];
        });

        // Reuse the host-owned state objects unchanged. Only their sequence is
        // reconciled, preserving width, sort, visibility, pinning and any other
        // compatible native AG Grid state carried by Gravity Flow.
        current.options.columnApi.applyColumnState({
            state: orderedState,
            applyOrder: true
        });
    }

    function tick(frame) {
        var remaining = [];

        pending.forEach(function (contract) {
            var current = liveState(contract);

            if (current === null) {
                remaining.push(contract);
                return;
            }

            if (current === false) {
                // Host identity/definition drift: fail inert rather than
                // mutating an unqualified Grid.
                return;
            }

            if (!contract.waitForNativeRestore) {
                // With no compatible host-persisted state there is no native
                // restore ordering to repair. The server projection remains the
                // sole order authority for this initialization.
                return;
            }

            if (sameOrder(current.stateIds, contract.physicalColumnIds)) {
                // The production asset executes before Gravity Flow's async
                // common Inbox chunk. Keep waiting: a compatible persisted
                // state means the host will still run its id-first restore path.
                remaining.push(contract);
                return;
            }

            // Gravity Flow 3.1.0's pinned onGridReady restore moves `id` to the
            // physical front before applyColumnState(). Treat only that exact
            // host-restored signature as authority to reconcile; do not infer a
            // user's arbitrary column drag as stale state.
            if (current.stateIds[0] !== 'id') {
                remaining.push(contract);
                return;
            }

            reconcile(contract, current);
        });

        pending = remaining;
        if (pending.length && frame < maxFrames) {
            window.requestAnimationFrame(function () {
                tick(frame + 1);
            });
        }
    }

    window.requestAnimationFrame(function () {
        tick(0);
    });
}(window, document));
