import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { assertInboxComposition } from './inbox-composition-assertions.mjs';

const baseUrl=process.env.WU21_BASE_URL||'http://127.0.0.1:8080';
const artifactDir=process.env.WU21_ARTIFACT_DIR, wpCli=process.env.WU21_WP_CLI, wpPath=process.env.WU21_WP_PATH;
const cp=spawnSync('php',[wpCli,`--path=${wpPath}`,'eval','echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"), JSON_UNESCAPED_SLASHES);'],{encoding:'utf8',env:process.env});
if(cp.status!==0)throw new Error(cp.stderr||cp.stdout);
const url=JSON.parse(cp.stdout).frontend_inbox_url;
const browser=await chromium.launch({headless:true}), page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto(`${baseUrl}/wp-login.php`,{waitUntil:'domcontentloaded'});
await page.fill('#user_login','bootstrap_admin');
await page.fill('#user_pass',['wu21','bootstrap','pass','2026'].join('-'));
await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#wp-submit')]);

async function go(width,scale=1){await page.setViewportSize({width,height:1000});await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('.gpp-inbox-surface .ag-root-wrapper');await page.evaluate(s=>document.documentElement.style.fontSize=`${16*s}px`,scale);}
async function saved(){return page.evaluate(()=>{const e=Object.entries(localStorage).find(([k])=>k.includes('_inbox_shortcode_'));if(!e)return null;let v;try{v=JSON.parse(e[1]);}catch{return{key:e[0],raw:e[1]};}return{key:e[0],order:v.map(x=>x.colId),columns:v.map(x=>({colId:x.colId,width:x.width,hide:x.hide}))};});}
async function trace(){await page.evaluate(()=>{window.__f=[];document.addEventListener('focusin',e=>{const a=e.target;window.__f.push({tag:a?.tagName||null,class:typeof a?.className==='string'?a.className:null,dataJs:a?.getAttribute?.('data-js')||null,header:a?.closest?.('.ag-header-cell')?.getAttribute('col-id')||null,cell:a?.closest?.('.ag-cell')?.getAttribute('col-id')||null,grid:!!a?.closest?.('.ag-root-wrapper')});},true);});await page.locator('.gpp-inbox-surface [data-js="gflow-inbox-search"]').focus();const tabs=[];for(let i=1;i<=8;i++){await page.keyboard.press('Tab');const s=await page.evaluate(()=>{const a=document.activeElement;return{tag:a?.tagName||null,class:typeof a?.className==='string'?a.className:null,dataJs:a?.getAttribute?.('data-js')||null,header:a?.closest?.('.ag-header-cell')?.getAttribute('col-id')||null,cell:a?.closest?.('.ag-cell')?.getAttribute('col-id')||null,inside:!!a?.closest?.('[data-gpp-inbox-surface="gravity_flow.inbox"]')};});tabs.push({step:i,...s});if(s.header||s.cell||!s.inside)break;}return{tabs,focusin:await page.evaluate(()=>window.__f)};}
const out={steps:[]};
await go(1440);out.initial={saved:await saved(),trace:await trace()};
for(const [width,scale] of [[1440,1],[1440,2],[390,1],[390,2],[320,1],[320,2]]){await go(width,scale);const before=await saved();await assertInboxComposition(page);const after=await saved();out.steps.push({width,scale,before,after});}
await go(1440);out.contaminated={saved:await saved(),trace:await trace()};
out.removed=await page.evaluate(()=>{const r=[];for(const k of Object.keys(localStorage))if(k.includes('_inbox_shortcode_')){r.push(k);localStorage.removeItem(k);}return r;});
await go(1440);out.cleared={saved:await saved(),trace:await trace()};
await browser.close();
fs.writeFileSync(path.join(artifactDir,'wu17-a11y005-storage-counterfactual.json'),JSON.stringify(out,null,2)+'\n');
process.stdout.write('WU17_A11Y005_STORAGE_COUNTERFACTUAL='+JSON.stringify({initial:out.initial.saved?.order,steps:out.steps.map(s=>({width:s.width,scale:s.scale,before:s.before?.order,after:s.after?.order})),contaminated:{order:out.contaminated.saved?.order,tabs:out.contaminated.trace.tabs,focusin:out.contaminated.trace.focusin},cleared:{order:out.cleared.saved?.order,tabs:out.cleared.trace.tabs,focusin:out.cleared.trace.focusin}})+'\n');
process.exit(1);
