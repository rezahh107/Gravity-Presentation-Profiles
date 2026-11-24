/** Three exact-main Shortcode security scenarios, no Atomic or BFCache tests. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {independentBrowser,context,tab,transition,poll} from './scq-browser.mjs';
import {observeNetwork} from './scq-network.mjs';

const env=process.env,dir=env.WU21_ARTIFACT_DIR,origin=env.WU21_BASE_URL;
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'scq-fixture.json'),'utf8'));
const credentials=JSON.parse(fs.readFileSync(env.SCQ_LOGIN_FILE,'utf8'));
const url=fixture.url,results=[];
const report={sourceHead:env.SCQ_SOURCE_HEAD,harnessHead:env.GITHUB_SHA,fixture:{
  forms:fixture.forms,users:fixture.users,native_oracle:fixture.native_oracle},browser:null,results};
const output=()=>fs.writeFileSync(path.join(dir,'scq-results.json'),JSON.stringify(report,null,2));
class Violation extends Error{}
const violation=(condition,reason)=>{if(!condition)throw new Violation(reason);};
const proof=(condition,reason)=>{if(!condition)throw Error(reason);};
const sorted=x=>[...x].sort((a,b)=>a-b);
const equal=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {env,encoding:'utf8',timeout:60000});
  proof(r.status===0,'WORDPRESS_CLI_EVIDENCE_FAILED');
  return r.stdout.trim();
}
function membership(actor){
  proof(['a','b'].includes(actor),'ACTOR_UNKNOWN');
  const code='$m=get_option("gpp_scq_fixture_manifest");wp_set_current_user((int)$m["users"]["'+actor+'"]);$out=[];foreach($m["forms"] as $k=>$fid){$args=apply_filters("gravityflow_inbox_args",array_merge(Gravity_Flow_Inbox::get_defaults(),["form_id"=>$fid,"paging"=>["offset"=>0,"page_size"=>2001]]));$total=0;$rows=Gravity_Flow_API::get_inbox_entries($args,$total);if(!is_array($rows)||count($rows)!==$total)throw new RuntimeException("NATIVE_ORACLE_FAILED");$ids=array_map("intval",array_column($rows,"id"));sort($ids,SORT_NUMERIC);$out[$k]=$ids;}echo wp_json_encode($out);';
  const observed=JSON.parse(wp(code));
  assert.deepEqual(observed,fixture.native_oracle[actor]);
  return observed;
}
function sessionCount(actor){
  const uid=fixture.users[actor];
  proof(Number.isSafeInteger(uid)&&uid>0,'INVALID_SYNTHETIC_USER');
  const n=Number(wp('echo count(WP_Session_Tokens::get_instance('+uid+')->get_all());'));
  proof(Number.isSafeInteger(n)&&n>=0,'SESSION_OBSERVATION_INVALID');
  return n;
}
function revoke(actor){
  const before=sessionCount(actor);proof(before>0,'NO_VALID_SESSION_TO_REVOKE');
  const r=spawnSync('php',[env.WU21_WP_CLI,'user','session','destroy',String(fixture.users[actor]),
    '--all','--path='+env.WU21_WP_PATH],{env,encoding:'utf8',timeout:60000});
  proof(r.status===0,'SERVER_SESSION_REVOCATION_FAILED');
  const after=sessionCount(actor);proof(after===0,'SERVER_SESSION_REVOCATION_NOT_OBSERVED');
  return {before,after};
}
async function login(page,actor){
  await page.activate();
  const start=await page.navigate(origin+'/wp-login.php',true);
  // Real WordPress login; only generated synthetic accounts in this runner.
  // Never retain form payloads or cookie values.
  await page.evaluate('(()=>{const c='+JSON.stringify(credentials[actor])+',f=document.querySelector("#loginform");'+
    'if(!f)throw Error("LOGIN_FORM_MISSING");f.querySelector("#user_login").value=c.username;'+
    'f.querySelector("#user_pass").value=c.password;f.querySelector("[name=redirect_to]").value='+JSON.stringify(url)+
    ';f.requestSubmit(f.querySelector("#wp-submit"));return true})()');
  const next=await poll('REAL_WORDPRESS_LOGIN_RETURN_NOT_OBSERVED',async()=>{
    const s=await page.read();
    return s&&s.doc!==start.doc&&!s.url.includes('/wp-login.php')&&s.ready==='complete'&&
      s.events.some(e=>e.type==='pageshow'&&e.trusted)?s:null;
  },30000);
  if(new URL(next.url).pathname!==new URL(url).pathname)await page.navigate(url,true);
}
function expectedIds(actor){
  return actor==='anonymous'?[]:Object.values(fixture.native_oracle[actor]).flat();
}
function noLeak(state,actor,label){
  proof(state&&Array.isArray(state.roots)&&Array.isArray(state.privateMarkers),label+'_DOM_OBSERVER_MISSING');
  const allowed=expectedIds(actor);
  const ids=state.roots.flatMap(r=>r.entries);
  violation(ids.every(id=>allowed.includes(id)),label+'_UNAUTHORIZED_DOM_TASK');
  const markers=state.privateMarkers;
  violation(markers.every(x=>actor!=='anonymous'&&x.startsWith('SYN-SC-'+actor.toUpperCase()+'-')),
    label+'_UNAUTHORIZED_DOM_PRIVATE_FIELD');
}
function positiveDom(state,actor){
  noLeak(state,actor,'POSITIVE');
  proof(state.roots.length===Object.keys(fixture.forms).length,'SHORTCODE_ROOTS_NOT_OBSERVED');
  for(const k of ['a','b']){
    const roots=state.roots.filter(r=>r.form===String(fixture.forms[k]));
    proof(roots.length===1,'SHORTCODE_FORM_ROOT_IDENTITY_MISSING');
    violation(roots[0].state==='current'&&equal(roots[0].entries,fixture.native_oracle[actor][k]),
      'AUTHORIZED_NATIVE_TASK_SET_NOT_RENDERED');
  }
  proof(state.privateMarkers.some(x=>x.startsWith('SYN-SC-'+actor.toUpperCase()+'-')),
    'POSITIVE_PRIVATE_FIELD_MARKER_NOT_OBSERVED');
}
function responseEvidence(net,phase,actor,{page=false,read=false,positive=false}={}){
  const rows=net.records.filter(x=>x.phase===phase);
  const product=rows.filter(x=>x.kind==='page'||x.kind==='gpp_read');
  // Establish the actual server principal before blaming the product for data.
  proof(product.some(x=>x.headers?.principal===actor&&x.headers.correlation),'EFFECTIVE_SERVER_PRINCIPAL_NOT_ESTABLISHED');
  proof(product.every(x=>!x.headers?.principal||x.headers.principal===actor),'SERVER_PRINCIPAL_MISMATCH');
  // Scan all observed relevant response bodies, not just the accepting request.
  for(const x of rows){
    if(!x.body)continue;
    const allowed=expectedIds(actor);
    violation(x.body.ids.every(id=>allowed.includes(id)),'UNAUTHORIZED_NETWORK_TASK_'+x.kind);
    violation(x.body.markers.every(m=>actor!=='anonymous'&&m.startsWith('SYN-SC-'+actor.toUpperCase()+'-')),
      'UNAUTHORIZED_NETWORK_PRIVATE_FIELD_'+x.kind);
  }
  proof(product.length>0,'NO_ATTRIBUTABLE_PRODUCT_RESPONSE');
  proof(product.every(x=>x.done&&x.body&&x.headers&&x.headers.correlation&&!x.failed),
    'PRODUCT_RESPONSE_WITNESS_INCOMPLETE');
  for(const x of product){
    proof(x.headers.principal===actor,'EFFECTIVE_SERVER_PRINCIPAL_NOT_ESTABLISHED');
    violation(/\bno-store\b/i.test(x.headers.cacheControl)&&/\bprivate\b/i.test(x.headers.cacheControl),
      'PRIVATE_RESPONSE_CACHE_PROTECTION_MISSING');
    violation(!x.fromDiskCache&&!x.fromServiceWorker,'PERSONALIZED_RESPONSE_CACHE_REUSE');
  }
  if(page)proof(product.some(x=>x.kind==='page'),'ACTUAL_PAGE_RESPONSE_MISSING');
  if(read)proof(product.some(x=>x.kind==='gpp_read'),'ACTUAL_REENTRY_READ_RESPONSE_MISSING');
  if(positive){
    const docs=product.filter(x=>x.kind==='page');
    proof(docs.some(x=>x.status===200&&equal(x.body.ids,expectedIds(actor))),'POSITIVE_PAGE_BODY_NATIVE_PARITY_NOT_OBSERVED');
    for(const x of product.filter(x=>x.kind==='gpp_read')){
      proof(x.status===200&&x.body.jsonSuccess===true,'POSITIVE_READ_RESPONSE_NOT_OBSERVED');
    }
  }
  return product;
}
async function snapshot(page,out,label){
  const s=await page.read();
  out.states[label]=s;output();return s;
}
async function awaitCurrent(page){
  return poll('SHORTCODE_CURRENT_STATE_NOT_OBSERVED',async()=>{
    const s=await page.read();
    return s?.roots.length===2&&s.roots.every(r=>r.state==='current')&&
      await page.evaluate('typeof window.GPPInbox2?.initAll==="function"')?s:null;
  },30000);
}
async function terminal(page){
  return poll('SHORTCODE_TERMINAL_STATE_NOT_OBSERVED',async()=>{
    const s=await page.read();
    return s&&((s.roots.length===2&&s.roots.every(r=>['stale','current'].includes(r.state)))||
      (s.roots.length===0&&s.denied>0))?s:null;
  },35000);
}
async function baseline(page,net,out,actor,phase){
  net.setPhase(phase);await login(page,actor);
  const s=await awaitCurrent(page);out.states[phase]=s;
  proof(sessionCount(actor)>0,'VALID_SESSION_NOT_ESTABLISHED');
  await net.settle();responseEvidence(net,phase,actor,{page:true,positive:true});
  positiveDom(s,actor);
  // A real manual read confirms both the positive request observer and the
  // installed consumer's working authenticated read path.
  net.setPhase(phase+'_refresh');
  await page.evaluate('document.querySelector("[data-ciq2-refresh]").closest("form").requestSubmit()');
  await poll('POSITIVE_REFRESH_RESPONSE_NOT_OBSERVED',()=>net.records.some(x=>x.phase===phase+'_refresh'&&x.kind==='gpp_read'&&x.done&&x.body),30000);
  const refreshed=await awaitCurrent(page);positiveDom(refreshed,actor);
  await net.settle();responseEvidence(net,phase+'_refresh',actor,{read:true});
  const reads=net.records.filter(x=>x.phase===phase+'_refresh'&&x.kind==='gpp_read');
  proof(reads.some(x=>x.status===200&&x.body?.jsonSuccess===true),'AUTHORIZED_READ_POSITIVE_CONTROL_MISSING');
  out.states[phase+'_refresh']=refreshed;output();
}
async function runScenario(cdp,neutral,name,kind){
  const out={name,status:'NOT_PROVEN',nativeMembership:{},states:{},transitions:{},sessions:{},network:[],errors:[]};
  results.push(out);output();
  try{
    await context(cdp,async id=>{
      let page,other;const observers=[];
      async function observedTab(label){
        const p=await tab(cdp,id),net=await observeNetwork(cdp,p,url);
        observers.push({label,page:p,net});return {p,net};
      }
      try{
        out.nativeMembership.a=membership('a');out.nativeMembership.b=membership('b');
        proof(expectedIds('a').length>0&&expectedIds('b').length>0&&
          !expectedIds('a').some(x=>expectedIds('b').includes(x)),'NONEMPTY_DISJOINT_NATIVE_FIXTURE_REQUIRED');
        if(kind!=='fresh'){
          other=await observedTab('other');await other.p.activate();await other.p.navigate(neutral+'/away');
        }
        page=await observedTab('original_a');
        await baseline(page.p,page.net,out,'a','a_positive');
        if(kind!=='fresh'){
          page.net.setPhase('hidden');
          out.transitions.hidden=await transition(page.p,other.p.activate,'hidden');
          const hidden=await snapshot(page.p,out,'hidden');
          proof(hidden.roots.length===2,'HIDDEN_SHORTCODE_ROOT_IDENTITIES_MISSING');
          // A real hidden transition must invalidate the previously nonempty roots.
          violation(hidden.roots.every(r=>r.state==='stale'&&r.entries.length===0)&&hidden.privateMarkers.length===0,
            'PRIVATE_CARDS_NOT_INVALIDATED_ON_TRUSTED_HIDDEN');
        }
        out.sessions.revokedA=revoke('a');output();
        if(kind==='switch'){
          await baseline(other.p,other.net,out,'b','b_positive');
          out.sessions.validB=sessionCount('b');
          proof(out.sessions.validB>0&&sessionCount('a')===0,'SWITCHED_SERVER_SESSION_NOT_ESTABLISHED');
        }
        if(kind==='fresh'){
          const fresh=await observedTab('fresh_after_revoke');
          fresh.net.setPhase('fresh_revoked');await fresh.p.activate();await fresh.p.navigate(url,true);
          const state=await snapshot(fresh.p,out,'fresh_revoked');
          await fresh.net.settle();
          const responses=responseEvidence(fresh.net,'fresh_revoked','anonymous',{page:true});
          noLeak(state,'anonymous','FRESH_REVOKED');
          proof(responses.some(x=>x.kind==='page'&&x.body.denied),'SERVER_RENDERED_DENIAL_NOT_OBSERVED');
          violation(state.roots.length===0&&state.denied>0,'FRESH_REVOKED_UI_NOT_DENIED');
          out.denialPath={ajaxRequests:responses.filter(x=>x.kind==='gpp_read').length,serverRendered:true};
        }else{
          const actor=kind==='switch'?'b':'anonymous';
          page.net.setPhase('returned');
          out.transitions.visible=await transition(page.p,page.p.activate,'visible');
          const immediate=await snapshot(page.p,out,'return_immediate');noLeak(immediate,actor,'RETURN_IMMEDIATE');
          const final=await terminal(page.p);out.states.return_final=final;noLeak(final,actor,'RETURN_FINAL');
          await page.net.settle();
          const responses=responseEvidence(page.net,'returned',actor,{read:final.roots.length>0,page:final.roots.length===0});
          if(final.roots.every(r=>r.entries.length===0)){
            proof(responses.some(x=>[401,403].includes(x.status)||x.body.denied||
              (x.body.jsonSuccess===false&&x.body.reason==='authorization_required')),'ATTRIBUTABLE_DENIAL_NOT_OBSERVED');
          }else{
            proof(actor==='b','UNEXPECTED_AUTHORIZED_RETURN');
            positiveDom(final,'b');
          }
          if(kind==='switch'){
            // Stale A nonce may correctly fail closed. Demonstrate nonempty B
            // on a fresh page under the same actual B session.
            page.net.setPhase('b_fresh');await page.p.navigate(url,true);
            const b=await awaitCurrent(page.p);out.states.b_fresh=b;
            await page.net.settle();responseEvidence(page.net,'b_fresh','b',{page:true,positive:true});
            positiveDom(b,'b');
          }
        }
        proof(observers.every(o=>!o.net.errors.some(e=>e.kind==='observer_event_processing_error')),'NETWORK_OBSERVER_PROCESSING_ERROR');
        out.status='PASS';
      }catch(e){out.status=e instanceof Violation?'FAIL':'NOT_PROVEN';out.reason=String(e.message||e).slice(0,500);}
      finally{
        for(const o of observers){
          try{await o.net.settle();out.states['last_'+o.label]=await o.page.read();}catch{}
          out.network.push({tab:o.label,records:o.net.records});
          out.errors.push(...o.net.errors.map(e=>({tab:o.label,...e})));o.net.detach();
        }
        output();
      }
    });
  }catch(e){out.status='NOT_PROVEN';out.reason=String(e.message||e).slice(0,500);}
  output();
}
try{
  await independentBrowser((name,status,details)=>{report.browser={name,status,...details};output();},async({cdp,neutral})=>{
    await runScenario(cdp,neutral,'RETURN_AFTER_SESSION_REVOCATION','revoked');
    await runScenario(cdp,neutral,'RETURN_AFTER_SWITCH_A_TO_B','switch');
    await runScenario(cdp,neutral,'FRESH_LOAD_AFTER_SESSION_REVOCATION','fresh');
  });
}catch(e){report.executionError=String(e.message||e).slice(0,500);}
finally{output();}
console.log('SCQ_RESULTS '+JSON.stringify(results.map(x=>({name:x.name,status:x.status,reason:x.reason}))));
if(results.some(x=>x.status==='FAIL'))process.exit(1);
if(report.executionError||results.length!==3||results.some(x=>x.status!=='PASS'))process.exit(2);
