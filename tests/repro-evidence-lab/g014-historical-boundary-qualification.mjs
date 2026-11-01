// Qualification only: authentic WU21, public native APIs, CSSOM A/B/A.
// No shipped stylesheet, provider code or native storage is edited.
// Ephemeral pre-mount observers compose public callbacks as in the WU21 Candidate D helper.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const participants=['.ag-root-wrapper','.ag-header-viewport',
  '.ag-center-cols-viewport','.ag-body-horizontal-scroll-viewport'];
const hostSelector='[data-js="gflow-inbox"]';
// Reuse the Candidate D public callback-composition method, with no synthetic
// prior return, locale override or sizing control. Only expose public params
// supplied by the authentic host; preserve prior receiver/args/result/errors.
const observerMu=String.raw`<?php
if (!defined('ABSPATH')) { exit; }
function g014_historical_attach_observer() {
    global $wp_scripts;
    if (!$wp_scripts instanceof WP_Scripts) { return; }
    $js = <<<'JS'
(function(){
    if(!window.gflow_config || !gflow_config.grids)return;
    const observed=window.__g014ObservedOptions=window.__g014ObservedOptions||new WeakSet();
    const native=window.__g014Native=window.__g014Native||{};
    for(const [id,grid] of Object.entries(gflow_config.grids)){
        const o=grid.grid_options;
        if(!o || observed.has(o))continue;
        const names=['onColumnEverythingChanged','onGridSizeChanged'];
        if(names.some(k=>o[k]!=null && typeof o[k]!=='function'))continue;
        observed.add(o);
        for(const name of names){
            const prior=o[name];
            o[name]=function(){
                const p=arguments[0];
                if(p && p.api && p.columnApi)native[id]={api:p.api,columnApi:p.columnApi};
                return typeof prior==='function'?Reflect.apply(prior,this,arguments):undefined;
            };
        }
    }
})();
JS;
    foreach ($wp_scripts->registered as $handle => $script) {
        if (is_string($script->src) && str_contains($script->src, '/gravityflow/') && wp_script_is($handle,'enqueued')) {
            wp_add_inline_script($handle,$js,'before');
        }
    }
}
add_action('wp_print_footer_scripts','g014_historical_attach_observer',-2);
add_action('admin_print_footer_scripts','g014_historical_attach_observer',-2);
add_action('wp_print_scripts','g014_historical_attach_observer',-2);
add_action('admin_print_scripts','g014_historical_attach_observer',-2);
`;
const sleepFrames=page=>page.evaluate(()=>new Promise(resolve=>
  requestAnimationFrame(()=>requestAnimationFrame(resolve))));

async function ready(page){
  await page.waitForFunction(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const o=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
    const n=window.__g014Native?.[h?.dataset.gridId];
    return n?.api&&n?.columnApi&&n.api.getDisplayedRowCount()>0&&h.querySelector('.ag-row');
  },null,{timeout:30000});
  await page.waitForTimeout(700); // includes the admitted bounded grow settle window
}

