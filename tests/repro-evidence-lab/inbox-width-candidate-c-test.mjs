import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const productionPath = path.resolve('assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js');
const source = fs.readFileSync(productionPath, 'utf8');
const placeholder = '__GPP_INITIAL_GEOMETRY_CONTRACT__';
const contract = { form_id: 101, column_ids: ['id', '1', '3', '6', 'date_created'] };

assert.equal(source.split(placeholder).length - 1, 1, 'production guard must expose exactly one contract placeholder');
for (const forbidden of ['sessionStorage', 'ResizeObserver', 'MutationObserver', 'setInterval(', 'onGridReady', 'setColumnWidth', 'applyColumnState', 'enableRtl']) {
    assert.equal(source.includes(forbidden), false, `production guard contains prohibited mechanism ${forbidden}`);
}
for (const required of [
    'localStorage',
    'options.onColumnEverythingChanged = function',
    "params.source !== 'gridInitializing'",
    "addEventListener('columnResized'",
    'GROW_SETTLE_MS',
    'GROW_MIN_DELTA_PX',
]) {
    assert.equal(source.includes(required), true, `production recovery is missing ${required}`);
}
assert.equal(
    source.includes('options.onColumnResized = function'),
    false,
    'production recovery must not replace the host-owned resize callback'
);

const defaultState = () => [
    { colId: 'id', width: 165, hide: false, sort: null, sortIndex: null, pinned: null },
    { colId: '1', width: 528, hide: false, sort: null, sortIndex: null, pinned: null },
    { colId: '3', width: 414, hide: false, sort: null, sortIndex: null, pinned: null },
    { colId: '6', width: 355, hide: false, sort: null, sortIndex: null, pinned: null },
    { colId: 'date_created', width: 410, hide: false, sort: null, sortIndex: null, pinned: null },
];

const minima = { id: 80, '1': 100, '3': 100, '6': 100, date_created: 150 };

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function nonWidthState(state) {
    return state.map(({ width, ...rest }) => rest);
}

