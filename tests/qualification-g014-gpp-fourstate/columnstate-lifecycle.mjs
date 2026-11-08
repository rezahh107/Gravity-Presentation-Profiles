/**
 * TEST-ONLY native Column State lifecycle probe in disposable WordPress.
 * No production or vendor edit; only synthetic column IDs, state and event metadata.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const SUBJECT='237e8006fae00be586d90a5b76666ceef7a025ca';
const GPP='c8cf9fd7bb615075402b78eaa1f01dd33d855d28';
const expected=['1','3','6','date_created','id'];
const required=['SUBJECT_SHA','GPP_SHA','HARNESS_SHA','WU008_WP_CLI','WU008_WP_PATH','WU008_BASE_URL','WU008_ADMIN_PASSWORD','G014_OUTPUT_DIR'];
for(const key of required)if(!process.env[key])throw Error('ENVIRONMENT: missing '+key);
if(process.env.SUBJECT_SHA!==SUBJECT)throw Error('ENVIRONMENT: wrong PGR Head');
const base=new URL(process.env.WU008_BASE_URL).origin;
const out=process.env.G014_OUTPUT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8'));
if(fixture.data_class!=='SYNTHETIC_NON_PII'||fixture.subject_sha!==SUBJECT||
  fixture.gpp_sha!==process.env.GPP_SHA||fixture.flow_version!=='3.1.0')throw Error('ENVIRONMENT: fixture mismatch');
if(new URL(fixture.frontend_url).origin!==base)throw Error('ENVIRONMENT: unexpected fixture origin');
const classPath=path.join(process.env.WU008_WP_PATH,'wp-content/plugins/gravity-presentation-profiles/src/SRWF/GravityFlow/InboxTableHeaderPresentation.php');
const referencePath=path.join(process.cwd(),'.gpp-reference/src/SRWF/GravityFlow/InboxTableHeaderPresentation.php');
const original=fs.readFileSync(referencePath,'utf8');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
if(fs.readFileSync(classPath,'utf8')!==original)throw Error('ENVIRONMENT: GPP immutable baseline mismatch');
const originalHash=sha(original);
const token='$visible = $id_column + array_reverse( $visible, true );';
const end='        return $visible;';
if(original.split(token).length!==2||original.split(end).length!==2)throw Error('ENVIRONMENT: D seam unavailable');
const trace="        if ( getenv( 'G014_OUTPUT_DIR' ) ) { @file_put_contents( getenv( 'G014_OUTPUT_DIR' ) . '/lifecycle-filter.jsonl', wp_json_encode( array( 'variant' => 'D', 'after' => array_keys( $visible ) ) ) . PHP_EOL, FILE_APPEND ); }\n";
const variantD=original.replace(token,'$visible = $visible + $id_column;').replace(end,trace+end);
const preload=fs.readFileSync('tests/qualification-g014-gpp-fourstate/columnstate-preload.js','utf8');
const report={schema:'g014-columnstate-lifecycle-test-only-v1',subject:SUBJECT,
  gpp_reference:GPP,harness:process.env.HARNESS_SHA,original_class_sha256:originalHash,
  environment:{wp:'6.8.3',gf:'3.1.1.1',flow:'3.1.0',viewport:1280,site:'fa_IR'},
  cases:[],variant_controls:[],result:'NOT_PROVEN',source_restored:false,started:new Date().toISOString(),
  limitations:['No vendor or production changes','API events may not expose private restore methods',
    'No generalization to pre-existing unknown populated saved state or other hosts']};
const reportPath=path.join(out,'columnstate-report.json');
const command=(bin,args)=>{
  const r=spawnSync(bin,args,{encoding:'utf8',timeout:90000,env:process.env,maxBuffer:12*1024*1024});
  if(r.error||r.status!==0)throw Error('ENVIRONMENT: '+bin+' '+args[0]+' exit='+r.status+' '+String(r.stderr||'').slice(0,300));
  return r.stdout.trim();
};
const wp=(...args)=>command('php',[process.env.WU008_WP_CLI,'--path='+process.env.WU008_WP_PATH,...args]);
function installD(){
  fs.writeFileSync(classPath,variantD,'utf8');
  command('php',['-l',classPath]);
}
function filterTrace(){
  const p=path.join(out,'lifecycle-filter.jsonl');
  if(!fs.existsSync(p))return [];
  return fs.readFileSync(p,'utf8').trim().split('\n').filter(Boolean).slice(0,30).map(l=>JSON.parse(l));
}
async function login(page){
  const rsp=await page.goto(base+'/wp-login.php',{waitUntil:'domcontentloaded'});
  if(!rsp?.ok())throw Error('ENVIRONMENT: login unavailable');
  await page.locator('#user_login').fill('bootstrap_admin');
  await page.locator('#user_pass').fill(process.env.WU008_ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(u=>!u.pathname.includes('wp-login.php'),{timeout:20000}),page.locator('#wp-submit').click()]);
}
async function setSettings(browser,axis,pgrOn=true){
  wp('option','update','WPLANG','fa_IR');
  wp('eval',"$u=get_user_by('login','bootstrap_admin');update_user_meta($u->ID,'locale','fa_IR');");
  wp('eval',"$s=get_option('pgr_settings',array());if(!is_array($s))$s=array();$s['gravity_flow_inbox_rtl']="+(pgrOn?'1':'0')+";update_option('pgr_settings',$s);");
  const ctx=await browser.newContext();
  try {
    const page=await ctx.newPage();await login(page);
    const rsp=await page.goto(base+'/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles',{waitUntil:'domcontentloaded'});
    if(!rsp?.ok())throw Error('ENVIRONMENT: GPP settings unavailable');
    const select=page.locator('select[name="_gform_setting_inbox_axis_ltr"]');
    if(await select.count()!==1)throw Error('ENVIRONMENT: GPP native settings select missing');
    await select.selectOption(axis);
    const submit=page.locator('#gform-settings button[type="submit"], #gform-settings input[type="submit"]').last();
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),submit.click()]);
  } finally {await ctx.close();}
  const facts=JSON.parse(wp('eval',"echo wp_json_encode(array('pgr'=>pgr_gravity_flow_inbox_rtl_status()['requested'],'gpp'=>gpp_gravity_flow_inbox_axis_status()['effective']));"));
  if(facts.pgr!==(pgrOn?'on':'off')||facts.gpp!==axis)throw Error('ENVIRONMENT: settings readback mismatch');
}
async function settled(page){
  await page.waitForFunction(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const r=h?.querySelector('.ag-root-wrapper'),cfg=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
    const loader=h?.closest('.gflow-inbox')?.querySelector('[data-js="gflow-inbox-loader"]');
    return !!(r&&r.classList.contains('ag-rtl')&&cfg&&Array.isArray(cfg.rowData)&&cfg.rowData.length>=20&&
      h.querySelector('.ag-center-cols-container .ag-row')&&!loader);
  },null,{timeout:32000});
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
async function snapshot(page){
  return page.evaluate(()=>{
    const admitted=new Set(['id','1','3','6','date_created','date_created_human_readable']);
    const id=x=>admitted.has(String(x))?String(x):'OTHER';
    const h=document.querySelector('[data-js="gflow-inbox"]'),opt=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1};
    const cols=[...h?.querySelectorAll('.ag-header-cell[col-id]')||[]].filter(visible)
      .map(e=>({id:id(e.getAttribute('col-id')),x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width)}))
      .sort((a,b)=>a.x-b.x);
    const storage={};
    for(const [name,area] of [['local',window.localStorage],['session',window.sessionStorage]]){
      storage[name]=[];
      for(let i=0;i<area.length&&i<50;i++){
        const k=area.key(i),v=area.getItem(k)||'';
        storage[name].push({kind:/gpp/i.test(k)?'GPP':/flow|grid|column|inbox/i.test(k)?'NATIVE_CANDIDATE':'OTHER',
          key_shape:k.replace(/[0-9]/g,'#').slice(0,110),value_length:v.length});
      }
    }
    // Extract ONLY native column IDs, order and numeric widths. Never export
    // raw localStorage content, row data, user details, or arbitrary fields.
    const nativeKey=h?.dataset.gridId||'';
    const nativeRaw=nativeKey?localStorage.getItem(nativeKey):null;
    const savedNative={present:typeof nativeRaw==='string',bytes:nativeRaw?.length||0,shape:'unknown',column_arrays:[]};
    if(nativeRaw)try{
      const parsed=JSON.parse(nativeRaw);
      savedNative.shape=Array.isArray(parsed)?'array':parsed&&typeof parsed==='object'?'object':typeof parsed;
      const allowed=new Set(['id','1','3','6','date_created','date_created_human_readable']);
      const scan=(node,location,depth)=>{
        if(depth>6||savedNative.column_arrays.length>=8||node===null)return;
        if(Array.isArray(node)){
          if(node.length>=4&&node.every(x=>typeof x==='string'&&allowed.has(x))){
            savedNative.column_arrays.push({location,ids:node.map(String),widths:null});
          }
          const columnLike=node.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&
            ['colId','field','id'].some(k=>allowed.has(String(x[k]))));
          if(columnLike.length>=4){
            savedNative.column_arrays.push({location,ids:columnLike.map(x=>String(x.colId??x.field??x.id)),
              widths:columnLike.map(x=>Number.isFinite(x.width)?x.width:null)});
          }
          for(let i=0;i<Math.min(node.length,15);i++)scan(node[i],location+'[]',depth+1);
        }else if(typeof node==='object'){
          for(const [k,v] of Object.entries(node).slice(0,30))scan(v,location+'.'+k.replace(/[^a-zA-Z_]/g,'_').slice(0,35),depth+1);
        }
      };
      scan(parsed,'root',0);
    }catch{savedNative.shape='unparseable';}
    const probe=window.__g014ColumnLifecycle||null;
    return {grid_id:String(h?.dataset.gridId||'').slice(0,110),native_saved_state:savedNative,
      enableRtl:opt?.enableRtl??null,ag_mode:h?.querySelector('.ag-root-wrapper')?.classList.contains('ag-rtl')?'ag-rtl':'OTHER',
      column_defs:(opt?.columnDefs||[]).map(d=>({id:id(d.colId||d.field),width:Number.isFinite(d.width)?d.width:null,pinned:d.pinned||null})),
      physical_rtl:cols.map(c=>c.id).reverse(),widths:cols.map(c=>({id:c.id,width:c.w})),
      probe_installed:probe?.installed||0,callback_names:probe?.callbacks||[],
      api_source_hooks:probe?.source_hooks||[],api_source_calls:probe?.source_calls||[],
      preconstruction_defs:probe?.column_defs||null,events:probe?.samples||[],
      storage_hook:window.__g014StorageHooks||null,storage_events:window.__g014StorageEvents||[],
      storage};
  });
}
async function resize(page){
  const handles=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id] .ag-header-cell-resize');
  for(let i=0;i<await handles.count();i++){
    const handle=handles.nth(i),parent=handle.locator('xpath=..'),id=await parent.getAttribute('col-id');
    if(!['1','3','6','date_created'].includes(id))continue;
    const r=await handle.boundingBox(),cell=await parent.boundingBox();
    if(!r||!cell)continue;
    const x=r.x+r.width/2,y=r.y+r.height/2,sign=x<cell.x+cell.width/2?-1:1;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+sign*60,y,{steps:10});await page.mouse.up();
    await page.waitForTimeout(450);
    return {id,delta_attempted:60};
  }
  return {status:'NOT_PROVEN',reason:'no native resize handle'};
}
async function caseRun(browser,axis,mode,dbfile){
  wp('db','import',dbfile);
  const log=path.join(out,'lifecycle-filter.jsonl');if(fs.existsSync(log))fs.unlinkSync(log);
  installD();
  await new Promise(r=>setTimeout(r,2600));
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addInitScript({content:preload});
  const page=await ctx.newPage();
  const record={axis,mode,status:'NOT_PROVEN'};
  try {
    await login(page);
    const rsp=await page.goto(fixture.frontend_url,{waitUntil:'domcontentloaded'});
    if(!rsp?.ok())throw Error('ENVIRONMENT: frontend unavailable');
    await settled(page);
    record.initial=await snapshot(page);
    record.php_initial=filterTrace();
    if(record.initial.ag_mode!=='ag-rtl'||record.initial.enableRtl!==true||
      record.initial.probe_installed<1||!record.initial.storage_hook?.installed)
      throw Error('ENVIRONMENT: early tracing or native mode missing');
    if(record.initial.physical_rtl.join(',')!==expected.join(','))throw Error('QUALIFICATION: D initial order mismatch');
    await page.screenshot({path:path.join(out,'lifecycle-'+axis+'-'+mode+'-before.jpg'),type:'jpeg',quality:55,fullPage:false});
    if(mode==='clear-browser-storage'){
      record.pre_clear=await snapshot(page);
      await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});
    } else if(mode==='clear-native-only'||mode==='clear-gpp-only'){
      record.pre_clear=await snapshot(page);
      record.storage_ablation=await page.evaluate(mode=>{
        const gridId=document.querySelector('[data-js="gflow-inbox"]')?.dataset.gridId;
        if(!gridId)throw Error('No authentic Grid identity for storage ablation');
        const keys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i));
        const matches=keys.filter(key=>mode==='clear-native-only'
          ? key===gridId
          : key.startsWith('gpp:srwf-inbox-fit:')&&key.endsWith(':'+gridId));
        if(matches.length!==1)throw Error('Expected exactly one scoped storage key, got '+matches.length);
        localStorage.removeItem(matches[0]);
        return {scope:mode,removed:1,remaining:localStorage.length};
      },mode);
    } else if(mode==='manual-resize'){
      record.resize_action=await resize(page);
      record.after_resize=await snapshot(page);
    }
    record.before_reload=await snapshot(page);
    await page.reload({waitUntil:'domcontentloaded'});await settled(page);
    record.reloaded=await snapshot(page);
    record.php_reloaded=filterTrace();
    await page.screenshot({path:path.join(out,'lifecycle-'+axis+'-'+mode+'-reloaded.jpg'),type:'jpeg',quality:55,fullPage:false});
    const shape=['1','3','6','date_created','id','date_created_human_readable'];
    const matches=t=>t.variant==='D'&&JSON.stringify(t.after.map(String))===JSON.stringify(shape);
    if(record.php_initial.length<1||record.php_reloaded.length<2||!record.php_reloaded.every(matches))
      throw Error('ENVIRONMENT: D PHP callback identity mismatch');
    if(record.reloaded.probe_installed<1)throw Error('ENVIRONMENT: preconstruction probe missed reload');
    record.same_grid_id=record.initial.grid_id===record.reloaded.grid_id;
    record.same_column_defs=JSON.stringify(record.initial.column_defs)===JSON.stringify(record.reloaded.column_defs);
    record.correct_after_reload=record.reloaded.physical_rtl.join(',')===expected.join(',');
    record.status='OBSERVED';
  }catch(e){record.error=String(e.message||e).slice(0,550);}
  finally{await ctx.close();}
  return record;
}
async function main(){
  const browser=await chromium.launch({headless:true});
  report.browser=browser.version();
  try {
    for(const axis of ['on','off']){
      await setSettings(browser,axis);
      const dbfile='/tmp/g014-lifecycle-'+axis+'.sql';
      wp('db','export',dbfile,'--add-drop-table');
      for(const mode of ['natural','clear-browser-storage','clear-native-only','clear-gpp-only','manual-resize']){
        report.cases.push(await caseRun(browser,axis,mode,dbfile));
      }
    }
    const good=report.cases.filter(c=>c.status==='OBSERVED'&&c.same_grid_id);
    report.result=good.length===10?'EVIDENCE_CAPTURED':'NOT_PROVEN';
    report.causal_root='NOT_PROVEN_PENDING_INDEPENDENT_ASSESSMENT';
  }finally {
    fs.writeFileSync(classPath,original);
    report.source_restored=sha(fs.readFileSync(classPath))===originalHash;
    await browser.close();
    report.completed=new Date().toISOString();
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  }
  if(!report.source_restored||report.result!=='EVIDENCE_CAPTURED')
    throw Error('G014_COLUMNSTATE_EVIDENCE_INCOMPLETE');
  console.log('G014_COLUMNSTATE_LIFECYCLE_EVIDENCE_CAPTURED cases='+report.cases.length);
}
try{await main()}catch(e){
  report.failure=String(e.message||e).slice(0,550);
  if(!report.completed){
    try{fs.writeFileSync(classPath,original)}catch{}
    report.source_restored=fs.existsSync(classPath)&&sha(fs.readFileSync(classPath))===originalHash;
    report.completed=new Date().toISOString();
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  }
  console.error('G014_COLUMNSTATE_LIFECYCLE_NOT_PROVEN '+report.failure);
  process.exitCode=1;
}