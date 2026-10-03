// Isolated composition regression; NOT WordPress/browser timing evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { evaluate } from './inbox-width-candidate-a-discriminator.mjs';
const source = fs.readFileSync(new URL('./inbox-width-candidate-a-observer.js',import.meta.url),'utf8');
function run(options) {
    const root = {dataset:{gridId:'synthetic'},querySelector:()=>null};
    const scope = {querySelectorAll:()=>[root]};
    const window = {__gppWidthLab:{},gflow_config:{grids:{synthetic:{grid_options:options}}}};
    vm.runInNewContext(source,{window,gflow_config:window.gflow_config,document:{querySelector:()=>scope},performance:{now:()=>0},requestAnimationFrame:()=>{},queueMicrotask:()=>{}});
    return window.__gppWidthQualification;
}
const receiver={}; const arg={}; const token={}; let calls=0;
const opts={onGridSizeChanged:function(...args){calls++;assert.equal(this,receiver);assert.equal(args[0],arg);assert.equal(args[1],token);return token;}};
const report=run(opts); assert.equal(opts.onGridSizeChanged.call(receiver,arg,token),token);assert.equal(calls,1);
assert.equal(report.attachment[0].callbacks.find(c=>c.name==='onGridSizeChanged').chained,true);
const error=new Error('original'); const throws={onColumnEverythingChanged:()=>{throw error;}};run(throws);
assert.throws(()=>throws.onColumnEverythingChanged({}),e=>e===error);
const untouched=()=>{};const ambiguous={onColumnEverythingChanged:'not-a-function',onGridSizeChanged:untouched};
const failed=run(ambiguous);assert.ok(failed.attachment[0].failure);assert.equal(ambiguous.onGridSizeChanged,untouched);
assert.equal(ambiguous.onColumnEverythingChanged,'not-a-function');
assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|sizeColumnsToFit|applyColumnState|ResizeObserver|setInterval|__agComponent)\b/);
console.log('ISOLATED_CALLBACK_COMPOSITION_PASS_NOT_RUNTIME_EVIDENCE');

const controlSource = fs.readFileSync(new URL('./inbox-width-candidate-a-controls.js',import.meta.url),'utf8');
assert.doesNotMatch(controlSource,/\b(?:localStorage|sessionStorage|sizeColumnsToFit|__agComponent)\b/);
let listener, applied=0, heightCalls=0;
const deliveryQueue=[];
const fixtureState=[{colId:'id',width:80}];
const publicColumns={getColumnState:()=>structuredClone(fixtureState),applyColumnState:arg=>{
    applied++; assert.equal(arg.applyOrder,true);assert.deepEqual(arg.state,fixtureState);
    deliveryQueue.push({type:'columnEverythingChanged',source:'api',api:publicApi,columnApi:publicColumns});return true;
}};
const publicApi={getDisplayedRowCount:()=>1,addEventListener:(name,fn)=>{assert.equal(name,'columnEverythingChanged');listener=fn;}};
const heightReceiver={columnApi:publicColumns};
const controlOptions={getRowHeight:function(){heightCalls++;assert.equal(this,heightReceiver);return 37;}};
const controlWindow={__gppWidthLab:{control:'startup'},gflow_config:{grids:{test:{grid_options:controlOptions}}}};
vm.runInNewContext(controlSource,{window:controlWindow,gflow_config:controlWindow.gflow_config,performance:{now:()=>0}});
const heightParams={api:publicApi};
assert.equal(controlOptions.getRowHeight.call(heightReceiver,heightParams),37);
assert.equal(controlOptions.getRowHeight.call(heightReceiver,heightParams),37);
assert.equal(heightCalls,2);assert.equal(applied,1,'Startup control must be one-shot');
const deliveredControl=deliveryQueue.shift();listener(deliveredControl);
assert.equal(controlWindow.__gppWidthControl.origin(deliveredControl),'unrelated_startup');
assert.equal(controlWindow.__gppWidthControl.trace.filter(t=>t.kind==='public_listener_delivery')[0].origin,'unrelated_startup');
assert.equal(controlWindow.__gppWidthControl.run('unrelated_after_startup'),true);assert.equal(applied,2);
const deliveredLate=deliveryQueue.shift();listener(deliveredLate);
assert.equal(controlWindow.__gppWidthControl.origin(deliveredLate),'unrelated_after_startup');
assert.equal(Object.keys(deliveredLate).join(','),'type,source,api,columnApi','Ground truth must not alter event keys');
const emptyOptions={};
const emptyWindow={__gppWidthLab:{control:'startup',seeded:true},gflow_config:{grids:{empty:{grid_options:emptyOptions}}}};
vm.runInNewContext(controlSource,{window:emptyWindow,gflow_config:emptyWindow.gflow_config,performance:{now:()=>0}});
emptyOptions.onColumnEverythingChanged({source:'gridInitializing',api:publicApi,columnApi:publicColumns});
assert.equal(applied,3,'Empty startup must use the surviving public callback');
const emptyDelivery=deliveryQueue.shift();listener(emptyDelivery);
assert.equal(emptyWindow.__gppWidthControl.origin(emptyDelivery),'unrelated_startup');
emptyOptions.onColumnEverythingChanged({source:'api',api:publicApi,columnApi:publicColumns});
assert.equal(applied,3,'Empty fallback must also be one-shot');

const event = (type,source,sequence,origin) => ({event_type:type,source,sequence,at:sequence,
    callback:type==='gridSizeChanged'?'onGridSizeChanged':type==='firstDataRendered'?'onFirstDataRendered':'onColumnEverythingChanged',
    event_keys:['api','columnApi','source','type'],fixture_origin:origin,row_count:1,state:fixtureState,
    displayed:[{id:'id',width:80,pinned:null,flex:null}],center_viewport:{clientWidth:200}});
const scenario = origin => ({route:'shortcode',scenario:origin,events:[
    event('columnEverythingChanged','gridInitializing',0,'native_non_restore'),
    event('columnEverythingChanged','api',1,origin),event('firstDataRendered',null,2,'native_non_restore'),
    event('gridSizeChanged',null,3,'native_non_restore')]});
assert.equal(evaluate([scenario('native_restore_fixture'),scenario('unrelated_startup')]).decision,'CANDIDATE_A_DISCRIMINATOR_FALSIFIED');
assert.equal(evaluate([scenario('native_restore_fixture')]).decision,'CANDIDATE_A_DISCRIMINATOR_NOT_PROVEN','Missing negatives can never prove uniqueness');
console.log('ISOLATED_CONTROL_AND_COLLISION_REGRESSION_PASS_NOT_RUNTIME_EVIDENCE');
