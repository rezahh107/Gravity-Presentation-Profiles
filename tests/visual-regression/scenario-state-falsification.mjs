import assert from 'node:assert/strict';
import { applyScenarioAction } from './scenario-state.mjs';

const selectors = { centerRows: '#rows', searchInput: '#search', gridRoot: '#grid' };
class FakePage {
  constructor({ ignoreSearch = false, secondPageRows = 7 } = {}) { this.rows=20;this.pageNumber=1;this.focused=false;this.ignoreSearch=ignoreSearch;this.secondPageRows=secondPageRows; }
  rowIds(){return Array.from({length:this.rows},(_,index)=>`page-${this.pageNumber}-row-${index+1}`);}
  locator(selector) {
    if (selector === '#search') return { click:async()=>{},pressSequentially:async query=>{if(!this.ignoreSearch)this.rows=query==='00:24:00'?1:0;},focus:async()=>{this.focused=true;},evaluate:async()=>this.focused };
    if (selector === '#rows > .ag-row') return { count:async()=>this.rows,first:()=>({innerText:async()=>'WU21 Alpha Student 24\n2026-01-01 00:24:00'}),evaluateAll:async callback=>callback(this.rowIds().map(id=>({getAttribute:()=>id}))) };
    if (selector === '#rows > .ag-row .gpp-inbox-card') return { count:async()=>this.rows };
    if (selector === '#grid') return { count:async()=>1 };
    if (selector === '[data-js="gflow-inbox"] [ref="lbCurrent"]') return { count:async()=>1,innerText:async()=>String(this.pageNumber) };
    if (selector === '[data-js="gflow-inbox"] [ref="lbTotal"]') return { count:async()=>1,innerText:async()=>'2' };
    if (selector === '[data-js="gflow-inbox"] [ref="btNext"]') return { count:async()=>1,evaluate:async()=>false,click:async()=>{this.pageNumber=2;this.rows=this.secondPageRows;} };
    throw new Error(`Unexpected selector ${selector}`);
  }
  async waitForFunction(callback, argument) {
    const previous=globalThis.document;
    globalThis.document={querySelector:()=>({textContent:String(this.pageNumber)}),querySelectorAll:()=>this.rowIds().map(id=>({getAttribute:()=>id}))};
    try { if (!callback(argument)) throw new Error('Synthetic timeout: scenario postcondition unmet.'); }
    finally { if(previous===undefined)delete globalThis.document;else globalThis.document=previous; }
  }
}

const result=await applyScenarioAction(new FakePage(),'search_result',selectors);
assert.equal(result.observed_rows,1);assert.equal(result.observed_cards,1);assert.equal(result.unique_fixture_present,true);
const empty=await applyScenarioAction(new FakePage(),'search_empty',selectors);
assert.equal(empty.observed_rows,0);assert.equal(empty.observed_cards,0);assert.equal(empty.authentic_grid_surface_present,true);
const pagination=await applyScenarioAction(new FakePage(),'pagination',selectors);
assert.equal(pagination.first_page_rows,20);assert.equal(pagination.second_page_rows,7);assert.equal(pagination.page_after,'2');assert.equal(pagination.row_identity_changed,true);
const focus=await applyScenarioAction(new FakePage(),'focus',selectors);
assert.equal(focus.search_input_owns_focus,true);
await assert.rejects(()=>applyScenarioAction(new FakePage({ignoreSearch:true}),'search_result',selectors),/postcondition unmet/);
console.log('SCENARIO_STATE_FALSIFICATION_PASS search_result=1 search_empty=0 pagination=page2_identity_changed focus=true unmet=failed_closed');
