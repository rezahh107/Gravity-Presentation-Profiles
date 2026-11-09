/**
 * WU21 test-only Native Inbox readiness observer for pinned Gravity Flow 3.1.0.
 * Never creates tasks, changes authorization, or modifies vendor source.
 */
import assert from 'node:assert/strict';

function nativeBootstrap({withholdInitialData=false}={}) {
  const events=[];
  const state={events,patched:0,api:null,withholdInitialData};
  Object.defineProperty(window,'__ciq2NativeReadiness',{value:state,configurable:true});
  let config;
  function record(name,api,gridId){
    let count=null;
    try{if(api && typeof api.getDisplayedRowCount==='function')count=api.getDisplayedRowCount();}
    catch{events.push({name:'observer_read_error',gridId});}
    events.push({name,gridId,count});
    if(events.length>80)events.shift();
    if(api && typeof api.getDisplayedRowCount==='function')state.api=api;
  }
  function patch(value){
    for(const [gridId,grid] of Object.entries(value?.grids||{})){
      const options=grid?.grid_options;
      if(!options || options.__ciq2NativeObserved)continue;
      Object.defineProperty(options,'__ciq2NativeObserved',{value:true,enumerable:false});
      if(state.withholdInitialData){
        // Negative only: prevent initial data transfer, then restore through
        // the actual AG Grid public API. Original callbacks are not replaced.
        let originalRows=options.rowData;
        Object.defineProperty(options,'rowData',{
          configurable:true,enumerable:true,
          get(){return state.withholdInitialData?undefined:originalRows;},
          set(rows){originalRows=rows;}
        });
        state.releaseRows=()=>{
          if(!state.api)throw Error('NATIVE_RELEASE_GRID_API_MISSING');
          state.withholdInitialData=false;
          if(typeof state.api.setGridOption==='function')state.api.setGridOption('rowData',originalRows);
          else if(typeof state.api.setRowData==='function')state.api.setRowData(originalRows);
          else throw Error('NATIVE_RELEASE_PUBLIC_API_MISSING');
          record('controlled_data_released',state.api,gridId);
        };
        record('controlled_data_withheld',null,gridId);
      }
      for(const [key,label] of [
        ['onGridReady','gridReady'],['onFirstDataRendered','firstDataRendered'],
        ['onModelUpdated','modelUpdated'],['onRowDataUpdated','rowDataUpdated'],
        ['onGridSizeChanged','gridSizeChanged'],['onPaginationChanged','paginationChanged']
      ]){
        const original=options[key];
        options[key]=function(event){
          let result;
          try{if(typeof original==='function')result=original.apply(this,arguments);}
          catch(error){record('original_callback_error_'+label,event?.api,gridId);throw error;}
          record(label,event?.api,gridId);
          return result;
        };
      }
      state.patched++;
      record('callback_wrappers_installed',null,gridId);
    }
  }
  Object.defineProperty(window,'gflow_config',{
    enumerable:true,configurable:true,
    get(){return config;},
    set(value){config=value;patch(value);}
  });
}

/** Register BEFORE navigation, including when the expected task list is empty. */
export async function instrumentNativeInbox(page,options={}){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.name||'JavaScriptError'));
  await page.addInitScript(nativeBootstrap,options);
  return {errors};
}

