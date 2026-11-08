/**
 * WU21-only research diagnostic. Observes authentic Gravity Flow / AG Grid
 * callbacks on the disposable host. Does NOT repair the parity comparator.
 * Callback wrappers delegate to originals unchanged. No vendor file edits.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, phase=env.CIQ2_PARITY_PHASE;
const dir=env.WU21_ARTIFACT_DIR, base=env.WU21_BASE_URL;
const output=path.join(dir,'ciq2-native-readiness-'+phase+'.json');
const report={status:'NOT_PROVEN',phase,head:env.GPP_WU21_REPOSITORY_SHA,
  package_sha256:env.WU21_FLOW_SHA256,scenarios:[],source:{},errors:[]};
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function sourceInventory(){
  const source=env.WU21_GRAVITYFLOW_SOURCE;
  const zip=env.WU21_FLOW_ZIP;
  assert.equal(env.WU21_FLOW_SHA256,'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404');
  assert.equal(fs.statSync(zip).size,2603034,'NATIVE_PINNED_PACKAGE_SIZE');
  assert.equal(hash(zip),env.WU21_FLOW_SHA256,'NATIVE_PINNED_PACKAGE_HASH');
  const php=path.join(source,'includes/inbox/class-inbox-service-provider.php');
  const jsdir=path.join(source,'assets/js/dist');
  const bundles=fs.readdirSync(jsdir).filter(n=>/^common-inbox\..+\.js$/.test(n));
  assert.ok(bundles.length,'NATIVE_AUTHENTIC_COMMON_INBOX_JS_MISSING');
  const p=fs.readFileSync(php,'utf8');
  const j=bundles.map(n=>fs.readFileSync(path.join(jsdir,n),'utf8')).join('\n');
  const flags=(txt,terms)=>Object.fromEntries(terms.map(s=>[s,txt.includes(s)]));
  report.source={
    php:{path:'includes/inbox/class-inbox-service-provider.php',sha256:hash(php),
      markers:flags(p,['rowData','get_inbox_tasks','grid_options','gflow_config'])},
    js:bundles.map(n=>({name:n,sha256:hash(path.join(jsdir,n))})),
    markers:flags(j,['grid_options','rowData','onGridReady','onFirstDataRendered',
      'onModelUpdated','onRowDataUpdated','applyTransaction','inbox/changes','createGrid','Grid(']),
    licensed_source_not_exported:true
  };
  save();
}
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {encoding:'utf8',env,timeout:60000});
  assert.equal(r.status,0,'NATIVE_AUTHENTICATION_SETUP_FAILED '+(r.stderr||''));
  return r.stdout.trim();
}
function cookies(uid){
  const q='$u=get_user_by("id",'+Number(uid)+');$e=time()+1800;' +
    'if(!$u)throw new RuntimeException("missing_fixture_actor");' +
    'echo wp_json_encode([["name"=>AUTH_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"auth")],' +
    '["name"=>LOGGED_IN_COOKIE,"value"=>wp_generate_auth_cookie($u->ID,$e,"logged_in")]]);';
  return JSON.parse(wp(q)).map(x=>({...x,url:base}));
}
function installTrace(instrumentOptions={}){
  // Runs before document scripts. This only observes actual Grid option callbacks.
  // It does not call an AG Grid lifecycle callback itself, nor supply row data.
  const events=[], state={api:null,events,patched:0,controlled_data_hold:!!instrumentOptions.delayInitialData};
  Object.defineProperty(window,'__wu21NativeTrace',{value:state,configurable:true});
  let config;
  const record=(name,api,gridId)=>{
    let count=null,ids=[];
    try {
      if(api && typeof api.getDisplayedRowCount==='function')
        count=api.getDisplayedRowCount();
      if(api && typeof api.forEachNodeAfterFilterAndSort==='function')
        api.forEachNodeAfterFilterAndSort(n=>{
          const id=Number(n?.data?.id);
          if(Number.isSafeInteger(id) && id>0 && ids.length<50) ids.push(id);
        });
    } catch(e) { events.push({name:'observer_error',type:e?.name||'Error'}); }
    events.push({name,gridId,displayed_count:count,ids});
    if(events.length>80)events.shift();
    if(api && typeof api.getDisplayedRowCount==='function')state.api=api;
  };
  const patch=value=>{
    for(const [gridId,grid] of Object.entries(value?.grids||{})){
      const options=grid?.grid_options;
      if(!options || options.__wu21ReadinessPatched)continue;
      Object.defineProperty(options,'__wu21ReadinessPatched',{value:true,enumerable:false});
      if(state.controlled_data_hold){
        // Negative control ONLY: native vendor source stays unchanged.
        // Delay the exact host-provided rows until the Grid API exists.
        let nativeRows=options.rowData;
        Object.defineProperty(options,'rowData',{
          configurable:true,enumerable:true,
          get(){return state.controlled_data_hold?undefined:nativeRows;},
          set(value){nativeRows=value;}
        });
        state.releaseInitialRows=()=>{
          const api=state.api;
          if(!api)throw Error('NATIVE_DELAYED_DATA_GRID_API_MISSING');
          state.controlled_data_hold=false;
          if(typeof api.setGridOption==='function')api.setGridOption('rowData',nativeRows);
          else if(typeof api.setRowData==='function')api.setRowData(nativeRows);
          else throw Error('NATIVE_DELAYED_DATA_PUBLIC_APPLY_API_MISSING');
          record('controlled_original_data_released',api,gridId);
        };
        record('controlled_original_data_withheld',null,gridId);
      }
      for(const [name,label] of [
        ['onGridReady','gridReady'],['onFirstDataRendered','firstDataRendered'],
        ['onModelUpdated','modelUpdated'],['onRowDataUpdated','rowDataUpdated'],
        ['onGridSizeChanged','gridSizeChanged'],['onDisplayedColumnsChanged','displayedColumnsChanged'],
        ['onPaginationChanged','paginationChanged']
      ]){
        const original=options[name];
        options[name]=function(event){
          let result;
          try { if(typeof original==='function')result=original.apply(this,arguments); }
          catch(err){record('original_callback_threw_'+label,event?.api,gridId);throw err;}
          record(label,event?.api,gridId);
          return result;
        };
      }
      state.patched++;
      record('grid_options_callbacks_wrapped',null,gridId);
    }
  };
  Object.defineProperty(window,'gflow_config',{
    configurable:true,enumerable:true,
    get(){return config;},
    set(value){config=value;patch(value);}
  });
}
const bundlePattern=/\/gravityflow\/assets\/js\/dist\/common-inbox\.[^/?]+\.js(?:\?|$)/;
const sorted=a=>[...a].sort((x,y)=>x-y);
function snapshotPredicate(snapshot,expected){
  const events=snapshot.events||[];
  // The pinned empty-grid run emits paginationChanged and gridSizeChanged,
  // but NOT firstDataRendered. This composite remains a candidate, subjected
  // to withheld-initial-data and failed-boot negative controls below.
  if(!events.some(e=>e.name==='paginationChanged') ||
     !events.some(e=>e.name==='gridSizeChanged'))
    throw Error('NATIVE_MODEL_RENDER_LIFECYCLE_NOT_OBSERVED');
  if(snapshot.api_count===null)
    throw Error('NATIVE_ROW_MODEL_NOT_AVAILABLE');
  if(snapshot.config?.initial_row_data_count!==expected.length)
    throw Error('NATIVE_INITIAL_ROW_DATA_NOT_AVAILABLE');
  assert.deepEqual(sorted(snapshot.api_ids),sorted(expected),'NATIVE_ROW_MODEL_MEMBERSHIP_MISMATCH');
  assert.equal(snapshot.api_count,expected.length,'NATIVE_ROW_MODEL_COUNT_MISMATCH');
  if(expected.length){
    assert.ok(events.some(e=>e.name==='firstDataRendered'&&e.displayed_count===expected.length),
      'NATIVE_NONEMPTY_DATA_RENDER_COMPLETION_MISSING');
  }else{
    assert.equal(snapshot.overlays?.no_rows_visible,true,
      'NATIVE_EMPTY_MODEL_OVERLAY_NOT_VISIBLE');
    assert.equal(snapshot.overlays?.loading_visible,false,
      'NATIVE_EMPTY_MODEL_STILL_LOADING');
  }
  return true;
}
function unguardedEmpty(snapshot){
  // Precisely the original zero-state shortcut: absent rendered rows count as empty.
  return snapshot.dom_ids.length===0;
}
async function snapshot(page){
  return page.evaluate(()=>{
    const t=window.__wu21NativeTrace;
    const root=document.querySelector('[data-js="gflow-inbox"]');
    const grid=window.gflow_config?.grids?.[root?.dataset.gridId];
    const options=grid?.grid_options;
    const fromOptions=options?.api;
    const fromGrid=grid?.api;
    const api=t?.api||fromOptions||fromGrid;
    const ids=[];
    if(api && typeof api.forEachNodeAfterFilterAndSort==='function')
      api.forEachNodeAfterFilterAndSort(n=>{
        const id=Number(n?.data?.id);
        if(Number.isSafeInteger(id)&&id>0)ids.push(id);
      });
    const noRows=root?.querySelector('.ag-overlay-no-rows-center');
    const loading=root?.querySelector('.ag-overlay-loading-center');
    const visible=node=>!!node && !!(node.offsetWidth||node.offsetHeight||node.getClientRects().length);
    const rowConfig=options?.rowData;
    return {
      trace_installed:!!t,callbacks_wrapped:t?.patched||0,events:(t?.events||[]).slice(),
      api_count:api&&typeof api.getDisplayedRowCount==='function'?api.getDisplayedRowCount():null,
      api_ids:ids,
      api_locations:{event_callback:!!t?.api,options:!!fromOptions,grid:!!fromGrid},
      api_method_names:api?['getDisplayedRowCount','forEachNodeAfterFilterAndSort',
        'isDestroyed','getModel','getRowNode','setGridOption','setRowData'].filter(k=>typeof api[k]==='function'):[],
      config:{grid_id:root?.dataset.gridId||null,has_grid:!!grid,has_options:!!options,
        initial_row_data_count:Array.isArray(rowConfig)?rowConfig.length:null,
        option_keys:Object.keys(options||{}).filter(k=>/api|ready|data|row|model|loading/i.test(k)).slice(0,20)},
      overlays:{no_rows_present:!!noRows,no_rows_visible:visible(noRows),
        loading_present:!!loading,loading_visible:visible(loading)},
      dom_ids:[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')]
        .map(n=>Number(n.getAttribute('row-id'))),
      native_container_present:!!root,grid_wrapper_present:!!root?.querySelector('.ag-root-wrapper')
    };
  });
}
async function makePage(browser,uid,delayInitialData=false){
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addCookies(cookies(uid));
  const page=await ctx.newPage(),errors=[],network=[];
  await page.addInitScript(installTrace,{delayInitialData});
  page.on('pageerror',e=>errors.push(e.name||'Error'));
  page.on('requestfailed',req=>{
    if(req.url().includes('/gravityflow/'))network.push({type:'failed',path:new URL(req.url()).pathname});
  });
  page.on('response',res=>{
    if(res.url().includes('/inbox/changes'))
      network.push({type:'native_delta_response',status:res.status()});
  });
  return {ctx,page,errors,network};
}
async function settled(browser,actor,f,oracle){
  const {ctx,page,errors,network}=await makePage(browser,f[actor]);
  const expected=oracle.roles[actor].ids;
  const result={scenario:phase+'-'+actor,expected_count:expected.length,expected_ids:expected,status:'NOT_PROVEN'};
  try {
    const response=await page.goto(f.native_url,{waitUntil:'domcontentloaded',timeout:60000});
    assert.equal(response.status(),200,'NATIVE_PAGE_HTTP');
    // Bounded wait for authentic callbacks; NO time elapsed is evidence of readiness.
    try{
      await page.waitForFunction(()=>{
        const e=window.__wu21NativeTrace?.events||[];
        return e.some(x=>x.name==='paginationChanged') &&
          e.some(x=>x.name==='gridSizeChanged');
      },null,{timeout:17000});
    }catch(e){result.wait_error='NATIVE_INITIAL_DATA_CALLBACK_TIMEOUT';}
    result.snapshot=await snapshot(page);
    result.browser_errors=errors;result.network=network.slice(-8);
    assert.equal(errors.length,0,'NATIVE_PAGE_JAVASCRIPT_ERROR');
    snapshotPredicate(result.snapshot,expected);
    result.status='PASS';
  }catch(e){result.failure=String(e.message||e).slice(0,320);}
  finally{report.scenarios.push(result);save();await ctx.close();}
  return result;
}
async function negative(browser,f,kind){
  const {ctx,page,errors,network}=await makePage(browser,f.viewer,kind==='withheld-data');
  const result={scenario:kind,expected_count:0,status:'NOT_PROVEN'};
  let matched=0,release=()=>{};
  try {
    let intercepted;
    const seen=new Promise(resolve=>{intercepted=resolve;});
    const held=new Promise(resolve=>{release=resolve;});
    if(kind==='withheld-data'){
      const response=await page.goto(f.native_url,{waitUntil:'domcontentloaded',timeout:60000});
      assert.equal(response.status(),200,'NATIVE_WITHHELD_DATA_PAGE_HTTP');
      await page.waitForFunction(()=>{
        const ev=window.__wu21NativeTrace?.events||[];
        return ev.some(x=>x.name==='paginationChanged') &&
          ev.some(x=>x.name==='gridSizeChanged');
      },null,{timeout:17000});
      result.before_release=await snapshot(page);
      assert.equal(unguardedEmpty(result.before_release),true,
        'NATIVE_WITHHELD_DATA_FALSE_EMPTY_NOT_REPRODUCED');
      assert.throws(()=>snapshotPredicate(result.before_release,[]),
        /NATIVE_INITIAL_ROW_DATA_NOT_AVAILABLE|NATIVE_EMPTY_MODEL_OVERLAY_NOT_VISIBLE|NATIVE_ROW_MODEL_NOT_AVAILABLE/,
        'NATIVE_WITHHELD_DATA_GUARD_DID_NOT_REJECT');
      result.failed_invariant='NATIVE_INITIAL_ROW_DATA_NOT_AVAILABLE_or_empty_model_unfinished';
      await page.evaluate(()=>window.__wu21NativeTrace.releaseInitialRows());
      result.after_release=await snapshot(page);
      snapshotPredicate(result.after_release,[]);
      result.resumed_success=true;
    }else if(kind==='blocked'||kind==='delayed'){
      await page.route(bundlePattern,async route=>{
        matched++;intercepted();await held;await route.continue();
      });
      const nav=page.goto(f.native_url,{waitUntil:'commit',timeout:60000});
      await Promise.race([seen,new Promise((_,reject)=>setTimeout(
        ()=>reject(Error('NATIVE_TEST_INTERCEPTION_MISSING')),12000))]);
      await nav;
      result.before_release=await snapshot(page);
      assert.equal(unguardedEmpty(result.before_release),true,
        'NATIVE_NEGATIVE_DID_NOT_REPRODUCE_FALSE_EMPTY');
      assert.throws(()=>snapshotPredicate(result.before_release,[]),
        /NATIVE_MODEL_RENDER_LIFECYCLE_NOT_OBSERVED|NATIVE_ROW_MODEL_NOT_AVAILABLE|NATIVE_INITIAL_ROW_DATA_NOT_AVAILABLE/,
        'NATIVE_NEGATIVE_GUARD_DID_NOT_REJECT');
      result.failed_invariant='NATIVE_GRID_READY_NOT_OBSERVED_or_Native_data_not_applied';
      if(kind==='delayed'){
        release();
        await page.waitForLoadState('domcontentloaded',{timeout:60000});
        await page.waitForFunction(()=>{
          const ev=window.__wu21NativeTrace?.events||[];
          return ev.some(x=>x.name==='paginationChanged') &&
            ev.some(x=>x.name==='gridSizeChanged');
        },null,{timeout:17000});
        result.after_release=await snapshot(page);
        snapshotPredicate(result.after_release,[]);
        result.resumed_success=true;
      }
    }else{
      await page.route(bundlePattern,route=>{matched++;return route.abort('failed');});
      await page.goto(f.native_url,{waitUntil:'domcontentloaded',timeout:60000});
      result.after_failure=await snapshot(page);
      assert.equal(unguardedEmpty(result.after_failure),true,
        'NATIVE_FAILED_LOAD_NOT_FALSE_EMPTY');
      assert.throws(()=>snapshotPredicate(result.after_failure,[]),
        /NATIVE_MODEL_RENDER_LIFECYCLE_NOT_OBSERVED|NATIVE_ROW_MODEL_NOT_AVAILABLE|NATIVE_INITIAL_ROW_DATA_NOT_AVAILABLE/,
        'NATIVE_FAILED_LOAD_GUARD_DID_NOT_REJECT');
      result.failed_invariant='NATIVE_GRID_READY_NOT_OBSERVED_or_Native_data_not_applied';
    }
    if(kind!=='withheld-data')
      assert.ok(matched>0,'NATIVE_TEST_INTERCEPTION_NOT_EXERCISED');
    result.intercept_count=matched;
    result.browser_errors=errors;result.network=network.slice(-8);
    result.status='PASS';
  }catch(e){result.failure=String(e.message||e).slice(0,350);}
  finally{release();report.scenarios.push(result);save();await ctx.close();}
  return result;
}
let browser;
try{
  assert.equal(base,'http://127.0.0.1:8080','NON_DISPOSABLE_TARGET');
  assert.equal(env.CIQ2_SCENARIO,'return-fifo','WRONG_SCENARIO');
  assert.ok(['initial','after-usability','after-native'].includes(phase),'INVALID_PHASE');
  sourceInventory();
  const f=JSON.parse(fs.readFileSync(path.join(dir,'ciq2-browser-fixture.json'),'utf8'));
  const oracle=JSON.parse(fs.readFileSync(path.join(dir,'ciq2-parity-oracle-'+phase+'.json'),'utf8'));
  assert.equal(oracle.status,'PASS_INDEPENDENT_HOST_ORACLE','NATIVE_ORACLE_NOT_AUTHENTIC');
  assert.equal(oracle.head,env.GPP_WU21_REPOSITORY_SHA,'NATIVE_ORACLE_HEAD_MISMATCH');
  assert.equal(f.head,oracle.head,'NATIVE_FIXTURE_HEAD_MISMATCH');
  report.versions=oracle.versions;
  browser=await chromium.launch({headless:true});
  const initial=await settled(browser,'officer',f,oracle);
  if(phase==='initial'){
    await settled(browser,'viewer',f,oracle);
    for(const kind of ['blocked','delayed','failed','withheld-data']){
      await negative(browser,f,kind);
    }
  }else if(phase==='after-native'){
    await settled(browser,'viewer',f,oracle);
  }
  const failed=report.scenarios.filter(s=>s.status!=='PASS');
  report.status=failed.length?'NOT_PROVEN':'PASS';
  report.failed_scenarios=failed.map(s=>s.scenario);
  save();
  console.log('CIQ2_NATIVE_READINESS_DIAGNOSTIC_'+report.status+' '+phase);
  if(failed.length)process.exitCode=1;
}catch(e){
  report.status='NOT_PROVEN';report.errors.push(String(e.message||e).slice(0,400));save();
  console.error('CIQ2_NATIVE_READINESS_DIAGNOSTIC_SETUP_NOT_PROVEN '+report.errors[0]);
  process.exitCode=1;
}finally{if(browser)await browser.close();}
