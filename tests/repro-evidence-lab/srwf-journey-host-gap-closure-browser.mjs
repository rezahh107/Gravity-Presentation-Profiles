import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned gap-closure environment is incomplete.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_srwf_journey_host_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const formId = Number(manifest.form_id);
const reviewId = Number(manifest.steps.review_id);
const correctionId = Number(manifest.steps.correction_id);
const operatorId = Number(manifest.users.operator.id);
const operatorLogin = manifest.users.operator.login;
const operatorPassword = 'wu21-bootstrap-pass-2026';
const results = [];

function record(id, name, status, details = null) { results.push({ id, name, status, details }); }
async function capture(id, name, fn) {
  try { record(id, name, 'CAPTURED', await fn()); }
  catch (error) { record(id, name, 'ERROR', { error: String(error?.stack || error).slice(0, 12000) }); }
}

async function login(page) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', operatorLogin);
  await page.fill('#user_pass', operatorPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
  if (new URL(page.url()).pathname.endsWith('/wp-login.php')) throw new Error('Synthetic operator authentication failed.');
}

function frontendEntryUrl(entryId) {
  const route = manifest.routes.shortcode;
  const url = new URL(route.url);
  url.searchParams.set('view', 'entry');
  url.searchParams.set('id', String(formId));
  url.searchParams.set('lid', String(entryId));
  return url.toString();
}
function inboxUrl() { return manifest.routes.shortcode.url; }

