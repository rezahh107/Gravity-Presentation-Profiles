import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleCompletion,qualifyThenCheck,reconcileResponseWitnesses,requireInvalidated,retainedWhilePending,securityVerdict} from './p1c-lifecycle-oracle.mjs';
const roots=[{element:'a',form:'3',state:'stale',entries:[]},{element:'b',form:'4',state:'stale',entries:[]}];
const fixture={forms:{a:3,b:4},element_ids_by_form:{3:'a',4:'b'},native_oracle:{a:{a:[7,8],b:[]},b:{a:[],b:[9]}}};
const visible=(doc,to='visible')=>({doc,qualified:true,from:to==='visible'?'hidden':'visible',
  to,events:[{type:'visibilitychange',trusted:true,state:to}]});
const current=oracle=>roots.map(r=>({...r,state:'current',entries:oracle[r.element]}));
const dom=(doc,rows)=>({doc,state:'visible',documentCards:rows.flatMap(r=>r.entries).length,
  privateMarker:false,cardEvents:[],roots:rows,
  widgetStates:rows.map(r=>({element:r.element,roots:[structuredClone(r)]}))});
const cross='PRODUCT_VISIBLE_cross_user', revokedName='PRODUCT_VISIBLE_revocation',
  freshName='PRODUCT_SECURE_FRESH_LOAD_revocation';
