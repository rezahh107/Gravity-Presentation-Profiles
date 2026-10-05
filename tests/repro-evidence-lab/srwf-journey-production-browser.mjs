import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Pinned production-journey environment is incomplete.');

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
const negativeId = Number(manifest.users.negative_control.id);
if (manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED') throw new Error('Production Entry Detail presentation was not admitted in the lab.');

function hostState(entryId, userId = operatorId) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${Number(userId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)}); $api=new Gravity_Flow_API(${formId}); $step=$api->get_current_step($entry);
    echo wp_json_encode(array('field_1'=>(string)rgar($entry,'1'),'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),'api_status'=>(string)$api->get_status($entry),'current_step'=>$step?array('id'=>(int)$step->get_id(),'type'=>(string)$step->get_type(),'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step),'editable_fields'=>method_exists($step,'get_editable_fields')?array_values(array_map('strval',$step->get_editable_fields())):array()):null),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function createReviewEntry(label) {
  const safe = String(label).replace(/[^A-Z0-9_-]/gi, '-');
  const raw = wpEval(`
    wp_set_current_user(${operatorId});
    $entry_id=GFAPI::add_entry(array('form_id'=>${formId},'created_by'=>${operatorId},'1'=>'SYNTHETIC-${safe}','2'=>'Journey','3'=>'${safe}','4'=>'JRN-MR2-${safe}'));
    if (is_wp_error($entry_id) || !$entry_id) { fwrite(STDERR, 'add_entry failed'); exit(2); }
    $api=new Gravity_Flow_API(${formId}); $api->process_workflow((int)$entry_id); $entry=GFAPI::get_entry((int)$entry_id); $sent=$api->send_to_step($entry,${reviewId});
    if (false===$sent || is_wp_error($sent)) { fwrite(STDERR, 'send_to_step failed'); exit(3); } echo (int)$entry_id;
  `);
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid synthetic Review entry id: ${raw}`);
  return id;
}

function frontendEntryUrl(route, entryId) {
  const url = new URL(route.url); url.searchParams.set('view','entry'); url.searchParams.set('id',String(formId)); url.searchParams.set('lid',String(entryId)); return url.toString();
}
const adminEntryUrl = entryId => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${formId}&lid=${entryId}`;
const results = [];
async function test(id, name, fn) { try { results.push({ id, name, status:'PASS', details:await fn() }); } catch (error) { results.push({ id, name, status:'FAIL', details:{ error:String(error?.stack || error).slice(0,12000) } }); } }

async function authenticate(page, userId) {
  const cookies = JSON.parse(wpEval(`
    $expiration=time()+3600;
    echo wp_json_encode(array(
      array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie(${Number(userId)},$expiration,'auth'),'expires'=>$expiration),
      array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie(${Number(userId)},$expiration,'logged_in'),'expires'=>$expiration)
    ),JSON_UNESCAPED_SLASHES);
  `));
  const target = new URL(baseUrl);
  await page.context().clearCookies();
  await page.context().addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,domain:target.hostname,path:'/',expires:Number(cookie.expires),httpOnly:true,secure:false,sameSite:'Lax'})));
}

async function returnControls(page) {
  return page.evaluate(() => ({
    gpp:[...document.querySelectorAll('a.gpp-entry-journey__return')].filter(a=>a.offsetParent!==null).map(a=>({text:a.textContent.replace(/\s+/g,' ').trim(),href:a.href})),
    native:[...document.querySelectorAll('.gravityflow-back-link-container a.back-link')].filter(a=>a.offsetParent!==null).map(a=>({text:a.textContent.replace(/\s+/g,' ').trim(),href:a.href}))
  }));
}
function comparable(url) { const u=new URL(url); for (const k of ['view','lid','id','paged','search','sort','sort_field','sort_direction']) u.searchParams.delete(k); return `${u.origin}${u.pathname}${u.search}`; }
async function assertReturn(page, route) {
  const controls=await returnControls(page); const all=[...controls.gpp,...controls.native];
  if (all.length!==1) throw new Error(`Expected exactly one visible return control: ${JSON.stringify(controls)}`);
  if (controls.gpp.length===1 && all[0].text!=='بازگشت به کارهای من') throw new Error(`GPP return copy drifted: ${JSON.stringify(all[0])}`);
  if (comparable(all[0].href)!==comparable(route.url)) throw new Error(`Return is not canonical Inbox page 1: ${JSON.stringify({actual:all[0].href,expected:route.url})}`);
  return controls;
}
async function clickReturn(page, route) {
  await assertReturn(page, route);
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.locator('a.gpp-entry-journey__return, .gravityflow-back-link-container a.back-link').filter({visible:true}).first().click()]);
  const current=new URL(page.url()); for (const k of ['view','lid','id','paged','search','sort','sort_field','sort_direction']) if (current.searchParams.has(k)) throw new Error(`Canonical return retained ${k}`);
  if (comparable(current.toString())!==comparable(route.url) || await page.locator('[data-js="gflow-inbox"]').count()!==1) throw new Error(`Canonical Inbox page 1 was not reached: ${current}`);
  return current.toString();
}
async function nativeActions(page) { return page.locator('.gravityflow-status-box .gravityflow-action-buttons button').evaluateAll(nodes=>nodes.filter(n=>n.offsetParent!==null).map(n=>({value:n.value,onclick:n.getAttribute('onclick')||''}))); }
async function accept(page, value) {
  const button=page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first(); if(await button.count()!==1) throw new Error(`Missing native action ${value}`);
  let dialogInfo=null; const dialog=new Promise(resolve=>page.once('dialog',async d=>{dialogInfo={type:d.type(),message:d.message()};await d.accept();resolve();}));
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),button.click(),dialog]); return dialogInfo;
}

