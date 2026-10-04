// Existing WU21 lab: bounded Candidate C native-sizing mutation prototype only.
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
  mode:'MUTATION_PROTOTYPE_ONLY',mutation_prototype_executed:true,phase2_executed:false,production_repair_executed:false,repair_count:0,
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
let browser,pages=[],unrelatedForm=0,activation=null;
const visual=String.raw`$v=new \GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle(new \GravityPresentationProfiles\Core\Lifecycle\WordPressOptionStateStore(\GravityPresentationProfiles\Core\Lifecycle\VisualPackageLifecycle::OPTION_NAME));`;
async function snapshot(page) {
  return page.evaluate(()=>{
    const report=window.__gppWidthQualification;
    const root=document.querySelector('[data-js="gflow-inbox"]');
    const viewport=root?.querySelector('.ag-center-cols-viewport');
    return {report:report?JSON.parse(JSON.stringify(report)):null,guard:window.__gppCandidateC?JSON.parse(JSON.stringify(window.__gppCandidateC)):null,
      prior:window.__gppWidthPrior||null, controls:window.__gppWidthControl?.trace||null,
      public_state:window.__gppWidthControl?.inspect()||null,
      profile:!!document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]'),
      center:viewport?{clientWidth:viewport.clientWidth,scrollWidth:viewport.scrollWidth}:null,
      headers:[...root.querySelectorAll('.ag-header-cell[col-id]')].map(n=>({id:n.getAttribute('col-id'),width:n.getBoundingClientRect().width})),
      rows:root.querySelectorAll('.ag-center-cols-container .ag-row').length,
      rtl:{ag_ltr:!!root.querySelector('.ag-ltr'),ag_rtl:!!root.querySelector('.ag-rtl'),
        directions:Object.fromEntries(['.ag-root-wrapper','.ag-center-cols-viewport','.ag-header-viewport','.ag-body-horizontal-scroll-viewport'].map(sel=>[sel,getComputedStyle(root.querySelector(sel)).direction])),
        header_text:getComputedStyle(root.querySelector('.ag-header-cell-text')).direction,
        cell_text:root.querySelector('.ag-cell')?getComputedStyle(root.querySelector('.ag-cell')).direction:null,
        grids:root.querySelectorAll('.ag-root-wrapper').length,scrollbars:root.querySelectorAll('.ag-body-horizontal-scroll').length}};
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
async function capture(page,context,name,saved,{width=1440,empty=false,raw=null,nativeOnly=false,repair=0,before=false,live=false}={}) {
  await page.setViewportSize({width,height:900});
  const u=new URL(context.url);u.searchParams.set('width_lab_discriminator','1');u.searchParams.set('width_lab_compose','1');
  if(before)u.searchParams.set('width_lab_before_guard','1');if(live)u.searchParams.set('width_lab_live','1');
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
  assert.equal(entry.guard?.repair_count||0,repair,`Unexpected Candidate C repairs: ${name}`);
  if(nativeOnly&&name==='inactive_profile')assert.equal(entry.guard.attachment.length,0);
  if(!nativeOnly) {
    assert.equal(entry.profile,true);assert.equal(entry.report.function_was_attached_before_mount,true);
    assert.ok(entry.report.attachment.every(a=>!a.failure&&!a.mounted_before_attachment));
    assert.ok(entry.report.attachment.flatMap(a=>a.callbacks).every(c=>!c.observation_error));
    assert.equal(entry.guard.attachment.length,1);assert.equal(entry.guard.evaluations.length,1,'Guard evaluated more/less than once');
    assert.ok(!entry.guard.evaluations.some(e=>e.error));
    assert.ok(entry.prior.some(e=>e.name==='onGridSizeChanged'&&e.native_this_api),'Real prior callback composition missing');
    assert.ok(entry.report.events.filter(e=>e.callback==='onGridSizeChanged').every(e=>e.previous_return==='prior-return'));
    assert.ok(entry.rtl.ag_ltr&&!entry.rtl.ag_rtl);assert.equal(entry.rtl.grids,1);assert.equal(entry.rtl.scrollbars,1);
    assert.ok(Object.values(entry.rtl.directions).every(d=>d==='ltr'));assert.equal(entry.rtl.header_text,'rtl');
    if(entry.rtl.cell_text)assert.equal(entry.rtl.cell_text,'rtl');
  }else if(name==='inactive_profile')assert.equal(entry.profile,false,'Inactive profile still rendered');
  else {assert.equal(entry.guard.attachment.length,0,'Unrelated shape admitted');entry.limit='Lab scripts intentionally loaded on unrelated Inbox; active wrapper alone is insufficient and five-column shape rejects attachment.';}
  if(empty)assert.equal(entry.rows,0);
  if(raw===null&&saved&&!saved.some(c=>c.flex>0)&&ids.every(id=>saved.some(c=>c.colId===id))) {
    const restored=entry.report.events.find(e=>e.source==='api');assert.ok(restored,'Native matching restore missing');
    // Callback snapshots can include later synchronous native normalization; initial restore
    // proof comes from the pre-guard public state, not the source label.
    if(!before)assert.deepEqual(entry.guard.evaluations[0].state_before,saved);
  }
  return entry;
}
function nonWidth(state) {return state.map(({width,...rest})=>rest);}
function completed(s,count) {assert.equal(s.guard.evaluations.length,1);assert.equal(s.guard.repair_count,count);}
async function after(page) {await page.waitForTimeout(500);return snapshot(page);}
async function scrollProof(page) {
  return page.evaluate(async()=>{
    const root=document.querySelector('[data-js="gflow-inbox"]'),v=root.querySelector('.ag-body-horizontal-scroll-viewport');
    const samples=[];
    for(const fraction of [0,1,.5]){v.scrollLeft=(v.scrollWidth-v.clientWidth)*fraction;await new Promise(r=>setTimeout(r,100));
      const cells=[...root.querySelectorAll('.ag-center-cols-container .ag-row')].slice(0,1).flatMap(r=>[...r.querySelectorAll('.ag-cell[col-id]')]);
      samples.push({left:v.scrollLeft,range:v.scrollWidth-v.clientWidth,alignment:cells.map(c=>{const h=root.querySelector(`.ag-header-cell[col-id="${c.getAttribute('col-id')}"]`);return h?Math.abs(h.getBoundingClientRect().x-c.getBoundingClientRect().x):null;})});}
    return samples;
  });
}
async function cases(page,context) {
  const clean=await capture(page,context,'clean',null);assert.equal(clean.guard.evaluations[0].decision,'UNCHANGED_FITS');
  const old=await capture(page,context,'known_stale_165_528_414_355_410',stale,{repair:1});
  assert.ok(old.center.scrollWidth-old.center.clientWidth<=1);assert.deepEqual(nonWidth(old.public_state.state),nonWidth(stale));
  assert.ok(old.report.resize_events.some(e=>e.source==='sizeColumnsToFit'));
  old.scroll_after_repair=await scrollProof(page);assert.ok(old.scroll_after_repair.every(s=>s.alignment.every(a=>a===null||a<=1)));
  assert.deepEqual(old.headers.map(c=>c.id),ids);
  old.native_saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(id)),old.grid_id);
  assert.deepEqual(old.native_saved,old.public_state.state,'Native persistence did not save correction');
  await page.reload({waitUntil:'networkidle'});await waitForGrid(page);old.after_reload=await after(page);
  completed(old.after_reload,0);assert.deepEqual(old.after_reload.public_state.state,old.native_saved);
  const fit=await capture(page,context,'fitting_nondefault_saved',fitting);assert.deepEqual(fit.public_state.state,fitting);
  const empty=await capture(page,context,'empty_stale',stale,{empty:true,repair:1});
  assert.ok(!empty.report.events.some(e=>e.callback==='onFirstDataRendered'));assert.ok(empty.center.scrollWidth-empty.center.clientWidth<=1);
  const pin=await capture(page,context,'pinned_stale',state([165,528,414,355,410],{[ids[3]]:{pinned:'left'}}));assert.equal(pin.guard.evaluations[0].reason,'pinned');
  assert.deepEqual(pin.public_state.state,pin.fixture_state);
  const flex=await capture(page,context,'flex_stale',state([165,528,414,355,410],{[ids[4]]:{flex:1}}));assert.equal(flex.guard.evaluations[0].reason,'flex_or_unknown');
  assert.equal(flex.public_state.state.find(c=>c.colId===ids[4]).flex,1);
  const wide=await capture(page,context,'wide_1920_saved',stale,{width:1920,repair:1});assert.ok(wide.center.scrollWidth-wide.center.clientWidth<=1);
  assert.equal(wide.public_state.state.reduce((a,c)=>a+c.width,0),wide.center.clientWidth);
  for(const width of [390,320]) {
    const narrow=await capture(page,context,`native_minimum_overflow_${width}`,null,{width});
    assert.equal(narrow.guard.evaluations[0].decision,'UNCHANGED_MINIMUM_OVERFLOW');assert.ok(narrow.center.scrollWidth>narrow.center.clientWidth);
    narrow.scroll=await scrollProof(page);assert.ok(narrow.scroll.some(s=>s.left>0));assert.ok(narrow.scroll.every(s=>s.alignment.every(a=>a===null||a<=1)));
  }
  const mismatch=await capture(page,context,'mismatched_ids',stale.slice(1));assert.equal(mismatch.guard.evaluations[0].decision,'UNCHANGED_FITS');
  const malformed=await capture(page,context,'malformed_json',null,{raw:'{invalid-json'});assert.ok(malformed.errors.length>0);
  const mounted=await capture(page,context,'shrink_grow_remount',fitting);
  await page.setViewportSize({width:640,height:900});mounted.after_shrink=await after(page);completed(mounted.after_shrink,0);assert.deepEqual(mounted.after_shrink.public_state.state,fitting);
  await page.setViewportSize({width:1920,height:900});mounted.after_grow=await after(page);completed(mounted.after_grow,0);assert.deepEqual(mounted.after_grow.public_state.state,fitting);
  await page.setViewportSize({width:640,height:900});await page.reload({waitUntil:'networkidle'});await waitForGrid(page);mounted.after_remount=await after(page);completed(mounted.after_remount,1);
  assert.ok(mounted.after_remount.center.scrollWidth-mounted.after_remount.center.clientWidth<=1);
  const persisted=await capture(page,context,'native_manual_after_guard',fitting);
  const h=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"] .ag-header-cell-resize').first();
  const point=await h.evaluate(n=>{const b=n.getBoundingClientRect();for(const f of [.1,.25,.4,.6,.8,.9]){const x=b.x+b.width*f,y=b.y+b.height/2;const hit=document.elementFromPoint(x,y);if(hit&&(hit===n||n.contains(hit)))return{x,y};}return null;});
  assert.ok(point);await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+600,point.y,{steps:10});await page.mouse.up();
  persisted.after_drag=await after(page);completed(persisted.after_drag,0);
  assert.ok(persisted.after_drag.center.scrollWidth>persisted.after_drag.center.clientWidth,'Manual overflow negative control missing');
  assert.notDeepEqual(persisted.after_drag.public_state.state,fitting);assert.deepEqual(nonWidth(persisted.after_drag.public_state.state),nonWidth(fitting));
  persisted.native_saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(id)),persisted.grid_id);assert.deepEqual(persisted.native_saved,persisted.after_drag.public_state.state);
  const live=await capture(page,context,'ordinary_live_refresh',stale,{repair:1,live:true});
  const response=await page.waitForResponse(r=>r.url().includes('/gravityflow/internal/inbox/changes')&&r.request().method()==='POST',{timeout:15000});
  live.refresh_http=response.status();assert.equal(live.refresh_http,200);live.after_refresh=await after(page);completed(live.after_refresh,1);assert.deepEqual(live.after_refresh.public_state.state,live.public_state.state);
  const before=await capture(page,context,'unrelated_api_before_guard',fitting,{before:true,repair:1});
  assert.deepEqual(before.guard.evaluations[0].state_before,stale);assert.ok(before.controls.some(c=>c.origin==='unrelated_before_geometry_guard'));
  const post=await capture(page,context,'unrelated_api_after_guard',fitting);
  await page.evaluate(state=>window.__gppWidthControl.run('unrelated_after_guard',state),stale);post.after_api=await after(page);completed(post.after_api,0);assert.deepEqual(post.after_api.public_state.state,stale);
  const extra=state([165,528,414,355,410],{[ids[2]]:{sort:'desc',sortIndex:1},[ids[1]]:{sort:'asc',sortIndex:0},[ids[4]]:{hide:true}});
  [extra[2],extra[3]]=[extra[3],extra[2]];
  const preserved=await capture(page,context,'non_width_order_visibility_sort',extra,{repair:1});assert.deepEqual(nonWidth(preserved.public_state.state),nonWidth(extra));
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('method-local-sentinel'),sessionStorage.getItem('method-session-sentinel')]),['keep','keep']);
}

