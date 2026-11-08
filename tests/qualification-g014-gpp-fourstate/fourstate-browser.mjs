/**
 * TEST-ONLY: real WordPress Settings API + authentic native AG Grid + GPP.
 * No fake Grid, vendor edits, CSS ablation, or production option writes.
 * All data is synthetic; never persist auth cookies, tokens, request bodies or HTML.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const PGR='311c2f5d188aec7254e11d37a351510736bd97de';
const GPP=process.env.GPP_SHA; // Exact candidate Head, independently checked out by workflow.
const FLOW='ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404';
for(const k of ['SUBJECT_SHA','GPP_SHA','HARNESS_SHA','WU008_WP_CLI','WU008_WP_PATH','WU008_BASE_URL','WU008_ADMIN_PASSWORD','G014_OUTPUT_DIR']){
  if(!process.env[k])throw Error(`ENVIRONMENT: missing ${k}`);
}
if(process.env.SUBJECT_SHA!==PGR||process.env.GPP_SHA!==GPP)throw Error('ENVIRONMENT: changed immutable source identity');
const origin=new URL(process.env.WU008_BASE_URL).origin;
const out=process.env.G014_OUTPUT_DIR;
fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8'));
if(fixture.data_class!=='SYNTHETIC_NON_PII'||fixture.subject_sha!==PGR||fixture.gpp_sha!==GPP||fixture.flow_version!=='3.1.0')throw Error('ENVIRONMENT: untrusted fixture');
for(const url of [fixture.admin_url,fixture.frontend_url,fixture.settings_url])if(new URL(url).origin!==origin)throw Error('ENVIRONMENT: fixture origin mismatch');
const report={schema:'gpp-fourstate-runtime-v1',data_class:'SYNTHETIC_NON_PII',subject:PGR,gpp:GPP,flow_sha256:FLOW,
  harness:process.env.HARNESS_SHA,wordpress:'6.8.3',gf:'3.1.1.1',flow:'3.1.0',
  started:new Date().toISOString(),browser:null,scenarios:[],controls:[],status:'NOT_PROVEN',
  source_harness:'PGR_PR115_db63ba4a9ec119e2259b3f6b92497aa2e3745fcc'};
const add=(id,status,details={})=>{const item={id,status,...details};report.scenarios.push(item);return item};
const fail=(message,category='PRODUCT_OR_HARNESS_UNDETERMINED')=>{const e=new Error(`${category}: ${message}`);e.category=category;throw e};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function wp(...args){
  const r=spawnSync('php',[process.env.WU008_WP_CLI,`--path=${process.env.WU008_WP_PATH}`,...args],
    {encoding:'utf8',env:process.env,timeout:25000});
  if(r.error||r.status!==0)fail('WP-CLI operation failed ('+args[0]+'): exit='+r.status,'ENVIRONMENT');
  return r.stdout.trim();
}
const evalWp=source=>wp('eval',source);
function status(){
  return JSON.parse(evalWp(`$s=pgr_gravity_flow_inbox_rtl_status();$v=get_option('pgr_settings',[]);echo wp_json_encode(['requested'=>$s['requested'],'host'=>$s['host'],'request_rtl'=>$s['request_rtl'],'grid_mode'=>$s['grid_mode'],'saved'=>is_array($v)?($v['gravity_flow_inbox_rtl']??null):null]);`));
}
function axisStatus(){
  const status=JSON.parse(evalWp('echo wp_json_encode(gpp_gravity_flow_inbox_axis_status());'));
  if(status.api_version!==1||status.capability!=='supported'||!['on','off'].includes(status.effective))
    fail('GPP status interface not usable: '+JSON.stringify(status),'ENVIRONMENT');
  return status;
}
async function saveGpp(page,mode){
  const pgrBefore=status().requested;
  const settingsUrl=`${origin}/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles`;
  const rsp=await page.goto(settingsUrl,{waitUntil:'domcontentloaded'});
  if(!rsp?.ok())fail('Authentic GFAddOn settings page HTTP failure','ENVIRONMENT');
  const select=page.locator('select[name="_gform_setting_inbox_axis_ltr"]');
  if(await select.count()!==1)fail('GPP axis selector not present in authentic Gravity Forms settings','ENVIRONMENT');
  await select.selectOption(mode);
  const submit=page.locator('#gform-settings button[type="submit"], #gform-settings input[type="submit"]').last();
  if(await submit.count()!==1)fail('Native Gravity Forms Settings submit not present','ENVIRONMENT');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),submit.click()]);
  await page.goto(settingsUrl,{waitUntil:'domcontentloaded'});
  const after=axisStatus();
  if(after.requested!==mode||after.effective!==mode||await select.inputValue()!==mode)
    fail('GPP native Settings UI save did not persist after reload: '+JSON.stringify(after),'ENVIRONMENT');
  if(status().requested!==pgrBefore)fail('GPP switch accidentally changed PGR option','ENVIRONMENT');
  return {saved:after.requested,effective:after.effective,pgr_unchanged:pgrBefore,
    warning:await page.locator('[data-gpp-inbox-axis-compatibility]').first().getAttribute('data-gpp-inbox-axis-compatibility')};
}
function locales(site,user){
  if(!['fa_IR','en_US'].includes(site)||!['fa_IR','en_US'].includes(user))fail('Unadmitted locale','ENVIRONMENT');
  // WU008 uses absent WPLANG for the default en_US locale; updating to en_US is not reliable.
  if(site==='en_US')wp('option','delete','WPLANG');
  else wp('option','update','WPLANG',site);
  evalWp(`$u=get_user_by('login','bootstrap_admin');if(!$u)throw new RuntimeException('Synthetic operator absent');update_user_meta($u->ID,'locale','${user}');`);
  const x=JSON.parse(evalWp(`echo wp_json_encode(['site'=>get_locale(),'user'=>get_user_locale(get_user_by('login','bootstrap_admin'))]);`));
  if(x.site!==site||x.user!==user)fail('Locale readback mismatch '+JSON.stringify(x),'ENVIRONMENT');
}
async function login(page){
  const rsp=await page.goto(`${origin}/wp-login.php`,{waitUntil:'domcontentloaded'});
  if(!rsp?.ok())fail('Cannot load genuine WordPress login','ENVIRONMENT');
  await page.locator('#user_login').fill('bootstrap_admin');
  await page.locator('#user_pass').fill(process.env.WU008_ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(u=>!u.pathname.includes('wp-login.php'),{timeout:18000}),page.locator('#wp-submit').click()]);
}
async function save(page,mode){
  const rsp=await page.goto(fixture.settings_url,{waitUntil:'domcontentloaded'});
  if(!rsp?.ok())fail('Cannot reach native PGR Settings page','ENVIRONMENT');
  const toggle=page.locator('input[name="pgr_settings[gravity_flow_inbox_rtl]"]').first();
  if(await toggle.count()!==1)fail('Required real PGR Settings API checkbox missing');
  const before={dom_checked:await toggle.isChecked(),php:status()};
  await toggle.setChecked(mode==='on');
  const submit=page.locator('form[action="options.php"] input[type="submit"]').first();
  if(await submit.count()!==1)fail('Actual WordPress options.php save form missing');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),submit.click()]);
  const saved=status();
  if(saved.requested!==mode||saved.saved!==(mode==='on'?1:0))fail('Settings API persisted wrong state: '+JSON.stringify(saved));
  await page.goto(fixture.settings_url,{waitUntil:'domcontentloaded'});
  if(await toggle.isChecked()!==(mode==='on'))fail('Settings checkbox not stable after reload');
  if(mode==='off'&&saved.grid_mode!=='not_observed')fail('PHP status pretends to observe browser');
  return {before,after:saved,confirmed_after_reload:await toggle.isChecked()};
}
function observe(){
  const host=document.querySelector('[data-js="gflow-inbox"]');
  const root=host?.querySelector('.ag-root-wrapper');
  const gridId=host?.dataset.gridId||null;
  const cfg=gridId?window.gflow_config?.grids?.[gridId]?.grid_options:null;
  const visible=el=>{if(!el)return false;const b=el.getBoundingClientRect(),s=getComputedStyle(el);return b.width>1&&b.height>1&&s.display!=='none'&&s.visibility!=='hidden'};
  const headers=[...host?.querySelectorAll('.ag-header-cell[col-id]')||[]].filter(visible).map(n=>{
    const b=n.getBoundingClientRect();return{id:n.getAttribute('col-id'),label:(n.querySelector('.ag-header-cell-text')?.textContent||'').trim().slice(0,80),x:b.x,w:b.width};});
  const rows=[...host?.querySelectorAll('.ag-center-cols-container .ag-row[row-id]')||[]].filter(visible).map(n=>({id:n.getAttribute('row-id'),y:n.getBoundingClientRect().y})).sort((a,b)=>a.y-b.y);
  const cellRects=[...host?.querySelectorAll('.ag-center-cols-container .ag-row:first-child .ag-cell[col-id]')||[]].filter(visible).map(n=>({id:n.getAttribute('col-id'),x:n.getBoundingClientRect().x,w:n.getBoundingClientRect().width}));
  const axisStyle=document.querySelector('style#gpp-srwf-gravity-flow-inbox-inline-css');
  const physicalLtrCss=axisStyle?.textContent||'';
  const exactNodes=['.ag-root-wrapper','.ag-header-viewport','.ag-center-cols-viewport','.ag-body-horizontal-scroll-viewport'];
  const intervention=exactNodes.map(selector=>({
    selector,emitted:physicalLtrCss.includes('.gpp-inbox-surface [data-js="gflow-inbox"] '+selector)
  }));
  const bar=host?.querySelector('.ag-body-horizontal-scroll-viewport');
  const axis=['.ag-root-wrapper','.ag-header-viewport','.ag-center-cols-viewport','.ag-body-horizontal-scroll-viewport'].map(selector=>{
    const el=host?.querySelector(selector);return {selector,exists:!!el,direction:el?getComputedStyle(el).direction:null,important:el?getComputedStyle(el).getPropertyValue('direction'):null};});
  const pair=headers.map(h=>({id:h.id,label:h.label,x:h.x,w:h.w,cell:cellRects.find(c=>c.id===h.id)||null}));
  return {native_mode:root?.classList.contains('ag-rtl')?'ag-rtl':root?.classList.contains('ag-ltr')?'ag-ltr':'unknown',
    grid_id:gridId,config:!!cfg,has_option:cfg?Object.prototype.hasOwnProperty.call(cfg,'enableRtl'):false,
    enableRtl:cfg?.enableRtl??null,rows:rows.map(r=>r.id),row_count:rows.length,
    total_grid_rows:typeof cfg?.api?.paginationGetRowCount==='function'?cfg.api.paginationGetRowCount():null,
    columns:headers.sort((a,b)=>a.x-b.x),alignment:pair,
    scroll:bar?{range:bar.scrollWidth-bar.clientWidth,left:bar.scrollLeft,width:bar.clientWidth}:null,
    gpp_surface:!!host?.closest('.gpp-inbox-surface'),
    axis_css:{declaration_count:(physicalLtrCss.match(/direction\s*:\s*ltr\s*!important/g)||[]).length,nodes:intervention,
      style_present:!!axisStyle},
    gpp_css_count:[...document.querySelectorAll('link[rel="stylesheet"]')].filter(el=>/\/plugins\/gravity-presentation-profiles\/assets\/css\/srwf-gravity-flow-inbox/.test(el.href)).length,
    axis,viewport_width:document.documentElement.clientWidth,document_width:document.documentElement.scrollWidth,
    loading:!!visible(host?.querySelector('.ag-overlay-loading-center'))||
      !!host?.closest('.gflow-inbox')?.querySelector('[data-js="gflow-inbox-loader"]'),
    config_rows:Array.isArray(cfg?.rowData)?cfg.rowData.length:null,
    source_locale:document.documentElement.lang,
  };
}
async function settled(page){
  try {
    await page.waitForFunction(()=>{
      const h=document.querySelector('[data-js="gflow-inbox"]');
      const r=h?.querySelector('.ag-root-wrapper');
      const cfg=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
      // The real Flow 3.1.0 JS removes its loader only after the Grid's
      // 300ms reveal + 200ms cleanup. Populated rows can exist *before*
      // that lifecycle boundary, so rows alone are not readiness.
      const vendorLoader=h?.closest('.gflow-inbox')?.querySelector('[data-js="gflow-inbox-loader"]');
      return Boolean(r&&(r.classList.contains('ag-rtl')||r.classList.contains('ag-ltr'))&&
        cfg&&Array.isArray(cfg.rowData)&&cfg.rowData.length>=20&&h.querySelectorAll('.ag-header-cell[col-id]').length>=1&&
        h.querySelectorAll('.ag-center-cols-container .ag-row').length>0&&!vendorLoader);
    },null,{timeout:25000});
  } catch (error) {
    // A timeout is not a product defect until the native Grid's actual state
    // is inspected. Never collect request bodies, cookies, tokens or row values.
    const diagnostic=await page.evaluate(()=>{
      const h=document.querySelector('[data-js="gflow-inbox"]');
      const id=h?.dataset.gridId||null;
      const opts=id?window.gflow_config?.grids?.[id]?.grid_options:null;
      const root=h?.querySelector('.ag-root-wrapper');
      return {path:location.pathname,loginForm:!!document.querySelector('#user_login'),
        documentState:document.readyState,hostCount:document.querySelectorAll('[data-js="gflow-inbox"]').length,
        gridIdPresent:!!id,gridsInConfig:Object.keys(window.gflow_config?.grids||{}).length,
        hasMatchingOptions:!!opts,mode:root?.classList.contains('ag-rtl')?'ag-rtl':root?.classList.contains('ag-ltr')?'ag-ltr':'missing',
        rowCount:h?.querySelectorAll('.ag-center-cols-container .ag-row[row-id]').length??0,
        configuredRows:Array.isArray(opts?.rowData)?opts.rowData.length:null,
        paginationPageSize:opts?.paginationPageSize??null,
        headerIds:[...h?.querySelectorAll('.ag-header-cell[col-id]')||[]].map(n=>n.getAttribute('col-id')).slice(0,15),
        loadingOverlays:h?.querySelectorAll('.ag-overlay-loading-wrapper').length??0,
        vendorLoaderPresent:!!h?.closest('.gflow-inbox')?.querySelector('[data-js="gflow-inbox-loader"]'),
        emptyOverlays:h?.querySelectorAll('.ag-overlay-no-rows-center').length??0};
    }).catch(e=>({probeFailure:String(e.name||'Error')}));
    fail('Native Grid readiness not established: '+JSON.stringify(diagnostic),'RUNTIME_READINESS_NOT_PROVEN');
  }
  // Two paint frames after the vendor removed the loader avoid sampling
  // reveal/layout transitions; subsequent geometry assertions stay strict.
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  return page.evaluate(observe);
}
function checkOrder(state){
  const rightToLeft=[...state.columns].reverse().map(c=>c.label);
  const expected=['نام دانش‌آموز','کد ملی','مدرسه و پایه','تاریخ و ساعت ثبت','عملیات'];
  if(rightToLeft.length!==5||rightToLeft.some((s,i)=>!s.includes(expected[i])))
    fail('Owner five-column order mismatch: '+JSON.stringify({rightToLeft,expected}));
  return rightToLeft;
}
function alignment(state,width){
  // AG Grid virtualizes horizontally outside the 390px viewport.
  if(state.alignment.filter(x=>x.cell).length<(width===390?1:4))fail('Insufficient header/body pairs for meaningful alignment');
  const mismatch=state.alignment.filter(x=>x.cell&&Math.abs(x.x-x.cell.x)>4);
  if(mismatch.length)fail('Header/body columns horizontally misaligned: '+JSON.stringify(mismatch));
  return {checked:state.alignment.filter(x=>x.cell).length,max_px:Math.max(0,...state.alignment.filter(x=>x.cell).map(x=>Math.abs(x.x-x.cell.x)))};
}
async function moveScroll(page,rtl,width){
  const before=await page.evaluate(observe);
  if(!before.scroll)fail('Native horizontal scrollbar absent');
  const outcome=await page.evaluate(async rtl=>{
    const b=document.querySelector('[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport');
    const start=b.scrollLeft,range=b.scrollWidth-b.clientWidth;
    const pause=()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
    b.scrollLeft=rtl?-Math.min(160,range):Math.min(160,range);
    await pause();let moved=b.scrollLeft;
    if(Math.abs(moved-start)<4){b.scrollLeft=rtl?Math.min(160,range):-Math.min(160,range);await pause();moved=b.scrollLeft;}
    const offsets=()=>{const h=document.querySelector('[data-js="gflow-inbox"]');const vis=n=>n.getBoundingClientRect().width>1;
      const headers=[...h.querySelectorAll('.ag-header-cell[col-id]')].filter(vis);
      const cells=[...h.querySelectorAll('.ag-center-cols-container .ag-row:first-child .ag-cell[col-id]')].filter(vis);
      return headers.map(x=>{const y=cells.find(c=>c.getAttribute('col-id')===x.getAttribute('col-id'));return y?Math.abs(x.getBoundingClientRect().x-y.getBoundingClientRect().x):null;}).filter(x=>x!==null);};
    // Observe any transient scroll-sync discrepancy without weakening the
    // initial/final alignment contract. This isolates a delayed Grid callback
    // from a persistent GPP/native RTL coordinate-axis conflict.
    const series=[{after_ms:0,offsets:offsets()}];
    for (const ms of [120,360,720]){
      await new Promise(done=>setTimeout(done,ms-series[series.length-1].after_ms));
      series.push({after_ms:ms,offsets:offsets()});
    }
    b.scrollLeft=start;await pause();
    return {start,moved,restored:b.scrollLeft,range,offsets:series[0].offsets,series};
  },rtl);
  if(width===390&&(outcome.range<=20||Math.abs(outcome.moved-outcome.start)<8||Math.abs(outcome.restored-outcome.start)>2))
    fail('Mobile scroll did not move and restore: '+JSON.stringify(outcome));
  if(outcome.offsets.some(v=>v>4)){
    const latest=outcome.series.at(-1).offsets;
    const persistence=latest.some(v=>v>4)?'PERSISTENT_AFTER_720MS':'TRANSIENT_BEFORE_720MS';
    fail('Header/row diverged during scroll ['+persistence+']: '+JSON.stringify(outcome));
  }
  return outcome;
}
async function keyboard(page){
  const h=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id]:visible').first();
  await h.focus();const start=await page.evaluate(()=>document.activeElement?.closest('.ag-header-cell')?.getAttribute('col-id')||null);
  await page.keyboard.press('ArrowRight');
  let end=await page.evaluate(()=>document.activeElement?.closest('.ag-header-cell')?.getAttribute('col-id')||null);
  if(!end||end===start){await h.focus();await page.keyboard.press('ArrowLeft');end=await page.evaluate(()=>document.activeElement?.closest('.ag-header-cell')?.getAttribute('col-id')||null);}
  if(!start||!end||end===start)fail('Keyboard did not traverse native headers: '+JSON.stringify({start,end}));
  return {start,end};
}
async function touchScroll(page,width){
  if(width!==390)return {status:'NOT_PROVEN',reason:'Touch control scoped to mobile'};
  const b=page.locator('[data-js="gflow-inbox"] .ag-center-cols-viewport').first();
  const rect=await b.boundingBox();if(!rect)fail('Touch viewport invisible');
  const before=(await page.evaluate(observe)).scroll;
  const x=Math.min(rect.x+rect.width-30,rect.x+rect.width*0.78),y=rect.y+Math.min(40,rect.height/2);
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*17,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
  await sleep(350);
  const after=(await page.evaluate(observe)).scroll;
  if(before?.range>20&&Math.abs((after?.left??0)-(before?.left??0))<6)fail('Native touch swipe produced no horizontal scroll');
  return {start:before?.left,end:after?.left,range:after?.range,status:'PASS'};
}
async function quickFilter(page){
  const box=page.locator('[data-js="gflow-inbox-search"]').first();
  if(await box.count()!==1)fail('Native Quick Filter missing');
  await box.click();await box.pressSequentially(fixture.marker,{delay:18});
  await page.waitForFunction(id=>{
    const x=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
    return x.length===1&&Number(x[0].getAttribute('row-id'))===id;
  },fixture.marker_entry_id,{timeout:15000});
  const result=(await page.evaluate(observe)).rows;
  await box.click();await box.press('ControlOrMeta+A');await box.press('Backspace');
  await page.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length>1,null,{timeout:15000});
  return {query_class:'SYNTHETIC_MARKER',result};
}
async function pagination(page){
  const first=(await page.evaluate(observe)).rows;
  const next=page.locator('[data-js="gflow-inbox"] .ag-paging-button[ref="btNext"]').first();
  if(await next.count()!==1||await next.isDisabled())fail('Native Next-page unavailable; fixture does not span pages');
  await next.click();await page.waitForFunction(prior=>{
    const id=document.querySelector('[data-js="gflow-inbox"] .ag-row[row-id]')?.getAttribute('row-id');
    return id&&!prior.includes(id);
  },first,{timeout:15000});
  const second=(await page.evaluate(observe)).rows;
  await page.locator('[data-js="gflow-inbox"] .ag-paging-button[ref="btPrevious"]').first().click();
  await page.waitForFunction(id=>document.querySelector('[data-js="gflow-inbox"] .ag-row[row-id]')?.getAttribute('row-id')===id,first[0],{timeout:15000});
  return {first_count:first.length,second_count:second.length,changed:JSON.stringify(first)!==JSON.stringify(second)};
}
async function sort(page){
  const id=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="id"]').first();
  if(await id.count()!==1)fail('Native ID sort header absent');
  await id.click();await sleep(350);const a=(await page.evaluate(observe)).rows;
  await id.click();await sleep(350);const b=(await page.evaluate(observe)).rows;
  if(a.length<2||b.length<2||JSON.stringify(a)===JSON.stringify(b))fail('Sort did not change native visible row order');
  return {first:a,second:b};
}
async function resizeForTransition(page){
  // Persist a real user-resized native column WITHOUT changing Owner column order.
  // This same browser context is preserved across OFF→ON→OFF and both widths.
  const options=await page.evaluate(()=>{
    const host=document.querySelector('[data-js="gflow-inbox"]');
    const cfg=window.gflow_config?.grids?.[host?.dataset.gridId]?.grid_options;
    return [...host.querySelectorAll('.ag-header-cell[col-id]')].map(el=>{
      const id=el.getAttribute('col-id');const def=cfg?.columnDefs?.find(x=>(x.colId||x.field)===id);
      return {id,width:el.getBoundingClientRect().width,resize:!!def&&def.resizable!==false,handle:!!el.querySelector('.ag-header-cell-resize')};
    }).filter(x=>x.id!=='id'&&x.width>50&&x.resize&&x.handle);
  });
  const chosen=options[0];if(!chosen)fail('No native resizable column for cross-mode state test');
  const col=page.locator(`[data-js="gflow-inbox"] .ag-header-cell[col-id="${chosen.id}"]`).first();
  await col.scrollIntoViewIfNeeded();
  const cell=await col.boundingBox();const handle=await col.locator('.ag-header-cell-resize').first().boundingBox();
  if(!cell||!handle)fail('Native resize affordance has no layout');
  const side=handle.x+handle.width/2<cell.x+cell.width/2?-1:1;
  const y=handle.y+handle.height/2;
  const x=await page.evaluate(({id,y})=>{
    const n=document.querySelector(`[data-js="gflow-inbox"] .ag-header-cell[col-id="${id}"] .ag-header-cell-resize`);
    if(!n)return null;const r=n.getBoundingClientRect();
    for(let px=r.left+.5;px<r.right;px+=.5){const hit=document.elementFromPoint(px,y);if(hit===n||n.contains(hit))return px;}
    return null;
  },{id:chosen.id,y});
  if(x===null)fail('Native resize handle not pointer-hit-testable: '+JSON.stringify({chosen,cell,handle,expectedSide:side}), 'INTERACTION_HIT_TEST_NOT_PROVEN');
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+side*65,y,{steps:12});await page.mouse.up();await sleep(450);
  const grown=(await page.evaluate(observe)).columns.find(v=>v.id===chosen.id)?.w;
  if(!Number.isFinite(grown)||grown-chosen.width<15)fail('Native transition resize did not change width');
  await page.reload({waitUntil:'domcontentloaded'});await settled(page);await sleep(650);
  const afterReload=(await page.evaluate(observe)).columns.find(v=>v.id===chosen.id)?.w;
  if(!Number.isFinite(afterReload)||Math.abs(afterReload-grown)>4)
    fail('Native saved width not restored in OFF same-mode control: '+JSON.stringify({column:chosen.id,initial:chosen.width,expanded:grown,afterReload,viewport:await page.evaluate(()=>document.documentElement.clientWidth)}));
  return {id:chosen.id,original:chosen.width,stored:grown,afterReload};
}

async function resizeAndDrag(page){
  const scope='[data-js="gflow-inbox"]';
  const candidates=await page.evaluate(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const opts=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
    return [...h?.querySelectorAll('.ag-header-cell[col-id]')||[]].map(el=>{
      const id=el.getAttribute('col-id'),def=opts?.columnDefs?.find(d=>d.field===id);
      return {id,width:el.getBoundingClientRect().width,resizable:!!def&&def.resizable!==false,movable:!!def&&def.suppressMovable!==true&&!def.lockPosition,
        resizeHandle:!!el.querySelector('.ag-header-cell-resize'),x:el.getBoundingClientRect().x};
    }).filter(x=>x.width>45&&x.id!=='id');
  });
  const source=candidates.find(x=>x.resizable&&x.movable&&x.resizeHandle);
  const dest=candidates.find(x=>x.id!==source?.id&&x.movable);
  if(!source||!dest)fail('No authentic resize/drag candidates: '+JSON.stringify(candidates));
  const src=page.locator(`${scope} .ag-header-cell[col-id="${source.id}"]`).first();
  await src.scrollIntoViewIfNeeded();
  const handle=src.locator('.ag-header-cell-resize').first();
  const hbox=await handle.boundingBox(),cbox=await src.boundingBox();
  if(!hbox||!cbox)fail('Resize handle lacks geometry');
  const sign=hbox.x+hbox.width/2<cbox.x+cbox.width/2?-1:1;
  const sy=hbox.y+hbox.height/2;
  const sx=await page.evaluate(({id,y})=>{
    const h=document.querySelector(`[data-js="gflow-inbox"] .ag-header-cell[col-id="${id}"] .ag-header-cell-resize`);
    if(!h)return null;const r=h.getBoundingClientRect();
    for(let x=r.left+.5;x<r.right;x+=.5){const target=document.elementFromPoint(x,y);if(target===h||h.contains(target))return x;}
    return null;
  },{id:source.id,y:sy});
  if(sx===null)fail('Real native resize handle not pointer-hit-testable: '+JSON.stringify({source,hbox,cbox}), 'INTERACTION_HIT_TEST_NOT_PROVEN');
  await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+sign*60,sy,{steps:12});await page.mouse.up();await sleep(450);
  const newWidth=(await page.evaluate(observe)).columns.find(x=>x.id===source.id)?.w;
  if(!Number.isFinite(newWidth)||newWidth-source.width<15)fail('Real native resize was a no-op: '+JSON.stringify({source,newWidth}));
  const before=(await page.evaluate(observe)).columns.map(x=>x.id);
  const dst=page.locator(`${scope} .ag-header-cell[col-id="${dest.id}"]`).first();
  const destBox=await dst.boundingBox(),srcBox=await src.boundingBox();
  if(!destBox||!srcBox)fail('Drag geometry not measurable');
  const start={x:srcBox.x+srcBox.width/2,y:srcBox.y+srcBox.height/2};
  const finish={x:destBox.x+(destBox.x>srcBox.x?destBox.width-6:6),y:destBox.y+destBox.height/2};
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(start.x+(finish.x>start.x?28:-28),start.y,{steps:5});
  await page.mouse.move(finish.x,finish.y,{steps:25});await page.mouse.up();await sleep(450);
  const after=(await page.evaluate(observe)).columns.map(x=>x.id);
  if(JSON.stringify(before)===JSON.stringify(after))fail('Actual mouse drag did not change native column order');
  await page.reload({waitUntil:'domcontentloaded'});await settled(page);await sleep(700);
  const restored=await page.evaluate(observe);
  const rw=restored.columns.find(x=>x.id===source.id)?.w;
  if(!Number.isFinite(rw)||Math.abs(rw-newWidth)>4||JSON.stringify(restored.columns.map(x=>x.id))!==JSON.stringify(after))
    fail('Saved column state not restored after reload: '+JSON.stringify({expectedWidth:newWidth,actual:rw,before,after,reloaded:restored.columns.map(x=>x.id)}));
  return {source:source.id,destination:dest.id,initialWidth:source.width,afterResize:newWidth,reloadWidth:rw,before,after};
}
async function liveRefresh(page){
  const before=await page.evaluate(observe);
  const beforeTotal=before.total_grid_rows;
  if(!Number.isInteger(beforeTotal)||beforeTotal<20)fail('Native row-count API unavailable for Live Refresh');
  const id=Number(evalWp(`$m=get_option('gpp_wu21_fixture_manifest');$f=$m['forms'][0];$u=(int)$m['operator']['id'];$seed=GFAPI::get_entry((int)$m['entry_ids'][0]);$a=['form_id'=>(int)$f['form_id'],'created_by'=>$u,(string)$f['first_name_field_id']=>'G014LIVEPROBE',(string)$f['last_name_field_id']=>'Synthetic',(string)$f['photo_field_id']=>($seed[(string)$f['photo_field_id']]??''),(string)$f['national_id_field_id']=>'SYN-G014-LIVE',(string)$f['grade_group_field_id']=>'Grade',(string)$f['school_field_id']=>'School'];$id=GFAPI::add_entry($a);if(is_wp_error($id))throw new RuntimeException('Live fixture failed');(new Gravity_Flow_API((int)$f['form_id']))->process_workflow($id);echo (int)$id;`));
  if(!Number.isInteger(id)||id<1)fail('Live fixture did not produce an Entry ID','ENVIRONMENT');
  let observed=false;
  try{await page.waitForFunction(expected=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const cfg=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
    return Number(cfg?.api?.paginationGetRowCount?.())>expected;
  },beforeTotal,{timeout:85000,polling:500});observed=true}catch{}
  const after=await page.evaluate(observe);
  if(!observed)fail('Live Refresh did not advance native row count: '+JSON.stringify({beforeTotal,after:after.total_grid_rows,newSyntheticId:id}));
  return {before:beforeTotal,after:after.total_grid_rows,synthetic_id:id};
}
async function nativeControlWithoutGpp(browser){
  locales('fa_IR','fa_IR');
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  let deactivated=false;
  const page=await context.newPage();
  try{
    await login(page);
    await save(page,'on');
    wp('plugin','deactivate','gravity-presentation-profiles');deactivated=true;
    const rsp=await page.goto(fixture.frontend_url,{waitUntil:'domcontentloaded'});
    if(!rsp?.ok())fail('Native control frontend HTTP failure','ENVIRONMENT');
    const state=await settled(page);
    if(state.native_mode!=='ag-rtl'||state.enableRtl!==true||state.gpp_surface)
      fail('Positive native RTL / negative GPP-absent control failed: '+JSON.stringify({mode:state.native_mode,option:state.enableRtl,gpp:state.gpp_surface}));
    wp('plugin','activate','gravity-presentation-profiles');deactivated=false;
    await save(page,'off');
    report.controls.push({id:'native-on-with-gpp-absent',status:'PASS',mode:state.native_mode,
      enableRtl:state.enableRtl,gpp_surface:state.gpp_surface,restored:status().requested});
  }catch(e){
    const filename='native-on-no-gpp-diagnostic.jpg';
    try{await page.screenshot({path:path.join(out,filename),type:'jpeg',quality:65,fullPage:false,timeout:5000});}catch{}
    report.controls.push({id:'native-on-with-gpp-absent',status:'NOT_PROVEN',
      category:e.category||'RUNTIME_NOT_PROVEN',reason:String(e.message||e).slice(0,1700),
      image:fs.existsSync(path.join(out,filename))?filename:null});
    throw e;
  }finally{
    if(deactivated)wp('plugin','activate','gravity-presentation-profiles');
    await context.close();
  }
}

async function run(){
  const browser=await chromium.launch({headless:true});report.browser=browser.version();
  try{
    await nativeControlWithoutGpp(browser);
    const baseline=axisStatus();
    if(baseline.effective!=='on')fail('Migrated GPP missing-setting default does not preserve ON','ENVIRONMENT');
    report.controls.push({id:'legacy-missing-setting-default-on',status:'PASS',effective:baseline.effective,requested:baseline.requested});
    for(const axisMode of ['on','off']){
      const adminContext=await browser.newContext({viewport:{width:1280,height:900}});
      const settingsPage=await adminContext.newPage();
      await login(settingsPage);
      const saveResult=await saveGpp(settingsPage,axisMode);
      report.controls.push({id:'gpp-switch-'+axisMode,status:'PASS',save:saveResult});
      await adminContext.close();
    for(const site of ['fa_IR','en_US'])for(const user of ['fa_IR','en_US']){
      locales(site,user);
      const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});
      const page=await context.newPage();await login(page);
      const identity=`${site}-${user}`;
      let carriedColumn=null;
      for(const [index,mode] of ['off','on','off'].entries()){
        const transition=`${identity}-${index}-${mode}`;
        const saved=await save(page,mode);
        report.controls.push({id:`save-${transition}`,status:'PASS',saved});
        for(const width of [1280,390]){
          await page.setViewportSize({width,height:width===1280?900:844});
          for(const surface of ['admin','frontend']){
            const id=`gpp-${axisMode}-${transition}-${surface}-${width}`;
            const info={gpp_axis:axisMode,site,user,transition,mode,width,surface};
            const errors=[],network=[];
            const onError=e=>errors.push({kind:'pageerror',type:String(e.name||'Error').slice(0,40)});
            const onConsole=m=>{if(m.type()==='error')errors.push({kind:'console-error',type:m.location()?.url?'script':'unknown'});};
            const onFailed=r=>{let url;try{url=new URL(r.url()).pathname}catch{url='invalid'}network.push({path:url,reason:String(r.failure()?.errorText||'').slice(0,100)});};
            const onResponse=r=>{if(r.status()>=400){let u;try{u=new URL(r.url()).pathname}catch{u='invalid'}if(!u.endsWith('/favicon.ico'))network.push({path:u,status:r.status()});}};
            page.on('pageerror',onError);page.on('console',onConsole);page.on('requestfailed',onFailed);page.on('response',onResponse);
            try{
              const rsp=await page.goto(surface==='admin'?fixture.admin_url:fixture.frontend_url,{waitUntil:'domcontentloaded'});
              if(!rsp?.ok())fail(`Native ${surface} Inbox HTTP status=${rsp?.status()}`,'ENVIRONMENT');
              await settled(page);
              const state=await page.evaluate(observe);
              const expectedRtl=mode==='on'&&(surface==='admin'?user:site)==='fa_IR';
              if(state.native_mode!==(expectedRtl?'ag-rtl':'ag-ltr'))fail('AG Grid actual mode mismatch: '+JSON.stringify({expectedRtl,state:state.native_mode}));
              if(mode==='on'&&(!state.has_option||state.enableRtl!==expectedRtl))fail('Native option never reached constructor');
              if(mode==='off'&&state.has_option)fail('OFF unexpectedly wrote enableRtl');
              if(state.row_count<1||state.config_rows<20)fail('Native synthetic populated tasks not present');
              if(surface==='frontend'&&(!state.gpp_surface||state.gpp_css_count<1))fail('GPP presentation/css not active; cannot claim coexistence');
              const emitted=state.axis_css?.nodes.filter(x=>x.emitted).length??0;
              const declarations=state.axis_css?.declaration_count??0;
              if(axisMode==='on'&&(emitted!==4||declarations!==1))
                fail('GPP ON did not emit exactly the admitted four-node CSS: '+JSON.stringify(state.axis_css));
              if(axisMode==='off'&&(emitted!==0||declarations!==0))
                fail('GPP OFF still emits an owned physical LTR direction declaration: '+JSON.stringify(state.axis_css));
              if(axisStatus().effective!==axisMode)fail('GPP preference changed without authorization','ENVIRONMENT');
              if(width===1280&&state.columns.length!==5)fail('Exactly five native desktop columns are required: '+JSON.stringify(state.columns));
              if(width===390&&state.columns.length<1)fail('No native mobile columns rendered');
              if(site==='fa_IR'&&user==='fa_IR'&&surface==='frontend'&&width===1280&&carriedColumn){
                const currentWidth=state.columns.find(x=>x.id===carriedColumn.id)?.w;
                if(!Number.isFinite(currentWidth)||Math.abs(currentWidth-carriedColumn.stored)>4)
                  fail('OFF→ON→OFF native saved-width transition broke: '+JSON.stringify({carriedColumn,currentWidth,mode,index}));
              }
              const order=surface==='frontend'&&site==='fa_IR'&&width===1280?checkOrder(state):state.columns.map(x=>x.label);
              const aligned=alignment(state,width);
              const scroll=await moveScroll(page,expectedRtl,width);
              const key=await keyboard(page);
              const touch=width===390?await touchScroll(page,width):null;
              const advanced={};
              // Expensive native interactions only on one fully qualified real Grid
              // per mode. Other 48 cases verify Grid init, order, geometry, scroll.
              if(site==='fa_IR'&&user==='fa_IR'&&surface==='frontend'&&width===1280){
                advanced.sort=await sort(page);
                advanced.filter=await quickFilter(page);
                advanced.pagination=await pagination(page);
                if(index===0){carriedColumn=await resizeForTransition(page);advanced.transition_state=carriedColumn;}
                else advanced.transition_state={expected:carriedColumn,observed:state.columns.find(x=>x.id===carriedColumn?.id)?.w};
                // Drag/resize/persist tests use an isolated browser context below,
                // never rewriting the default-state context used by OFF→ON→OFF.
                if(mode==='on'||index===0)advanced.live_refresh=await liveRefresh(page);
                const isolated=await browser.newContext({viewport:{width:1280,height:900}});
                try{
                  const independent=await isolated.newPage();
                  const nestedErrors=[];
                  independent.on('pageerror',e=>nestedErrors.push('pageerror:'+String(e.name||'Error')));
                  independent.on('requestfailed',r=>nestedErrors.push('network:'+String(r.failure()?.errorText||'unknown').slice(0,60)));
                  await login(independent);
                  const response=await independent.goto(fixture.frontend_url,{waitUntil:'domcontentloaded'});
                  if(!response?.ok())fail('Isolated drag/resize Grid HTTP failure','ENVIRONMENT');
                  await settled(independent);
                  advanced.drag_resize_restore=await resizeAndDrag(independent);
                  if(nestedErrors.length)fail('Isolated drag/resize browser errors: '+JSON.stringify(nestedErrors));
                }finally{await isolated.close();}
              }
              if(errors.length||network.length)fail('Browser errors: '+JSON.stringify({errors,network}));
              const file=`${id}.jpg`;
              await page.screenshot({path:path.join(out,file),type:'jpeg',quality:67,fullPage:false});
              const mobileCoverage=width===390&&state.columns.length<5?'NOT_PROVEN':'PASS';
              add(id,mobileCoverage,{...info,mobile_column_coverage:mobileCoverage,column_contract:surface==='frontend'?'GPP_FORM_SCOPED_FIVE':'NATIVE_AGGREGATE_ADMIN',grid:state,order,aligned,scroll,key,touch,advanced,image:file});
            }catch(e){
              const classification=e.category||(/ENVIRONMENT:/.test(String(e))?'ENVIRONMENT':'PRODUCT_OR_HARNESS_UNDETERMINED');
              const failureImage=`${id}-failure.jpg`;
              try{await page.screenshot({path:path.join(out,failureImage),type:'jpeg',quality:60,fullPage:false,timeout:3500});}
              catch{/* A missing screenshot must never mask the original failure. */}
              const failureGrid=await page.evaluate(observe).catch(()=>null);
              add(id,'FAIL',{...info,classification,reason:String(e.message||e).slice(0,1400),
                grid:failureGrid,errors,network,
                failure_image:fs.existsSync(path.join(out,failureImage))?failureImage:null});
              // Independent cases must still run after a product/interaction
              // failure. Only a broken environment invalidates the next case.
              if(classification==='ENVIRONMENT')throw e;
              continue;
            }finally{
              page.off('pageerror',onError);page.off('console',onConsole);page.off('requestfailed',onFailed);page.off('response',onResponse);
            }
          }
        }
      }
      await context.close();
    }
    }
    // Never let a later successful case erase earlier FAIL evidence.
    if(report.scenarios.length!==96||report.scenarios.some(s=>s.status!=='PASS'))
      fail('Incomplete G014/GPP acceptance matrix: '+JSON.stringify({
        total:report.scenarios.length,failed:report.scenarios.filter(s=>s.status==='FAIL').map(s=>s.id)}),
        'QUALIFICATION_INCOMPLETE');
    report.status='PASS';
  }catch(e){
    report.status='FAIL';
    report.failure_category=e.category||'PRODUCT_OR_HARNESS_UNDETERMINED';
    report.failure_reason=String(e.message||e).slice(0,1400);
    throw e;
  }finally{
    report.completed=new Date().toISOString();
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    await browser.close();
  }
}
try{await run();console.log('GPP_FOURSTATE_REAL_BROWSER_MATRIX_PASS cases='+report.scenarios.length)}
catch(e){console.error('GPP_FOURSTATE_MATRIX_FAIL '+String(e.message||e).slice(0,1700));process.exitCode=1}