async function actionState(page) {
  return page.evaluate(() => {
    const region=document.querySelector('.gravityflow-status-box .gravityflow-action-buttons');
    const status=document.querySelector('.gpp-entry-review-action-status');
    const buttons=[...document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button[value]')].filter(button=>['approved','rejected','revert'].includes(button.value));
    return {busy:region?.getAttribute('aria-busy')||null,marker:region?.dataset.gppMaterialActionBusy||null,status_present:Boolean(status),status_hidden:status?.hidden??null,status_role:status?.getAttribute('role')||null,status_live:status?.getAttribute('aria-live')||null,status_text:status?.textContent.replace(/\s+/g,' ').trim()||'',buttons:buttons.map(button=>({value:button.value,disabled:button.disabled,aria_disabled:button.getAttribute('aria-disabled'),background:getComputedStyle(button).backgroundColor})),overflow:document.documentElement.scrollWidth-window.innerWidth};
  });
}

async function armSubmitTrace(page) {
  await page.evaluate(() => {
    const dossier=document.querySelector('.gpp-entry-dossier[data-gpp-entry-detail="ready"]'); const form=dossier?.closest('form'); if(!form) throw new Error('MR2 submit probe could not resolve Review form.');
    form.addEventListener('submit',event=>{
      const region=form.querySelector('.gravityflow-status-box .gravityflow-action-buttons'); const carrier=region?.querySelector('#gravityflow_approval_new_status_step');
      const snapshot=()=>({carrier:carrier?.value||'',submitter:event.submitter?.value||null,default_prevented:event.defaultPrevented,busy:region?.getAttribute('aria-busy')||null,marker:region?.dataset.gppMaterialActionBusy||null,disabled:[...region.querySelectorAll('button[value]')].filter(button=>['approved','rejected','revert'].includes(button.value)).map(button=>({value:button.value,disabled:button.disabled}))});
      console.log('__GPP_MR2_SUBMIT__'+JSON.stringify(snapshot())); queueMicrotask(()=>console.log('__GPP_MR2_MICRO__'+JSON.stringify(snapshot())));
    });
  });
}
function collectSubmitTrace(page) {
  const trace={submit:[],micro:[]}; const handler=message=>{const text=message.text();if(text.startsWith('__GPP_MR2_SUBMIT__'))trace.submit.push(JSON.parse(text.slice('__GPP_MR2_SUBMIT__'.length)));if(text.startsWith('__GPP_MR2_MICRO__'))trace.micro.push(JSON.parse(text.slice('__GPP_MR2_MICRO__'.length)));}; page.on('console',handler); return {trace,stop:()=>page.off('console',handler)};
}

async function acceptWithHeldPost(page,value,{keyboard=false,probeDuplicate=false}={}) {
  const before=await actionState(page); const capture=collectSubmitTrace(page); await armSubmitTrace(page);
  let releasePost; const gate=new Promise(resolve=>{releasePost=resolve;}); let resolveSeen; const seen=new Promise(resolve=>{resolveSeen=resolve;}); let postCount=0;
  const routeHandler=async route=>{const request=route.request();if(request.method()==='POST'&&request.isNavigationRequest()){postCount++;if(postCount===1)resolveSeen({url:request.url(),method:request.method()});await gate;}await route.continue();};
  await page.route('**/*',routeHandler);
  const button=page.locator(`.gravityflow-status-box .gravityflow-action-buttons button[value="${value}"]`).first(); if(await button.count()!==1)throw new Error(`Missing native action ${value}`);
  let dialogInfo=null; page.once('dialog',async dialog=>{dialogInfo={type:dialog.type(),message:dialog.message()};await dialog.accept();}); const navigation=page.waitForNavigation({waitUntil:'networkidle'});
  if(keyboard){await button.focus();await page.keyboard.press('Enter');}else{await button.click({noWaitAfter:true});}
  const request=await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`No native POST observed for ${value}`)),4000))]); await page.waitForTimeout(0); const busy=await actionState(page);
  if(probeDuplicate){const other=page.locator('.gravityflow-status-box .gravityflow-action-buttons button[value="rejected"]').first();await other.click({timeout:200,noWaitAfter:true}).catch(()=>{});await other.focus().catch(()=>{});await page.keyboard.press('Enter').catch(()=>{});await page.waitForTimeout(80);}
  releasePost(); await navigation; await page.unroute('**/*',routeHandler); capture.stop();
  if(!dialogInfo||dialogInfo.type!=='confirm'||postCount!==1)throw new Error(`Native material submission count/confirmation wrong for ${value}: ${JSON.stringify({dialogInfo,postCount})}`);
  if(capture.trace.submit.length!==1||capture.trace.micro.length!==1||capture.trace.submit[0].carrier!==value||capture.trace.micro[0].carrier!==value)throw new Error(`Native submit boundary wrong for ${value}: ${JSON.stringify(capture.trace)}`);
  if(before.buttons.some(button=>button.disabled))throw new Error(`Action was disabled before material submit: ${JSON.stringify(before)}`);
  if(busy.busy!=='true'||busy.marker!=='1'||busy.status_hidden!==false||busy.status_role!=='status'||busy.status_live!=='polite'||busy.status_text!=='در حال ثبت نتیجه…'||busy.buttons.some(button=>!button.disabled||button.aria_disabled!=='true'))throw new Error(`Busy contract failed for ${value}: ${JSON.stringify(busy)}`);
  for(const prior of before.buttons){const current=busy.buttons.find(button=>button.value===prior.value);if(!current||current.background!==prior.background)throw new Error(`Busy changed semantic action paint for ${prior.value}: ${JSON.stringify({prior,current})}`);}
  if(capture.trace.micro[0].busy!=='true'||capture.trace.micro[0].disabled.some(button=>!button.disabled))throw new Error(`Busy state did not arise after host submit listeners: ${JSON.stringify(capture.trace)}`);
  return {before,busy,trace:capture.trace,request,post_count:postCount,dialog:dialogInfo};
}

