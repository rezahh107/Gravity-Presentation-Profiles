import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const operatorPassword = 'wu21-bootstrap-pass-2026';
const negativePassword = 'srwf-participant-pass-2026';
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
if (manifest.production_presentation?.entry_detail_setup_status !== 'COMPLETED') throw new Error('Production Entry Detail presentation was not admitted in the lab.');

function hostState(entryId, userId = manifest.users.operator.id) {
  return JSON.parse(wpEval(`
    wp_set_current_user(${Number(userId)});
    if (!class_exists('Gravity_Flow_Entry_Detail')) require_once gravity_flow()->get_base_path() . '/includes/pages/class-entry-detail.php';
    $entry=GFAPI::get_entry(${Number(entryId)}); $api=new Gravity_Flow_API(${formId}); $step=$api->get_current_step($entry);
    echo wp_json_encode(array('field_1'=>(string)rgar($entry,'1'),'workflow_final_status'=>(string)gform_get_meta((int)$entry['id'],'workflow_final_status'),'api_status'=>(string)$api->get_status($entry),'current_step'=>$step?array('id'=>(int)$step->get_id(),'type'=>(string)$step->get_type(),'can_update'=>(bool)Gravity_Flow_Entry_Detail::can_update($step),'editable_fields'=>method_exists($step,'get_editable_fields')?array_values(array_map('strval',$step->get_editable_fields())):array()):null),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
  `));
}

