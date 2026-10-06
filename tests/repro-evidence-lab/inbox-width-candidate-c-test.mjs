import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const productionPath = path.resolve('assets/js/srwf-gravity-flow-inbox-initial-geometry-guard.js');
const source = fs.readFileSync(productionPath, 'utf8');
const placeholder = '__GPP_INITIAL_GEOMETRY_CONTRACT__';
const contract = {form_id: 101, column_ids: ['id', '1', '3', '6', 'date_created']};
const minima = {id: 80, '1': 100, '3': 100, '6': 100, date_created: 150};
const staleWidths = [165, 528, 414, 355, 410];
const fittingWidths = [80, 200, 200, 200, 200];

assert.equal(source.split(placeholder).length - 1, 1);
for (const forbidden of ['sessionStorage','ResizeObserver','MutationObserver','setInterval(','onGridReady','columnEverythingChanged','setColumnWidth','applyColumnState','enableRtl']) assert.equal(source.includes(forbidden), false, forbidden);
for (const required of ['localStorage','onColumnResized','sizeColumnsToFit()','GROW_SETTLE_MS','GROW_MIN_DELTA_PX']) assert.equal(source.includes(required), true, required);

const baseState = widths => contract.column_ids.map((colId, index) => ({colId, width: widths[index], hide: false, sort: null, sortIndex: null, pinned: null}));
const clone = value => JSON.parse(JSON.stringify(value));
const nonWidth = state => state.map(({width, ...rest}) => rest);
function makeStorage() {
  const map = new Map();
  return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(String(k),String(v)),removeItem:k=>map.delete(String(k)),snapshot:()=>Object.fromEntries(map)};
}
const provKeys = storage => storage ? Object.keys(storage.snapshot()).filter(key => key.startsWith('gpp:srwf-inbox-fit:v1:')) : [];

function fixture(o = {}) {
  const state = clone(o.state ?? baseState(staleWidths));
  const center = {clientWidth: o.centerWidth ?? 1286};
  const storage = Object.prototype.hasOwnProperty.call(o, 'storage') ? o.storage : makeStorage();
  const root = {
    dataset: {gridId: 'grid-1'},
    querySelector: selector => selector === '.ag-root-wrapper' ? null : selector === '.ag-center-cols-viewport' ? (o.missingCenter ? null : center) : null,
    closest: selector => o.scopeActive === false ? null : selector === '[data-gpp-inbox-surface="gravity_flow.inbox"]' ? {} : null,
  };
  let sizeCalls = 0, sizePriorCalls = 0, resizePriorCalls = 0, reentrant = !!o.reentrant, nextTimer = 1;
  const timers = new Map(), sizeReceiver = {}, resizeReceiver = {}, sizeReturn = {}, resizeReturn = {};
  const defs = new Map(state.map(entry => [String(entry.colId), {suppressSizeToFit: !!o.suppressIds?.includes(String(entry.colId))}]));
  const columnFor = entry => ({
    getColId:()=>String(entry.colId), getActualWidth:()=>entry.width,
    getMinWidth:()=>o.minById?.[entry.colId] ?? minima[entry.colId], getMaxWidth:()=>o.maxById?.[entry.colId] ?? null,
    getPinned:()=>o.pinnedById?.[entry.colId] ?? entry.pinned ?? null,
    getFlex:()=>Object.prototype.hasOwnProperty.call(o.flexById ?? {}, entry.colId) ? o.flexById[entry.colId] : 0,
    getColDef:()=>defs.get(String(entry.colId)),
  });
  const columnApi = {
    getColumnState:()=>clone(o.malformedState ?? state),
    getAllDisplayedColumns:()=>state.filter(entry=>!entry.hide).map(columnFor),
  };
  let throwPrior = !!o.priorThrowsOnce;
  const previousSize = function () { sizePriorCalls++; if (o.beforeEvaluation) o.beforeEvaluation(state); if (throwPrior) {throwPrior=false; throw new Error('native-prior-failure');} return sizeReturn; };
  const previousResize = function () { resizePriorCalls++; return resizeReturn; };
  const options = {
    columnDefs: (o.columnDefs ?? contract.column_ids).map(field=>({field})), searchArgs:{form_id:o.formId ?? '101'},
    onGridSizeChanged:o.badSizePrior?'bad':previousSize, onColumnResized:o.badResizePrior?'bad':previousResize,
  };
  for (const key of ['domLayout','rowModelType','autoSizeStrategy','suppressHorizontalScroll']) if (Object.prototype.hasOwnProperty.call(o,key)) options[key]=o[key];
  const api = {sizeColumnsToFit(){
    sizeCalls++;
    const displayed=state.filter(entry=>!entry.hide), total=displayed.reduce((sum,entry)=>sum+entry.width,0), scale=center.clientWidth/total;
    for (const entry of displayed) entry.width=Math.max(minima[entry.colId] ?? 1, entry.width*scale);
    options.onColumnResized?.call(resizeReceiver,{type:'columnResized',source:'sizeColumnsToFit',finished:true,api,columnApi});
    if (reentrant) {reentrant=false; options.onGridSizeChanged.call(sizeReceiver,params);}
  }};
  const params={type:'gridSizeChanged',api,columnApi};
  const gflow_config={grids:{'grid-1':{grid_options:options}}};
  const window={gflow_config,setTimeout:cb=>{const id=nextTimer++;timers.set(id,cb);return id;},clearTimeout:id=>timers.delete(id)};
  if (storage) window.localStorage=storage;
  const document={querySelectorAll:()=>o.wrapperPresent===false?[]:[root],contains:candidate=>o.scopeActive===false?false:candidate===root};
  vm.runInNewContext(source.replace(placeholder,JSON.stringify(contract)),{window,document,gflow_config,Reflect,Number,Array,Object,String,Set,JSON,Math},{filename:productionPath});
  return {
    state,center,storage,options,params,api,columnApi,sizeReceiver,resizeReceiver,sizeReturn,resizeReturn,
    sizeCalls:()=>sizeCalls,sizePriorCalls:()=>sizePriorCalls,resizePriorCalls:()=>resizePriorCalls,
    deliver(){return options.onGridSizeChanged.call(sizeReceiver,params,'second');},
    resize(source='uiColumnDragged'){return options.onColumnResized.call(resizeReceiver,{type:'columnResized',source,finished:true,api:params.api,columnApi},'second');},
    setWidths(widths){state.forEach((entry,index)=>entry.width=widths[index]);}, setCenter(width){center.clientWidth=width;}, setApi(next){params.api=next;},
    pending:()=>timers.size, flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(cb=>cb());},
  };
}