const browser=await chromium.launch({headless:true}); const context=await browser.newContext({viewport:{width:1280,height:900}}); const page=await context.newPage();
await authenticate(page,operatorId);

await test('SRWF-PROD-REVIEW-001','Review preserves dossier/native actions and one canonical return',async()=>{
  await page.goto(frontendEntryUrl(manifest.routes.shortcode,manifest.entries.invalid),{waitUntil:'networkidle'}); if(await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').count()!==1)throw new Error('Entry Detail dossier missing.');
  const actions=await nativeActions(page); if(actions.map(x=>x.value).join(',')!=='approved,rejected,revert'||!actions.every(x=>x.onclick.includes('handleApprovalStepButtonClick')))throw new Error(`Native actions changed: ${JSON.stringify(actions)}`); if(await page.locator('.gpp-entry-journey button, .gpp-entry-journey-result button').count()!==0)throw new Error('GPP manufactured workflow buttons.');
  const idle=await actionState(page); if(!idle.status_present||idle.status_hidden!==true||idle.busy!==null||idle.buttons.some(button=>button.disabled))throw new Error(`Idle action state is not truthful: ${JSON.stringify(idle)}`); return {actions,idle,return_control:await assertReturn(page,manifest.routes.shortcode)};
});

await test('SRWF-PROD-CONFIRM-CANCEL-001','native confirmation cancel preserves state',async()=>{
  const id=manifest.entries.approve; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const before=hostState(id); const capture=collectSubmitTrace(page); await armSubmitTrace(page);
  let info=null; page.once('dialog',async d=>{info={type:d.type(),message:d.message()};await d.dismiss();}); await page.locator('.gravityflow-status-box button[value="approved"]').first().click(); await page.waitForTimeout(150); const after=hostState(id); const ui=await actionState(page); capture.stop();
  if(!info||info.type!=='confirm'||after.current_step?.id!==before.current_step?.id||after.workflow_final_status!==before.workflow_final_status||await page.locator('[data-gpp-entry-journey-result]').count()!==0)throw new Error(`Cancel contract failed: ${JSON.stringify({info,before,after})}`);
  if(capture.trace.submit.length!==0||capture.trace.micro.length!==0||ui.busy!==null||ui.marker!==null||ui.status_hidden!==true||ui.buttons.some(button=>button.disabled))throw new Error(`Cancel crossed submit/busy boundary: ${JSON.stringify({trace:capture.trace,ui})}`); return {dialog:info,before,after,submit_trace:capture.trace,ui};
});

await test('SRWF-PROD-APPROVE-001','Approve read-back gates Approved result and stale-tab truth',async()=>{
  const id=manifest.entries.approve; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const submission=await acceptWithHeldPost(page,'approved',{probeDuplicate:true}); const state=hostState(id);
  if(state.current_step!==null||state.workflow_final_status!=='approved'||state.api_status!=='approved')throw new Error(`Approved truth missing: ${JSON.stringify(state)}`); const result=page.locator('[data-gpp-entry-journey-result="approved"]').first(); const text=await result.innerText(); if(await result.count()!==1||await result.getAttribute('role')!=='status'||!text.includes('پرونده تأیید شد')||!text.includes('Journey Approve')||!text.includes('JRN-PROD-APPROVE'))throw new Error(`Approved presentation wrong: ${text}`);
  const staleId=createReviewEntry('TWO-TAB'); const tabA=await context.newPage(); const tabB=await context.newPage(); await Promise.all([tabA.goto(frontendEntryUrl(manifest.routes.shortcode,staleId),{waitUntil:'networkidle'}),tabB.goto(frontendEntryUrl(manifest.routes.shortcode,staleId),{waitUntil:'networkidle'})]); const bothBefore={a:await nativeActions(tabA),b:await nativeActions(tabB)}; if(bothBefore.a.length!==3||bothBefore.b.length!==3)throw new Error(`Two-tab fixture not actionable: ${JSON.stringify(bothBefore)}`);
  await accept(tabA,'approved'); const afterA=hostState(staleId); if(afterA.workflow_final_status!=='approved'||afterA.api_status!=='approved'||afterA.current_step!==null)throw new Error(`Tab A Approve failed: ${JSON.stringify(afterA)}`); const staleDialog=await accept(tabB,'rejected'); const afterB=hostState(staleId); const tabBActions=await nativeActions(tabB); const tabBResults=await tabB.locator('[data-gpp-entry-journey-result]').evaluateAll(nodes=>nodes.filter(node=>node.offsetParent!==null).map(node=>node.getAttribute('data-gpp-entry-journey-result')));
  if(!staleDialog||afterB.workflow_final_status!=='approved'||afterB.api_status!=='approved'||afterB.current_step!==null)throw new Error(`Gravity Flow permitted unsafe stale duplicate mutation: ${JSON.stringify({afterA,afterB,staleDialog})}`); if(tabBActions.length!==0||tabBResults.join(',')!=='approved')throw new Error(`Stale Tab B remained authoritative after host response: ${JSON.stringify({tabBActions,tabBResults,afterB})}`); await Promise.all([tabA.close(),tabB.close()]);
  return {state,text,submission,two_tab:{entry_id:staleId,both_before:bothBefore,after_tab_a:afterA,stale_dialog:staleDialog,after_tab_b:afterB,tab_b_actions:tabBActions,tab_b_results:tabBResults},return_control:await assertReturn(page,manifest.routes.shortcode)};
});

await test('SRWF-PROD-REJECT-001','Reject busy state and read-back preserve Rejected as business result',async()=>{
  const id=manifest.entries.reject; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const submission=await acceptWithHeldPost(page,'rejected',{keyboard:true}); const state=hostState(id); if(state.current_step!==null||state.workflow_final_status!=='rejected'||state.api_status!=='rejected')throw new Error(`Rejected truth missing: ${JSON.stringify(state)}`); const result=page.locator('[data-gpp-entry-journey-result="rejected"]').first(); const text=await result.innerText(); if(await result.count()!==1||!text.includes('پرونده رد شد')||/technical|خطای فنی|مشکل فنی/i.test(text))throw new Error(`Rejected presentation wrong: ${text}`); return {state,text,submission,return_control:await assertReturn(page,manifest.routes.shortcode)};
});

await test('SRWF-PROD-CORRECTION-001','Revert busy state exposes only native authorized correction editor',async()=>{
  const id=manifest.entries.revert; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const submission=await acceptWithHeldPost(page,'revert'); const state=hostState(id); const orientation=page.locator('[data-gpp-entry-journey="correction"]').first(); const editable=[...new Set(await page.locator('input[name^="input_"]:visible,textarea[name^="input_"]:visible,select[name^="input_"]:visible').evaluateAll(ns=>ns.map(n=>n.getAttribute('name'))))].filter(Boolean); if(state.current_step?.id!==correctionId||state.current_step?.type!=='user_input'||!state.current_step?.can_update||await orientation.count()!==1||editable.join(',')!=='input_1'||await page.locator('.gpp-entry-journey input,.gpp-entry-journey textarea,.gpp-entry-journey select').count()!==0)throw new Error(`Correction composition failed: ${JSON.stringify({state,editable})}`); return {state,editable,submission};
});

await test('SRWF-PROD-CORRECTION-NEGATIVE-001','authenticated negative user gains no correction authority',async()=>{
  const id=manifest.entries.revert; await authenticate(page,negativeId); await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const state=hostState(id,negativeId); if(state.current_step?.can_update||await page.locator('[data-gpp-entry-journey="correction"]').count()!==0||await page.locator('input[name="input_1"]:visible').count()!==0)throw new Error(`Negative-control authority leak: ${JSON.stringify(state)}`); return {authenticated_as:negativeId,state};
});

await test('SRWF-PROD-CORRECTION-COMPLETE-001','native correction persists and returns to Review',async()=>{
  const id=manifest.entries.revert; await authenticate(page,operatorId); await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const input=page.locator('input[name="input_1"]').first(); if(await input.count()!==1)throw new Error('Native correction input missing.'); const value='PRODUCTION-CORRECTED-VALUE'; await input.fill(value); const submit=page.locator(`#gform_submit_button_${formId},form[id^="gform_"] input[type="submit"],form[id^="gform_"] button[type="submit"]`).filter({visible:true}).last(); await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),submit.click()]); const op=hostState(id),neg=hostState(id,negativeId); if(op.field_1!==value||op.current_step?.id!==reviewId||op.current_step?.type!=='approval'||!op.current_step?.can_update||neg.current_step?.can_update||await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').count()!==1)throw new Error(`Correction completion failed: ${JSON.stringify({op,neg})}`); return {op,neg,persisted:value,return_control:await assertReturn(page,manifest.routes.shortcode)};
});