function buildFixture(overrides = {}) {
    const state = clone(overrides.state ?? defaultState());
    const center = { clientWidth: overrides.centerWidth ?? 1286 };
    const wrapper = {};
    let mounted = false;
    let scopeActive = overrides.scopeActive !== false;
    let sizeCalls = 0;
    let callbackCalls = 0;
    let reentrant = Boolean(overrides.reentrant);

    const root = {
        dataset: { gridId: 'grid-1' },
        querySelector(selector) {
            if (selector === '.ag-root-wrapper') return mounted ? {} : null;
            if (selector === '.ag-center-cols-viewport') return overrides.missingCenter ? null : center;
            return null;
        },
        closest(selector) {
            return scopeActive && selector === '[data-gpp-inbox-surface="gravity_flow.inbox"]' ? wrapper : null;
        },
    };

    const definitions = new Map();
    for (const entry of state) {
        definitions.set(String(entry.colId), {
            suppressSizeToFit: Boolean(overrides.suppressIds?.includes(String(entry.colId))),
        });
    }

    const columnFor = entry => ({
        getColId: () => String(entry.colId),
        getActualWidth: () => entry.width,
        getMinWidth: () => overrides.minById?.[String(entry.colId)] ?? minima[String(entry.colId)],
        getMaxWidth: () => overrides.maxById?.[String(entry.colId)] ?? null,
        getPinned: () => overrides.pinnedById?.[String(entry.colId)] ?? entry.pinned ?? null,
        getFlex: () => Object.prototype.hasOwnProperty.call(overrides.flexById ?? {}, String(entry.colId))
            ? overrides.flexById[String(entry.colId)]
            : 0,
        getColDef: () => definitions.get(String(entry.colId)),
    });

    const columnApi = {
        getColumnState: () => overrides.malformedState ? clone(overrides.malformedState) : clone(state),
        getAllDisplayedColumns: () => {
            const displayed = state.filter(entry => !entry.hide).map(columnFor);
            if (overrides.extraDisplayedColumn) displayed.push(overrides.extraDisplayedColumn);
            return displayed;
        },
    };

    const priorReceiver = { marker: 'receiver' };
    const priorArgs = [];
    let priorThrows = Boolean(overrides.priorThrowsOnce);
    const priorReturn = { token: 'native-prior-return' };
    const previous = overrides.previous === null ? null : function () {
        callbackCalls += 1;
        priorArgs.push({ receiver: this, args: Array.from(arguments) });
        if (typeof overrides.beforeEvaluation === 'function') overrides.beforeEvaluation(state);
        if (priorThrows) {
            priorThrows = false;
            throw new Error('native-prior-failure');
        }
        return priorReturn;
    };

    const options = {
        columnDefs: (overrides.columnDefs ?? contract.column_ids).map(field => ({ field })),
        searchArgs: { form_id: overrides.formId ?? '101' },
        onGridSizeChanged: overrides.nonCallablePrevious ? 'invalid' : previous,
    };
    if (Object.prototype.hasOwnProperty.call(overrides, 'domLayout')) options.domLayout = overrides.domLayout;
    if (Object.prototype.hasOwnProperty.call(overrides, 'rowModelType')) options.rowModelType = overrides.rowModelType;
    if (Object.prototype.hasOwnProperty.call(overrides, 'autoSizeStrategy')) options.autoSizeStrategy = overrides.autoSizeStrategy;
    if (Object.prototype.hasOwnProperty.call(overrides, 'suppressHorizontalScroll')) options.suppressHorizontalScroll = overrides.suppressHorizontalScroll;

    const api = {
        sizeColumnsToFit() {
            sizeCalls += 1;
            const displayed = state.filter(entry => !entry.hide);
            const total = displayed.reduce((sum, entry) => sum + entry.width, 0);
            const scale = total > 0 ? center.clientWidth / total : 1;
            for (const entry of displayed) {
                entry.width = Math.max(minima[String(entry.colId)] ?? 1, entry.width * scale);
            }
            if (reentrant) {
                reentrant = false;
                options.onGridSizeChanged.call(priorReceiver, params);
            }
        },
    };

    const params = { type: 'gridSizeChanged', source: null, api, columnApi };
    const document = {
        querySelectorAll: () => overrides.wrapperPresent === false ? [] : [root],
        contains: candidate => scopeActive && candidate === root,
    };
    const gflow_config = { grids: { 'grid-1': { grid_options: options } } };
    const context = { window: {}, document, gflow_config, Reflect, Number, Array, Object, String, Set };
    context.window.gflow_config = gflow_config;

    const code = source.replace(placeholder, JSON.stringify(overrides.contract ?? contract));
    vm.runInNewContext(code, context, { filename: productionPath });

    return {
        state,
        options,
        params,
        root,
        priorReceiver,
        priorReturn,
        priorArgs,
        api,
        columnApi,
        center,
        setScopeActive(value) { scopeActive = value; },
        setMounted(value) { mounted = value; },
        setWidths(widths) { state.forEach((entry, index) => { entry.width = widths[index]; }); },
        setType(type) { params.type = type; },
        setApi(nextApi) { params.api = nextApi; },
        sizeCalls: () => sizeCalls,
        callbackCalls: () => callbackCalls,
    };
}

function deliver(fixture, receiver = fixture.priorReceiver, params = fixture.params) {
    return fixture.options.onGridSizeChanged.call(receiver, params, 'second-arg');
}

// Production reachability in the isolated GridOptions seam, including prior
// callback receiver/arguments/return preservation.
{
    const fixture = buildFixture();
    assert.notEqual(fixture.options.onGridSizeChanged, null);
    const result = deliver(fixture);
    assert.equal(result, fixture.priorReturn);
    assert.equal(fixture.callbackCalls(), 1);
    assert.equal(fixture.priorArgs[0].receiver, fixture.priorReceiver);
    assert.equal(fixture.priorArgs[0].args[0], fixture.params);
    assert.equal(fixture.priorArgs[0].args[1], 'second-arg');
    assert.equal(fixture.sizeCalls(), 1, 'stale fit-capable state must normalize once');
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 1, 'same mount must never normalize twice');
}