try {
  const attrs={selectedFormsJson:JSON.stringify([{value:form.form_id}])};
  pages=JSON.parse(wp(`$items=array();foreach(array('shortcode'=>'[gravityflow page="inbox" form="${form.form_id}"]','block'=>'<!-- wp:gravityflow/inbox ${JSON.stringify(attrs)} /-->') as $kind=>$content){$id=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Upstream method '.$kind,'post_content'=>wp_slash($content)),true);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$items[]=array('id'=>(int)$id,'kind'=>$kind,'url'=>get_permalink($id));}update_option('gpp_width_candidate_d_lab',array('pages'=>wp_list_pluck($items,'id'),'observer_path'=>${JSON.stringify(path.join(repoRoot,'tests/repro-evidence-lab/inbox-width-candidate-d-observer.js'))},'accepted_ids'=>${JSON.stringify(ids)},'control_state'=>json_decode(${JSON.stringify(JSON.stringify(stale))},true)),false);echo wp_json_encode($items);`));
  fs.copyFileSync(path.join(repoRoot,'tests/repro-evidence-lab/inbox-width-candidate-d-mu.php'),mu);
  process.env.IVD2_ADMIN_USER=fixture.operator.login;process.env.IVD2_ADMIN_PASSWORD='wu21-bootstrap-pass-2026';
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>result.page_errors.push(String(e)));await login(page);
  for(const context of pages)await cases(page,context);
  activation=JSON.parse(wp(visual+`echo wp_json_encode($v->resolve('gravity_flow.inbox'));`));assert.ok(activation);
  wp(visual+`$v->deactivate(array('surface'=>'gravity_flow.inbox'));`);
  for(const context of pages)await capture(page,context,'inactive_profile',null,{nativeOnly:true});
  wp(visual+`$a=json_decode(${JSON.stringify(JSON.stringify(activation))},true);$a['surface']='gravity_flow.inbox';$v->activate($a);`);activation=null;
  const unrelated=JSON.parse(wp(`$f=GFAPI::get_form(${form.form_id});unset($f['id']);$f['title']='Unrelated unconfigured synthetic form';$id=GFAPI::add_form($f);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());$p=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Unrelated Inbox','post_content'=>'[gravityflow page="inbox" form="'.$id.'"]'),true);echo wp_json_encode(array('form_id'=>$id,'id'=>$p,'url'=>get_permalink($p),'kind'=>'shortcode'));`));
  unrelatedForm=unrelated.form_id;pages.push(unrelated);wp(`$lab=get_option('gpp_width_candidate_d_lab');$lab['pages'][]=${unrelated.id};update_option('gpp_width_candidate_d_lab',$lab,false);`);
  await capture(page,unrelated,'unrelated_inbox',null,{nativeOnly:true});
  const unrelatedBlock=JSON.parse(wp(`$attrs=array('selectedFormsJson'=>wp_json_encode(array(array('value'=>${unrelated.form_id}))));$p=wp_insert_post(array('post_type'=>'page','post_status'=>'publish','post_title'=>'Unrelated Block Inbox','post_content'=>wp_slash('<!-- wp:gravityflow/inbox '.wp_json_encode($attrs).' /-->')),true);$lab=get_option('gpp_width_candidate_d_lab');$lab['pages'][]=$p;update_option('gpp_width_candidate_d_lab',$lab,false);echo wp_json_encode(array('id'=>$p,'url'=>get_permalink($p),'kind'=>'block'));`));
  pages.push(unrelatedBlock);await capture(page,unrelatedBlock,'unrelated_inbox',null,{nativeOnly:true});
  assert.equal(hash(bundle),originalBundle,'Vendor bundle was modified');
  result.vendor_bundle_sha256=originalBundle;
  result.remaining_not_proven=['production attachment implementation','other host versions and unsupported shapes/modes (fail closed)'];
  result.repair_count=result.scenarios.reduce((a,s)=>a+(s.guard?.repair_count||0),0);
  result.disposition='CANDIDATE_C_SELECTED_FOR_PRODUCTION_IMPLEMENTATION';result.execution_status='PASS_MUTATION_PROTOTYPE';
} catch(e) {result.execution_status='ERROR';result.failure=String(e.stack||e);throw e;}
finally {
  if(browser)await browser.close();if(fs.existsSync(mu))fs.unlinkSync(mu);
  if(activation)wp(visual+`$a=json_decode(${JSON.stringify(JSON.stringify(activation))},true);$a['surface']='gravity_flow.inbox';$v->activate($a);`);
  if(pages.length)wp(`foreach(${JSON.stringify(pages.map(p=>p.id))} as $id)wp_delete_post($id,true);delete_option('gpp_width_candidate_d_lab');`);
  if(unrelatedForm)wp(`GFAPI::delete_form(${unrelatedForm});`);
  fs.writeFileSync(path.join(artifactDir,'inbox-width-candidate-c-runtime.json'),JSON.stringify(result,null,2)+'\n');
}
console.log('CANDIDATE_C_PROTOTYPE_PASS');
