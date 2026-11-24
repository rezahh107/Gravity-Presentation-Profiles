/** Bounded installed-package queue smoke; no workflow actions or SCQ replay. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const env=process.env, dir=env.WU21_ARTIFACT_DIR, phase=env.STABLE_PHASE;
const m=JSON.parse(fs.readFileSync(dir+'/sla-fixture.json'));
const logins=JSON.parse(fs.readFileSync(env.SLA_LOGIN_FILE));
const output={phase,actors:{},status:'FAIL'};
const b=await chromium.launch({headless:true});
try{
 output.chromium=b.version();
 for(const actor of ['officer','accountant','applicant']){
  const n=JSON.parse(fs.readFileSync(dir+'/stable-'+phase+'-'+actor+'.json'));
  const ctx=await b.newContext({viewport:{width:1280,height:900},locale:'fa-IR'});
  try{
   const p=await ctx.newPage(), u=logins[actor];
   const witness={actor,stage:'login',assets:[],pageErrors:[]};
   output.actors[actor]=witness;
   p.on('pageerror',e=>witness.pageErrors.push(String(e.message).slice(0,300)));
   p.on('response',r=>{if(/gpp-inbox2\.(css|js)(\?|$)/.test(r.url()))witness.assets.push({path:new URL(r.url()).pathname,status:r.status()});});
   const capture=async()=>p.evaluate(()=>({url:location.pathname,loginForm:!!document.querySelector('#loginform'),loggedIn:document.body.classList.contains('logged-in'),roots:[...document.querySelectorAll('[data-ciq2-root]')].map(r=>({state:r.dataset.ciq2State,ids:[...r.querySelectorAll('[data-ciq2-entry]')].map(e=>Number(e.dataset.ciq2Entry)),status:r.querySelector('[data-ciq2-status]')?.textContent.trim()})),script:!!window.GPPInbox2,visibility:document.visibilityState}));
   await p.goto(env.WU21_BASE_URL+'/wp-login.php?redirect_to='+encodeURIComponent(m.url));
   await p.locator('#user_login').fill(u.username);
   await p.locator('#user_pass').fill(u.password);
   await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}),p.locator('#wp-submit').click()]);
   witness.afterLogin=await capture();
   witness.stage='open_queue';
   const response=await p.goto(m.url,{waitUntil:'networkidle'});
   witness.http=response.status();witness.beforeWait=await capture();
   assert.equal(response.status(),200);
   assert.match(response.headers()['cache-control']||'',/\bno-store\b/i);
   assert.match(response.headers()['cache-control']||'',/\bprivate\b/i);
   try{await p.waitForFunction(()=>document.querySelector('[data-ciq2-root]')?.dataset.ciq2State==='current'&&!!window.GPPInbox2,{}, {timeout:12000});}catch(e){witness.afterWait=await capture();witness.failure='CURRENT_QUEUE_NOT_OBSERVED';throw e;}
   witness.stage='queue_verified';
   const read=async()=>p.locator('[data-ciq2-root]').evaluate(r=>({ids:[...r.querySelectorAll('[data-ciq2-entry]')].map(e=>Number(e.dataset.ciq2Entry)),visible:[...r.querySelectorAll('[data-ciq2-entry]:not([hidden])')].map(e=>Number(e.dataset.ciq2Entry)),cells:[...r.querySelectorAll('[data-ciq2-entry]')].map(e=>({id:Number(e.dataset.ciq2Entry),name:e.querySelector('[data-ciq2-name]').textContent.trim(),nid:e.querySelector('[data-ciq2-national-id]').textContent.trim(),school:e.querySelector('[data-ciq2-school-grade]').textContent.trim()}))}));
   function verify(q){
    assert.deepEqual(q.ids,n.ids);assert.deepEqual(q.visible,n.ids.slice(0,20));
    for(const row of q.cells){const c=n.cells[row.id];assert.deepEqual([row.name,row.nid,row.school],[c.name,c.nid,c.school]);}
   }
   const q=await read();verify(q);
   const [r]=await Promise.all([p.waitForResponse(x=>x.url().includes('/wp-admin/admin-ajax.php')&&x.request().method()==='POST'&&new URLSearchParams(x.request().postData()||'').get('action')==='gpp_inbox2_read'),p.locator('[data-ciq2-refresh]').click()]);
   assert.equal(r.status(),200);assert.match(r.headers()['cache-control']||'',/\bno-store\b/i);
   const data=await r.json();assert.equal(data.success,true);assert.equal(data.data.count,n.ids.length);
   await p.waitForFunction(()=>document.querySelector('[data-ciq2-root]')?.dataset.ciq2State==='current');
   const after=await read();verify(after);
   Object.assign(witness,{stage:'PASS',ids:q.ids,visible:q.visible,refreshStatus:r.status(),after:after.ids,cacheControl:response.headers()['cache-control']});
  }finally{await ctx.close();}
 }
 const anon=await b.newPage();await anon.goto(m.url);assert.equal(await anon.locator('[data-ciq2-entry]').count(),0);
 assert.equal(await anon.locator('[data-ciq2-root]').count(),0);output.anonymous='NO_PRIVATE_CARDS';
 output.status='PASS';
}finally{await b.close();fs.writeFileSync(dir+'/stable-'+phase+'-browser.json',JSON.stringify(output,null,2));}
