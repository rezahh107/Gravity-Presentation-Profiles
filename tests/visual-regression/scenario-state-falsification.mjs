import assert from 'node:assert/strict';
import { applyScenarioAction } from './scenario-state.mjs';

const selectors = { centerRows: '#rows', searchInput: '#search', gridRoot: '#grid' };
class FakePage {
  constructor({ ignoreSearch = false } = {}) { this.rows=20;this.focused=false;this.ignoreSearch=ignoreSearch; }
  locator(selector) {
    if (selector === '#search') return { click:async()=>{},pressSequentially:async query=>{if(!this.ignoreSearch)this.rows=query==='00:24:00'?1:0;},focus:async()=>{this.focused=true;},evaluate:async()=>this.focused };
    if (selector === '#rows > .ag-row') return { count:async()=>this.rows,first:()=>({innerText:async()=>'WU21 Alpha Student 24\n2026-01-01 00:24:00'}) };
    if (selector === '#rows > .ag-row .gpp-inbox-card') return { count:async()=>this.rows };
    if (selector === '#grid') return { count:async()=>1 };
    if (selector === '[data-js="gflow-inbox"] [ref="btNext"]') return { count:async()=>1,evaluate:async()=>false,click:async()=>{this.rows=5;} };
    throw new Error(`Unexpected selector ${selector}`);
  }
  async waitForFunction(callback, argument) {
    const previous=globalThis.document;
    globalThis.document={querySelectorAll:()=>Array(this.rows).fill({})};
    try { if (!callback(argument)) throw new Error('Synthetic timeout: scenario postcondition unmet.'); }
    finally { if(previous===undefined)delete globalThis.document;else globalThis.document=previous; }
  }
}

const result=await applyScenarioAction(new FakePage(),'search_result',selectors);
assert.equal(result.observed_rows,1);assert.equal(result.observed_cards,1);assert.equal(result.unique_fixture_present,true);
const empty=await applyScenarioAction(new FakePage(),'search_empty',selectors);
assert.equal(empty.observed_rows,0);assert.equal(empty.observed_cards,0);assert.equal(empty.authentic_grid_surface_present,true);
const pagination=await applyScenarioAction(new FakePage(),'pagination',selectors);
assert.equal(pagination.initial_rows,20);assert.equal(pagination.observed_rows,5);
const focus=await applyScenarioAction(new FakePage(),'focus',selectors);
assert.equal(focus.search_input_owns_focus,true);
await assert.rejects(()=>applyScenarioAction(new FakePage({ignoreSearch:true}),'search_result',selectors),/postcondition unmet/);
console.log('SCENARIO_STATE_FALSIFICATION_PASS search_result=1 search_empty=0 pagination=5 focus=true unmet=failed_closed');
