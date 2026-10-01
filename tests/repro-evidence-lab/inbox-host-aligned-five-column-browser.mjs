import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, assertEnv, login, waitForGrid, nativeSearch } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const form = (fixture.forms || []).find(item => item.key === 'alpha') || fixture.forms?.[0];
if (!form?.form_id) throw new Error('HOST_ALIGNED_FAILURE: alpha fixture unavailable.');

const student = String(form.first_name_field_id);
const national = String(form.national_id_field_id);
const school = String(form.school_field_id);
const HOST = ['id', 'date_created', school, national, student];
const OWNER_RTL = [student, national, school, 'date_created', 'id'];
const OLD_CLEAN = ['date_created', school, national, student, 'id'];
const TOLERANCE = 0.75;
const evidencePath = path.join(artifactDir, 'inbox-host-aligned-five-column-evidence.json');

function wpEval(code) {
  const r = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(`WP-CLI failed: ${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
}

function setup() {
  return JSON.parse(wpEval(`
$f=${Number(form.form_id)};$u=${Number(fixture.operator?.id || 0)};$ids=array();
for($i=0;$i<10;$i++){
 $e=array('form_id'=>$f,'created_by'=>$u,'${student}'=>sprintf('Aligned %02d',$i),'${Number(form.last_name_field_id)}'=>'Student','${national}'=>sprintf('ALIGN-%03d',$i),'${Number(form.grade_group_field_id)}'=>'پایه','${school}'=>'مدرسه','${Number(form.photo_field_id)}'=>'');
 $id=GFAPI::add_entry($e);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());
 GFAPI::update_entry_property($id,'date_created',gmdate('Y-m-d H:i:s',strtotime('2026-05-01 UTC')+$i));(new Gravity_Flow_API($f))->process_workflow($id);$ids[]=(int)$id;
}
$p=wp_insert_post(array('post_title'=>'WU21 Host Aligned Inbox','post_status'=>'publish','post_type'=>'page','post_content'=>'[gravityflow page="inbox" form="'.$f.'"]'),true);
if(is_wp_error($p))throw new RuntimeException($p->get_error_message());echo wp_json_encode(array('page_id'=>(int)$p,'url'=>get_permalink($p),'entry_ids'=>$ids));
  `));
}

function cleanup(ctx) {
  if (!ctx) return;
  const ids = JSON.stringify((ctx.entry_ids || []).map(Number));
  wpEval(`foreach(json_decode('${ids}',true) as $id)GFAPI::delete_entry((int)$id);wp_delete_post(${Number(ctx.page_id)},true);`);
}

async function waitRows(page) {
  await waitForGrid(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0, null, { timeout: 20000 });
}

async function tracks(page, kind) {
  const locator = kind === 'header'
    ? page.locator('[data-js="gflow-inbox"] .ag-header-cell')
    : page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().locator('.ag-cell');
  return locator.evaluateAll(nodes => nodes.filter(node => {
    const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';
  }).map(node => {const r=node.getBoundingClientRect();return {id:node.getAttribute('col-id'),x:r.x,left:r.left,right:r.right,width:r.width};}).sort((a,b)=>a.x-b.x));
}

async function assertGeometry(page, stage) {
  const h = await tracks(page, 'header'), b = await tracks(page, 'body');
  assert.deepEqual(h.map(x=>x.id), HOST, `${stage}: header order`);
  assert.deepEqual([...h].sort((a,b)=>b.x-a.x).map(x=>x.id), OWNER_RTL, `${stage}: Owner RTL order`);
  assert.deepEqual(b.map(x=>x.id), HOST, `${stage}: body order`);
  assert.equal(h.length,5);assert.equal(b.length,5);
  let max=0;
  for(let i=0;i<5;i++){
    assert.equal(h[i].id,b[i].id);
    max=Math.max(max,Math.abs(h[i].left-b[i].left),Math.abs(h[i].right-b[i].right),Math.abs(h[i].width-b[i].width));
    if(i){assert.ok(Math.abs(h[i].left-h[i-1].right)<=TOLERANCE,`${stage}: header gap`);assert.ok(Math.abs(b[i].left-b[i-1].right)<=TOLERANCE,`${stage}: body gap`);}
  }
  assert.ok(max<=TOLERANCE,`${stage}: header/body geometry drift ${max}px`);
  const bounds=await page.evaluate(()=>{const root=document.querySelector('[data-js="gflow-inbox"]');const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return {left:r.left,right:r.right};};return {h:rect(root?.querySelector('.ag-header-container')),b:rect(root?.querySelector('.ag-center-cols-container'))};});
  const edges={};
  if(bounds.h&&bounds.b){edges.header_leading=Math.abs(h[0].left-bounds.h.left);edges.header_trailing=Math.abs(h.at(-1).right-bounds.h.right);edges.body_leading=Math.abs(b[0].left-bounds.b.left);edges.body_trailing=Math.abs(b.at(-1).right-bounds.b.right);for(const [name,delta] of Object.entries(edges))assert.ok(delta<=TOLERANCE,`${stage}: ${name} empty edge track ${delta}px`);}
  return {stage,max_delta_css_px:max,edge_deltas:edges,headers:h,first_row:b};
}

async function storage(page) {
  return page.evaluate(() => {const read=s=>{const o={};for(let i=0;i<s.length;i++){const k=s.key(i);o[k]=s.getItem(k);}return o;};return {local:read(localStorage),session:read(sessionStorage)};});
}

async function clearState(page,id) { await page.evaluate(k=>{localStorage.removeItem(k);sessionStorage.removeItem(k);},id); }

async function hostState(page,id) {
  for(let i=0;i<50;i++){
    const v=await page.evaluate(k=>({local:localStorage.getItem(k),session:sessionStorage.getItem(k)}),id);
    const hit=Object.entries(v).filter(([,raw])=>typeof raw==='string'&&raw);
    if(hit.length===1){const [area,raw]=hit[0],parsed=JSON.parse(raw);assert.ok(Array.isArray(parsed));return {area,raw,parsed};}
    if(hit.length>1)throw new Error('Native state duplicated across storage areas.');
    await page.waitForTimeout(100);
  }
  throw new Error(`Native state missing for ${id}.`);
}

async function waitHostOrder(page,id,expected) {
  for(let i=0;i<50;i++){
    const state=await hostState(page,id);
    if(JSON.stringify(stateIds(state.parsed))===JSON.stringify(expected))return state;
    await page.waitForTimeout(100);
  }
  throw new Error(`Native state did not converge to ${expected.join(' | ')}.`);
}

async function waitPersistedSort(page,id) {
  for(let i=0;i<50;i++){
    const state=await hostState(page,id),item=state.parsed.find(x=>String(x.colId)==='date_created');
    if(item?.sort==='asc'||item?.sort==='desc')return {state,sort:item.sort};
    await page.waitForTimeout(100);
  }
  throw new Error('Native date sort was not persisted.');
}

function stateIds(state) { return state.map(x=>String(x.colId)).filter(id=>HOST.includes(id)); }
function reorder(state, order) { const by=new Map(state.map(x=>[String(x.colId),x]));for(const id of order)assert.ok(by.has(id));return [...order.map(id=>by.get(id)),...state.filter(x=>!order.includes(String(x.colId)))]; }
async function writeState(page,area,id,state){await page.evaluate(({area,key,value})=>(area==='local'?localStorage:sessionStorage).setItem(key,value),{area,key:id,value:JSON.stringify(state)});}

let browser=null,cleanBrowser=null,ctx=null,liveId=null;
let evidence={contract:'SRWF_INBOX_HOST_ALIGNED_FIVE_COLUMN_V1',execution_status:'ERROR'};
try {
  ctx=setup();
  const rtl=new URL(ctx.url);rtl.searchParams.set('wu21_header_rtl_probe','1');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});await login(page);

  await page.goto(ctx.url,{waitUntil:'networkidle'});await waitRows(page);
  const ordinaryGrid=await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  await page.goto(rtl.toString(),{waitUntil:'networkidle'});await waitRows(page);
  const grid=await page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
  assert.equal(grid,ordinaryGrid,'Grid ID changed for RTL projection.');
  assert.equal(await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper.ag-rtl').count(),0,'ag-rtl must remain false.');
  await page.evaluate(()=>{localStorage.setItem('wu21-host-align-local','keep');sessionStorage.setItem('wu21-host-align-session','keep');});

  await clearState(page,grid);await page.reload({waitUntil:'networkidle'});await waitRows(page);
  const clean=await assertGeometry(page,'clean');
  const cleanStorage=await storage(page);assert.equal(cleanStorage.local[grid],undefined,'Clean local state unexpectedly persisted before native mutation.');assert.equal(cleanStorage.session[grid],undefined,'Clean session state unexpectedly persisted before native mutation.');

  assert.ok((await nativeSearch(page,'ALIGN-000')).includes(Number(ctx.entry_ids[0])));
  await nativeSearch(page,'');
  await page.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length===20,null,{timeout:10000});
  const authentic=await hostState(page,grid);
  assert.deepEqual(stateIds(authentic.parsed),HOST,'Native persisted order is not HOST_ALIGNED.');

  const oldState=reorder(authentic.parsed,OLD_CLEAN);await writeState(page,authentic.area,grid,oldState);
  await page.reload({waitUntil:'networkidle'});await waitRows(page);
  const oldFirst=await assertGeometry(page,'old_clean_first_render');
  const restored=await waitHostOrder(page,grid,HOST);assert.deepEqual(stateIds(restored.parsed),HOST,'OLD_CLEAN did not naturally restore/re-persist HOST_ALIGNED.');

  const stableState=reorder(restored.parsed,HOST);await writeState(page,authentic.area,grid,stableState);
  await page.reload({waitUntil:'networkidle'});await waitRows(page);const stable=await assertGeometry(page,'existing_host_aligned');
  await page.reload({waitUntil:'networkidle'});await waitRows(page);const reload1=await assertGeometry(page,'reload_1');
  await page.reload({waitUntil:'networkidle'});await waitRows(page);const reload2=await assertGeometry(page,'reload_2');

  const date=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first();await date.click();await page.waitForTimeout(300);
  const sort=await date.getAttribute('aria-sort');assert.ok(['ascending','descending'].includes(sort));
  const persistedSort=await waitPersistedSort(page,grid);assert.deepEqual(stateIds(persistedSort.state.parsed),HOST,'Sort changed persisted column order.');
  await page.reload({waitUntil:'networkidle'});await waitRows(page);const sortReload=await assertGeometry(page,'sort_reload');
  assert.equal(await page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first().getAttribute('aria-sort'),sort,'Sort state did not persist.');

  await page.evaluate(()=>{window.__hostAlignedGrid=document.querySelector('[data-js="gflow-inbox"]');});
  const liveDate=sort==='ascending'?'2025-01-01 00:00:00':'2027-01-01 00:00:00';
  liveId=Number(wpEval(`$f=${Number(form.form_id)};$u=${Number(fixture.operator?.id||0)};$e=array('form_id'=>$f,'created_by'=>$u,'${student}'=>'Live','${Number(form.last_name_field_id)}'=>'Refresh','${national}'=>'ALIGN-LIVE','${Number(form.grade_group_field_id)}'=>'پایه','${school}'=>'مدرسه','${Number(form.photo_field_id)}'=>'');$id=GFAPI::add_entry($e);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());GFAPI::update_entry_property($id,'date_created','${liveDate}');(new Gravity_Flow_API($f))->process_workflow($id);echo (int)$id;`));
  await page.waitForFunction(id=>Boolean(document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`)),liveId,{timeout:20000});
  assert.equal(await page.evaluate(()=>window.__hostAlignedGrid===document.querySelector('[data-js="gflow-inbox"]')),true,'Live Refresh replaced Grid.');
  assert.equal(Number(await page.locator(`[data-js="gflow-inbox"] .ag-row[row-id="${liveId}"]`).first().getAttribute('row-id')),liveId,'Native row identity changed.');
  const live=await assertGeometry(page,'live_refresh');assert.deepEqual(stateIds((await hostState(page,grid)).parsed),HOST);
  wpEval(`GFAPI::delete_entry(${liveId});`);await page.waitForFunction(id=>!document.querySelector(`[data-js="gflow-inbox"] .ag-row[row-id="${CSS.escape(String(id))}"]`),liveId,{timeout:20000});liveId=null;

  const link=page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first();
  assert.equal(await link.evaluate(a=>a.closest('.ag-cell')?.getAttribute('col-id')),'id','Entry Detail link left id column.');
  assert.match(await link.getAttribute('href')||'',/view=entry/);

  const viewer=await browser.newPage({viewport:{width:1440,height:900}});
  await viewer.goto(new URL('/wp-login.php',new URL(ctx.url).origin).toString(),{waitUntil:'domcontentloaded'});await viewer.fill('#user_login','wu21_viewer');await viewer.fill('#user_pass','wu21-synthetic-viewer-2026');
  await Promise.all([viewer.waitForNavigation({waitUntil:'domcontentloaded'}),viewer.click('#wp-submit')]);await viewer.goto(rtl.toString(),{waitUntil:'networkidle'});
  const viewerRows=await viewer.locator('[data-js="gflow-inbox"] .ag-row').count();assert.equal(viewerRows,0,'Non-assignee gained Inbox rows.');await viewer.close();

  const finalStorage=await storage(page);assert.equal(finalStorage.local['wu21-host-align-local'],'keep');assert.equal(finalStorage.session['wu21-host-align-session'],'keep');
  const areas=['local','session'].filter(a=>typeof finalStorage[a][grid]==='string'&&finalStorage[a][grid]);assert.deepEqual(areas,[authentic.area]);assert.deepEqual(stateIds(JSON.parse(finalStorage[authentic.area][grid])),HOST);

  cleanBrowser=await chromium.launch({headless:true});const cleanPage=await cleanBrowser.newPage({viewport:{width:1440,height:900}});await login(cleanPage);
  const before=await storage(cleanPage);assert.equal(before.local[grid],undefined);assert.equal(before.session[grid],undefined);await cleanPage.goto(rtl.toString(),{waitUntil:'networkidle'});await waitRows(cleanPage);
  assert.equal(await cleanPage.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id'),grid);const independentClean=await assertGeometry(cleanPage,'independent_clean');

  const stages=[clean,oldFirst,stable,reload1,reload2,sortReload,live,independentClean];
  evidence={contract:'SRWF_INBOX_HOST_ALIGNED_FIVE_COLUMN_V1',execution_status:'PASS',runtime:{gravity_flow_version:'3.1.0',gravity_flow_sha256:process.env.WU21_FLOW_SHA256||null},expected:{physical:HOST,owner_rtl:OWNER_RTL,old_clean:OLD_CLEAN,ag_rtl:false},grid:{ordinary:ordinaryGrid,host_aligned:grid,equal:ordinaryGrid===grid},storage:{area:authentic.area,key:grid,restored:stateIds(restored.parsed),final:stateIds(JSON.parse(finalStorage[authentic.area][grid])),unrelated_preserved:true},reloads:{old_clean_first_render:oldFirst,existing_host_aligned:stable,reload_1:reload1,reload_2:reload2},geometry:{tolerance_css_px:TOLERANCE,max_delta_css_px:Math.max(...stages.map(x=>x.max_delta_css_px)),stages},sorting:{aria_sort:sort,persisted_sort:persistedSort.sort},live_refresh:{same_grid:true,native_row_identity:true,order_preserved:true},entry_detail:{col_id:'id',href:await link.getAttribute('href')},authorization_assignment:{non_assignee_rows:viewerRows},independent_clean};
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');console.log('INBOX_HOST_ALIGNED_FIVE_COLUMN_RUNTIME_PASS');
} catch(error) {
  evidence.error=String(error?.stack||error);fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');throw error;
} finally {
  if(liveId){try{wpEval(`GFAPI::delete_entry(${Number(liveId)});`);}catch{}}
  if(cleanBrowser)await cleanBrowser.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});cleanup(ctx);fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
}