async function observe(page){
  return page.evaluate(({participants})=>{
    const h=document.querySelector('[data-js="gflow-inbox"]'),id=h?.dataset.gridId;
    const o=window.gflow_config?.grids?.[id]?.grid_options;
    const n=window.__g014Native?.[id];
    const r=n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width}};
    const row=h?.querySelector('.ag-center-cols-container > .ag-row');
    const cells=new Map([...row?.querySelectorAll('.ag-cell[col-id]')||[]].map(n=>[n.getAttribute('col-id'),n]));
    const headers=[...h?.querySelectorAll('.ag-header-cell[col-id]')||[]];
    const pairs=headers.filter(n=>cells.has(n.getAttribute('col-id'))).map(n=>{
      const colId=n.getAttribute('col-id'),header=r(n),body=r(cells.get(colId));
      return {colId,header,body,leftDelta:header.left-body.left,widthDelta:header.width-body.width};
    });
    const bar=h?.querySelector('.ag-body-horizontal-scroll-viewport');
    const state=n?.columnApi?.getColumnState();
    const displayed=n?.columnApi?.getAllDisplayedColumns().map(c=>({id:c.getColId(),width:c.getActualWidth(),
      min:c.getMinWidth(),left:c.getLeft(),pinned:c.getPinned(),flex:c.getFlex()}));
    const storage=Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));
    return {gridId:id,enableRtl:o?.enableRtl??null,agRtl:!!h?.querySelector('.ag-rtl'),
      agLtr:!!h?.querySelector('.ag-ltr'),gppSurface:!!h?.closest('.gpp-inbox-surface'),
      directions:Object.fromEntries(participants.map(s=>[s,getComputedStyle(h.querySelector(s)).direction])),
      pairs,maxLeftDelta:pairs.length?Math.max(...pairs.map(p=>Math.abs(p.leftDelta))):null,
      maxWidthDelta:pairs.length?Math.max(...pairs.map(p=>Math.abs(p.widthDelta))):null,
      nativeState:state,displayed,configColumns:o.columnDefs.map(c=>({id:String(c.field??c.colId),hide:!!c.hide})),
      physicalHeaders:headers.map(n=>({id:n.getAttribute('col-id'),...r(n)})).sort((a,b)=>a.left-b.left),
      textDirections:[...h.querySelectorAll('.ag-header-cell-text,.ag-cell')].slice(0,30)
        .map(n=>({colId:n.closest('[col-id]')?.getAttribute('col-id'),direction:getComputedStyle(n).direction})),
      scroll:{left:bar.scrollLeft,range:bar.scrollWidth-bar.clientWidth,width:bar.clientWidth},
      nativeScrollbarCount:h.querySelectorAll('.ag-body-horizontal-scroll').length,
      documentOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
      rowIds:[...h.querySelectorAll('.ag-center-cols-container > .ag-row')].map(n=>n.getAttribute('row-id')),
      rowCount:n.api.getDisplayedRowCount(),page:n.api.paginationGetCurrentPage(),
      pageSize:n.api.paginationGetPageSize(),storage,
      provenance:Object.fromEntries(Object.entries(storage).filter(([k])=>k.startsWith('gpp:srwf-inbox-fit:')))};
  },{participants});
}

async function scrollProof(page){
  const checkpoints=[];
  for(const fraction of [0,.37,-.37,1,-1,0]){
    await page.locator(hostSelector+' .ag-body-horizontal-scroll-viewport').evaluate((n,f)=>{
      n.scrollLeft=(n.scrollWidth-n.clientWidth)*f;
    },fraction);
    await sleepFrames(page);
    checkpoints.push({fraction,...await observe(page)});
  }
  const overflow=checkpoints[0].scroll.range;
  return {checkpoints,overflow,movement:Math.max(...checkpoints.map(c=>c.scroll.left))-
    Math.min(...checkpoints.map(c=>c.scroll.left)),
    aligned:checkpoints.every(c=>c.pairs.length>0&&c.maxLeftDelta<=2&&c.maxWidthDelta<=2)};
}

// Remove only the four-selector direction exception from the actual loaded
// stylesheet. Selector-subset experiments keep every other declaration intact.
async function ablate(page,mask){
  return page.evaluate(({participants,mask})=>{
    if(!window.__g014HistoricalCss){
      const records=[];
      const visit=(rules,sheet)=>{for(const rule of rules){
        if(rule.selectorText&&rule.style?.getPropertyValue('direction')==='ltr'&&
          rule.style.getPropertyPriority('direction')==='important'&&
          participants.every(s=>rule.selectorText.includes(s))&&
          rule.selectorText.includes('.gpp-inbox-surface')&&rule.selectorText.includes('gflow-inbox')){
          records.push({rule,sheet,selector:rule.selectorText,style:rule.style.cssText,cssText:rule.cssText});
        }
        if(rule.cssRules)visit(rule.cssRules,sheet);
      }};
      for(const sheet of document.styleSheets){try{visit(sheet.cssRules,sheet.href)}catch{}}
      if(records.length!==1)throw Error('Exact four-node MR-1 CSS rule count='+records.length);
      window.__g014HistoricalCss=records;
    }
    const records=window.__g014HistoricalCss;
    for(const x of records){
      x.rule.selectorText=x.selector;x.rule.style.cssText=x.style;
      const keep=x.selector.split(',').map(s=>s.trim()).filter(s=>
        !participants.some((p,i)=>(mask&(1<<i))&&s.endsWith(p)));
      if(!keep.length)x.rule.style.removeProperty('direction');
      else x.rule.selectorText=keep.join(',');
    }
    return {mask,neutralized:participants.filter((_,i)=>mask&(1<<i)),
      records:records.map(x=>({sheet:x.sheet,original:x.cssText,current:x.rule.cssText,
        exactlyRestored:x.rule.cssText===x.cssText}))};
  },{participants,mask});
}

