import fs from 'node:fs';
const sourceUrl=new URL('./wu17-a11y005-stage1-diagnostic.mjs',import.meta.url);
const runtimeUrl=new URL('./.wu17-reload-only.runtime.mjs',import.meta.url);
let s=fs.readFileSync(sourceUrl,'utf8');
const actionNeedle="if(action==='push') await exerciseNativePushPreference(page,url);";
const actionPatch=`${actionNeedle}\n      if(action==='reload'){ await page.goto(url,{waitUntil:'networkidle'}); await page.waitForSelector('.gpp-inbox-surface .ag-root-wrapper'); }`;
if(!s.includes(actionNeedle))throw new Error('action seam changed');
s=s.replace(actionNeedle,actionPatch);
const listNeedle="['fresh_control',[]],['composition_only',['composition']]";
const listPatch="['fresh_control',[]],['reload_only',['reload']],['composition_only',['composition']]";
if(!s.includes(listNeedle))throw new Error('scenario seam changed');
s=s.replace(listNeedle,listPatch);
fs.writeFileSync(runtimeUrl,s);
try{await import(`${runtimeUrl.href}?run=${Date.now()}`);}finally{fs.rmSync(runtimeUrl,{force:true});}
