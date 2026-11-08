/**
 * TEST-ONLY observation of authentic GridOptions immediately before Gravity
 * Flow constructs AG Grid. Loaded by a disposable MU-plugin at footer priority 5.
 * Never alters native column definitions, persisted state, vendor files or data.
 * Emits only synthetic column IDs, widths, event origins, and logical order.
 */
(() => {
  'use strict';
  const output = window.__g014ColumnLifecycle = {schema:2, installed:0, samples:[], max:240,
    source_hooks:[], source_calls:[], max_source_calls:60};
  const safeStack = () => typeof window.__g014SafeStack === 'function' ? window.__g014SafeStack(new Error().stack) : [];
  const admitted = new Set(['id','1','3','6','date_created','date_created_human_readable']);
  const safeId = x => admitted.has(String(x)) ? String(x) : 'OTHER';
  const safeSource = x => typeof x === 'string' ? x.slice(0,56).replace(/[^a-zA-Z0-9_-]/g,'_') : null;
  const state = (event) => {
    const columnApi=event?.columnApi, api=event?.api;
    let columnState=null, displayed=null;
    try {
      if(typeof columnApi?.getColumnState === 'function') {
        columnState=columnApi.getColumnState().slice(0,20).map(c=>({
          id:safeId(c.colId), width:Number.isFinite(c.width)?c.width:null,
          hide:c.hide===true, pinned:typeof c.pinned==='string'?c.pinned:null
        }));
      }
      if(typeof columnApi?.getAllDisplayedColumns === 'function') {
        displayed=columnApi.getAllDisplayedColumns().slice(0,20).map(c=>safeId(c.getColId()));
      }
      if(displayed===null && typeof api?.getColumnDefs==='function') {
        displayed=api.getColumnDefs().slice(0,20).map(c=>safeId(c.colId||c.field));
      }
    } catch { /* Real Grid may not be fully initialized yet. */ }
    return {columnState,displayed};
  };
  const record=(gridId,phase,name,event)=>{
    if(output.samples.length>=output.max)return;
    const s=state(event);
    output.samples.push({
      ms:Math.round(performance.now()),grid_id:String(gridId).slice(0,96),
      phase, event:name,source:safeSource(event?.source),
      column_id:event?.column? safeId(event.column.getColId?.()):null,
      finished:event?.finished===true, state:s.columnState,displayed:s.displayed
    });
  };
  const events=['columnMoved','columnResized','columnEverythingChanged','gridColumnsChanged','displayedColumnsChanged','columnVisible','columnPinned','firstDataRendered','gridSizeChanged'];
  const callbackNames=['onColumnEverythingChanged','onGridReady','onColumnMoved','onColumnResized','onGridSizeChanged','onFirstDataRendered'];
  const cfg=window.gflow_config;
  if(!cfg||!cfg.grids||typeof cfg.grids!=='object')return;
  for(const [gridId,grid] of Object.entries(cfg.grids)){
    const options=grid?.grid_options;
    if(!options||!Array.isArray(options.columnDefs)||options.__g014LifecycleProbe)continue;
    options.__g014LifecycleProbe=true;
    output.installed+=1;
    record(gridId,'pre-construction','columnDefs',null);
    const activeCallbacks=new Map();
    const observed=new WeakSet();
    const wrapped=new WeakMap();
    const attemptWrap=(obj,namespace)=>{
      if(!obj||typeof obj!=='object')return;
      if(wrapped.has(obj))return;
      wrapped.set(obj,true);
      for(const name of (namespace==='columnApi'
        ? ['applyColumnState','moveColumn','moveColumns','setColumnState','getColumnState']
        : ['sizeColumnsToFit','applyColumnState'])){
        const prior=obj[name];
        if(typeof prior!=='function')continue;
        try {
          obj[name]=function(...args){
            const arg=args[0];
            const stateInput=Array.isArray(arg?.state)?arg.state.slice(0,12):null;
            const ids=stateInput?.map(x=>safeId(x?.colId))??null;
            let effectiveArgs=args,overrideUsed=false,effectiveIds=ids;
            // Falsification only: on an explicitly opt-in disposable browser
            // reload, replace the native malformed restore ORDER input with
            // the exact persisted native state. Do not touch its stored record,
            // other Grid calls, vendor assets or production source.
            if(name==='applyColumnState'&&window.__g014ForceStoredOrder===true&&
               arg?.applyOrder===true&&Array.isArray(arg?.state)){
              try {
                const saved=JSON.parse(window.localStorage.getItem(gridId)||'null');
                const allowed=new Set(['1','3','6','date_created','id']);
                const savedIds=Array.isArray(saved)?saved.map(x=>String(x?.colId)):[];
                const inputIds=arg.state.map(x=>String(x?.colId));
                if(savedIds.length===5&&inputIds.length===5&&
                   new Set(savedIds).size===5&&new Set(inputIds).size===5&&
                   savedIds.every(id=>allowed.has(id))&&inputIds.every(id=>allowed.has(id))&&
                   savedIds.every(id=>inputIds.includes(id))){
                  effectiveArgs=[{...arg,state:saved.map(x=>({...x}))},...args.slice(1)];
                  effectiveIds=savedIds;
                  overrideUsed=true;
                }
              }catch{ /* Invalid input is not repaired by this test. */ }
            }
            if(output.source_calls.length<output.max_source_calls&&name!=='getColumnState'){
              output.source_calls.push({ms:Math.round(performance.now()),name,
                namespace,apply_order:typeof arg?.applyOrder==='boolean'?arg.applyOrder:null,
                input_ids:ids,effective_ids:effectiveIds,
                test_override_used:overrideUsed,from_stack:safeStack()});
            }
            return Reflect.apply(prior,this,effectiveArgs);
          };
          output.source_hooks.push({namespace,name,installed:obj[name]!==prior});
        }catch{
          output.source_hooks.push({namespace,name,installed:false});
        }
      }
    };
    const attach=(event)=>{
      const api=event?.api;
      if(!api||typeof api.addEventListener!=='function'||observed.has(api))return;
      observed.add(api);
      for(const name of events) {
        api.addEventListener(name,evt=>record(gridId,'event',name,evt));
      }
    };
    for(const name of callbackNames){
      const prior=options[name];
      if(prior!=null && typeof prior!=='function')continue;
      activeCallbacks.set(name,prior);
      options[name]=function(...args){
        const event=args[0];
        record(gridId,'callback-before',name,event);
        // Install test-only wrappers at the genuine gridInitializing event,
        // before Native host code has a chance to restore saved state.
        if(event?.source==='gridInitializing'){
          attemptWrap(event.columnApi,'columnApi');
          attemptWrap(event.api,'gridApi');
        }
        let result;
        try {
          if(typeof prior==='function')result=Reflect.apply(prior,this,args);
          return result;
        } finally {
          attach(event);
          record(gridId,'callback-after',name,event);
        }
      };
    }
    output.callbacks=[...activeCallbacks.keys()];
    output.native_option_present=Object.prototype.hasOwnProperty.call(options,'enableRtl');
    output.enableRtl=options.enableRtl??null;
    output.column_defs=options.columnDefs.slice(0,20).map(c=>({
      id:safeId(c.colId??c.field),width:Number.isFinite(c.width)?c.width:null,
      hide:c.hide===true,pinned:typeof c.pinned==='string'?c.pinned:null,
      display_key:safeId(c.displayKey)
    }));
  }
})();