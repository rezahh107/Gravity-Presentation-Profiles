/** Actual P1-C synthetic consumer tests using the independent CDP browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {context,tab,transition,historyReturn,poll,readState} from './p1c-native-browser.mjs';
import {qualifyThenCheck,requireInvalidated,securityVerdict} from './p1c-lifecycle-oracle.mjs';

function nativeMembership(wp,actor){
  assert.ok(['a','b'].includes(actor));
  const code='$m=get_option("gpp_p1c_fixture_manifest");wp_set_current_user((int)$m["users"]["'+actor+'"]);$out=[];foreach($m["forms"] as $key=>$fid){$args=apply_filters("gravityflow_inbox_args",array_merge(Gravity_Flow_Inbox::get_defaults(),["form_id"=>$fid,"paging"=>["offset"=>0,"page_size"=>2001]]));$total=0;$entries=Gravity_Flow_API::get_inbox_entries($args,$total);if(!is_array($entries)||$total!==count($entries))throw new RuntimeException("NATIVE_ORACLE_FAILED");$ids=array_map("intval",array_column($entries,"id"));sort($ids,SORT_NUMERIC);$out[$key]=$ids;}echo wp_json_encode($out);';
  return JSON.parse(wp(code));
}
function entryStatus(wp,id,status){
  assert.ok(Number.isSafeInteger(id)&&id>0&&['trash','active'].includes(status));
  wp('$r=GFAPI::update_entry_property('+id+',"status","'+status+'");if(is_wp_error($r)||!$r||GFAPI::get_entry('+id+')["status"]!=="'+status+'")throw new RuntimeException("SYNTHETIC_MEMBERSHIP_MUTATION_FAILED");');
}
function revoke(wp,uid){
  assert.ok(Number.isSafeInteger(uid)&&uid>0);
  const result=spawnSync('php',[process.env.WU21_WP_CLI,'user','session','destroy',String(uid),
    '--all','--path='+process.env.WU21_WP_PATH],{encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,'DISPOSABLE_WORDPRESS_SESSION_REVOCATION_FAILED');
  assert.equal(wp('echo count(WP_Session_Tokens::get_instance('+uid+')->get_all());'),'0',
    'DISPOSABLE_SESSION_REVOCATION_NOT_OBSERVED');
  return {user:uid,commandExit:result.status,remaining:0};
}
async function login(page,origin,credentials,productUrl){
  await page.activate();
  const initial=await page.navigate(origin+'/wp-login.php');
  // Only disposable synthetic accounts; real WordPress form submission.
  // Credentials remain in the local test process and inherited CDP pipes.
  await page.evaluate('(()=>{const c='+JSON.stringify(credentials)+',f=document.querySelector("#loginform");'+
    'if(!f)throw Error("LOGIN_FORM_MISSING");f.querySelector("#user_login").value=c.username;'+
    'f.querySelector("#user_pass").value=c.password;f.querySelector("[name=redirect_to]").value='+JSON.stringify(productUrl)+
    ';f.requestSubmit(f.querySelector("#wp-submit"));return true})()');
  await poll('WORDPRESS_LOGIN_NAVIGATION_NOT_OBSERVED',async()=>{
    const s=await page.read();
    return s&&s.doc!==initial.doc&&!s.url.includes('/wp-login.php')&&s.ready==='complete'?s:null;
  },30000);
  return page.navigate(productUrl,true);
}
function requireRoots(s,fixture){
  assert.equal(s.shells,2,'TWO_ATOMIC_SHELLS_REQUIRED');
  assert.equal(s.roots.length,2,'TWO_ATOMIC_ROOTS_REQUIRED');
  for(const key of ['a','b']){
    assert.equal(s.roots.filter(r=>r.form===String(fixture.forms[key])&&
      r.element===fixture.element_ids_by_form[String(fixture.forms[key])]).length,1,
      'ATOMIC_ROOT_IDENTITY_MISMATCH_'+key);
  }
}
async function current(page,fixture,expected){
  const s=await poll('TWO_CURRENT_ROOTS_NOT_OBSERVED',async()=>{
    const x=await page.read();return x?.roots.length===2&&x.roots.every(r=>r.state==='current')?x:null;
  },45000);
  requireRoots(s,fixture);
  for(const key of ['a','b']){
    const root=s.roots.find(r=>r.form===String(fixture.forms[key]));
    assert.deepEqual(root.entries,expected[key],'NATIVE_MEMBERSHIP_MISMATCH_'+key);
  }
  return s;
}
async function deferredBfcacheDenied(page,fixture,after){
  // A stale marker alone is not enough: observe a genuine, subsequent denied
  // same-origin fetch and ensure no private cards remain in either widget.
  return poll('FRESH_DENIAL_WITH_NO_PRIVATE_CARDS_NOT_OBSERVED',async()=>{
    const s=await page.read();
    if(s?.shells!==2)return null;
    const zero=s.roots.every(r=>r.entries.length===0);
    const stale=s.roots.length===2&&s.roots.every(r=>r.state==='stale');
    const bootstrapDenied=s.roots.length===0&&s.denied===2;
    if(!zero||(!stale&&!bootstrapDenied))return null;
    if(stale)requireRoots(s,fixture);
    const response=await page.evaluate('performance.getEntriesByType("resource").filter(e=>'+
      'e.initiatorType==="fetch"&&new URL(e.name).pathname==="/wp-admin/admin-ajax.php"&&'+
      'e.startTime>='+Number(after)+'&&e.responseStatus===403).map(e=>({status:e.responseStatus,start:e.startTime}))');
    return response.length?{roots:s.roots,shells:s.shells,denials:response}:null;
  },30000);
}
// Read old synthetic credentials only in memory. Never put a nonce in evidence.
async function oldReadRequests(page,fixture){
  const rows=await page.evaluate('Array.from(document.querySelectorAll("[data-ciq2-root]"),r=>({action:"gpp_inbox2_read",nonce:r.dataset.ciq2Nonce,page_id:r.dataset.ciq2Page,form_id:r.dataset.ciq2Form,native_page_id:r.dataset.ciq2NativePage,element_id:r.dataset.ciq2Element}))');
  assert.equal(rows.length,2,'TWO_OLD_READ_IDENTITIES_REQUIRED');
  for(const key of ['a','b']){
    const id=fixture.element_ids_by_form[String(fixture.forms[key])];
    assert.ok(rows.some(r=>r.element_id===id&&r.form_id===String(fixture.forms[key])&&
      r.page_id===String(fixture.post_id)&&r.native_page_id===String(fixture.native_page_id)&&r.nonce),
      'OLD_READ_IDENTITY_MISSING');
  }
  return rows;
}
const domEvidence=s=>s?{doc:s.doc,state:s.state,ready:s.ready,roots:s.roots,
  widgetStates:s.widgetStates,documentCards:s.documentCards,cardEvents:s.cardEvents,
  privateMarker:s.privateMarker}:null;
async function directControls(page,network,origin,requests,e){
  network.phase('direct');
  for(const values of requests){
    try{
      // A genuine same-origin browser request with the current cookies and the
      // old captured nonce. The fixed header labels only this independent control.
      await page.evaluate('(async()=>{const r=await fetch('+JSON.stringify(origin+'/wp-admin/admin-ajax.php')+
        ',{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","X-P1C-Control":"direct"},body:new URLSearchParams('+
        JSON.stringify(values)+'),signal:AbortSignal.timeout(12000)});await r.text();return true})()');
    }catch{e.observationProblems.push('DIRECT_REQUEST_EXECUTION_INCOMPLETE');}
  }
}
async function collectSecurity(page,network,origin,fixture,old,e,{crossUser=false,fresh=false}={}){
  try{
    await poll('TERMINAL_CONSUMER_STATE_NOT_OBSERVED',async()=>{
      const s=await page.read();
      if(!s)return null;
      const terminal=s.widgetStates?.length===2&&s.widgetStates.every(w=>w.denied&&w.roots.length===0||
        w.roots.length===1&&w.roots[0].state==='stale'&&w.roots[0].entries.length===0);
      const doc=network.documentSnapshot().filter(d=>d.phase==='consumer').at(-1);
      const admission=doc&&(doc.login&&new URL(s.url).pathname==='/wp-login.php'||
        doc.productPage&&[401,403].includes(doc.status));
      const loginDenied=fresh&&new URL(s.url).origin===origin&&admission&&s.widgetStates?.length===0;
      return terminal||loginDenied?s:null;
    },20000);
  }catch{e.observationProblems.push('TERMINAL_CONSUMER_STATE_NOT_OBSERVED');}
  try{await network.settled();}catch{e.observationProblems.push('CONSUMER_NETWORK_NOT_SETTLED');}
  const requests=[...old];
  if(!crossUser)for(const r of old)requests.push({action:'gpp_inbox2_atomic_bootstrap',page_id:r.page_id,element_id:r.element_id});
  try{await directControls(page,network,origin,requests,e);}
  finally{
    try{await network.settled();}catch{e.observationProblems.push('DIRECT_NETWORK_NOT_SETTLED');}
    const s=await page.read().catch(()=>null);
    e.finalDom=domEvidence(s);
    e.documents=network.documentSnapshot();
    const doc=e.documents.filter(d=>d.phase==='consumer').at(-1);
    e.admissionDenied=Boolean(fresh&&s&&new URL(s.url).origin===origin&&s.widgetStates?.length===0&&doc&&
      (doc.login&&new URL(s.url).pathname==='/wp-login.php'||doc.productPage&&[401,403].includes(doc.status)));
    e.network=network.snapshot();
  }
}
export async function nativeConsumer({cdp,neutral,visibility,bfcache,fixture,wp,record,origin}){
  const credentials=JSON.parse(fs.readFileSync(process.env.P1C_LOGIN_FILE,'utf8'));
  const url=origin+'/?page_id='+fixture.post_id;
  const ids=Object.values(fixture.element_ids_by_form);
  const mutation=fixture.native_oracle.a.a.at(-1);
  const expectedChanged=()=>{
    const expected=nativeMembership(wp,'a');
    assert.deepEqual(expected.a,fixture.native_oracle.a.a.filter(id=>id!==mutation),
      'NATIVE_MUTATION_DID_NOT_CHANGE_MEMBERSHIP');
    assert.deepEqual(expected.b,[]);
    return expected;
  };
  async function prepare(id,actor='a'){
    const page=await tab(cdp,id);
    await login(page,origin,credentials[actor],url);
    try{await current(page,fixture,fixture.native_oracle[actor]);}
    catch(e){record('PRODUCT_BASELINE_'+actor,'FAIL',{reason:String(e.message||e)});return null;}
    return page;
  }
  const restore=()=>{entryStatus(wp,mutation,'active');assert.deepEqual(nativeMembership(wp,'a'),fixture.native_oracle.a);};
  if(!visibility){
    record('PRODUCT_NATIVE_VISIBILITY','NOT_PROVEN',{reason:'Neutral genuine visibility was not qualified'});
    record('PRODUCT_NATIVE_VISIBILITY_CONSUMER','NOT_REACHED');
  }else{
    let changed=false;
    try{
      await context(cdp,async id=>{
        const other=await tab(cdp,id);await other.activate();await other.navigate(neutral+'/away');
        const p=await prepare(id);if(!p){record('PRODUCT_HIDDEN_membership','NOT_REACHED');return;}
        const hidden=await qualifyThenCheck(record,'PRODUCT_HIDDEN_membership',
          ()=>transition(p,other.activate,'hidden'),async()=>{
            const s=await p.read();requireRoots(s,fixture);requireInvalidated(s.roots,ids);
            return {roots:s.roots};
          });
        if(!hidden){record('PRODUCT_VISIBLE_membership','NOT_REACHED');return;}
        changed=true;entryStatus(wp,mutation,'trash');const expected=expectedChanged();
        await qualifyThenCheck(record,'PRODUCT_VISIBLE_membership',()=>transition(p,p.activate,'visible'),async()=>{
          const s=await current(p,fixture,expected);return {roots:s.roots};
        });
      });
    }catch(e){record('PRODUCT_VISIBILITY_FIXTURE_membership','NOT_PROVEN',{reason:String(e.message||e)});}
    finally{if(changed){try{restore();}catch(e){record('SYNTHETIC_MEMBERSHIP_RESTORE','FAIL',{reason:String(e.message||e)});}}}
  }
  // Required fresh-load control does not depend on optional BFCache restoration.
  for(const kind of ['revocation','cross_user','fresh_revocation']){
    const fresh=kind==='fresh_revocation',crossUser=kind==='cross_user';
    const name=fresh?'PRODUCT_SECURE_FRESH_LOAD_revocation':'PRODUCT_VISIBLE_'+kind;
    const e={case:name,revocation:null,baselineVerified:false,transitionVerified:false,
      freshNavigationVerified:false,finalDom:null,network:[],observationProblems:[],freshB:null,
      expectedWidgets:Object.fromEntries(Object.entries(fixture.element_ids_by_form).map(([form,element])=>[element,form]))};
    let network;
    try{
      await context(cdp,async id=>{
        const other=await tab(cdp,id);
        if(!fresh){await other.activate();await other.navigate(neutral+'/away');}
        const p=await tab(cdp,id);
        network=await p.observeNetwork(origin,name);
        try{
          await login(p,origin,credentials.a,url);
          const aExpected=nativeMembership(wp,'a');
          assert.ok(Object.values(aExpected).some(v=>v.length>0),'A_POSITIVE_CONTROL_EMPTY');
          const a=await current(p,fixture,aExpected);
          e.baselineVerified=true;e.baseline=domEvidence(a);e.baselineOracle=aExpected;
          const old=await oldReadRequests(p,fixture);
          await network.settled();
          network.phase('pre_revocation');
          if(!fresh){
            if(!visibility){e.observationProblems.push('NATIVE_VISIBILITY_NOT_QUALIFIED');return;}
            const hidden=await qualifyThenCheck(record,'PRODUCT_HIDDEN_'+kind,
              ()=>transition(p,other.activate,'hidden'),async()=>{
                const s=await p.read();requireRoots(s,fixture);requireInvalidated(s.roots,ids);
                return {roots:s.roots};
              });
            if(!hidden){e.observationProblems.push('HIDDEN_INVALIDATION_NOT_QUALIFIED');return;}
          }
          e.revocation=revoke(wp,fixture.users.a);
          network.phase('consumer');
          if(crossUser){
            await login(other,origin,credentials.b,url);
            const expected=nativeMembership(wp,'b');
            assert.ok(Object.values(expected).some(v=>v.length>0),'B_POSITIVE_CONTROL_EMPTY');
            await current(other,fixture,expected);
          }
          if(fresh){
            const s=await p.navigate(url,true);
            e.freshNavigationVerified=s.doc!==a.doc;
          }else{
            try{e.witness=await transition(p,p.activate,'visible');e.transitionVerified=e.witness.qualified===true;}
            catch{e.observationProblems.push('AUTHENTIC_RETURN_NOT_OBSERVED');}
          }
          try{await collectSecurity(p,network,origin,fixture,old,e,{crossUser,fresh});}
          catch{e.observationProblems.push('SECURITY_OBSERVATION_INCOMPLETE');}
          if(crossUser){
            // Always check fresh B, even when the old A consumer fails.
            try{
              const expected=nativeMembership(wp,'b');
              assert.ok(Object.values(expected).some(v=>v.length>0),'B_POSITIVE_CONTROL_EMPTY');
              await other.navigate(url,true);
              const s=await current(other,fixture,expected);
              e.freshB={verified:true,oracle:expected,dom:domEvidence(s)};
              record('PRODUCT_CROSS_USER_FRESH_B','PASS',e.freshB);
            }catch(err){
              e.freshB={verified:false,membershipMismatch:/NATIVE_MEMBERSHIP_MISMATCH/.test(String(err.message))};
              record('PRODUCT_CROSS_USER_FRESH_B',e.freshB.membershipMismatch?'FAIL':'NOT_PROVEN',e.freshB);
            }
          }
        }finally{
          if(!e.finalDom)e.finalDom=domEvidence(await p.read().catch(()=>null));
          e.network=network.snapshot();e.documents=network.documentSnapshot();network.close();
        }
      });
    }catch{e.observationProblems.push('SECURITY_FIXTURE_OR_CONTROL_INCOMPLETE');}
    const verdict=securityVerdict(e,ids,{crossUser,fresh});
    record(name,verdict.status,{...e,...verdict});
  }
  if(!bfcache){
    record('PRODUCT_GENUINE_BFCACHE','NOT_PROVEN',{reason:'Neutral genuine BFCache was not qualified'});
    record('PRODUCT_GENUINE_BFCACHE_CONSUMER','NOT_REACHED');
  }else for(const kind of ['membership','revocation']){
    let changed=false;
    try{
      await context(cdp,async id=>{
        const p=await prepare(id);if(!p){record('PRODUCT_BFCACHE_'+kind,'NOT_REACHED');return;}
        const initial=await p.read();
        // Listener registered after GPP mounted: observe the actual result
        // of GPP pagehide handlers without replacing or dispatching any event.
        await p.evaluate('window.addEventListener("pagehide",()=>{window.__p1cNativeTrace.pagehideRoots=('+readState.toString()+')().roots})');
        const h=await p.send('Page.getNavigationHistory'),entry=h.entries[h.currentIndex];
        await p.navigate(neutral+'/away');
        let expected;
        if(kind==='membership'){changed=true;entryStatus(wp,mutation,'trash');expected=expectedChanged();}
        else revoke(wp,fixture.users.a);
        let witness;
        try{witness=await historyReturn(p,entry,initial);}
        catch(e){record('PRODUCT_BFCACHE_'+kind,'NOT_PROVEN',{reason:String(e.message||e),
          reasons:cdp.notRestored.filter(x=>x.session===p.sessionId)});record('PRODUCT_BFCACHE_CONSUMER_'+kind,'NOT_REACHED');return;}
        if(!witness.qualified){
          record('PRODUCT_BFCACHE_'+kind,'NOT_PROVEN',{witness,reasons:cdp.notRestored.filter(x=>x.session===p.sessionId)});
          record('PRODUCT_BFCACHE_CONSUMER_'+kind,'NOT_REACHED');
          if(witness.beforeDoc===witness.afterDoc){if(kind==='membership')record('PRODUCT_SECURE_FRESH_LOAD_'+kind,'NOT_PROVEN');return;}
          try{
            if(kind==='revocation')return; // dedicated authentic fresh-navigation control above
            const s=await current(p,fixture,expected);
            record('PRODUCT_SECURE_FRESH_LOAD_'+kind,'PASS',{roots:s.roots});
          }catch(e){record('PRODUCT_SECURE_FRESH_LOAD_'+kind,'FAIL',{reason:String(e.message||e)});}
          return;
        }
        await qualifyThenCheck(record,'PRODUCT_BFCACHE_'+kind,async()=>witness,async()=>{
          requireInvalidated(witness.pagehideRoots||[],ids);
          const hide=witness.events.find(e=>e.type==='pagehide'&&e.trusted);
          assert.ok(hide,'BFCACHE_TRUSTED_PAGEHIDE_REQUIRED');
          const s=kind==='membership'?await current(p,fixture,expected):await deferredBfcacheDenied(p,fixture,hide.at);
          return {roots:s.roots};
        });
      });
    }catch(e){record('PRODUCT_BFCACHE_FIXTURE_'+kind,'NOT_PROVEN',{reason:String(e.message||e)});}
    finally{if(changed){try{restore();}catch(e){record('SYNTHETIC_MEMBERSHIP_RESTORE','FAIL',{reason:String(e.message||e)});}}}
  }
}
