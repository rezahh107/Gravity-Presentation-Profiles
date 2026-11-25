import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualifyThenCheck,requireInvalidated,securityVerdict} from './p1c-lifecycle-oracle.mjs';
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

test('security verdict separates direct rejection, DOM, and positive controls',()=>{
  const ids=['a','b'];
  const row={phase:'direct',direct:true,action:'gpp_inbox2_read',complete:true,problem:null,
    status:403,bodyObserved:true,privateData:false,success:false,rejection:'authorization_required',noStore:true};
  const evidence={revocation:{remaining:0,commandExit:0},baselineVerified:true,transitionVerified:true,
    baselineOracle:{a:[7],b:[]},expectedWidgets:{a:'3',b:'4'},
    finalDom:{documentCards:0,privateMarker:false,cardEvents:[],roots,widgetStates:roots.map(r=>({element:r.element,roots:[{...r,form:r.element==='a'?'3':'4'}]}))},
    freshB:{verified:true},network:ids.map(element=>({...row,element,form:element==='a'?'3':'4'}))};
  assert.equal(securityVerdict(evidence,ids,{crossUser:true}).status,'PASS');
  assert.equal(securityVerdict(evidence,ids,{crossUser:true}).consumerRequestObserved,false);
  for(const patch of [{network:[]},{revocation:null},{freshB:null},{finalDom:null},
    {network:[evidence.network[0], {...evidence.network[1],bodyObserved:false}]},
    {network:[evidence.network[0], {...evidence.network[0]}]}]){
    assert.equal(securityVerdict({...evidence,...patch},ids,{crossUser:true}).status,'NOT_PROVEN');
  }
  for(const patch of [{network:[...evidence.network,{...row,phase:'consumer',direct:false,element:'a',status:200,success:true}]},
    {network:[...evidence.network,{...row,phase:'consumer',direct:false,element:'a',privateData:true}]},
    {finalDom:{...evidence.finalDom,cardEvents:[7]}},
    {freshB:{verified:false,membershipMismatch:true}}]){
    assert.equal(securityVerdict({...evidence,...patch},ids,{crossUser:true}).status,'FAIL');
  }
  assert.equal(securityVerdict(evidence,ids,{fresh:true}).status,'NOT_PROVEN');
  // Legitimate pre-revocation reads must not be misreported as disclosure.
  const pre={...row,phase:'pre_revocation',direct:false,element:'a',status:200,privateData:true};
  assert.equal(securityVerdict({...evidence,network:[...evidence.network,pre]},ids,{crossUser:true}).status,'PASS');
  const notRevoked={...evidence,revocation:null,finalDom:{...evidence.finalDom,cardEvents:[7]}};
  assert.equal(securityVerdict(notRevoked,ids,{crossUser:true}).status,'NOT_PROVEN');
  assert.equal(securityVerdict({...evidence,finalDom:{...evidence.finalDom,cardEvents:undefined}},ids,{crossUser:true}).status,'NOT_PROVEN');
  assert.equal(securityVerdict({...evidence,network:evidence.network.map(r=>({...r,form:'wrong'}))},ids,{crossUser:true}).status,'NOT_PROVEN');
  assert.equal(securityVerdict({...evidence,finalDom:{...evidence.finalDom,cardEvents:[99]}},ids,{crossUser:true}).status,'NOT_PROVEN');
  assert.equal(securityVerdict({...evidence,network:[...evidence.network,{...pre,phase:'unattributed'}]},ids,{crossUser:true}).status,'NOT_PROVEN');
  const bootstraps=evidence.network.map(r=>({...r,action:'gpp_inbox2_atomic_bootstrap',form:null}));
  const revoked={...evidence,network:[...evidence.network,...bootstraps]};
  assert.equal(securityVerdict(revoked,ids).status,'PASS');
  const fresh={...revoked,freshNavigationVerified:true,transitionVerified:false};
  assert.equal(securityVerdict(fresh,ids,{fresh:true}).status,'PASS');
  assert.equal(securityVerdict({...fresh,network:evidence.network},ids,{fresh:true}).status,'NOT_PROVEN');
  assert.equal(securityVerdict({...fresh,finalDom:{...fresh.finalDom,documentCards:1}},ids,{fresh:true}).status,'FAIL');
});
