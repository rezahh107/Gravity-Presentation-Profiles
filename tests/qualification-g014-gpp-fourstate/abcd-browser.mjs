/**
 * G014 AB/CD CAUSAL EXPERIMENT -- disposable WordPress copy only.
 * No repository/vendor mutations, publication, real student data or secrets in output.
 * The original four-state qualification is historical evidence, not this experiment.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const PGR = '237e8006fae00be586d90a5b76666ceef7a025ca';
const GPP_BASE = 'c8cf9fd7bb615075402b78eaa1f01dd33d855d28';
const FLOW = 'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404';
const required = ['SUBJECT_SHA','GPP_SHA','HARNESS_SHA','WU008_WP_CLI','WU008_WP_PATH','WU008_BASE_URL','WU008_ADMIN_PASSWORD','G014_OUTPUT_DIR'];
for (const key of required) if (!process.env[key]) throw Error('Missing pinned environment: '+key);
if (process.env.SUBJECT_SHA !== PGR) throw Error('Wrong exact PGR Head');
const baseURL = new URL(process.env.WU008_BASE_URL).origin;
const out = process.env.G014_OUTPUT_DIR;
const fixture = JSON.parse(fs.readFileSync(path.join(out,'fixture.json'),'utf8'));
if (fixture.data_class !== 'SYNTHETIC_NON_PII' || fixture.subject_sha !== PGR || fixture.gpp_sha !== process.env.GPP_SHA || fixture.flow_version !== '3.1.0')
  throw Error('Synthetic fixture identity mismatch');
for (const key of ['frontend_url','admin_url','settings_url'])
  if (new URL(fixture[key]).origin !== baseURL) throw Error('Unexpected fixture origin');

const classPath = path.join(process.env.WU008_WP_PATH,'wp-content/plugins/gravity-presentation-profiles/src/SRWF/GravityFlow/InboxTableHeaderPresentation.php');
const referencePath = path.join(process.cwd(),'.gpp-reference/src/SRWF/GravityFlow/InboxTableHeaderPresentation.php');
const original = fs.readFileSync(referencePath,'utf8');
if (fs.readFileSync(classPath,'utf8') !== original) throw Error('Installed class differs from immutable GPP source');
const originalHash = crypto.createHash('sha256').update(original).digest('hex');
const target = '$visible = $id_column + array_reverse( $visible, true );';
if (original.split(target).length !== 2) throw Error('Expected one exact reversible source seam');
const tracingReturn = '        return $visible;';
if (original.split(tracingReturn).length !== 2) throw Error('Expected one return seam');
const traceSnippet = variant => "        if ( getenv( 'G014_OUTPUT_DIR' ) ) {\n" +
  "            @file_put_contents( getenv( 'G014_OUTPUT_DIR' ) . '/abcd-filter.jsonl', wp_json_encode( array( 'variant' => '" + variant + "', 'before' => array_keys( $columns ), 'after' => array_keys( $visible ) ) ) . PHP_EOL, FILE_APPEND );\n" +
  "        }\n";
const variants = {
  A: {reverse:true, idLast:false, code:target},
  B: {reverse:false,idLast:false,code:'$visible = $id_column + $visible;'},
  C: {reverse:true, idLast:true, code:'$visible = array_reverse( $visible, true ) + $id_column;'},
  D: {reverse:false,idLast:true,code:'$visible = $visible + $id_column;'}
};
const report={schema:'g014-native-order-abcd-test-only-v1',source_head:process.env.GPP_SHA,
  gpp_reference_head:GPP_BASE,pgr_head:PGR,flow_sha256:FLOW,
  harness:process.env.HARNESS_SHA,original_class_sha256:originalHash,
  environment:{wp:'6.8.3',gf:'3.1.1.1',flow:'3.1.0',locale:'fa_IR',viewport:1280},
  cases:[],control:[],limitations:['No claim about other hosts or mobile layouts',
    'Initial DB states are identical within each axis group; populated pre-existing persisted Grid state is not independently qualified'],
  result:'NOT_PROVEN',started:new Date().toISOString()};
fs.mkdirSync(out,{recursive:true});
const reportPath=path.join(out,'abcd-report.json');
const originalExpected=['1','3','6','date_created','id'];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');

function command(executable,args,timeout=30000){
  const p=spawnSync(executable,args,{encoding:'utf8',env:process.env,timeout,maxBuffer:10*1024*1024});
  if (p.error || p.status!==0)
    throw Error('ENVIRONMENT: '+executable+' '+args[0]+' failed; exit='+p.status+'; '+String(p.stderr||'').slice(0,350));
  return (p.stdout||'').trim();
}
const wp=(...args)=>command('php',[process.env.WU008_WP_CLI,'--path='+process.env.WU008_WP_PATH,...args],120000);
async function setSettings(browser,axis,pgr){
  wp('option','update','WPLANG','fa_IR');
  wp('eval',"$u=get_user_by('login','bootstrap_admin');if(!$u)throw new RuntimeException('Synthetic admin absent');update_user_meta($u->ID,'locale','fa_IR');");
  wp('eval',"$s=get_option('pgr_settings',array());if(!is_array($s))$s=array();$s['gravity_flow_inbox_rtl']="+(pgr?'1':'0')+";update_option('pgr_settings',$s);");
  // GFAddOn owns this setting: use its tested native Settings UI, not an
  // assumed PHP setter (update_plugin_setting is not a supported method).
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  try {
    const page=await context.newPage();
    await login(page);
    const settingsUrl=baseURL+'/wp-admin/admin.php?page=gf_settings&subview=gravity-presentation-profiles';
    const response=await page.goto(settingsUrl,{waitUntil:'domcontentloaded'});
    if(!response?.ok())throw Error('ENVIRONMENT: authentic GPP Settings unavailable');
    const select=page.locator('select[name="_gform_setting_inbox_axis_ltr"]');
    if(await select.count()!==1)throw Error('ENVIRONMENT: GPP native axis control unavailable');
    await select.selectOption(axis);
    const submit=page.locator('#gform-settings button[type="submit"], #gform-settings input[type="submit"]').last();
    if(await submit.count()!==1)throw Error('ENVIRONMENT: native GPP Settings submit unavailable');
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),submit.click()]);
  }finally{await context.close();}
  const facts=JSON.parse(wp('eval',"echo wp_json_encode(array('site'=>get_locale(),'pgr'=>pgr_gravity_flow_inbox_rtl_status(),'gpp'=>gpp_gravity_flow_inbox_axis_status()));"));
  if (facts.site!=='fa_IR'||facts.pgr.requested!==(pgr?'on':'off')||facts.gpp.effective!==axis)
    throw Error('ENVIRONMENT: settings verification failed');
}
function installVariant(v){
  const item=variants[v];
  let content=original.replace(target,item.code).replace(tracingReturn,traceSnippet(v)+tracingReturn);
  if(content===original)throw Error('No variation installed');
  fs.writeFileSync(classPath,content,'utf8');
  command('php',['-l',classPath]);
  const sha=hash(content);
  return {variant:v,reverse:item.reverse,idLast:item.idLast,source_sha256:sha};
}
function trace(){
  const f=path.join(out,'abcd-filter.jsonl');
  if(!fs.existsSync(f))return [];
  return fs.readFileSync(f,'utf8').split('\n').filter(Boolean).slice(0,30).map(l=>JSON.parse(l));
}
async function login(page){
  const response=await page.goto(baseURL+'/wp-login.php',{waitUntil:'domcontentloaded'});
  if(!response?.ok())throw Error('ENVIRONMENT: WordPress login failed');
  await page.locator('#user_login').fill('bootstrap_admin');
  await page.locator('#user_pass').fill(process.env.WU008_ADMIN_PASSWORD);
  await Promise.all([page.waitForURL(u=>!u.pathname.includes('wp-login.php'),{timeout:20000}),page.locator('#wp-submit').click()]);
}
async function settled(page){
  await page.waitForFunction(()=>{
    const h=document.querySelector('[data-js="gflow-inbox"]');
    const r=h?.querySelector('.ag-root-wrapper');
    const cfg=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
    const loader=h?.closest('.gflow-inbox')?.querySelector('[data-js="gflow-inbox-loader"]');
    return !!(r&&(r.classList.contains('ag-rtl')||r.classList.contains('ag-ltr')) &&
      cfg && Array.isArray(cfg.rowData) && cfg.rowData.length>=20 &&
      h.querySelectorAll('.ag-center-cols-container .ag-row').length>0 && !loader);
  },null,{timeout:30000});
  await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
}
function observe(){
  const h=document.querySelector('[data-js="gflow-inbox"]');
  const root=h?.querySelector('.ag-root-wrapper');
  const cfg=window.gflow_config?.grids?.[h?.dataset.gridId]?.grid_options;
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'};
  const columns=[...h?.querySelectorAll('.ag-header-cell[col-id]')||[]].filter(visible).map(e=>({id:e.getAttribute('col-id'),x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width})).sort((a,b)=>a.x-b.x);
  const firstRow=h?.querySelector('.ag-center-cols-container .ag-row[row-id]');
  const cells=[...firstRow?.querySelectorAll('.ag-cell[col-id]')||[]].filter(visible).map(e=>({id:e.getAttribute('col-id'),x:e.getBoundingClientRect().x}));
  const defs=(cfg?.columnDefs||[]).map(d=>({id:String(d.colId||d.field||''),displayKey:d.displayKey||null,pinned:d.pinned||null,hide:!!d.hide,width:d.width??null}));
  return {grid_id:h?.dataset.gridId||null,mode:root?.classList.contains('ag-rtl')?'ag-rtl':root?.classList.contains('ag-ltr')?'ag-ltr':'unknown',
    enableRtl:cfg?.enableRtl??null,rtl_option_present:cfg?Object.hasOwn(cfg,'enableRtl'):false,
    columnDefs:defs,physical_left_to_right:columns.map(c=>c.id),physical_right_to_left:columns.map(c=>c.id).reverse(),
    widths:columns.map(c=>({id:c.id,w:c.w})),
    header_body_max_misalignment:Math.max(0,...columns.map(c=>{const x=cells.find(y=>y.id===c.id);return x?Math.abs(x.x-c.x):0;})),
    row_count:Array.isArray(cfg?.rowData)?cfg.rowData.length:null,
    date_companion_present:defs.some(d=>d.id==='date_created_human_readable'||d.displayKey==='date_created_human_readable'),
    operations_present:columns.some(c=>c.id==='id'),date_present:columns.some(c=>c.id==='date_created')};
}
async function resizeProbe(page){
  try {
    const before=await page.evaluate(observe);
    const candidates=await page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id]').all();
    for(const col of candidates){
      const id=await col.getAttribute('col-id');
      if(id==='id'||!(await col.locator('.ag-header-cell-resize').count()))continue;
      const rect=await col.boundingBox();
      const handle=await col.locator('.ag-header-cell-resize').boundingBox();
      if(!rect||!handle)continue;
      const x=handle.x+handle.width/2, y=handle.y+handle.height/2;
      const sign=x<rect.x+rect.width/2?-1:1;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+sign*60,y,{steps:12});await page.mouse.up();
      await page.waitForTimeout(450);
      const changed=await page.evaluate(observe);
      await page.reload({waitUntil:'domcontentloaded'});await settled(page);
      const after=await page.evaluate(observe);
      const width=s=>s.widths.find(c=>c.id===id)?.w;
      const delta=(width(changed)??0)-(width(before)??0);
      return {status:delta>15?'OBSERVED_RESIZE':'NOT_PROVEN',column:id,before:width(before),changed:width(changed),after_reload:width(after),
        preserved:delta>15 && Math.abs((width(after)??0)-(width(changed)??0))<=4,
        after_reload_order:after.physical_right_to_left};
    }
    return {status:'NOT_PROVEN',reason:'No accessible native resize handle'};
  }catch(e){return {status:'NOT_PROVEN',reason:String(e.message||e).slice(0,180)};}
}
async function one(browser,axis,variant,pgr,snapshotSha){
  const label=axis+'-'+variant+'-pgr-'+(pgr?'on':'off');
  const snapshot=path.join('/tmp','g014-abcd-'+axis+'.sql');
  wp('db','import',snapshot);
  const verified=JSON.parse(wp('eval',"echo wp_json_encode(array('pgr'=>pgr_gravity_flow_inbox_rtl_status()['requested'],'gpp'=>gpp_gravity_flow_inbox_axis_status()['effective']));"));
  if(verified.pgr!==(pgr?'on':'off')||verified.gpp!==axis)throw Error('ENVIRONMENT: restored DB does not match expected settings');
  const modification=installVariant(variant);
  const tracePath=path.join(out,'abcd-filter.jsonl');if(fs.existsSync(tracePath))fs.unlinkSync(tracePath);
  // Allow an HTTP PHP opcode cache with timestamp revalidation to see the
  // replaced disposable file; actual callback identity is asserted below.
  await new Promise(resolve=>setTimeout(resolve,2600));
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await ctx.newPage();
  const result={label,axis,variant,pgr,persisted_db_snapshot_sha256:snapshotSha,source:modification,qualification:'NOT_PROVEN'};
  try {
    await login(page);
    const pre=await page.evaluate(()=>Object.keys(localStorage).sort());
    result.pre_inbox_local_storage_keys=pre;
    const response=await page.goto(fixture.frontend_url,{waitUntil:'domcontentloaded'});
    if(!response?.ok())throw Error('ENVIRONMENT: Native frontend HTTP '+response?.status());
    await settled(page);
    result.initial=await page.evaluate(observe);
    result.callback_trace=trace();
    const expectedAfter={
      A:['id','date_created','6','3','1','date_created_human_readable'],
      B:['id','1','3','6','date_created','date_created_human_readable'],
      C:['date_created','6','3','1','id','date_created_human_readable'],
      D:['1','3','6','date_created','id','date_created_human_readable']
    }[variant];
    const traceMatches=t=>t.variant===variant && JSON.stringify(t.after.map(String))===JSON.stringify(expectedAfter);
    if (!result.callback_trace.length || !result.callback_trace.every(traceMatches))
      throw Error('ENVIRONMENT: experimental PHP callback identity/input-output mismatch for '+variant);
    result.callback_variant_verified=true;
    const expectedMode=pgr?'ag-rtl':'ag-ltr';
    if(result.initial.mode!==expectedMode || (pgr&&result.initial.enableRtl!==true) || result.initial.row_count<20)
      throw Error('ENVIRONMENT: authentic Grid identity or RTL state not established');
    if(result.initial.physical_right_to_left.length!==5)
      throw Error('QUALIFICATION: cannot assess all five visible columns');
    result.qualification=result.initial.physical_right_to_left.join(',')===originalExpected.join(',')?'PASS_ORDER':'FAIL_ORDER';
    const img=label+'.jpg';
    await page.screenshot({path:path.join(out,img),type:'jpeg',quality:58,fullPage:false});
    result.image=img;
    await page.reload({waitUntil:'domcontentloaded'});await settled(page);
    result.after_clean_reload=await page.evaluate(observe);
    result.callback_trace_after_reload=trace();
    if (!result.callback_trace_after_reload.length || !result.callback_trace_after_reload.every(traceMatches))
      throw Error('ENVIRONMENT: PHP callback drift across reload in variant '+variant);
    result.reload_variant_verified=true;
    result.resize_probe=await resizeProbe(page);
  }catch(e){
    result.failure=String(e.message||e).slice(0,480);
    result.qualification=result.failure.startsWith('ENVIRONMENT:')?'ENVIRONMENT_BLOCKED':'NOT_PROVEN';
    try {const f=label+'-diagnostic.jpg';await page.screenshot({path:path.join(out,f),type:'jpeg',quality:50,fullPage:false});result.diagnostic=f;}catch{}
  }finally{await ctx.close();}
  return result;
}
async function run(){
  const originalStateHash=hash(fs.readFileSync(classPath));
  if(originalStateHash!==originalHash)throw Error('Immutable installed class differs');
  const browser=await chromium.launch({headless:true});
  report.browser=browser.version();
  try{
    for(const axis of ['on','off']){
      await setSettings(browser,axis,true);
      const file=path.join('/tmp','g014-abcd-'+axis+'.sql');
      wp('db','export',file,'--add-drop-table');
      const digest=hash(fs.readFileSync(file));
      for(const variant of ['A','B','C','D']){
        const result=await one(browser,axis,variant,true,digest);
        report.cases.push(result);
      }
      await setSettings(browser,axis,false);
      wp('db','export',file,'--add-drop-table');
      const control=await one(browser,axis,'A',false,hash(fs.readFileSync(file)));
      report.control.push(control);
    }
    if(report.cases.length!==8 || report.control.length!==2)throw Error('ENVIRONMENT: incomplete experiment cardinality');
    const runnable=report.cases.filter(x=>x.initial&&x.callback_variant_verified&&x.reload_variant_verified&&['PASS_ORDER','FAIL_ORDER'].includes(x.qualification));
    report.result=runnable.length===8?'EVIDENCE_CAPTURED':'NOT_PROVEN';
    report.causal_root='NOT_PROVEN_PENDING_INDEPENDENT_ASSESSMENT';
  }finally{
    fs.writeFileSync(classPath,original);
    report.source_restored=hash(fs.readFileSync(classPath))===originalHash;
    await browser.close();
    report.completed=new Date().toISOString();
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  }
  if(!report.source_restored||report.result!=='EVIDENCE_CAPTURED')
    throw Error('ABCD_REAL_GRID_EVIDENCE_INCOMPLETE');
  console.log('G014_ABCD_RUNTIME_EVIDENCE_CAPTURED cases='+report.cases.length+' controls='+report.control.length);
}
try{await run()}catch(e){
  report.failure=String(e.message||e).slice(0,600);
  if(!report.completed){
    try{fs.writeFileSync(classPath,original)}catch{}
    report.source_restored=fs.existsSync(classPath)&&hash(fs.readFileSync(classPath))===originalHash;
    report.completed=new Date().toISOString();
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  }
  console.error('G014_ABCD_QUALIFICATION_NOT_PROVEN '+report.failure);
  process.exitCode=1;
}
