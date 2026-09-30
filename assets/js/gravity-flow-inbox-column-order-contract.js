(function (window, document) {
    'use strict';

    var contracts = window.gppSrwfInboxColumnOrderContracts;
    if (!Array.isArray(contracts) || !contracts.length) {
        return;
    }

    var pending = [];
    var seen = Object.create(null);
    var maxFrames = 240;

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
            readyFrame: null
        });
    });

    if (!pending.length) {
        return;
    }

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

    function isReady(contract) {
        var options = runtimeOptions(contract.gridId);
        return hasExactGridRoot(contract.gridId)
            && options
            && options.columnApi
            && typeof options.columnApi.getColumnState === 'function'
            && typeof options.columnApi.applyColumnState === 'function';
    }

    function reconcile(contract) {
        var options = runtimeOptions(contract.gridId);
        if (!options || !Array.isArray(options.columnDefs)) {
            return;
        }

        var definitionIds = options.columnDefs.map(function (definition) {
            return definition && definition.field !== undefined ? String(definition.field) : '';
        });

        // The exact native Grid ID is necessary but not sufficient authority.
        // Reconcile only while the live host definition still equals the
        // server-admitted GPP physical column contract.
        if (!sameOrder(definitionIds, contract.physicalColumnIds)) {
            return;
        }

        var state = options.columnApi.getColumnState();
        if (!Array.isArray(state)) {
            return;
        }

        var stateIds = state.map(function (item) {
            return item && item.colId !== undefined ? String(item.colId) : '';
        });

        if (!sameIdentities(stateIds, contract.physicalColumnIds)) {
            return;
        }

        if (sameOrder(stateIds, contract.physicalColumnIds)) {
            return;
        }

        var byId = Object.create(null);
        state.forEach(function (item) {
            byId[String(item.colId)] = item;
        });

        var orderedState = contract.physicalColumnIds.map(function (columnId) {
            return byId[columnId];
        });

        // Reuse the host-owned state objects unchanged. Only their sequence is
        // reconciled, preserving width, sort, visibility, pinning and any other
        // compatible native AG Grid state carried by Gravity Flow.
        options.columnApi.applyColumnState({
            state: orderedState,
            applyOrder: true
        });
    }

    function tick(frame) {
        var remaining = [];

        pending.forEach(function (contract) {
            if (!isReady(contract)) {
                remaining.push(contract);
                return;
            }

            if (contract.readyFrame === null) {
                contract.readyFrame = frame;
                remaining.push(contract);
                return;
            }

            // Allow the native Grid-ready restoration callback to settle before
            // reconciling the already-host-owned state for this initialization.
            if ((frame - contract.readyFrame) < 2) {
                remaining.push(contract);
                return;
            }

            reconcile(contract);
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
