import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  artifactDir,
  wpCli,
  wpPath,
  assertEnv,
  login,
  waitForGrid,
  nativeSearch,
  pagerState,
} from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const alpha = (fixture.forms || []).find(item => item.key === 'alpha') || fixture.forms?.[0];
if (!alpha?.form_id) throw new Error('INBOX_FOUR_COLUMN_QUALIFICATION_FAILURE: alpha form fixture unavailable.');

const studentId = String(alpha.first_name_field_id);
const nationalId = String(alpha.national_id_field_id);
const schoolId = String(alpha.school_field_id);
const dateId = 'date_created';
const hiddenDateId = 'date_created_human_readable';
const fourPhysicalIds = [dateId, schoolId, nationalId, studentId];
const fourRightToLeftIds = [studentId, nationalId, schoolId, dateId];
const fivePhysicalIds = [dateId, schoolId, nationalId, studentId, 'id'];
const fiveRightToLeftIds = ['id', studentId, nationalId, schoolId, dateId];
const staleFivePhysicalIds = ['id', dateId, schoolId, nationalId, studentId];
const unrelatedLocalKey = 'wu21-four-column-unrelated-local';
const unrelatedSessionKey = 'wu21-four-column-unrelated-session';
const evidencePath = path.join(artifactDir, 'inbox-four-column-contract-evidence.json');

function wpEval(code) {
  const result = spawnSync('php', [wpCli, '--path=' + wpPath, 'eval', code], { encoding: 'utf8', env: process.env });
  if (result.status !== 0) throw new Error('WP-CLI failed: ' + result.stderr + '\n' + result.stdout);
  return result.stdout.trim();
}

function setupScopedInbox() {
  const code =
    '$form_id=' + Number(alpha.form_id) + ';' +
    '$operator_id=' + Number(fixture.operator?.id || 0) + ';' +
    '$first=' + Number(alpha.first_name_field_id) + ';' +
    '$last=' + Number(alpha.last_name_field_id) + ';' +
    '$national=' + Number(alpha.national_id_field_id) + ';' +
    '$grade=' + Number(alpha.grade_group_field_id) + ';' +
    '$school=' + Number(alpha.school_field_id) + ';' +
    '$photo=' + Number(alpha.photo_field_id) + ';' +
    '$ids=array();' +
    'for($i=0;$i<25;$i++){' +
      '$e=array("form_id"=>$form_id,"created_by"=>$operator_id,(string)$first=>sprintf("Four First %02d",$i),(string)$last=>sprintf("Four Last %02d",$i),(string)$national=>sprintf("FOUR-A-%03d",$i),(string)$grade=>sprintf("پایه چهارستونه %02d",$i),(string)$school=>sprintf("مدرسه چهارستونه %02d",$i),(string)$photo=>"");' +
      '$id=GFAPI::add_entry($e); if(is_wp_error($id)) throw new RuntimeException($id->get_error_message());' +
      'GFAPI::update_entry_property($id,"date_created",gmdate("Y-m-d H:i:s",strtotime("2026-03-15 00:00:00 UTC")+$i));' +
      '(new Gravity_Flow_API($form_id))->process_workflow($id); $ids[]=(int)$id;' +
    '}' +
    '$a=wp_insert_post(array("post_title"=>"WU21 Four Column A","post_status"=>"publish","post_type"=>"page","post_content"=>"[gravityflow page=\\"inbox\\" form=\\"" . $form_id . "\\"]"),true);' +
    '$b=wp_insert_post(array("post_title"=>"WU21 Four Column B","post_status"=>"publish","post_type"=>"page","post_content"=>"[gravityflow page=\\"inbox\\" form=\\"" . $form_id . "\\"]"),true);' +
    'if(is_wp_error($a)||is_wp_error($b)) throw new RuntimeException("page setup failed");' +
    'echo wp_json_encode(array("page_a_id"=>(int)$a,"page_a_url"=>get_permalink($a),"page_b_id"=>(int)$b,"page_b_url"=>get_permalink($b),"entry_ids"=>$ids));';
  const out = JSON.parse(wpEval(code));
  if (!out.page_a_id || !out.page_b_id) throw new Error('Invalid four-column fixture setup.');
  return out;
}

