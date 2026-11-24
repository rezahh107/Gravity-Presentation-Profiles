/** Synthetic, disposable WordPress acceptance; real UI and Native readback. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
const env=process.env, dir=env.WU21_ARTIFACT_DIR;
const m=JSON.parse(fs.readFileSync(path.join(dir,'sla-fixture.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(dir,'sla-installed-zip.json'),'utf8'));
const logins=JSON.parse(fs.readFileSync(env.SLA_LOGIN_FILE,'utf8'));
const report={sourceHead:env.SLA_SOURCE_HEAD,harnessHead:env.GITHUB_SHA,package:pkg,fixture:m,
  browser:null,results:{},observations:{},requests:[]};
const criteria=['operator_queue','rtl_mobile_search_dates','manual_nonfirst','native_detail','cancel','real_approve',
  'handoff','safe_return','updated_queue','automatic_refresh','manual_refresh','next_case','keyboard_focus','accountant_access','unassigned_queue'];
for(const id of criteria)report.results[id]={status:'NOT_REACHED'};
const save=()=>fs.writeFileSync(path.join(dir,'sla-journey-results.json'),JSON.stringify(report,null,2));
class EvidenceGap extends Error{}
function need(ok,msg){assert.ok(ok,msg);}
function native(actor,operation='read'){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval-file','tests/repro-evidence-lab/sla-native-read.php'],
    {env:{...env,SLA_ACTOR:actor,SLA_OPERATION:operation},encoding:'utf8',timeout:60000});
  if(r.status!==0)throw new EvidenceGap('NATIVE_READBACK_NOT_AVAILABLE');
  return JSON.parse(r.stdout);
}
let active=null;
async function step(id,fn,optional=false){
  active=id;
  try{const details=await fn();report.results[id]={status:'PASS',details};save();return details;}
  catch(e){report.results[id]={status:e instanceof EvidenceGap||e.name==='TimeoutError'?'NOT_PROVEN':'FAIL',reason:String(e.message||e).slice(0,700)};save();if(!optional)throw e;}
}
const root=p=>p.locator('[data-ciq2-root]');
const card=(p,id)=>root(p).locator('[data-ciq2-entry="'+id+'"]');
const detail=(p,id)=>card(p,id).locator('[data-ciq2-detail]');
const digits=x=>x.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
async function login(page,actor){
  // Existing normal WordPress login UI with the fixture's temporary accounts.
  const u=logins[actor];
  await page.goto(env.WU21_BASE_URL+'/wp-login.php?redirect_to='+encodeURIComponent(m.url));
  await page.locator('#user_login').fill(u.username);
  await page.locator('#user_pass').fill(u.password);
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('#wp-submit').click()]);
}
function checkCache(r){need(r.status()===200&&/\bprivate\b/i.test(r.headers()['cache-control']||'')&&/\bno-store\b/i.test(r.headers()['cache-control']||''),'EXPECTED_PRIVATE_CURRENT_RESPONSE');}
async function snapshot(p){
  await root(p).waitFor({state:'visible',timeout:20000});
  await p.waitForFunction(()=>document.querySelector('[data-ciq2-root]')?.dataset.ciq2State==='current'&&!!window.GPPInbox2);
  return root(p).evaluate(r=>({dir:getComputedStyle(r).direction,lang:r.lang,verified:r.dataset.ciq2VerifiedAt,
    status:r.querySelector('[data-ciq2-status]').textContent.trim(),
    ariaLive:r.querySelector('[data-ciq2-announcement]').getAttribute('aria-live'),
    focus:document.activeElement.closest('[data-ciq2-entry]')?.dataset.ciq2Entry||null,
    rows:[...r.querySelectorAll('[data-ciq2-entry]')].map(n=>({id:Number(n.dataset.ciq2Entry),hidden:n.hidden,
      name:n.querySelector('[data-ciq2-name]').textContent.trim(),nid:n.querySelector('[data-ciq2-national-id]').textContent.trim(),
      school:n.querySelector('[data-ciq2-school-grade]').textContent.trim(),
      created:n.querySelector('.ciq2-meta div:first-child dd').textContent.trim(),href:n.querySelector('[data-ciq2-detail]').href}))}));
}
function sameQueue(q,n,visible=true){
  assert.deepEqual(q.rows.map(x=>x.id),n.ids,'NATIVE_FIFO_MEMBERSHIP');
  if(visible)assert.deepEqual(q.rows.filter(x=>!x.hidden).map(x=>x.id),n.ids.slice(0,20),'VISIBLE_PAGINATION');
  for(const x of q.rows){const c=n.cells[x.id];assert.deepEqual([x.name,x.nid,x.school,x.created],[c.name,c.nid,c.school,c.created],'NATIVE_CELL_PARITY');}
  need(digits(q.status).startsWith(n.ids.length+' پرونده در صف'),'QUEUE_COUNT');
}
async function open(p){const r=await p.goto(m.url,{waitUntil:'domcontentloaded'});checkCache(r);return snapshot(p);}
function verifyDetailUrl(url,id){const u=new URL(url),n=new URL(m.native_url);need(u.origin===n.origin&&u.pathname===n.pathname&&u.searchParams.get('view')==='entry'&&Number(u.searchParams.get('id'))===m.form_id&&Number(u.searchParams.get('lid'))===id,'WRONG_NATIVE_CASE');}
async function select(p,id,keyboard=false){
  const l=detail(p,id),href=await l.getAttribute('href');verifyDetailUrl(href,id);
  const nav=p.waitForNavigation({waitUntil:'domcontentloaded'});
  if(keyboard)await p.keyboard.press('Enter');else await l.click();
  const r=await nav;need(r.status()===200,'NATIVE_DETAIL_HTTP');verifyDetailUrl(p.url(),id);
  await p.locator('.gravityflow_workflow_detail').waitFor({state:'visible',timeout:20000});
  return {id,href,landed:p.url(),status:r.status()};
}
function focusInfo(l){return l.evaluate(e=>{const s=getComputedStyle(e);return {focused:document.activeElement===e,
  visible:e.getClientRects().length>0,focusVisible:e.matches(':focus-visible'),outline:s.outlineStyle,outlineWidth:s.outlineWidth,
  shadow:s.boxShadow,name:(e.getAttribute('aria-label')||e.textContent||'').trim()};});}
function hasFocus(x){return x.focused&&x.visible&&x.focusVisible&&((x.outline!=='none'&&parseFloat(x.outlineWidth)>0)||x.shadow!=='none');}
const approve=p=>p.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="approved"]').filter({visible:true});
const isRead=r=>r.url().includes('/wp-admin/admin-ajax.php')&&r.request().method()==='POST'&&
  new URLSearchParams(r.request().postData()||'').get('action')==='gpp_inbox2_read';
async function received(r){checkCache(r);const b=await r.json();need(b.success===true&&Number.isSafeInteger(b.data?.count),'REFRESH_PAYLOAD');return {status:r.status(),count:b.data.count};}
function unchanged(before,after,except=[]){for(const id of Object.keys(before.states))if(!except.includes(Number(id)))assert.deepEqual(after.states[id],before.states[id],'OTHER_TASK_CHANGED_'+id);}
let browser;
save();
try{
  need(pkg.sha256==='447eaabd67a64ca2f3ea5cda1bf06166dc21706b63e3d8631c0966931216a492','EXACT_PACKAGE_REQUIRED');
  browser=await chromium.launch({headless:true});report.browser=browser.version();
  const ctx=await browser.newContext({viewport:{width:1280,height:900},locale:'fa-IR'});
  const page=await ctx.newPage();
  const requests=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/wp-admin/admin-ajax.php')&&new URLSearchParams(r.postData()||'').get('action')==='gpp_inbox2_read'){const a={at:Date.now(),kind:'native_read_request'};requests.push(a);report.requests.push(a);}});
  await login(page,'officer');
  let before,after,selected,first,focusCard,focusAction,returnTime,returned;
  await step('operator_queue',async()=>{
    before=native('officer');assert.deepEqual(before.ids,m.entries);
    assert.deepEqual(native('accountant').ids,[]);
    need(before.ids.length===25,'NATIVE_25_TASK_FIXTURE');
    const q=await open(page);report.observations.before={native:before,queue:q};save();sameQueue(q,before);
    await root(page).locator('[data-ciq2-next]').click();
    assert.deepEqual((await snapshot(page)).rows.filter(x=>!x.hidden).map(x=>x.id),before.ids.slice(20));
    await root(page).locator('[data-ciq2-prev]').click();sameQueue(await snapshot(page),before);
    return {actor:m.users.officer,queue:q};
  });
  await step('rtl_mobile_search_dates',async()=>{
    const q=await snapshot(page);const phrase='نیلوفر آزمایشی';
    const expected=before.ids.filter(id=>before.cells[id].name.includes(phrase));
    need(expected.length>0&&expected.length<25,'PERSIAN_SEARCH_POSITIVE_FIXTURE');
    await root(page).locator('[data-ciq2-search]').fill(phrase);
    assert.deepEqual((await snapshot(page)).rows.filter(x=>!x.hidden).map(x=>x.id),expected);
    await root(page).locator('[data-ciq2-search]').fill('');
    await page.setViewportSize({width:390,height:844});
    const mobile=await root(page).evaluate(r=>({dir:getComputedStyle(r).direction,lang:r.lang,scroll:r.scrollWidth,width:r.clientWidth,
      controls:[...r.querySelectorAll('[data-ciq2-detail]')].slice(0,2).map(a=>{const b=a.getBoundingClientRect();return {left:b.left,right:b.right,height:b.height}})}));
    need(mobile.dir==='rtl'&&mobile.lang==='fa'&&mobile.scroll<=mobile.width+1&&mobile.controls.every(x=>x.left>=0&&x.right<=391&&x.height>0),'MOBILE_RTL_READABILITY_GEOMETRY');
    sameQueue(await snapshot(page),before);
    await page.setViewportSize({width:1280,height:900});
    need(q.dir==='rtl'&&q.lang==='fa'&&q.ariaLive==='polite'&&q.status.includes('آخرین تأیید '+q.verified),'RTL_STATUS_SEMANTICS');
    return {desktop:{dir:q.dir,lang:q.lang},mobile,search:phrase,matches:expected,
      date_created:q.rows[0].created,verification:q.verified,timezone:m.timezone,
      semanticLimit:'canonical date_created; last confirmation = queue snapshot, not approval; site Jalali/actual human clarity NOT_PROVEN'};
  },true);
  await page.setViewportSize({width:1280,height:900});
  await root(page).locator('[data-ciq2-search]').fill('');
  await step('manual_nonfirst',async()=>{
    first=before.ids[0];selected=before.ids[1];
    await root(page).locator('[data-ciq2-refresh]').focus();await page.keyboard.press('Tab');
    need(await root(page).locator('[data-ciq2-search]').evaluate(x=>document.activeElement===x),'TAB_SEARCH');
    await page.keyboard.press('Tab');need(await detail(page,first).evaluate(x=>document.activeElement===x),'TAB_FIRST_CARD');
    await page.keyboard.press('Tab');need(await detail(page,selected).evaluate(x=>document.activeElement===x),'TAB_SECOND_CARD');
    await page.keyboard.press('Shift+Tab');need(await detail(page,first).evaluate(x=>document.activeElement===x),'SHIFT_TAB_FIRST');
    await page.keyboard.press('Tab');focusCard=await focusInfo(detail(page,selected));need(focusCard.focused,'SECOND_CARD_FOCUS');
    return {id:selected,position:2,first,control:await detail(page,selected).innerText(),focus:focusCard};
  });
  await step('native_detail',async()=>{
    const d=await select(page,selected,true);
    const n=native('officer');assert.deepEqual(n.states,before.states);
    need(n.states[selected].can_update&&n.states[selected].step===m.steps.officer,'NATIVE_DETAIL_AUTHORITY');
    need(await approve(page).count()===1&&await approve(page).isEnabled(),'NATIVE_ACTION_MISSING');
    let trace=[];
    for(let i=0;i<120;i++){await page.keyboard.press('Tab');const found=await approve(page).evaluate(x=>document.activeElement===x);trace.push(found?'Approve':await page.evaluate(()=>document.activeElement.tagName));if(found)break;}
    focusAction=await focusInfo(approve(page));need(focusAction.focused,'NATIVE_ACTION_KEYBOARD_UNREACHABLE');
    return {...d,authority:n.states[selected],focus:focusAction,tabPath:trace};
  });
  await step('cancel',async()=>{
    const d=page.waitForEvent('dialog',{timeout:10000}).then(async x=>{need(x.type()==='confirm','EXPECTED_NATIVE_CONFIRM');await x.dismiss();});
    await Promise.all([d,page.keyboard.press('Enter')]);
    const n=native('officer');assert.deepEqual(n.states,before.states);assert.deepEqual(n.ids,before.ids);
    return {selected,unchanged:true};
  });
  await step('real_approve',async()=>{
    const d=page.waitForEvent('dialog',{timeout:10000}).then(async x=>{need(x.type()==='confirm','EXPECTED_NATIVE_CONFIRM');await x.accept();});
    const [r]=await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),d,approve(page).press('Enter')]);
    after=native('officer');report.observations.after=after;save();
    need(r.status()<400&&after.states[selected].step===m.steps.accountant&&!after.states[selected].can_update,'NATIVE_ACTION_NOT_CONFIRMED_BY_HOST');
    unchanged(before,after,[selected]);need(!after.ids.includes(selected),'OFFICER_RETAINS_SELECTED_TASK');
    return {actor:m.users.officer,selected,action:'approved',response:r.status(),before:before.states[selected],after:after.states[selected]};
  });
  await step('handoff',async()=>{
    const a=native('accountant');assert.deepEqual(a.ids,[selected]);need(a.states[selected].can_update,'ACCOUNTANT_NATIVE_AUTHORITY');
    assert.deepEqual(after.ids,before.ids.filter(x=>x!==selected));
    return {officerIds:after.ids,accountantIds:a.ids,accountantState:a.states[selected]};
  });
  await step('safe_return',async()=>{
    const l=page.locator('#sla-return-shortcode').filter({visible:true});need(await l.count()===1,'VISIBLE_SITE_RETURN_NOT_AVAILABLE');
    assert.equal(await l.getAttribute('href'),m.url);
    returnTime=Date.now();
    const [r]=await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),l.click()]);
    checkCache(r);returned=await snapshot(page);return {url:page.url(),route:'ordinary configured site hyperlink',status:r.status()};
  });
  await step('updated_queue',async()=>{sameQueue(returned,after);need(!returned.rows.some(x=>x.id===selected),'STALE_SELECTED_CASE');return returned;});
  await step('automatic_refresh',async()=>{
    need(Date.now()-returnTime<18000&&await page.evaluate(()=>document.visibilityState)==='visible','AUTO_REFRESH_PRECONDITION');
    const id=after.ids[0];await detail(page,id).focus();
    const response=page.waitForResponse(isRead,{timeout:45000});
    const arrival=native('applicant','arrival');const expected=native('officer');assert.deepEqual(expected.ids,[...after.ids,arrival.entry]);
    const receipt=await received(await response);
    await page.waitForFunction(id=>document.querySelector('[data-ciq2-root]')?.dataset.ciq2State==='current'&&!!document.querySelector('[data-ciq2-entry="'+id+'"]'),arrival.entry,{timeout:20000});
    const q=await snapshot(page);report.observations.auto={arrival,expected,queue:q,receipt};save();sameQueue(q,expected);assert.equal(q.focus,String(id));
    const observed=requests.filter(x=>x.at>=returnTime);need(observed.length===1,'AUTO_REFRESH_NOT_ISOLATED');
    const elapsed=observed[0].at-returnTime;need(elapsed>=27000&&elapsed<=45000,'REAL_POLL_CADENCE');
    assert.equal(receipt.count,expected.ids.length);unchanged(after,expected);
    return {arrival,elapsedMs:elapsed,receipt,queue:q,focusBefore:id,focusAfter:q.focus};
  });
  await step('manual_refresh',async()=>{
    const expected=native('officer');
    const [r]=await Promise.all([page.waitForResponse(isRead,{timeout:20000}),root(page).locator('[data-ciq2-refresh]').press('Enter')]);
    const receipt=await received(r);const q=await snapshot(page);sameQueue(q,expected);assert.equal(receipt.count,expected.ids.length);
    assert.deepEqual(native('officer').states,expected.states);return {receipt,status:q.status};
  });
  await step('next_case',async()=>{
    const n=native('officer');const id=n.ids[0];need(id!==selected,'NEXT_ALREADY_PROCESSED');
    const d=await select(page,id);assert.deepEqual(native('officer').states,n.states);return {id,actual:d,unchanged:true};
  });
  await step('keyboard_focus',async()=>{
    need(hasFocus(focusCard),'SHORTCODE_INVISIBLE_FOCUS');need(hasFocus(focusAction),'NATIVE_INVISIBLE_FOCUS');
    need(focusCard.name.length>0&&focusAction.name.length>0,'MISSING_ACCESSIBLE_NAME');
    return {card:focusCard,action:focusAction,tabReverseEnter:true,screenReader:'NOT_PROVEN'};
  },true);
  await ctx.close();
  await step('accountant_access',async()=>{
    const c=await browser.newContext({viewport:{width:1280,height:900},locale:'fa-IR'});
    try{const p=await c.newPage();await login(p,'accountant');const n=native('accountant');assert.deepEqual(n.ids,[selected]);
      const q=await open(p);sameQueue(q,n);const d=await select(p,selected);
      need(await approve(p).count()===1&&await approve(p).isEnabled(),'ACCOUNTANT_UI_ACTION_NOT_AVAILABLE');
      assert.deepEqual(native('accountant').states,n.states);return {actor:m.users.accountant,ids:n.ids,detail:d,noActionTaken:true};}
    finally{await c.close();}
  });
  await step('unassigned_queue',async()=>{
    const c=await browser.newContext({viewport:{width:1280,height:900},locale:'fa-IR'});
    try{const p=await c.newPage();await login(p,'applicant');const n=native('applicant');assert.deepEqual(n.ids,[]);
      const q=await open(p);sameQueue(q,n);need(q.rows.length===0,'UNASSIGNED_QUEUE_NOT_EMPTY');
      assert.deepEqual(native('applicant').states,n.states);return {actor:m.users.applicant,ids:[],previousNativeAccessDenialControls:'retained historical evidence'};}
    finally{await c.close();}
  });
}catch(e){report.stopped={criterion:active,reason:String(e.message||e).slice(0,700)};}
finally{if(browser)await browser.close();save();}
console.log('SLA_RESULTS '+JSON.stringify(Object.fromEntries(Object.entries(report.results).map(([k,v])=>[k,v.status]))));
if(Object.values(report.results).some(x=>x.status==='FAIL'))process.exit(1);
if(report.stopped||Object.values(report.results).some(x=>x.status!=='PASS'))process.exit(2);
