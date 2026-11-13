/**
 * Real Elementor 4.4.0 editor UI: palette -> two Atomic inserts -> two native
 * PropValue control edits -> save_builder response -> reload and safe Twing preview.
 * Never inject _elementor_data or editor DOM fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, origin=env.WU21_BASE_URL, dir=env.WU21_ARTIFACT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'p1c-atomic-fixture.json'),'utf8'));
const checks=[];
let mobileDiagnostics=null;
const diagnosticErrors=[];
function wp(code) {
  const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],
    {encoding:'utf8',env,timeout:60000});
  assert.equal(r.status,0,r.stderr||r.stdout);
  return r.stdout.trim();
}
function cookies(id) {
  const s="$u=get_user_by('id',"+Number(id)+");$e=time()+3600;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);";
  return JSON.parse(wp(s)).map(x=>({...x,url:origin}));
}
function saveResponse(resp) {
  if (!resp.url().includes('admin-ajax.php') || resp.request().method()!=='POST') return false;
  let body=resp.request().postData()||'';
  return body.includes('save_builder');
}
async function assertSaved(response) {
  const json=await response.json();
  const values=Object.values(json?.data?.responses||{});
  assert.ok(response.ok() && values.some(x=>x?.success===true),
    'Real Elementor save_builder response was not successful');
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page, context, failed=null;
try {
  context=await browser.newContext({viewport:{width:1280,height:900}});
  page=await context.newPage();
  page.on('pageerror',error=>diagnosticErrors.push({type:'pageerror',message:String(error).slice(0,400)}));
  page.on('console',message=>{
    if(message.type()==='error')diagnosticErrors.push({type:'console',message:message.text().slice(0,400)});
  });
  await page.goto(origin+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(env.P1C_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(env.P1C_ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/wp-admin\//,{timeout:45000}),
    page.locator('#wp-submit').click()
  ]);
  checks.push('WORDPRESS_REAL_UI_LOGIN_AND_ADMIN_SESSION');
  let forbiddenAjax=0;
  page.on('request',req=>{
    if (req.postData()?.includes('gpp_inbox2_atomic_bootstrap') ||
        req.postData()?.includes('gpp_inbox2_read')) forbiddenAjax++;
  });
  const editorUrl=origin+'/wp-admin/post.php?post='+fixture.post_id+'&action=elementor';
  const navigation=await page.goto(editorUrl,{waitUntil:'domcontentloaded',timeout:90000});
  assert.ok(navigation?.ok() && page.url().includes('/wp-admin/post.php') &&
    new URL(page.url()).searchParams.get('action')==='elementor',
    'Authentic Elementor editor was not served: '+page.url()+' (HTTP '+navigation?.status()+')');
  await page.locator('#elementor-preview-iframe').waitFor({state:'visible',timeout:90000});
  await page.locator('#elementor-loading').waitFor({state:'hidden',timeout:90000});
  const top=page.locator('#elementor-editor-wrapper-v2');
  const frame=page.frameLocator('#elementor-preview-iframe');
  const values=[fixture.forms.a,fixture.forms.b];
  for (let i=0;i<values.length;i++) {
    await top.locator('button[aria-label="Add Element"]').click();
    const palette=page.locator('#elementor-panel-category-v4-elements [data-library-element-type="e-gpp-inbox-2"]');
    await palette.waitFor({state:'visible',timeout:30000});
    await palette.click();
    await frame.locator('[data-widget_type="e-gpp-inbox-2.default"]').nth(i).waitFor({state:'visible',timeout:45000});
    const placeholder=frame.locator('[data-gpp-atomic-inbox2="pending"]').nth(i);
    await placeholder.waitFor({state:'visible',timeout:30000});
    assert.match(await placeholder.innerText(), /فهرست کارها/);
    assert.doesNotMatch(await placeholder.innerHTML(), /data-ciq2-nonce|SYN-P1C-/);
    checks.push('REAL_V4_ATOMIC_INSERTION_AND_STATIC_TWING_PREVIEW_'+(i+1));
    const field=label=>page.locator('[data-type="settings-field"]')
      .filter({has:page.locator('label').filter({hasText:new RegExp('^'+label+'$')})}).getByRole('textbox');
    const form=field('Gravity Forms form ID');
    const native=field('Published Native Gravity Flow Inbox page ID');
    // The real Elementor 4.4 control Section starts collapsed in the
    // screenshot captured on run 43014597612. Expand it through the editor
    // UI rather than treating its hidden fields as a runtime failure.
    const heading=page.getByText('Inbox source',{exact:true}).first();
    await heading.waitFor({state:'visible',timeout:30000});
    if (!(await form.isVisible())) await heading.click();
    await form.waitFor({state:'visible',timeout:30000});
    await form.fill(String(values[i])); await form.blur();
    if (!(await native.isVisible())) await heading.click();
    await native.waitFor({state:'visible',timeout:30000});
    await native.fill(String(fixture.native_page_id)); await native.blur();
    assert.equal(await frame.locator('[data-gpp-atomic-inbox2="pending"]').count(),i+1);
  }
  assert.equal(forbiddenAjax,0,'Editor preview attempted private task bootstrap');
  checks.push('REAL_V4_PALETTE_INSERT_AND_TWO_ATOMIC_CONTROL_EDITS','DATA_FREE_TWING_PREVIEW');

  // This disposable page intentionally has two sibling Atomic widgets.
  // A default e-flexbox row can squeeze their contents to ~26px at 390px.
  // Use the REAL native Elementor responsive container control, rather than
  // hard-coding the parent layout in the GPP widget or mutating saved JSON.
  await page.locator('[aria-label="Switch Device"]').getByTestId('switch-device-to-mobile').click();
  // The screenshot from exact-head run 43021731828 establishes a real
  // Structure panel containing ONE Flexbox parent and two GPP children.
  // The Twig placeholder's immediate DOM parent is NOT the native Flexbox;
  // select the parent using Elementor's own Structure UI, not a guessed
  // HTML ancestor or a forced CSS override.
  const structureLabels=await page.getByText('Flexbox',{exact:true}).all();
  const panel=page.locator('#elementor-panel');
  // Real 4.4 editor may mount more than one text node for the same Structure
  // label. Select the *visible* Structure item and independently verify the
  // native parent controls took focus; do not infer the parent by DOM nesting.
  const selectionEvidence=[];
  let nativeParentSelected=false;
  for(const item of structureLabels){
    const visible=await item.isVisible();
    selectionEvidence.push({visible});
    if(!visible)continue;
    await item.click();
    const title=await panel.locator('h1,h2,h3').allTextContents();
    selectionEvidence[selectionEvidence.length-1].title=title.slice(0,4);
    if(await panel.getByText(/Edit Flexbox/i).first().isVisible().catch(()=>false)){
      nativeParentSelected=true;
      break;
    }
  }
  assert.ok(nativeParentSelected,
    'Native Elementor Flexbox parent could not be selected in Structure: '+
      JSON.stringify(selectionEvidence));
  await panel.getByRole('tab',{name:'Style',exact:true}).click();
  const layout=panel.locator('[aria-label="Layout section content"]');
  if (!(await layout.isVisible())) {
    await panel.locator('.MuiButtonBase-root').filter({hasText:/^Layout$/i}).first().click();
  }
  await layout.waitFor({state:'visible',timeout:15000});
  const display=layout.locator('label').filter({hasText:/^display$/i}).first().locator('xpath=../..');
  const flex=display.locator('button[value="flex"]');
  if (!(await flex.getAttribute('class')||'').includes('Mui-selected')) await flex.click();
  const direction=layout.locator('label').filter({hasText:/^direction$/i}).first().locator('xpath=../../..');
  const column=direction.locator('button[value="column"]');
  await column.waitFor({state:'visible',timeout:15000});
  if (!(await column.getAttribute('class')||'').includes('Mui-selected')) await column.click();
  // Diagnose the real host layout without changing the native Elementor controls.
  // Keep the existing Column assertion: a selected MUI button is not proof.
  const startedAt=Date.now();
  const samplePeriodMs=200, minimumObservationMs=2500, maximumObservationMs=6500;
  const stabilitySamplesRequired=4;
  async function observeMobile(phase) {
    const state=await frame.locator('[data-gpp-atomic-inbox2="pending"]').first()
      .evaluate(node=>{
        const hosts=[...document.querySelectorAll('[data-gpp-atomic-inbox2="pending"]')];
        const widgets=hosts.map(host=>
          host.closest('[data-widget_type="e-gpp-inbox-2.default"]') ||
          host.closest('[data-id]') || host);
        const rect=element=>{
          if(!element)return null;
          const r=element.getBoundingClientRect();
          return Object.fromEntries(['x','y','width','height','top','left','right','bottom']
            .map(key=>[key,Math.round(r[key]*10)/10]));
        };
        const ancestors=[];let element=node.parentElement;
        while(element&&ancestors.length<16){
          const style=getComputedStyle(element);
          ancestors.push({type:element.getAttribute('data-e-type'),
            id:element.getAttribute('data-id'),display:style.display,
            layout:style.flexDirection,containsBoth:hosts.every(x=>element.contains(x))});
          element=element.parentElement;
        }
        const native=(()=>{let el=widgets[0]?.parentElement||null;
          while(el){
            if(el.getAttribute('data-e-type')==='e-flexbox' &&
                widgets.every(widget=>el.contains(widget)))return el;
            el=el.parentElement;
          }
          return null;
        })();
        const directChild=widget=>{
          if(!native||!widget)return null;
          let el=widget;
          while(el.parentElement&&el.parentElement!==native)el=el.parentElement;
          return el.parentElement===native?el:null;
        };
        const childOwners=widgets.map(directChild);
        const parentStyle=native?getComputedStyle(native):null;
        const boxes=widgets.map((widget,i)=>{
          const style=getComputedStyle(widget);
          return {id:widget.getAttribute('data-id'),
            type:widget.getAttribute('data-e-type'),
            widgetType:widget.getAttribute('data-widget_type'),
            directChildId:childOwners[i]?.getAttribute('data-id')??null,
            directChildDistinct:!!childOwners[i]&&
              childOwners.every((other,j)=>i===j||other!==childOwners[i]),
            wrapperDisplay:style.display,wrapperRect:rect(widget),
            visible:getComputedStyle(hosts[i]).visibility!=='hidden'&&
              getComputedStyle(hosts[i]).display!=='none'&&
              hosts[i].getBoundingClientRect().width>0&&
              hosts[i].getBoundingClientRect().height>0,
            rect:rect(hosts[i])};
        });
        const first=boxes[0]?.rect,second=boxes[1]?.rect;
        const intersection=first&&second?Math.max(0,
          Math.min(first.right,second.right)-Math.max(first.left,second.left))*
          Math.max(0,Math.min(first.bottom,second.bottom)-Math.max(first.top,second.top)):null;
        const vertical=!!(boxes.length===2&&boxes.every(x=>x.visible)&&
          first&&second&&second.top>first.top&&second.top>=first.bottom-2);
        return {canvas:{innerWidth:innerWidth,innerHeight:innerHeight,
            clientWidth:document.documentElement.clientWidth,
            visualViewportWidth:visualViewport?.width??null,
            devicePixelRatio:devicePixelRatio},
          atomicHostCount:hosts.length,widgetCount:widgets.length,ancestry:ancestors,
          nativeParent:native?{id:native.getAttribute('data-id'),
            type:native.getAttribute('data-e-type'),
            display:parentStyle.display,flexDirection:parentStyle.flexDirection,
            flexWrap:parentStyle.flexWrap,position:parentStyle.position,
            justifyContent:parentStyle.justifyContent,
            alignItems:parentStyle.alignItems,rect:rect(native),
            ownsBoth:widgets.length===2&&widgets.every(widget=>native.contains(widget)),
            distinctDirectChildren:childOwners.length===2&&childOwners.every(Boolean)&&
              childOwners[0]!==childOwners[1]}:null,
          widgets:boxes,geometry:{vertical,intersectionArea:intersection}};
      });
    return {phase,elapsedMs:Date.now()-startedAt,
      browserViewport:page.viewportSize(),
      iframeRectangle:await page.locator('#elementor-preview-iframe').boundingBox(),
      mobileControlClass:(await page.locator('[aria-label="Switch Device"]')
        .getByTestId('switch-device-to-mobile').getAttribute('class').catch(()=>null)),
      columnControlClass:await column.getAttribute('class'),
      ...state};
  }
  const signature=snapshot=>JSON.stringify({
    canvas:snapshot.canvas,nativeParent:snapshot.nativeParent,
    widgets:snapshot.widgets,geometry:snapshot.geometry,
    iframeRectangle:snapshot.iframeRectangle});
  const immediate=await observeMobile('IMMEDIATE');
  await page.screenshot({path:path.join(dir,'p1c-mobile-immediate.png'),fullPage:true});
  let previous=signature(immediate),settled=immediate,stableCount=0;
  const samples=[{elapsedMs:immediate.elapsedMs,nativeParent:immediate.nativeParent,
    widgets:immediate.widgets,canvas:immediate.canvas,geometry:immediate.geometry}];
  do {
    // This is a measured observation interval, not a fixed-delay success gate.
    await page.waitForTimeout(samplePeriodMs);
    settled=await observeMobile('STABILIZED_SAMPLE');
    const current=signature(settled);
    stableCount=current===previous?stableCount+1:0;
    previous=current;
    samples.push({elapsedMs:settled.elapsedMs,nativeParent:settled.nativeParent,
      widgets:settled.widgets,canvas:settled.canvas,geometry:settled.geometry});
  } while ((settled.elapsedMs<minimumObservationMs ||
      stableCount<stabilitySamplesRequired) &&
      settled.elapsedMs<maximumObservationMs);
  await page.screenshot({path:path.join(dir,'p1c-mobile-stabilized.png'),fullPage:true});
  mobileDiagnostics={head:env.GPP_WU21_REPOSITORY_SHA||null,
    nativeStructureSelection:selectionEvidence,
    samplePeriodMs,minimumObservationMs,maximumObservationMs,
    stabilitySamplesRequired,stableSamplesObserved:stableCount,
    stabilized:stableCount>=stabilitySamplesRequired,
    elapsedMs:settled.elapsedMs,
    immediate,final:settled,samples,
    originalImmediateOracle:immediate.ancestry.some(x=>x.containsBoth&&x.layout==='column'),
    originalSettledOracle:settled.ancestry.some(x=>x.containsBoth&&x.layout==='column'),
    diagnosticErrors};
  // A computed Column on an unrelated ancestor is not a layout oracle.
  const acceptsColumn=s=>s.nativeParent?.type==='e-flexbox'&&
    s.nativeParent.display==='flex'&&s.nativeParent.flexDirection==='column'&&
    s.nativeParent.ownsBoth&&s.nativeParent.distinctDirectChildren&&
    s.widgetCount===2&&s.widgets.every(x=>x.visible&&x.rect.width>0&&x.rect.height>0)&&
    s.geometry.vertical&&s.geometry.intersectionArea===0&&
    s.canvas.innerWidth>0&&s.canvas.innerWidth<s.browserViewport.width;
  mobileDiagnostics.correctedImmediate=acceptsColumn(immediate);
  mobileDiagnostics.correctedSettled=acceptsColumn(settled);
  assert.ok(mobileDiagnostics.stabilized&&acceptsColumn(settled),
    'Native mobile Flexbox must own two painted vertically ordered widgets: '+
    JSON.stringify({parent:settled.nativeParent,widgets:settled.widgets,
      geometry:settled.geometry,canvas:settled.canvas}));
  checks.push('REAL_ATOMIC_MOBILE_PARENT_FLEX_DIRECTION_COLUMN_VIA_EDITOR_UI');
  // Rejection uses genuine Native responsive Row, then restores Column.
  await direction.locator('button[value="row"]').click();
  let realRow=null;
  for(let i=0;i<25;i++){
    realRow=await observeMobile('ROW_NEGATIVE');
    if(realRow.nativeParent?.flexDirection==='row')break;
    await page.waitForTimeout(150);
  }
  mobileDiagnostics.rowNegative=realRow;
  assert.equal(realRow.nativeParent?.flexDirection,'row','Native Row state not established');
  assert.equal(acceptsColumn(realRow),false,'Row must not satisfy Column oracle');
  checks.push('REAL_NATIVE_ROW_REJECTED_BY_STRICT_ORACLE');
  await column.click();
  let restored=null;
  for(let i=0;i<25;i++){
    restored=await observeMobile('COLUMN_RESTORED');
    if(acceptsColumn(restored))break;
    await page.waitForTimeout(150);
  }
  mobileDiagnostics.restoredColumn=restored;
  assert.ok(acceptsColumn(restored),'Native Column must be restored before save');
  checks.push('REAL_NATIVE_COLUMN_RESTORED_BEFORE_SAVE');

  const [saved]=await Promise.all([
    page.waitForResponse(saveResponse,{timeout:60000}),
    top.getByRole('button',{name:'Publish',exact:true}).click()
  ]);
  await assertSaved(saved);
  checks.push('REAL_EDITOR_SAVE_BUILDER_ACCEPTED');
  await page.reload({waitUntil:'domcontentloaded',timeout:90000});
  await page.locator('#elementor-loading').waitFor({state:'hidden',timeout:90000});
  assert.equal(await frame.locator('[data-gpp-atomic-inbox2="pending"]').count(),2);
  assert.equal(forbiddenAjax,0);
  checks.push('REAL_EDITOR_RELOAD_SAFE_TWO_WIDGET_PREVIEW');
  await page.screenshot({path:path.join(dir,'p1c-editor-reload.png'),fullPage:true});
} catch(e) {
  failed=String(e?.stack||e)+'\nEDITOR_LAST_URL='+String(page?.url()||'NO_PAGE');
  process.stderr.write(failed.slice(0,1600)+'\n');
  if(page) await page.screenshot({path:path.join(dir,'p1c-editor-failure.png'),fullPage:true}).catch(()=>{});
} finally {
  fs.writeFileSync(path.join(dir,'p1c-mobile-flexbox-diagnostic.json'),
    JSON.stringify(mobileDiagnostics||{head:env.GPP_WU21_REPOSITORY_SHA||null,
      status:'NOT_CAPTURED',reason:failed,diagnosticErrors},null,2));
  fs.writeFileSync(path.join(dir,'p1c-atomic-editor.json'),JSON.stringify({
    head:env.GPP_WU21_REPOSITORY_SHA||null,elementor:'4.4.0',
    checks,failed
  },null,2));
  await browser.close();
}
if(failed)process.exit(1);
console.log('P1C_AUTHENTIC_ELEMENTOR_EDITOR_PASS');