function frontendEntryUrl(route, entryId) {
  const url = new URL(route.url); url.searchParams.set('view','entry'); url.searchParams.set('id',String(formId)); url.searchParams.set('lid',String(entryId)); return url.toString();
}
const adminEntryUrl = entryId => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${formId}&lid=${entryId}`;
const results = [];
async function test(id, name, fn) { try { results.push({ id, name, status:'PASS', details:await fn() }); } catch (error) { results.push({ id, name, status:'FAIL', details:{ error:String(error?.stack || error).slice(0,12000) } }); } }

async function login(page, user, pass) {
  await page.context().clearCookies();
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil:'domcontentloaded' });
  await page.fill('#user_login', user); await page.fill('#user_pass', pass);
  await Promise.all([page.waitForNavigation({ waitUntil:'domcontentloaded' }), page.click('#wp-submit')]);
  if (new URL(page.url()).pathname.endsWith('/wp-login.php')) throw new Error(`Authentication failed for synthetic user ${user}.`);
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
async function terminalSurfaceInventory(page) {
  return page.evaluate(() => {
    const visible = node => !!node && node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden';
    const selectors = {
      result: '[data-gpp-entry-journey-result]',
      identity: '[data-gpp-entry-journey-result] .gpp-entry-journey__case-context',
      dossier: '.gpp-entry-dossier[data-gpp-entry-detail="ready"]',
      workflow_region: '#postbox-container-1',
      timeline_region: '#postbox-container-2',
      status_box: '.gravityflow-status-box',
      native_print: '.detail-view-print',
      gpp_print: '[data-gpp-print-utility="dossier"]',
      timeline: '.gravityflow-timeline',
      entry_table: '.entry-detail-view',
      correction: '[data-gpp-entry-journey="correction"]',
      native_back: '.gravityflow-back-link-container a.back-link',
      gpp_return: 'a.gpp-entry-journey__return'
    };
    return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
      const nodes = [...document.querySelectorAll(selector)];
      return [key, { dom: nodes.length, visible: nodes.filter(visible).length }];
    }));
  });
}
async function assertTerminalResultOnly(page, state, route) {
  const copy = state==='approved'
    ? {title:'پرونده تأیید شد',body:'نتیجه بررسی با موفقیت ثبت شد.'}
    : {title:'پرونده رد شد',body:'نتیجه رد با موفقیت ثبت شد.'};
  const result=page.locator(`[data-gpp-entry-journey-result="${state}"]`).first();
  if(await result.count()!==1 || await result.getAttribute('role')!=='status') throw new Error(`Missing semantic ${state} result.`);
  const text=(await result.innerText()).replace(/\s+/g,' ').trim();
  if(!text.includes(copy.title)||!text.includes(copy.body)||!text.includes('بازگشت به کارهای من')) throw new Error(`Terminal copy drifted: ${text}`);
  if(/داوطلب|کد ملی|JRN-PROD-|Journey Approve|Journey Reject/.test(text)) throw new Error(`Terminal result leaked case identity: ${text}`);
  if(state==='rejected' && /technical|خطای فنی|مشکل فنی/i.test(text)) throw new Error(`Rejected was presented as a technical error: ${text}`);
  const surfaces=await terminalSurfaceInventory(page);
  if(surfaces.identity.dom!==0) throw new Error(`Terminal identity remained in server markup: ${JSON.stringify(surfaces.identity)}`);
  for(const key of ['dossier','workflow_region','timeline_region','status_box','native_print','timeline','entry_table','correction']) if(surfaces[key].visible!==0) throw new Error(`Competing terminal surface remained visible (${key}): ${JSON.stringify(surfaces)}`);
  if(surfaces.result.visible!==1||surfaces.gpp_print.visible!==1) throw new Error(`Terminal Result/Print visibility wrong: ${JSON.stringify(surfaces)}`);
  if((await nativeActions(page)).length!==0) throw new Error('Stale native workflow actions remained visible after terminal truth.');
  return {text,surfaces,return_control:await assertReturn(page,route)};
}

const browser=await chromium.launch({headless:true}); const context=await browser.newContext({viewport:{width:1280,height:900}}); const page=await context.newPage();
await login(page, manifest.users.operator.login, operatorPassword);

await test('SRWF-PROD-REVIEW-001','Review preserves dossier/native actions and one canonical return',async()=>{
  await page.goto(frontendEntryUrl(manifest.routes.shortcode,manifest.entries.invalid),{waitUntil:'networkidle'});
  if(await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count()!==1) throw new Error('Entry Detail dossier missing.');
  if(await page.locator('#postbox-container-1:visible').count()!==1 || await page.locator('#postbox-container-2:visible').count()!==1) throw new Error('Terminal region suppression leaked into Review.');
  const actions=await nativeActions(page); if(actions.map(x=>x.value).join(',')!=='approved,rejected,revert'||!actions.every(x=>x.onclick.includes('handleApprovalStepButtonClick'))) throw new Error(`Native actions changed: ${JSON.stringify(actions)}`);
  if(await page.locator('[data-gpp-entry-journey-result]:visible').count()!==0) throw new Error('Terminal suppression leaked into Review.');
  if(await page.locator('.gpp-entry-journey button, .gpp-entry-journey-result button').count()!==0) throw new Error('GPP manufactured workflow buttons.');
  return {actions,return_control:await assertReturn(page,manifest.routes.shortcode)};
});

await test('SRWF-PROD-CONFIRM-CANCEL-001','native confirmation cancel preserves state',async()=>{
  const id=manifest.entries.approve; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const before=hostState(id);
  let info=null; page.once('dialog',async d=>{info={type:d.type(),message:d.message()};await d.dismiss();}); await page.locator('.gravityflow-status-box button[value="approved"]').first().click(); await page.waitForTimeout(150); const after=hostState(id);
  if(!info||info.type!=='confirm'||after.current_step?.id!==before.current_step?.id||after.workflow_final_status!==before.workflow_final_status||await page.locator('[data-gpp-entry-journey-result]').count()!==0) throw new Error(`Cancel contract failed: ${JSON.stringify({info,before,after})}`);
  return {dialog:info,before,after};
});

await test('SRWF-PROD-APPROVE-001','Approve and direct reload converge to one Approved Result-only surface',async()=>{
  const id=manifest.entries.approve; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const dialog=await accept(page,'approved'); const state=hostState(id);
  if(!dialog||state.current_step!==null||state.workflow_final_status!=='approved'||state.api_status!=='approved') throw new Error(`Approved truth missing: ${JSON.stringify({dialog,state})}`);
  const after_action=await assertTerminalResultOnly(page,'approved',manifest.routes.shortcode);
  await page.reload({waitUntil:'networkidle'});
  const direct_reload=await assertTerminalResultOnly(page,'approved',manifest.routes.shortcode);
  return {state,after_action,direct_reload};
});

await test('SRWF-PROD-REJECT-001','Reject and direct reload converge to one Rejected Result-only surface',async()=>{
  const id=manifest.entries.reject; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const dialog=await accept(page,'rejected'); const state=hostState(id);
  if(!dialog||state.current_step!==null||state.workflow_final_status!=='rejected'||state.api_status!=='rejected') throw new Error(`Rejected truth missing: ${JSON.stringify({dialog,state})}`);
  const after_action=await assertTerminalResultOnly(page,'rejected',manifest.routes.shortcode);
  await page.reload({waitUntil:'networkidle'});
  const direct_reload=await assertTerminalResultOnly(page,'rejected',manifest.routes.shortcode);
  return {state,after_action,direct_reload};
});

await test('SRWF-PROD-CORRECTION-001','Revert exposes only native authorized correction editor',async()=>{
  const id=manifest.entries.revert; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const dialog=await accept(page,'revert'); const state=hostState(id);
  const orientation=page.locator('[data-gpp-entry-journey="correction"]').first(); const editable=[...new Set(await page.locator('input[name^="input_"]:visible,textarea[name^="input_"]:visible,select[name^="input_"]:visible').evaluateAll(ns=>ns.map(n=>n.getAttribute('name'))))].filter(Boolean);
  const terminal=await page.locator('[data-gpp-entry-journey-result="approved"]:visible,[data-gpp-entry-journey-result="rejected"]:visible').count();
  if(!dialog||state.current_step?.id!==correctionId||state.current_step?.type!=='user_input'||!state.current_step?.can_update||await orientation.count()!==1||editable.join(',')!=='input_1'||terminal!==0||await page.locator('.gpp-entry-journey input,.gpp-entry-journey textarea,.gpp-entry-journey select').count()!==0) throw new Error(`Correction composition failed: ${JSON.stringify({state,editable,terminal})}`);
  return {state,editable};
});

await test('SRWF-PROD-CORRECTION-NEGATIVE-001','authenticated negative user gains no correction authority',async()=>{
  const id=manifest.entries.revert; await login(page,manifest.users.negative_control.login,negativePassword); await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const state=hostState(id,manifest.users.negative_control.id);
  if(state.current_step?.can_update||await page.locator('[data-gpp-entry-journey="correction"]').count()!==0||await page.locator('input[name="input_1"]:visible').count()!==0) throw new Error(`Negative-control authority leak: ${JSON.stringify(state)}`);
  return {authenticated_as:manifest.users.negative_control.login,state};
});

await test('SRWF-PROD-CORRECTION-COMPLETE-001','native correction persists and returns to Review',async()=>{
  const id=manifest.entries.revert; await login(page,manifest.users.operator.login,operatorPassword); await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); const input=page.locator('input[name="input_1"]').first(); if(await input.count()!==1) throw new Error('Native correction input missing.');
  const value='PRODUCTION-CORRECTED-VALUE'; await input.fill(value); const submit=page.locator(`#gform_submit_button_${formId},form[id^="gform_"] input[type="submit"],form[id^="gform_"] button[type="submit"]`).filter({visible:true}).last(); await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),submit.click()]);
  const op=hostState(id), neg=hostState(id,manifest.users.negative_control.id); if(op.field_1!==value||op.current_step?.id!==reviewId||op.current_step?.type!=='approval'||!op.current_step?.can_update||neg.current_step?.can_update||await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]:visible').count()!==1) throw new Error(`Correction completion failed: ${JSON.stringify({op,neg})}`);
  return {op,neg,persisted:value,return_control:await assertReturn(page,manifest.routes.shortcode)};
});

