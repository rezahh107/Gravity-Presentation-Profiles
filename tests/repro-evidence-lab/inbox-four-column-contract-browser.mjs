import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { artifactDir, wpCli, wpPath, assertEnv, login, waitForGrid, nativeSearch, pagerState } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();
const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const form = (fixture.forms || []).find(x => x.key === 'alpha') || fixture.forms?.[0];
if (!form?.form_id) throw new Error('FOUR_COLUMN_FAILURE: alpha fixture unavailable.');
const sid = String(form.first_name_field_id), nid = String(form.national_id_field_id), school = String(form.school_field_id);
const FIVE = ['date_created', school, nid, sid, 'id'];
const FOUR = ['date_created', school, nid, sid];
const probe = 'wu21_four_column_contract';
const evidencePath = path.join(artifactDir, 'inbox-visual-design-v2-four-column-contract-evidence.json');

function wpEval(code) {
  const r = spawnSync('php', [wpCli, '--path=' + wpPath, 'eval', code], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error('WP-CLI failed: ' + r.stderr + '\n' + r.stdout);
  return r.stdout.trim();
}
function setupPage() {
  return JSON.parse(wpEval(
    '$form=' + Number(form.form_id) + ';$uid=' + Number(fixture.operator?.id || 0) + ';' +
    '$p=wp_insert_post(array("post_title"=>"WU21 Four Column","post_status"=>"publish","post_type"=>"page","post_content"=>"[gravityflow page=\\"inbox\\" form=\\"" + $form + "\\"]"),true);' +
    'if(is_wp_error($p))throw new RuntimeException($p->get_error_message());$ids=array();' +
    'for($i=0;$i<10;$i++){ $e=array("form_id"=>$form,"created_by"=>$uid,"' + sid + '"=>"Four ".sprintf("%02d",$i),"' +
    form.last_name_field_id + '"=>"Student ".sprintf("%02d",$i),"' + nid + '"=>sprintf("FOUR-%03d",$i),"' +
    form.grade_group_field_id + '"=>"پایه ".sprintf("%02d",$i),"' + school + '"=>"مدرسه ".sprintf("%02d",$i),"' +
    form.photo_field_id + '"=>"");$id=GFAPI::add_entry($e);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());' +
    'GFAPI::update_entry_property($id,"date_created",gmdate("Y-m-d H:i:s",strtotime("2026-04-01 00:00:00 UTC")+$i));' +
    '(new Gravity_Flow_API($form))->process_workflow($id);$ids[]=(int)$id;}' +
    'echo wp_json_encode(array("page_id"=>(int)$p,"url"=>get_permalink($p),"entry_ids"=>$ids));'
  ));
}
function cleanup(setup) {
  if (!setup) return;
  try { wpEval("foreach(json_decode('" + JSON.stringify(setup.entry_ids) + "',true) as $id)GFAPI::delete_entry((int)$id);wp_delete_post(" + Number(setup.page_id) + ",true);"); } catch {}
}
const headers = page => page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(c => c
  .filter(x => { const r=x.getBoundingClientRect(),s=getComputedStyle(x); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; })
  .map(x => ({ id:x.getAttribute('col-id'), text:(x.querySelector('.ag-header-cell-text')?.textContent||x.textContent||'').replace(/\s+/g,' ').trim(), x:x.getBoundingClientRect().x })));
const physical = h => [...h].sort((a,b)=>a.x-b.x).map(x=>x.id);
const rowCols = page => page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().locator('.ag-cell').evaluateAll(c => c
  .filter(x => { const r=x.getBoundingClientRect(),s=getComputedStyle(x); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; })
  .sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x).map(x=>x.getAttribute('col-id')));
const waitRows = async (page,n) => { await waitForGrid(page); await page.waitForFunction(n => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length===n,n,{timeout:20000}); };
const gridId = page => page.locator('[data-js="gflow-inbox"]').getAttribute('data-grid-id');
const readState = async (page,id) => page.evaluate(k => {
  const v=[['local',localStorage.getItem(k)],['session',sessionStorage.getItem(k)]].filter(([,x])=>typeof x==='string'&&x);
  if(v.length!==1)return null; return {area:v[0][0],raw:v[0][1],parsed:JSON.parse(v[0][1])};
},id);
const stateIds = s => s?.parsed?.map(x=>String(x.colId)) || null;
let setup=null,browser=null,muPath=null;
let evidence={contract:'SRWF_INBOX_FOUR_COLUMN_CONTRACT_V1',execution_status:'ERROR'};

