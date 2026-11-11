/**
 * Real browser on WordPress 6.8.3 / Gravity Forms 3.1.1.1 /
 * Gravity Flow 3.1.0 / Elementor Core 4.4.0. No mocked service endpoints.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, origin=env.WU21_BASE_URL, dir=env.WU21_ARTIFACT_DIR;
const m=JSON.parse(fs.readFileSync(path.join(dir,'p1c-atomic-fixture.json'),'utf8'));
const url=origin+'/?page_id='+m.post_id;
const ajax=origin+'/wp-admin/admin-ajax.php',checks=[];
function wp(code) {
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {encoding:'utf8',env,timeout:60000});
  assert.equal(r.status,0,r.stderr||r.stdout);
  return r.stdout.trim();
}
function cookies(id) {
  const source="$u=get_user_by('id',"+Number(id)+");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(source)).map(x=>({...x,url:origin}));
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let failure=null;
const resources=[];
async function context(id=null) {
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  if(id!==null)await ctx.addCookies(cookies(id));
  return ctx;
}
async function load(ctx,name,htmlReplay=null) {
  const page=await ctx.newPage();
  if(htmlReplay!==null) {
    await page.route(url,route=>route.fulfill({status:200,contentType:'text/html',
      headers:{'Cache-Control':'public, max-age=3600'},body:htmlReplay}));
  }
  page.on('response',resp=>{
    if(!resp.url().includes('/admin-ajax.php') ||
      !resp.request().postData()?.includes('gpp_inbox2_'))return;
    resources.push({actor:name,status:resp.status(),
      action:new URLSearchParams(resp.request().postData()).get('action'),
      cache:resp.headers()['cache-control']||'',vary:resp.headers()['vary']||''});
  });
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  assert.ok(response?.ok(),'Frontend failed for '+name);
  const source=htmlReplay??await response.text();
  assert.ok(source.includes('data-gpp-atomic-inbox2'),'No static Twig Atomic placeholder');
  // This assertion fails on the original P1-C failure: a V4 Atomic Twig
  // root without Elementor's data-e-type/data-id can never bootstrap.
  const atomicIdentity=await page.locator('[data-gpp-atomic-inbox2]').evaluateAll(nodes=>
    nodes.map(node=>{
      const nearest=node.closest('[data-id]');
      return {type:node.getAttribute('data-e-type'),
        id:node.getAttribute('data-id'),
        element_type:node.getAttribute('data_element_type')||node.getAttribute('data-element_type'),
        attrs:node.getAttributeNames().filter(name=>name.startsWith('data-')).sort(),
        nearest_id:nearest?.getAttribute('data-id')||null,
        nearest_type:nearest?.getAttribute('data-e-type')||nearest?.getAttribute('data-widget_type')||null,
        parent_id:node.parentElement?.getAttribute('data-id')||null,
        parent_type:node.parentElement?.getAttribute('data-e-type')||null};
    }));
  assert.equal(atomicIdentity.length,2,
    'Exactly two persisted Atomic widget roots required: '+JSON.stringify(atomicIdentity));
  assert.ok(atomicIdentity.every(x=>x.type==='widget' && /^[a-zA-Z0-9]{6,32}$/.test(x.id||'')),
    'Elementor V4 native root identity unavailable before private bootstrap: '+JSON.stringify(atomicIdentity));
  assert.ok(!source.includes('data-ciq2-nonce') && !source.includes('SYN-P1C-'),
    'Initial cacheable HTML disclosed user-specific task data or a GPP read nonce');
  return {page,source};
}
const ids=async root=>root.locator('[data-ciq2-entry]').evaluateAll(nodes=>
  nodes.map(x=>Number(x.dataset.ciq2Entry)).sort((a,b)=>a-b));
async function waitForCurrent(page) {
  try {
    await page.waitForFunction(() => {
      const roots=[...document.querySelectorAll('[data-ciq2-root]')];
      return roots.length===2 && roots.every(x=>x.dataset.ciq2State==='current');
    },null,{timeout:45000});
  } catch(error) {
    const state=await page.locator('[data-gpp-atomic-inbox2]').evaluateAll(nodes=>
      nodes.map(node=>({type:node.getAttribute('data-e-type'),id:node.getAttribute('data-id'),
        status:node.dataset.gppAtomicInbox2,rootStates:[...node.querySelectorAll('[data-ciq2-root]')].map(x=>x.dataset.ciq2State),
        text:node.textContent.trim().slice(0,100)})));
    throw new Error('ATOMIC_WAIT_NOT_CURRENT '+JSON.stringify({state,resources})+' '+String(error));
  }
}
async function assertActor(page,actor) {
  await waitForCurrent(page);
  const roots=page.locator('[data-ciq2-root]');
  assert.equal(await roots.count(),2);
  const seenIds=[],labels=[];
  for(const key of ['a','b']){
    const root=roots.filter({has:page.locator('[data-ciq2-form="'+m.forms[key]+'"]')});
    // filter by root attribute directly (no nested-selector assumptions).
    const target=page.locator('[data-ciq2-root][data-ciq2-form="'+m.forms[key]+'"]');
    assert.equal(await target.count(),1,'Missing independently scoped Atomic instance');
    assert.deepEqual(await ids(target),m.native_oracle[actor][key],
      'Adapter task set differs from independently read Gravity Flow oracle');
    seenIds.push(...await ids(target));
    labels.push(await target.locator('h2').getAttribute('id'));
    assert.equal(await target.getAttribute('data-ciq2-element'),m.element_ids_by_form[String(m.forms[key])]);
  }
  assert.equal(new Set(labels).size,2,'DOM heading ID collision');
  assert.equal(await page.locator('[data-gpp-atomic-inbox2="ready"]').count(),2,
    'Native Elementor class-bearing shell was removed during bootstrap');
  return seenIds;
}
async function post(ctx,values) {
  return ctx.request.post(ajax,{form:values});
}
try {
  const a=await context(m.users.a);
  const aLoaded=await load(a,'a');
  const aIds=await assertActor(aLoaded.page,'a');
  assert.deepEqual(aIds,m.native_oracle.a.a);
  checks.push('A_REAL_AUTHORIZED_NATIVE_MEMBERSHIP','TWO_INDEPENDENT_ATOMIC_ROOTS');
  // The same existing renderer/JS, exercised on the real Atomic adapter:
  // 25 Native-authorized tasks -> 20/5 pagination, search reset, detail
  // and an independently verified read round trip.
  const aRoot=aLoaded.page.locator('[data-ciq2-root][data-ciq2-form="'+m.forms.a+'"]');
  assert.equal(await aRoot.locator('[data-ciq2-entry]').count(),25);
  assert.equal(await aRoot.locator('[data-ciq2-entry]:visible').count(),20);
  await aRoot.locator('[data-ciq2-next]').click();
  assert.equal(await aRoot.locator('[data-ciq2-entry]:visible').count(),5);
  assert.match(await aRoot.locator('[data-ciq2-pager] [data-ciq2-page]').textContent(),/۲ از ۲/);
  await aRoot.locator('[data-ciq2-search]').fill('SYN-P1C-A-0024');
  assert.equal(await aRoot.locator('[data-ciq2-entry]:visible').count(),1);
  assert.match(await aRoot.locator('[data-ciq2-pager] [data-ciq2-page]').textContent(),/۱ از ۱/);
  const detail=await aRoot.locator('[data-ciq2-entry]:visible [data-ciq2-detail]').first().getAttribute('href');
  assert.ok(detail && detail.includes('page=gravityflow-inbox') &&
    detail.includes('id='+m.forms.a) && detail.includes('view=entry'),
    'Detail must remain native Gravity Flow, not an independent GPP action');
  await aRoot.locator('[data-ciq2-search]').fill('synthetic-query-without-a-match');
  assert.equal(await aRoot.locator('[data-ciq2-entry]:visible').count(),0);
  assert.equal(await aRoot.locator('[data-ciq2-no-results]').isVisible(),true);
  await aRoot.locator('[data-ciq2-search]').fill('');
  assert.equal(await aRoot.locator('[data-ciq2-entry]:visible').count(),20);
  const refreshed=aLoaded.page.waitForResponse(resp=>resp.url().includes('admin-ajax.php') &&
    (resp.request().postData()||'').includes('action=gpp_inbox2_read') &&
    (resp.request().postData()||'').includes('form_id='+m.forms.a),{timeout:30000});
  await aRoot.locator('[data-ciq2-refresh]').click();
  const fresh=await refreshed;
  assert.equal(fresh.status(),200,'Real existing Inbox2 read/refresh path failed');
  await aLoaded.page.waitForFunction(form=>{
    const root=document.querySelector('[data-ciq2-root][data-ciq2-form="'+form+'"]');
    return root?.dataset.ciq2State==='current' && root.querySelectorAll('[data-ciq2-entry]').length===25;
  },String(m.forms.a),{timeout:30000});
  checks.push('ATOMIC_REAL_25_TASK_FIFO_SEARCH_PAGINATION_DETAIL_REFRESH');

  const b=await context(m.users.b);
  const bLoaded=await load(b,'b');
  const bIds=await assertActor(bLoaded.page,'b');
  assert.deepEqual(bIds,m.native_oracle.b.b);
  assert.ok(aIds.every(id=>!bIds.includes(id)),'A/B task sets overlap');
  checks.push('B_REAL_AUTHORIZED_NATIVE_MEMBERSHIP_AND_AB_NONOVERLAP');

  // A's cached *initial* page is intentionally replayed to B. Only B's
  // authenticated bootstrap/read may fill the static shell.
  const replay=await context(m.users.b);
  const replayed=await load(replay,'b_cached_a',aLoaded.source);
  assert.deepEqual(await assertActor(replayed.page,'b'),m.native_oracle.b.b);
  checks.push('CACHED_A_DOCUMENT_REPLAY_TO_B_NO_PRIVATE_TASK_LEAK');

  const anonymous=await context();
  const anonymousPage=await load(anonymous,'anon_cached_a',aLoaded.source);
  await anonymousPage.page.waitForFunction(() => {
    return [...document.querySelectorAll('[data-gpp-atomic-inbox2]')].every(x=>
      x.textContent.includes('فهرست در دسترس نیست'));
  },null,{timeout:30000});
  assert.equal(await anonymousPage.page.locator('[data-ciq2-entry]').count(),0);
  checks.push('ANONYMOUS_CACHED_DOCUMENT_HAS_NO_TASKS_OR_GPP_NONCE');

  for(const actor of ['a','b','b_cached_a','anon_cached_a']){
    const expected=actor.startsWith('anon')?403:200;
    const seen=resources.filter(x=>x.actor===actor);
    assert.ok(seen.some(x=>x.action==='gpp_inbox2_atomic_bootstrap' && x.status===expected),
      'Missing authentic bootstrap response for '+actor);
    for (const x of seen) {
      assert.match(x.cache,/\bno-store\b/i,'Private AJAX response was cacheable');
    }
    if(expected===200) {
      assert.ok(seen.some(x=>x.action==='gpp_inbox2_read' && x.status===200),
        'Authorized Atomic did not reuse Inbox 2 authenticated read');
    }
  }
  checks.push('BOOTSTRAP_AND_READ_RESPONSES_PRIVATE_NO_STORE');

  const element=m.element_ids_by_form[String(m.forms.a)];
  const current=aLoaded.page.locator('[data-ciq2-root][data-ciq2-form="'+m.forms.a+'"]');
  const nonce=await current.getAttribute('data-ciq2-nonce');
  const validRead={action:'gpp_inbox2_read',page_id:String(m.post_id),
    form_id:String(m.forms.a),native_page_id:String(m.native_page_id),
    element_id:element,nonce};
  const negatives=[
    ['wrong_element',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.post_id),element_id:'deadbeef'}],
    ['wrong_document',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.native_page_id),element_id:element}],
    ['draft_document',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.negative_pages.draft),element_id:element}],
    ['non_elementor_page',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.negative_pages.plain),element_id:element}],
    ['password_protected_page_without_wp_postpass',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.negative_pages.protected),element_id:element}],
    ['password_protected_native_page_without_wp_postpass',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.negative_pages.protected_native_owner),element_id:element}],
    ['duplicate_element',{action:'gpp_inbox2_atomic_bootstrap',page_id:String(m.negative_pages.duplicate),element_id:element}],
    ['wrong_nonce',{...validRead,nonce:'invalid'}],
    ['wrong_form',{...validRead,form_id:String(m.forms.b)}],
    ['wrong_native_page',{...validRead,native_page_id:String(m.post_id)}],
    ['wrong_read_element',{...validRead,element_id:'deadbeef'}],
  ];
  for(const [label,values] of negatives){
    const resp=await post(a,values);
    assert.equal(resp.status(),403,'Negative control failed closed: '+label);
    const body=await resp.text();
    assert.ok(!body.includes('SYN-P1C-') && !body.includes('data-ciq2-entry'),
      'Denied response disclosed task data: '+label);
  }
  checks.push('ELEVEN_REAL_SERVER_SIDE_IDENTITY_SCOPE_NONCE_NEGATIVE_CONTROLS');

  // Revoke A's cookies after cards were drawn: subsequent native read must
  // clear every prior authorized card rather than keep stale private HTML.
  await a.clearCookies();
  await current.locator('[data-ciq2-refresh]').click();
  await aLoaded.page.waitForFunction(()=> {
    const x=document.querySelector('[data-ciq2-root][data-ciq2-state="stale"]');
    return x && x.querySelectorAll('[data-ciq2-entry]').length===0;
  },null,{timeout:30000});
  assert.equal(await current.locator('[data-ciq2-entry]').count(),0);
  checks.push('REVOKED_SESSION_CLEARS_PREVIOUS_ATOMIC_CARDS');

  await bLoaded.page.screenshot({path:path.join(dir,'p1c-atomic-frontend-b-390.png'),fullPage:true});
  await Promise.all([a.close(),b.close(),replay.close(),anonymous.close()]);
} catch(e) {
  failure=String(e?.stack||e);
  process.stderr.write(failure.slice(0,1600)+'\n');
} finally {
  fs.writeFileSync(path.join(dir,'p1c-atomic-runtime.json'),JSON.stringify({
    head:env.GPP_WU21_REPOSITORY_SHA,versions:{
      wordpress:'6.8.3',gravityforms:'3.1.1.1',gravityflow:'3.1.0',elementor:'4.4.0'},
    checks,private_responses:resources,failure
  },null,2));
  await browser.close();
}
if(failure)process.exit(1);
console.log('P1C_AUTHENTIC_ATOMIC_NATIVE_AB_CACHE_NEGATIVE_CONTROLS_PASS');