await test('SRWF-PROD-AMBIGUITY-001','lost action response does not convert client intent into truth',async()=>{
  const id=manifest.entries.invalid; await page.goto(frontendEntryUrl(manifest.routes.shortcode,id),{waitUntil:'networkidle'}); let intercepted=null; await page.route('**/*',async route=>{const req=route.request();if(!intercepted&&req.method()==='POST'&&req.isNavigationRequest()){const response=await route.fetch();intercepted={status:response.status()};await route.abort('failed');return;}await route.continue();});
  let dialog=null; page.once('dialog',async d=>{dialog={type:d.type()};await d.accept();}); await page.locator('.gravityflow-status-box button[value="approved"]').first().click().catch(()=>{}); await page.waitForTimeout(200); await page.unroute('**/*'); const stale=await page.locator('[data-gpp-entry-journey-result="approved"],[data-gpp-entry-journey-result="rejected"],[data-gpp-entry-journey="correction"]').count(); if(!dialog||!intercepted||stale!==0) throw new Error(`Stale client claimed result: ${JSON.stringify({dialog,intercepted,stale})}`);
  const truth=hostState(id); await page.reload({waitUntil:'networkidle'}); const rendered=await page.locator('[data-gpp-entry-journey-result]').evaluateAll(ns=>ns.filter(n=>n.offsetParent!==null).map(n=>n.getAttribute('data-gpp-entry-journey-result'))); if(truth.current_step===null&&truth.workflow_final_status==='approved'&&truth.api_status==='approved'){if(rendered.join(',')!=='approved')throw new Error('Fresh Approved truth not reflected.'); await assertTerminalResultOnly(page,'approved',manifest.routes.shortcode);}else if(rendered.includes('approved')||rendered.includes('rejected'))throw new Error(`Ambiguous truth produced false terminal result: ${JSON.stringify({truth,rendered})}`);
  return {lost_response:intercepted,truth,rendered};
});