function cleanup(setup) {
  if (!setup) return;
  const ids = JSON.stringify((setup.entry_ids || []).map(Number));
  wpEval('foreach(json_decode(' + JSON.stringify(ids) + ',true) as $id){GFAPI::delete_entry((int)$id);}wp_delete_post(' + Number(setup.page_a_id) + ',true);wp_delete_post(' + Number(setup.page_b_id) + ',true);');
}

async function waitRows(page, min = 1) {
  await waitForGrid(page);
  await page.waitForFunction(function(n){return document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length>=n;}, min, { timeout: 15000 });
}

async function headers(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(function(cells){
    return cells.filter(function(c){var r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';})
      .map(function(c){var r=c.getBoundingClientRect(),l=c.querySelector('.ag-header-cell-text');return {id:c.getAttribute('col-id'),text:(l?l.textContent:c.textContent||'').replace(/\s+/g,' ').trim(),x:r.x};});
  });
}

function physical(h){return h.slice().sort(function(a,b){return a.x-b.x;}).map(function(x){return String(x.id);});}
function rtl(h){return h.slice().sort(function(a,b){return b.x-a.x;}).map(function(x){return String(x.id);});}

async function rowPhysical(page) {
  return page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first().locator('.ag-cell').evaluateAll(function(cells){
    return cells.filter(function(c){var r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';})
      .sort(function(a,b){return a.getBoundingClientRect().x-b.getBoundingClientRect().x;})
      .map(function(c){return String(c.getAttribute('col-id'));});
  });
}

async function gridId(page){
  const ids=await page.locator('[data-js="gflow-inbox"][data-grid-id]').evaluateAll(function(nodes){return nodes.map(function(n){return n.getAttribute('data-grid-id');}).filter(Boolean);});
  assert.equal(ids.length,1,'Expected one native Grid ID.');
  return ids[0];
}

async function gridState(page,id){
  for(let i=0;i<50;i++){
    const v=await page.evaluate(function(k){return {local:localStorage.getItem(k),session:sessionStorage.getItem(k)};},id);
    const found=Object.entries(v).filter(function(x){return typeof x[1]==='string'&&x[1].length>0;});
    if(found.length===1){return {area:found[0][0],raw:found[0][1],parsed:JSON.parse(found[0][1])};}
    if(found.length>1) throw new Error('Target Grid state exists in multiple storage areas.');
    await page.waitForTimeout(100);
  }
  throw new Error('Native Grid state was not persisted under the exact Grid ID.');
}

async function storage(page){
  return page.evaluate(function(){
    function read(s){var o={};for(var i=0;i<s.length;i++){var k=s.key(i);o[k]=s.getItem(k);}return o;}
    return {local:read(localStorage),session:read(sessionStorage)};
  });
}

function staleFrom(state){
  const by=new Map(state.map(function(x){return [String(x.colId),x];}));
  fiveRightToLeftIds.forEach(function(id){assert.ok(by.has(id),'Authentic state is missing '+id);});
  const out=staleFivePhysicalIds.map(function(id){return by.get(id);});
  state.forEach(function(x){if(!staleFivePhysicalIds.includes(String(x.colId)))out.push(x);});
  return out;
}

async function writeState(page,area,id,state){
  await page.evaluate(function(v){(v.area==='local'?localStorage:sessionStorage).setItem(v.id,JSON.stringify(v.state));},{area:area,id:id,state:state});
}

async function persistThroughSearch(page,query){
  const matches=await nativeSearch(page,query);
  await nativeSearch(page,'');
  await page.waitForFunction(function(){return document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length>=20;},null,{timeout:10000});
  return matches;
}

async function updateLive(entryId){
  const code='GFAPI::update_entry_field(' + Number(entryId) + ',' + Number(alpha.first_name_field_id) + ',"Four Live Updated");';
  wpEval(code);
}

async function waitLiveText(page, entryId){
  for(let i=0;i<90;i++){
    const value=await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="' + entryId + '"] .ag-cell[col-id="' + studentId + '"]').first().innerText().catch(function(){return '';});
    if(value.includes('Four Live Updated')) return value;
    await page.waitForTimeout(500);
  }
  throw new Error('Native Live Refresh did not propagate the updated student value for row-id '+entryId);
}

async function addLive(){
  const code='$f='+Number(alpha.form_id)+';$u='+Number(fixture.operator?.id||0)+';$a='+Number(alpha.first_name_field_id)+';$l='+Number(alpha.last_name_field_id)+';$n='+Number(alpha.national_id_field_id)+';$g='+Number(alpha.grade_group_field_id)+';$s='+Number(alpha.school_field_id)+';$p='+Number(alpha.photo_field_id)+';$e=array("form_id"=>$f,"created_by"=>$u,(string)$a=>"Four Live First",(string)$l=>"Four Live Last",(string)$n=>"FOUR-LIVE-001",(string)$g=>"پایه زنده",(string)$s=>"مدرسه زنده",(string)$p=>"");$id=GFAPI::add_entry($e);if(is_wp_error($id))throw new RuntimeException($id->get_error_message());(new Gravity_Flow_API($f))->process_workflow($id);echo (int)$id;';
  return Number(wpEval(code));
}

async function waitRow(page,id,present){
  for(let i=0;i<90;i++){
    const n=await page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+id+'"]').count();
    if((n===1)===present)return;
    await page.waitForTimeout(500);
  }
  throw new Error('Native Live Refresh did not reach row-id '+id+' present='+present);
}

function sourceEvidence(root){
  const files=[];
  function walk(dir){
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(php|js)$/.test(e.name))files.push(f);}
  }
  walk(root);
  function find(needle){
    for(const f of files){const c=fs.readFileSync(f,'utf8'),i=c.indexOf(needle);if(i>=0){return {path:path.relative(root,f).replaceAll(path.sep,'/'),line:c.slice(0,i).split('\n').length,sha256:crypto.createHash('sha256').update(c).digest('hex'),needle,snippet:c.slice(Math.max(0,i-250),Math.min(c.length,i+needle.length+450))};}}
    return null;
  }
  const needles=['id_column','gflow-inbox__entry-cell-link','gravityflow_entry_url_inbox_table','gravityflow_entry_link_inbox_table','get_unique_grid_id_from_args','getColumnState','applyColumnState'];
  return Object.fromEntries(needles.map(function(n){return [n,find(n)];}));
}

