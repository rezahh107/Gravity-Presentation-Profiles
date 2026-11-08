/**
 * TEST-ONLY early browser Storage event observer. No values or authentication data
 * are saved. Instrumentation is used only in synthetic private browser contexts.
 */
(() => {
  'use strict';
  window.__g014StorageEvents=[];
  window.__g014StorageHooks={installed:false};
  let counter=0;
  const safeKey=(key)=>{
    const s=String(key),safe=s.replace(/[0-9]/g,'#').slice(0,105);
    let h=2166136261;
    for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
    return {hint:safe,hash:(h>>>0).toString(16)};
  };
  const note=(action,key,value)=>{
    if(window.__g014StorageEvents.length>=250)return;
    window.__g014StorageEvents.push({
      seq:++counter,ms:Math.round(performance.now()),action,
      key:safeKey(key),value_length:typeof value==='string'?value.length:null
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