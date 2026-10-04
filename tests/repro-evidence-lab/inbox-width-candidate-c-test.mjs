import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('./inbox-width-candidate-c-guard.js',import.meta.url),'utf8');
assert.ok(!/localStorage|sessionStorage|ResizeObserver|onGridReady|onColumnEverythingChanged/.test(code));
const ids=['id','date_created','6','3','1'];
function fixture({prior,center=1000,pinned=null,flex=0,min=100,width=300,suppress=false,active=true}={}) {
 const root={dataset:{gridId:'test'},querySelector:s=>s==='.ag-center-cols-viewport'?{clientWidth:center}:null,closest:()=>active};
 const scope={querySelectorAll:()=>[root]},options={columnDefs:ids.map(colId=>({colId})),onGridSizeChanged:prior};
 const document={querySelector:()=>active?scope:null,contains:()=>true};
 const window={__gppWidthLab:{accepted_ids:ids},gflow_config:{grids:{test:{grid_options:options}}}};
 vm.runInNewContext(code,{window,document,gflow_config:window.gflow_config,performance:{now:()=>1}});
 let fits=0;
 const columnApi={getColumnState:()=>ids.map(colId=>({colId,width})),getAllDisplayedColumns:()=>ids.map(colId=>({getColId:()=>colId,getActualWidth:()=>width,getMinWidth:()=>min,getMaxWidth:()=>null,getPinned:()=>pinned,getFlex:()=>flex,getColDef:()=>({suppressSizeToFit:suppress})}))};
 const api={sizeColumnsToFit:()=>{fits++;options.onGridSizeChanged({api,columnApi,type:'gridSizeChanged'});}};
 return {window,options,params:{api,columnApi,type:'gridSizeChanged'},count:()=>fits};
}
const receiver={marker:1},token={};let call;
const f=fixture({prior:function(...args){if(!call)call={receiver:this,args};return token;}});
assert.equal(f.options.onGridSizeChanged.call(receiver,f.params,'extra'),token);
assert.equal(call.receiver,receiver);assert.deepEqual(call.args,[f.params,'extra']);
assert.equal(f.count(),1);assert.equal(f.window.__gppCandidateC.evaluations.length,1);
f.options.onGridSizeChanged(f.params);assert.equal(f.count(),1);
const second={...f.params,api:{sizeColumnsToFit:()=>{}}};f.options.onGridSizeChanged(second);assert.equal(f.window.__gppCandidateC.evaluations.length,2);
let throws=true;const intermittent=fixture({prior:()=>{if(throws)throw new Error('first');}});assert.throws(()=>intermittent.options.onGridSizeChanged(intermittent.params));throws=false;intermittent.options.onGridSizeChanged(intermittent.params);assert.equal(intermittent.count(),0);
const error=new Error('prior');const broken=fixture({prior:()=>{throw error;}});assert.throws(()=>broken.options.onGridSizeChanged(broken.params),e=>e===error);assert.equal(broken.count(),0);
for(const settings of [{pinned:'left'},{flex:1},{flex:NaN},{min:NaN},{suppress:true},{center:0},{center:450},{width:200},{width:200.2},{active:false},{prior:'not callable'}]) {
 const c=fixture(settings);if(typeof c.options.onGridSizeChanged==='function') {c.options.onGridSizeChanged(c.params);c.options.onGridSizeChanged(c.params);}assert.equal(c.count(),0,JSON.stringify(settings));
}
console.log('CANDIDATE_C_COMPOSITION_CARDINALITY_FAIL_CLOSED_PASS');
