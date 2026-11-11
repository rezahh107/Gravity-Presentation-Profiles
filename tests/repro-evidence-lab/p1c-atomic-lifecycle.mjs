/**
 * P1-C test-only, exact-Head: genuine headed Chromium lifecycle qualification.
 * No synthetic visibility/pagehide/pageshow dispatch, no mocked AJAX payloads.
 * Collect non-PII counters and synthetic task identities only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env;
const origin=env.WU21_BASE_URL;
const artifact=env.WU21_ARTIFACT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(artifact,'p1c-atomic-fixture.json'),'utf8'));
const url=origin+'/?page_id='+fixture.post_id;
const results={head:env.GPP_WU21_REPOSITORY_SHA||null,host:'WordPress 6.8.3 + Elementor 4.4.0',
  browser:'headed Chromium through Xvfb',synthetic:true,results:[],failure:null};
const record=(name,status,details={})=>results.results.push({name,status,...details});
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {env,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stderr||r.stdout);
  return r.stdout.trim();
}
function cookies(id){
  const code="$u=get_user_by('id',"+Number(id)+");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(code)).map(item=>({...item,url:origin}));
}
async function createContext(browser,id=null){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  if(id!==null)await context.addCookies(cookies(id));
  await context.addInitScript(()=>{
    window.__p1cLifecycleEvents=[];
    const save=(type,extra={})=>window.__p1cLifecycleEvents.push({
      type,visibility:document.visibilityState,persisted:extra.persisted===true
    });
    document.addEventListener('visibilitychange',()=>save('visibilitychange'));
    window.addEventListener('pagehide',event=>save('pagehide',{persisted:event.persisted}));
    window.addEventListener('pageshow',event=>save('pageshow',{persisted:event.persisted}));
  });
  return context;
}
async function current(page){
  await page.waitForFunction(()=>{
    const roots=[...document.querySelectorAll('[data-ciq2-root]')];
    return roots.length===2 && roots.every(root=>root.dataset.ciq2State==='current');
  },null,{timeout:45000});
}
async function identities(page){
  return page.locator('[data-ciq2-entry]').evaluateAll(nodes=>
    nodes.map(n=>Number(n.dataset.ciq2Entry)).sort((a,b)=>a-b));
}
function sameItems(actual,expected,message){
  assert.deepEqual(actual,[...expected].sort((a,b)=>a-b),message);
}
let browser=null;
try {
  browser=await chromium.launch({headless:false,args:['--no-sandbox']});
  const probe=await createContext(browser);
  const one=await probe.newPage();
  await one.goto('about:blank');
  const two=await probe.newPage();
  await two.goto('about:blank');
  await one.bringToFront();
  assert.equal(await one.evaluate(()=>document.visibilityState),'visible',
    'CONTROL_VISIBLE_NOT_ESTABLISHED');
  await two.bringToFront();
  await one.waitForFunction(()=>document.visibilityState==='hidden',null,{timeout:10000});
  await one.bringToFront();
  await one.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:10000});
  const probeEvents=await one.evaluate(()=>window.__p1cLifecycleEvents);
  assert.ok(probeEvents.some(x=>x.type==='visibilitychange'&&x.visibility==='hidden') &&
    probeEvents.some(x=>x.type==='visibilitychange'&&x.visibility==='visible'),
    'ENVIRONMENT_NOT_QUALIFIED: control tabs did not produce native transitions');
  record('HEADED_BROWSER_NATIVE_VISIBILITY_CONTROL','PASS',{events:probeEvents});
  await probe.close();

  const ctx=await createContext(browser,fixture.users.a);
  const page=await ctx.newPage();
  await page.bringToFront();
  const loaded=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  assert.ok(loaded?.ok(),'Authentic P1-C frontend did not load');
  await current(page);
  sameItems(await identities(page),fixture.native_oracle.a.a,'Initial A task membership');
  const alternate=await ctx.newPage();
  await alternate.goto('about:blank');
  await alternate.bringToFront();
  await page.waitForFunction(()=>document.visibilityState==='hidden',null,{timeout:10000});
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-ciq2-root]')]
    .every(r=>r.dataset.ciq2State==='stale'&&r.querySelectorAll('[data-ciq2-entry]').length===0),
    null,{timeout:10000});
  record('PRODUCT_NATIVE_HIDDEN_INVALIDATES_PRIVATE_CARDS','PASS',{
    hiddenEntries:await page.locator('[data-ciq2-entry]').count()});
  await page.bringToFront();
  await page.waitForFunction(()=>document.visibilityState==='visible',null,{timeout:10000});
  await current(page);
  sameItems(await identities(page),fixture.native_oracle.a.a,'Re-entered A membership');
  record('PRODUCT_NATIVE_VISIBLE_REVALIDATES_A_MEMBERSHIP','PASS',{
    entries:(await identities(page)).length,
    events:await page.evaluate(()=>window.__p1cLifecycleEvents)});

  // Only a genuinely persisted page restoration qualifies BFCache.
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.goBack({waitUntil:'domcontentloaded',timeout:60000});
  const backEvents=await page.evaluate(()=>window.__p1cLifecycleEvents);
  if(backEvents.some(x=>x.type==='pageshow'&&x.persisted===true)){
    await current(page);
    sameItems(await identities(page),fixture.native_oracle.a.a,'BFCache revalidated membership');
    record('PRODUCT_GENUINE_BFCACHE_PERSISTED_RETURN','PASS',{events:backEvents});
  }else{
    record('PRODUCT_GENUINE_BFCACHE_PERSISTED_RETURN','NOT_PROVEN',{
      reason:'No native pageshow.persisted=true on the actual product document',
      events:backEvents});
  }
  await ctx.close();

  // Hold a real server bootstrap response, detach an in-flight native Atomic
  // shell, then reinsert it. Never fabricate the underlying response.
  const raceCtx=await createContext(browser,fixture.users.a);
  const racePage=await raceCtx.newPage();
  const target=fixture.element_ids_by_form[String(fixture.forms.a)];
  assert.match(target,/^[A-Za-z0-9]{6,32}$/);
  let hits=0;
  let releaseHold;
  const hold=new Promise(resolve=>{releaseHold=resolve;});
  let acknowledgeFirst;
  const first=new Promise(resolve=>{acknowledgeFirst=resolve;});
  let firstFetched=false;
  await racePage.route('**/wp-admin/admin-ajax.php',async route=>{
    const post=new URLSearchParams(route.request().postData()||'');
    if(post.get('action')!=='gpp_inbox2_atomic_bootstrap'||post.get('element_id')!==target){
      await route.continue();return;
    }
    hits++;
    if(hits!==1){await route.continue();return;}
    try{
      const response=await route.fetch();
      firstFetched=true;
      acknowledgeFirst();
      await hold;
      await route.fulfill({response});
    }catch(error){
      acknowledgeFirst();
    }
  });
  try {
    const opening=await racePage.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    assert.ok(opening?.ok());
    await Promise.race([first,new Promise((_,reject)=>setTimeout(
      ()=>reject(new Error('FIRST_ATOMIC_BOOTSTRAP_NOT_OBSERVED')),20000))]);
    assert.equal(firstFetched,true,'Original real bootstrap response was not captured');
    await racePage.evaluate(id=>{
      const node=document.querySelector('[data-gpp-atomic-element-id="'+id+'"]');
      if(!node||node.dataset.gppAtomicInbox2!=='pending')throw Error('ATOMIC_PENDING_ROOT_MISSING');
      window.__p1cDetached={node,parent:node.parentNode,next:node.nextSibling};
      node.remove();
    },target);
    await racePage.waitForTimeout(100);
    await racePage.evaluate(()=>{
      const {node,parent,next}=window.__p1cDetached;
      parent.insertBefore(node,next&&next.parentNode===parent?next:null);
    });
    for(let attempt=0;attempt<40&&hits<2;attempt++)await racePage.waitForTimeout(250);
    assert.ok(hits>=2,'Reattached root did not issue a second genuine bootstrap');
  }finally{
    releaseHold();
  }
  await current(racePage);
  sameItems(await identities(racePage),fixture.native_oracle.a.a,
    'Detached and reattached Atomic widget membership');
  await racePage.waitForTimeout(300);
  assert.equal(hits,2,'Duplicate or uncontrolled bootstrap after detach and reattach');
  record('ATOMIC_INFLIGHT_DETACH_REINSERT_GENUINE_RESPONSE','PASS',{bootstrapRequests:hits});
  await raceCtx.close();

  // Host-state transition: Elementor active -> explicitly deactivated.
  const deactivate=spawnSync('php',[env.WU21_WP_CLI,'plugin','deactivate','elementor',
    '--path='+env.WU21_WP_PATH],{env,encoding:'utf8',timeout:60000});
  assert.equal(deactivate.status,0,deactivate.stderr||deactivate.stdout);
  const postId=Number(wp('$p=wp_insert_post(array("post_type"=>"page","post_status"=>"publish",'
    +'"post_title"=>"P1C synthetic shortcode after Elementor off",'
    +'"post_content"=>"[gpp_inbox_2 form=\\"'+fixture.forms.a
    +'\\" native_page=\\"'+fixture.native_page_id+'\\"]"));'
    +'if(is_wp_error($p))throw new RuntimeException($p->get_error_message());echo $p;'));
  assert.ok(postId>0,'Shortcode page creation failed');
  const standalone=await createContext(browser,fixture.users.a);
  const standalonePage=await standalone.newPage();
  const response=await standalonePage.goto(origin+'/?page_id='+postId,
    {waitUntil:'domcontentloaded',timeout:60000});
  assert.ok(response?.ok(),'Shortcode page after Elementor deactivate failed');
  await standalonePage.waitForFunction(()=>[...document.querySelectorAll('[data-ciq2-root]')]
    .some(r=>r.dataset.ciq2State==='current'&&r.querySelectorAll('[data-ciq2-entry]').length===25),
    null,{timeout:30000});
  sameItems(await identities(standalonePage),fixture.native_oracle.a.a,
    'Shortcode task membership after Elementor deactivation');
  record('SHORTCODE_AFTER_EXPLICIT_ELEMENTOR_DEACTIVATION','PASS',{
    entries:(await identities(standalonePage)).length});
  await standalone.close();
} catch(error){
  results.failure=String(error?.stack||error).slice(0,3000);
  record('QUALIFICATION_EXECUTION','FAIL',{reason:String(error).slice(0,500)});
} finally{
  fs.writeFileSync(path.join(artifact,'p1c-atomic-lifecycle.json'),
    JSON.stringify(results,null,2));
  if(browser)await browser.close().catch(()=>{});
}
if(results.failure){
  console.error('P1C_ATOMIC_LIFECYCLE_QUALIFICATION_FAILED',results.failure);
  process.exit(1);
}
console.log('P1C_ATOMIC_LIFECYCLE_QUALIFICATION_COMPLETE',JSON.stringify(
  results.results.map(({name,status})=>({name,status}))));