function createReviewEntry(label) {
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array(
      'form_id'=>${formId},
      'created_by'=>${operatorId},
      '1'=>'SYNTHETIC-${safe}',
      '2'=>'Journey',
      '3'=>'${safe}',
      '4'=>'JRN-GAP-${safe}'
    ));
    if (is_wp_error($entry_id) || !$entry_id) { fwrite(STDERR, is_wp_error($entry_id)?$entry_id->get_error_message():'add_entry failed'); exit(2); }
    $api=new Gravity_Flow_API(${formId});
    $api->process_workflow((int)$entry_id);
    $entry=GFAPI::get_entry((int)$entry_id);
    $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) { fwrite(STDERR,'send_to_step failed'); exit(3); }
    echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid synthetic entry id: ${raw}`);
  return id;
}

function hostState(entryId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${operatorId});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)}); $api=new Gravity_Flow_API(${formId}); $step=$api->get_current_step($entry);
    echo wp_json_encode(array(
      'entry_id'=>(int)$entry['id'],
      'field_1'=>(string)rgar($entry,'1'),
      'workflow_step'=>gform_get_meta((int)$entry['id'],'workflow_step'),
      'workflow_current_status'=>gform_get_meta((int)$entry['id'],'workflow_current_status'),
      'workflow_final_status'=>gform_get_meta((int)$entry['id'],'workflow_final_status'),
      'api_status'=>(string)$api->get_status($entry),
      'current_step'=>$step?array(
        'id'=>(int)$step->get_id(),
        'type'=>(string)$step->get_type(),
        'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step),
        'editable_fields'=>method_exists($step,'get_editable_fields')?array_values(array_map('strval',$step->get_editable_fields())):array()
      ):null,
      'timeline'=>$api->get_timeline($entry)
    ),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

async function actionButton(page, value) {
  const button = page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first();
  if (await button.count() !== 1) throw new Error(`Missing native action ${value}`);
  return button;
}
async function dismissAction(page, value) {
  const button = await actionButton(page, value);
  let dialogInfo = null;
  const dialog = new Promise(resolve => page.once('dialog', async d => { dialogInfo = { type:d.type(), message:d.message() }; await d.dismiss(); resolve(); }));
  await button.click();
  await dialog;
  await page.waitForTimeout(120);
  return dialogInfo;
}
async function acceptAction(page, value) {
  const button = await actionButton(page, value);
  let dialogInfo = null;
  const dialog = new Promise(resolve => page.once('dialog', async d => { dialogInfo = { type:d.type(), message:d.message() }; await d.accept(); resolve(); }));
  await Promise.all([page.waitForNavigation({ waitUntil:'networkidle' }), button.click(), dialog]);
  return dialogInfo;
}

async function printSnapshot(context, entryPage, entryId, forbiddenText = '') {
  const utility = entryPage.locator('[data-gpp-print-utility="dossier"] [data-gpp-dossier-print-url]').filter({ visible:true }).first();
  const utilityCount = await utility.count();
  const url = utilityCount ? await utility.getAttribute('data-gpp-dossier-print-url') : null;
  const directBefore = {
    result: await entryPage.locator('[data-gpp-entry-journey-result]').filter({ visible:true }).count(),
    native_table_visible: await entryPage.locator('.entry-detail-view').filter({ visible:true }).count(),
    print_utility_visible: utilityCount,
  };
  if (!url) return { entry_id:entryId, direct_before:directBefore, print_url:null, print_available:false };

  const printPage = await context.newPage();
  const response = await printPage.goto(url, { waitUntil:'networkidle' });
  const state = {
    entry_id: entryId,
    direct_before: directBefore,
    print_url: url,
    response_status: response?.status() ?? null,
    ready_dossier_count: await printPage.locator('.gpp-print-dossier[data-gpp-print-state="ready"]').count(),
    sheet_count: await printPage.locator('.gpp-print-sheet').count(),
    front_count: await printPage.locator('[data-gpp-print-page="front"]').count(),
    back_count: await printPage.locator('[data-gpp-print-page="back"]').count(),
    forbidden_text_present: forbiddenText ? (await printPage.locator('body').innerText()).includes(forbiddenText) : false,
    body_excerpt: (await printPage.locator('body').innerText()).replace(/\s+/g,' ').slice(0,900),
  };
  await printPage.close();
  return state;
}

async function nodeGeometry(page, selector) {
  return page.evaluate(sel => {
    const all = [...document.querySelectorAll(sel)];
    const el = all.find(n => n.getBoundingClientRect().width > 0 || n.getBoundingClientRect().height > 0) || all[0] || null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const describe = node => node ? `${node.tagName.toLowerCase()}${node.id?`#${node.id}`:''}${typeof node.className==='string' && node.className.trim()?'.'+node.className.trim().replace(/\s+/g,'.'):''}` : null;
    const chain = [];
    let p = el;
    for (let i=0; p && i<8; i++, p=p.parentElement) {
      const r=p.getBoundingClientRect(), s=getComputedStyle(p);
      chain.push({ node:describe(p), rect:{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left}, client:{w:p.clientWidth,h:p.clientHeight}, scroll:{w:p.scrollWidth,h:p.scrollHeight}, overflow:{x:s.overflowX,y:s.overflowY}, display:s.display, position:s.position });
    }
    const matches = [];
    const walk = (rules, href, scope='') => {
      for (const rule of [...rules]) {
        if (rule.cssRules) { try { walk(rule.cssRules, href, scope + (rule.conditionText ? ` @${rule.conditionText}` : '')); } catch {} continue; }
        if (!rule.selectorText || !rule.style) continue;
        let ok=false; try { ok=el.matches(rule.selectorText); } catch {}
        if (!ok) continue;
        const props=['display','position','width','height','min-width','min-height','max-width','max-height','overflow','overflow-x','overflow-y','grid-template-columns','grid-column','flex','flex-wrap','align-items','justify-content','margin','padding'];
        const declarations={};
        for (const prop of props) { const value=rule.style.getPropertyValue(prop); if (value) declarations[prop]={value:value.trim(),priority:rule.style.getPropertyPriority(prop)}; }
        if (Object.keys(declarations).length) matches.push({href,scope,selector:rule.selectorText,declarations});
      }
    };
    for (const sheet of [...document.styleSheets]) { try { walk(sheet.cssRules || [], sheet.href || 'inline'); } catch {} }
    return {
      selector:sel,node:describe(el),parent:describe(el.parentElement),inline_style:el.getAttribute('style'),
      rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,top:rect.top,right:rect.right,bottom:rect.bottom,left:rect.left},
      client:{w:el.clientWidth,h:el.clientHeight},scroll:{w:el.scrollWidth,h:el.scrollHeight},
      computed:{display:cs.display,position:cs.position,width:cs.width,height:cs.height,minWidth:cs.minWidth,minHeight:cs.minHeight,maxWidth:cs.maxWidth,maxHeight:cs.maxHeight,overflowX:cs.overflowX,overflowY:cs.overflowY,gridTemplateColumns:cs.gridTemplateColumns,gridColumn:cs.gridColumn,flex:cs.flex,flexWrap:cs.flexWrap,alignItems:cs.alignItems,justifyContent:cs.justifyContent,margin:cs.margin,padding:cs.padding},
      ancestors:chain,matching_rules:matches
    };
  }, selector);
}

async function inboxGeometry(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(inboxUrl(), { waitUntil:'networkidle' });
  await page.waitForTimeout(200);
  const selectors = {
    inbox:'[data-js="gflow-inbox"]',
    header:'.gflow-grid__header',
    search:'[data-js="gflow-inbox-search"]',
    settings:'.gflow-grid__button--settings',
    fullscreen:'.gflow-grid__button--fullscreen',
    clear_filters:'.gflow-grid__button--clear-filters',
    manual_refresh:'[data-gpp-inbox-manual-refresh]',
    grid_root:'.ag-root-wrapper',
    pager:'.ag-paging-panel',
    pager_rows:'.ag-paging-row-summary-panel',
    pager_pages:'.ag-paging-page-summary-panel',
  };
  const out={viewport};
  for (const [key,sel] of Object.entries(selectors)) out[key]=await nodeGeometry(page,sel);
  return out;
}

async function settingsSnapshot(page) {
  const base = await page.evaluate(() => ({
    notification_supported:'Notification' in window,
    notification_permission:'Notification' in window ? Notification.permission : null,
    local_storage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),
    session_storage:Object.fromEntries(Object.keys(sessionStorage).map(k=>[k,sessionStorage.getItem(k)])),
    cookie:document.cookie,
  }));
  const button=page.locator('.gflow-grid__button--settings').filter({visible:true}).first();
  if (await button.count()!==1) return { capability:'ABSENT', base };
  const buttonMeta=await button.evaluate(el=>({text:el.textContent.replace(/\s+/g,' ').trim(),title:el.getAttribute('title'),aria:el.getAttribute('aria-label'),className:el.className}));
  await button.click(); await page.waitForTimeout(150);
  const panel=await page.evaluate(() => {
    const visible = el => { const r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
    const candidates=[...document.querySelectorAll('[role="dialog"], [class*="settings"], [class*="notification"], [data-js*="settings"], [data-js*="notification"]')].filter(visible);
    const controls=[...document.querySelectorAll('input,select,textarea,button')].filter(visible).map(el=>({tag:el.tagName.toLowerCase(),type:el.type||null,name:el.name||null,value:el.value??null,checked:'checked' in el?el.checked:null,text:el.textContent.replace(/\s+/g,' ').trim(),aria:el.getAttribute('aria-label'),title:el.getAttribute('title'),className:el.className}));
    const notificationText=[...document.querySelectorAll('body *')].filter(visible).map(el=>el.textContent.replace(/\s+/g,' ').trim()).filter(t=>t && t.length<240 && /notification|browser|notify|اعلان|اطلاع/i.test(t)).slice(0,80);
    return {candidates:candidates.map(el=>({tag:el.tagName.toLowerCase(),id:el.id,className:el.className,text:el.textContent.replace(/\s+/g,' ').trim().slice(0,1000)})).slice(0,30),controls:controls.slice(0,120),notification_text:[...new Set(notificationText)]};
  });
  return { capability:'PRESENT', base, button:buttonMeta, panel };
}

function setFormOptIn(enabled) {
  return wpEval(`$form=GFAPI::get_form(${formId}); $classes=preg_split('/\\s+/',trim((string)rgar($form,'cssClass')),-1,PREG_SPLIT_NO_EMPTY); $classes=array_values(array_filter($classes,static function($c){return 'srwf-registration-theme'!==$c;})); ${enabled?'$classes[]="srwf-registration-theme";':''} $form['cssClass']=implode(' ',$classes); $r=GFAPI::update_form($form); if(is_wp_error($r)||true!==$r){fwrite(STDERR,'form class update failed');exit(2);} echo $form['cssClass'];`);
}

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
await login(page);

await capture('SRWF-GAP-A-B-GEOMETRY-001','Pinned Inbox toolbar/pager geometry and cascade capture',async()=>({
  desktop:await inboxGeometry(page,{width:1440,height:1000}),
  mobile:await inboxGeometry(page,{width:390,height:844}),
}));

await capture('SRWF-GAP-F-SETTINGS-001','Native Inbox Settings capability/content/storage capture',async()=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(inboxUrl(),{waitUntil:'networkidle'});
  return await settingsSnapshot(page);
});

await capture('SRWF-GAP-F-DENIED-001','Native Settings behavior with browser notifications denied',async()=>{
  const deniedContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const deniedPage=await deniedContext.newPage();
  await login(deniedPage);
  let permissionControl=null;
  try {
    const cdp=await deniedContext.newCDPSession(deniedPage);
    await cdp.send('Browser.setPermission',{permission:{name:'notifications'},setting:'denied',origin:new URL(baseUrl).origin});
    permissionControl='CDP_DENIED';
  } catch (error) { permissionControl=`UNAVAILABLE: ${String(error)}`; }
  await deniedPage.goto(inboxUrl(),{waitUntil:'networkidle'});
  const snapshot=await settingsSnapshot(deniedPage);
  await deniedContext.close();
  return {permission_control:permissionControl,snapshot};
});

await capture('SRWF-GAP-C-REJECT-NOTE-001','Native Workflow Note visibility, cancel and rejected persistence',async()=>{
  const entryId=createReviewEntry('REJECT-NOTE');
  const note=`GAP-REJECT-NOTE-${entryId}`;
  await page.goto(frontendEntryUrl(entryId),{waitUntil:'networkidle'});
  const noteField=page.locator('#gravityflow-note').first();
  const before=hostState(entryId);
  const noteVisible=await noteField.count()===1 && await noteField.isVisible();
  if (noteVisible) await noteField.fill(note);
  const cancelDialog=await dismissAction(page,'rejected');
  const afterCancel=hostState(entryId);
  const cancelPersisted=JSON.stringify(afterCancel.timeline).includes(note);
  if (noteVisible) await noteField.fill(note);
  const rejectDialog=await acceptAction(page,'rejected');
  const afterReject=hostState(entryId);
  const resultText=await page.locator('[data-gpp-entry-journey-result="rejected"]').first().innerText().catch(()=> '');
  return {
    entry_id:entryId,note,note_visible_before_reject:noteVisible,
    cancel_dialog:cancelDialog,cancel_state_unchanged:afterCancel.current_step?.id===before.current_step?.id && afterCancel.workflow_final_status===before.workflow_final_status,
    cancel_note_persisted:cancelPersisted,
    reject_dialog:rejectDialog,rejected_truth:{workflow_final_status:afterReject.workflow_final_status,api_status:afterReject.api_status,current_step:afterReject.current_step},
    rejected_note_in_timeline:JSON.stringify(afterReject.timeline).includes(note),
    rejected_result_repeats_note:resultText.includes(note),
    result_text:resultText,
  };
});

await capture('SRWF-GAP-D-TERMINAL-PRINT-001','Terminal Approved/Rejected direct revisit and native Print authorization',async()=>{
  const approvedId=createReviewEntry('TERM-APPROVED');
  await page.goto(frontendEntryUrl(approvedId),{waitUntil:'networkidle'}); await acceptAction(page,'approved');
  const approvedState=hostState(approvedId);
  await page.goto(frontendEntryUrl(approvedId),{waitUntil:'networkidle'});
  const approved=await printSnapshot(context,page,approvedId);

  const rejectedId=createReviewEntry('TERM-REJECTED');
  const rejectNote=`GAP-PRINT-NOT-REPEAT-${rejectedId}`;
  await page.goto(frontendEntryUrl(rejectedId),{waitUntil:'networkidle'});
  const nf=page.locator('#gravityflow-note').first(); if(await nf.count()===1) await nf.fill(rejectNote);
  await acceptAction(page,'rejected');
  const rejectedState=hostState(rejectedId);
  await page.goto(frontendEntryUrl(rejectedId),{waitUntil:'networkidle'});
  const rejected=await printSnapshot(context,page,rejectedId,rejectNote);
  return {approved_truth:approvedState,rejected_truth:rejectedState,approved,rejected};
});

await capture('SRWF-GAP-RESULT-RAW-DETAIL-001','Terminal result versus native raw Entry Detail continuation',async()=>{
  const id=createReviewEntry('RAW-DETAIL');
  await page.goto(frontendEntryUrl(id),{waitUntil:'networkidle'}); await acceptAction(page,'approved');
  const state=await page.evaluate(()=>{
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const table=document.querySelector('.entry-detail-view');
    const workflowRegion=document.querySelector('#postbox-container-1');
    const timelineRegion=document.querySelector('#postbox-container-2');
    const identity=document.querySelector('[data-gpp-entry-journey-result="approved"] .gpp-entry-journey__case-context');
    return {
      result_count:[...document.querySelectorAll('[data-gpp-entry-journey-result="approved"]')].filter(visible).length,
      identity_present:Boolean(identity),
      native_table_present:Boolean(table),
      native_table_visible:Boolean(table&&visible(table)),
      native_table_display:table?getComputedStyle(table).display:null,
      workflow_region_present:Boolean(workflowRegion),
      workflow_region_visible:Boolean(workflowRegion&&visible(workflowRegion)),
      timeline_region_present:Boolean(timelineRegion),
      timeline_region_visible:Boolean(timelineRegion&&visible(timelineRegion)),
      status_box_visible:[...document.querySelectorAll('.gravityflow-status-box')].filter(visible).length,
      timeline_visible:[...document.querySelectorAll('.gravityflow-timeline')].filter(visible).length,
      native_print_visible:[...document.querySelectorAll('.detail-view-print')].filter(visible).length,
      gpp_print_visible:[...document.querySelectorAll('[data-gpp-print-utility="dossier"]')].filter(visible).length,
    };
  });
  const closed = state.result_count===1
    && state.identity_present===false
    && state.native_table_present===true
    && state.native_table_visible===false
    && state.workflow_region_present===true
    && state.workflow_region_visible===false
    && state.timeline_region_present===true
    && state.timeline_region_visible===false
    && state.status_box_visible===0
    && state.timeline_visible===0
    && state.native_print_visible===0
    && state.gpp_print_visible===1;
  if(!closed) throw new Error(`MR-5 terminal-result-versus-raw-detail gap remains open: ${JSON.stringify(state)}`);
  return {entry_id:id,host:hostState(id),dom:state,mr5_closed:true};
});

await capture('SRWF-GAP-E-CORRECTION-001','Native User Input validation/navigation/Print isolation',async()=>{
  const validationId=createReviewEntry('CORRECTION-VALIDATION');
  await page.goto(frontendEntryUrl(validationId),{waitUntil:'networkidle'}); await acceptAction(page,'revert');
  const beforeValidation=hostState(validationId);
  const input=page.locator('input[name="input_1"]').first();
  if(await input.count()!==1) throw new Error('Native User Input field missing.');
  await input.fill('');
  const submit=page.locator(`#gform_submit_button_${formId},form[id^="gform_"] input[type="submit"],form[id^="gform_"] button[type="submit"]`).filter({visible:true}).last();
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),submit.click()]);
  const afterValidation=hostState(validationId);
  const validationMessages=await page.locator('.validation_message,.gfield_validation_message,.gform_validation_errors').filter({visible:true}).allInnerTexts();
  const validationPrint=await page.locator('[data-gpp-print-utility="dossier"]').filter({visible:true}).count();

  const leaveId=createReviewEntry('CORRECTION-LEAVE');
  await page.goto(frontendEntryUrl(leaveId),{waitUntil:'networkidle'}); await acceptAction(page,'revert');
  const leaveInput=page.locator('input[name="input_1"]').first(); await leaveInput.fill('UNSAVED-GAP-VALUE');
  let beforeUnload=null;
  const dialogHandler=async d=>{ if(d.type()==='beforeunload'){beforeUnload={type:d.type(),message:d.message()};await d.accept();} };
  page.on('dialog',dialogHandler);
  await page.goto(inboxUrl(),{waitUntil:'networkidle'});
  page.off('dialog',dialogHandler);
  const afterLeave=hostState(leaveId);
  return {
    validation:{entry_id:validationId,before:beforeValidation,after:afterValidation,messages:validationMessages,remained_user_input:afterValidation.current_step?.id===correctionId && afterValidation.current_step?.type==='user_input',print_utility_visible:validationPrint},
    navigation_leave:{entry_id:leaveId,beforeunload_dialog:beforeUnload,after:afterLeave,task_remains_pending:afterLeave.current_step?.id===correctionId && afterLeave.current_step?.type==='user_input',unsaved_value_persisted:afterLeave.field_1==='UNSAVED-GAP-VALUE'}
  };
});

