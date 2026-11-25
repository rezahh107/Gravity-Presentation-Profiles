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
  const pending=new Map(),notRestored=[],networkListeners=new Map();
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
      }else if(msg.method?.startsWith('Network.')){
        networkListeners.get(msg.sessionId)?.(msg.method,msg.params);
      }else if(msg.method==='Page.backForwardCacheNotUsed'){
        notRestored.push({session:msg.sessionId,
          reasons:(msg.params?.notRestoredExplanations||[]).map(x=>({type:x.type,reason:x.reason}))});
      }
    }
  });
  return {notRestored,networkListeners,send(method,params={},sessionId){
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
  const trace={doc:Math.random().toString(36).slice(2),events:[],pagehideRoots:null,cardEvents:[]};
  window.__p1cNativeTrace=trace;
  const save=e=>trace.events.push({type:e.type,trusted:e.isTrusted,state:document.visibilityState,
    persisted:e.persisted===true,at:performance.now()});
  document.addEventListener('visibilitychange',e=>{
    if(document.hidden) trace.cardEvents=[];
    save(e);
  });
  // Observe real additions, including cards removed before the next poll.
  // Only synthetic numeric identities are retained; never text or HTML.
  const remember=node=>{
    if(node.nodeType!==1)return;
    const cards=[...(node.matches('[data-ciq2-entry]')?[node]:[]),...node.querySelectorAll('[data-ciq2-entry]')];
    for(const card of cards){
      const id=Number(card.dataset.ciq2Entry);
      if(Number.isSafeInteger(id)&&id>0&&!trace.cardEvents.includes(id))trace.cardEvents.push(id);
    }
  };
  new MutationObserver(records=>{
    for(const r of records){
      if(r.type==='attributes')remember(r.target);
      else for(const node of r.addedNodes)remember(node);
    }
  }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-ciq2-entry']});
  window.addEventListener('pagehide',save);
  window.addEventListener('pageshow',save);
}
export function readState(){
  const trace=window.__p1cNativeTrace;
  if(!trace)return null;
  return {doc:trace.doc,events:trace.events,state:document.visibilityState,
    pagehideRoots:trace.pagehideRoots,url:location.href,ready:document.readyState,
    cardEvents:trace.cardEvents,
    documentCards:document.querySelectorAll('[data-ciq2-entry]').length,
    privateMarker:document.documentElement?.innerHTML.includes('SYN-P1C-')===true,
    widgetStates:[...document.querySelectorAll('[data-gpp-atomic-element-id]')].map(n=>({
      element:n.dataset.gppAtomicElementId,
      shellState:n.dataset.gppAtomicInbox2,
      denied:n.textContent.includes('فهرست در دسترس نیست'),
      roots:[...n.querySelectorAll('[data-ciq2-root]')].map(r=>({
        element:r.dataset.ciq2Element,form:r.dataset.ciq2Form,state:r.dataset.ciq2State,
        entries:[...r.querySelectorAll('[data-ciq2-entry]')].map(c=>Number(c.dataset.ciq2Entry)).sort((a,b)=>a-b)
      }))
    })),
    roots:[...document.querySelectorAll('[data-ciq2-root]')].map(r=>({
      element:r.dataset.ciq2Element,form:r.dataset.ciq2Form,state:r.dataset.ciq2State,
      entries:[...r.querySelectorAll('[data-ciq2-entry]')].map(n=>Number(n.dataset.ciq2Entry)).sort((a,b)=>a-b)
    })),shells:document.querySelectorAll('[data-gpp-atomic-element-id]').length,
    denied:[...document.querySelectorAll('[data-gpp-atomic-element-id]')].filter(
      n=>n.textContent.includes('فهرست در دسترس نیست')).length,
    navigation:performance.getEntriesByType('navigation').map(n=>({
      type:n.type,notRestoredReasons:n.notRestoredReasons?.reasons?.map(r=>r.reason)||null
    }))};
}
// Per-tab CDP observation. No raw request/body/header values are persisted.
async function observeNetwork(cdp,sessionId,send,origin,caseName){
  const rows=[],documents=[],byId=new Map();
  let last=Date.now();
  const phases=[{name:'baseline',from:last/1000}];
  const phaseAt=wall=>Number.isFinite(wall)?phases.findLast(p=>wall>=p.from)?.name||'unattributed':'unattributed';
  const documentPhases=new Map();
  const endpoint=new URL('/wp-admin/admin-ajax.php',origin).href;
  const header=(headers,name)=>Object.entries(headers||{}).find(([k])=>k.toLowerCase()===name)?.[1];
  const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9]{1,32}$/.test(x)?x:null;
  cdp.networkListeners.set(sessionId,(method,p)=>{
    if(method==='Network.requestWillBeSent'){
      const phase=phaseAt(p.wallTime);
      if(p.type==='Document')documentPhases.set(p.requestId,phase);
      if(p.request.url!==endpoint||p.request.method!=='POST')return;
      const data=typeof p.request.postData==='string'?new URLSearchParams(p.request.postData):null;
      const action=data?.get('action');
      if(data&&!['gpp_inbox2_atomic_bootstrap','gpp_inbox2_read'].includes(action))return;
      const row={case:caseName,tab:sessionId,phase,action:action||null,
        element:safeId(data?.get('element_id')),form:safeId(data?.get('form_id')),
        direct:header(p.request.headers,'x-p1c-control')==='direct',
        requestWallTime:Number.isFinite(p.wallTime)?p.wallTime:null,
        status:null,bodyObserved:false,privateData:null,success:null,rejection:null,noStore:null,
        complete:false,problem:phase==='unattributed'?'REQUEST_TIME_UNAVAILABLE':data?null:'POST_DATA_UNAVAILABLE'};
      rows.push(row);byId.set(p.requestId,row);last=Date.now();
    }
    if(method==='Network.responseReceived'&&p.type==='Document'){
      try{
        const u=new URL(p.response.url);
        if(u.origin===origin)documents.push({phase:documentPhases.get(p.requestId)||'unattributed',status:p.response.status,login:u.pathname==='/wp-login.php',
          productPage:u.searchParams.has('page_id')});
      }catch{}
    }
    const row=byId.get(p.requestId);
    if(!row)return;
    if(method==='Network.responseReceived'){
      row.status=p.response.status;
      row.noStore=/\bno-store\b/i.test(header(p.response.headers,'cache-control')||'');
      if(p.response.url!==endpoint)row.problem='RESPONSE_ENDPOINT_MISMATCH';
      last=Date.now();
    }else if(method==='Network.loadingFailed'){
      row.complete=true;row.problem='NETWORK_LOADING_FAILED';last=Date.now();
    }else if(method==='Network.loadingFinished'){
      void (async()=>{
        try{
          const r=await send('Network.getResponseBody',{requestId:p.requestId});
          const raw=r.base64Encoded?Buffer.from(r.body,'base64').toString('utf8'):r.body;
          // Detect recognizable private markers even in malformed JSON.
          if(/SYN-P1C-|data-ciq2-entry/i.test(raw))row.privateData=true;
          const json=JSON.parse(raw);
          const html=typeof json?.data?.html==='string'?json.data.html:'';
          const markers=/SYN-P1C-|data-ciq2-entry/i.test(raw)||/SYN-P1C-|data-ciq2-entry/i.test(html);
          row.privateData=markers||(typeof json?.data?.count==='number'&&json.data.count>0);
          row.success=typeof json?.success==='boolean'?json.success:null;
          row.rejection=json?.data?.reason==='authorization_required'?'authorization_required':null;
          // Only recognize the documented rejection shape as evidence of absence.
          if(row.success===false&&(row.rejection!== 'authorization_required'||
              Object.keys(json.data||{}).some(k=>k!=='reason')||Object.keys(json).some(k=>!['success','data'].includes(k)))){
            if(!row.privateData)row.privateData=null;
          }
          row.bodyObserved=true;
        }catch{row.problem='RESPONSE_BODY_UNAVAILABLE_OR_UNRECOGNIZED';}
        finally{row.complete=true;last=Date.now();}
      })();
    }
  });
  await send('Network.enable',{maxPostDataSize:65536});
  return {phase(value){last=Date.now();phases.push({name:value,from:last/1000});},
    snapshot(){return rows.map(r=>({...r}));},
    documentSnapshot(){return documents.map(r=>({...r}));},
    async settled(){await poll('CDP_NETWORK_NOT_SETTLED',()=>rows.every(r=>r.complete)&&Date.now()-last>=750,12000);},
    close(){cdp.networkListeners.delete(sessionId);}
  };
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
  return {sessionId,send,evaluate,read,activate,navigate,observeNetwork:(origin,caseName)=>observeNetwork(cdp,sessionId,send,origin,caseName)};
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
    let visibility=false,bfcache=false;
    try{
      await context(cdp,async id=>{
        const one=await tab(cdp,id),two=await tab(cdp,id);
        await two.activate();await two.navigate(neutral+'/other');
        await one.activate();const initial=await one.navigate(neutral+'/one');
        assert.equal(initial.state,'visible');
        const hidden=await transition(one,two.activate,'hidden');
        const visible=await transition(one,one.activate,'visible');
        assert.equal(hidden.doc,visible.doc);
        record('NEUTRAL_NATIVE_VISIBILITY','PASS',{initial:initial.state,hidden,visible});
        visibility=true;
      });
    }catch(e){record('NEUTRAL_NATIVE_VISIBILITY','NOT_PROVEN',{reason:String(e.message||e)});}
    try{
      await context(cdp,async id=>{
        const p=await tab(cdp,id);await p.activate();
        const first=await p.navigate(neutral+'/first');
        const history=await p.send('Page.getNavigationHistory');
        const entry=history.entries[history.currentIndex];
        await p.navigate(neutral+'/second');
        const witness=await historyReturn(p,entry,first);
        bfcache=witness.qualified;
        record('NEUTRAL_NATIVE_BFCACHE',bfcache?'PASS':'NOT_PROVEN',
          {witness,reasons:cdp.notRestored.filter(e=>e.session===p.sessionId)});
      });
    }catch(e){record('NEUTRAL_NATIVE_BFCACHE','NOT_PROVEN',{reason:String(e.message||e)});}
    await run({cdp,neutral,visibility,bfcache});
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
