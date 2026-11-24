import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifyThenCheck,requireInvalidated} from './p1c-lifecycle-oracle.mjs';
const roots=[{element:'a',state:'stale',entries:[]},{element:'b',state:'stale',entries:[]}];
for (const name of ['HIDDEN','VISIBLE','BFCACHE']) {
  test(name+' unqualified transition never reaches consumer', async () => {
    const records=[]; let reached=false;
    await qualifyThenCheck((...x)=>records.push(x),name,
      async()=>({qualified:false}),async()=>{reached=true;});
    assert.equal(reached,false);
    assert.deepEqual(records.map(x=>x[1]),['NOT_PROVEN','NOT_REACHED']);
  });
  test(name+' qualified transition followed by wrong output fails', async () => {
    const records=[];
    const pass=await qualifyThenCheck((...x)=>records.push(x),name,
      async()=>({qualified:true,modeled:true}),async()=>assert.deepEqual([25],[20]));
    assert.equal(pass,false);
    assert.deepEqual(records.map(x=>x[1]),['FAIL']);
  });
  test(name+' healthy consumer passes classification', async () => {
    const records=[];
    const pass=await qualifyThenCheck((...x)=>records.push(x),name,
      async()=>({qualified:true,modeled:true}),async()=>{requireInvalidated(roots,['a','b']);});
    assert.equal(pass,true);
    assert.deepEqual(records.map(x=>x[1]),['PASS']);
  });
}
test('reject empty, incorrect identity, stale data, and wrong state',()=>{
  for(const invalid of [[],[roots[0]], [roots[0],{...roots[1],element:'a'}],
    [{...roots[0],entries:[7]},roots[1]],[{...roots[0],state:'current'},roots[1]]]){
    assert.throws(()=>requireInvalidated(invalid,['a','b']),/INVALIDATION_CONTRACT/);
  }
  requireInvalidated(roots,['a','b']);
});