try {
  setup=setupPage();
  muPath=path.join(wpPath,'wp-content/mu-plugins/wu21-four-column-contract.php');
  fs.writeFileSync(muPath,
    "<?php if(!defined('ABSPATH'))exit; add_filter('gravityflow_inbox_args',function($a){if(!is_admin()&&isset($_GET['" + probe + "'])&&'1'===sanitize_key(wp_unslash($_GET['" + probe + "']))){$a['id_column']=false;update_option('gpp_wu21_four_column_args_seen',$a,false);}return $a;},1000,1);"
  );
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}); await login(page);
  const base=setup.url, fiveUrl=new URL(base); fiveUrl.searchParams.set('wu21_rtl_probe','1');

  await page.goto(fiveUrl.toString(),{waitUntil:'networkidle'}); await waitRows(page,20);
  const fiveGrid=await gridId(page), fiveHeaders=await headers(page), op=fiveHeaders.find(x=>x.id==='id');
  assert.equal(op?.text,'عملیات');
  const opLink=page.locator('[data-js="gflow-inbox"] .ag-row').first().locator('.ag-cell[col-id="id"] .gflow-inbox__entry-cell-link').first();
  await opLink.waitFor({state:'visible'}); const opHref=await opLink.getAttribute('href'); assert.match(opHref||'',/view=entry/);

  await page.evaluate(id=>localStorage.removeItem(id),fiveGrid); await page.reload({waitUntil:'networkidle'}); await waitRows(page,20);
  const authentic=await readState(page,fiveGrid); assert.ok(authentic);
  const by=new Map(authentic.parsed.map(x=>[String(x.colId),x])); assert.deepEqual([...by.keys()].sort(),[...FIVE].sort());
  const stale=FIVE.map(x=>by.get(x)); await page.evaluate(({id,v})=>localStorage.setItem(id,v),{id:fiveGrid,v:JSON.stringify(stale)});

  const fourUrl=new URL(base); fourUrl.searchParams.set(probe,'1'); fourUrl.searchParams.set('wu21_rtl_probe','1');
  await page.goto(fourUrl.toString(),{waitUntil:'networkidle'}); await waitRows(page,20);
  const fourGrid=await gridId(page);
  const args=JSON.parse(wpEval("echo wp_json_encode(get_option('gpp_wu21_four_column_args_seen',array()));"));
  assert.equal(args.id_column,false); assert.notEqual(fourGrid,fiveGrid);

  const fourHeaders=await headers(page); assert.deepEqual(physical(fourHeaders),FOUR); assert.deepEqual(await rowCols(page),FOUR); assert.equal(fourHeaders.some(x=>x.id==='id'),false);
  assert.equal(await page.evaluate(id=>localStorage.getItem(id),fiveGrid),JSON.stringify(stale));
  let fourState=await readState(page,fourGrid); if(fourState)assert.deepEqual(stateIds(fourState),FOUR);

  await page.evaluate(()=>{localStorage.setItem('wu21-four-column-unrelated-local','keep-local');sessionStorage.setItem('wu21-four-column-unrelated-session','keep-session');});
  await nativeSearch(page,'FOUR-000'); await nativeSearch(page,''); await page.waitForTimeout(500);
  fourState=await readState(page,fourGrid); assert.ok(fourState); assert.deepEqual(stateIds(fourState),FOUR);

  const sort=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first(); await sort.click(); await page.waitForTimeout(300);
  const sortDir=await sort.getAttribute('aria-sort'); assert.ok(['ascending','descending'].includes(sortDir));
  const sorted=await readState(page,fourGrid); assert.ok(['asc','desc'].includes(sorted.parsed.find(x=>x.colId==='date_created')?.sort));

  assert.ok((await nativeSearch(page,'FOUR-000')).includes(Number(setup.entry_ids[0]))); await nativeSearch(page,''); await waitRows(page,20);
  const p1=await pagerState(page); assert.equal(p1.current,'1'); assert.equal(p1.next_disabled,false);
  await page.locator('[data-js="gflow-inbox"] [ref="btNext"]').click(); await page.waitForFunction(()=>document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='2');
  const p2=await pagerState(page); await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click(); await page.waitForFunction(()=>document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='1'); const pr=await pagerState(page);

  const live=JSON.parse(wpEval('$f='+Number(form.form_id)+';$u='+Number(fixture.operator?.id||0)+';$e=array("form_id"=>$f,"created_by"=>$u,"' + sid + '"=>"Live Four","' + form.last_name_field_id + '"=>"Refresh","' + nid + '"=>"FOUR-LIVE-001","' + form.grade_group_field_id + '"=>"پایه زنده","' + school + '"=>"مدرسه زنده","' + form.photo_field_id + '"=>"");$id=GFAPI::add_entry($e);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());(new Gravity_Flow_API($f))->process_workflow($id);echo wp_json_encode(array("id"=>(int)$id));'));
  await page.waitForFunction(id=>Boolean(document.querySelector('[data-js="gflow-inbox"] .ag-row[row-id="'+CSS.escape(String(id))+'"]')),live.id,{timeout:20000});
  const liveRows=await page.locator('[data-js="gflow-inbox"] .ag-row').count(); wpEval('GFAPI::delete_entry('+Number(live.id)+');');
  await page.waitForFunction(id=>!document.querySelector('[data-js="gflow-inbox"] .ag-row[row-id="'+CSS.escape(String(id))+'"]'),live.id,{timeout:20000});
  assert.deepEqual(stateIds(await readState(page,fourGrid)),FOUR);

  const afterStorage=await page.evaluate(()=>({l:localStorage.getItem('wu21-four-column-unrelated-local'),s:sessionStorage.getItem('wu21-four-column-unrelated-session')}));
  assert.equal(afterStorage.l,'keep-local'); assert.equal(afterStorage.s,'keep-session');

  await page.reload({waitUntil:'networkidle'}); await waitRows(page,20); const r1=await headers(page),s1=await readState(page,fourGrid);
  assert.deepEqual(physical(r1),FOUR); assert.deepEqual(await rowCols(page),FOUR); assert.deepEqual(stateIds(s1),FOUR);
  await page.reload({waitUntil:'networkidle'}); await waitRows(page,20); const r2=await headers(page),s2=await readState(page,fourGrid);
  assert.deepEqual(physical(r2),FOUR); assert.deepEqual(await rowCols(page),FOUR); assert.deepEqual(stateIds(s2),FOUR);

  const link=page.locator('[data-js="gflow-inbox"] .ag-row .gflow-inbox__entry-cell-link').first(); const linkCount=await link.count();
  let nav={remaining_link_count:linkCount,reachable:false,href:null};
  if(linkCount===1){nav.href=await link.getAttribute('href');if(nav.href?.includes('view=entry')){await Promise.all([page.waitForURL(/view=entry/),link.click()]);nav.reachable=true;}}

  const viewer=await browser.newPage({viewport:{width:1440,height:900}});
  await viewer.goto(new URL('/wp-login.php',new URL(base).origin).toString(),{waitUntil:'domcontentloaded'});
  await viewer.fill('#user_login','wu21_viewer'); await viewer.fill('#user_pass','wu21-synthetic-viewer-2026');
  await Promise.all([viewer.waitForNavigation({waitUntil:'domcontentloaded'}),viewer.click('#wp-submit')]);
  await viewer.goto(fourUrl.toString(),{waitUntil:'networkidle'});
  const viewerRows=await viewer.locator('[data-js="gflow-inbox"] .ag-row').count(); assert.equal(viewerRows,0); await viewer.close();

  const clean=await browser.newPage({viewport:{width:1440,height:900}}); await login(clean); await clean.goto(fourUrl.toString(),{waitUntil:'networkidle'}); await waitRows(clean,20);
  const cleanGrid=await gridId(clean); await clean.evaluate(id=>localStorage.removeItem(id),cleanGrid); await clean.reload({waitUntil:'networkidle'}); await waitRows(clean,20);
  assert.equal(await gridId(clean),fourGrid); assert.deepEqual(physical(await headers(clean)),FOUR); assert.equal(await readState(clean,fourGrid),null); await clean.close();

  evidence={
    contract:'SRWF_INBOX_FOUR_COLUMN_CONTRACT_V1',
    execution_status:nav.reachable?'PASS':'NAVIGATION_IMPACT_REQUIRES_OWNER_DECISION',
    runtime:{gravity_flow_version:'3.1.0',gravity_flow_sha256:process.env.WU21_FLOW_SHA256||null,gravity_forms_version:'3.1.1.1'},
    q1:{column_id:'id',header:'عملیات',native_entry_link_href:opHref,entry_detail_link:true},
    q2:{mechanism:'gravityflow_inbox_args[id_column=false]',documented_equivalent:'[gravityflow page="inbox" id_column="false"]',native_args_observed:{id_column:args.id_column},five_grid_id:fiveGrid,four_grid_id:fourGrid,deterministic_contract_identity:true},
    q3:{physical_ids:physical(fourHeaders),right_to_left_ids:[...physical(fourHeaders)].reverse(),first_row_ids:await rowCols(page)},
    q4:{authentic_five_ids:stateIds(authentic),historical_stale_ids:stale.map(x=>String(x.colId)),old_state_untouched:true,four_state_before_native_persist:fourState?stateIds(fourState):null,four_state_after_native_persist:stateIds(sorted)},
    q5:{native_four_state_before_reload:stateIds(sorted),first_reload:stateIds(s1),second_reload:stateIds(s2)},
    q6:{date_sort_direction:sortDir,persisted_sort:sorted.parsed.find(x=>x.colId==='date_created')?.sort||null},
    q7:nav,
    q8:{search:true,pagination:{page1:p1,page2:p2,round_trip:pr},live_refresh:{added:true,visible_row_count:liveRows,removed:true},form_scope:true,non_assignee_viewer_rows:viewerRows},
    clean_state:{grid_id:fourGrid,physical_ids:FOUR,persisted_state:null}
  };
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  console.log('INBOX_FOUR_COLUMN_CONTRACT_' + evidence.execution_status);
} finally {
  if(browser)await browser.close().catch(()=>{});
  if(muPath&&fs.existsSync(muPath))fs.unlinkSync(muPath);
  try{wpEval("delete_option('gpp_wu21_four_column_args_seen');");}catch{}
  cleanup();
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
}
