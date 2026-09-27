import fs from 'node:fs';
const sourceUrl=new URL('./wu17-a11y005-stage1-diagnostic.mjs',import.meta.url);
const runtimeUrl=new URL('./.wu17-a11y005-stage1-column-state.runtime.mjs',import.meta.url);
let s=fs.readFileSync(sourceUrl,'utf8');
const actionNeedle="if(action==='push') await exerciseNativePushPreference(page,url);";
const actionPatch=`${actionNeedle}\n      if(action==='force-gpp-first'||action==='force-id-first'){\n        const first=action==='force-gpp-first'?'gpp_case_card':'id';\n        const next=await page.evaluate(first=>{const hit=Object.entries(localStorage).find(([,v])=>v.includes('gpp_case_card'));if(!hit)throw new Error('grid state missing');const [key,value]=hit,a=JSON.parse(value),i=a.findIndex(x=>x.colId===first);if(i<0)throw new Error('column missing');a.unshift(...a.splice(i,1));return{key,value:JSON.stringify(a),colIds:a.map(x=>x.colId)};},first);\n        await page.addInitScript(({key,value})=>localStorage.setItem(key,value),next);\n        forced.push(next);\n      }`;
if(!s.includes(actionNeedle))throw new Error('action seam changed');
s=s.replace(actionNeedle,actionPatch);
s=s.replace('let error=null,result=null;','let error=null,result=null,forced=[];');
s=s.replace('return {label,actions,error,result};','return {label,actions,forced,error,result};');
const listNeedle="['push_only',['push']],['composition_then_actions',['composition','actions']],['actions_then_push',['actions','push']]";
const listPatch="['push_only',['push']],['native_actions_force_gpp_first',['actions','force-gpp-first']],['fresh_force_id_first',['force-id-first']],['composition_then_actions',['composition','actions']],['actions_then_push',['actions','push']]";
if(!s.includes(listNeedle))throw new Error('scenario seam changed');
s=s.replace(listNeedle,listPatch);
fs.writeFileSync(runtimeUrl,s);
try{await import(`${runtimeUrl.href}?run=${Date.now()}`);}finally{fs.rmSync(runtimeUrl,{force:true});}
