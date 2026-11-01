// Authentic G-014 qualification in the disposable, pinned WU21 GPP laboratory.
// This diagnostic changes no production plugin source, host/vendor or fixtures.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const e=process.env, required=['WU21_WP_CLI','WU21_WP_PATH','WU21_BASE_URL','WU21_ARTIFACT_DIR',
  'G014_PGR_SOURCE_SHA','GPP_WU21_REPOSITORY_SHA'];
for(const key of required)if(!e[key])throw Error('Missing lab provenance: '+key);
const dir=path.join(e.WU21_ARTIFACT_DIR,'g014-coexistence');
fs.mkdirSync(dir,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(e.WU21_ARTIFACT_DIR,'fixture-manifest.json'),'utf8'));
if(fixture.base_entry_count<25||!fixture.frontend_inbox_url)
  throw Error('Authentic populated GPP fixture unavailable');
const php=code=>execFileSync('php',[e.WU21_WP_CLI,'--path='+e.WU21_WP_PATH,'eval',code],
  {encoding:'utf8',env:e,timeout:45000}).trim();
const original=JSON.parse(php("$u=get_user_by('login','bootstrap_admin');"
  +"if(!$u)throw new RuntimeException('No GPP operator');"
  +"echo wp_json_encode(['found'=>false!==get_option('pgr_settings',false),"
  +"'settings'=>get_option('pgr_settings',false),'language'=>get_option('WPLANG',false),"
  +"'user'=>get_user_meta($u->ID,'locale',true)]);"));
const origin=new URL(e.WU21_BASE_URL).origin;
const routes=[{name:'frontend',url:fixture.frontend_inbox_url},
  {name:'admin',url:origin+'/wp-admin/admin.php?page=gravityflow-inbox'}];
const report={schema:'G014_GPP_AUTHENTIC_LAB_V2',pgrHead:e.G014_PGR_SOURCE_SHA,
  gppHead:e.GPP_WU21_REPOSITORY_SHA,fixtureEntries:fixture.base_entry_count,
  runtime:JSON.parse(fs.readFileSync(path.join(e.WU21_ARTIFACT_DIR,'runtime.json'),'utf8')),
  status:'INCOMPLETE',cases:[],differentials:[]};
const write=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true});
const snap=page=>page.evaluate(()=>{
  const host=document.querySelector('[data-js="gflow-inbox"]'),id=host?.dataset.gridId;
  const opts=window.gflow_config?.grids?.[id]?.grid_options;
  const grid=host?.querySelector('.ag-root-wrapper');
  const selectors=['.ag-root-wrapper','.ag-header-viewport','.ag-center-cols-viewport',
    '.ag-body-horizontal-scroll-viewport'];
  const directions=Object.fromEntries(selectors.map(s=>{
    const n=host?.querySelector(s);return [s,n?getComputedStyle(n).direction:null];
  }));
  const bar=host?.querySelector('.ag-body-horizontal-scroll-viewport');
  const headings=[...host?.querySelectorAll('.ag-header-cell[col-id]')||[]]
    .map(n=>({id:n.getAttribute('col-id'),x:n.getBoundingClientRect().x,
      width:n.getBoundingClientRect().width})).sort((a,b)=>a.x-b.x);
  return {id,hasOption:Object.prototype.hasOwnProperty.call(opts||{},'enableRtl'),
    option:opts?.enableRtl,agRtl:!!grid?.classList.contains('ag-rtl'),
    agLtr:!!grid?.classList.contains('ag-ltr'),rows:opts?.rowData?.length||0,
    pageSize:opts?.paginationPageSize,headers:headings,directions,
    configuredColumns:(opts?.columnDefs||[]).map(c=>({id:c.field||c.colId,hide:c.hide,resizable:c.resizable})),
    renderedRows:host?.querySelectorAll('.ag-center-cols-container > .ag-row').length||0,
    renderedHeaders:headings.length,
    gridPresent:!!grid,searchPresent:!!document.querySelector('[data-js="gflow-inbox-search"]'),
    pagerPresent:!!host?.querySelector('.ag-paging-panel'),
    viewport:{width:innerWidth,height:innerHeight},bodyClasses:document.body.className,
    gppSurface:!!document.querySelector('.gpp-inbox-surface'),
    scrollRange:bar?bar.scrollWidth-bar.clientWidth:null,scrollLeft:bar?.scrollLeft??null};
});
const wait=page=>page.waitForFunction(()=>{
  const host=document.querySelector('[data-js="gflow-inbox"]');
  const opts=window.gflow_config?.grids?.[host?.dataset.gridId]?.grid_options;
  // AG Grid virtualizes horizontally: 390px must not require five mounted headers.
  // This still fails closed when real data, the native Grid or native rows are absent.
  return opts?.rowData?.length>=25&&!!host?.querySelector('.ag-root-wrapper')&&
    host?.querySelectorAll('.ag-header-cell[col-id]').length>0&&
    host?.querySelectorAll('.ag-center-cols-container > .ag-row').length>0;
},null,{timeout:30000});
const ids=page=>page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row')
  .evaluateAll(ns=>ns.map(n=>Number(n.getAttribute('row-id'))).filter(Number.isSafeInteger));
