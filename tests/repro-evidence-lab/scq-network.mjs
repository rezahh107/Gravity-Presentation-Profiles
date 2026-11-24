/** Test-only CDP network witnesses. Never persist raw request bodies, cookies,
 * credentials, response bodies, or session tokens. The fixtures are synthetic. */
import {createHash} from 'node:crypto';
export function classifyBody(body){
  let html=body, json=null;
  try{json=JSON.parse(body);if(typeof json?.data?.html==='string')html=json.data.html;}catch{}
  const ids=[...html.matchAll(/data-ciq2-entry\s*=\s*["'](\d+)["']/g)].map(m=>Number(m[1]));
  const markers=[...new Set(html.match(/SYN-SC-[AB]-(?:[A-Z]+|\d+)/g)||[])].sort();
  return {bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),
    ids,markers,denied:html.includes('فهرست در دسترس نیست'),
    jsonSuccess:typeof json?.success==='boolean'?json.success:null,
    reason:['authorization_required','incomplete_authorized_snapshot'].includes(json?.data?.reason)?json.data.reason:null};
}
export async function observeNetwork(cdp,page,productUrl){
  const origin=new URL(productUrl).origin, productPath=new URL(productUrl).pathname;
  let phase='setup',sequence=0;
  const records=[],active=new Map(),tasks=new Set(),errors=[];
  const attach=(method,p)=>{
    try{
      if(method==='Network.requestWillBeSent'){
        const u=new URL(p.request.url);
        if(u.origin!==origin)return;
        const isPage=p.type==='Document'&&u.pathname===productPath;
        const isFetch=['XHR','Fetch'].includes(p.type);
        if(!isPage&&!isFetch)return;
        const isAjax=u.pathname==='/wp-admin/admin-ajax.php';
        const action=isAjax?new URLSearchParams(p.request.postData||'').get('action'):null;
        const prior=active.get(p.requestId);
        if(prior&&p.redirectResponse){prior.redirect=true;prior.status=p.redirectResponse.status;prior.done=true;active.delete(p.requestId);}
        const row={seq:++sequence,phase,kind:isPage?'page':action==='gpp_inbox2_read'?'gpp_read':isAjax?'other_ajax':'other_fetch',
          method:p.request.method,at:p.timestamp,status:null,headers:null,body:null,done:false,failed:null};
        records.push(row);active.set(p.requestId,row);
      }else if(method==='Network.responseReceived'){
        const row=active.get(p.requestId);if(!row)return;
        const h=Object.fromEntries(Object.entries(p.response.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
        row.status=p.response.status;row.headers={cacheControl:h['cache-control']||'',vary:h.vary||'',
          principal:h['x-gpp-scq-principal']||null,correlation:h['x-gpp-scq-request']||null,
          contentType:h['content-type']||''};
        row.fromDiskCache=!!p.response.fromDiskCache;row.fromServiceWorker=!!p.response.fromServiceWorker;
      }else if(method==='Network.loadingFinished'){
        const row=active.get(p.requestId);if(!row)return;
        const job=page.send('Network.getResponseBody',{requestId:p.requestId}).then(r=>{
          const body=r.base64Encoded?Buffer.from(r.body,'base64').toString('utf8'):r.body;
          row.body=classifyBody(body);
        }).catch(()=>{row.bodyUnavailable=true;}).finally(()=>{
          row.done=true;active.delete(p.requestId);tasks.delete(job);
        });
        tasks.add(job);
      }else if(method==='Network.loadingFailed'){
        const row=active.get(p.requestId);if(!row)return;
        row.failed=String(p.errorText||'NETWORK_FAILED').slice(0,120);row.done=true;active.delete(p.requestId);
      }else if(method==='Runtime.exceptionThrown'){
        errors.push({phase,kind:'uncaught_page_exception',at:p.timestamp});
      }
    }catch{errors.push({phase,kind:'observer_event_processing_error'});}
  };
  const detach=cdp.subscribe(page.sessionId,attach);
  await page.send('Network.enable',{maxTotalBufferSize:20000000,maxResourceBufferSize:5000000});
  await page.send('Runtime.enable');
  return {records,errors,setPhase:p=>{phase=p;},
    async settle(ms=5000){
      const end=Date.now()+ms;
      while(Date.now()<end&&(tasks.size||[...active.values()].some(x=>!x.done)))await new Promise(r=>setTimeout(r,50));
    },detach};
}
