// WU21 observation extension. No automatic/manual sizing repair is implemented.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, repoRoot, login, waitForGrid } from './inbox-visual-design-v2-browser-lib.mjs';

if (!artifactDir || !wpCli || !wpPath || !repoRoot) throw new Error('Pinned WU21 lab required');
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir,'fixture-manifest.json')));
const form = fixture.forms.find(f=>f.key==='alpha');
const ids=['id','date_created',String(form.school_field_id),String(form.national_id_field_id),String(form.first_name_field_id)];
const mu=path.join(wpPath,'wp-content/mu-plugins/inbox-width-candidate-d-mu.php');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result={schema_version:1,repo_base:'24c29c9dfeda5c38d8ff021526da65ddaa301a6b',repo_head:process.env.GPP_WU21_REPOSITORY_SHA,
  policy:{saved_manual_overflow:'NORMALIZE_IF_FIT_CAPABLE',live_shrink:'DEFER_UNTIL_NEXT_INITIAL_RESTORE'},
  mode:'NATIVE_OBSERVATION_ONLY',phase2_executed:false,production_repair_executed:false,repair_count:0,
  runtime:JSON.parse(fs.readFileSync(path.join(artifactDir,'runtime.json'))),scenarios:[],remaining_not_proven:[],page_errors:[]};
assert.equal(hash(process.env.WU21_FLOW_ZIP),'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404');
const bundle=path.join(wpPath,'wp-content/plugins/gravityflow/assets/js/dist/common-inbox.4181e438e8373cc50e14.js');
const originalBundle=hash(bundle);
function wp(code) {
  const r=spawnSync('php',[wpCli,`--path=${wpPath}`,'eval',code],{encoding:'utf8'});
  if(r.status!==0)throw new Error(r.stderr+'\n'+r.stdout);return r.stdout.trim();
}
function state(widths,extra={}) {return ids.map((colId,i)=>({colId,width:widths[i],hide:false,pinned:null,sort:null,sortIndex:null,
  aggFunc:null,rowGroup:false,rowGroupIndex:null,pivot:false,pivotIndex:null,flex:null,...extra[colId]}));}
