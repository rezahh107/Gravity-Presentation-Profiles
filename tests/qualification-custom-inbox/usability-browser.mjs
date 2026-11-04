import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, out=env.WU21_ARTIFACT_DIR, base=env.WU21_BASE_URL;
const fixture=JSON.parse(fs.readFileSync(path.join(out,'ciq2-browser-fixture.json'),'utf8'));
const headless=JSON.parse(fs.readFileSync(path.join(out,'ciq2-headless.json'),'utf8'));
assert.equal(headless.status,'PASS_BOUNDED_BATCH_AND_ROW_POLICY');
const evidence={head:fixture.head,status:'RUNNING',checks:[],measurements:{},screenshots:[],limitations:[
  'Lab-only prototype; no live operator acceptance, persistent search, sorting or automatic refresh',
  'Native Task Model, Entry Detail guard and GPP mapping are internal interfaces',
  'Three operator tasks in the browser; 47-task batching checked headlessly'
]};
const mark=(name,details={})=>evidence.checks.push({name,status:'PASS',...details});
const save=()=>fs.writeFileSync(path.join(out,'ciq2-browser.json'),JSON.stringify(evidence,null,2));
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],{env,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
async function context(browser,uid,width=1280,expired=false){
  const c=await browser.newContext({viewport:{width,height:900}});
  if(uid){
    const cookies=JSON.parse(wp(`$u=get_user_by('id',${uid});$e=time()${expired?'-3600':'+1800'};echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);`));
    await c.addCookies(cookies.map(x=>({...x,url:base})));
  }
  return c;
}
const ids=async p=>(await p.locator('[data-ciq2-entry]').evaluateAll(xs=>xs.filter(x=>!x.hidden).map(x=>Number(x.dataset.ciq2Entry)))).sort((a,b)=>a-b);
const allIds=async p=>(await p.locator('[data-ciq2-entry]').evaluateAll(xs=>xs.map(x=>Number(x.dataset.ciq2Entry)))).sort((a,b)=>a-b);
const browser=await chromium.launch({headless:true});
try {
  const c=await context(browser,fixture.officer),p=await c.newPage();
  const errors=[];p.on('pageerror',e=>errors.push(String(e)));
  const nativeChangeRequests=[];
  const monitorNativeChanges=req=>{if(req.url().includes('/inbox/changes'))nativeChangeRequests.push(req.method());};
  p.on('request',monitorNativeChanges);
  let response=await p.goto(fixture.custom_url,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  assert.deepEqual(await allIds(p),[...fixture.entries].sort((a,b)=>a-b));
  mark('assigned_tasks_visible_and_complete',{ids:fixture.entries});
  assert.equal(await p.locator('[data-js="gflow-inbox"]').count(),0);
  assert.equal(await p.locator('[data-ciq2-root]').evaluate(el=>getComputedStyle(el).direction),'rtl');
  assert.match(response.headers()['cache-control'],/no-store/);
  const html=await p.content();
  assert.ok(!html.includes('CQ_SECRET_DO_NOT_EXPOSE_'));
  assert.equal(await p.locator('[data-ciq2-name]').count(),3);
  assert.equal(await p.locator('[data-ciq2-entry="'+fixture.entries[0]+'"] [data-ciq2-name]').innerText(),'آرین & همکار کاظمی «الف»');
  assert.equal(await p.locator('img[onerror]').count(),0);
  assert.equal(await p.evaluate(()=>window.__cellq_xss),undefined);
  mark('native_final_cell_values_rendered_as_escaped_text');

  for(const width of [1280,390]){
    await p.setViewportSize({width,height:900});
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow at '+width);
    const name=await p.locator('[data-ciq2-name]').first();
    const bounds=await name.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1);
    if(width===390) assert.ok(bounds.y<900,'Student name not visible in initial viewport');
    const screenshot='ciq2-officer-'+width+'.png';
    await p.screenshot({path:path.join(out,screenshot),fullPage:width!==390});
    evidence.screenshots.push(screenshot);
    mark('readable_rtl_name_without_horizontal_scroll_'+width);
  }

  const search=p.locator('#ciq2-search');
  const start=Date.now();await search.fill('آرین');assert.deepEqual(await ids(p),[fixture.entries[0]]);
  evidence.measurements.name_filter_ms_observed=Date.now()-start;
  mark('single_name_query_filters_without_page_request');
  await search.fill('CQ_RAW_NID_C');assert.deepEqual(await ids(p),[fixture.entries[2]]);
  mark('national_id_query_filters_distinct_synthetic_value');
  await search.fill('不存在');assert.deepEqual(await ids(p),[]);
  assert.equal(await p.locator('[data-ciq2-no-results]:visible').count(),1);mark('empty_search_result_message');
  await search.fill('');assert.equal((await ids(p)).length,3);
  assert.deepEqual(nativeChangeRequests,[],'Inbox 2 used native inbox/changes during initial render or search');
  p.off('request',monitorNativeChanges);
  mark('inbox2_does_not_call_native_changes_endpoint');

  const first=p.locator('[data-ciq2-entry]').first();
  const href=await first.locator('[data-ciq2-detail]').getAttribute('href');
  const linkedId=Number(new URL(href).searchParams.get('lid'));
  assert.ok(fixture.entries.includes(linkedId));
  await first.locator('[data-ciq2-detail]').click();
  await p.waitForLoadState('networkidle');
  assert.equal(await p.locator('.gravityflow_workflow_detail').count(),1);
  mark('one_click_to_native_entry_detail');

  const viewer=await context(browser,fixture.viewer,390),vp=await viewer.newPage();
  response=await vp.goto(fixture.custom_url,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);assert.deepEqual(await allIds(vp),[]);
  assert.ok(!(await vp.content()).includes('CQ_RAW_NID_'));
  mark('viewer_sees_no_other_users_rows');
  const anonymous=await browser.newPage();response=await anonymous.goto(fixture.custom_url);
  assert.equal(response.status(),403);assert.deepEqual(await allIds(anonymous),[]);
  mark('anonymous_request_denied');

  // Reuse real host workflow transition and then click the real GET refresh.
  wp(`wp_set_current_user(${fixture.admin});$e=GFAPI::get_entry(${linkedId});$a=new Gravity_Flow_API($e['form_id']);$a->send_to_step($e,${fixture.next_step});echo 'native-transition';`);
  p.on('request',monitorNativeChanges);
  await p.goto(fixture.custom_url,{waitUntil:'networkidle'});
  const expected=fixture.entries.filter(id=>id!==linkedId).sort((a,b)=>a-b);
  assert.deepEqual(await allIds(p),expected);
  const beforeUrl=p.url();
  await p.locator('[data-ciq2-refresh]').click();await p.waitForLoadState('networkidle');
  assert.equal(new URL(p.url()).pathname,new URL(beforeUrl).pathname);
  assert.deepEqual(await allIds(p),expected);
  assert.deepEqual(nativeChangeRequests,[],'Inbox 2 used native inbox/changes on refresh');
  p.off('request',monitorNativeChanges);
  mark('real_native_transition_and_manual_server_reload_removes_task');

  // The scoped native Inbox continues to own AG Grid; never replaced.
  await p.goto(fixture.native_url,{waitUntil:'networkidle'});
  assert.equal(await p.locator('[data-js="gflow-inbox"]').count(),1);
  mark('native_inbox_retains_grid_and_workflow');
  assert.deepEqual(errors,[]);mark('no_uncaught_browser_errors');
  await c.close();await viewer.close();await anonymous.close();
  evidence.status='PASS_LAB_USABILITY_PROTOTYPE';save();
  console.log('CIQ2_BROWSER_PASS '+evidence.checks.length);
} catch(error) {
  evidence.status='FAIL';evidence.error=String(error.stack||error);save();throw error;
} finally {await browser.close();}
