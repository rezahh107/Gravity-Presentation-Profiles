import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const base=process.env.WU21_BASE_URL, wp=process.env.WU21_WP_PATH, cli=process.env.WU21_WP_CLI, out=process.env.WU21_ARTIFACT_DIR;
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/generic-operational-paint-v11.json','utf8'));
const host=JSON.parse(fs.readFileSync(out+'/wu18-fixture-manifest.json','utf8'));
const detailUrl=base+'/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id='+host.alpha.form_id+'&lid='+host.alpha.entry_id;
const inboxUrl=base+'/wp-admin/admin.php?page=gravityflow-inbox';
const rgb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
const evidence={checks:[],result:'NOT_RUN'};
function check(v,m){if(!v)throw new Error(m);evidence.checks.push(m);}
function control(action,surface='',previous=null){
  const p=spawnSync('php',[cli,'--path='+wp,'eval-file','tests/repro-evidence-lab/generic-operational-v11-control.php'],{
    encoding:'utf8',env:{...process.env,GPP_OPERATIONAL_ACTION:action,GPP_OPERATIONAL_SURFACE:surface,GPP_OPERATIONAL_PREVIOUS:JSON.stringify(previous)}});
  if(p.status!==0)throw new Error(p.stderr+p.stdout);
  const marker='GPP_OPERATIONAL_JSON:',pos=p.stdout.indexOf(marker);
  if(pos<0)throw new Error(p.stdout);
  return JSON.parse(p.stdout.slice(pos+marker.length).trim());
}
function restore(surface,value){control(value?'rollback':'deactivate',surface,value);}
async function openDetail(page,width){
  await page.setViewportSize({width,height:1000});
  await page.goto(detailUrl,{waitUntil:'networkidle'});
  await page.locator('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').waitFor();
  return page.evaluate(()=>{
    const el=document.querySelector('.gpp-entry-dossier');
    return {paint:getComputedStyle(el).backgroundColor,heading:getComputedStyle(el.querySelector('.gpp-entry-dossier__section-title')).color,
      label:getComputedStyle(el.querySelector('.gpp-entry-dossier__fact dt')).color,direction:getComputedStyle(el).direction,
      actions:[...document.querySelectorAll('.gravityflow_workflow_detail input[type=submit]')].map(x=>[x.name,x.value,x.disabled])};
  });
}
async function openInbox(page,width){
  await page.setViewportSize({width,height:1000});
  await page.goto(inboxUrl,{waitUntil:'networkidle'});
  await page.locator('.gflow-inbox.gflow-grid.gflow-common .ag-header-cell').first().waitFor();
  return page.evaluate(()=>{
    const grid=document.querySelector('.gflow-inbox.gflow-grid.gflow-common');
    return {paint:getComputedStyle(grid.querySelector('.ag-header-cell')).color,columns:grid.querySelectorAll('.ag-header-cell').length,
      axis:getComputedStyle(grid.querySelector('.ag-center-cols-viewport')).direction};
  });
}

fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
let failure=null,imported=false;
try{
  await page.goto(base+'/wp-login.php',{waitUntil:'domcontentloaded'});
  await page.locator('#user_login').fill('bootstrap_admin');
  await page.locator('#user_pass').fill('wu21-bootstrap-pass-2026');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('#wp-submit').click()]);
  const initial=control('snapshot');
  evidence.original=Object.fromEntries(['gravity_flow.inbox','gravity_flow.entry_detail','print.dossier']
    .map(k=>[k,initial.activations?.[k]||null]));
  evidence.before={entry:await openDetail(page,1440),inbox:await openInbox(page,1440)};
  await page.screenshot({path:out+'/generic-operational-before-inbox.png',fullPage:true});
  const importedResult=control('import'); imported=true;
  check(importedResult.status==='INSTALLED_INACTIVE','Real JSON import inactive');
  const installed=control('snapshot');
  check(JSON.stringify(installed.activations)===JSON.stringify(initial.activations),'No implicit activation');
  check(Boolean(installed.installed?.[fixture.package_id]?.[fixture.package_version]?.content_hash),'Immutable stored version');

  control('activate','gravity_flow.entry_detail');
  const active=await openDetail(page,1440);
  check(active.paint===rgb(fixture.design_tokens.colors.detail_surface),'Entry computed background changed');
  check(active.heading===rgb(fixture.design_tokens.colors.detail_heading),'Entry heading token consumed');
  check(active.label===rgb(fixture.design_tokens.colors.detail_label),'Entry label token consumed');
  check(active.direction===evidence.before.entry.direction,'Entry RTL kept');
  check(JSON.stringify(active.actions)===JSON.stringify(evidence.before.entry.actions),'Native actions unchanged');
  check((await openInbox(page,1440)).paint===evidence.before.inbox.paint,'Entry activation isolated from Inbox');
  control('activate','gravity_flow.inbox');
  const activations=control('snapshot').activations;
  check(activations['gravity_flow.inbox'].profile_id==='fixture.operations.inbox.v1','Inbox explicit activation');
  check(activations['gravity_flow.entry_detail'].profile_id==='fixture.operations.entry.v1','Entry explicit activation');
  check(JSON.stringify(activations['print.dossier']||null)===JSON.stringify(evidence.original['print.dossier']),'Print unchanged');

  evidence.after={};
  for(const width of [1440,390,320]){
    const d=await openDetail(page,width),i=await openInbox(page,width);
    evidence.after[width]={entry:d,inbox:i};
    check(d.paint===rgb(fixture.design_tokens.colors.detail_surface),'Entry computed paint '+width);
    check(i.paint===rgb(fixture.design_tokens.colors.inbox_label),'Inbox computed paint '+width);
    check(d.direction===evidence.before.entry.direction,'RTL direction '+width);
    check(i.axis===evidence.before.inbox.axis,'Grid physical axis '+width);
    check(i.columns===evidence.before.inbox.columns,'Grid column count '+width);
    await page.screenshot({path:out+'/generic-operational-detail-'+width+'.png'});
  }
  await page.screenshot({path:out+'/generic-operational-after-inbox.png'});
  restore('gravity_flow.inbox',evidence.original['gravity_flow.inbox']);
  check((await openInbox(page,1440)).paint===evidence.before.inbox.paint,'Inbox computed rollback');
  check((await openDetail(page,1440)).paint===rgb(fixture.design_tokens.colors.detail_surface),'Independent Entry paint retained');
  evidence.result='PASS';
}catch(e){failure=e;evidence.result='FAIL';evidence.error=String(e);}
finally{
  if(imported&&evidence.original){
    try{
      for(const surface of ['gravity_flow.inbox','gravity_flow.entry_detail'])restore(surface,evidence.original[surface]);
      evidence.restored=control('snapshot').activations;
    }catch(e){failure ||= e;evidence.result='FAIL';evidence.restore_error=String(e);}
  }
  fs.writeFileSync(out+'/generic-operational-v11-browser.json',JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
}
if(failure)throw failure;
console.log('GPP_GENERIC_OPERATIONAL_BROWSER_PASS');