function securityEvidence(name){
  const crossUser=name===cross, fresh=name===freshName;
  const row={case:name,tab:'old-a-tab',phase:'direct',direct:true,action:'gpp_inbox2_read',
    complete:true,problem:null,status:403,bodyObserved:true,privateData:false,success:false,
    rejection:'authorization_required',noStore:true,requestWallTime:3};
  const direct=roots.map(r=>({...row,element:r.element,form:r.form}));
  const bootstraps=direct.map(r=>({...r,action:'gpp_inbox2_atomic_bootstrap',form:null}));
  const consumers=(fresh?bootstraps:direct).map(r=>({...r,phase:'consumer',direct:false,requestWallTime:2}));
  const finalDom=dom(fresh?'fresh-a':name,roots);
  finalDom.denials=fresh?[]:roots.map(r=>({element:r.element,form:r.form,receivedAt:2001,checkedAt:2002,state:'stale',cards:0}));
  const pending=fresh?null:{dom:{...dom(name,current(fixture.native_oracle.a).map(r=>({...r,state:'syncing'}))),observedAt:2001},
    responses:roots.map(r=>({element:r.element,form:r.form,status:403,pausedAt:2000}))};
  return {case:name,revocation:{remaining:0,commandExit:0},baselineVerified:true,
    transitionVerified:!fresh,freshNavigationVerified:fresh,witness:fresh?null:visible(name),
    baselineOracle:fixture.native_oracle.a,baseline:dom(name,current(fixture.native_oracle.a)),
    expectedWidgets:{a:'3',b:'4'},pending,finalDom,
    freshB:crossUser?{verified:true,previousDocument:'old-b',newDocument:'new-b',
      oracle:fixture.native_oracle.b,dom:dom('new-b',current(fixture.native_oracle.b))}:null,
    network:[{...row,phase:'baseline',direct:false,requestWallTime:1},...direct,...(crossUser?[]:bootstraps),...consumers]};
}
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
  const check=(e,options={crossUser:true})=>securityVerdict(e,ids,{...options,forms:fixture.forms});
  const evidence=securityEvidence(cross);
  const [baseline,...requests]=evidence.network;
  const direct=requests.filter(r=>r.direct);
  const consumers=requests.filter(r=>!r.direct);
  const row=direct[0];
  assert.equal(check(evidence).status,'PASS');
  assert.equal(check(evidence).consumerRequestObserved,true);
  assert.equal(check({...evidence,network:[baseline,...direct]}).status,'NOT_PROVEN');
  const missingBody={...consumers[0],witnessKey:'scoped-request',bodyObserved:false,complete:false,privateData:null};
  const [witnessedLeak]=reconcileResponseWitnesses([missingBody],[{...row,key:'scoped-request',privateData:true}]);
  assert.equal(check({...evidence,network:[baseline,...direct,...consumers.slice(1),witnessedLeak]}).status,'FAIL');
  for(const patch of [{network:[]},{revocation:null},{freshB:null},{finalDom:null},
    {network:[evidence.network[0], {...evidence.network[1],bodyObserved:false}]},
    {network:[evidence.network[0], {...evidence.network[0]}]}]){
    assert.equal(check({...evidence,...patch}).status,'NOT_PROVEN');
  }
  for(const patch of [{network:[...evidence.network,{...row,phase:'consumer',direct:false,element:'a',status:200,success:true}]},
    {network:[...evidence.network,{...row,phase:'consumer',direct:false,element:'a',privateData:true}]},
    {finalDom:{...evidence.finalDom,cardEvents:[7]}},
    {freshB:{verified:false,membershipMismatch:true}}]){
    assert.equal(check({...evidence,...patch}).status,'FAIL');
  }
  assert.equal(check(evidence,{fresh:true}).status,'NOT_PROVEN');
  // Legitimate pre-revocation reads must not be misreported as disclosure.
  const pre={...row,phase:'pre_revocation',direct:false,element:'a',status:200,privateData:true};
  assert.equal(check({...evidence,network:[...evidence.network,pre]}).status,'PASS');
  const notRevoked={...evidence,revocation:null,finalDom:{...evidence.finalDom,cardEvents:[7]}};
  assert.equal(check(notRevoked).status,'NOT_PROVEN');
  assert.equal(check({...evidence,finalDom:{...evidence.finalDom,cardEvents:undefined}}).status,'NOT_PROVEN');
  assert.equal(check({...evidence,network:evidence.network.map(r=>({...r,form:'wrong'}))}).status,'NOT_PROVEN');
  assert.equal(check({...evidence,finalDom:{...evidence.finalDom,cardEvents:[99]}}).status,'NOT_PROVEN');
  assert.equal(check({...evidence,network:[...evidence.network,{...pre,phase:'unattributed'}]}).status,'NOT_PROVEN');
  assert.equal(check(securityEvidence(revokedName),{}).status,'PASS');
  const fresh=securityEvidence(freshName);
  assert.equal(check(fresh,{fresh:true}).status,'PASS');
  assert.equal(check({...fresh,network:evidence.network},{fresh:true}).status,'NOT_PROVEN');
  assert.equal(check({...fresh,finalDom:{...fresh.finalDom,documentCards:1}},{fresh:true}).status,'NOT_PROVEN');
  assert.equal(check({...fresh,finalDom:{...fresh.finalDom,documentCards:1,cardEvents:[7]}},{fresh:true}).status,'FAIL');
  const deniedPage={...fresh,admissionDenied:true,network:fresh.network.filter(r=>r.phase!=='consumer'),
    documents:[{phase:'consumer',login:true,status:200}],finalDom:dom(fresh.finalDom.doc,[])};
  assert.equal(check(deniedPage,{fresh:true}).status,'PASS');
  assert.equal(check(deniedPage,{fresh:true}).consumerRequestObserved,false);
  assert.equal(check({...deniedPage,documents:[]},{fresh:true}).status,'NOT_PROVEN');
  const lateClear=structuredClone(evidence);
  lateClear.finalDom.denials[0].cards=1;
  assert.equal(check(lateClear).status,'FAIL');
  lateClear.finalDom.denials=[];
  assert.equal(check(lateClear).status,'NOT_PROVEN');
});