const source=sourceEvidence(process.env.WU21_GRAVITYFLOW_SOURCE);
Object.keys(source).forEach(function(n){assert.ok(source[n],'Exact Gravity Flow source marker missing: '+n);});

const runtime={gravity_flow_version:'3.1.0',gravity_flow_sha256:process.env.WU21_FLOW_SHA256,gravity_forms_version:'3.1.1.1',gravity_forms_sha256:process.env.WU21_GF_SHA256};
let browser=null,setup=null,evidence={contract:'SRWF_INBOX_FOUR_COLUMN_CONTRACT_V1',execution_status:'ERROR',runtime,source_evidence:source};

try{
  setup=setupScopedInbox();
  browser=await chromium.launch({headless:true});

  const clean=await browser.newContext({viewport:{width:1440,height:900}});
  const cleanPage=await clean.newPage();
  await login(cleanPage);
  const four=new URL(setup.page_a_url);
  four.searchParams.set('wu21_header_rtl_probe','1');
  four.searchParams.set('wu21_four_column_probe','1');
  four.searchParams.set('wu21_four_column_form',String(alpha.form_id));

  await fourColumnLoad(cleanPage,four);
  async function fourColumnLoad(page,url){
    await page.goto(url.toString(),{waitUntil:'networkidle'});
    await waitRows(page,1);
    const id=await gridId(page),h=await headers(page),r=await rowPhysical(page);
    const cfg=await page.evaluate(function(k){
      var g=document.querySelector('[data-js="gflow-inbox"]'),c=window.gflow_config?.grids?.[k]?.grid_options;
      return {defs:Array.isArray(c?.columnDefs)?c.columnDefs.map(function(d){return String(d.field);}).filter(Boolean):[],grid_count:document.querySelectorAll('[data-js="gflow-inbox"]').length,wrapper_count:document.querySelectorAll('.gflow-inbox.gflow-grid.gflow-common').length,replacement_count:document.querySelectorAll('[data-gpp-replacement-inbox],.gpp-custom-inbox-app,.gpp-inbox-card,[col-id="gpp_case_card"]').length,ag_rtl:Boolean(g?.querySelector('.ag-root-wrapper')?.classList.contains('ag-rtl'))};
    },id);
    return {grid_id:id,headers:h,physical:physical(h),rtl:rtl(h),row:r,config:cfg};
  }

  const cleanResult=await fourColumnLoad(cleanPage,four);
  assert.deepEqual(cleanResult.physical,fourPhysicalIds,'Clean four-column physical order is incorrect.');
  assert.deepEqual(cleanResult.rtl,fourRightToLeftIds,'Clean four-column RTL order is incorrect.');
  assert.deepEqual(cleanResult.row,fourPhysicalIds,'Header and first-row colId order diverge.');
  assert.equal(cleanResult.config.ag_rtl,false,'Four-column qualification must not enable AG Grid RTL.');
  assert.equal(cleanResult.config.grid_count,1,'A parallel Grid appeared.');
  assert.equal(cleanResult.config.wrapper_count,1,'Native Grid wrapper count changed.');
  assert.equal(cleanResult.config.replacement_count,0,'Replacement Inbox topology appeared.');
  assert.deepEqual(cleanResult.config.defs,fourPhysicalIds,'Native Grid columnDefs are not exactly the four active IDs.');
  const cleanGridId=cleanResult.grid_id;

  const stateCtx=await browser.newContext({viewport:{width:1440,height:900}});
  const a=await stateCtx.newPage();
  await login(a);
  const fiveUrl=new URL(setup.page_a_url);
  fiveUrl.searchParams.set('wu21_header_rtl_probe','1');
  const fiveResult=await fourColumnLoad(a,fiveUrl);
  assert.deepEqual(fiveResult.physical,fivePhysicalIds,'Five-column control did not reproduce PR #111 physical order.');
  assert.deepEqual(fiveResult.rtl,fiveRightToLeftIds,'Five-column control did not reproduce Owner RTL order.');
  const gridA=fiveResult.grid_id;
  const unrelatedBefore=await storage(a);
  await persistThroughSearch(a,'FOUR-A-000');
  const authentic=await gridState(a,gridA);
  const stale=staleFrom(authentic.parsed);
  await writeState(a,authentic.area,gridA,stale);
  const historical=await storage(a);
  assert.equal(historical[authentic.area][gridA],JSON.stringify(stale),'Historical stale state was not seeded exactly.');

  const first=await fourColumnLoad(a,four);
  const firstUpgradeStorage=await storage(a);
  assert.deepEqual(first.physical,fourPhysicalIds,'Historical five-column state still changed first four-column order.');
  assert.deepEqual(first.rtl,fourRightToLeftIds,'Historical five-column state still changed first four-column RTL order.');
  assert.deepEqual(first.row,fourPhysicalIds,'First four-column header/body colId alignment failed.');

  const nativeMatches=await persistThroughSearch(a,'FOUR-A-001');
  const newState=await gridState(a,gridA);
  const newVisible=newState.parsed.map(function(x){return String(x.colId);}).filter(function(id){return id!==hiddenDateId;});
  assert.deepEqual(newVisible,fourPhysicalIds,'Gravity Flow did not naturally persist the four-column state after historical-state fallback.');
  assert.ok(nativeMatches.length>0,'Native Search did not execute while recreating four-column state.');

  const dateHeader=a.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first();
  await dateHeader.click();
  await a.waitForTimeout(350);
  const sortDirection=await dateHeader.getAttribute('aria-sort');
  assert.ok(['ascending','descending'].includes(sortDirection),'Native date sort did not activate.');
  const sortedState=await gridState(a,gridA);
  const dateState=sortedState.parsed.find(function(x){return String(x.colId)===dateId;});
  assert.ok(['asc','desc'].includes(dateState?.sort),'Native date sort was not persisted.');

  const second=await fourColumnLoad(a,four);
  assert.deepEqual(second.physical,fourPhysicalIds,'Second reload changed four-column physical order.');
  assert.deepEqual(second.rtl,fourRightToLeftIds,'Second reload changed four-column RTL order.');
  assert.deepEqual(second.row,fourPhysicalIds,'Second reload header/body colId alignment failed.');
  const sortAfter=await a.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="date_created"]').first().getAttribute('aria-sort');
  assert.equal(sortAfter,sortDirection,'Native sort state did not survive second reload.');

  const b=await stateCtx.newPage();
  await login(b);
  const fourB=new URL(setup.page_b_url);
  fourB.searchParams.set('wu21_header_rtl_probe','1');
  fourB.searchParams.set('wu21_four_column_probe','1');
  fourB.searchParams.set('wu21_four_column_form',String(alpha.form_id));
  const bResult=await fourColumnLoad(b,fourB);
  const gridB=bResult.grid_id;
  assert.notEqual(gridA,gridB,'Two native Inbox pages did not receive distinct Grid IDs.');
  assert.deepEqual(bResult.physical,fourPhysicalIds,'Second Grid did not receive the four-column contract.');
  await persistThroughSearch(b,'FOUR-A-002');
  const bBefore=await gridState(b,gridB);
  await a.reload({waitUntil:'networkidle'});
  await waitRows(a,20);
  const bAfterRaw=await b.evaluate(function(id){return localStorage.getItem(id);},gridB);
  assert.equal(bAfterRaw,bBefore.raw,'Grid A activity mutated Grid B state.');

  const searchMatches=await nativeSearch(a,'FOUR-A-000');
  assert.ok(searchMatches.includes(Number(setup.entry_ids[0])),'Native Search failed under four-column contract.');
  await nativeSearch(a,'');
  await a.waitForFunction(function(){return document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length===20;},null,{timeout:10000});

  const pager1=await pagerState(a);
  assert.equal(pager1.current,'1');
  assert.equal(pager1.next_disabled,false);
  await a.locator('[data-js="gflow-inbox"] [ref="btNext"]').click();
  await a.waitForFunction(function(){return document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='2';},null,{timeout:10000});
  const pager2=await pagerState(a);
  await a.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await a.waitForFunction(function(){return document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='1';},null,{timeout:10000});
  const pagerRound=await pagerState(a);

  const liveId=await addLive();
  await waitRow(a,liveId,true);
  await updateLive(liveId);
  const liveUpdatedValue=await waitLiveText(a,liveId);
  await wpEval('GFAPI::delete_entry(' + liveId + ');');
  await waitRow(a,liveId,false);

  const links=await a.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').evaluateAll(function(ls){return ls.map(function(l){return {href:l.getAttribute('href'),col_id:l.closest('.ag-cell')?.getAttribute('col-id')||null};});});
  const navigation={entry_link_count:links.length,links:links,row_click:false,keyboard_enter:false};
  if(links.length){
    const link=a.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row .gflow-inbox__entry-cell-link').first();
    await Promise.all([a.waitForURL(/page=gravityflow-inbox.*view=entry/,{timeout:30000}),link.click()]);
    navigation.link_opened=true;
    await a.goBack({waitUntil:'networkidle'});
    await waitRows(a,20);
  }else{
    const row=a.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').first();
    navigation.row_click=true;
    await row.click();
    await a.waitForTimeout(700);
    navigation.row_click_navigated=/view=entry/.test(a.url());
    if(!navigation.row_click_navigated){
      await a.goto(four.toString(),{waitUntil:'networkidle'});
      await waitRows(a,20);
      await row.focus().catch(function(){});
      await a.keyboard.press('Enter');
      await a.waitForTimeout(700);
      navigation.keyboard_enter_navigated=/view=entry/.test(a.url());
      if(navigation.keyboard_enter_navigated){
        await a.goBack({waitUntil:'networkidle'});
        await waitRows(a,20);
      }
    }
  }

  await a.evaluate(function(v){localStorage.setItem(v.l,'keep-local');sessionStorage.setItem(v.s,'keep-session');},{l:unrelatedLocalKey,s:unrelatedSessionKey});
  const isoBefore=await storage(a);
  await a.reload({waitUntil:'networkidle'});
  await waitRows(a,20);
  const isoAfter=await storage(a);
  assert.equal(isoAfter.local[unrelatedLocalKey],'keep-local','Unrelated localStorage changed.');
  assert.equal(isoAfter.session[unrelatedSessionKey],'keep-session','Unrelated sessionStorage changed.');

  const clean2=await browser.newContext({viewport:{width:1440,height:900}});
  const clean2Page=await clean2.newPage();
  await login(clean2Page);
  const clean2Before=await storage(clean2Page);
  assert.equal(Object.prototype.hasOwnProperty.call(clean2Before.local,gridA),false,'Clean browser unexpectedly has Grid A state.');
  const clean2Result=await fourColumnLoad(clean2Page,four);
  assert.deepEqual(clean2Result.physical,fourPhysicalIds,'Second clean-browser first load is unstable.');
  assert.deepEqual(clean2Result.rtl,fourRightToLeftIds,'Second clean-browser RTL order is unstable.');

  evidence.execution_status='PASS';
  evidence.qualification_result=(links.length>0||navigation.row_click_navigated||navigation.keyboard_enter_navigated)
    ? 'FOUR_COLUMN_CONTRACT_QUALIFIED'
    : 'NAVIGATION_IMPACT_REQUIRES_OWNER_DECISION';
  evidence.results={
    clean_browser:{grid_id:cleanGridId,physical:cleanResult.physical,rtl:cleanResult.rtl,row:firstNonNull(cleanResult.row),defs:cleanResult.config.defs},
    operations_mapping:{id_column:'id',header:'عملیات',five_column_physical:fiveResult.physical,entry_links_before_removal:'captured from id control'},
    historical_state:{grid_id:gridA,storage_area:authentic.area,authentic_ids:authentic.parsed.map(function(x){return String(x.colId);}),stale_ids:stale.map(function(x){return String(x.colId);}),stale_properties_preserved:true,first_upgrade: first.physical,first_upgrade_rtl:first.rtl,first_upgrade_rows:first.row,new_native_state:newVisible},
    reloads:{first:first.physical,second:second.physical,first_rtl:first.rtl,second_rtl:second.rtl},
    native_persistence:{sort_before:sortDirection,sort_after:sortAfter,persisted_sort:dateState.sort},
    search:{query:'FOUR-A-000',matches:searchMatches},
    pagination:{page1:pager1,page2:pager2,round_trip:pagerRound},
    live_refresh:{added_removed_id:liveId,native:true},
    grid_isolation:{grid_a:gridA,grid_b:gridB,distinct:gridA!==gridB,grid_b_unchanged:bAfterRaw===bBefore.raw},
    storage_isolation:{local_before:isoBefore.local[unrelatedLocalKey],local_after:isoAfter.local[unrelatedLocalKey],session_before:isoBefore.session[unrelatedSessionKey],session_after:isoAfter.session[unrelatedSessionKey]},
    navigation:navigation,
    clean_second:clean2Result,
  };
  console.log('INBOX_FOUR_COLUMN_CONTRACT_RESULT '+evidence.qualification_result);
  await clean.close();
  await clean2.close();
}catch(error){
  evidence.execution_status='FAIL';
  evidence.qualification_result=(String(error).includes('Second reload')||String(error).includes('persisted the four-column state')||String(error).includes('Historical five-column state'))?'FOUR_COLUMN_STATE_NOT_STABLE':'NOT_PROVEN';
  evidence.error=String(error.stack||error);
  throw error;
}finally{
  if(browser)await browser.close().catch(function(){});
  fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  cleanup(setup);
}

function firstNonNull(v){return v||[];}
