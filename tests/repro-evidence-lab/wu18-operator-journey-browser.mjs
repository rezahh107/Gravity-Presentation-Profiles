import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
if (!artifactDir || !wpPath || !wpCli) throw new Error('Operator journey browser qualification requires WU18 runtime environment.');

function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}
function wpJson(code) { return JSON.parse(wpEval(`echo wp_json_encode((${code}), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);`)); }

const manifest = wpJson(`get_option('gpp_wu18_operator_journey_manifest')`);
if (!manifest?.results?.form_id || !manifest?.correction?.form_id) throw new Error('Operator journey runtime manifest unavailable.');

function phpState(formId, entryId, login, knownSteps = {}) {
  const stepPairs = Object.entries(knownSteps).map(([label,id]) => `${JSON.stringify(label)} => ${Number(id)}`).join(',');
  return JSON.parse(wpEval(`
$u=get_user_by('login',${JSON.stringify(login)}); if(!$u) throw new RuntimeException('user'); wp_set_current_user($u->ID);
$entry=GFAPI::get_entry(${Number(entryId)}); if(is_wp_error($entry)) throw new RuntimeException($entry->get_error_message());
$api=new Gravity_Flow_API(${Number(formId)}); $step=$api->get_current_step($entry); $known=array();
foreach(array(${stepPairs}) as $label=>$sid){$s=gravity_flow()->get_step((int)$sid,$entry);$known[$label]=$s?array('id'=>(int)$s->get_id(),'type'=>(string)$s->get_type(),'status'=>(string)$s->get_status(),'next_step_id'=>$s->get_next_step_id()):null;}
$a=$step&&method_exists($step,'get_current_assignee')?$step->get_current_assignee():null;
echo wp_json_encode(array('user_login'=>$u->user_login,'current_step'=>$step?array('id'=>(int)$step->get_id(),'type'=>(string)$step->get_type(),'name'=>(string)$step->get_name()):null,'current_user_is_assignee'=>is_object($a),'api_status'=>$api->get_status($entry),'workflow_final_status'=>gform_get_meta((int)$entry['id'],'workflow_final_status'),'workflow_current_status'=>gform_get_meta((int)$entry['id'],'workflow_current_status'),'known_steps'=>$known),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
`));
}