// Reentrant sizing delivery is already consumed before the native sizing call.
{
    const fixture = buildFixture({ reentrant: true });
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 1, 'reentrant size event retried Candidate C');
}

// A thrown pre-existing callback propagates, but still consumes the mount.
{
    const fixture = buildFixture({ priorThrowsOnce: true });
    assert.throws(() => deliver(fixture), /native-prior-failure/);
    assert.equal(fixture.sizeCalls(), 0);
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0, 'prior callback failure deferred Candidate C into a retry');
}

// Clean and fitting states remain byte-for-byte width-stable.
for (const widths of [
    [80, 340, 286, 250, 330],
    [80, 200, 200, 200, 200],
]) {
    const fixture = buildFixture({ state: defaultState().map((entry, index) => ({ ...entry, width: widths[index] })) });
    const before = clone(fixture.state);
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0);
    assert.deepEqual(fixture.state, before);
}

// >1px overflow tolerance: exactly +1px is still fitting.
{
    const widths = [80, 300, 250, 250, 407]; // 1287 at 1286 center.
    const fixture = buildFixture({ state: defaultState().map((entry, index) => ({ ...entry, width: widths[index] })) });
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0);
}

// Minimum-impossible mobile overflow must remain horizontally scrollable/native.
for (const centerWidth of [390, 320]) {
    const fixture = buildFixture({ centerWidth });
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0, `${centerWidth}px minimum overflow was incorrectly normalized`);
}

// Explicit fail-closed sizing/layout cases.
for (const [label, overrides] of [
    ['pinned', { pinnedById: { '1': 'left' } }],
    ['flex', { flexById: { '1': 1 } }],
    ['unknown-flex', { flexById: { '1': Number.NaN } }],
    ['suppress-size-to-fit', { suppressIds: ['1'] }],
    ['zero-center', { centerWidth: 0 }],
    ['missing-center', { missingCenter: true }],
    ['unsupported-layout', { domLayout: 'autoHeight' }],
    ['unsupported-row-model', { rowModelType: 'serverSide' }],
    ['auto-size-strategy', { autoSizeStrategy: { type: 'fitGridWidth' } }],
    ['suppressed-horizontal-scroll', { suppressHorizontalScroll: true }],
    ['invalid-minimum', { minById: { '1': Number.NaN } }],
    ['incoherent-maximum', { maxById: { '1': 90 } }],
]) {
    const fixture = buildFixture(overrides);
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0, `${label} did not fail closed`);
}

// Scope falsification: wrong form, wrong columns, absent wrapper and non-callable
// host callback must prevent production attachment itself.
for (const [label, overrides] of [
    ['wrong-form', { formId: 202 }],
    ['wrong-columns', { columnDefs: ['id', '1', '3', '999', 'date_created'] }],
    ['absent-wrapper', { wrapperPresent: false }],
    ['non-callable-prior', { nonCallablePrevious: true }],
]) {
    const fixture = buildFixture(overrides);
    if (typeof fixture.options.onGridSizeChanged === 'function') {
        deliver(fixture);
    }
    assert.equal(fixture.sizeCalls(), 0, `${label} unexpectedly admitted Candidate C`);
    if (label === 'non-callable-prior') assert.equal(fixture.options.onGridSizeChanged, 'invalid');
}

// Missing/ambiguous first opportunity is consumed and cannot be rescued by a
// later event in the same unknown mount.
{
    const fixture = buildFixture();
    fixture.options.onGridSizeChanged.call(fixture.priorReceiver, { type: 'gridSizeChanged' });
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0);
}

// Later shrink/grow/manual/API/Live Refresh related deliveries are inert after
// the first same-mount opportunity has been consumed.
{
    const fitting = defaultState().map((entry, index) => ({ ...entry, width: [80, 200, 200, 200, 200][index] }));
    const fixture = buildFixture({ state: fitting });
    deliver(fixture);
    fixture.setWidths([165, 528, 414, 355, 410]);
    for (const type of ['gridSizeChanged', 'columnResized', 'dragStopped', 'modelUpdated', 'gridSizeChanged']) {
        fixture.setType(type);
        deliver(fixture);
    }
    assert.equal(fixture.sizeCalls(), 0, 'later same-mount lifecycle re-entered Candidate C');
}

