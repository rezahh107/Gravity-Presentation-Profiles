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
  const reassigned=f.synthetic[1];
  const step=Number(wp("wp_set_current_user("+f.admin+");$a=new Gravity_Flow_API("+f.form_id+");$s=$a->add_step(['step_name'=>'CIQ2 synthetic reassignment','step_type'=>'approval','type'=>'select','assignees'=>['user_id|"+f.viewer+"'],'assignee_policy'=>'all']);if(!$s||is_wp_error($s))throw new RuntimeException('step_failed');$e=GFAPI::get_entry("+reassigned+");$ok=$a->send_to_step($e,(int)$s);if(false===$ok||is_wp_error($ok))throw new RuntimeException('reassign_failed');echo $s;"));
  assert.ok(step>0);
  await page.waitForFunction(id=>!document.querySelector('[data-ciq2-entry="'+id+'"]'),reassigned,{timeout:90000});
  assert.equal((await all(page)).length,500);
  pass('real_reassignment_removed_from_officer');
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
  await page.locator('[data-ciq2-refresh]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ciq2-state="current"]')&&document.querySelectorAll('[data-ciq2-entry]').length===500,null,{timeout:90000});
  pass('expired_session_clears_rows_and_reauthentication_recovers');
  const viewer=await browser.newContext();await viewer.addCookies(cookies(f.viewer));
  const vp=await viewer.newPage();await vp.goto(f.url,{waitUntil:'domcontentloaded'});
  const viewerIds=await all(vp);
  assert.ok(viewerIds.every(id=>!f.ids.includes(id)||id===reassigned),'Viewer saw a task assigned only to officer');
  assert.equal(nativeChanges,0);
  pass('viewer_isolation_and_no_native_changes_endpoint');
  await viewer.close();await ctx.close();
  report.status='PASS_OPERATIONAL_BROWSER';save();
  console.log('CIQ2_OPERATIONAL_BROWSER_PASS '+report.checks.length);
}catch(e){
  report.status='FAIL';report.error=String(e.stack||e);save();throw e;
}finally{await browser.close();}