await test('SRWF-PROD-AMBIGUITY-001','lost action response does not convert client intent into truth',async()=>{
  const id=manifest.entries.invalid; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); let intercepted=null; await page.route('**/*',async route=>{const req=route.request();if(!intercepted&&req.method()==='POST'&&req.isNavigationRequest()){const response=await route.fetch();intercepted={status:response.status()};await route.abort('failed');return;}await route.continue();}); let dialog=null; page.once('dialog',async d=>{dialog={type:d.type()};await d.accept();}); await page.locator('.gravityflow-status-box button[value="approved"]').first().click().catch(()=>{}); await page.waitForTimeout(200); await page.unroute('**/*'); const stale=await page.locator('[data-gpp-entry-journey-result="approved"],[data-gpp-entry-journey-result="rejected"],[data-gpp-entry-journey="correction"]').count(); const busyAfterLost=await actionState(page); if(!dialog||!intercepted||stale!==0||busyAfterLost.busy!=='true')throw new Error(`Lost-response contract failed: ${JSON.stringify({dialog,intercepted,stale,busyAfterLost})}`); const truth=hostState(id); await page.reload({waitUntil:'networkidle'}); const rendered=await page.locator('[data-gpp-entry-journey-result]').evaluateAll(ns=>ns.filter(n=>n.offsetParent!==null).map(n=>n.getAttribute('data-gpp-entry-journey-result'))); const afterReload=await actionState(page); if(truth.current_step===null&&truth.workflow_final_status==='approved'&&truth.api_status==='approved'){if(rendered.join(',')!=='approved')throw new Error('Fresh Approved truth not reflected.');}else if(rendered.includes('approved')||rendered.includes('rejected'))throw new Error(`Ambiguous truth produced false terminal result: ${JSON.stringify({truth,rendered})}`); if(afterReload.busy!==null||afterReload.marker!==null)throw new Error(`Busy state survived fresh host reload: ${JSON.stringify(afterReload)}`); return {lost_response:intercepted,busy_after_lost:busyAfterLost,truth,rendered,after_reload:afterReload};
});

