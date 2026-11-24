// Observe actual HTTP asset bodies; never alter routing, cache, or assertions.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=process.env.GITHUB_WORKSPACE;
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const out=process.env.WU21_DIAG_NETWORK;
if(!out)throw Error('diagnostic destination required');
const names=new Map(),pending=new Set(),observed=new WeakSet();
const hash=x=>createHash('sha256').update(x).digest('hex');
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 const rel=dir+'/'+e.name;if(e.isDirectory())walk(rel);else if(/\.(css|js)$/.test(rel)){
 const arr=names.get(e.name)||[];arr.push(rel);names.set(e.name,arr);
 }}}
walk('assets');walk('profiles');
function emit(o){fs.appendFileSync(out,JSON.stringify(o)+'\n');}
function asset(url){
 try{const u=new URL(url),p=decodeURIComponent(u.pathname);
 const prefix='/wp-content/plugins/gravity-presentation-profiles/';
 const idx=p.indexOf(prefix), rel=idx>=0?p.slice(idx+prefix.length):null;
 let expected=rel&&names.get(path.basename(rel))?.includes(rel)?rel:null;
 const choices=names.get(path.basename(p))||[];
 if(!expected&&choices.length===1&&(!p.includes('/wp-content/plugins/')||p.includes('gravity-presentation-profiles')||choices[0].includes('gpp-')||choices[0].includes('srwf-')||choices[0].includes('gravity-forms-declarative')))expected=choices[0];
 if(!expected&&!p.includes('gravity-presentation-profiles'))return null;
 return {url:u.origin+u.pathname+u.search,expected,expectedHash:expected?hash(fs.readFileSync(path.join(root,expected))):null};
 }catch{return null;}
}
function track(p){pending.add(p);p.finally(()=>pending.delete(p)).catch(()=>{});}
function page(p){
 if(observed.has(p))return;observed.add(p);
 p.on('response',r=>{let a=asset(r.url());if(!a||!/\.(css|js)(\?|$)/.test(r.url()))return;
 const h=r.headers(), row={kind:'response',...a,status:r.status(),contentType:h['content-type']||null};
 track((async()=>{try{const b=await r.body();row.bytes=b.length;row.actualHash=hash(b);row.parity=row.actualHash===row.expectedHash;row.html=/^\s*(<!doctype|<html)/i.test(b.subarray(0,128).toString());}catch(e){row.bodyUnavailable=String(e.message).slice(0,150);}emit(row);})());
 });
 p.on('requestfailed',r=>{const a=asset(r.url());if(a)emit({kind:'requestfailed',...a,reason:r.failure()?.errorText});});
 p.on('domcontentloaded',()=>{track((async()=>{try{
 const urls=await p.evaluate(()=>[...document.querySelectorAll('link[rel="stylesheet"],script[src]')].map(e=>({id:e.id,url:e.href||e.src})));
 const rows=urls.map(x=>({...x,asset:asset(x.url)})).filter(x=>x.asset||/^gpp[-_]/i.test(x.id));
 emit({kind:'emitted',page:new URL(p.url()).pathname,assets:rows});
 }catch(e){emit({kind:'dom_unavailable',reason:String(e.message).slice(0,150)});}})());});
}
async function drain(){await Promise.race([Promise.allSettled([...pending]),new Promise(r=>setTimeout(r,2500))]);}
function context(c){c.on('page',page);for(const p of c.pages())page(p);const close=c.close.bind(c);c.close=async(...a)=>{await drain();return close(...a);};return c;}
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{const b=await launch(...args);emit({kind:'browser',version:b.version()});const nc=b.newContext.bind(b),np=b.newPage.bind(b),close=b.close.bind(b);
 b.newContext=async(...a)=>context(await nc(...a));
 b.newPage=async(...a)=>{const p=await np(...a);page(p);return p;};
 b.close=async(...a)=>{await drain();return close(...a);};return b;
};