// Existing one-shot contract and callback composition.
{
  const f=fixture(); assert.equal(f.deliver(),f.sizeReturn); assert.equal(f.sizePriorCalls(),1); assert.equal(f.sizeCalls(),1); assert.equal(provKeys(f.storage).length,1); f.deliver(); assert.equal(f.sizeCalls(),1);
  assert.equal(f.resize('uiColumnDragged'),f.resizeReturn); assert.ok(f.resizePriorCalls()>=2);
}
{ const f=fixture({reentrant:true}); f.deliver(); assert.equal(f.sizeCalls(),1); }
{ const f=fixture({priorThrowsOnce:true}); assert.throws(()=>f.deliver(),/native-prior-failure/); f.deliver(); assert.equal(f.sizeCalls(),0); }
for (const widths of [[80,340,286,250,330],fittingWidths]) { const f=fixture({state:baseState(widths)}), before=clone(f.state); f.deliver(); assert.equal(f.sizeCalls(),0); assert.deepEqual(f.state,before); }
{ const f=fixture({state:baseState([80,300,250,250,407])}); f.deliver(); assert.equal(f.sizeCalls(),0); }
for (const centerWidth of [390,320]) { const f=fixture({centerWidth}); f.deliver(); assert.equal(f.sizeCalls(),0); }

// Existing fail-closed boundaries.
for (const [label,o] of [
  ['pinned',{pinnedById:{'1':'left'}}],['flex',{flexById:{'1':1}}],['unknown-flex',{flexById:{'1':Number.NaN}}],
  ['suppress',{suppressIds:['1']}],['zero',{centerWidth:0}],['missing-center',{missingCenter:true}],['layout',{domLayout:'autoHeight'}],
  ['row-model',{rowModelType:'serverSide'}],['auto-size',{autoSizeStrategy:{type:'fitGridWidth'}}],['scroll',{suppressHorizontalScroll:true}],
  ['min',{minById:{'1':Number.NaN}}],['max',{maxById:{'1':90}}],
]) { const f=fixture(o); f.deliver(); assert.equal(f.sizeCalls(),0,label); }
for (const o of [{formId:202},{columnDefs:['id','1','3','999','date_created']},{wrapperPresent:false},{badSizePrior:true},{badResizePrior:true}]) { const f=fixture(o); if(typeof f.options.onGridSizeChanged==='function')f.deliver(); assert.equal(f.sizeCalls(),0); }
for (const malformedState of [baseState(staleWidths).slice(0,4),baseState(staleWidths).map((entry,index)=>index===2?{...entry,colId:'999'}:entry)]) { const f=fixture({malformedState}),before=clone(f.state); f.deliver(); assert.equal(f.sizeCalls(),0); assert.deepEqual(f.state,before); }

// Prior callback final effective geometry and fresh API identity remain supported.
{ const f=fixture({state:baseState(fittingWidths),beforeEvaluation:s=>staleWidths.forEach((w,i)=>s[i].width=w)}); f.deliver(); assert.equal(f.sizeCalls(),1); }
{ const f=fixture({beforeEvaluation:s=>fittingWidths.forEach((w,i)=>s[i].width=w)}); f.deliver(); assert.equal(f.sizeCalls(),0); }
{ const f=fixture(); f.deliver(); f.setWidths(staleWidths); f.setApi({...f.api}); f.deliver(); assert.equal(f.sizeCalls(),2); f.deliver(); assert.equal(f.sizeCalls(),2); }