await test('SRWF-PROD-RETURN-SHORTCODE-001','shortcode return reaches canonical Inbox page 1',async()=>{await page.goto(frontendEntryUrl(manifest.routes.shortcode,manifest.entries.invalid),{waitUntil:'networkidle'});return {landed:await clickReturn(page,manifest.routes.shortcode)};});
await test('SRWF-PROD-RETURN-BLOCK-001','Inbox Block return reaches canonical Block page 1',async()=>{if(!manifest.routes.block)return {supported:false};await page.goto(frontendEntryUrl(manifest.routes.block,manifest.entries.invalid),{waitUntil:'networkidle'});return {supported:true,landed:await clickReturn(page,manifest.routes.block)};});
await test('SRWF-PROD-RETURN-ADMIN-001','admin return resolves native admin Inbox authority',async()=>{await page.goto(adminEntryUrl(manifest.entries.invalid),{waitUntil:'networkidle'});const controls=await returnControls(page),all=[...controls.gpp,...controls.native];if(all.length!==1)throw new Error(`Admin return count wrong: ${JSON.stringify(controls)}`);const u=new URL(all[0].href);if(u.pathname!=='/wp-admin/admin.php'||u.searchParams.get('page')!=='gravityflow-inbox'||['view','lid','id','paged'].some(k=>u.searchParams.has(k)))throw new Error(`Admin target wrong: ${u}`);return {controls};});

