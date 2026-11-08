/**
 * TEST-ONLY observation of authentic GridOptions immediately before Gravity
 * Flow constructs AG Grid. Loaded by a disposable MU-plugin at footer priority 5.
 * Never alters native column definitions, persisted state, vendor files or data.
 * Emits only synthetic column IDs, widths, event origins, and logical order.
 */
(() => {
  'use strict';
  const output = window.__g014ColumnLifecycle = {schema:1, installed:0, samples:[], max:240};
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