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
const report={schema:'G014_GPP_AUTHENTIC_LAB_V1',pgrHead:e.G014_PGR_SOURCE_SHA,
  gppHead:e.GPP_WU21_REPOSITORY_SHA,fixtureEntries:fixture.base_entry_count,
  status:'INCOMPLETE',cases:[]};
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
    gppSurface:!!document.querySelector('.gpp-inbox-surface'),
    scrollRange:bar?bar.scrollWidth-bar.clientWidth:null,scrollLeft:bar?.scrollLeft??null};
});
const wait=page=>page.waitForFunction(()=>{
  const host=document.querySelector('[data-js="gflow-inbox"]');
  const opts=window.gflow_config?.grids?.[host?.dataset.gridId]?.grid_options;
  return opts?.rowData?.length>=25&&host?.querySelectorAll('.ag-header-cell[col-id]').length>=5&&
    host?.querySelectorAll('.ag-center-cols-container .ag-row').length>0;
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
  await search.click();await search.pressSequentially('SYN-A-000000');
  await page.waitForFunction(()=>document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length===1,
    null,{timeout:12000});
  item.filter=await ids(page);
  await search.fill('');
  await page.waitForFunction(()=>document.querySelectorAll(
    '[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length>1,
    null,{timeout:12000});
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
      const context=await browser.newContext({viewport:{width,height:width===390?844:900}});
      await context.addCookies(cookies.map(c=>({...c,url:origin})));
      const page=await context.newPage();
      page.on('pageerror',x=>item.errors.push(String(x)));
      page.on('requestfailed',r=>item.errors.push(r.failure()?.errorText+' '+r.url()));
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
        if(width===1280&&route.name==='frontend')await exercise(page,item);
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
        item.forcedLtrCollision=item.after.agRtl&&item.after.directions['.ag-root-wrapper']==='ltr';
        if(item.forcedLtrCollision)
          throw Error('GPP forced-LTR CSS collides with native ag-rtl Grid');
        item.status='PASS';
      }catch(err){failed=true;item.status='FAIL';item.error=String(err)}
      finally{await context.close();write()}
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
  report.status=failed?'FAIL':'PASS';write();await browser.close();
}
console.log('G014_GPP_LAB '+JSON.stringify({status:report.status,
  passed:report.cases.filter(x=>x.status==='PASS').length,
  failed:report.cases.filter(x=>x.status==='FAIL').length,restored:report.restored}));
if(failed)throw Error('G014 GPP coexistence NOT_PROVEN; see per-case report and screenshots');