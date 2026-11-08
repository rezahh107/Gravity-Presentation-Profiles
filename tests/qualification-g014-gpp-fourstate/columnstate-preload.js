/**
 * TEST-ONLY early browser Storage event observer. No values or authentication data
 * are saved. Instrumentation is used only in synthetic private browser contexts.
 */
(() => {
  'use strict';
  // Stack frames are reduced to known plugin paths and function identifiers.
  // Never export source lines, login URLs, query strings, or arbitrary stack text.
  window.__g014SafeStack=raw=>{
    if(typeof raw!=='string')return [];
    const result=[];
    for(const line of raw.split('\n').slice(1,18)){
      const match=line.match(/\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if(!match)continue;
      const url=match[2], marker='/wp-content/plugins/',at=url.indexOf(marker);
      if(at<0)continue;
      const res=url.slice(at+marker.length).split('?')[0];
      if(!['gravityflow/','gravity-presentation-profiles/','persian-gravityforms/'].some(prefix=>res.startsWith(prefix)))continue;
      result.push({file:res.slice(0,155),fn:String(match[1]||'anonymous').replace(/[^a-zA-Z0-9_$.-]/g,'_').slice(0,72),
        line:Number(match[3]),col:Number(match[4])});
      if(result.length>=8)break;
    }
    return result;
  };
  window.__g014StorageEvents=[];
  window.__g014StorageHooks={installed:false};
  let counter=0;
  const safeKey=(key)=>{
    const s=String(key),safe=s.replace(/[0-9]/g,'#').slice(0,105);
    let h=2166136261;
    for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
    return {hint:safe,hash:(h>>>0).toString(16)};
  };
  const nativeIds=(action,key,value)=>{
    if(action!=='getItem'||typeof value!=='string'||!String(key).includes('inbox_shortcode')||value.length>10000)
      return null;
    try {
      const parsed=JSON.parse(value);
      const allowed=new Set(['id','1','3','6','date_created','date_created_human_readable']);
      if(!Array.isArray(parsed)||parsed.length>12)return null;
      const ids=parsed.map(x=>String(x?.colId));
      return ids.every(id=>allowed.has(id))?ids:null;
    } catch {return null;}
  };
  const note=(action,key,value)=>{
    if(window.__g014StorageEvents.length>=250)return;
    window.__g014StorageEvents.push({
      seq:++counter,ms:Math.round(performance.now()),action,
      key:safeKey(key),value_length:typeof value==='string'?value.length:null,
      native_read_ids:nativeIds(action,key,value),
      stack:(String(key).includes('inbox_shortcode')||String(key).startsWith('gpp:srwf-inbox-fit:'))
        ?window.__g014SafeStack(new Error().stack):[]
    });
  };
  try {
    const proto=Storage.prototype;
    for(const name of ['getItem','setItem','removeItem']){
      const prior=proto[name];
      proto[name]=function(...args){
        if(name==='getItem') {
          const result=Reflect.apply(prior,this,args);
          note(name,args[0],result);
          return result;
        }
        const result=Reflect.apply(prior,this,args);
        note(name,args[0],name==='setItem'?args[1]:null);
        return result;
      };
    }
    const original=proto.clear;
    proto.clear=function(...args){
      const result=Reflect.apply(original,this,args);
      note('clear','ALL',null);
      return result;
    };
    window.__g014StorageHooks.installed=true;
  } catch {
    window.__g014StorageHooks.installed=false;
  }
})();