function settings(php,locale,mode){
  php("$u=get_user_by('login','bootstrap_admin');$s=get_option('pgr_settings',[]);"
    +"if(!is_array($s))throw new RuntimeException('PGR settings unavailable');"
    +"$s['gravity_flow_inbox_rtl']="+(mode==='on'?'1':'0')+";update_option('pgr_settings',$s);"
    +(locale==='fa_IR'?"update_option('WPLANG','fa_IR');":"delete_option('WPLANG');")
    +"update_user_meta($u->ID,'locale','"+locale+"');");
}

async function mouseResize(page){
  const handle=await page.evaluate(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    for(const head of h.querySelectorAll('.ag-header-cell[col-id]')){
      if(head.getAttribute('col-id')==='id')continue;
      const node=head.querySelector('.ag-header-cell-resize');if(!node)continue;
      const a=head.getBoundingClientRect(),r=node.getBoundingClientRect();
      for(let x=Math.max(.5,r.left+.5);x<Math.min(innerWidth-.5,r.right);x+=.5){
        const y=r.top+r.height/2,t=document.elementFromPoint(x,y);
        if(t===node||node.contains(t))return {id:head.getAttribute('col-id'),x,y,width:a.width,
          sign:r.left+r.width/2<a.left+a.width/2?-1:1};
      }
    }return null;
  });
  assert.ok(handle,'No physically hit-testable resize handle');
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();
  await page.mouse.move(handle.x+handle.sign*60,handle.y,{steps:15});await page.mouse.up();
  await page.waitForTimeout(350);
  const after=await observe(page),width=after.displayed.find(c=>c.id===handle.id)?.width;
  assert.ok(width>handle.width+25,'Mouse resize did not materially grow native column');
  return {handle,width,after};
}

async function dragColumn(page){
  const before=await observe(page);
  const targets=await page.evaluate(()=>{
    const hs=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell[col-id]')]
      .filter(h=>h.getAttribute('col-id')!=='id').map(h=>{
        const n=h.querySelector('.ag-header-cell-text')||h,r=n.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        return {id:h.getAttribute('col-id'),x,y,hit:document.elementFromPoint(x,y)?.closest('.ag-header-cell')===h};
      }).filter(x=>x.hit&&x.x>10&&x.x<innerWidth-10);
    return hs.length>=2?{from:hs[0],to:hs.at(-1)}:null;
  });
  if(!targets)return {status:'NOT_PROVEN',reason:'Fewer than two hit-testable headers'};
  const {from,to}=targets;
  await page.mouse.move(from.x,from.y);await page.mouse.down();
  await page.mouse.move(from.x+(to.x>from.x?12:-12),from.y,{steps:5});
  await page.waitForTimeout(180);
  await page.mouse.move(to.x,to.y,{steps:30});await page.waitForTimeout(250);await page.mouse.up();
  await page.waitForTimeout(350);
  const after=await observe(page);
  const changed=JSON.stringify(before.nativeState.map(c=>c.colId))!==JSON.stringify(after.nativeState.map(c=>c.colId));
  return {status:changed?'OBSERVED_NATIVE_REORDER':'NOT_PROVEN',targets,before:before.nativeState,after:after.nativeState,
    reason:changed?null:'Real hit-tested mouse gesture did not establish reorder; product defect unclassified'};
}

