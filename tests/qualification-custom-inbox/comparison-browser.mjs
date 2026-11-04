import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, out=env.WU21_ARTIFACT_DIR, base=env.WU21_BASE_URL;
assert.equal(base,'http://127.0.0.1:8080','Disposable CI host only');
const baseline=JSON.parse(fs.readFileSync(path.join(out,'ciq2-browser-fixture.json'),'utf8'));
const report={head:env.GPP_WU21_REPOSITORY_SHA,status:'RUNNING',runtime:'pinned authentic WP/GF/Flow; synthetic only',
  cases:[],checks:[],screenshots:[],limitations:[
    'Automated scripted time is not human task completion time',
    'Native AG Grid may virtualize or paginate rows; DOM count alone is not total task count',
    'Host internal Task Model, Entry Detail guards, and GPP mapping are not stable public production contracts',
    'National ID values are synthetic; disclosure on an Owner production site is not admitted'
  ]};
const save=()=>fs.writeFileSync(path.join(out,'ciq2-comparative-journeys.json'),JSON.stringify(report,null,2));
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],{env,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
function fixture(action){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval-file',
    'tests/qualification-custom-inbox/comparison-fixture.php'],
  {env:{...env,CIQ2_COMPARE_ACTION:action},encoding:'utf8',timeout:160000});
  if(r.status!==0)throw new Error('Synthetic fixture '+action+' failed: '+r.stderr);
  return r.stdout.trim();
}
async function auth(browser,id,width){
  const c=await browser.newContext({viewport:{width,height:900}});
  if(id){
    const cookies=JSON.parse(wp("$u=get_user_by('id',"+id+");$e=time()+1800;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);"));
    await c.addCookies(cookies.map(x=>({...x,url:base})));
  }
  return c;
}
function rec(phase,interfaceName,width,kind,extra){
  const row={phase,interface:interfaceName,width,scenario:kind,...extra};
  report.cases.push(row);save();return row;
}
async function snapshot(page,prefix){
  const file='compare-'+prefix+'.png';
  await page.screenshot({path:path.join(out,file),fullPage:false});
  report.screenshots.push(file);
}
async function geometry(page,interfaceName){
  return page.evaluate(kind=>{
    const node=kind==='native'?document.querySelector('[data-js="gflow-inbox"]'):document.querySelector('[data-ciq2-root]');
    const r=node?.getBoundingClientRect();
    const candidates=kind==='native'?'.ag-row[row-id]':'[data-ciq2-entry]';
    const taskElements=[...document.querySelectorAll(candidates)];
    const rects=taskElements.slice(0,4).map(e=>{const x=e.getBoundingClientRect();return {top:Math.round(x.top),left:Math.round(x.left),width:Math.round(x.width),inInitialViewport:x.top>=0&&x.top<innerHeight};});
    const allInputs=[...document.querySelectorAll('input')].map(x=>({type:x.type,placeholder:x.placeholder,
      aria:x.getAttribute('aria-label'),dataJs:x.getAttribute('data-js'),outer:x.outerHTML.slice(0,320)}));
    const buttonLabels=[...document.querySelectorAll('button')].map(x=>({text:x.innerText.trim().slice(0,80),aria:x.getAttribute('aria-label'),title:x.title,outer:x.outerHTML.slice(0,240)})).slice(0,35);
    return {documentOverflow:document.documentElement.scrollWidth>innerWidth,
      documentScrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
      documentHeight:document.documentElement.scrollHeight,availableScrollY:Math.max(0,document.documentElement.scrollHeight-innerHeight),
      surfaceRect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,
      rowSamples:rects,renderedTaskElements:taskElements.length,
      gridScrollWidth:kind==='native'?document.querySelector('.ag-center-cols-viewport')?.scrollWidth:null,
      gridClientWidth:kind==='native'?document.querySelector('.ag-center-cols-viewport')?.clientWidth:null,
      searchInputs:allInputs,controls:buttonLabels};
  },interfaceName);
}
async function load(page,url){
  const st=Date.now(),r=await page.goto(url,{waitUntil:'networkidle',timeout:40000});
  return {http:r.status(),scriptedNavigationMs:Date.now()-st};
}
async function keyboardProbe(page,kind){
  const result={tabsUsed:0,searchReached:false,detailLinkReached:false,focusVisibleSearch:null,focusVisibleDetail:null};
  for(let i=1;i<=70;i++){
    await page.keyboard.press('Tab');result.tabsUsed=i;
    const v=await page.evaluate(()=>{
      const e=document.activeElement,s=e?getComputedStyle(e):null;
      return {tag:e?.tagName,id:e?.id,role:e?.getAttribute('role'),
        visible:!!e?.matches(':focus-visible'),outline:s?.outlineStyle,
        search:!!e?.matches('#ciq2-search,[data-js="gflow-inbox-search"]'),
        detail:!!e?.matches('a[data-ciq2-detail],a[data-js="inbox-details-link"]')};
    });
    if(i===1)result.firstTab=v;
    if(v.search&&!result.searchReached){
      result.searchReached=true;result.searchTabIndex=i;result.focusVisibleSearch=v.visible&&v.outline!=='none';
    }
    if(v.detail&&!result.detailLinkReached){
      result.detailLinkReached=true;result.detailTabIndex=i;result.focusVisibleDetail=v.visible&&v.outline!=='none';
    }
    if(result.searchReached&&result.detailLinkReached)break;
  }
  result.scope='Tab reachability and focus outline only; screen-reader/WCAG not qualified';
  return result;
}
async function runPhase(browser,phase,width,urls,targetId,targetName,expected){
  for(const kind of ['native','inbox2']){
    const ctx=await auth(browser,baseline.officer,width),p=await ctx.newPage();
    const errors=[];p.on('pageerror',e=>errors.push(String(e)));
    try {
      const arrival=await load(p,urls[kind]);
      const g=await geometry(p,kind);
      const data={arrival,geometry:g,errors,expectedTaskCount:expected.length,
        initialTaskIds:kind==='inbox2'?await p.locator('[data-ciq2-entry]').evaluateAll(xs=>xs.map(x=>Number(x.dataset.ciq2Entry))):await p.locator('.ag-row[row-id]').evaluateAll(xs=>xs.map(x=>Number(x.getAttribute('row-id')))),
        interactionCount:0,scrollActions:0,phaseNotes:[]};
      if(kind==='inbox2'){
        assert.equal(arrival.http,200);
        assert.deepEqual([...data.initialTaskIds].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),'Inbox2 membership mismatch');
        assert.ok(!((await p.content()).includes('CQ_SECRET_DO_NOT_EXPOSE_')),'Hidden synthetic field in Inbox2');
      } else {
        assert.equal(arrival.http,200);
        await p.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state:'attached'});
        data.nativeGridPresent=true;
      }
      data.targetOnInitialRenderedPage=data.initialTaskIds.includes(targetId);
      await snapshot(p,phase+'-'+kind+'-'+width);
      data.keyboard=await keyboardProbe(p,kind);
      // Reset to a truly identical starting point after the focus probe.
      await load(p,urls[kind]);
      if(kind==='inbox2'){
        const search=p.locator('#ciq2-search');
        const st=Date.now();await search.fill(targetName);data.interactionCount++;
        data.search={task:targetName,success:await p.locator('[data-ciq2-entry="'+targetId+'"]:visible').count()===1,
          elapsedMs:Date.now()-st,method:'existing local search',requiredPagination:false};
        const visible=await p.locator('[data-ciq2-entry]:visible').count();
        data.search.visibleRows=visible;
        const found=p.locator('[data-ciq2-entry="'+targetId+'"]');
        data.caseInfo={name:await found.locator('[data-ciq2-name]').innerText(),
          schoolGrade:await found.locator('[data-ciq2-school-grade]').innerText(),
          shownWithoutHorizontalScroll:!g.documentOverflow,
          displayedNationalIdIsSyntheticOnly:true};
        const link=found.locator('[data-ciq2-detail]');
        const href=await link.getAttribute('href');data.detail={hrefTarget:Number(new URL(href,base).searchParams.get('lid'))};
        assert.equal(data.detail.hrefTarget,targetId);
        data.interactionCount++; await link.click();await p.waitForLoadState('networkidle');
        data.detail.opened=await p.locator('.gravityflow_workflow_detail').count()===1;
        data.detail.onNativeHost=new URL(p.url()).searchParams.get('lid')===String(targetId);
      } else {
        const searchInfo=await p.evaluate(()=>{
          const candidates=[...document.querySelectorAll('input')].filter(x=>x.type==='search' || /search|جست/i.test([x.placeholder,x.getAttribute('aria-label'),x.id,x.getAttribute('data-js')].join(' ')));
          return candidates.map(x=>({outer:x.outerHTML.slice(0,320),placeholder:x.placeholder,id:x.id}));
        });
        data.search={task:targetName,candidates:searchInfo,success:false,method:'native search not yet selected',requiredPagination:null};
        const search=p.locator('input[type="search"],input[placeholder*="Search"],input[placeholder*="جست"],input[aria-label*="Search"]');
        const rows=p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]');
        if(await search.count()){
          const input=search.first(),st=Date.now();
          // Reuse the repo's tested native Search event, not Enter or a fixed 700ms delay.
          await input.fill(targetName);data.interactionCount++;
          await input.dispatchEvent('keyup');
          let filtered=false;
          try {
            await p.waitForFunction(id=>{
              const rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
              return rows.length===1&&Number(rows[0].getAttribute('row-id'))===id;
            },targetId,{timeout:6000});
            filtered=true;
          }catch(e){data.phaseNotes.push('Native quick-search did not reduce to the unique target within 6s');}
          const ids=await rows.evaluateAll(xs=>xs.map(x=>Number(x.getAttribute('row-id'))));
          data.search={...data.search,method:'native keyup quick-search with exact filtered row oracle',
            success:filtered,elapsedMs:Date.now()-st,observedRenderedIds:ids,
            requiredPagination:filtered?false:null};
          if(!filtered){
            await input.fill('');await input.dispatchEvent('keyup');data.interactionCount++;
            await p.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').length>0,null,{timeout:15000});
            let clicks=0;
            while(!(await p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+targetId+'"]').count())&&clicks<3){
              const next=p.locator('[data-js="gflow-inbox"] [ref="btNext"]');
              if(await next.count()!==1||!(await next.isEnabled()))break;
              const before=await p.locator('[data-js="gflow-inbox"] [ref="lbCurrent"]').innerText();
              await next.click();clicks++;data.interactionCount++;data.scrollActions++;
              await p.waitForFunction(previous=>document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()!==previous,before.trim(),{timeout:15000});
            }
            data.search.manualPageFallback={pageNextClicks:clicks,found:await p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+targetId+'"]').count()>0};
          }
        } else data.phaseNotes.push('Native Search field not found; no positive search claim');
        let nativeRow=p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+targetId+'"]');
        if(await nativeRow.count()){
          const nativeLink=nativeRow.locator('a[data-js="inbox-details-link"]').first();
          if(await nativeLink.count()){
            const href=await nativeLink.getAttribute('href');
            data.detail={hrefTarget:Number(new URL(href,base).searchParams.get('lid'))};
            assert.equal(data.detail.hrefTarget,targetId);
            data.interactionCount++;
            try{await nativeLink.click({timeout:5000}); await p.waitForLoadState('networkidle',{timeout:15000});
              data.detail.opened=await p.locator('.gravityflow_workflow_detail').count()===1;}
            catch(e){data.detail.opened=false;data.detail.error=String(e).slice(0,240);}
          }
        }
        if(!data.detail)data.detail={opened:false,reason:'Target row not in rendered native page; no direct navigation substituted'};
      }
      if(data.detail?.opened){
        data.interactionCount++;await p.goBack({waitUntil:'networkidle'});
        data.return={backToList:new URL(p.url()).pathname===new URL(urls[kind]).pathname,
          searchInputValue:kind==='inbox2'?await p.locator('#ciq2-search').inputValue():
            (await p.locator('input[type="search"],input[placeholder*="Search"],input[placeholder*="جست"]').count()?await p.locator('input[type="search"],input[placeholder*="Search"],input[placeholder*="جست"]').first().inputValue():null),
          nextTaskIsVisible:kind==='inbox2'?await p.locator('[data-ciq2-entry]:visible').count()>1:
            await p.locator('.ag-row[row-id]').count()>1};
      }else data.return={status:'NOT_PROVEN_WHEN_DETAIL_NOT_OPENED'};
      data.finalErrors=errors; rec(phase,kind,width,'A-D_FIND_CONTEXT_DETAIL_RETURN',data);
    }finally{await ctx.close();}
  }
}
async function restricted(browser,phase,urls,width){
  for(const kind of ['native','inbox2']){
    for(const actor of ['viewer','anonymous']){
      const c=await auth(browser,actor==='viewer'?baseline.viewer:0,width),p=await c.newPage();
      try {
        const r=await load(p,urls[kind]);
        const html=await p.content();
        const denied=!html.includes('CQ_RAW_NID_')&&!html.includes('CQ_SECRET_DO_NOT_EXPOSE_')&&
          (kind==='native'?!(await p.locator('.ag-row[row-id="'+baseline.entries[0]+'"]').count()):!(await p.locator('[data-ciq2-entry]').count()));
        assert.ok(denied,kind+' '+actor+' saw an assigned fixture task or secret');
        rec(phase,kind,width,'F_RESTRICTED',{actor,http:r.http,assignedRowsVisible:false,
          noSyntheticSecretMarkers:true,emptyStateText:(await p.locator('body').innerText()).slice(0,220)});
        if(actor==='viewer')await snapshot(p,phase+'-'+kind+'-viewer-'+width);
      }finally{await c.close();}
    }
  }
}
let browser,expanded=false;
try{
  browser=await chromium.launch({headless:true});
  const small={native:baseline.native_url,inbox2:baseline.custom_url};
  for(const width of [390,1280]){
    await runPhase(browser,'small3',width,small,baseline.entries[0],'آرین',baseline.entries);
    await restricted(browser,'small3',small,width);
  }
  const setup=fixture('setup');expanded=true;
  assert.ok(setup.includes('47_TASKS_READY'));
  const large=JSON.parse(fs.readFileSync(path.join(out,'ciq2-comparison-manifest.json'),'utf8'));
  report.workload={original:baseline.entries.length,syntheticAdded:large.created_ids.length,total:large.all_ids.length,
    source:'real GFAPI synthetic insertion followed by authentic Gravity Flow process_workflow'};
  assert.equal(large.all_ids.length,47);
  for(const width of [390,1280]){
    await runPhase(browser,'multi47',width,{native:large.native_url,inbox2:large.inbox2_url},
      large.target_id,large.target_name,large.all_ids);
  }
  // Only a generated synthetic task is transitioned, preserving the three existing browser fixtures.
  const target=large.target_id;
  assert.equal(wp("wp_set_current_user("+large.admin+");$e=GFAPI::get_entry("+target+");$a=new Gravity_Flow_API($e['form_id']);$a->send_to_step($e,"+large.next_step+");echo 'TRANSITION_OK';"),'TRANSITION_OK');
  const c=await auth(browser,large.officer,390),p=await c.newPage();
  try{
    const r=await load(p,large.inbox2_url);
    const remaining=await p.locator('[data-ciq2-entry]').evaluateAll(xs=>xs.map(x=>Number(x.dataset.ciq2Entry)));
    assert.equal(r.http,200);assert.equal(remaining.length,46);assert.ok(!remaining.includes(target));
    rec('multi47','inbox2',390,'E_NATIVE_ASSIGNMENT_TRANSITION',{before:47,after:46,removedTask:target,
      hostAction:'Gravity_Flow_API::send_to_step',noStaleAssignedTask:true,manualPageReload:true});
    await snapshot(p,'after-native-assignment-transition-inbox2-390');
  }finally{await c.close();}
  const nativeContext=await auth(browser,large.officer,390),nativePage=await nativeContext.newPage();
  try{
    const response=await load(nativePage,large.native_url);
    assert.equal(response.http,200);
    const search=nativePage.locator('[data-js="gflow-inbox-search"]');
    assert.equal(await search.count(),1);
    await search.fill(large.target_name);await search.dispatchEvent('keyup');
    await nativePage.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').length===0,null,{timeout:15000});
    const stale=await nativePage.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+target+'"]').count();
    const count=wp("wp_set_current_user("+large.officer+");require_once WP_PLUGIN_DIR.'/gravity-presentation-profiles/tests/qualification-custom-inbox/cell-boundary.php';$r=cellq_rows(array('form_id'=>"+large.form_id+"),true);echo is_array($r)?count($r):'ERROR';");
    assert.equal(count,'46');assert.equal(stale,0,'Native displayed stale task after host transition');
    rec('multi47','native',390,'E_NATIVE_ASSIGNMENT_TRANSITION',{before:47,after:46,
      staleRenderedRows:stale,hostAuthorizedRows:46,removedTask:target,serverAuthority:'Gravity Flow'});
    await snapshot(nativePage,'after-native-assignment-transition-native-390');
  }finally{await nativeContext.close();}
  report.checks.push('equal_synthetic_identities_and_officer_permissions');
  report.checks.push('independent_viewer_and_anonymous_denial');
  report.checks.push('native_host_transition_removes_assigned_inbox2_task');
  report.status='COMPARISON_CAPTURED_WITH_PER_SCENARIO_OUTCOMES';
  save();console.log('CIQ2_COMPARATIVE_CAPTURED '+report.cases.length);
}catch(e){report.status='FAIL';report.error=String(e.stack||e);save();throw e;}
finally{
  let cleanupError=null;
  if(expanded){try{const msg=fixture('cleanup');report.cleanup=msg;}catch(e){cleanupError=e;report.cleanupError=String(e);report.status='FAIL_CLEANUP';}}
  if(browser)await browser.close();
  save();
  if(cleanupError)throw cleanupError;
}