await test('SRWF-PROD-RETURN-SHORTCODE-001','shortcode return reaches canonical Inbox page 1',async()=>{await page.goto(frontendEntryUrl(manifest.routes.shortcode,manifest.entries.approve),{waitUntil:'networkidle'});return {landed:await clickReturn(page,manifest.routes.shortcode)};});
await test('SRWF-PROD-RETURN-BLOCK-001','Inbox Block return reaches canonical Block page 1',async()=>{if(!manifest.routes.block)return {supported:false};await page.goto(frontendEntryUrl(manifest.routes.block,manifest.entries.reject),{waitUntil:'networkidle'});return {supported:true,landed:await clickReturn(page,manifest.routes.block)};});
await test('SRWF-PROD-RETURN-ADMIN-001','admin return resolves native admin Inbox authority',async()=>{await page.goto(adminEntryUrl(manifest.entries.approve),{waitUntil:'networkidle'});const controls=await returnControls(page),all=[...controls.gpp,...controls.native];if(all.length!==1)throw new Error(`Admin return count wrong: ${JSON.stringify(controls)}`);const u=new URL(all[0].href);if(u.pathname!=='/wp-admin/admin.php'||u.searchParams.get('page')!=='gravityflow-inbox'||['view','lid','id','paged'].some(k=>u.searchParams.has(k)))throw new Error(`Admin target wrong: ${u}`);return {controls};});

await test('SRWF-PROD-MOBILE-RTL-A11Y-001','terminal Result-only stays bounded and keyboard-usable at 1440/390/320',async()=>{
  const widths=[1440,390,320], checks=[];
  for(const width of widths){
    await page.setViewportSize({width,height:width===1440?900:844});
    await page.goto(frontendEntryUrl(manifest.routes.shortcode,manifest.entries.approve),{waitUntil:'networkidle'});
    const terminal=await assertTerminalResultOnly(page,'approved',manifest.routes.shortcode);
    const link=page.locator('a.gpp-entry-journey__return:visible').first(); await link.focus();
    const m=await page.evaluate(()=>{const a=document.querySelector('a.gpp-entry-journey__return'),result=document.querySelector('[data-gpp-entry-journey-result="approved"]'),print=document.querySelector('[data-gpp-dossier-print-button]');const ar=a?.getBoundingClientRect(),rr=result?.getBoundingClientRect(),pr=print?.getBoundingClientRect(),as=a?getComputedStyle(a):null,ps=print?getComputedStyle(print):null;return{overflow:document.documentElement.scrollWidth-window.innerWidth,return_rect:ar?{left:ar.left,right:ar.right,height:ar.height}:null,result_rect:rr?{left:rr.left,right:rr.right}:null,print_rect:pr?{left:pr.left,right:pr.right,height:pr.height}:null,outline:as?.outlineStyle,return_background:as?.backgroundColor,print_background:ps?.backgroundColor,heading:result?.querySelector('h2')?.textContent.trim(),body:result?.querySelector('p')?.textContent.trim()};});
    if(m.overflow>1||!m.return_rect||m.return_rect.left< -1||m.return_rect.right>width+1||m.return_rect.height<44||!m.result_rect||m.result_rect.left< -1||m.result_rect.right>width+1||!m.print_rect||m.print_rect.left< -1||m.print_rect.right>width+1||m.outline==='none'||m.return_background===m.print_background||m.heading!=='پرونده تأیید شد'||m.body!=='نتیجه بررسی با موفقیت ثبت شد.') throw new Error(`Terminal responsive/a11y contract failed at ${width}: ${JSON.stringify(m)}`);
    await page.screenshot({path:`${artifactDir}/srwf-journey-terminal-${width}.png`,fullPage:true}); checks.push({width,...m,surfaces:terminal.surfaces});
  }
  return {checks};
});
await test('SRWF-PROD-NO-TECHNICAL-ERROR-001','no invented Technical Error taxonomy exists',async()=>{const html=await page.content();if(/data-gpp-entry-journey-result=["']technical/i.test(html)||/Technical Error|خطای فنی|مشکل فنی/i.test(html))throw new Error('Technical Error presentation appeared.');return {technical_error_result_count:0};});

await browser.close(); fs.mkdirSync(artifactDir,{recursive:true}); fs.writeFileSync(`${artifactDir}/srwf-journey-production-browser.json`,JSON.stringify({schema_version:'1.2.0',runtime:'REPRODUCIBLE_PINNED_LAB',results},null,2)+'\n');
const failed=results.filter(x=>x.status!=='PASS'); if(failed.length){console.error(JSON.stringify({failed},null,2));process.exit(1);} console.log(`SRWF_JOURNEY_PRODUCTION_BROWSER_PASS ${results.length}`);