// Non-width state remains host-owned.
{
  const state=[
    {colId:'6',width:355,hide:false,sort:'asc',sortIndex:0,pinned:null,extra:'school'}, {colId:'id',width:165,hide:false,sort:null,sortIndex:null,pinned:null,extra:'id'},
    {colId:'date_created',width:410,hide:false,sort:'desc',sortIndex:1,pinned:null,extra:'date'}, {colId:'1',width:528,hide:true,sort:null,sortIndex:null,pinned:null,extra:'hidden'},
    {colId:'3',width:414,hide:false,sort:null,sortIndex:null,pinned:null,extra:'national'},
  ];
  const f=fixture({state,centerWidth:900}),before=nonWidth(clone(f.state)); f.deliver(); assert.equal(f.sizeCalls(),1); assert.deepEqual(nonWidth(f.state),before);
}

// New bounded grow recovery: one settled live grow only.
{
  const f=fixture(); f.deliver(); const narrow=clone(f.state); f.setCenter(1500); f.deliver(); f.setCenter(1600); f.deliver(); assert.equal(f.pending(),1); assert.deepEqual(f.state,narrow); f.flush();
  assert.equal(f.sizeCalls(),2); assert.ok(Math.abs(f.state.reduce((sum,e)=>sum+e.width,0)-1600)<=1); f.setCenter(1800); f.deliver(); f.flush(); assert.equal(f.sizeCalls(),2);
}

// Direct wider reload survives authentic startup source=api restore.
{
  const storage=makeStorage(), narrow=fixture({storage}); narrow.deliver(); const persisted=narrow.state.map(e=>e.width); assert.equal(provKeys(storage).length,1);
  const wide=fixture({storage,centerWidth:1600,state:baseState(persisted)}); wide.resize('api'); assert.equal(provKeys(storage).length,1); wide.deliver(); assert.equal(wide.sizeCalls(),1); assert.ok(Math.abs(wide.state.reduce((s,e)=>s+e.width,0)-1600)<=1);
}

// Manual/API changes revoke provenance and are not undone live or on reload.
{
  const storage=makeStorage(), f=fixture({storage}); f.deliver(); f.state[4].width+=75; f.resize('uiColumnDragged'); assert.equal(provKeys(storage).length,0); const manual=f.state.map(e=>e.width);
  f.setCenter(1600); f.deliver(); f.flush(); assert.equal(f.sizeCalls(),1); assert.deepEqual(f.state.map(e=>e.width),manual);
  const reload=fixture({storage,centerWidth:1600,state:baseState(manual)}); reload.resize('api'); reload.deliver(); assert.equal(reload.sizeCalls(),0); assert.deepEqual(reload.state.map(e=>e.width),manual);
}
{ const f=fixture(); f.deliver(); f.state[1].width+=25; f.resize('api'); assert.equal(provKeys(f.storage).length,0); }
{ const f=fixture(); f.deliver(); f.setCenter(1600); f.deliver(); assert.equal(f.pending(),1); f.state[2].width+=20; f.resize(); assert.equal(f.pending(),0); f.flush(); assert.equal(f.sizeCalls(),1); }

// Provenance mismatch is discarded; storage failure cannot break initial overflow repair.
{
  const storage=makeStorage(), f=fixture({storage}); f.deliver(); const mismatched=clone(f.state); mismatched[1].width+=12; const wide=fixture({storage,centerWidth:1600,state:mismatched}); wide.resize('api'); wide.deliver(); assert.equal(wide.sizeCalls(),0); assert.equal(provKeys(storage).length,0);
}
{ const f=fixture({storage:null}); f.deliver(); assert.equal(f.sizeCalls(),1); }

const result={status:'PASS',mode:'PRODUCTION_ASSET_ISOLATED_CONTRACT',assertions:{
  existing_one_shot_and_fail_closed_contracts_preserved:true, prior_callbacks_preserved:true, non_width_state_preserved:true,
  minimum_overflow_unchanged:true, live_material_grow_once:true, direct_reload_wider_recovery:true,
  startup_restore_preserves_provenance:true, manual_and_api_resize_revoke_provenance:true, storage_failure_preserves_initial_repair:true,
}};
if(process.env.WU21_ARTIFACT_DIR){fs.mkdirSync(process.env.WU21_ARTIFACT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.WU21_ARTIFACT_DIR,'inbox-width-candidate-c-production-unit.json'),JSON.stringify(result,null,2)+'\n');}
console.log('INBOX_WIDTH_CANDIDATE_C_PRODUCTION_UNIT_PASS');
