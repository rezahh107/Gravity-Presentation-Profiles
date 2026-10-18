import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

// Independent PR #159 verification-only evidence. This exercises the pinned
// authentic Blocksy/WU21/P06 WordPress host; no mock HTML or Admin route.
const env=process.env;
const { WU21_WP_PATH:wp,WU21_WP_CLI:cli,WU21_ARTIFACT_DIR:out,WU21_BASE_URL:base,GITHUB_WORKSPACE:root }=env;
for(const [key,value] of Object.entries({wp,cli,out,base,root}))assert.ok(value,'Missing host env: '+key);
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/generic-operational-paint-v11.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(out,'fixture-manifest.json'),'utf8'));
const cliEval=code=>{
  const p=spawnSync('php',[cli,'--path='+wp,'eval',code],{encoding:'utf8',env,timeout:60000});
  if(p.status!==0)throw Error('WP-CLI eval failed: '+(p.stderr||p.stdout));
  return p.stdout.trim();
};
const p06=JSON.parse(cliEval("echo wp_json_encode(get_option('gpp_p06_fixture_manifest'),JSON_UNESCAPED_SLASHES);"));
const routes=[
  {key:'shortcode',url:manifest.frontend_inbox_url},
  {key:'block',url:p06.authentic_block_page.url}
];
assert.ok(routes.every(x=>typeof x.url==='string'&&x.url.startsWith(base+'/')));
assert.notEqual(routes[0].url,routes[1].url,'Need two independent authentic routes');
function control(action,surface='',previous=null){
  const p=spawnSync('php',[cli,'--path='+wp,'eval-file',path.join(root,'tests/repro-evidence-lab/generic-operational-v11-control.php')],{
    encoding:'utf8',env:{...env,GPP_OPERATIONAL_ACTION:action,GPP_OPERATIONAL_SURFACE:surface,
      GPP_OPERATIONAL_PREVIOUS:JSON.stringify(previous)},timeout:60000});
  if(p.status!==0)throw Error('WP-CLI lifecycle failed: '+(p.stderr||p.stdout));
  const marker='GPP_OPERATIONAL_JSON:',pos=p.stdout.indexOf(marker);
  if(pos<0)throw Error('Missing lifecycle witness: '+p.stdout);
  return JSON.parse(p.stdout.slice(pos+marker.length).trim());
}
const rgb=hex=>'rgb('+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')+')';
const expected={
  surface:rgb(fixture.design_tokens.colors.inbox_surface),
  heading:rgb(fixture.design_tokens.colors.inbox_heading),
  label:rgb(fixture.design_tokens.colors.inbox_label)
};
const check=(ok,msg)=>{assert.ok(ok,msg);record.checks.push(msg)};
const record={target_head:'c6f5dadcb447e43706faf66cdc13f1bd80e95802',
  source:'ACTUAL_FRONTEND_WORDPRESS_GF_FLOW_BLOCKSY_CHROMIUM',
  expected,phases:{},checks:[],status:'NOT_RUN'};
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({locale:'fa-IR',viewport:{width:1440,height:900}});
const cookies=JSON.parse(cliEval(
  "$u=get_user_by('login','bootstrap_admin');"+
  "if(!$u)throw new RuntimeException('Synthetic operator missing');"+
  "$t=time()+1200;"+
  "echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$t,'auth')],"+
  "['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$t,'logged_in')]]);"
));
await ctx.addCookies(cookies.map(c=>({...c,url:base})));
const page=await ctx.newPage(), errors=[];
page.on('pageerror',e=>errors.push(String(e)));
async function measure(route){
  const response=await page.goto(route.url,{waitUntil:'networkidle',timeout:45000});
  assert.equal(response?.status(),200,'Frontend URL HTTP status: '+route.key);
  await page.locator('[data-js="gflow-inbox"] .ag-root-wrapper').waitFor({timeout:30000});
  await page.locator('.gflow-inbox.gflow-grid.gflow-common .ag-header-cell').first().waitFor({timeout:30000});
  const result=await page.evaluate(()=>{
    const all=selector=>[...document.querySelectorAll(selector)];
    const surface=all('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const title=all('.gpp-inbox-surface__title');
    const grid=all('[data-js="gflow-inbox"]');
    const header=all('.gflow-inbox.gflow-grid.gflow-common .ag-header-cell');
    const viewport=all('[data-js="gflow-inbox"] .ag-center-cols-viewport');
    const css=all('style').filter(e=>e.textContent.includes('.gpp-inbox-surface{--gpp-inbox-canvas:'))
      .map(e=>e.textContent.slice(0,450));
    const visible=el=>Boolean(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    return {
      url:location.href,body_dir:document.documentElement.dir,
      surface_count:surface.length,title_count:title.length,
      native_grid_count:grid.length,ag_root_count:all('[data-js="gflow-inbox"] .ag-root-wrapper').length,
      header_count:header.length,grid_axis:viewport[0]?getComputedStyle(viewport[0]).direction:null,
      heading_text:title[0]?.textContent.trim(),
      surface_visible:visible(surface[0]),heading_visible:visible(title[0]),header_visible:visible(header[0]),
      computed:{
        surface:surface[0]?getComputedStyle(surface[0]).backgroundColor:null,
        heading:title[0]?getComputedStyle(title[0]).color:null,
        label:header[0]?getComputedStyle(header[0]).color:null
      },
      inline_rules:css
    };
  });
  check(new URL(result.url).pathname===new URL(route.url).pathname,route.key+' actual live frontend route matches');
  check(result.surface_count===1&&result.title_count===1&&result.native_grid_count===1&&result.ag_root_count===1,
    route.key+' one GPP shell and one real native AG Grid');
  check(result.header_count>0&&result.surface_visible&&result.heading_visible&&result.header_visible,
    route.key+' visible surface/heading/native header DOM');
  check(result.heading_text==='کارهای من',route.key+' canonical owner heading');
  check(result.body_dir==='rtl',route.key+' RTL document');
  return result;
}
let imported=false, active=false, origin=null, failure=null;
try{
  origin=control('snapshot');
  const initial=origin.activations||{};
  record.origin={inbox:initial['gravity_flow.inbox']||null,
    entry:initial['gravity_flow.entry_detail']||null,print:initial['print.dossier']||null};
  check(record.origin.inbox?.package_id!==fixture.package_id,'Original profile differs from schema 1.1 fixture');
  record.phases.baseline={};
  for(const route of routes)record.phases.baseline[route.key]=await measure(route);
  const importResult=control('import');imported=true;
  check(importResult.status==='INSTALLED_INACTIVE','Synthetic 1.1 import inactive');
  const importedState=control('snapshot');
  check(JSON.stringify(importedState.activations)===JSON.stringify(initial),'Import did not activate any surface');
  record.phases.imported={};
  for(const route of routes){
    const value=await measure(route);record.phases.imported[route.key]=value;
    check(JSON.stringify(value.computed)===JSON.stringify(record.phases.baseline[route.key].computed),
      route.key+' imported-but-inactive baseline paint unchanged');
  }
  control('activate','gravity_flow.inbox');active=true;
  const activated=control('snapshot').activations;
  check(activated['gravity_flow.inbox']?.profile_id==='fixture.operations.inbox.v1','Explicit Inbox profile activation');
  check(JSON.stringify(activated['gravity_flow.entry_detail']||null)===JSON.stringify(record.origin.entry),
    'Entry Detail activation isolated');
  check(JSON.stringify(activated['print.dossier']||null)===JSON.stringify(record.origin.print),
    'Print activation isolated');
  record.phases.active={};
  for(const route of routes){
    const value=await measure(route);record.phases.active[route.key]=value;
    for(const [part,color] of Object.entries(expected)){
      check(value.computed[part]===color,route.key+' actual computed '+part+' equals schema 1.1 color');
      check(record.phases.baseline[route.key].computed[part]!==color,
        route.key+' schema 1.1 '+part+' differs from baseline (non-vacuous)');
    }
    const baseline=record.phases.baseline[route.key];
    check(value.native_grid_count===baseline.native_grid_count&&value.ag_root_count===baseline.ag_root_count,
      route.key+' native Grid identity/topology preserved');
    check(value.grid_axis===baseline.grid_axis,route.key+' native Grid physical axis unchanged');
    check(value.header_count===baseline.header_count,route.key+' native column/header count unchanged');
  }
  control('rollback','gravity_flow.inbox',record.origin.inbox);active=false;
  const rolledBack=control('snapshot').activations;
  check(JSON.stringify(rolledBack['gravity_flow.inbox'])===JSON.stringify(record.origin.inbox),
    'Explicit immutable Inbox rollback restored prior activation');
  check(JSON.stringify(rolledBack['gravity_flow.entry_detail']||null)===JSON.stringify(record.origin.entry),
    'Independent Entry Detail remains unchanged after rollback');
  record.phases.rollback={};
  for(const route of routes){
    const value=await measure(route);record.phases.rollback[route.key]=value;
    check(JSON.stringify(value.computed)===JSON.stringify(record.phases.baseline[route.key].computed),
      route.key+' restored computed paint equals inactive baseline');
  }
  const unchanged=await page.goto(p06.unrelated_page.url,{waitUntil:'networkidle'});
  check(unchanged?.status()===200,'Unrelated route responded successfully');
  const leaks=await page.evaluate(()=>({
    surfaces:document.querySelectorAll('[data-gpp-inbox-surface]').length,
    operationalStyles:[...document.querySelectorAll('style')].filter(s=>s.textContent.includes('.gpp-inbox-surface{--gpp-inbox-canvas:')).length
  }));
  check(leaks.surfaces===0&&leaks.operationalStyles===0,'Unrelated-page native and paint isolation');
  check(errors.length===0,'No browser page errors');
  record.status='PASS';
}catch(e){
  failure=e;record.status='FAIL';record.error=String(e.stack||e);
}finally{
  if(active&&origin){
    try{control(record.origin.inbox?'rollback':'deactivate','gravity_flow.inbox',record.origin.inbox);}
    catch(e){failure ||= e;record.status='FAIL';record.restore_error=String(e);}
  }
  if(origin){
    try{
      const now=control('snapshot').activations;
      check(JSON.stringify(now)===JSON.stringify(origin.activations),'All prior surface activations restored');
      record.restored={same_activations:true,installed_fixture_inactive:imported};
    }catch(e){failure ||= e;record.status='FAIL';record.restore_error=String(e);}
  }
  record.page_errors=errors;
  fs.writeFileSync(path.join(out,'pr159-schema11-authentic-frontend-computed-paint.json'),
    JSON.stringify(record,null,2)+'\n');
  await browser.close();
}
if(failure)throw failure;
console.log('PR159_SCHEMA11_FRONTEND_COMPUTED_PAINT_PASS checks='+record.checks.length);
