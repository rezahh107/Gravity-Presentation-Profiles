import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const env=process.env, out=env.WU21_ARTIFACT_DIR, base=env.WU21_BASE_URL;
assert.equal(base,'http://127.0.0.1:8080','Synthetic local runtime only');
const f=JSON.parse(fs.readFileSync(path.join(out,'cellq-fixture.json'),'utf8'));
const headless=JSON.parse(fs.readFileSync(path.join(out,'cellq-headless.json'),'utf8'));
assert.equal(headless.status,'PASS_HEADLESS_CELL_GATE');
const report={head:env.GPP_WU21_REPOSITORY_SHA,status:'RUNNING',live_refresh:'NOT_QUALIFIED',checks:[]};
const save=()=>fs.writeFileSync(path.join(out,'cellq-native-browser-parity.json'),JSON.stringify(report,null,2));
function wp(code){const r=spawnSync('php',[env.WU21_WP_CLI,'--path='+env.WU21_WP_PATH,'eval',code],{encoding:'utf8',env,timeout:60000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
async function session(browser,uid){
 const c=await browser.newContext({viewport:{width:1280,height:900}});
 const cookies=JSON.parse(wp(`$u=get_user_by('id',${uid});$e=time()+1800;echo wp_json_encode([['name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')],['name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in')]]);`));
 await c.addCookies(cookies.map(x=>({...x,url:base})));return c;
}
async function request(page){return page.evaluate(async()=>{
 const grid=document.querySelector('[data-js="gflow-inbox"]');const cfg=window.gflow_config.grids[grid.dataset.gridId];
 const args={...cfg.grid_options.searchArgs};
 const data={gflow_access_token:cfg.current_user_token,current_ids:[],search_args:JSON.stringify(args)};
 const endpoint=window.gflow_config.endpoints['inbox/changes'].path;
 return await new Promise(resolve=>window.jQuery.ajax({url:endpoint,method:'POST',data,
  success:(body,_status,xhr)=>resolve({status:xhr.status,body}),error:xhr=>resolve({status:xhr.status,body:xhr.responseJSON||{}})}));
});}
const browser=await chromium.launch({headless:true});
try{
 const officer=await session(browser,f.officer),p=await officer.newPage();await p.goto(f.native_url,{waitUntil:'networkidle'});
 await p.locator('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id]').first().waitFor();
 const expected=headless.scenarios.final_mask.candidate;const observed={};
 for(const row of expected){observed[row.id]={};for(const [name,cell] of Object.entries(row.cells)){
  let text;
  for(const factor of [0,.25,.5,.75,1]){
   await p.locator('[data-js="gflow-inbox"]').evaluate((grid,factor)=>{
    const bar=grid.querySelector('.ag-body-horizontal-scroll-viewport')||grid.querySelector('.ag-center-cols-viewport');
    if(bar)bar.scrollLeft=Math.round((bar.scrollWidth-bar.clientWidth)*factor);
   },factor);
   await p.waitForTimeout(100);
   const loc=p.locator(`[data-js="gflow-inbox"] .ag-center-cols-container .ag-row[row-id="${row.id}"] .ag-cell[col-id="${cell.column_id}"]`);
   if(await loc.count()===1&&await loc.isVisible()){
    text=await loc.locator('a[data-js="inbox-details-link"]').first().evaluate(a=>a.parentElement.querySelector(':scope > span').textContent);break;
   }
  }
  assert.notEqual(text,undefined,`Native column not materialized: ${cell.column_id}`);
  assert.equal(text,cell.text,`Materialized native ${name} differs for ${row.id}`);observed[row.id][name]=text;
 }}
 assert.equal(await p.evaluate(()=>window.__cellq_xss??null),null);assert.equal(await p.locator('img[onerror]').count(),0);
 report.materialized_native_cells=observed;report.checks.push('INITIAL_NATIVE_MATERIALIZED_CELL_PARITY');
 const legit=await request(p);assert.equal(legit.status,200);
 const rows=[...Object.values(legit.body.add||{}),...Object.values(legit.body.update||{})];
 assert.deepEqual(rows.map(r=>Number(r.id)).sort((a,b)=>a-b),expected.map(r=>r.id).sort((a,b)=>a-b));
 for(const row of expected){const native=rows.find(r=>Number(r.id)===row.id);for(const cell of Object.values(row.cells)){
  const text=await p.evaluate(value=>new DOMParser().parseFromString('<span id="oracle">'+value+'</span>','text/html').getElementById('oracle').textContent,native[cell.column_id]);assert.equal(text,cell.text);
 }}
 assert.ok(!JSON.stringify(legit.body).includes('CQ_SECRET_DO_NOT_EXPOSE_'));assert.ok(!JSON.stringify(legit.body).includes('CQ_RAW_NID_'));
 report.checks.push('MANUAL_NATIVE_AJAX_CELL_PARITY_NOT_LIVE_REFRESH');report.manual_ajax={status:legit.status,task_ids:rows.map(r=>Number(r.id))};
 await p.screenshot({path:path.join(out,'cellq-native-initial.png'),fullPage:true});
 await officer.close();report.status='PASS_NATIVE_BROWSER_CELL_PARITY';save();console.log('CELLQ_NATIVE_BROWSER_PARITY_PASS');
}catch(error){report.status='FAIL';report.error=String(error.stack||error);save();throw error;}finally{await browser.close();}
