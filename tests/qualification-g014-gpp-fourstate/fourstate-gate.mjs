/**
 * Evidence-only integrity gate for the independent four-state browser run.
 * PASS here means reproducible, complete evidence, NEVER product compatibility.
 * The browser runner itself fails when any scenario fails or is unverified.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir=process.env.G014_OUTPUT_DIR;
if(!dir)throw Error('Missing evidence directory');
const filename=path.join(dir,'report.json');
if(!fs.existsSync(filename))throw Error('No browser evidence manifest');
const r=JSON.parse(fs.readFileSync(filename,'utf8'));
const demand=(condition,message)=>{if(!condition)throw Error('GPP_FOURSTATE_EVIDENCE_FAIL '+message)};
const subject='311c2f5d188aec7254e11d37a351510736bd97de';
const gpp=process.env.GPP_SHA;
demand(r.schema==='gpp-fourstate-runtime-v1'&&r.data_class==='SYNTHETIC_NON_PII','wrong schema or non-synthetic data');
demand(r.subject===subject&&r.gpp===gpp&&r.harness===process.env.HARNESS_SHA,'immutable source mismatch');
demand(r.flow_sha256==='ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404','wrong licensed source identity');
demand(Array.isArray(r.scenarios)&&r.scenarios.length===96,'expected 96 executed browser cases');
demand(Array.isArray(r.controls),'missing independent controls');
const byId=new Map(r.scenarios.map(x=>[x.id,x]));
demand(byId.size===96,'duplicate browser case identifiers');
const classification=new Set(['PASS','FAIL','NOT_PROVEN']);
const cases=[];
for(const axis of ['on','off'])
 for(const site of ['fa_IR','en_US'])
  for(const user of ['fa_IR','en_US'])
   for(const [index,mode] of ['off','on','off'].entries())
    for(const width of [1280,390])
     for(const surface of ['admin','frontend']){
       const id=`gpp-${axis}-${site}-${user}-${index}-${mode}-${surface}-${width}`;
       const x=byId.get(id);
       demand(x?.gpp_axis===axis&&x.site===site&&x.user===user&&x.mode===mode&&x.width===width&&x.surface===surface,'missing/wrong scenario '+id);
       demand(classification.has(x.status),'unknown scenario status '+id);
       cases.push({id,status:x.status,reason:String(x.reason||'').slice(0,260)});
     }
const controls=new Map(r.controls.map(x=>[x.id,x]));
demand(controls.get('legacy-missing-setting-default-on')?.status==='PASS','legacy ON default not verified');
demand(controls.get('gpp-switch-on')?.status==='PASS'&&controls.get('gpp-switch-off')?.status==='PASS','independent native GF settings saves not proven');
demand(controls.get('native-on-with-gpp-absent')?.status==='PASS','positive native RTL control not proven');
const counts=Object.fromEntries(['PASS','FAIL','NOT_PROVEN'].map(status=>[status,cases.filter(x=>x.status===status).length]));
const output={schema:'gpp-fourstate-coverage-v1',subject,gpp,harness:r.harness,
  browser:r.browser,data_class:'SYNTHETIC_NON_PII',
  coverage:'96 actual browser cases + two GPP Settings UI saves + 24 PGR Settings UI saves',
  verdict:r.status==='PASS'?'PASS':'FAIL',
  controls:controls.size,counts,by_axis:Object.fromEntries(['on','off'].map(axis=>[axis,{
    pass:r.scenarios.filter(x=>x.gpp_axis===axis&&x.status==='PASS').length,
    fail:r.scenarios.filter(x=>x.gpp_axis===axis&&x.status==='FAIL').length,
    not_proven:r.scenarios.filter(x=>x.gpp_axis===axis&&x.status==='NOT_PROVEN').length
  }])),failed_cases:cases.filter(x=>x.status==='FAIL')};
fs.writeFileSync(path.join(dir,'coverage.json'),JSON.stringify(output,null,2)+'\n');
console.log('GPP_FOURSTATE_EVIDENCE_CAPTURE_PASS '+JSON.stringify({counts,verdict:output.verdict,head:gpp}));
if(output.verdict==='FAIL')console.log('GPP_FOURSTATE_PRODUCT_QUALIFICATION_NOT_PASSED: evidence complete, product assertions failed');
