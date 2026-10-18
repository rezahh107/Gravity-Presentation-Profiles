import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const base=process.env.WU21_BASE_URL, cli=process.env.WU21_WP_CLI, wp=process.env.WU21_WP_PATH;
const out=process.env.WU21_ARTIFACT_DIR;
const host=JSON.parse(fs.readFileSync(out+'/wu18-fixture-manifest.json','utf8'));
const detail=base+'/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id='+host.alpha.form_id+'&lid='+host.alpha.entry_id;
function run(action,surface='',previous=null){
  const p=spawnSync('php',[cli,'--path='+wp,'eval-file','tests/repro-evidence-lab/generic-operational-v11-control.php'],{
    encoding:'utf8',env:{...process.env,GPP_OPERATIONAL_ACTION:action,GPP_OPERATIONAL_SURFACE:surface,GPP_OPERATIONAL_PREVIOUS:JSON.stringify(previous)}});
  if(p.status!==0)throw new Error(p.stderr+p.stdout);
  const marker='GPP_OPERATIONAL_JSON:',at=p.stdout.indexOf(marker);
  if(at<0)throw new Error('Missing lifecycle readback: '+p.stdout);
  return JSON.parse(p.stdout.slice(at+marker.length).trim());
}
async function observe(page,url){
  await page.goto(url,{waitUntil:'networkidle'});
  return page.evaluate(()=>{
    const styles=[...document.querySelectorAll('style,link[rel=stylesheet]')];
    return {
      bodyBackground:getComputedStyle(document.body).backgroundColor,
      bodyColor:getComputedStyle(document.body).color,
      operationalStyle:styles.some(el=>el.id?.includes('gpp-srwf-gravity-flow')||
        el.textContent?.includes('color:#6C4422')||el.textContent?.includes('background-color:#E5FAFF')),
      operationalDOM:!!document.querySelector('.gpp-entry-dossier,.gpp-inbox-surface')
    };
  });
}
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const evidence={result:'NOT_RUN'};
let failure=null;
const snapshot=run('snapshot');
const originals=Object.fromEntries(['gravity_flow.inbox','gravity_flow.entry_detail'].map(x=>[x,snapshot.activations?.[x]||null]));
try{
  const url=run('unrelated_page');
  evidence.before=await observe(page,url);
  run('activate','gravity_flow.inbox');
  run('activate','gravity_flow.entry_detail');
  evidence.after=await observe(page,url);
  if(evidence.after.operationalStyle||evidence.after.operationalDOM)throw new Error('Operational styles leaked to unrelated WordPress page');
  if(evidence.before.bodyBackground!==evidence.after.bodyBackground||
     evidence.before.bodyColor!==evidence.after.bodyColor)throw new Error('Unrelated computed body paint changed with operational activation');
  await page.goto(detail,{waitUntil:'domcontentloaded'});
  evidence.anonymousDetail={url:page.url(),dossierCount:await page.locator('.gpp-entry-dossier').count()};
  if(evidence.anonymousDetail.dossierCount!==0)throw new Error('Anonymous request exposed protected dossier');
  evidence.result='PASS';
}catch(e){failure=e;evidence.result='FAIL';evidence.error=String(e);}
finally{
  try{
    for(const surface of ['gravity_flow.inbox','gravity_flow.entry_detail']){
      const value=originals[surface];
      run(value?'rollback':'deactivate',surface,value);
    }
    evidence.restored=run('snapshot').activations;
  }catch(e){failure ||= e;evidence.result='FAIL';evidence.restore_error=String(e);}
  fs.writeFileSync(out+'/generic-operational-v11-negative-browser.json',JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
}
if(failure)throw failure;
console.log('GPP_GENERIC_OPERATIONAL_NEGATIVE_BROWSER_PASS');
