import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const productionPath = path.resolve('assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js');
const source = fs.readFileSync(productionPath, 'utf8');
const placeholder = '__GPP_INITIAL_GEOMETRY_CONTRACT__';
const contract = {form_id: 101, column_ids: ['id', '1', '3', '6', 'date_created']};
const provenanceKey = 'gpp:srwf-inbox-fit:v1:101:grid-1';
const minima = {id: 80, '1': 100, '3': 100, '6': 100, date_created: 150};
const staleWidths = [165, 528, 414, 355, 410];

assert.equal(source.split(placeholder).length - 1, 1);
for (const forbidden of ['sessionStorage', 'ResizeObserver', 'MutationObserver', 'setInterval(', 'onGridReady', 'columnEverythingChanged', 'setColumnWidth', 'applyColumnState', 'enableRtl']) {
  assert.equal(source.includes(forbidden), false, forbidden);
}
for (const required of ["const PROVENANCE_PREFIX = 'gpp:srwf-inbox-fit:v1:'", "addEventListener('columnResized'", "removeEventListener('columnResized'", "event.source === 'sizeColumnsToFit'", 'GROW_DEBOUNCE_MS = 180', 'GROW_MIN_DELTA_PX = 24']) {
  assert.equal(source.includes(required), true, required);
}
assert.equal(source.includes('options.onColumnResized = function'), false, 'host-owned GridOptions resize callback must not be replaced');

const clone = value => JSON.parse(JSON.stringify(value));
const stateFrom = widths => contract.column_ids.map((colId, index) => ({colId, width: widths[index], hide: false, sort: null, sortIndex: null, pinned: null}));
class MemoryStorage {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

function fixture(overrides = {}) {
  const state = clone(overrides.state ?? stateFrom(staleWidths));
  const center = {clientWidth: overrides.centerWidth ?? 1286};
  const storage = overrides.storage ?? new MemoryStorage();
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let sizeCalls = 0;
  let priorCalls = 0;
  let priorThrows = Boolean(overrides.priorThrowsOnce);
  const priorReturn = {native: true};
  let params;

  const root = {
    dataset: {gridId: 'grid-1'},
    querySelector(selector) {
      if (selector === '.ag-root-wrapper') return null;
      if (selector === '.ag-center-cols-viewport') return overrides.missingCenter ? null : center;
      return null;
    },
    closest(selector) { return selector === '[data-gpp-inbox-surface="gravity_flow.inbox"]' ? {} : null; },
  };
  const defs = new Map(state.map(entry => [String(entry.colId), {suppressSizeToFit: Boolean(overrides.suppressIds?.includes(String(entry.colId)))}]));
  const columnFor = entry => ({
    getColId: () => String(entry.colId),
    getActualWidth: () => entry.width,
    getMinWidth: () => overrides.minById?.[String(entry.colId)] ?? minima[String(entry.colId)],
    getMaxWidth: () => overrides.maxById?.[String(entry.colId)] ?? null,
    getPinned: () => overrides.pinnedById?.[String(entry.colId)] ?? entry.pinned ?? null,
    getFlex: () => Object.prototype.hasOwnProperty.call(overrides.flexById ?? {}, String(entry.colId)) ? overrides.flexById[String(entry.colId)] : 0,
    getColDef: () => defs.get(String(entry.colId)),
  });
  const columnApi = {
    getColumnState: () => clone(overrides.malformedState ?? state),
    getAllDisplayedColumns: () => state.filter(entry => !entry.hide).map(columnFor),
  };
  const emit = (name, event) => { for (const listener of listeners.get(name) ?? []) listener(event); };
  const api = {
    addEventListener(name, listener) { listeners.set(name, [...(listeners.get(name) ?? []), listener]); },
    removeEventListener(name, listener) { listeners.set(name, (listeners.get(name) ?? []).filter(item => item !== listener)); },
    sizeColumnsToFit() {
      sizeCalls += 1;
      const displayed = state.filter(entry => !entry.hide);
      const total = displayed.reduce((sum, entry) => sum + entry.width, 0);
      const scale = total > 0 ? center.clientWidth / total : 1;
      displayed.forEach(entry => { entry.width = Math.max(minima[String(entry.colId)] ?? 1, entry.width * scale); });
      emit('columnResized', {type: 'columnResized', source: 'sizeColumnsToFit', finished: true, api, columnApi});
    },
  };
  const previous = overrides.previous === null ? null : function () {
    priorCalls += 1;
    if (priorThrows) { priorThrows = false; throw new Error('native-prior-failure'); }
    return priorReturn;
  };
  const options = {
    columnDefs: (overrides.columnDefs ?? contract.column_ids).map(field => ({field})),
    searchArgs: {form_id: overrides.formId ?? '101'},
    onGridSizeChanged: overrides.nonCallablePrevious ? 'invalid' : previous,
  };
  for (const key of ['domLayout', 'rowModelType', 'autoSizeStrategy', 'suppressHorizontalScroll']) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) options[key] = overrides[key];
  }
  params = {type: 'gridSizeChanged', api, columnApi};
  const gflow_config = {grids: {'grid-1': {grid_options: options}}};
  const window = {
    gflow_config,
    localStorage: storage,
    setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const document = {
    querySelectorAll: () => overrides.wrapperPresent === false ? [] : [root],
    contains: candidate => candidate === root,
  };
  vm.runInNewContext(source.replace(placeholder, JSON.stringify(contract)), {window, document, gflow_config, Reflect, Number, Array, Object, String, Set, JSON, Math}, {filename: productionPath});

  return {
    state, center, storage, params, options, api, columnApi, priorReturn,
    deliver() { return options.onGridSizeChanged.call({api}, params, 'second'); },
    resize(sourceName, finished = true) { emit('columnResized', {type: 'columnResized', source: sourceName, finished, api, columnApi}); },
    setWidths(widths) { state.forEach((entry, index) => { entry.width = widths[index]; }); },
    setCenter(width) { center.clientWidth = width; },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    pendingTimers: () => timers.size,
    sizeCalls: () => sizeCalls,
    priorCalls: () => priorCalls,
  };
}

