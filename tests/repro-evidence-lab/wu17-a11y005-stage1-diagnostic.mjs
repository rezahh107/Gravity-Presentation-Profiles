import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exerciseInboxComposition, exerciseNativeInboxActions, exerciseNativePushPreference } from './inbox-composition-assertions.mjs';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpCli = process.env.WU21_WP_CLI;
const wpPath = process.env.WU21_WP_PATH;
function wpEval(code) {
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(cp.stderr || cp.stdout);
  return cp.stdout.trim();
}
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const url = manifest.frontend_inbox_url;
const cookies = JSON.parse(wpEval(`
$u=get_user_by('login','bootstrap_admin'); if(!$u) throw new RuntimeException('operator unavailable');
$expiration=time()+900;
echo wp_json_encode(array(
array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$expiration,'auth')),
array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$expiration,'logged_in'))
));`));
const browser = await chromium.launch({ headless: true });

async function trace(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.gpp-inbox-surface [data-js="gflow-inbox"] .ag-root-wrapper');
  const before = await page.evaluate(() => ({
    notificationPermission: typeof Notification === 'undefined' ? null : Notification.permission,
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
    gridClass: document.querySelector('.gpp-inbox-surface .ag-root-wrapper')?.className || null,
    guards: [...document.querySelectorAll('.gpp-inbox-surface .ag-tab-guard')].map(n => ({ class:n.className, attr:n.getAttribute('tabindex'), tabIndex:n.tabIndex })),
  }));
  await page.evaluate(() => {
    window.__stage1Focus=[];
    document.addEventListener('focusin', e => {
      const n=e.target;
      window.__stage1Focus.push({tag:n?.tagName||null,class:typeof n?.className==='string'?n.className:null,dataJs:n?.getAttribute?.('data-js')||null,tabIndex:typeof n?.tabIndex==='number'?n.tabIndex:null,tabindexAttribute:n?.getAttribute?.('tabindex')||null,headerColId:n?.closest?.('.ag-header-cell')?.getAttribute('col-id')||null,cellColId:n?.closest?.('.ag-cell')?.getAttribute('col-id')||null,insideGrid:!!n?.closest?.('.ag-root-wrapper'),insideToolbar:!!n?.closest?.('[data-gpp-inbox-toolbar]')});
    }, true);
  });
  await page.locator('.gpp-inbox-surface [data-js="gflow-inbox-search"]').focus();
  const tabs=[];
  for(let i=1;i<=8;i+=1){
    await page.keyboard.press('Tab');
    const state=await page.evaluate(()=>{const n=document.activeElement;return {tag:n?.tagName||null,class:typeof n?.className==='string'?n.className:null,dataJs:n?.getAttribute?.('data-js')||null,tabIndex:typeof n?.tabIndex==='number'?n.tabIndex:null,tabindexAttribute:n?.getAttribute?.('tabindex')||null,headerColId:n?.closest?.('.ag-header-cell')?.getAttribute('col-id')||null,cellColId:n?.closest?.('.ag-cell')?.getAttribute('col-id')||null,insideGrid:!!n?.closest?.('.ag-root-wrapper'),insideToolbar:!!n?.closest?.('[data-gpp-inbox-toolbar]'),insideInbox:!!n?.closest?.('[data-js="gflow-inbox"]')};});
    tabs.push({step:i,...state});
    if(state.headerColId||state.cellColId||!state.insideInbox) break;
  }
  return {before,tabs,focusin:await page.evaluate(()=>window.__stage1Focus)};
}
async function scenario(label,actions){
  const context=await browser.newContext();
  await context.addCookies(cookies.map(c=>({...c,url:baseUrl})));
  const page=await context.newPage();
  let error=null,result=null;
  try{
    for(const action of actions){
      if(action==='composition') await exerciseInboxComposition(page,url);
      if(action==='actions') await exerciseNativeInboxActions(page,url);
      if(action==='push') await exerciseNativePushPreference(page,url);
    }
    result=await trace(page);
  }catch(e){error=String(e?.stack||e);}finally{await context.close();}
  return {label,actions,error,result};
}
const scenarios=[];
for(const [label,actions] of [['fresh_control',[]],['composition_only',['composition']],['native_actions_only',['actions']],['push_only',['push']],['composition_then_actions',['composition','actions']],['actions_then_push',['actions','push']]]) scenarios.push(await scenario(label,actions));
await browser.close();
const evidence={kind:'WU17-A11Y-005 A11Y-001 sub-action diagnostic',generatedAtUtc:new Date().toISOString(),scenarios};
fs.writeFileSync(path.join(artifactDir,'wu17-a11y005-stage1-diagnostic.json'),JSON.stringify(evidence,null,2)+'\n');
process.stdout.write(`WU17_A11Y005_STAGE1=${JSON.stringify(scenarios.map(s=>({label:s.label,error:s.error,tabs:s.result?.tabs,focusin:s.result?.focusin,before:s.result?.before})))}\n`);
