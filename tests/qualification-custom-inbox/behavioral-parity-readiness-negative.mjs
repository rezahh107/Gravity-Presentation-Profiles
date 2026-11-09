/**
 * Real-browser WU21 negative tests on the SAME nativeObservation as parity.
 * All fixture users and tasks are synthetic. No vendor or product changes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {instrumentNativeInbox,nativeObservation,nativeSnapshot} from './native-readiness.mjs';

const env=process.env, dir=env.WU21_ARTIFACT_DIR;
const output=path.join(dir,'ciq2-parity-native-readiness-negative.json');
const report={head:env.GPP_WU21_REPOSITORY_SHA,status:'NOT_PROVEN',scenarios:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const bundle=/\/gravityflow\/assets\/js\/dist\/common-inbox\.[^/?]+\.js(?:\?|$)/;
function wp(code) {
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {encoding:'utf8',env,timeout:60000});
  assert.equal(r.status,0,'PARITY_NEGATIVE_WP_CLI_FAILED');
  return r.stdout.trim();
}
function cookies(uid){
  const code='$u=get_user_by("id",'+Number(uid)+');$e=time()+1800;' +
    'if(!$u)throw new RuntimeException("missing_fixture_actor");' +
    'echo wp_json_encode([["name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"auth")],' +
    '["name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"logged_in")]]);';
  return JSON.parse(wp(code)).map(c=>({...c,url:env.WU21_BASE_URL}));
}
function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}
async function assertGuardRejectsAndMutantPasses(page,state,scenario){
  // Controlled mutation reproduces old zero-row shortcut with the REAL page.
  const mutant=await nativeObservation(page,[],
    {errors:state.errors,bypassReadinessForMutation:true});
  assert.deepEqual(mutant,[],scenario+'_MUTANT_DID_NOT_FALSE_GREEN');
  let caught;
  try{await nativeObservation(page,[],{errors:state.errors,timeoutMs:900});}
  catch(error){caught=error;}
  assert.ok(caught,scenario+'_REPAIRED_COMPARATOR_FALSE_GREEN');
  const message=String(caught.message||caught);
  assert.ok(message.startsWith('PARITY_NATIVE_READINESS_NOT_PROVEN_'),
    scenario+'_WRONG_REPAIRED_FAILURE_'+message);
  return message;
}
async function scenario(browser,fixture,viewer,kind){
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addCookies(cookies(viewer));
  const page=await ctx.newPage();
  const state=await instrumentNativeInbox(page,{withholdInitialData:kind==='withheld'});
  const result={scenario:kind,status:'NOT_PROVEN',intercept_count:0,
    mutant_false_green:false,guard_failure:null,after_release:null};
  const held=deferred(),intercepted=deferred();
  try {
    if(kind==='blocked'||kind==='delayed'){
      await page.route(bundle,async route=>{
        result.intercept_count++;intercepted.resolve();await held.promise;await route.continue();
      });
      const nav=page.goto(fixture.native_url,{waitUntil:'commit',timeout:60000});
      await Promise.race([intercepted.promise,new Promise((_,reject)=>setTimeout(
        ()=>reject(Error('NATIVE_SCRIPT_NOT_INTERCEPTED')),12000))]);
      assert.equal((await nav).status(),200,kind+'_PAGE_HTTP');
    }else if(kind==='failed'){
      await page.route(bundle,async route=>{
        result.intercept_count++;intercepted.resolve();
        await route.abort('failed');
      });
      assert.equal((await page.goto(fixture.native_url,
        {waitUntil:'commit',timeout:60000})).status(),200,kind+'_PAGE_HTTP');
      // A successful document navigation is not proof that the native script
      // was requested; explicitly observe the intercepted failed delivery.
      await Promise.race([intercepted.promise,new Promise((_,reject)=>setTimeout(
        ()=>reject(Error('NATIVE_FAILED_SCRIPT_NOT_INTERCEPTED')),12000))]);
      await page.waitForLoadState('domcontentloaded',{timeout:20000});
    }else if(kind==='withheld'){
      assert.equal((await page.goto(fixture.native_url,
        {waitUntil:'domcontentloaded',timeout:60000})).status(),200,kind+'_PAGE_HTTP');
      await page.waitForFunction(()=>{
        const ev=window.__ciq2NativeReadiness?.events||[];
        return ev.some(e=>e.name==='paginationChanged') &&
          ev.some(e=>e.name==='gridSizeChanged');
      },null,{timeout:16000});
    }else throw Error('UNKNOWN_NEGATIVE_SCENARIO');
    if(kind!=='withheld')assert.ok(result.intercept_count>0,kind+'_MISSING_INTERCEPTION');
    result.guard_failure=await assertGuardRejectsAndMutantPasses(page,state,kind);
    result.mutant_false_green=true;
    result.before=await nativeSnapshot(page);
    if(kind==='delayed'){
      held.resolve();
      const rows=await nativeObservation(page,[],
        {errors:state.errors,timeoutMs:20000});
      assert.deepEqual(rows,[],kind+'_NOT_COMPLETED_EMPTY');
      result.after_release='PASS_COMPLETED_EMPTY';
    }else if(kind==='withheld'){
      await page.evaluate(()=>window.__ciq2NativeReadiness.releaseRows());
      const rows=await nativeObservation(page,[],
        {errors:state.errors,timeoutMs:20000});
      assert.deepEqual(rows,[],kind+'_NOT_COMPLETED_EMPTY');
      result.after_release='PASS_COMPLETED_EMPTY';
    }
    result.status='PASS';
  }catch(e){result.failure=String(e.message||e).slice(0,300);}
  finally{
    held.resolve();
    report.scenarios.push(result);save();
    await ctx.close();
  }
}
let browser;
try {
  assert.equal(env.WU21_BASE_URL,'http://127.0.0.1:8080','NON_DISPOSABLE_TARGET');
  assert.equal(env.CIQ2_SCENARIO,'return-fifo','WRONG_SCENARIO');
  assert.equal(env.CIQ2_PARITY_PHASE,'initial','WRONG_NEGATIVE_PHASE');
  const oracle=JSON.parse(fs.readFileSync(path.join(dir,'ciq2-parity-oracle-initial.json'),'utf8'));
  const fixture=JSON.parse(fs.readFileSync(path.join(dir,'ciq2-browser-fixture.json'),'utf8'));
  assert.equal(oracle.status,'PASS_INDEPENDENT_HOST_ORACLE','MISSING_HOST_ORACLE');
  assert.equal(oracle.head,env.GPP_WU21_REPOSITORY_SHA,'STALE_HOST_ORACLE');
  assert.equal(fixture.head,oracle.head,'STALE_FIXTURE');
  assert.deepEqual(oracle.roles.viewer.ids,[],'VIEWER_NOT_AUTHENTICALLY_EMPTY');
  assert.equal(oracle.roles.officer.ids.length,3,'POSITIVE_CONTROL_NOT_PRESENT');
  browser=await chromium.launch({headless:true});
  for(const kind of ['blocked','delayed','failed','withheld'])
    await scenario(browser,fixture,fixture.viewer,kind);
  assert.equal(report.scenarios.length,4,'NEGATIVE_SCENARIO_COUNT');
  for(const s of report.scenarios){
    assert.equal(s.status,'PASS','NEGATIVE_SCENARIO_FAILED_'+s.scenario);
    assert.equal(s.mutant_false_green,true,'NEGATIVE_MUTATION_NOT_DETECTED_'+s.scenario);
    assert.ok(s.guard_failure.startsWith('PARITY_NATIVE_READINESS_NOT_PROVEN_'),
      'NEGATIVE_GUARD_NOT_ENFORCED_'+s.scenario);
    if(['delayed','withheld'].includes(s.scenario))
      assert.equal(s.after_release,'PASS_COMPLETED_EMPTY',
        'NEGATIVE_NOT_RECOVERED_'+s.scenario);
  }
  report.status='PASS';save();
  console.log('CIQ2_PARITY_NATIVE_READINESS_NEGATIVES_PASS');
}catch(error){
  report.status='FAIL';report.error=String(error.message||error).slice(0,300);
  save();console.error('CIQ2_PARITY_NATIVE_READINESS_NEGATIVES_FAIL '+report.error);
  process.exitCode=1;
}finally{if(browser)await browser.close();}
