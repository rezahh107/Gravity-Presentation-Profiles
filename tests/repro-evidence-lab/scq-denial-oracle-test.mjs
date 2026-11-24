import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adjudicateDenial} from './scq-denial-oracle.mjs';
const corr='12345678-1234-1234-1234-123456789abc';
const head={sourceHead:'selected-main',harnessHead:'test-head',allowedIds:[51,52,53]};
const literal='{"success":false,"data":{"reason":"authorization_required"}}';
const body={bytes:Buffer.byteLength(literal),sha256:createHash('sha256').update(literal).digest('hex'),ids:[],markers:[],exactDenial:true,jsonSuccess:false,reason:'authorization_required'};
const browser={kind:'gpp_read',method:'POST',formId:3,status:403,done:false,body:null,failed:null,
  headers:{principal:'b',correlation:corr,cacheControl:'private, no-store'}};
const server={schema:1,sourceHead:head.sourceHead,harnessHead:head.harnessHead,kind:'gpp_read',correlation:corr,
  principal:'b',formId:3,status:403,cacheControl:'private, no-store',complete:true,body};
const check=(r=browser,s=server)=>adjudicateDenial(r,s,'b',head).status;
test('complete matching server denial closes only missing browser body',()=>{
  assert.equal(check(),'PASS');assert.equal(browser.body,null);assert.equal(browser.done,false);
});
test('missing or incomplete witness cannot pass',()=>{
  assert.equal(check(browser,null),'NOT_PROVEN');
  assert.equal(check(browser,{...server,complete:false}),'NOT_PROVEN');
});
test('wrong request, actor, form, status, Head, or missing header cannot pass',()=>{
  for(const x of [{correlation:'other'},{principal:'a'},{formId:4},{status:200},{harnessHead:'old'},{sourceHead:'other'}])
    assert.equal(check(browser,{...server,...x}),'NOT_PROVEN');
  assert.equal(check({...browser,headers:{...browser.headers,correlation:null}},server),'NOT_PROVEN');
});
test('unauthorized task or private field is FAIL even with denial status',()=>{
  assert.equal(check(browser,{...server,body:{...body,ids:[26]}}),'FAIL');
  assert.equal(check(browser,{...server,body:{...body,markers:['SYN-SC-A-NAME']}}),'FAIL');
});
test('unknown or augmented body and contradictory browser body cannot pass',()=>{
  assert.equal(check(browser,{...server,body:{...body,exactDenial:false}}),'NOT_PROVEN');
  assert.equal(check(browser,{...server,body:{...body,sha256:'c'.repeat(64)}}),'NOT_PROVEN');
  assert.equal(check({...browser,body:{...body,sha256:'b'.repeat(64)}},server),'NOT_PROVEN');
});
test('no-store and privacy remain mandatory',()=>{
  assert.equal(check(browser,{...server,cacheControl:'public, max-age=60'}),'FAIL');
  assert.equal(check({...browser,fromDiskCache:true},server),'FAIL');
});
test('anonymous and B distinguish independent authorized membership',()=>{
  const r={...browser,headers:{...browser.headers,principal:'anonymous'}};
  const s={...server,principal:'anonymous'};
  assert.equal(adjudicateDenial(r,s,'anonymous',{...head,allowedIds:[]}).status,'PASS');
  assert.equal(adjudicateDenial(r,{...s,body:{...body,ids:[51]}},'anonymous',{...head,allowedIds:[]}).status,'FAIL');
});
