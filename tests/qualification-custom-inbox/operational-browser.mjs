import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env,out=env.WU21_ARTIFACT_DIR,base=env.WU21_BASE_URL;
const f=JSON.parse(fs.readFileSync(path.join(out,'ciq2-operational-fixture.json'),'utf8'));
const report={head:f.head,status:'RUNNING',checks:[]};
const pass=name=>report.checks.push(name);
const save=()=>fs.writeFileSync(path.join(out,'ciq2-operational-browser.json'),JSON.stringify(report,null,2));
function wp(source){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',source],{env,encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();
}
function cookies(uid){
  const code="$u=get_user_by('id',"+uid+");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(code)).map(x=>({...x,url:base}));
}
const all=async p=>p.locator('[data-ciq2-entry]').evaluateAll(xs=>xs.map(x=>Number(x.dataset.ciq2Entry)));
const visible=async p=>p.locator('[data-ciq2-entry]').evaluateAll(xs=>xs.filter(x=>!x.hidden).map(x=>Number(x.dataset.ciq2Entry)));
async function traversed(p){
  const text=await p.locator('[data-ciq2-page]').innerText();
  const pages=Number(text.match(/از\s+(\d+)/)?.[1]);
  assert.ok(Number.isInteger(pages)&&pages>=1);
  const ids=[];
  for(let i=0;i<pages;i++){
    ids.push(...await visible(p));
    if(i<pages-1)await p.locator('[data-ciq2-next]').click();
  }
  return ids;
}
const browser=await chromium.launch({headless:true});
try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addCookies(cookies(f.officer));const page=await ctx.newPage();
  let nativeChanges=0;
  page.on('request',req=>{if(req.url().includes('/inbox/changes'))nativeChanges++;});
  let response=await page.goto(f.url,{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  assert.equal((await all(page)).length,501);
  assert.equal((await visible(page)).length,20);
  const ids=await traversed(page);
  assert.equal(ids.length,501);
  assert.equal(new Set(ids).size,501);
  assert.deepEqual([...ids].sort((a,b)=>a-b),[...f.ids].sort((a,b)=>a-b));
  pass('501_exact_ids_through_all_operator_pages');
  const input=page.locator('#ciq2-search');
  await input.fill('OP_INDEX_500_EXTRA');
  assert.deepEqual(await visible(page),[f.synthetic.at(-1)]);
  pass('search_across_all_pages');
  await input.fill('');
  const created=Number(wp("wp_set_current_user("+f.admin+");$id=GFAPI::add_entry(['form_id'=>"+f.form_id+",'created_by'=>"+f.admin+",'1'=>'OP_LIVE_INSERT','2'=>'Synthetic','4'=>'SYNTH-LIVE','5'=>'grade_code_10','6'=>'school_code_A']);if(is_wp_error($id))throw new RuntimeException('create_failed');$a=new Gravity_Flow_API("+f.form_id+");$a->process_workflow((int)$id);echo $id;"));
  assert.ok(created>0);
  await page.waitForFunction(id=>!!document.querySelector('[data-ciq2-entry="'+id+'"]'),created,{timeout:90000});
  assert.equal((await all(page)).length,502);
  pass('native_insert_found_by_automatic_poll');
  const completed=f.synthetic[0];
  wp("wp_set_current_user("+f.admin+");$e=GFAPI::get_entry("+completed+");$a=new Gravity_Flow_API("+f.form_id+");$a->send_to_step($e,"+f.next_step+");echo 'done';");
  await page.waitForFunction(id=>!document.querySelector('[data-ciq2-entry="'+id+'"]'),completed,{timeout:90000});
  assert.equal((await all(page)).length,501);
  pass('native_step_transition_removed_by_automatic_poll');
  // The current operator is on page one after search. Navigate to the last
  // page while 501 tasks exist, so a real reassignment makes it invalid.
  for(let i=1;i<26;i++)await page.locator('[data-ciq2-next]').click();
  assert.match(await page.locator('[data-ciq2-page]').innerText(),/۲۶|26/);
  const reassigned=f.synthetic[1];
  const step=Number(wp("wp_set_current_user("+f.admin+");$a=new Gravity_Flow_API("+f.form_id+");$s=$a->add_step(['step_name'=>'CIQ2 synthetic reassignment','step_type'=>'approval','type'=>'select','assignees'=>['user_id|"+f.viewer+"'],'assignee_policy'=>'all']);if(!$s||is_wp_error($s))throw new RuntimeException('step_failed');$e=GFAPI::get_entry("+reassigned+");$ok=$a->send_to_step($e,(int)$s);if(false===$ok||is_wp_error($ok))throw new RuntimeException('reassign_failed');echo $s;"));
  assert.ok(step>0);
  await page.waitForFunction(id=>!document.querySelector('[data-ciq2-entry="'+id+'"]'),reassigned,{timeout:90000});
  assert.equal((await all(page)).length,500);
  assert.match(await page.locator('[data-ciq2-page]').innerText(),/۲۵|25/);
  assert.equal((await visible(page)).length,20);
  assert.ok(await page.locator('[data-ciq2-next]').isDisabled());
  pass('real_reassignment_removes_task_and_clamps_invalid_page');
  await page.route('**/wp-admin/admin-ajax.php',route=>route.abort('failed'));
  await page.locator('[data-ciq2-refresh]').click();
  await page.locator('[data-ciq2-state="stale"]').waitFor({timeout:30000});
  assert.deepEqual(await all(page),[]);
  await page.unroute('**/wp-admin/admin-ajax.php');
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]')&&document.querySelectorAll('[data-ciq2-entry]').length===500,null,{timeout:90000});
  pass('network_failure_clears_rows_manual_retry_recovers');
  await ctx.clearCookies();
  await page.locator('[data-ciq2-refresh]').click();
  await page.locator('[data-ciq2-state="stale"]').waitFor({timeout:30000});
  assert.deepEqual(await all(page),[]);
  await ctx.addCookies(cookies(f.officer));
  // A new authenticated session needs a newly minted user/session-bound nonce.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]')&&document.querySelectorAll('[data-ciq2-entry]').length===500,null,{timeout:90000});
  pass('expired_session_clears_rows_and_reauthentication_recovers');

  // A currently authorized host task must disappear when the authentic
  // Entry Detail permission hook revokes access, without a stale data leak.
  wp("update_option('cellq_mode','deny_entry',false);");
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]') &&
    document.querySelectorAll('[data-ciq2-entry]').length===0,null,{timeout:90000});
  assert.deepEqual(await all(page),[]);
  wp("update_option('cellq_mode','baseline',false);");
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]') &&
    document.querySelectorAll('[data-ciq2-entry]').length===500,null,{timeout:90000});
  pass('host_entry_permission_revocation_and_restore_requalify_every_poll');

  // Intercept two REAL host-backed reads, delay delivery of the first, create
  // a new native Flow task, and deliver the newer read before the older one.
  let releaseOld, capturedOld, readIndex=0;
  const holdOld=new Promise(resolve=>{releaseOld=resolve;});
  const oldReadReady=new Promise(resolve=>{capturedOld=resolve;});
  await page.route('**/wp-admin/admin-ajax.php',async route=>{
    if(readIndex++===0){
      try {
        const oldResponse=await route.fetch();
        capturedOld(oldResponse.ok());
        await holdOld;
        await route.fulfill({response:oldResponse});
      } catch(error) { capturedOld(false); }
    } else {
      await route.continue();
    }
  });
  await page.locator('[data-ciq2-refresh]').click();
  assert.equal(await oldReadReady,true,'Could not capture the authentic older authorized response');
  const lateCreated=Number(wp("wp_set_current_user("+f.admin+");$id=GFAPI::add_entry(['form_id'=>"+f.form_id+",'created_by'=>"+f.admin+",'1'=>'OP_ORDERED_NEWER','2'=>'Synthetic','4'=>'SYNTH-ORDER','5'=>'grade_code_10','6'=>'school_code_A']);if(is_wp_error($id))throw new RuntimeException('create_failed');$a=new Gravity_Flow_API("+f.form_id+");$a->process_workflow((int)$id);echo $id;"));
  assert.ok(lateCreated>0);
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(id=>document.querySelector('[data-ciq2-state="current"]') &&
    !!document.querySelector('[data-ciq2-entry="'+id+'"]'),lateCreated,{timeout:90000});
  releaseOld();
  await page.waitForTimeout(800);
  assert.ok((await all(page)).includes(lateCreated));
  assert.equal((await all(page)).length,501);
  await page.unroute('**/wp-admin/admin-ajax.php');
  pass('delayed_old_authorized_response_cannot_overwrite_newer_host_view');
  // A hung authorized read must not indefinitely suppress polling or claim current data.
  // This deliberately blocks network delivery after a real host response is available.
  let releaseHung, caughtHung, heldCount=0;
  const held=new Promise(resolve=>{releaseHung=resolve;});
  const capturedHung=new Promise(resolve=>{caughtHung=resolve;});
  await page.route('**/wp-admin/admin-ajax.php',async route=>{
    if(heldCount++===0){
      try {
        const real=await route.fetch();
        caughtHung(real.ok());
        await held;
        await route.fulfill({response:real});
      } catch (_) { caughtHung(false); }
    } else await route.continue();
  });
  await page.locator('[data-ciq2-refresh]').click();
  assert.equal(await capturedHung,true,'Hung-response probe failed to reach authentic authorized host');
  assert.match(await page.locator('[data-ciq2-status]').innerText(),/در حال بررسی مجدد فهرست/,
    'Pending synchronization must be visibly distinguished from a verified Inbox');
  try {
    await page.locator('[data-ciq2-state="stale"]').waitFor({timeout:35000});
    assert.deepEqual(await all(page),[],'Timed-out response retained sensitive task rows');
    pass('hung_response_transitions_to_stale_and_clears_private_rows');
  } finally {
    releaseHung();
    await page.unroute('**/wp-admin/admin-ajax.php');
  }
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]') &&
    document.querySelectorAll('[data-ciq2-entry]').length===501,null,{timeout:90000});
  pass('hung_response_manual_retry_recovers_authorized_membership');
  const viewer=await browser.newContext();await viewer.addCookies(cookies(f.viewer));
  const vp=await viewer.newPage();await vp.goto(f.url,{waitUntil:'domcontentloaded'});
  const viewerIds=await all(vp);
  assert.ok(viewerIds.every(id=>!f.ids.includes(id)||id===reassigned),'Viewer saw a task assigned only to officer');
  // A caller cannot widen server-owned form, user, assignee, or filter scope.
  const nativeViewerIds=JSON.parse(wp("wp_set_current_user("+f.viewer+");$scope=['form_id'=>"+f.form_id+"]; $rows=cellq_model()->get_inbox_tasks(cellq_args($scope,0,40));echo wp_json_encode(array_map('intval',array_column($rows,'id')));"));
  assert.deepEqual([...viewerIds].sort((a,b)=>a-b),[...nativeViewerIds].sort((a,b)=>a-b));
  const forged=await vp.evaluate(async ({officer,formId})=>{
    const root=document.querySelector('[data-ciq2-root]');
    const response=await fetch(root.dataset.ciq2Ajax,{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:new URLSearchParams({action:'ciq2_read',nonce:root.dataset.ciq2Nonce,
        user_id:String(officer),assignee:String(officer),filter_key:'workflow_user_id_'+officer,
        form_id:String(formId)})
    });
    const value=await response.json();
    const parsed=new DOMParser().parseFromString(value.data?.html||'','text/html');
    return {status:response.status,success:value.success,count:value.data?.count,
      ids:[...parsed.querySelectorAll('[data-ciq2-entry]')].map(x=>Number(x.dataset.ciq2Entry))};
  },{officer:f.officer,formId:f.form_id});
  assert.equal(forged.status,200);
  assert.equal(forged.success,true);
  assert.equal(forged.count,nativeViewerIds.length);
  assert.deepEqual([...forged.ids].sort((a,b)=>a-b),[...nativeViewerIds].sort((a,b)=>a-b));
  const invalidNonce=await vp.evaluate(async ()=>{
    const root=document.querySelector('[data-ciq2-root]');
    const response=await fetch(root.dataset.ciq2Ajax,{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
      body:new URLSearchParams({action:'ciq2_read',nonce:'invalid-caller-nonce'})
    });
    const value=await response.json();
    return {status:response.status,success:value.success,leak:JSON.stringify(value).includes('data-ciq2-entry')};
  });
  assert.equal(invalidNonce.status,403);
  assert.equal(invalidNonce.success,false);
  assert.equal(invalidNonce.leak,false);
  pass('forged_scope_rejected_by_actual_host_membership_and_invalid_nonce_is_403');
  assert.equal(nativeChanges,0);
  pass('viewer_isolation_and_no_native_changes_endpoint');
  await viewer.close();await ctx.close();
  report.status='PASS_OPERATIONAL_BROWSER';save();
  console.log('CIQ2_OPERATIONAL_BROWSER_PASS '+report.checks.length);
}catch(e){
  report.status='FAIL';report.error=String(e.stack||e);save();throw e;
}finally{await browser.close();}