// Function bodies below execute inside Chromium (no closure dependencies).
function browserSnapshot(){
  const state=window.__ciq2NativeReadiness;
  const root=document.querySelector('[data-js="gflow-inbox"]');
  const gridId=root?.dataset.gridId;
  const grid=window.gflow_config?.grids?.[gridId];
  const options=grid?.grid_options;
  const api=state?.api || options?.api || grid?.api;
  const ids=[];
  let count=null;
  try {
    if(typeof api?.getDisplayedRowCount==='function')count=api.getDisplayedRowCount();
    if(typeof api?.forEachNodeAfterFilterAndSort==='function')
      api.forEachNodeAfterFilterAndSort(node=>ids.push(Number(node?.data?.id)));
  }catch{return {reason:'NATIVE_ROW_MODEL_READ_ERROR'};}
  const visible=el=>!!el && !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
  const initial=options?.rowData;
  return {
    installed:!!state,patched:state?.patched||0,
    events:(state?.events||[]).slice(),root:!!root,
    gridWrapper:!!root?.querySelector('.ag-root-wrapper'),
    initialIds:Array.isArray(initial)?initial.map(row=>Number(row?.id)):null,
    modelCount:count,modelIds:ids,
    emptyOverlay:visible(root?.querySelector('.ag-overlay-no-rows-center')),
    loadingOverlay:visible(root?.querySelector('.ag-overlay-loading-center')),
    domIds:[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')]
      .map(node=>Number(node.getAttribute('row-id')))
  };
}
function browserReady(){
  const state=window.__ciq2NativeReadiness;
  const root=document.querySelector('[data-js="gflow-inbox"]');
  const grid=window.gflow_config?.grids?.[root?.dataset.gridId];
  const opts=grid?.grid_options;
  const api=state?.api||opts?.api||grid?.api;
  if(!state?.patched||!root?.querySelector('.ag-root-wrapper'))return false;
  if(!state.events.some(e=>e.name==='paginationChanged') ||
     !state.events.some(e=>e.name==='gridSizeChanged'))return false;
  if(!Array.isArray(opts?.rowData)||typeof api?.getDisplayedRowCount!=='function' ||
     typeof api?.forEachNodeAfterFilterAndSort!=='function')return false;
  try {
    const expected=opts.rowData.map(row=>Number(row?.id)).sort((a,b)=>a-b);
    const actual=[];
    api.forEachNodeAfterFilterAndSort(row=>actual.push(Number(row?.data?.id)));
    actual.sort((a,b)=>a-b);
    if(expected.length!==actual.length||api.getDisplayedRowCount()!==expected.length ||
       actual.some((id,i)=>id!==expected[i]))return false;
    const dom=[...root.querySelectorAll('.ag-center-cols-container .ag-row[row-id]')]
      .map(node=>Number(node.getAttribute('row-id'))).sort((a,b)=>a-b);
    if(dom.length!==expected.length||dom.some((id,i)=>id!==expected[i]))return false;
    const visible=el=>!!el && !!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
    if(visible(root.querySelector('.ag-overlay-loading-center')))return false;
    if(expected.length===0)return visible(root.querySelector('.ag-overlay-no-rows-center'));
    return state.events.some(e=>e.name==='firstDataRendered' && e.count===expected.length);
  }catch{return false;}
}
export async function nativeSnapshot(page){return page.evaluate(browserSnapshot);}
const sorted=ids=>[...ids].sort((a,b)=>a-b);
function equalIds(a,b){
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
    sorted(a).every((id,i)=>id===sorted(b)[i]);
}
export function nativeReadinessFailure(s){
  if(s.reason)return s.reason;
  if(!s.installed||!s.patched)return 'NATIVE_CALLBACK_INSTRUMENTATION_MISSING';
  if(!s.root||!s.gridWrapper)return 'NATIVE_GRID_NOT_CONSTRUCTED';
  if(!s.events.some(e=>e.name==='paginationChanged') ||
     !s.events.some(e=>e.name==='gridSizeChanged'))
    return 'NATIVE_INITIAL_LIFECYCLE_INCOMPLETE';
  if(s.modelCount===null||!Array.isArray(s.modelIds))return 'NATIVE_MODEL_UNAVAILABLE';
  if(!Array.isArray(s.initialIds))return 'NATIVE_INITIAL_DATA_NOT_AVAILABLE';
  if(s.modelCount!==s.initialIds.length||!equalIds(s.modelIds,s.initialIds))
    return 'NATIVE_INITIAL_DATA_NOT_APPLIED';
  if(!equalIds(s.domIds,s.modelIds))return 'NATIVE_RENDERED_MODEL_INCOMPLETE';
  if(s.loadingOverlay)return 'NATIVE_LOADING_OVERLAY_VISIBLE';
  if(s.initialIds.length===0){
    if(!s.emptyOverlay)return 'NATIVE_EMPTY_MODEL_NOT_COMPLETED';
  }else if(!s.events.some(e=>e.name==='firstDataRendered' &&
                                  e.count===s.initialIds.length))
    return 'NATIVE_INITIAL_RENDER_INCOMPLETE';
  if(s.events.some(e=>e.name==='observer_read_error'||e.name.startsWith('original_callback_error_')))
    return 'NATIVE_CALLBACK_ERROR';
  return null;
}
function assertHostMembership(s,expectedIds){
  assert.deepEqual(sorted(s.initialIds),sorted(expectedIds),
    'PARITY_NATIVE_INITIAL_HOST_MEMBERSHIP_MISMATCH');
  assert.deepEqual(sorted(s.modelIds),sorted(expectedIds),
    'PARITY_NATIVE_GRID_HOST_MEMBERSHIP_MISMATCH');
  assert.equal(s.modelCount,expectedIds.length,'PARITY_NATIVE_MODEL_COUNT_MISMATCH');
  assert.deepEqual(sorted(s.domIds),sorted(expectedIds),
    'PARITY_NATIVE_VISIBLE_HOST_MEMBERSHIP_MISMATCH');
}
/**
 * Used by the real parity comparator and the real-browser negative probes.
 * bypassReadinessForMutation is ONLY for the controlled original-defect witness;
 * the parity comparator never supplies it.
 */
export async function nativeObservation(page,expectedIds,{
  errors=[],timeoutMs=30000,bypassReadinessForMutation=false
}={}){
  assert.ok(Array.isArray(expectedIds),'PARITY_NATIVE_EXPECTED_IDS_REQUIRED');
  const selector='[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]';
  if(!bypassReadinessForMutation){
    try{await page.waitForFunction(browserReady,null,{timeout:timeoutMs});}
    catch{
      const s=await nativeSnapshot(page);
      throw Error('PARITY_NATIVE_READINESS_NOT_PROVEN_'+
        (nativeReadinessFailure(s)||'NATIVE_COMPLETION_TIMEOUT'));
    }
    if(errors.length)throw Error('PARITY_NATIVE_JAVASCRIPT_ERROR_'+errors[0]);
    const s=await nativeSnapshot(page);
    const failure=nativeReadinessFailure(s);
    if(failure)throw Error('PARITY_NATIVE_READINESS_NOT_PROVEN_'+failure);
    assertHostMembership(s,expectedIds);
  }
  const rows=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>({
    id:Number(node.getAttribute('row-id')),
    href:node.querySelector('a[data-js="inbox-details-link"]')?.getAttribute('href')||null
  })));
  assert.ok(rows.every(row=>Number.isSafeInteger(row.id)&&row.id>0),
    'PARITY_NATIVE_INVALID_IDS');
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length,
    'PARITY_NATIVE_DUPLICATE_IDS');
  return rows;
}