// Released one-shot initial overflow behavior remains intact and composes prior callback.
{
  const f = fixture();
  assert.equal(f.deliver(), f.priorReturn);
  assert.equal(f.priorCalls(), 1);
  assert.equal(f.sizeCalls(), 1);
  assert.equal(JSON.parse(f.storage.getItem(provenanceKey)).kind, 'auto_fit');
  f.deliver();
  f.flushTimers();
  assert.equal(f.sizeCalls(), 1);
}
{ const f = fixture({priorThrowsOnce: true}); assert.throws(() => f.deliver(), /native-prior-failure/); f.deliver(); assert.equal(f.sizeCalls(), 0); }

// Legitimate minimum-impossible overflow and unsupported sizing modes remain native/fail-closed.
for (const width of [390, 320]) { const f = fixture({centerWidth: width}); f.deliver(); assert.equal(f.sizeCalls(), 0); }
for (const overrides of [{pinnedById: {'1': 'left'}}, {flexById: {'1': 1}}, {domLayout: 'autoHeight'}, {rowModelType: 'serverSide'}, {suppressIds: ['1']}]) {
  const f = fixture(overrides); f.deliver(); assert.equal(f.sizeCalls(), 0);
}

// Unknown fitting underfill has no provenance and remains untouched.
{
  const widths = [100, 350, 300, 250, 350];
  const f = fixture({centerWidth: 1500, state: stateFrom(widths)});
  f.deliver();
  assert.equal(f.sizeCalls(), 0);
  assert.deepEqual(f.state.map(entry => entry.width), widths);
}

// Narrow GPP fit provenance survives a new mount and authorizes direct wider reload recovery.
{
  const storage = new MemoryStorage();
  const narrow = fixture({storage, centerWidth: 1286});
  narrow.deliver();
  const narrowWidths = narrow.state.map(entry => entry.width);
  assert.ok(storage.getItem(provenanceKey));
  const wide = fixture({storage, centerWidth: 1526, state: stateFrom(narrowWidths)});
  wide.deliver();
  assert.equal(wide.sizeCalls(), 1);
  assert.ok(Math.abs(wide.state.reduce((sum, entry) => sum + entry.width, 0) - 1526) <= 1);
}

// Same-mount grow is settled/debounced and can fit at most once.
{
  const f = fixture({centerWidth: 1286});
  f.deliver();
  f.setCenter(1400); f.deliver();
  f.setCenter(1460); f.deliver();
  f.setCenter(1526); f.deliver();
  assert.equal(f.sizeCalls(), 1);
  assert.equal(f.pendingTimers(), 1);
  f.flushTimers();
  assert.equal(f.sizeCalls(), 2);
  f.setCenter(1700); f.deliver(); f.flushTimers();
  assert.equal(f.sizeCalls(), 2);
}

// Completed manual/API width mutations revoke GPP provenance through the public
// Grid event seam; the manual widths remain untouched live and after reload.
{
  const storage = new MemoryStorage();
  const f = fixture({storage, centerWidth: 1286});
  f.deliver();
  const manual = f.state.map(entry => entry.width);
  manual[1] -= 120;
  f.setWidths(manual);
  f.resize('uiColumnDragged', true);
  assert.equal(storage.getItem(provenanceKey), null);
  f.setCenter(1526); f.deliver(); f.flushTimers();
  assert.equal(f.sizeCalls(), 1);
  assert.deepEqual(f.state.map(entry => entry.width), manual);
  const reloaded = fixture({storage, centerWidth: 1526, state: stateFrom(manual)});
  reloaded.deliver();
  assert.equal(reloaded.sizeCalls(), 0);
  assert.deepEqual(reloaded.state.map(entry => entry.width), manual);
}

// Malformed provenance cannot authorize recovery and is discarded.
{
  const storage = new MemoryStorage({[provenanceKey]: '{invalid-json'});
  const widths = [80, 200, 200, 200, 200];
  const f = fixture({storage, centerWidth: 1526, state: stateFrom(widths)});
  f.deliver();
  assert.equal(f.sizeCalls(), 0);
  assert.equal(storage.getItem(provenanceKey), null);
}

const result = {status: 'PASS', mode: 'PRODUCTION_BIDIRECTIONAL_FIT_ISOLATED_CONTRACT', assertions: {
  released_initial_overflow_preserved: true,
  prior_callback_semantics_preserved: true,
  minimum_overflow_preserved: true,
  unsupported_sizing_fails_closed: true,
  unproven_underfill_unchanged: true,
  direct_reload_grow_recovery: true,
  live_grow_debounced_once: true,
  manual_resize_revokes_provenance: true,
  malformed_provenance_discarded: true,
}};
if (process.env.WU21_ARTIFACT_DIR) fs.writeFileSync(path.join(process.env.WU21_ARTIFACT_DIR, 'inbox-width-bidirectional-fit-unit.json'), JSON.stringify(result, null, 2) + '\n');
console.log('INBOX_WIDTH_BIDIRECTIONAL_FIT_UNIT_PASS');
