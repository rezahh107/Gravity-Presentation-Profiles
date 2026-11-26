import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleCompletion,qualifyThenCheck,reconcileResponseWitnesses,requireInvalidated,securityVerdict} from './p1c-lifecycle-oracle.mjs';
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
  const direct=ids.map(element=>({...row,element,form:element==='a'?'3':'4'}));
  const consumers=direct.map(r=>({...r,phase:'consumer',direct:false}));
  const evidence={revocation:{remaining:0,commandExit:0},baselineVerified:true,transitionVerified:true,
    baselineOracle:{a:[7],b:[]},expectedWidgets:{a:'3',b:'4'},
    finalDom:{documentCards:0,privateMarker:false,cardEvents:[],roots,widgetStates:roots.map(r=>({element:r.element,roots:[{...r,form:r.element==='a'?'3':'4'}]}))},
    freshB:{verified:true},network:[...direct,...consumers]};
  assert.equal(securityVerdict(evidence,ids,{crossUser:true}).status,'PASS');
  assert.equal(securityVerdict(evidence,ids,{crossUser:true}).consumerRequestObserved,true);
  assert.equal(securityVerdict({...evidence,network:direct},ids,{crossUser:true}).status,'NOT_PROVEN');
  const missingBody={...consumers[0],witnessKey:'scoped-request',bodyObserved:false,complete:false,privateData:null};
  const [witnessedLeak]=reconcileResponseWitnesses([missingBody],[{...row,key:'scoped-request',privateData:true}]);
  assert.equal(securityVerdict({...evidence,network:[...direct,...consumers.slice(1),witnessedLeak]},ids,{crossUser:true}).status,'FAIL');
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
  const bootstraps=direct.map(r=>({...r,action:'gpp_inbox2_atomic_bootstrap',form:null}));
  const revoked={...evidence,network:[...evidence.network,...bootstraps]};
  assert.equal(securityVerdict(revoked,ids).status,'PASS');
  const fresh={...revoked,freshNavigationVerified:true,transitionVerified:false,
    network:[...direct,...bootstraps,...bootstraps.map(r=>({...r,phase:'consumer',direct:false}))]};
  assert.equal(securityVerdict(fresh,ids,{fresh:true}).status,'PASS');
  assert.equal(securityVerdict({...fresh,network:evidence.network},ids,{fresh:true}).status,'NOT_PROVEN');
  assert.equal(securityVerdict({...fresh,finalDom:{...fresh.finalDom,documentCards:1}},ids,{fresh:true}).status,'FAIL');
  const deniedPage={...fresh,admissionDenied:true,network:[...direct,...bootstraps],
    finalDom:{...fresh.finalDom,widgetStates:[],roots:[]}};
  assert.equal(securityVerdict(deniedPage,ids,{fresh:true}).status,'PASS');
  assert.equal(securityVerdict(deniedPage,ids,{fresh:true}).consumerRequestObserved,false);
});

test('host observation needs an exact unique request and matching HTTP evidence',()=>{
  const browser={witnessKey:'key',phase:'consumer',direct:false,status:403,noStore:true,
    bodyObserved:false,privateData:null,complete:false};
  const host={key:'key',status:403,noStore:true,bodyObserved:true,privateData:false,
    success:false,rejection:'authorization_required'};
  const [matched]=reconcileResponseWitnesses([browser],[host]);
  assert.deepEqual(matched,{phase:'consumer',direct:false,status:403,noStore:true,bodyObserved:true,
    privateData:false,complete:true,problem:null,success:false,rejection:'authorization_required',bodySource:'host_boundary'});
  for (const unmatched of [[],[{...host,key:'unrelated'}],[host,host],
    [{...host,status:200}],[{...host,noStore:false}],[{...host,bodyObserved:false}]]) {
    const [row]=reconcileResponseWitnesses([browser],unmatched);
    assert.equal(row.bodyObserved,false);
    assert.equal(row.privateData,null);
  }
  assert.equal(reconcileResponseWitnesses([browser,browser],[host]).every(row=>!row.bodyObserved),true);
  assert.equal(reconcileResponseWitnesses([{...browser,direct:true}],[host])[0].bodyObserved,false);
  const [conflict]=reconcileResponseWitnesses([{...browser,...matched,witnessKey:'key'}],[{...host,privateData:true}]);
  assert.equal(conflict.privateData,true);
  assert.equal(conflict.problem,'RESPONSE_WITNESS_BODY_MISMATCH');
});

test('only defined deferred BFCache observations and their dependents are nonblocking',()=>{
  const mandatory=['PRODUCT_VISIBLE_revocation','PRODUCT_VISIBLE_cross_user','PRODUCT_SECURE_FRESH_LOAD_revocation']
    .map(name=>({name,status:'PASS'}));
  const gap={name:'PRODUCT_BFCACHE_revocation',status:'NOT_PROVEN',bfcacheDeferralReason:'No genuine restoration'};
  const dependent={name:'PRODUCT_BFCACHE_CONSUMER_revocation',status:'NOT_REACHED'};
  const unrelated={name:'PRODUCT_SECURE_FRESH_LOAD_membership',status:'NOT_PROVEN',bfcacheDeferralReason:'Wrong scope'};
  const c=lifecycleCompletion([...mandatory,gap,dependent]);
  assert.equal(c.failed,false);
  assert.deepEqual(c.blocking,[]);
  assert.deepEqual(c.records.slice(-2).map(r=>[r.status,r.qualificationImpact,r.nonblockingReason]),[
    ['NOT_PROVEN','NONBLOCKING_WITH_REASON',gap.bfcacheDeferralReason],
    ['NOT_REACHED','NONBLOCKING_WITH_REASON',gap.bfcacheDeferralReason],
  ]);
  assert.deepEqual(lifecycleCompletion([...mandatory,dependent]).blocking,[dependent]);
  assert.deepEqual(lifecycleCompletion([...mandatory,gap,unrelated]).blocking,[unrelated]);
  assert.equal(lifecycleCompletion([...mandatory,gap,{...dependent,status:'FAIL'}]).failed,true);
  assert.equal(lifecycleCompletion([...mandatory,{...gap,status:'FAIL'}]).failed,true);
  assert.equal(lifecycleCompletion([...mandatory.slice(1),gap]).blocking[0].name,mandatory[0].name);
});