test('contradictory DOM, case, tab and fresh-B records cannot establish a security pass',()=>{
  for (const mutate of [
    e=>{e.finalDom.documentCards=1;},
    e=>{e.finalDom.roots[0]={...e.finalDom.roots[0],entries:[7]};},
    e=>{e.finalDom.widgetStates[0].roots[0].entries=[7];},
    e=>{e.witness.doc='wrong-document';},
    e=>{e.network.find(r=>r.direct).tab='different-tab';},
    e=>{e.network.find(r=>!r.direct&&r.phase==='consumer').case='wrong-case';},
    e=>{e.network.find(r=>r.phase==='consumer').requestWallTime=0;},
    e=>{e.freshB.dom.roots[1].entries=[];},
    e=>{e.freshB.oracle={a:[9],b:[]};},
    e=>{e.freshB.previousDocument=e.freshB.newDocument;},
    e=>{e.freshB.dom.doc='wrong-document';},
  ]) {
    const e=structuredClone(securityEvidence(cross));
    mutate(e);
    assert.equal(securityVerdict(e,['a','b'],{crossUser:true,forms:fixture.forms}).status,'NOT_PROVEN');
  }
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
  const [ambiguous]=reconcileResponseWitnesses([{...browser,...matched,witnessKey:'key'}],
    [host,{...host,privateData:true}]);
  assert.equal(ambiguous.privateData,false);
  assert.equal(ambiguous.problem,'AMBIGUOUS_CONFLICTING_RESPONSE_WITNESSES');
});

const pass=(name,details={})=>({name,status:'PASS',...details});
const membership=current({a:[7],b:[]});
const baselineRoots=current(fixture.native_oracle.a);
const before={state:'current',visibility:'visible',verifiedAt:'01:02',query:'SYN-',page:'۲ از ۲',
  focus:'7',entries:[7,8],visible:[7]};
const pending={...before,state:'syncing',showsChecking:true,showsVerifiedTime:true,observedAt:100,insertedCards:0};
const responses=[{element:'a',form:'3',status:200,pausedAt:90},{element:'b',form:'4',status:200,pausedAt:91}];
const remount={visibility:'hidden',state:'stale',cards:0,requests:0};

test('ordinary return rejects clear-and-reload, false current and changed context while held',()=>{
  assert.ok(retainedWhilePending(before,pending,responses,'3'));
  for(const bad of [{entries:[],visible:[]},{state:'current'},{showsChecking:false},
    {verifiedAt:'01:03'},{query:''},{page:'۱ از ۲'},{focus:'8'},{insertedCards:1}]){
    assert.equal(retainedWhilePending(before,{...pending,...bad},responses,'3'),false);
  }
  assert.equal(retainedWhilePending(before,pending,[],'3'),false);
});
const required=[
  pass('INDEPENDENT_BROWSER_IDENTITY',{executable:'chromium',version:'Chrome/140',args:['--remote-debugging-pipe']}),
  pass('NEUTRAL_NATIVE_VISIBILITY',{initial:'visible',hidden:visible('neutral','hidden'),visible:visible('neutral')}),
  pass('PRODUCT_HIDDEN_membership',{roots:baselineRoots,witness:visible('membership','hidden'),
    hiddenRemount:remount,hiddenView:{...before,visibility:'hidden'}}),
  pass('PRODUCT_VISIBLE_membership',{roots:membership,witness:visible('membership'),before,pending,responses,after:before}),
  ...[revokedName,cross].map(name=>pass(name.replace('_VISIBLE_','_HIDDEN_'),{roots:baselineRoots,witness:visible(name,'hidden')})),
  ...[revokedName,cross,freshName].map(name=>pass(name,securityEvidence(name))),
  pass('PRODUCT_CROSS_USER_FRESH_B',securityEvidence(cross).freshB),
  pass('ATOMIC_INFLIGHT_DETACH_REINSERT_GENUINE_RESPONSE',{bootstrapRequests:2}),
  pass('SHORTCODE_AFTER_EXPLICIT_ELEMENTOR_DEACTIVATION',{entries:2}),
];
const persisted=type=>({type,persisted:true,trusted:true});
const history={qualified:true,beforeDoc:'same',afterDoc:'same',pagehideRoots:roots,
  events:[persisted('pagehide'),persisted('pageshow')]};
