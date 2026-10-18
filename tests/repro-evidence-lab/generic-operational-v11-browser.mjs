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
