import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, base=env.WU21_BASE_URL, out=env.WU21_ARTIFACT_DIR;
assert.equal(base,'http://127.0.0.1:8080','Run only inside disposable WU21');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'ciq2-comparison-manifest.json'),'utf8'));
assert.equal(manifest.all_ids.length,47);
const root=path.join(env.WU21_WP_PATH,'wp-content/plugins/gravityflow');
const zip=env.WU21_FLOW_ZIP;
const sha=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
assert.equal(sha,'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404');
fs.copyFileSync('tests/qualification-custom-inbox/native-search-trace.php',
    path.join(env.WU21_WP_PATH,'wp-content/mu-plugins/native-search-trace.php'));

const report={head:env.GPP_WU21_REPOSITORY_SHA,packageSHA256:sha,
  runtime:JSON.parse(fs.readFileSync(path.join(out,'runtime.json'),'utf8')),
  status:'RUNNING',sourceHits:[],cases:[],screenshots:[],errors:[],
  limitation:'Search classification requires observed browser behavior, not these source hints alone'};
const reportPath=path.join(out,'native-cross-page-search.json');
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
function wp(code){
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {env,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
const oracle=JSON.parse(wp("wp_set_current_user("+manifest.officer+");require_once WP_PLUGIN_DIR.'/gravity-presentation-profiles/tests/qualification-custom-inbox/cell-boundary.php';$r=cellq_rows(array('form_id'=>"+manifest.form_id+"),true);echo wp_json_encode(array_map('intval',array_column($r,'id')));"));
assert.equal(oracle.length,47);
assert.deepEqual([...oracle].sort((a,b)=>a-b),[...manifest.all_ids].sort((a,b)=>a-b));
report.authorized={officer:manifest.officer,form:manifest.form_id,taskCount:47,
  target:manifest.target_id,allIds:oracle,source:'authentic Gravity Flow server-side query under officer'};
function scanSource(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const f=path.join(dir,ent.name);
    if(ent.isDirectory()){scanSource(f);continue;}
    if(!/\.(php|js)$/.test(ent.name))continue;
    const size=fs.statSync(f).size;
    if(size>3500000)continue;
    const s=fs.readFileSync(f,'utf8');
    const pattern=/quickFilterText|setQuickFilter|gflow-inbox-search|globalInboxSearch|gravityflow_inbox_search_criteria|onFilterChanged|inbox\/changes|rowModelType|paginationPageSize/gi;
    let match,seen=0;
    while((match=pattern.exec(s))!==null && seen++<5 && report.sourceHits.length<95){
      const begin=Math.max(0,match.index-95),end=Math.min(s.length,match.index+125);
      const line=s.slice(0,match.index).split('\n').length;
      report.sourceHits.push({file:path.relative(root,f),line,term:match[0],
        excerpt:s.slice(begin,end).replace(/\s+/g,' ').slice(0,220)});
    }
  }
}
scanSource(root);
const vendor=path.join(root,'assets/js/dist/vendor-theme.min.js');
if(fs.existsSync(vendor)){
  const js=fs.readFileSync(vendor,'utf8');
  const matches=[...js.matchAll(/(?:AG Grid|agGrid|VERSION|version)[^\n]{0,100}?(\d{1,2}\.\d{1,2}\.\d{1,3})/g)].slice(0,12);
  report.agGridVersionCandidates=matches.map(x=>({term:x[0].slice(0,160),version:x[1]}));
  report.agGridVendor={file:'assets/js/dist/vendor-theme.min.js',sha256:crypto.createHash('sha256').update(js).digest('hex'),firstChars:js.slice(0,180)};
}
report.sourceScan={sourceRoot:'extracted SHA-verified Gravity Flow 3.1.0',
  sourceHitCount:report.sourceHits.length};
function auth(){
  return wp("$u=get_user_by('id',"+manifest.officer+");$e=time()+1800;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);");
}
const cookies=JSON.parse(auth());
async function snapshot(page,name){
  const filename='native-cross-page-'+name+'.png';
  await page.screenshot({path:path.join(out,filename),fullPage:false});
  report.screenshots.push(filename);
}
async function inspect(page){
  return page.evaluate(()=>{
    const box=document.querySelector('[data-js="gflow-inbox"]');
    const rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')]
      .map(x=>Number(x.getAttribute('row-id')));
    const all=[...document.querySelectorAll('input')];
    const inputs=all.map((e,i)=>({i,type:e.type,id:e.id,name:e.name,value:e.value,placeholder:e.placeholder,
      aria:e.getAttribute('aria-label'),dataJs:e.getAttribute('data-js'),
      insideNative:!!box?.contains(e),outer:e.outerHTML.slice(0,350)}));
    const buttons=[...box?.querySelectorAll('button,[role=button]')??[]]
      .map((e,i)=>({i,text:(e.textContent||'').trim().slice(0,90),
        title:e.getAttribute('title'),aria:e.getAttribute('aria-label'),
        dataJs:e.getAttribute('data-js'),outer:e.outerHTML.slice(0,240)}));
    const pager={current:box?.querySelector('[ref=lbCurrent]')?.textContent?.trim(),
      nextEnabled:!box?.querySelector('[ref=btNext]')?.disabled};
    const scripts=[...document.scripts].map(x=>x.src).filter(x=>x.includes('gravityflow')||x.includes('ag-grid'));
    const text=(box?.innerText||'').slice(0,800);
    return {nativePresent:!!box,rows,inputs,buttons,pager,scripts,visibleText:text};
  });
}
function relevantInput(x){
  if(x.insideNative && (x.type==='search'||/search|جست|quick.?filter|gflow-inbox-search/i.test(
     [x.id,x.placeholder,x.aria,x.dataJs,x.outer].join(' '))))return true;
  return /gflow-inbox-search/i.test(x.dataJs||'');
}
async function casePage(browser,width){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addCookies(cookies.map(x=>({...x,url:base})));
  const page=await context.newPage(),network=[],jsErrors=[];
  page.on('pageerror',e=>jsErrors.push(String(e).slice(0,300)));
  page.on('request',req=>{
    const url=new URL(req.url());
    if(url.hostname!=='127.0.0.1')return;
    const pathname=url.pathname;
    if(/wp-json|admin-ajax|gravityflow|admin\.php/.test(pathname)){
      network.push({stage:'request',method:req.method(),path:pathname,
        queryKeys:[...url.searchParams.keys()].filter(x=>!/nonce|token|key/i.test(x)),
        postContentType:req.headers()['content-type']||null});
    }
  });
  page.on('response',res=>{
    const url=new URL(res.url());
    if(url.hostname==='127.0.0.1' && /wp-json|admin-ajax|gravityflow|admin\.php/.test(url.pathname)){
      network.push({stage:'response',method:res.request().method(),path:url.pathname,status:res.status(),
        contentType:res.headers()['content-type']||null});
    }
  });
  const arrival=await page.goto(manifest.native_url,{waitUntil:'networkidle',timeout:40000});
  assert.equal(arrival.status(),200);
  await page.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state:'attached'});
  let initial=await inspect(page);
  assert.ok(!initial.rows.includes(manifest.target_id),'target must be off native first page');
  assert.ok(initial.pager.nextEnabled,'fixture does not reach multiple native pages');
  const record={width,initial,network,jsErrors,attempts:[],offInitialPage:true};
  await snapshot(page,'initial-'+width);
  // Search toggles are clicked only when their native button explicitly advertises Search.
  let toggled=null;
  let inputs=initial.inputs.filter(relevantInput);
  if(!inputs.length){
    const toggle=initial.buttons.find(b=>/search|جست/i.test(
      [b.text,b.title,b.aria,b.dataJs].join(' ')));
    if(toggle){
      await page.locator('[data-js="gflow-inbox"] button,[data-js="gflow-inbox"] [role=button]').nth(toggle.i).click();
      toggled={button:toggle,after:await inspect(page)};
      inputs=toggled.after.inputs.filter(relevantInput);
    }
  }
  record.toggled=toggled;
  record.searchCandidates=inputs;
  if(!inputs.length)record.observation='NO_DISTINCT_NATIVE_SEARCH_INPUT_DISCOVERED';
  const max=Math.min(inputs.length,5);
  for(let i=0;i<max;i++){
    if(i>0){
      await page.goto(manifest.native_url,{waitUntil:'networkidle',timeout:40000});
      await page.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state:'attached'});
      if(toggled)await page.locator('[data-js="gflow-inbox"] button,[data-js="gflow-inbox"] [role=button]').nth(toggled.button.i).click();
    }
    const candidate=inputs[i];
    const field=page.locator('input').nth(candidate.i);
    const attempt={control:candidate,eventSequence:[],networkStart:network.length};
    if(!(await field.isVisible())){attempt.error='NOT_VISIBLE';record.attempts.push(attempt);continue;}
    try{
      // Passive event trace; does not intercept, alter, or reimplement native listeners.
      await page.evaluate(()=>{
        window.__ciqEventTrace=[];
        const input=document.querySelector('[data-js="gflow-inbox-search"]');
        for(const type of ['keydown','keyup','input','search']){
          input.addEventListener(type,e=>window.__ciqEventTrace.push({
            from:'input',type:e.type,key:e.key||null,trusted:e.isTrusted,value:input.value.slice(0,55)
          }),true);
          document.body.addEventListener(type,e=>{
            if(e.target===input)window.__ciqEventTrace.push({
              from:'body',type:e.type,key:e.key||null,trusted:e.isTrusted,value:input.value.slice(0,55)
            });
          });
        }
      });
      await field.fill('');
      await field.pressSequentially(manifest.target_name,{delay:25});
      attempt.eventSequence.push('focus, real keyboard pressSequentially -> input/keydown/keyup');
      await page.waitForTimeout(1900);
      attempt.afterTyping=await inspect(page);
      attempt.targetFoundAfterTyping=attempt.afterTyping.rows.includes(manifest.target_id);
      await snapshot(page,'typed-'+width+'-'+i);
      if(!attempt.targetFoundAfterTyping){
        await field.press('Enter');
        attempt.eventSequence.push('Enter keydown/keyup');
        await page.waitForTimeout(1900);
        attempt.afterEnter=await inspect(page);
        await snapshot(page,'enter-'+width+'-'+i);
      }
      attempt.inputValue=await field.inputValue();
      attempt.inputMatchesUniqueTarget=attempt.inputValue===manifest.target_name;
      assert.ok(attempt.inputMatchesUniqueTarget, 'Typed native search value differs from synthetic target');
      attempt.targetFoundWithoutPagination=attempt.targetFoundAfterTyping||
        !!attempt.afterEnter?.rows.includes(manifest.target_id);
      if(attempt.targetFoundWithoutPagination){
        const resultRows=attempt.afterTyping.rows.includes(manifest.target_id)?attempt.afterTyping.rows:attempt.afterEnter.rows;
        assert.deepEqual(resultRows,[manifest.target_id], 'Unique off-page task was not the only native search result');
        const link=page.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+manifest.target_id+'"] a[data-js="inbox-details-link"]').first();
        attempt.detailHref=await link.getAttribute('href');
        assert.equal(new URL(attempt.detailHref,base).searchParams.get('lid'),String(manifest.target_id));
        attempt.directNativeDetailAvailable=true;
      }
      attempt.eventTrace=await page.evaluate(()=>window.__ciqEventTrace||[]);
      const decisiveEvents=attempt.eventTrace.filter(e=>e.from==='body' &&
        (e.type==='search'||(e.type==='keyup'&&e.key==='Enter')));
      const searchIndex=decisiveEvents.findIndex(e=>e.type==='search');
      const enterKeyupIndex=decisiveEvents.findIndex(e=>e.type==='keyup'&&e.key==='Enter');
      attempt.enterEventOrder=decisiveEvents.map(e=>e.type==='keyup'?'keyup:Enter':'search');
      if(searchIndex>=0 && enterKeyupIndex>=0){
        attempt.enterExpectedToFind=searchIndex<enterKeyupIndex;
        assert.equal(attempt.targetFoundWithoutPagination,attempt.enterExpectedToFind,
          'Native search/keyup event ordering does not explain Enter outcome');
      }
      if(!attempt.targetFoundWithoutPagination){
        // Discriminator: same input with the prior fill()+keyup technique, no navigation.
        await field.fill(manifest.target_name);
        await field.dispatchEvent('keyup');
        await page.waitForTimeout(1500);
        attempt.afterSyntheticKeyup=await inspect(page);
        attempt.syntheticKeyupRecovered=attempt.afterSyntheticKeyup.rows.includes(manifest.target_id);
        attempt.eventTraceAfterSynthetic=await page.evaluate(()=>window.__ciqEventTrace||[]);
        await snapshot(page,'synthetic-retry-'+width+'-'+i);
      }
      attempt.network=network.slice(attempt.networkStart);
      const seen=[...attempt.afterTyping.rows,...attempt.afterEnter?.rows??[]];
      attempt.onlyAuthorizedIds=seen.every(id=>oracle.includes(id));
      assert.ok(attempt.onlyAuthorizedIds,'Unrecognized task visible in authorized native Inbox');
    }catch(e){attempt.error=String(e).slice(0,500);}
    record.attempts.push(attempt);save();
  }
  // Independent control: reproduce the previous fill()+keyup route with an unambiguous
  // synthetic value, then validate nonmatch and clear. This is deliberately kept
  // separate from genuine keyboard/Enter evidence.
  const controlPage=await context.newPage();
  try{
    const controlResponse=await controlPage.goto(manifest.native_url,{waitUntil:'networkidle',timeout:40000});
    assert.equal(controlResponse.status(),200);
    await controlPage.locator('[data-js="gflow-inbox"] .ag-row[row-id]').first().waitFor({state:'attached'});
    const quick=controlPage.locator('[data-js="gflow-inbox-search"]');
    assert.equal(await quick.count(),1);
    const ids=()=>controlPage.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')
       .evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('row-id'))));
    await quick.fill(manifest.target_name);
    await quick.dispatchEvent('keyup');
    await controlPage.waitForFunction(target=>{
      const rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
      return rows.length===1&&Number(rows[0].getAttribute('row-id'))===target;
    },manifest.target_id,{timeout:10000});
    const uniqueResult=await ids();
    assert.deepEqual(uniqueResult,[manifest.target_id],'Distinct native Quick Filter control must find off-page target');
    const nativeDetail=controlPage.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="'+manifest.target_id+'"] a[data-js="inbox-details-link"]').first();
    const nativeDetailHref=await nativeDetail.getAttribute('href');
    assert.equal(new URL(nativeDetailHref,base).searchParams.get('lid'),String(manifest.target_id));
    await quick.fill('NO_MATCH_SYNTHETIC_927347');
    await quick.dispatchEvent('keyup');
    await controlPage.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').length===0,null,{timeout:10000});
    const nonmatchResult=await ids();
    await quick.fill('');
    await quick.dispatchEvent('keyup');
    await controlPage.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').length===20,null,{timeout:10000});
    const resetResult=await ids();
    assert.ok(resetResult.every(id=>oracle.includes(id)),'Reset shows unauthorized task');
    assert.ok(!resetResult.includes(manifest.target_id),'Initial page did not restore after reset');
    // A native 'search' event clears the grid; a keyup reapplies the text.
    // Exercise both orders against the actual loaded Flow/AG Grid handlers.
    await quick.fill(manifest.target_name);
    await quick.dispatchEvent('search');
    await quick.dispatchEvent('keyup');
    await controlPage.waitForFunction(target=>{
      const rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
      return rows.length===1&&Number(rows[0].getAttribute('row-id'))===target;
    },manifest.target_id,{timeout:10000});
    const searchThenKeyup=await ids();
    await quick.dispatchEvent('search');
    await controlPage.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').length===20,null,{timeout:10000});
    const keyupThenSearch=await ids();
    await quick.dispatchEvent('keyup');
    await controlPage.waitForFunction(target=>{
      const rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]')];
      return rows.length===1&&Number(rows[0].getAttribute('row-id'))===target;
    },manifest.target_id,{timeout:10000});
    assert.deepEqual(await ids(),[manifest.target_id]);
    record.quickFilterControl={method:'unique fill()+synthetic keyup',uniqueResult,nonmatchResult,
      resetCount:resetResult.length,pager:(await inspect(controlPage)).pager,nativeDetailHref,
      searchThenKeyup,keyUpThenSearchResult:keyupThenSearch,
      scope:'cross-page matching, negative control, reset, both event orders, authentic officer permissions'};
    await snapshot(controlPage,'keyup-control-'+width);
  }finally{await controlPage.close();}
  report.cases.push(record);
  save();
  assert.ok(record.attempts.length>0 && record.attempts.every(a=>!a.error&&a.inputMatchesUniqueTarget&&a.onlyAuthorizedIds),
    'Native keyboard/input or event-order witness failed at viewport '+width);
  assert.deepEqual(record.quickFilterControl.uniqueResult,[manifest.target_id]);
  assert.deepEqual(record.quickFilterControl.nonmatchResult,[]);
  assert.equal(record.quickFilterControl.resetCount,20);
  assert.deepEqual(record.quickFilterControl.searchThenKeyup,[manifest.target_id]);
  assert.equal(record.quickFilterControl.keyUpThenSearchResult.length,20);
  await context.close();
  save();
}
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const width of [1280,390])await casePage(browser,width);
  report.status='CAPTURED_INTERPRETATION_REQUIRED';
  save();
  console.log('NATIVE_CROSS_PAGE_SEARCH_CAPTURED '+report.cases.length);
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e));save();throw e;}
finally{if(browser)await browser.close();save();}