// Candidate C still classifies final effective initial geometry. Wider recovery
// is separately provenance-gated by the new regression tests.
{
    const fixture = buildFixture({
        state: defaultState().map((entry, index) => ({ ...entry, width: [80, 200, 200, 200, 200][index] })),
        beforeEvaluation(state) {
            [165, 528, 414, 355, 410].forEach((width, index) => { state[index].width = width; });
        },
    });
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 1, 'pre-guard unrelated API geometry was not evaluated as final effective geometry');
}
{
    const fixture = buildFixture({
        beforeEvaluation(state) {
            [80, 200, 200, 200, 200].forEach((width, index) => { state[index].width = width; });
        },
    });
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0, 'unprovenanced guard repaired geometry that prior callback made fitting');
}

// New native API identity gets one new opportunity; same old identity remains inert.
{
    const fixture = buildFixture();
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 1);
    fixture.setWidths([165, 528, 414, 355, 410]);
    const newApi = { ...fixture.api };
    fixture.setApi(newApi);
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 2, 'new native Grid/API identity did not receive a fresh one-shot opportunity');
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 2);
}

// Hidden/non-default order/sort state can coexist with repair; Candidate C itself
// does not manufacture or rewrite any non-width property.
{
    const state = [
        { colId: '6', width: 355, hide: false, sort: 'asc', sortIndex: 0, pinned: null, extra: 'keep-school' },
        { colId: 'id', width: 165, hide: false, sort: null, sortIndex: null, pinned: null, extra: 'keep-id' },
        { colId: 'date_created', width: 410, hide: false, sort: 'desc', sortIndex: 1, pinned: null, extra: 'keep-date' },
        { colId: '1', width: 528, hide: true, sort: null, sortIndex: null, pinned: null, extra: 'keep-hidden' },
        { colId: '3', width: 414, hide: false, sort: null, sortIndex: null, pinned: null, extra: 'keep-national' },
    ];
    const fixture = buildFixture({ state, centerWidth: 900 });
    const before = nonWidthState(clone(fixture.state));
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 1, 'hidden-column fixture should still repair displayed fit-capable overflow');
    assert.deepEqual(nonWidthState(fixture.state), before, 'Candidate C changed non-width state');
}

// Malformed/mismatched native state is not reset or recovered by Candidate C.
for (const malformedState of [
    defaultState().slice(0, 4),
    defaultState().map((entry, index) => index === 2 ? { ...entry, colId: '999' } : entry),
]) {
    const fixture = buildFixture({ malformedState });
    const before = clone(fixture.state);
    deliver(fixture);
    assert.equal(fixture.sizeCalls(), 0);
    assert.deepEqual(fixture.state, before);
}

const result = {
    status: 'PASS',
    mode: 'PRODUCTION_ASSET_ISOLATED_CONTRACT',
    production_source: 'assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js',
    assertions: {
        production_asset_exercised: true,
        prior_receiver_arguments_return_preserved: true,
        prior_exception_propagates_and_consumes: true,
        stale_fit_capable_repairs_once: true,
        clean_and_fitting_unchanged: true,
        tolerance_one_px: true,
        mobile_minimum_overflow_unchanged: true,
        pinned_flex_and_unsupported_modes_fail_closed: true,
        scope_falsification: true,
        later_same_mount_lifecycle_inert_without_provenance: true,
        initial_effective_geometry_classification_preserved: true,
        new_api_identity_new_opportunity: true,
        hidden_and_non_width_state_preserved: true,
        malformed_native_state_not_reset: true,
    },
};

if (process.env.WU21_ARTIFACT_DIR) {
    fs.mkdirSync(process.env.WU21_ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(process.env.WU21_ARTIFACT_DIR, 'inbox-width-candidate-c-production-unit.json'),
        JSON.stringify(result, null, 2) + '\n'
    );
}

console.log('INBOX_WIDTH_CANDIDATE_C_PRODUCTION_UNIT_PASS');
