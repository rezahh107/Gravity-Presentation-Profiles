// Isolated composition regression; NOT WordPress/browser timing evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