async function nativeInteractions(page,item){
  item.interactions={};const out=item.interactions;
  const run=async(name,fn)=>{try{out[name]={status:'PASS',evidence:await fn()}}catch(error){
    out[name]={status:'NOT_PROVEN',error:String(error)};}};
  await run('search',async()=>{
    const n=page.locator('[data-js="gflow-inbox-search"]');
    const before=await observe(page),all=before.rowCount;
    const query=await page.evaluate(()=>{
      const h=document.querySelector('[data-js="gflow-inbox"]');
      const o=window.gflow_config.grids[h.dataset.gridId].grid_options;
      const name=o.columnDefs.find(d=>d.headerName?.includes('نام دانش'));
      return name?String(o.rowData.find(r=>r[name.field])?.[name.field]||''):'';
    });
    assert.ok(query,'No actual native five-column name search witness');
    await n.fill(query);await n.press('End');await n.dispatchEvent('keyup');
    await page.waitForTimeout(350);const positive=await observe(page);
    await n.fill('__NO_MATCH_G014_4FD1__');await n.dispatchEvent('keyup');
    await page.waitForTimeout(350);const negative=await observe(page);
    await n.fill('');await n.dispatchEvent('keyup');await page.waitForTimeout(350);
    const reset=await observe(page);
    assert.ok(positive.rowCount>0&&positive.rowCount<all&&negative.rowCount===0&&reset.rowCount===all);
    return {query,all,positive:positive.rowCount,negative:negative.rowCount,reset:reset.rowCount};
  });
  // Always reset through the genuine native control even after an oracle failure.
  await page.locator('[data-js="gflow-inbox-search"]').fill('');
  await page.locator('[data-js="gflow-inbox-search"]').dispatchEvent('keyup');
  await page.waitForTimeout(200);
  await run('sort',async()=>{
    const h=page.locator(hostSelector+' .ag-header-cell[col-id="id"]');
    await h.scrollIntoViewIfNeeded();await h.click();const first=(await observe(page)).rowIds;
    await h.click();await page.waitForTimeout(200);const second=(await observe(page)).rowIds;
    assert.notDeepEqual(first,second,'Native sort did not change row order');return {first,second};
  });
  await run('pagination',async()=>{
    // Public native API creates a genuine two-page condition for two real rows.
    const original=await page.evaluate(()=>{const h=document.querySelector('[data-js="gflow-inbox"]');
      const a=window.__g014Native[h.dataset.gridId].api;
      const size=a.paginationGetPageSize();a.paginationSetPageSize(1);return size;});
    try{
      const first=(await observe(page)).rowIds;
      await page.locator(hostSelector+' .ag-paging-button[ref="btNext"]').click();
      await page.waitForTimeout(200);const next=await observe(page);
      assert.equal(next.page,1);assert.notDeepEqual(first,next.rowIds);
      await page.locator(hostSelector+' .ag-paging-button[ref="btPrevious"]').click();
      return {fixture:'Public paginationSetPageSize(1), original native size restored',first,next:next.rowIds};
    }finally{await page.evaluate(size=>{const h=document.querySelector('[data-js="gflow-inbox"]');
      window.__g014Native[h.dataset.gridId].api.paginationSetPageSize(size);},original);}
  });
  await run('keyboard',async()=>{
    const h=page.locator(hostSelector+' .ag-header-cell[col-id]').first();await h.focus();
    const before=await h.getAttribute('col-id');await page.keyboard.press('ArrowRight');
    const after=await page.evaluate(()=>({col:document.activeElement?.closest('.ag-header-cell')?.getAttribute('col-id'),
      inside:!!document.activeElement?.closest('[data-js="gflow-inbox"]'),role:document.activeElement?.getAttribute('role')}));
    assert.ok(after.inside&&after.col);return {before,after};
  });
}

async function fitSequence(page,mode){
  const proof={method:'Existing PR143 public current-state fixture; host owns persistence',
    initial:await observe(page)};
  await page.evaluate(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const n=window.__g014Native[h.dataset.gridId];
    n.columnApi.applyColumnState({state:n.columnApi.getColumnState(),applyOrder:true});
  });
  await page.waitForTimeout(200);proof.persistedWide=await observe(page);
  assert.ok(proof.persistedWide.storage[proof.persistedWide.gridId],'Native wider-state persistence fixture missing');
  await page.setViewportSize({width:1050,height:900});await page.waitForTimeout(200);
  proof.liveShrink=await observe(page);
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  if(mode==='on')await ablate(page,15);
  proof.narrowReload=await observe(page);
  await page.evaluate(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const a=window.__g014Native[h.dataset.gridId].api;
    window.__g014GrowEvents=[];
    a.addEventListener('columnResized',e=>window.__g014GrowEvents.push({source:e.source,finished:e.finished}));
  });
  await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(900);
  proof.liveGrow=await observe(page);
  proof.growEvents=await page.evaluate(()=>window.__g014GrowEvents);
  proof.afterGrowScroll=await scrollProof(page);
  return proof;
}