const results = [];
async function test(id, name, fn) {
  try { results.push({ id, name, status: 'PASS', details: await fn() }); }
  catch (e) { results.push({ id, name, status: 'FAIL', details: { error: String(e?.stack || e).slice(0, 8000) } }); }
}
function adminEntryUrl(formId, entryId) { return `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${formId}&lid=${entryId}`; }
function frontendEntryUrl(pageUrl, formId, entryId) {
  const u = new URL(pageUrl); u.searchParams.set('view','entry'); u.searchParams.set('id',String(formId)); u.searchParams.set('lid',String(entryId)); return u.toString();
}
function canonicalUrl(value) { const u=new URL(value); u.hash=''; return `${u.origin}${u.pathname}${u.search}`; }
async function login(page, username, password) {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', username); await page.fill('#user_pass', password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
}
async function confirmAndActivate(page, locator, accept, activation='click') {
  let observed = null;
  page.once('dialog', async dialog => {
    observed = { type: dialog.type(), message: dialog.message() };
    if (accept) await dialog.accept(); else await dialog.dismiss();
  });
  if (activation === 'keyboard') { await locator.focus(); await page.keyboard.press('Enter'); }
  else await locator.click();
  for (let i=0;i<50 && !observed;i++) await page.waitForTimeout(20);
  if (!observed) throw new Error('Native confirmation dialog was not emitted.');
  return observed;
}
async function confirmAndNavigate(page, locator, accept=true) {
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
  const info = await confirmAndActivate(page, locator, accept, 'click');
  await nav; await page.waitForLoadState('networkidle'); return info;
}
async function actionSurface(page) {
  return page.evaluate(() => {
    const box=document.querySelector('.gravityflow-status-box');
    const hidden=document.querySelector('#gravityflow_approval_new_status_step');
    return {
      status_box_present:Boolean(box),
      approve_count:document.querySelectorAll('.gravityflow-action-buttons button[value="approved"]').length,
      reject_count:document.querySelectorAll('.gravityflow-action-buttons button[value="rejected"]').length,
      revert_count:document.querySelectorAll('.gravityflow-action-buttons button[value="revert"]').length,
      hidden_value:hidden?.value ?? null,
      nonce_present:Boolean(document.querySelector('input[name="_wpnonce"]')),
      host_dom_dialog_count:document.querySelectorAll('.gravityflow-status-box [role="dialog"], .gravityflow-status-box dialog').length,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const operatorContext = await browser.newContext();
const operatorPage = await operatorContext.newPage();
await login(operatorPage, 'bootstrap_admin', 'wu21-bootstrap-pass-2026');

await test('OJ-BROWSER-001', 'native Approval confirmation is browser-owned and cancel is non-mutating', async () => {
  const m=manifest.results;
  await operatorPage.goto(adminEntryUrl(m.form_id,m.cancel_entry_id),{waitUntil:'networkidle'});
  const before=phpState(m.form_id,m.cancel_entry_id,'bootstrap_admin',{approval:m.step_id});
  const surfaceBefore=await actionSurface(operatorPage);
  const approve=operatorPage.locator('.gravityflow-action-buttons button[value="approved"]').first();
  if(await approve.count()!==1 || !surfaceBefore.nonce_present || surfaceBefore.host_dom_dialog_count!==0) throw new Error(`Native Approval surface mismatch ${JSON.stringify(surfaceBefore)}`);
  const urlBefore=operatorPage.url();
  const dialog=await confirmAndActivate(operatorPage,approve,false,'keyboard');
  await operatorPage.waitForTimeout(250);
  const after=phpState(m.form_id,m.cancel_entry_id,'bootstrap_admin',{approval:m.step_id});
  const surfaceAfter=await actionSurface(operatorPage);
  if(dialog.type!=='confirm' || !/approve/i.test(dialog.message)) throw new Error(`Unexpected native prompt ${JSON.stringify(dialog)}`);
  if(operatorPage.url()!==urlBefore || surfaceAfter.hidden_value!=='' || after.current_step?.id!==m.step_id || after.known_steps.approval?.status!=='pending') throw new Error(`Cancel mutated host state ${JSON.stringify({before,after,surfaceAfter})}`);
  return {dialog,activation:'keyboard_enter',cancel:'dialog.dismiss',host_dom_dialog:false,before,after,focus_after_cancel:await approve.evaluate(el=>document.activeElement===el)};
});

await test('OJ-BROWSER-002', 'approved result requires persisted host Approval status after accepted confirmation', async () => {
  const m=manifest.results; await operatorPage.goto(adminEntryUrl(m.form_id,m.approve_entry_id),{waitUntil:'networkidle'});
  const before=phpState(m.form_id,m.approve_entry_id,'bootstrap_admin',{approval:m.step_id});
  const dialog=await confirmAndNavigate(operatorPage,operatorPage.locator('.gravityflow-action-buttons button[value="approved"]').first(),true);
  const after=phpState(m.form_id,m.approve_entry_id,'bootstrap_admin',{approval:m.step_id});
  if(dialog.type!=='confirm' || !/approve/i.test(dialog.message) || after.known_steps.approval?.status!=='approved' || after.current_step!==null || after.workflow_final_status!=='complete') throw new Error(`Approved truth not established ${JSON.stringify({dialog,before,after})}`);
  return {dialog,before,after,truth_source:'workflow_step_status_<approval_step_id> plus current/final workflow state',post_url:operatorPage.url()};
});

await test('OJ-BROWSER-003', 'rejected result requires persisted host Approval status and is not technical failure', async () => {
  const m=manifest.results; await operatorPage.goto(adminEntryUrl(m.form_id,m.reject_entry_id),{waitUntil:'networkidle'});
  const before=phpState(m.form_id,m.reject_entry_id,'bootstrap_admin',{approval:m.step_id});
  const dialog=await confirmAndNavigate(operatorPage,operatorPage.locator('.gravityflow-action-buttons button[value="rejected"]').first(),true);
  const after=phpState(m.form_id,m.reject_entry_id,'bootstrap_admin',{approval:m.step_id});
  if(dialog.type!=='confirm' || !/reject/i.test(dialog.message) || after.known_steps.approval?.status!=='rejected' || after.current_step!==null || after.workflow_final_status!=='complete') throw new Error(`Rejected truth not established ${JSON.stringify({dialog,before,after})}`);
  return {dialog,before,after,truth_source:'workflow_step_status_<approval_step_id>',technical_error:false};
});

await test('OJ-BROWSER-004', 'native validation failure stays pending and must not become completed result', async () => {
  const m=manifest.validation_failure; await operatorPage.goto(adminEntryUrl(m.form_id,m.entry_id),{waitUntil:'networkidle'});
  const before=phpState(m.form_id,m.entry_id,'bootstrap_admin',{approval:m.step_id});
  const dialog=await confirmAndNavigate(operatorPage,operatorPage.locator('.gravityflow-action-buttons button[value="approved"]').first(),true);
  const after=phpState(m.form_id,m.entry_id,'bootstrap_admin',{approval:m.step_id});
  const validation=await operatorPage.locator('.gravityflow-status-box .validation_message, .gravityflow-status-box .gfield_description.validation_message').allTextContents();
  if(after.current_step?.id!==m.step_id || after.known_steps.approval?.status!=='pending' || validation.length<1) throw new Error(`Validation failure did not fail closed ${JSON.stringify({dialog,before,after,validation})}`);
  return {dialog,before,after,validation,completed_result_allowed:false,fallback:'preserve native validation/output'};
});

await test('OJ-BROWSER-005', 'native Revert enters configured User Input and changes effective assignee', async () => {
  const m=manifest.correction; await operatorPage.goto(adminEntryUrl(m.form_id,m.entry_id),{waitUntil:'networkidle'});
  const before=phpState(m.form_id,m.entry_id,'bootstrap_admin',{review:m.review_step_id,user_input:m.user_input_step_id});
  const surface=await actionSurface(operatorPage);
  if(surface.revert_count!==1) throw new Error(`Native Revert unavailable ${JSON.stringify(surface)}`);
  const dialog=await confirmAndNavigate(operatorPage,operatorPage.locator('.gravityflow-action-buttons button[value="revert"]').first(),true);
  const operatorAfter=phpState(m.form_id,m.entry_id,'bootstrap_admin',{review:m.review_step_id,user_input:m.user_input_step_id});
  const participantAfter=phpState(m.form_id,m.entry_id,'wu21_viewer',{review:m.review_step_id,user_input:m.user_input_step_id});
  if(dialog.type!=='confirm' || !/revert/i.test(dialog.message) || operatorAfter.current_step?.id!==m.user_input_step_id || operatorAfter.current_step?.type!=='user_input' || participantAfter.current_user_is_assignee!==true) throw new Error(`Revert topology mismatch ${JSON.stringify({dialog,before,operatorAfter,participantAfter})}`);
  return {dialog,before,operatorAfter,participantAfter,correction_truth_source:'current_step == configured User Input target'};
});

await test('OJ-BROWSER-006', 'assigned User Input participant completes correction and returns to Review Approval', async () => {
  const m=manifest.correction;
  const participantContext=await browser.newContext(); const page=await participantContext.newPage();
  try {
    await login(page,'wu21_viewer','wu21-synthetic-viewer-2026');
    const inboxUrl=manifest.navigation.frontend_shortcode_inbox_url;
    if(!inboxUrl) throw new Error('Frontend shortcode Inbox authority unavailable.');
    await page.goto(frontendEntryUrl(inboxUrl,m.form_id,m.entry_id),{waitUntil:'networkidle'});
    const input=page.locator(`[name="input_${m.editable_field_id}"]`).first();
    const update=page.locator('#gravityflow_update_button').first();
    if(await input.count()!==1 || await update.count()!==1) throw new Error('Native User Input editor/update control unavailable.');
    await input.fill('Corrected by synthetic participant');
    await page.waitForFunction(()=>{const b=document.querySelector('#gravityflow_update_button');return b && !b.disabled;});
    const before=phpState(m.form_id,m.entry_id,'wu21_viewer',{review:m.review_step_id,user_input:m.user_input_step_id});
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),update.click()]); await page.waitForLoadState('networkidle');
    const participantAfter=phpState(m.form_id,m.entry_id,'wu21_viewer',{review:m.review_step_id,user_input:m.user_input_step_id});
    const operatorAfter=phpState(m.form_id,m.entry_id,'bootstrap_admin',{review:m.review_step_id,user_input:m.user_input_step_id});
    if(operatorAfter.current_step?.id!==m.review_step_id || operatorAfter.current_step?.type!=='approval' || operatorAfter.current_user_is_assignee!==true || operatorAfter.known_steps.user_input?.status!=='complete') throw new Error(`User Input did not return to Review ${JSON.stringify({before,participantAfter,operatorAfter})}`);
    await operatorPage.goto(adminEntryUrl(m.form_id,m.entry_id),{waitUntil:'networkidle'});
    const surface=await actionSurface(operatorPage);
    if(surface.approve_count!==1 || surface.reject_count!==1 || surface.revert_count!==1) throw new Error(`Returned Review actions unavailable ${JSON.stringify(surface)}`);
    return {before,participantAfter,operatorAfter,returned_review_surface:surface,edited_value_persisted:wpEval(`echo (string) rgar(GFAPI::get_entry(${m.entry_id}), '${m.editable_field_id}');`)};
  } finally { await participantContext.close(); }
});

await test('OJ-BROWSER-007', 'canonical admin Inbox page 1 route is WordPress/Gravity Flow authority, not Page ID identity', async () => {
  const m=manifest.correction;
  await operatorPage.goto(adminEntryUrl(m.form_id,m.entry_id),{waitUntil:'networkidle'});
  const nativeBackCount=await operatorPage.locator('.gravityflow-back-link-container a.back-link').count();
  await operatorPage.goto(manifest.navigation.admin_inbox_url,{waitUntil:'networkidle'});
  const u=new URL(operatorPage.url());
  const inboxCount=await operatorPage.locator('[data-js="gflow-inbox"], .gflow-inbox.gflow-grid.gflow-common').count();
  if(u.searchParams.get('page')!=='gravityflow-inbox' || u.searchParams.has('view') || u.searchParams.has('lid') || inboxCount<1) throw new Error(`Admin canonical Inbox route failed ${operatorPage.url()}`);
  return {route_authority:manifest.navigation.admin_inbox_url,native_admin_entry_back_link_count:nativeBackCount,canonical_page_1:true,inbox_rendered:true,adapter_required_for_gpp_back_control:nativeBackCount===0};
});

await test('OJ-BROWSER-008', 'frontend shortcode and registered Inbox Block expose native canonical back-link to page 1', async () => {
  const m=manifest.correction;
  const q=wpJson(`get_option('gpp_wu09_entry_asset_qualification')`);
  const fixtures=[];
  if(manifest.navigation.frontend_shortcode_inbox_url) fixtures.push({kind:'shortcode',url:manifest.navigation.frontend_shortcode_inbox_url});
  if(q?.frontend_fixtures?.inbox_block?.url) fixtures.push({kind:'block',url:q.frontend_fixtures.inbox_block.url});
  if(!fixtures.some(x=>x.kind==='shortcode')) throw new Error('Authentic shortcode Inbox fixture unavailable.');
  const observations=[];
  for(const fixture of fixtures){
    await operatorPage.goto(frontendEntryUrl(fixture.url,m.form_id,m.entry_id),{waitUntil:'networkidle'});
    const back=operatorPage.locator('.gravityflow-back-link-container a.back-link').first();
    if(await back.count()!==1) throw new Error(`${fixture.kind}: native frontend Back link unavailable.`);
    const href=await back.getAttribute('href');
    if(!href || canonicalUrl(href)!==canonicalUrl(fixture.url)) throw new Error(`${fixture.kind}: native Back href is not canonical page URL: ${href}`);
    await Promise.all([operatorPage.waitForNavigation({waitUntil:'domcontentloaded'}),back.click()]); await operatorPage.waitForLoadState('networkidle');
    const landed=new URL(operatorPage.url());
    const inbox=await operatorPage.locator('[data-js="gflow-inbox"], .gflow-inbox.gflow-grid.gflow-common').count();
    if(landed.searchParams.has('view')||landed.searchParams.has('id')||landed.searchParams.has('lid')||inbox<1) throw new Error(`${fixture.kind}: canonical page-1 landing failed.`);
    observations.push({kind:fixture.kind,back_href:href,landed_url:operatorPage.url(),canonical_page_1:true});
  }
  return {observations,block_registered:Boolean(q?.frontend_fixtures?.inbox_block?.url),page_id_used_as_product_identity:false};
});

await operatorContext.close(); await browser.close();

const summary={
  schema_version:'1.0.0',
  evidence_class:'PROVEN_IN_REPRODUCIBLE_SIMULATION',
  production_equivalence:'NOT_PROVEN',
  runtime:manifest.runtime,
  results,
  capability_observations:{
    confirmation:'native browser confirm() lifecycle; no host-rendered DOM dialog seam',
    result_truth:'persisted host step status plus current/final workflow state; clicks are not evidence',
    correction:'native Revert target -> assigned User Input -> explicit destination_complete back to Review',
    navigation:'admin URL authority requires presentation adapter; frontend shortcode/block native Back removes Entry Detail query state',
  },
};
const browserPath=`${artifactDir}/wu18-browser-results.json`;
let existing={}; try{existing=JSON.parse(fs.readFileSync(browserPath,'utf8'));}catch{}
existing.operator_journey_qualification=summary;
fs.writeFileSync(browserPath,JSON.stringify(existing,null,2)+'\n');
fs.writeFileSync(`${artifactDir}/wu18-operator-journey-browser-results.json`,JSON.stringify(summary,null,2)+'\n');
const failed=results.filter(r=>r.status!=='PASS');
if(failed.length) throw new Error(`Operator journey qualification failed: ${JSON.stringify(failed)}`);
console.log('WU18_OPERATOR_JOURNEY_BROWSER_QUALIFICATION_PASS');
