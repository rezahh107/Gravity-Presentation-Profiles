/**
 * Disposable, authentic Chromium/PHP-cost comparison.
 * Observe the native UI only; do not forge, replay, or call its internal endpoint.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, dir=env.WU21_ARTIFACT_DIR, base=env.WU21_BASE_URL;
assert.equal(base,'http://127.0.0.1:8080');
const workload=Number(process.argv[2]);
assert.ok([501,2000].includes(workload));
const file=path.join(dir,'ciq2-native-cost-'+workload+'.json');
const serverLog=path.join(dir,'ciq2-native-cost-server.ndjson');
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'ciq2-operational-fixture.json'),'utf8'));
const report={head:env.GPP_WU21_REPOSITORY_SHA,workload,status:'RUNNING',
  runtime:{wordpress:'6.8.3',php:'8.2.35',gravity_forms:'3.1.1.1',gravity_flow:'3.1.0',flow_sha256:env.WU21_FLOW_SHA256},
  scenarios:[],limitations:[
    'Single-threaded disposable WP-CLI PHP server: not a production concurrency capacity test.',
    'Peak PHP memory includes WordPress/bootstrap, not isolated endpoint allocation.',
    'Native DOM can virtualize rows; DOM count does not certify complete task membership.',
    'Natural polling cadence is preserved, so equal time windows contain unequal request counts.',
    'Native internal endpoint is observed only through its legitimate authenticated UI.'
  ]};
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {encoding:'utf8',env,timeout:120000});
  assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();
}
const jsonWP=code=>JSON.parse(wp(code));
let independentIds=[];
function nativeInternalSnapshot(){
  const root=document.querySelector('[data-js="gflow-inbox"]');
  const data=window.gflow_config?.grids?.[root?.dataset.gridId]?.grid_options?.rowData;
  return {hasRowData:Array.isArray(data),ids:Array.isArray(data)?data.map(x=>Number(x.id)):[],
    renderedCount:root?.querySelectorAll('.ag-center-cols-container .ag-row[row-id]').length??null};
}
function normalizedIdentity(snapshot){
  const actual=[...snapshot.ids].sort((a,b)=>a-b),expected=[...independentIds].sort((a,b)=>a-b);
  return {hasRowData:snapshot.hasRowData,rowCount:actual.length,renderedCount:snapshot.renderedCount,
    unique:new Set(actual).size===actual.length,equals_independent_host_ids:JSON.stringify(actual)===JSON.stringify(expected)};
}
function readServer(){
  if(!fs.existsSync(serverLog))return [];
  return fs.readFileSync(serverLog,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
}
function summary(records,kind){
  const a=records.filter(x=>x.kind===kind);
  return {request_count:a.length,query_total:a.reduce((n,x)=>n+(x.db_queries||0),0),
    records:a.map(x=>({status:x.http_status,queries:x.db_queries,
      server_elapsed_ms:x.elapsed_since_request_ms,php_peak_bytes:x.php_peak_bytes}))};
}
function sourceTrace(){
  const root=env.WU21_GRAVITYFLOW_SOURCE;
  const ep=path.join(root,'includes/inbox/endpoints/refresh-inbox-items/class-endpoint.php');
  const text=fs.readFileSync(ep,'utf8');
  const jsdir=path.join(root,'assets/js/dist');
  const jsfiles=fs.readdirSync(jsdir).filter(x=>/^common-inbox\..+\.js$/.test(x));
  assert.ok(jsfiles.length>0,'authentic common-inbox bundle absent');
  const js=jsfiles.map(x=>fs.readFileSync(path.join(jsdir,x),'utf8')).join('\n');
  const terms=['get_inbox_entries','get_inbox_tasks','current_ids','search_args',
    "'add'","'remove'","'update'"];
  const jsTerms=['inbox/changes','setInterval','setTimeout','applyTransaction','fetch_interval','current_ids','search_args'];
  const line=(src,idx)=>idx<0?null:src.slice(0,idx).split('\n').length;
  report.source={php_file:'includes/inbox/endpoints/refresh-inbox-items/class-endpoint.php',
    js_files:jsfiles,php_hits:terms.map(term=>({term,line:line(text,text.indexOf(term))})),
    js_hits:jsTerms.map(term=>({term,found:js.includes(term)})),
    private_wire_protocol:true,
    native_auth_and_task_scope_trace:'requires full source/permission review; no vendor mutation'};
}
function cookies(uid){
  const code='$u=get_user_by("id",'+uid+');$e=time()+3600;echo wp_json_encode([["name",AUTH_COOKIE,"value",wp_generate_auth_cookie($u->ID,$e,"auth")],["name",LOGGED_IN_COOKIE,"value",wp_generate_auth_cookie($u->ID,$e,"logged_in")]]);';
  return jsonWP(code).map(([name,,,value])=>({name,value,url:base}));
}
function correctCookies(uid){
  const code='$u=get_user_by("id",'+uid+');$e=time()+3600;echo wp_json_encode([["name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"auth")],["name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"logged_in")]]);';
  return jsonWP(code).map(x=>({...x,url:base}));
}
function scope(){
  return jsonWP('$f=get_option("cellq_fixture");wp_set_current_user((int)$f["officer"]);$total=0;$a=Gravity_Flow_API::get_inbox_entries(apply_filters("gravityflow_inbox_args",array_merge(Gravity_Flow_Inbox::get_defaults(),["form_id"=>(int)$f["form_id"],"paging"=>["offset"=>0,"page_size"=>1]])),$total);echo wp_json_encode(["count"=>$total,"native_url"=>$f["native_url"],"inbox2_url"=>get_permalink((int)get_option("ciq2_page_id"))]);');
}
function removeExactSyntheticOverflow(){
  const code='$f=get_option("cellq_fixture");$q=["field_filters"=>[["key"=>"1","value"=>"OP_BOUND_OVERFLOW"]]];$rows=GFAPI::get_entries((int)$f["form_id"],$q);if(is_wp_error($rows)||count($rows)!==1)throw new RuntimeException("Overflow fixture not uniquely found");$r=GFAPI::delete_entry((int)$rows[0]["id"]);if(is_wp_error($r))throw new RuntimeException("Overflow deletion failed");echo "OK";';
  assert.equal(wp(code),'OK');
}
async function waitFor(fn,limit,label){
  const start=Date.now();while(Date.now()-start<limit){const v=await fn();if(v)return v;await sleep(200)}
  throw Error('Timed out waiting for authentic '+label);
}
async function capture(browser,kind,url,ms){
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addCookies(correctCookies(fixture.officer));
  const page=await ctx.newPage();
  const transactions=[],starts=new WeakMap(),errors=[];
  const suffix=kind==='native'?'/wp-json/gravityflow/internal/inbox/changes':'/wp-admin/admin-ajax.php';
  const match=req=>req.url().includes(suffix) &&
    (kind==='native'||(req.postData()||'').includes('ciq2_read'));
  page.on('pageerror',e=>errors.push(String(e).slice(0,300)));
  page.on('request',req=>{if(match(req))starts.set(req,Date.now())});
  page.on('requestfailed',req=>{if(match(req))transactions.push({status:'NETWORK_FAILURE',error:req.failure()?.errorText})});
  page.on('response',async res=>{
    if(!match(res.request()))return;
    let bytes=null,ops=null;
    try{
      const b=await res.body();bytes=b.length;
      const obj=JSON.parse(b.toString('utf8'));
      if(kind==='native'){
        ops=Object.fromEntries(['add','remove','update'].map(k=>[k,Array.isArray(obj[k])?obj[k].length:null]));
        ops.wire_types=Object.fromEntries(['add','remove','update'].map(k=>
          [k,Array.isArray(obj[k])?'array':obj[k]===null?'null':typeof obj[k]]));
        ops.object_counts=Object.fromEntries(['add','remove','update'].map(k=>
          [k,obj[k]&&typeof obj[k]==='object'?Object.keys(obj[k]).length:null]));
      }else ops={count:obj.data?.count??null,success:obj.success??null};
    }catch(e){ops={parse_failed:true}}
    transactions.push({status:res.status(),browser_elapsed_ms:Date.now()-(starts.get(res.request())??Date.now()),
      response_bytes:bytes,ops});
  });
  const before=readServer().length,start=Date.now();
  try{
    const arrival=await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
    assert.equal(arrival.status(),200,kind+' initial HTTP failed');
    if(kind==='native'){
      await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').waitFor({timeout:120000});
    }else{
      await page.locator('[data-ciq2-root]').waitFor({timeout:120000});
      const rows=await page.locator('[data-ciq2-entry]').count();
      assert.equal(rows,workload,'Inbox2 initial task-ID cardinality mismatch');
    }
    const initialMs=Date.now()-start;
    const nativeConfig=kind==='native'?await page.evaluate(()=>
      Object.values(window.gflow_config?.grids||{}).map(x=>({
        fetch_enabled:x.fetch_enabled,fetch_interval:x.fetch_interval
      }))):null;
    const initialInternal=kind==='native'?normalizedIdentity(await page.evaluate(nativeInternalSnapshot)):null;
    const view={initial_ms:initialMs,internal_task_id_integrity:initialInternal,visible_dom_rows:await page.locator(
      kind==='native'?'[data-js="gflow-inbox"] .ag-row[row-id]':'[data-ciq2-entry]').count(),
      native_config:nativeConfig};
    const min=kind==='native'?2:3;
    await waitFor(()=>transactions.filter(x=>x.status===200).length>=min,ms,kind+' '+min+' polls');
    const elapsed=Date.now()-start;
    const logs=readServer().slice(before);
    const endpoint=kind==='native'?'native_delta':'inbox2_delta';
    const postInternal=kind==='native'?normalizedIdentity(await page.evaluate(nativeInternalSnapshot)):null;
    const result={kind,view,post_refresh_task_id_integrity:postInternal,window_ms:elapsed,transactions,initial_server:summary(logs,kind+'_initial'),
      refresh_server:summary(logs,endpoint),page_errors:errors};
    assert.ok(result.refresh_server.request_count>=min,
      kind+' browser polls have no matching real PHP request measurements');
    report.scenarios.push(result);save();
    return result;
  }finally{await ctx.close()}
}
let browser;
try{
  assert.equal(process.env.GITHUB_REPOSITORY,'rezahh107/Gravity-Presentation-Profiles');
  sourceTrace();
  if(workload===2000)removeExactSyntheticOverflow();
  const s=scope();
  assert.equal(s.count,workload,'actual authorized task count differs from benchmark');
  report.scope={authorized_host_task_count:s.count,operator:'synthetic_officer',same_scope_for_both:true};
  independentIds=jsonWP('$f=get_option("cellq_fixture");wp_set_current_user((int)$f["officer"]);$ids=[];for($o=0;$o<'+workload+';$o+=40){$rows=cellq_model()->get_inbox_tasks(cellq_args(["form_id"=>(int)$f["form_id"]],$o,40));foreach($rows as $row)$ids[]=(int)$row["id"];}echo wp_json_encode($ids);');
  assert.equal(independentIds.length,workload,'native Task Model oracle cardinality');
  assert.equal(new Set(independentIds).size,workload,'native Task Model oracle uniqueness');
  browser=await chromium.launch({headless:true});
  const native=await capture(browser,'native',s.native_url,150000);
  const inbox2=await capture(browser,'inbox2',s.inbox2_url,150000);
  report.comparison={
    native_refresh_db_queries:native.refresh_server.query_total,
    native_refresh_requests:native.refresh_server.request_count,
    inbox2_refresh_db_queries:inbox2.refresh_server.query_total,
    inbox2_refresh_requests:inbox2.refresh_server.request_count,
    note:'Different natural intervals; compare per-request and actual window separately, not unadjusted totals.'
  };
  report.status=native.page_errors.length?'COST_MEASURED_NATIVE_BROWSER_ERROR_OBSERVED':
    'PASS_MEASURED_BOTH_AUTHENTIC_UI_PATHS';save();
  console.log('CIQ2_NATIVE_COST_PASS '+JSON.stringify({workload,comparison:report.comparison,
    native_row_integrity:native.post_refresh_task_id_integrity,native_errors:native.page_errors.length,
    native_median_request_ms:native.refresh_server.records.map(x=>x.server_elapsed_ms),
    inbox2_request_ms:inbox2.refresh_server.records.map(x=>x.server_elapsed_ms)}));
}catch(e){
  report.status='INCOMPLETE';report.error=String(e.stack||e).slice(0,1700);save();
  console.error('CIQ2_NATIVE_COST_INCOMPLETE '+report.error);
  process.exitCode=1;
}finally{if(browser)await browser.close()}
