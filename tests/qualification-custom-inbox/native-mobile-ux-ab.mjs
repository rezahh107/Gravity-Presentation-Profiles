import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const e=process.env,base=e.WU21_BASE_URL,out=e.WU21_ARTIFACT_DIR;
assert.equal(base,'http://127.0.0.1:8080','Isolated WU21 host only');
assert.ok(e.WU21_WP_PATH?.startsWith('/tmp/wu21-wordpress'));
const m=JSON.parse(fs.readFileSync(path.join(out,'ciq2-comparison-manifest.json'),'utf8'));
const result={head:e.GPP_WU21_REPOSITORY_SHA,kind:'Native-First 390px observational A/B',
  title:'Normal native / native fullscreen / host-gutter only',
  status:'RUNNING',scenario:'47 genuine synthetic pending tasks, real Officer, unchanged host permissions',
  variants:[],conclusion:'OBSERVATIONS_ONLY_NOT_OWNER_UX_ACCEPTANCE'};
const save=()=>fs.writeFileSync(path.join(out,'native-mobile-ux-ab.json'),JSON.stringify(result,null,2));
function wp(code){
  const p=spawnSync('php',[e.WU21_WP_CLI,'--path='+e.WU21_WP_PATH,'eval',code],
    {env:e,encoding:'utf8',timeout:60000});
  assert.equal(p.status,0,p.stderr);
  return p.stdout.trim();
}
const cookies=JSON.parse(wp("$u=get_user_by('id',"+m.officer+");$x=time()+1800;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$x,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$x,'logged_in')]]);"));
async function shot(page,label){
  const file='native-mobile-ab-'+label+'.png';
  await page.screenshot({path:path.join(out,file),fullPage:false});
  return file;
}
async function metrics(page){
  return page.evaluate(()=>{
    const root=document.querySelector('[data-js="gflow-inbox"]');
    const $=s=>root?.querySelector(s);
    const rect=el=>{const r=el?.getBoundingClientRect();return r?{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}:null;};
    const scroll=$('.ag-body-horizontal-scroll-viewport') || $('.ag-center-cols-viewport');
    const center=$('.ag-center-cols-viewport');
    const cfg=window.gflow_config?.grids?.[root?.dataset.gridId]?.grid_options;
    const cells=[...root.querySelectorAll('.ag-center-cols-container .ag-row[row-id] .ag-cell[col-id]')];
    const rows=[...new Set(cells.map(x=>Number(x.closest('.ag-row')?.getAttribute('row-id'))))];
    const headers=[...root.querySelectorAll('.ag-header-cell[col-id]')].map(el=>({
      id:el.getAttribute('col-id'),label:el.querySelector('.ag-header-cell-text')?.textContent?.trim(),
      box:rect(el),textDirection:getComputedStyle(el).direction,
    }));
    const sampleRow=rows[0];
    const sampleCells=cells.filter(x=>Number(x.closest('.ag-row')?.getAttribute('row-id'))===sampleRow).map(el=>({
      id:el.getAttribute('col-id'),text:el.textContent?.trim().slice(0,120),box:rect(el),
      hasNativeDetailLink:el.querySelector('a[data-js="inbox-details-link"]')!==null,
    }));
    const visible=(r)=>r && r.x<innerWidth&&r.x+r.width>0;
    return {
      viewport:{width:innerWidth,documentWidth:document.documentElement.scrollWidth,
        pageOverflow:document.documentElement.scrollWidth>innerWidth},
      page:{native:rect(root),gppShell:rect(document.querySelector('.gpp-inbox-surface')),
        gppInner:rect(document.querySelector('.gpp-inbox-surface__inner'))},
      nativeButtons:[...root.querySelectorAll('[data-js^="inbox-"]')].map(x=>({
        js:x.getAttribute('data-js'),title:x.getAttribute('title'),text:x.textContent?.trim().slice(0,40),
        aria:x.getAttribute('aria-label'),box:rect(x)
      })).filter(x=>x.js.includes('fullscreen')||x.js.includes('settings')),
      scroll:{scrollLeft:scroll?.scrollLeft,max:scroll?scroll.scrollWidth-scroll.clientWidth:null,
        scrollWidth:scroll?.scrollWidth,clientWidth:scroll?.clientWidth,
        centerScrollWidth:center?.scrollWidth,centerClientWidth:center?.clientWidth,
        scrollBox:rect(scroll),scrollDirection:scroll?getComputedStyle(scroll).direction:null},
      headers,firstRow:sampleRow,sampleCells,config:{
        columns:cfg?.columnDefs?.map(x=>({field:String(x.field??x.colId??''),headerName:x.headerName??null,
          minWidth:x.minWidth??null,width:x.width??null,resizable:x.resizable??null,hide:x.hide??false}))??[],
        pagination:cfg?.pagination,paginationPageSize:cfg?.paginationPageSize,
        allTaskRows:cfg?.rowData?.length??null
      },visibleSampleCells:sampleCells.filter(x=>visible(x.box)).map(x=>x.id),
      focused:{tag:document.activeElement?.tagName,role:document.activeElement?.getAttribute('role'),
        cls:document.activeElement?.className?.toString().slice(0,120)}
    };
  });
}
async function scrollToNativeEnd(page){
  const got=await page.locator('[data-js="gflow-inbox"]').evaluate(root=>{
    const bar=root.querySelector('.ag-body-horizontal-scroll-viewport')||root.querySelector('.ag-center-cols-viewport');
    if(!bar)return {exists:false};
    bar.scrollLeft=bar.scrollWidth-bar.clientWidth;
    bar.dispatchEvent(new Event('scroll',{bubbles:true}));
    return {exists:true,scrollLeft:bar.scrollLeft};
  });
  await page.waitForTimeout(200);
  return got;
}
let browser,context;
try{
  browser=await chromium.launch({headless:true});
  context=await browser.newContext({viewport:{width:390,height:900}});
  await context.addCookies(cookies.map(x=>({...x,url:base})));
  const page=await context.newPage();
  const arrival=await page.goto(m.native_url,{waitUntil:'networkidle',timeout:40000});
  assert.equal(arrival.status(),200);
  await page.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state:'attached'});
  const baseline=await metrics(page);
  assert.equal(baseline.viewport.width,390);
  assert.equal(baseline.config.columns.length,5,'Native Owner five-column contract absent');
  assert.ok(baseline.scroll.centerScrollWidth>baseline.scroll.centerClientWidth,
    'Expected mobile native horizontal overflow missing');
  const snapA=await shot(page,'baseline-390');
  const beforeX=baseline.sampleCells.map(c=>({id:c.id,x:c.box?.x,text:c.text}));
  const moved=await scrollToNativeEnd(page);
  const afterScroll=await metrics(page);
  const snapScroll=await shot(page,'scroll-end-390');
  const afterX=afterScroll.sampleCells.map(c=>({id:c.id,x:c.box?.x,text:c.text}));
  const sameText=baseline.sampleCells.length===afterScroll.sampleCells.length&&
    baseline.sampleCells.every(c=>afterScroll.sampleCells.some(y=>y.id===c.id&&y.text===c.text));
  assert.ok(sameText,'Native horizontal scrolling mutated cell values');
  result.variants.push({name:'A_native_baseline',initial:baseline,afterScroll,scrollAction:moved,
    sourceCellTextsUnchanged:sameText,columnPositions:{beforeX,afterX},
    screenshots:[snapA,snapScroll]});save();

  // B is Gravity Flow's own already-existing fullscreen button, not custom fullscreen.
  const nativeFull=page.locator('[data-js="gflow-inbox"] [data-js="inbox-fullscreeen"]');
  assert.equal(await nativeFull.count(),1,'Native fullscreen button missing');
  await nativeFull.click();
  await page.waitForTimeout(400);
  const fullscreen=await metrics(page);
  const snapB=await shot(page,'native-fullscreen-390');
  result.variants.push({name:'B_native_fullscreen',metrics:fullscreen,
    fullscreenButton:'inbox-fullscreeen',screenshot:snapB});save();
  // Restore using the same native control only if it is still available.
  if(await nativeFull.count() && await nativeFull.isVisible()) {
    await nativeFull.click();
    await page.waitForTimeout(250);
  }

  // C: host-level gutter CSS only, never changes a native row, column, or Grid API.
  await page.reload({waitUntil:'networkidle'});
  await page.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state:'attached'});
  await page.addStyleTag({content:'.gpp-inbox-surface__inner{padding-inline:0!important}'});
  const gutter=await metrics(page);
  assert.equal(gutter.config.columns.length,5,'Host gutter changed native column contract');
  const snapC=await shot(page,'host-gutter-zero-390');
  result.variants.push({name:'C_host_gutter_only',metrics:gutter,screenshot:snapC,
    scope:'disposable CSS-only zero GPP inner horizontal gutters; NOT PRODUCTION DESIGN APPROVAL'});save();

  // Full Officer journey under a native search control; all other mechanisms host-owned.
  await page.reload({waitUntil:'networkidle'});
  const search=page.locator('[data-js="gflow-inbox-search"]');
  await search.fill(m.target_name);
  await search.dispatchEvent('keyup');
  await page.waitForFunction(id=>{
    const rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
    return rows.length===1&&Number(rows[0].getAttribute('row-id'))===id;
  },m.target_id,{timeout:10000});
  const filtered=await metrics(page);
  const targetRow=page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+m.target_id+'"]');
  const cellTexts=await targetRow.locator('.ag-cell[col-id]').evaluateAll(xs=>xs.map(x=>({
    col:x.getAttribute('col-id'),text:x.textContent.trim().slice(0,200)})));
  const link=targetRow.locator('a[data-js="inbox-details-link"]').first();
  const href=await link.getAttribute('href');
  assert.equal(new URL(href,base).searchParams.get('lid'),String(m.target_id));
  const snapFind=await shot(page,'found-target-390');
  await link.click();
  await page.waitForLoadState('networkidle');
  const detailOpened=await page.locator('.gravityflow_workflow_detail').count()===1;
  assert.ok(detailOpened,'Native Entry Detail did not open');
  await page.goBack({waitUntil:'networkidle'});
  const returned=await page.locator('[data-js="gflow-inbox"]').count()===1;
  assert.ok(returned,'Return navigation did not restore native Inbox');
  result.journey={targetId:m.target_id,uniqueSearchFound:filtered.firstRow===m.target_id,
    filteredVisibleCells:filtered.visibleSampleCells,filteredCells:cellTexts,
    detailHref:href,detailOpened,returnedToNative:returned,
    searchAfterReturn:await search.inputValue(),screenshot:snapFind};
  result.status='OBSERVED_NATIVE_MOBILE_AB_COMPLETE';
  save();
  console.log('NATIVE_MOBILE_UX_AB_SUMMARY '+JSON.stringify({
    head:result.head,baseline:{width:baseline.scroll.centerClientWidth,
      content:baseline.scroll.centerScrollWidth,maxScroll:baseline.scroll.max,
      sampleColumnIds:baseline.config.columns.map(c=>c.field)},
    moved,fullscreen:{width:fullscreen.scroll.centerClientWidth,content:fullscreen.scroll.centerScrollWidth},
    hostGutter:{width:gutter.scroll.centerClientWidth,content:gutter.scroll.centerScrollWidth},
    journey:result.journey,snapshots:result.variants.flatMap(v=>v.screenshots??(v.screenshot?[v.screenshot]:[]))
  }));
}catch(err){result.status='FAIL';result.error=String(err.stack||err);save();throw err;}
finally{await context?.close();await browser?.close();save();}