const stale=state([165,528,414,355,410]);
const fitting=state([80,200,200,200,200],{[ids[2]]:{sort:'asc',sortIndex:0}});
let browser,pages=[],unrelatedForm=0,plugin='';
async function snapshot(page) {
  return page.evaluate(()=>{
    const report=window.__gppWidthQualification;
    const root=document.querySelector('[data-js="gflow-inbox"]');
    const viewport=root?.querySelector('.ag-center-cols-viewport');
    return {report:report?JSON.parse(JSON.stringify(report)):null,public_state:window.__gppWidthControl?.inspect()||null,
      profile:!!document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]'),
      center:viewport?{clientWidth:viewport.clientWidth,scrollWidth:viewport.scrollWidth}:null,
      headers:[...root.querySelectorAll('.ag-header-cell[col-id]')].map(n=>({id:n.getAttribute('col-id'),width:n.getBoundingClientRect().width})),
      rows:root.querySelectorAll('.ag-center-cols-container .ag-row').length};
  });
}
function eligibility(s) {
  const events=s.report?.events||[];
  const last=[...events].reverse().find(e=>e.after_frame?.displayed?.length||e.displayed?.length);
  const geometry=last?.after_frame||last;
  if(!geometry||!s.center?.clientWidth)return {admitted:false,reason:'no usable observation'};
  const center=geometry.displayed.filter(c=>!c.pinned);
  return {fixture_only:true,center_displayed_width:center.reduce((a,c)=>a+c.width,0),usable_center:s.center.clientWidth,
    center_effective_min_sum:center.reduce((a,c)=>a+c.minWidth,0),
    pinned:geometry.displayed.filter(c=>c.pinned),flex:geometry.displayed.filter(c=>c.flex),
    fit_capable_overflow:center.reduce((a,c)=>a+c.width,0)>s.center.clientWidth+1&&center.reduce((a,c)=>a+c.minWidth,0)<=s.center.clientWidth,
    limit:'Fixture classification only, not a runtime restore admission or pinned/flex sizing proof'};
}
async function capture(page,context,name,saved,{width=1440,empty=false,raw=null,nativeOnly=false}={}) {
  await page.setViewportSize({width,height:900});
  const u=new URL(context.url);u.searchParams.set('width_lab_discriminator','1');
  if(saved||raw!==null)u.searchParams.set('width_lab_seeded','1');
  if(empty)u.searchParams.set('width_lab_empty','1');
  await page.goto(u.toString(),{waitUntil:'networkidle'});await waitForGrid(page);
  const id=await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  // Fixture seeding/measurement only. Neither attached observer nor product reads Storage for repair.
  await page.evaluate(({id,saved,raw})=>{
    localStorage.setItem('method-local-sentinel','keep');sessionStorage.setItem('method-session-sentinel','keep');
    if(raw!==null)localStorage.setItem(id,raw);else if(saved)localStorage.setItem(id,JSON.stringify(saved));else localStorage.removeItem(id);
    sessionStorage.removeItem(id);
  },{id,saved,raw});
  const errorStart=result.page_errors.length;
  await page.reload({waitUntil:'networkidle'});await waitForGrid(page);await page.waitForTimeout(450);
  const s=await snapshot(page);
  const entry={route:context.kind,scenario:name,viewport:{width,height:900},grid_id:id,fixture_state:saved,fixture_raw:raw,...s};
  entry.eligibility=eligibility(s);entry.errors=result.page_errors.slice(errorStart);
  result.scenarios.push(entry);
  assert.equal(entry.report?.repair_count||0,0);
  if(!nativeOnly) {
    assert.equal(entry.profile,true);assert.equal(entry.report.function_was_attached_before_mount,true);
    assert.ok(entry.report.attachment.every(a=>!a.failure&&!a.mounted_before_attachment));
    assert.ok(entry.report.attachment.flatMap(a=>a.callbacks).every(c=>!c.observation_error));
    assert.ok(!entry.report.events.some(e=>e.callback==='onGridReady'),'Host consumer-ready overwrite changed');
  }else assert.equal(entry.profile,false,'Negative control unexpectedly has active Inbox profile');
  if(empty)assert.equal(entry.rows,0);
  if(raw===null&&saved&&!saved.some(c=>c.flex>0)&&ids.every(id=>saved.some(c=>c.colId===id))) {
    const restored=entry.report.events.find(e=>e.source==='api');assert.ok(restored,'Native matching restore missing');
    assert.deepEqual(restored.state,saved);
  }
  return entry;
}
async function cases(page,context) {
  await capture(page,context,'clean',null);
  const old=await capture(page,context,'known_stale_165_528_414_355_410',stale);
  assert.equal(old.eligibility.fit_capable_overflow,true);
  const fit=await capture(page,context,'fitting_nondefault_saved',fitting);
  assert.equal(fit.eligibility.fit_capable_overflow,false);
  const empty=await capture(page,context,'empty_stale',stale,{empty:true});
  assert.ok(!empty.report.events.some(e=>e.callback==='onFirstDataRendered'));
  await capture(page,context,'pinned_stale',state([165,528,414,355,410],{[ids[3]]:{pinned:'left'}}));
  await capture(page,context,'flex_stale',state([165,528,414,355,410],{[ids[4]]:{flex:1}}));
  await capture(page,context,'wide_1920_saved',stale,{width:1920});
  for(const width of [390,320]) {
    const narrow=await capture(page,context,`native_minimum_overflow_${width}`,null,{width});
    assert.ok(narrow.eligibility.center_effective_min_sum>narrow.center.clientWidth);
    assert.ok(narrow.center.scrollWidth>narrow.center.clientWidth);
  }
  const mismatch=await capture(page,context,'mismatched_ids',state([165,528,414,355,410]).slice(1));
  assert.equal(mismatch.report.events.filter(e=>e.source==='api').length,0,'Mismatched IDs applied as matching state');
  const malformed=await capture(page,context,'malformed_json',null,{raw:'{invalid-json'});
  assert.ok(malformed.errors.length>0,'Native parse failure not observed');
  // Remount after shrink. Only observations and genuine page reload; no width mutation.
  const mounted=await capture(page,context,'shrink_then_genuine_remount',fitting);
  const before=mounted.public_state.state;
  await page.setViewportSize({width:640,height:900});await page.waitForTimeout(450);
  mounted.after_shrink=await snapshot(page);
  assert.deepEqual(mounted.after_shrink.public_state.state,before,'Nonflex width state changed merely on shrink');
  assert.equal(mounted.after_shrink.report.repair_count,0);
  mounted.after_shrink_eligibility=eligibility(mounted.after_shrink);
  await page.reload({waitUntil:'networkidle'});await waitForGrid(page);await page.waitForTimeout(450);
  mounted.after_remount=await snapshot(page);mounted.after_remount_eligibility=eligibility(mounted.after_remount);
  assert.ok(mounted.after_remount.report.events.some(e=>e.source==='api'));
  assert.equal(mounted.after_remount_eligibility.fit_capable_overflow,true);
  // Existing native persistence/reload, exercised with a real manual drag rather than a repair.
  const persisted=await capture(page,context,'native_manual_persistence_reload',fitting);
  const h=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"] .ag-header-cell-resize').first();
  const point=await h.evaluate(n=>{const b=n.getBoundingClientRect();for(const f of [.1,.25,.4,.6,.8,.9]){const x=b.x+b.width*f,y=b.y+b.height/2;const hit=document.elementFromPoint(x,y);if(hit&&(hit===n||n.contains(hit)))return{x,y};}return null;});
  assert.ok(point);await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+45,point.y,{steps:6});await page.mouse.up();
  await page.waitForTimeout(500);persisted.after_drag=await snapshot(page);
  assert.notDeepEqual(persisted.after_drag.public_state.state,persisted.public_state.state);
  persisted.native_saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(id)),persisted.grid_id);
  assert.deepEqual(persisted.native_saved,persisted.after_drag.public_state.state);
  await page.reload({waitUntil:'networkidle'});await waitForGrid(page);await page.waitForTimeout(450);persisted.after_reload=await snapshot(page);
  assert.deepEqual(persisted.after_reload.public_state.state,persisted.native_saved);
  persisted.limit='Native manual mutation convergence proven; sizing-repair convergence NOT_PROVEN';
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('method-local-sentinel'),sessionStorage.getItem('method-session-sentinel')]),['keep','keep']);
}
try {
  const attrs={selectedFormsJson:JSON.stringify([{value:form.form_id}])};
  pages=JSON.parse(wp(`$items=array();foreach(array('shortcode'=>'[gravityflow page="inbox" form="${form.form_id}"]','block'=>'<!-- wp:gravityflow/inbox ${JSON.stringify(attrs)} /-->') as $kind=>$content){$id=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Upstream method '.$kind,'post_content'=>wp_slash($content)),true);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$items[]=array('id'=>(int)$id,'kind'=>$kind,'url'=>get_permalink($id));}update_option('gpp_width_candidate_d_lab',array('pages'=>wp_list_pluck($items,'id'),'observer_path'=>${JSON.stringify(path.join(repoRoot,'tests/repro-evidence-lab/inbox-width-candidate-d-observer.js'))}),false);echo wp_json_encode($items);`));
  fs.copyFileSync(path.join(repoRoot,'tests/repro-evidence-lab/inbox-width-candidate-d-mu.php'),mu);
  process.env.IVD2_ADMIN_USER=fixture.operator.login;process.env.IVD2_ADMIN_PASSWORD='wu21-bootstrap-pass-2026';
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>result.page_errors.push(String(e)));await login(page);
  for(const context of pages)await cases(page,context);
  plugin=wp(`foreach(get_plugins() as $p=>$d){if($d['Name']==='Gravity Presentation Profiles'){echo $p;break;}}`);assert.ok(plugin);
  wp(`deactivate_plugins(${JSON.stringify(plugin)});`);
  await capture(page,pages[0],'inactive_profile',null,{nativeOnly:true});
  wp(`$r=activate_plugin(${JSON.stringify(plugin)});if(is_wp_error($r))throw new RuntimeException($r->get_error_message());`);
  const unrelated=JSON.parse(wp(`$f=GFAPI::get_form(${form.form_id});unset($f['id']);$f['title']='Unrelated unconfigured synthetic form';$id=GFAPI::add_form($f);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$p=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Unrelated Inbox','post_content'=>'[gravityflow page="inbox" form="'.$id.'"]'),true);echo wp_json_encode(array('form_id'=>$id,'id'=>$p,'url'=>get_permalink($p),'kind'=>'shortcode'));`));
  unrelatedForm=unrelated.form_id;pages.push(unrelated);
  await capture(page,unrelated,'unrelated_inbox',null,{nativeOnly:true});
  assert.equal(hash(bundle),originalBundle,'Vendor bundle was modified');
  result.vendor_bundle_sha256=originalBundle;
  result.remaining_not_proven=['supported scoped host repair extension','new vendor-supported completion contract','repair geometry readiness for pinned/flex','native sizing-repair persistence convergence','repair outcomes for all fixtures'];
  result.disposition='UPSTREAM_METHOD_SELECTION_NOT_PROVEN';result.execution_status='PASS_OBSERVATIONS_ONLY';
} catch(e) {result.execution_status='ERROR';result.failure=String(e.stack||e);throw e;}
finally {
  if(browser)await browser.close();if(fs.existsSync(mu))fs.unlinkSync(mu);
  if(plugin)wp(`if(!is_plugin_active(${JSON.stringify(plugin)}))activate_plugin(${JSON.stringify(plugin)});`);
  if(pages.length)wp(`foreach(${JSON.stringify(pages.map(p=>p.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_d_lab');`);
  if(unrelatedForm)wp(`GFAPI::delete_form(${unrelatedForm});`);
  fs.writeFileSync(path.join(artifactDir,'inbox-upstream-method-runtime.json'),JSON.stringify(result,null,2)+'\n');
}
console.log('UPSTREAM_METHOD_OBSERVATION_PASS_NO_REPAIR');