export async function qualifyHistoricalBoundary({browser,php,cookies,origin,fixture,dir,env}){
  const out=path.join(dir,'historical-boundary');fs.mkdirSync(out,{recursive:true});
  const report={schema:'G014_HISTORICAL_BOUNDARY_V1',gppHead:env.GPP_WU21_REPOSITORY_SHA,
    pgrHead:env.G014_PGR_SOURCE_SHA,scope:'QUALIFICATION_ONLY_CSSOM_NO_PRODUCT_WRITES',
    browserVersion:browser.version(),comparisons:[],fiveColumn:[],errors:[],status:'INCOMPLETE'};
  const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  const observerPath=path.join(env.WU21_WP_PATH,'wp-content/mu-plugins/g014-historical-public-observer.php');
  assert.ok(!fs.existsSync(observerPath),'Observer path already occupied; refusing overwrite');
  fs.writeFileSync(observerPath,observerMu);
  report.observationMethod='Existing WU21 public pre-mount callback composition, no private API';
  async function open(locale,mode,width,url){
    settings(php,locale,mode);
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500});
    await context.addCookies(cookies.map(c=>({...c,url:origin})));
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(String(e)));
    const response=await page.goto(url,{waitUntil:'domcontentloaded'});
    assert.ok(response?.ok(),'Authentic Inbox HTTP error');await ready(page);
    return {context,page};
  }
  try{
    const controls=[['fa_IR','off','frontend'],['fa_IR','on','frontend'],
      ['fa_IR','on','admin'],['en_US','on','frontend']];
    for(const [locale,mode,surface] of controls){
      const item={locale,mode,surface,width:390,status:'INCOMPLETE'};report.comparisons.push(item);
      let opened;
      try{
        opened=await open(locale,mode,390,surface==='admin'?origin+'/wp-admin/admin.php?page=gravityflow-inbox':fixture.frontend_inbox_url);
        const {page}=opened;item.original=await scrollProof(page);
        assert.equal(item.original.checkpoints[0].agRtl,locale==='fa_IR'&&mode==='on');
        if(surface==='frontend'&&locale==='fa_IR'){
          item.ablation=await ablate(page,15);await sleepFrames(page);item.neutralized=await scrollProof(page);
          await page.screenshot({path:path.join(out,locale+'-'+mode+'-390-ablated.png'),fullPage:true});
          item.restore=await ablate(page,0);await sleepFrames(page);item.restored=await scrollProof(page);
          assert.ok(item.restore.records.every(r=>r.exactlyRestored),'CSSOM exact restoration failed');
          assert.deepEqual(item.original.checkpoints[0].nativeState,item.restored.checkpoints[0].nativeState,'Ablation mutated native column state');
          assert.deepEqual(item.original.checkpoints[0].storage,item.restored.checkpoints[0].storage,'Ablation changed browser state');
          if(mode==='on'){
            item.selectorCombinations=[];
            for(let mask=1;mask<=15;mask++){
              const edit=await ablate(page,mask);await sleepFrames(page);
              item.selectorCombinations.push({mask,edit,proof:await scrollProof(page)});
            }
            await ablate(page,0);
          }
        }
        await page.screenshot({path:path.join(out,locale+'-'+mode+'-390-'+surface+'-original.png'),fullPage:true});
        item.status='EXECUTED';
      }catch(error){item.status='BLOCKED';item.error=String(error)}
      finally{if(opened)await opened.context.close();save();}
    }
    const mixedFile=path.join(env.WU21_ARTIFACT_DIR,'inbox-mixed-readiness-php.json');
    assert.ok(fs.existsSync(mixedFile),'Existing source-proven five-column fixture not available');
    const mixed=JSON.parse(fs.readFileSync(mixedFile));
    assert.equal(mixed.data_class,'SYNTHETIC_NON_PII');
    assert.ok(mixed.header_projection.ready?.column_ids?.length===5);
    report.bindingAuthority={form:mixed.form_scoped,projection:mixed.header_projection.ready,
      sourceVersions:mixed.source_versions,readiness:mixed.semantic_readiness};
    const roleIds=mixed.header_projection.ready.column_ids.map(String);
    const physicalLtr=[roleIds[0],roleIds[4],roleIds[3],roleIds[2],roleIds[1]];
    report.ownerPhysicalLtr=physicalLtr;report.ownerFacingRtl=[...physicalLtr].reverse();
    for(const mode of ['off','on'])for(const width of [390,1280]){
      const item={mode,width,status:'INCOMPLETE'};report.fiveColumn.push(item);let opened;
      try{
        opened=await open('fa_IR',mode,width,mixed.form_scoped.url);const {page}=opened;
        item.clean=await observe(page);
        assert.deepEqual([...item.clean.displayed.map(c=>c.id)].sort(),[...physicalLtr].sort(),'Authentic five-column identity changed');
        item.cleanProof=await scrollProof(page);
        item.candidate=mode==='on'?await ablate(page,15):{mask:0,description:'ag-ltr preservation: retain exact original rule'};
        await sleepFrames(page);item.candidateProof=await scrollProof(page);
        item.semanticOrderAccepted=mode==='off'&&JSON.stringify(item.clean.displayed.map(c=>c.id))===JSON.stringify(physicalLtr);
        item.nativeRtlPhysicalOrder=mode==='on'?'REQUIRES_OWNER_DECISION':null;
        if(width===1280){
          try{item.fitSequence=await fitSequence(page,mode)}catch(error){item.fitSequence={status:'NOT_PROVEN',error:String(error)}}
          await page.setViewportSize({width:1280,height:900});
          await nativeInteractions(page,item);
          item.resize=await mouseResize(page);
          item.manualScroll=await scrollProof(page);
          item.drag=await dragColumn(page);
        }
        item.beforeReload=await observe(page);
        await page.reload({waitUntil:'domcontentloaded'});await ready(page);
        item.reloadOriginal=await observe(page);item.reloadOriginalProof=await scrollProof(page);
        if(mode==='on')await ablate(page,15);
        item.reloadCandidateProof=await scrollProof(page);
        item.reloadCandidate=await observe(page);
        const nonWidth=s=>s.map(({width,...rest})=>rest);
        item.nativeStatePersistence={before:item.beforeReload.nativeState,after:item.reloadOriginal.nativeState,
          nonWidthUnchanged:JSON.stringify(nonWidth(item.beforeReload.nativeState))===JSON.stringify(nonWidth(item.reloadOriginal.nativeState)),
          widthDeltas:item.reloadOriginal.nativeState.map(c=>({id:c.colId,delta:c.width-(item.beforeReload.nativeState.find(p=>p.colId===c.colId)?.width??NaN)})),
          policy:'NORMALIZE_IF_FIT_CAPABLE; compare geometry and provenance, not exact width equality'};
        // Follow the same browser profile through an OFF/ON mode transition.
        settings(php,'fa_IR',mode==='off'?'on':'off');
        await page.reload({waitUntil:'domcontentloaded'});await ready(page);
        item.modeTransition=await observe(page);item.modeTransitionProof=await scrollProof(page);
        if(mode==='off')await ablate(page,15); // candidate in transitioned ag-rtl only
        item.modeTransitionCandidateProof=await scrollProof(page);
        await page.screenshot({path:path.join(out,'five-'+mode+'-'+width+'-transition.png'),fullPage:true});
        item.status='EXECUTED';
      }catch(error){item.status='BLOCKED';item.error=String(error);
        if(opened)try{item.failureObservation=await observe(opened.page);
          await opened.page.screenshot({path:path.join(out,'five-'+mode+'-'+width+'-failure.png'),fullPage:true});}catch{}
      }
      finally{if(opened)await opened.context.close();save();}
    }
    report.status=report.comparisons.every(c=>c.status==='EXECUTED')&&report.fiveColumn.every(c=>c.status==='EXECUTED')?
      'EXPERIMENTS_EXECUTED_NOT_COMPATIBILITY_GREEN':'PARTIAL';
  }catch(error){report.fatal=String(error);report.status='BLOCKED'}
  finally{fs.rmSync(observerPath,{force:true});report.observerRemoved=!fs.existsSync(observerPath);save();}
  console.log('G014_HISTORICAL_BOUNDARY '+JSON.stringify({status:report.status,
    comparisons:report.comparisons.map(c=>({mode:c.mode,surface:c.surface,status:c.status})),
    fiveColumn:report.fiveColumn.map(c=>({mode:c.mode,width:c.width,status:c.status}))}));
  return {status:report.status,path:'historical-boundary/report.json'};
}
