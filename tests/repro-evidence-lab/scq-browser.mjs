/**
 * Test-only direct CDP over Chromium's inherited anonymous pipes.
 * No TCP debugger, no Playwright browser controller or cache/focus emulation.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright'; // only the existing pinned executable path

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function poll(label,read,timeout=20000){
  const end=Date.now()+timeout;
  let last=null;
  while(Date.now()<end){
    try{const result=await read();if(result)return result;}catch(e){last=e.message;}
    await sleep(100);
  }
  throw Error(label+(last?' ('+last+')':''));
}
function pipeClient(child){
  let sequence=0,buffer='';
  const pending=new Map(),notRestored=[],listeners=new Map();
  const abort=()=>{
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CHROMIUM_CDP_CLOSED'));}
    pending.clear();
  };
  child.once('exit',abort);child.once('error',abort);
  child.stdio[3].on('error',abort);child.stdio[4].on('error',abort);
  child.stdio[4].setEncoding('utf8');
  child.stdio[4].on('data',chunk=>{
    buffer+=chunk;
    let end;
    while((end=buffer.indexOf('\0'))!==-1){
      const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);
      if(!raw)continue;
      const msg=JSON.parse(raw);
      if(msg.id){
        const p=pending.get(msg.id);if(!p)continue;
        pending.delete(msg.id);clearTimeout(p.timer);
        if(msg.error)p.reject(Error(p.method+' CDP error '+msg.error.code));
        else p.resolve(msg.result);
      }else if(listeners.has(msg.sessionId)){
        for(const fn of listeners.get(msg.sessionId))fn(msg.method,msg.params||{});
      }else if(msg.method==='Page.backForwardCacheNotUsed'){
        notRestored.push({session:msg.sessionId,
          reasons:(msg.params?.notRestoredExplanations||[]).map(x=>({type:x.type,reason:x.reason}))});
      }
    }
  });
  return {notRestored,subscribe(id,fn){if(!listeners.has(id))listeners.set(id,new Set());listeners.get(id).add(fn);return ()=>listeners.get(id)?.delete(fn);},send(method,params={},sessionId){
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},10000);
      pending.set(id,{resolve,reject,timer,method});
      child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0',error=>{
        if(error&&pending.has(id)){clearTimeout(timer);pending.delete(id);reject(Error(method+' pipe write failed'));}
      });
    });
  }};
}
function installObserver(){
  const trace={doc:Math.random().toString(36).slice(2),events:[],pagehideRoots:null};
  window.__p1cNativeTrace=trace;
  const save=e=>trace.events.push({type:e.type,trusted:e.isTrusted,state:document.visibilityState,
    persisted:e.persisted===true,at:performance.now()});
  document.addEventListener('visibilitychange',save);
  window.addEventListener('pagehide',save);
  window.addEventListener('pageshow',save);
}
export function readState(){
  const trace=window.__p1cNativeTrace;
  if(!trace)return null;
  return {doc:trace.doc,events:trace.events,state:document.visibilityState,
    pagehideRoots:trace.pagehideRoots,url:location.href,ready:document.readyState,
    roots:[...document.querySelectorAll('[data-ciq2-root]')].map(r=>({
      element:r.dataset.ciq2Element,form:r.dataset.ciq2Form,state:r.dataset.ciq2State,
      entries:[...r.querySelectorAll('[data-ciq2-entry]')].map(n=>Number(n.dataset.ciq2Entry)).sort((a,b)=>a-b)
    })),shells:document.querySelectorAll('[data-gpp-atomic-element-id]').length,
    denied:[...document.querySelectorAll('.ciq2[role="alert"]')].filter(n=>n.textContent.includes('فهرست در دسترس نیست')).length,
    privateMarkers:[...new Set((document.documentElement.outerHTML.match(/SYN-SC-[AB]-(?:[A-Z]+|\d+)/g)||[]))],
    navigation:performance.getEntriesByType('navigation').map(n=>({
      type:n.type,notRestoredReasons:n.notRestoredReasons?.reasons?.map(r=>r.reason)||null
    }))};
}
export async function tab(cdp,context){
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank',browserContextId:context});
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params={})=>cdp.send(method,params,sessionId);
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+installObserver.toString()+')()'});
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('PAGE_EVALUATION_FAILED');
    return r.result.value;
  };
  const read=()=>evaluate('('+readState.toString()+')()');
  const activate=()=>cdp.send('Target.activateTarget',{targetId});
  const navigate=async (url,allowSameOriginRedirect=false)=>{
    const before=await read().catch(()=>null);
    const result=await send('Page.navigate',{url});
    if(result.errorText)throw Error('NAVIGATION_FAILED '+result.errorText);
    return poll('NAVIGATION_NOT_OBSERVED',async()=>{
      const s=await read();
      return s&&s.doc!==before?.doc&&(s.url===url||
        (allowSameOriginRedirect&&new URL(s.url).origin===new URL(url).origin))&&
        s.ready==='complete'&&s.events.some(e=>e.type==='pageshow'&&e.trusted)?s:null;
    },35000);
  };
  return {sessionId,send,evaluate,read,activate,navigate};
}
export async function context(cdp,run){
  const {browserContextId:id}=await cdp.send('Target.createBrowserContext');
  try{return await run(id);}
  finally{await cdp.send('Target.disposeBrowserContext',{browserContextId:id}).catch(()=>{});}
}
export async function transition(page,activate,expected){
  const before=await page.read();
  assert.ok(before&&before.state!==expected,'TRANSITION_PRECONDITION_ABSENT');
  await activate();
  let last=null,after;
  try{
    after=await poll('NATIVE_'+expected.toUpperCase()+'_NOT_OBSERVED',async()=>{
      const s=await page.read();
      if(s)last={doc:s.doc,state:s.state,events:s.events.slice(before.events.length)};
      return s&&s.doc===before.doc&&s.state===expected&&s.events.slice(before.events.length)
        .some(e=>e.type==='visibilitychange'&&e.trusted&&e.state===expected)?s:null;
    },8000);
  }catch(e){throw Error(e.message+' '+JSON.stringify({before:{doc:before.doc,state:before.state,eventCount:before.events.length},last}));}
  return {qualified:true,doc:after.doc,from:before.state,to:after.state,
    events:after.events.slice(before.events.length)};
}
export async function historyReturn(page,entry,previous){
  await page.send('Page.navigateToHistoryEntry',{entryId:entry.id});
  const result=await poll('HISTORY_RETURN_NOT_OBSERVED',async()=>{
    const s=await page.read();
    if(!s||s.url!==entry.url||s.ready!=='complete')return null;
    const events=s.doc===previous.doc?s.events.slice(previous.events.length):s.events;
    const show=events.find(e=>e.type==='pageshow'&&e.trusted);
    return show?{s,show}:null;
  },35000);
  const {s,show}=result;
  const fresh=s.doc===previous.doc?s.events.slice(previous.events.length):s.events;
  const hideIndex=fresh.findIndex(e=>e.type==='pagehide'&&e.trusted&&e.persisted);
  const showIndex=fresh.findIndex(e=>e.type==='pageshow'&&e.trusted&&e.persisted);
  return {qualified:s.doc===previous.doc&&show.persisted===true&&hideIndex>=0&&showIndex>hideIndex,
    beforeDoc:previous.doc,afterDoc:s.doc,events:s.events,pagehideRoots:s.pagehideRoots,navigation:s.navigation};
}
export async function independentBrowser(record,run){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'p1c-chromium-'));
  let browser,server,cdp;
  try{
    // Match the previous disposable-runner sandbox setting. No product
    // cache/privacy/security headers or browser BFCache options are changed.
    const executable=chromium.executablePath();
    const args=['--no-sandbox','--no-first-run','--no-default-browser-check',
      '--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'];
    browser=spawn(executable,args,{stdio:['ignore','ignore','ignore','pipe','pipe']});
    cdp=pipeClient(browser);
    const version=await cdp.send('Browser.getVersion');
    record('INDEPENDENT_BROWSER_IDENTITY','PASS',{executable,args,version:version.product,
      profile:'temporary isolated directory',transport:'inherited anonymous pipes; no TCP listener'});
    server=http.createServer((req,res)=>{
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'});
      res.end('<!doctype html><title>Neutral P1C control</title><p>Neutral test page</p>');
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const neutral='http://127.0.0.1:'+server.address().port;
    // Previously qualified method; only execute the three selected product scenarios.
    await run({cdp,neutral});

  }finally{
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    if(cdp)await cdp.send('Browser.close').catch(()=>{});
    if(browser&&browser.exitCode===null&&browser.signalCode===null){
      browser.kill('SIGTERM');
      await Promise.race([new Promise(r=>browser.once('exit',r)),sleep(3000)]);
      if(browser.exitCode===null&&browser.signalCode===null){browser.kill('SIGKILL');await Promise.race([new Promise(r=>browser.once('exit',r)),sleep(1000)]);}
    }
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
}