await test('SRWF-PROD-MOBILE-RTL-A11Y-001','390x844 keeps RTL/focus/bounded geometry including busy state',async()=>{await authenticate(page,operatorId);await page.setViewportSize({width:390,height:844});const id=createReviewEntry('MOBILE-BUSY');await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'});const link=page.locator('a.gpp-entry-journey__return').filter({visible:true}).first();await link.focus();const before=await page.evaluate(()=>{const a=document.querySelector('a.gpp-entry-journey__return'),s=a?getComputedStyle(a):null,r=a?.getBoundingClientRect();return{dir:document.querySelector('.gpp-entry-journey-nav')?.getAttribute('dir'),overflow:document.documentElement.scrollWidth-window.innerWidth,rect:r?{left:r.left,right:r.right,height:r.height}:null,outline:s?.outlineStyle,native_actions:[...document.querySelectorAll('.gravityflow-status-box .gravityflow-action-buttons button')].filter(n=>n.offsetParent!==null).length,journey_buttons:document.querySelectorAll('.gpp-entry-journey button,.gpp-entry-journey-result button').length};});if(before.dir!=='rtl'||before.overflow>1||!before.rect||before.rect.left< -1||before.rect.right>391||before.rect.height<44||before.outline==='none'||before.native_actions!==3||before.journey_buttons!==0)throw new Error(`Mobile idle contract failed: ${JSON.stringify(before)}`);const submission=await acceptWithHeldPost(page,'approved');if(submission.busy.overflow>1)throw new Error(`Mobile busy state caused horizontal overflow: ${JSON.stringify(submission.busy)}`);await page.screenshot({path:`${artifactDir}/srwf-journey-production-390x844.png`,fullPage:true});return {before,submission};});
await test('SRWF-PROD-NO-TECHNICAL-ERROR-001','no invented Technical Error taxonomy exists',async()=>{const html=await page.content();if(/data-gpp-entry-journey-result=["']technical/i.test(html)||/Technical Error|خطای فنی|مشکل فنی/i.test(html))throw new Error('Technical Error presentation appeared.');return {technical_error_result_count:0};});

await browser.close(); fs.mkdirSync(artifactDir,{recursive:true}); fs.writeFileSync(`${artifactDir}/srwf-journey-production-browser.json`,JSON.stringify({schema_version:'1.1.0',runtime:'REPRODUCIBLE_PINNED_LAB',results},null,2)+'\n');
const failed=results.filter(x=>x.status!=='PASS'); if(failed.length){console.error(JSON.stringify({failed},null,2));process.exit(1);} console.log(`SRWF_JOURNEY_PRODUCTION_BROWSER_PASS ${results.length}`);