await capture('SRWF-GAP-E-GTB-001','Exact GTB 0.1.19 exclusion on Gravity Flow User Input',async()=>{
  const pluginStatus=wpEval("echo is_plugin_active('srwf-registration-theme/srwf-registration-theme.php')?'active':'inactive';");
  const classValue=setFormOptIn(true);
  try {
    const id=createReviewEntry('GTB-COEXIST');
    await page.goto(frontendEntryUrl(id),{waitUntil:'networkidle'}); await acceptAction(page,'revert');
    const state=await page.evaluate(()=>({
      registration_style_link_count:document.querySelectorAll('link#srwf-registration-theme-css,link[href*="srwf-registration.css"]').length,
      form_class:document.querySelector('form[id^="gform_"]')?.className||null,
      editable_visible:[...document.querySelectorAll('input[name^="input_"],textarea[name^="input_"],select[name^="input_"]')].filter(el=>el.offsetParent!==null).map(el=>el.name),
      body_classes:document.body.className,
    }));
    return {plugin_status:pluginStatus,opt_in_form_class:classValue,entry_id:id,host:hostState(id),browser:state};
  } finally { setFormOptIn(false); }
});

await capture('SRWF-GAP-G-STALE-TAB-001','Stale Approval action from a second tab after terminal commit',async()=>{
  const id=createReviewEntry('STALE-TAB');
  const a=page;
  const b=await context.newPage();
  await a.goto(frontendEntryUrl(id),{waitUntil:'networkidle'});
  await b.goto(frontendEntryUrl(id),{waitUntil:'networkidle'});
  const before=hostState(id);
  const firstDialog=await acceptAction(a,'approved');
  const afterFirst=hostState(id);
  let secondDialog=null,secondError=null;
  try { secondDialog=await acceptAction(b,'rejected'); }
  catch(error){ secondError=String(error?.stack||error).slice(0,6000); }
  const afterSecond=hostState(id);
  const secondBody=(await b.locator('body').innerText().catch(()=>'' )).replace(/\s+/g,' ').slice(0,1600);
  await b.close();
  return {entry_id:id,before,first_dialog:firstDialog,after_first:afterFirst,second_dialog:secondDialog,second_error:secondError,after_second:afterSecond,second_page_excerpt:secondBody,first_commit_preserved:afterSecond.workflow_final_status===afterFirst.workflow_final_status && afterSecond.api_status===afterFirst.api_status};
});

await browser.close();

const output={schema_version:'1.1.0',data_class:'SYNTHETIC_NON_PII',scope:'QUALIFICATION_ONLY',runtime:manifest.runtime,results};
fs.writeFileSync(`${artifactDir}/srwf-journey-host-gap-closure-browser.json`,JSON.stringify(output,null,2)+'\n');
const errors=results.filter(r=>r.status==='ERROR');
console.log(`SRWF_JOURNEY_HOST_GAP_CLOSURE_CAPTURED ${results.length}`);
if(errors.length){console.error(JSON.stringify(errors,null,2));process.exit(1);}