const neutral=pass('NEUTRAL_NATIVE_BFCACHE',{witness:history});
const freshHistory={qualified:false,beforeDoc:'old',afterDoc:'new',events:[{...persisted('pageshow'),persisted:false}]};
const fallback=['membership','revocation'].flatMap(kind=>[
  {name:'PRODUCT_BFCACHE_'+kind,status:'NOT_PROVEN',witness:freshHistory,
    bfcacheDeferralReason:'Browser history return did not restore the original product document through BFCache'},
  {name:'PRODUCT_BFCACHE_CONSUMER_'+kind,status:'NOT_REACHED'},
]);
const freshMembership=pass('PRODUCT_SECURE_FRESH_LOAD_membership',{roots:membership});
const valid=[...required,neutral,...fallback,freshMembership];
const complete=rows=>lifecycleCompletion(rows,fixture);

test('requires unique valid successful lifecycle obligations from either branch',()=>{
  for (const name of required.map(r=>r.name)) {
    assert.ok(complete(valid.filter(r=>r.name!==name)).blocking.length,name);
    assert.ok(complete([...valid,valid.find(r=>r.name===name)]).blocking.length,name);
  }
  for (const status of ['NOT_PROVEN','NOT_REACHED','SKIPPED','unknown']) {
    const rows=valid.map(r=>r.name===revokedName?
      {...r,status,qualificationImpact:'NONBLOCKING_WITH_REASON',bfcacheDeferralReason:'invalid'}:r);
    const verdict=complete(rows);
    assert.ok(verdict.blocking.some(r=>r.name===revokedName));
    assert.equal(verdict.records.find(r=>r.name===revokedName).qualificationImpact,undefined);
  }
  assert.ok(complete(valid.map(r=>r.name===cross?{...r,freshB:{...r.freshB,verified:false}}:r)).blocking.length);
  assert.equal(complete(valid.map(r=>r.name===revokedName?{...r,status:'FAIL'}:r)).failed,true);
  assert.deepEqual(complete(valid).blocking,[]);
  assert.equal(complete(valid).records.filter(r=>r.qualificationImpact==='NONBLOCKING_WITH_REASON').length,4);
  assert.ok(complete(valid.filter(r=>r!==freshMembership)).blocking.length);
  assert.ok(complete(valid.filter(r=>r!==fallback[1])).blocking.length);
  assert.ok(complete([...valid,fallback[0]]).blocking.length);
  assert.ok(complete(valid.map(r=>r===fallback[0]?{...r,bfcacheDeferralReason:'arbitrary'}:r)).blocking.length);
  const restored=[...required,neutral,pass('PRODUCT_BFCACHE_membership',{witness:history,roots:membership}),
    pass('PRODUCT_BFCACHE_revocation',{witness:history,roots:[],shells:2,denials:[{status:403}]})];
  assert.deepEqual(complete(restored).blocking,[]);
  assert.ok(complete([...restored,freshMembership]).blocking.length);
  const reason='Neutral BFCache restoration was not observed';
  const neutralGap={...neutral,status:'NOT_PROVEN',witness:freshHistory,bfcacheDeferralReason:reason};
  const productGap={name:'PRODUCT_GENUINE_BFCACHE',status:'NOT_PROVEN',bfcacheDeferralReason:reason,
    reason:'Neutral genuine BFCache was not qualified'};
  const unreachable={name:'PRODUCT_GENUINE_BFCACHE_CONSUMER',status:'NOT_REACHED'};
  assert.deepEqual(complete([...required,neutralGap,productGap,unreachable]).blocking,[]);
  assert.ok(complete([...required,neutralGap,productGap]).blocking.length);
});
