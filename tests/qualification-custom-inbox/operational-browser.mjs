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
// Same-class mutation qualification: a synthetic viewer reassignment adds
// a real Gravity Flow Step. Its residue is explicitly tracked within scale.
function nativeStepIds(){
  return JSON.parse(wp("wp_set_current_user("+f.admin+");$steps=(new Gravity_Flow_API("+f.form_id+"))->get_steps();if(!is_array($steps))throw new RuntimeException('steps_unavailable');$ids=[];foreach($steps as $s){$ids[]=(int)$s->get_id();}sort($ids,SORT_NUMERIC);echo wp_json_encode($ids);"));
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
  const stepsBefore=nativeStepIds();
  const step=Number(wp("wp_set_current_user("+f.admin+");$a=new Gravity_Flow_API("+f.form_id+");$s=$a->add_step(['step_name'=>'CIQ2 synthetic reassignment','step_type'=>'approval','type'=>'select','assignees'=>['user_id|"+f.viewer+"'],'assignee_policy'=>'all']);if(!$s||is_wp_error($s))throw new RuntimeException('step_failed');$e=GFAPI::get_entry("+reassigned+");$ok=$a->send_to_step($e,(int)$s);if(false===$ok||is_wp_error($ok))throw new RuntimeException('reassign_failed');echo $s;"));
  assert.ok(step>0);
  const stepsAfter=nativeStepIds();
  assert.deepEqual(stepsAfter,[...stepsBefore,step].sort((a,b)=>a-b),
    'Unexpected workflow-step mutation during synthetic viewer reassignment');
  report.step_inventory={
    before:stepsBefore,after:stepsAfter,added_viewer_step_id:step,
    teardown:'DISCARD_AFTER_SCALE_SCENARIO_ONLY'
  };
  save();
  pass('viewer_step_residual_explicitly_inventoried_and_isolated_in_scale_chain');
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

  // S4: Deny Native Entry Detail for exactly ONE task while it remains in the
  // authenticated Native Inbox list. The card/list must retain the same 500
  // native-selected IDs; the genuine Detail page must still refuse entry/actions.
  const s4Before=await all(page);
  assert.equal(s4Before.length,500);
  const s4Denied=s4Before[0],s4Allowed=s4Before[1];
  wp("update_option('cellq_s4_denied_id',"+s4Denied+",false);update_option('cellq_mode','deny_one_entry',false);");
  try {
    await page.locator('[data-ciq2-refresh]').click();
    await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]') &&
      document.querySelectorAll('[data-ciq2-entry]').length===500,null,{timeout:90000});
    assert.deepEqual(await all(page),s4Before,'S4 Detail denial modified Inbox 2 task membership');
    const nativeS4=JSON.parse(wp("wp_set_current_user("+f.officer+");$scope=['form_id'=>"+f.form_id+"];"+
      "$rows=cellq_model()->get_inbox_tasks(cellq_args($scope,0,2001));"+
      "echo wp_json_encode(array_map('intval',array_column($rows,'id')));"));
    assert.deepEqual([...nativeS4].sort((a,b)=>a-b),[...s4Before].sort((a,b)=>a-b),
      'S4 Inbox 2 membership diverges from authentic Native Task Model');
    // Independently inspect the actual Native Inbox 1 page's initial rowData,
    // rather than relying only on our adapter's PHP Task Model comparison.
    const nativeUrl=wp("echo esc_url_raw(get_option('cellq_fixture')['native_url']);");
    const nativePage=await ctx.newPage();
    try {
      await nativePage.goto(nativeUrl,{waitUntil:'networkidle'});
      await nativePage.waitForFunction(()=>{
        const grid=document.querySelector('[data-js="gflow-inbox"]');
        const rows=grid&&window.gflow_config?.grids?.[grid.dataset.gridId]?.grid_options?.rowData;
        return Array.isArray(rows)&&rows.length===500;
      },null,{timeout:90000});
      const nativeUi=await nativePage.evaluate(targetIds=>{
        const grid=document.querySelector('[data-js="gflow-inbox"]');
        const rows=window.gflow_config.grids[grid.dataset.gridId].grid_options.rowData;
        const text=value=>new DOMParser().parseFromString(
          '<span id="s4">'+String(value)+'</span>','text/html'
        ).getElementById('s4').textContent;
        return {
          ids:rows.map(r=>Number(r.id)),
          cells:rows.filter(r=>targetIds.includes(Number(r.id))).map(r=>({
            id:Number(r.id),name:text(r['1']),nid:text(r['4']),schoolGrade:text(r['6'])
          })),
          hiddenFieldAbsent:!JSON.stringify(rows).includes('CQ_SECRET_DO_NOT_EXPOSE_'),
          rawNationalIdAbsent:!JSON.stringify(rows).includes('CQ_RAW_NID_')
        };
      },[s4Denied,s4Allowed]);
      assert.deepEqual([...nativeUi.ids].sort((a,b)=>a-b),[...s4Before].sort((a,b)=>a-b),
        'S4 actual Native Inbox page membership differs');
      assert.equal(nativeUi.hiddenFieldAbsent,true,'Native list unexpectedly contains hidden field fixture');
      assert.equal(nativeUi.rawNationalIdAbsent,true,'Native final mask did not protect the real list');
      for(const nativeCell of nativeUi.cells){
        const card=page.locator('[data-ciq2-entry="'+nativeCell.id+'"]');
        assert.equal(await card.locator('[data-ciq2-name]').innerText(),nativeCell.name);
        assert.equal(await card.locator('[data-ciq2-national-id]').innerText(),nativeCell.nid);
        assert.equal(await card.locator('[data-ciq2-school-grade]').innerText(),nativeCell.schoolGrade);
        assert.equal(nativeCell.nid,'CQ_FINAL_MASKED');
      }
      assert.equal(nativeUi.cells.length,2,'S4 Native list comparison missed a control task');
    } finally { await nativePage.close(); }

    const deniedHref=await page.locator('[data-ciq2-entry="'+s4Denied+'"] [data-ciq2-detail]').getAttribute('href');
    const allowedHref=await page.locator('[data-ciq2-entry="'+s4Allowed+'"] [data-ciq2-detail]').getAttribute('href');
    assert.ok(deniedHref&&allowedHref);
    const detailDenied=await ctx.newPage();
    const detailAllowed=await ctx.newPage();
    try {
      const deniedResponse=await detailDenied.goto(deniedHref,{waitUntil:'domcontentloaded'});
      assert.equal(deniedResponse.status(),200);
      const deniedText=await detailDenied.locator('.gravityflow_workflow_detail').innerText();
      assert.match(deniedText,/You don't have permission to view this entry\./);
      assert.equal(await detailDenied.locator('.gravityflow_workflow_detail form').count(),0,
        'Native Detail rendered an actionable form after permission denial');
      const allowedResponse=await detailAllowed.goto(allowedHref,{waitUntil:'domcontentloaded'});
      assert.equal(allowedResponse.status(),200);
      const allowedText=await detailAllowed.locator('.gravityflow_workflow_detail').innerText();
      assert.doesNotMatch(allowedText,/You don't have permission to view this entry\./);
    } finally {
      await detailDenied.close();await detailAllowed.close();
    }
    pass('s4_native_list_and_inbox2_cards_preserved_while_one_native_detail_is_denied');
  } finally {
    wp("update_option('cellq_mode','baseline',false);delete_option('cellq_s4_denied_id');");
  }
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]') &&
    document.querySelectorAll('[data-ciq2-entry]').length===500,null,{timeout:90000});

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
