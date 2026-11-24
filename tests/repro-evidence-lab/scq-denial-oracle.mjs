/** Cross-check actual denial output, correlated to an actual browser response.
 * An absent browser body is not reclassified as observed; a complete independent
 * server witness can fill only that specific gap. */
import {createHash} from 'node:crypto';
const expectedDenial='{"success":false,"data":{"reason":"authorization_required"}}';
const expectedHash=createHash('sha256').update(expectedDenial).digest('hex');
export function adjudicateDenial(row,server,actor,{sourceHead,harnessHead,allowedIds}){
  const incomplete=reason=>({status:'NOT_PROVEN',reason});
  const fail=reason=>({status:'FAIL',reason});
  const corr=row?.headers?.correlation;
  if(row?.kind!=='gpp_read'||row.method!=='POST'||row.status!==403||
    !row.headers||row.headers.principal!==actor||!Number.isSafeInteger(row.formId)||row.formId<=0||
    typeof corr!=='string'||!/^[a-f0-9-]{36}$/i.test(corr)||row.failed) return incomplete('BROWSER_DENIAL_IDENTITY_INCOMPLETE');
  if(!server||server.schema!==1||server.sourceHead!==sourceHead||server.harnessHead!==harnessHead||
    server.kind!=='gpp_read'||server.correlation!==corr||server.principal!==actor||
    server.formId!==row.formId||server.status!==row.status||server.complete!==true||
    !server.body||!Number.isSafeInteger(server.body.bytes)||server.body.bytes<=0||
    !/^[a-f0-9]{64}$/.test(server.body.sha256)||!Array.isArray(server.body.ids)||
    !Array.isArray(server.body.markers)) return incomplete('SERVER_DENIAL_WITNESS_INCOMPLETE_OR_MISMATCHED');
  const b=server.body;
  if(!b.ids.every(id=>allowedIds.includes(id))||
    !b.markers.every(m=>actor!=='anonymous'&&typeof m==='string'&&m.startsWith('SYN-SC-'+actor.toUpperCase()+'-')))
    return fail('UNAUTHORIZED_SERVER_DENIAL_CONTENT');
  if(!/\bprivate\b/i.test(server.cacheControl)||!/\bno-store\b/i.test(server.cacheControl)||
    !/\bprivate\b/i.test(row.headers.cacheControl)||!/\bno-store\b/i.test(row.headers.cacheControl))
    return fail('DENIAL_CACHE_PROTECTION_MISSING');
  if(row.fromDiskCache||row.fromServiceWorker)return fail('DENIAL_CACHE_REUSE');
  if(row.body&&row.body.sha256!==b.sha256)return incomplete('BROWSER_SERVER_BODY_HASH_MISMATCH');
  if(b.exactDenial!==true||b.bytes!==Buffer.byteLength(expectedDenial)||b.sha256!==expectedHash||
    b.jsonSuccess!==false||b.reason!=='authorization_required'||
    b.ids.length!==0||b.markers.length!==0) return incomplete('EXACT_SAFE_DENIAL_BODY_NOT_ESTABLISHED');
  return {status:'PASS',source:'correlated_complete_server_output',body:b};
}