async function exercise(page,item) {
  const prefix='[data-js="gflow-inbox"] ';
  const id=page.locator(prefix+'.ag-header-cell[col-id="id"]').first();
  await id.click();const first=await ids(page);
  await id.click();
  await page.waitForFunction(a=>{
    const now=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row')]
      .map(n=>Number(n.getAttribute('row-id')));
    return JSON.stringify(a)!==JSON.stringify(now);
  },first,{timeout:12000});
  item.sort={first,reverse:await ids(page)};
  const before=await ids(page),next=page.locator(prefix+'.ag-paging-button[ref="btNext"]').first();
  if(!await next.count()||await next.isDisabled())throw Error('Native pagination fixture insufficient');
  await next.click();
  await page.waitForFunction(a=>{
    const n=document.querySelector('[data-js="gflow-inbox"] .ag-row');
    return n&&!a.includes(Number(n.getAttribute('row-id')));
  },before,{timeout:12000});
  item.pagination={before,after:await ids(page)};
  await page.locator(prefix+'.ag-paging-button[ref="btPrevious"]').first().click();
  const search=page.locator('[data-js="gflow-inbox-search"]').first();
  // Verified searchable column: native form_title (WU21-BROWSER-002).
  // National ID is an entry field, not an admitted Inbox search column.
  await search.click();await search.pressSequentially('WU21 Alpha Form');
  await page.waitForFunction(()=>{const n=document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length;
    return n>0&&n<20;},null,{timeout:12000});
  const positive=await ids(page);
  if(positive.length<1||positive.length>=20)throw Error('Positive native filter did not narrow results');
  await search.press('ControlOrMeta+A');await search.pressSequentially('__WU21_NO_SUCH_FORM_13F6__');
  await page.waitForFunction(()=>document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length===0,
    null,{timeout:12000});
  const negative=await ids(page);
  await search.press('ControlOrMeta+A');await search.press('Backspace');
  await page.waitForFunction(()=>document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length>positive.length,
    null,{timeout:12000});
  const reset=await ids(page);
  item.filter={query:'WU21 Alpha Form',positive,negative,reset,
    detectsBrokenFiltering:positive.length>0&&positive.length<reset.length&&negative.length===0};
  if(!item.filter.detectsBrokenFiltering)throw Error('Native filter negative control was not sensitive');
  const focused=page.locator(prefix+'.ag-header-cell[col-id]').nth(1);
  await focused.focus();await page.keyboard.press('ArrowRight');
  item.keyboard=await page.evaluate(()=>({
    inside:!!document.activeElement?.closest('[data-js="gflow-inbox"]'),
    col:document.activeElement?.closest('.ag-header-cell')?.getAttribute('col-id')}));
  if(!item.keyboard.inside||!item.keyboard.col)throw Error('Native keyboard focus failed');

  // Use the browser's real hit-test; do not infer that handle's box centre is interactive.
  const handle=await page.evaluate(()=>{
    const host=document.querySelector('[data-js="gflow-inbox"]');
    const opts=window.gflow_config?.grids?.[host?.dataset.gridId]?.grid_options;
    for(const h of host.querySelectorAll('.ag-header-cell[col-id]')){
      const col=h.getAttribute('col-id');
      if(col==='id'||opts?.columnDefs?.find(d=>d.field===col)?.resizable===false)continue;
      const node=h.querySelector('.ag-header-cell-resize');
      if(!node)continue;
      const a=h.getBoundingClientRect(),r=node.getBoundingClientRect();
      for(let x=r.left+.5;x<r.right;x+=.5){
        const y=r.top+r.height/2,t=document.elementFromPoint(x,y);
        if(t===node||node.contains(t))return {col,x,y,sign:r.left+r.width/2<a.left+a.width/2?-1:1,width:a.width};
      }
    }
    return null;
  });
  if(!handle)throw Error('No hit-testable native resize handle');
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();
  await page.mouse.move(handle.x+handle.sign*55,handle.y,{steps:8});await page.mouse.up();
  const after=await page.locator(prefix+'.ag-header-cell[col-id="'+handle.col+'"]')
    .first().evaluate(n=>n.getBoundingClientRect().width);
  if(after-handle.width<30)throw Error('Native resize did not materially grow');
  item.resize={handle,before:handle.width,after};
  const order=()=>page.locator(prefix+'.ag-header-cell[col-id]').evaluateAll(ns=>ns
    .map(n=>({id:n.getAttribute('col-id'),x:n.getBoundingClientRect().x}))
    .sort((a,b)=>a.x-b.x).map(n=>n.id));
  const beforeOrder=await order();
  const movable=beforeOrder.filter(x=>x!=='id');
  await page.locator(prefix+'.ag-header-cell[col-id="'+movable[0]+'"]').first()
    .dragTo(page.locator(prefix+'.ag-header-cell[col-id="'+movable.at(-1)+'"]').first(),{force:true});
  const afterOrder=await order();
  if(JSON.stringify(beforeOrder)===JSON.stringify(afterOrder))throw Error('Native drag did not reorder');
  item.drag={beforeOrder,afterOrder};
  await page.reload({waitUntil:'domcontentloaded'});await wait(page);
  item.saved={width:await page.locator(prefix+'.ag-header-cell[col-id="'+handle.col+'"]')
    .first().evaluate(n=>n.getBoundingClientRect().width),order:await order()};
  if(JSON.stringify(item.saved.order)!==JSON.stringify(afterOrder))
    throw Error('Persisted native column order changed unexpectedly');
  if(Math.abs(item.saved.width-after)>3)
    throw Error('Persisted native column width drifted: '+JSON.stringify({after,saved:item.saved.width}));
}
// Keep CSS conflict as an independent observation; functional failures use actual
// scroll, interaction, persistence or browser checks, not computed style alone.
async function mobileBehavior(page,item) {
  const prefix='[data-js="gflow-inbox"] ';
  const before=await ids(page);
  if(before.length<2)throw Error('Mobile native rows unavailable');
  const search=page.locator('[data-js="gflow-inbox-search"]').first();
  if(!await search.isVisible())throw Error('Mobile native search is not reachable');
  await page.touchscreen.tap(...await search.boundingBox().then(b=>[b.x+b.width/2,b.y+b.height/2]));
  await search.pressSequentially('WU21 Alpha Form');
  await page.waitForFunction(()=>{const n=document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length;return n>0&&n<20;},
    null,{timeout:12000});
  const positive=await ids(page);
  await search.press('ControlOrMeta+A');
  await search.pressSequentially('__WU21_NO_SUCH_FORM_13F6__');
  await page.waitForFunction(()=>document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length===0,
    null,{timeout:12000});
  const negative=await ids(page);
  await search.press('ControlOrMeta+A');await search.press('Backspace');
  await page.waitForFunction(()=>document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length>positive.length,
    null,{timeout:12000});
  const reset=await ids(page);
  item.mobileFilter={positive,negative,reset};
  if(!positive.length||positive.length>=reset.length||negative.length)
    throw Error('Mobile native filter positive/negative/reset assertion failed');
  const pager=page.locator(prefix+'.ag-paging-button[ref="btNext"]').first();
  if(!await pager.count()||await pager.isDisabled())throw Error('Mobile native next page unavailable');
  const first=await ids(page);
  await pager.click();
  await page.waitForFunction(a=>{
    const n=document.querySelector('[data-js="gflow-inbox"] .ag-row');
    return n&&!a.includes(Number(n.getAttribute('row-id')));
  },first,{timeout:12000});
  item.mobilePager={before:first,after:await ids(page)};
  await page.locator(prefix+'.ag-paging-button[ref="btPrevious"]').first().click();
  const header=page.locator(prefix+'.ag-header-cell[col-id]').first();
  if(await header.isVisible()){
    const box=await header.boundingBox();
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    item.touchHeader={id:await header.getAttribute('col-id'),tapped:true};
  }else item.touchHeader={status:'UNREACHABLE',reason:'native header not visible'};
}
let failed=false;
try{
  const cookies=JSON.parse(php("$u=get_user_by('login','bootstrap_admin');$exp=time()+1800;"
    +"echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$exp,'auth')],"
    +"['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$exp,'logged_in')]]);"));
  for(const locale of ['fa_IR','en_US'])for(const mode of ['off','on']){
    php("$u=get_user_by('login','bootstrap_admin');$s=get_option('pgr_settings',[]);"
      +"if(!is_array($s))throw new RuntimeException('Malformed PGR option');"
      +"$s['gravity_flow_inbox_rtl']="+(mode==='on'?'1':'0')+";update_option('pgr_settings',$s);"
      +(locale==='fa_IR'?"update_option('WPLANG','fa_IR');":"delete_option('WPLANG');")
      +"update_user_meta($u->ID,'locale','"+locale+"');");
    for(const width of [1280,390])for(const route of routes){
      const item={locale,mode,width,surface:route.name,status:'INCOMPLETE',errors:[]};
      report.cases.push(item);
      const context=await browser.newContext({viewport:{width,height:width===390?844:900},
        isMobile:width===390,hasTouch:width===390});
      await context.addCookies(cookies.map(c=>({...c,url:origin})));
      const page=await context.newPage();
      page.on('pageerror',x=>item.errors.push(String(x)));
      page.on('requestfailed',r=>item.errors.push('REQUEST_FAILED '+(r.failure()?.errorText||'')+' '+r.url()));
      page.on('response',r=>{if(r.status()>=400)item.errors.push('HTTP_'+r.status()+' '+r.url())});
      page.on('console',m=>{if(m.type()==='error')item.errors.push('CONSOLE '+m.text())});
      try{
        const response=await page.goto(route.url,{waitUntil:'domcontentloaded'});
        if(!response?.ok())throw Error('Real Inbox HTTP error '+response?.status());
        await wait(page);
        item.before=await snap(page);
        const expected=mode==='on'&&locale==='fa_IR';
        if(item.before.hasOption!==(mode==='on')||
          (mode==='on'&&item.before.option!==expected)||
          item.before.agRtl!==expected||item.before.agLtr===expected)
          throw Error('PGR native direction failed: '+JSON.stringify(item.before));
        if(route.name==='frontend'&&!item.before.gppSurface)
          throw Error('GPP surface not installed/active in actual Inbox');
        if(width===1280)await exercise(page,item);
        else await mobileBehavior(page,item);
        const bar=page.locator('[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport');
        if(await bar.count()){
          item.scroll=await bar.first().evaluate(async n=>{
            const initial=n.scrollLeft,range=n.scrollWidth-n.clientWidth;
            n.scrollLeft=range;await new Promise(ok=>requestAnimationFrame(ok));const positive=n.scrollLeft;
            n.scrollLeft=-range;await new Promise(ok=>requestAnimationFrame(ok));const negative=n.scrollLeft;
            n.scrollLeft=initial;
            return {initial,range,positive,negative,restored:n.scrollLeft};
          });
          if(item.scroll.range>20&&Math.max(Math.abs(item.scroll.positive-item.scroll.initial),
            Math.abs(item.scroll.negative-item.scroll.initial))<10)
            throw Error('Native horizontal scroll did not move');
        }
        item.after=await snap(page);
        await page.screenshot({path:path.join(dir,locale+'-'+mode+'-'+width+'-'+route.name+'.jpg'),
          type:'jpeg',quality:75,fullPage:true});
        if(item.errors.length)throw Error('Actual browser errors: '+JSON.stringify(item.errors));
        item.forcedLtrCollision=item.after.agRtl&&
          Object.values(item.after.directions).some(direction=>direction==='ltr');
        item.status='PASS';
      }catch(err){failed=true;item.status='FAIL';item.error=String(err)}
      finally{
        // Capture even before readiness, and on timeouts: do not let screenshots
        // or DOM capture obscure the original failure.
        try{item.diagnostic=await snap(page)}catch(err){item.captureError=String(err)}
        try{
          item.dom=await page.evaluate(()=>{
            const h=document.querySelector('[data-js="gflow-inbox"]');
            return {inboxHtml:h?.outerHTML.slice(0,12000)||null,
              pageTitle:document.title,documentReadyState:document.readyState,
              nativeWrapperCount:document.querySelectorAll('[data-js="gflow-inbox"]').length,
              widths:{document:document.documentElement.scrollWidth,viewport:innerWidth}};
          });
        }catch(err){item.domError=String(err)}
        try{await page.screenshot({path:path.join(dir,locale+'-'+mode+'-'+width+'-'+route.name+'.jpg'),
          type:'jpeg',quality:75,fullPage:true,timeout:12000});item.screenshot=true}
        catch(err){item.screenshotError=String(err)}
        await context.close();write();
      }
    }
  }
}catch(err){failed=true;report.fatal=String(err)}
finally{
  try{
    const b64=Buffer.from(JSON.stringify(original)).toString('base64');
    php("$u=get_user_by('login','bootstrap_admin');$s=json_decode(base64_decode('"+b64+"'),true);"
      +"if($s['found'])update_option('pgr_settings',$s['settings']);else delete_option('pgr_settings');"
      +"if($s['language']===false)delete_option('WPLANG');else update_option('WPLANG',$s['language']);"
      +"if($s['user']==='')delete_user_meta($u->ID,'locale');"
      +"else update_user_meta($u->ID,'locale',$s['user']);");
    report.restored=true;
  }catch(err){failed=true;report.restored=false;report.restoreError=String(err)}
  // OFF/ON values share the same disposable fixture, locale and viewport.
  // Compare stable logical column identity, rowData count and pagination;
  // physical order is allowed to reflect a genuine native RTL initialisation.
  for(const locale of ['fa_IR','en_US'])for(const width of [1280,390])
    for(const surface of ['frontend','admin']){
      const matching=report.cases.filter(x=>x.locale===locale&&x.width===width&&x.surface===surface);
      const off=matching.find(x=>x.mode==='off'),on=matching.find(x=>x.mode==='on');
      const d={locale,width,surface,status:'NOT_PROVEN'};
      if(off?.before&&on?.before){
        d.off={agRtl:off.before.agRtl,rows:off.before.rows};
        d.on={agRtl:on.before.agRtl,rows:on.before.rows};
        const cols=c=>(c.configuredColumns||[]).map(x=>x.id).sort().join('|');
        d.equalData=off.before.rows===on.before.rows;
        d.equalColumns=cols(off.before)===cols(on.before);
        d.equalPageSize=off.before.pageSize===on.before.pageSize;
        d.status=d.equalData&&d.equalColumns&&d.equalPageSize?'PASS':'FAIL';
        if(d.status==='FAIL')failed=true;
      }
      report.differentials.push(d);
    }
  report.status=failed?'FAIL':'PASS';write();await browser.close();
}
console.log('G014_GPP_LAB '+JSON.stringify({status:report.status,
  passed:report.cases.filter(x=>x.status==='PASS').length,
  failed:report.cases.filter(x=>x.status==='FAIL').length,restored:report.restored}));
if(failed)throw Error('G014 GPP coexistence NOT_PROVEN; see per-case report and screenshots');