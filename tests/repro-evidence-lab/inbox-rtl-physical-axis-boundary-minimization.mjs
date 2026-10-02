import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const A=process.env.WU21_ARTIFACT_DIR;
const R=process.env.GITHUB_WORKSPACE;
const SHA=process.env.GPP_WU21_REPOSITORY_SHA;
const BASE_URL=process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const WPCLI=process.env.WU21_WP_CLI;
const WPPATH=process.env.WU21_WP_PATH;
const T=2;
if(!A||!R||!SHA||!WPCLI||!WPPATH) throw new Error('Q2_AXIS_MIN_INFRASTRUCTURE_FAILURE: incomplete WU21 environment.');

const fixture=JSON.parse(fs.readFileSync(path.join(A,'fixture-manifest.json'),'utf8'));
if(!fixture.frontend_inbox_url||!fixture.forms?.[0]?.form_id) throw new Error('Q2_AXIS_MIN_INFRASTRUCTURE_FAILURE: canonical frontend Inbox fixture unavailable.');

function wpEval(code){
  return execFileSync('php',[WPCLI,'--path='+WPPATH,'eval',code],{cwd:R,env:process.env,encoding:'utf8'}).trim();
}

const p06=JSON.parse(wpEval("echo wp_json_encode(get_option('gpp_p06_fixture_manifest'),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);")||'null');
const blockUrl=p06?.authentic_block_page?.url||null;
const formId=Number(fixture.forms[0].form_id);
const scoped=JSON.parse(wpEval(
  "$e=get_page_by_path('wu21-q2-axis-min-form-scoped',OBJECT,'page');"+
  "if($e instanceof WP_Post){wp_delete_post($e->ID,true);}"+
  "$id=wp_insert_post(array('post_title'=>'WU21 Q2 Axis Min Form Scoped','post_status'=>'publish','post_type'=>'page','post_name'=>'wu21-q2-axis-min-form-scoped','post_content'=>'[gravityflow page=\"inbox\" form=\""+formId+"\"]'),true);"+
  "if(is_wp_error($id)){throw new RuntimeException($id->get_error_message());}"+
  "echo wp_json_encode(array('id'=>(int)$id,'url'=>get_permalink($id)),JSON_UNESCAPED_SLASHES);"
));
if(!scoped?.id||!scoped?.url) throw new Error('Q2_AXIS_MIN_INFRASTRUCTURE_FAILURE: form-scoped route setup failed.');

const muDir=path.join(WPPATH,'wp-content/mu-plugins');
const muPath=path.join(muDir,'q2-axis-min-rtl-probe.php');
fs.mkdirSync(muDir,{recursive:true});
fs.copyFileSync(path.join(R,'tests/repro-evidence-lab/inbox-visual-design-v2-qualification-mu.php'),muPath);

const cookies=JSON.parse(wpEval(
  "$u=get_user_by('login','bootstrap_admin');if(!$u)throw new RuntimeException('admin missing');"+
  "$e=time()+900;echo wp_json_encode(array("+
  "array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),"+
  "array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))),JSON_UNESCAPED_SLASHES);"
));

const rtl=url=>{const u=new globalThis.URL(url);u.searchParams.set('wu21_header_rtl_probe','1');return u.toString();};
const routes={
  unscoped:rtl(fixture.frontend_inbox_url),
  form_scoped:rtl(scoped.url),
  block:blockUrl?rtl(blockUrl):null,
};

const structural={
  root_wrapper:'.ag-root-wrapper',
  root:'.ag-root',
  header:'.ag-header',
  header_viewport:'.ag-header-viewport',
  header_container:'.ag-header-container',
  body_viewport:'.ag-body-viewport',
  center_cols_clipper:'.ag-center-cols-clipper',
  center_cols_viewport:'.ag-center-cols-viewport',
  center_cols_container:'.ag-center-cols-container',
  hscroll:'.ag-body-horizontal-scroll',
  hscroll_viewport:'.ag-body-horizontal-scroll-viewport',
  hscroll_container:'.ag-body-horizontal-scroll-container',
};

const candidatePlan=[
  {id:'C0_BASELINE',keys:[]},
  {id:'C1_ROOT_ONLY',keys:['root_wrapper']},
  {id:'C2_SCROLL_VIEWPORTS',keys:['root_wrapper','header_viewport','center_cols_viewport','hscroll_viewport']},
  {id:'C3_SCROLL_VIEWPORTS_CONTAINERS',keys:['root_wrapper','header_viewport','header_container','center_cols_viewport','center_cols_container','hscroll_viewport']},
  {id:'C4_FULL_PHYSICAL_SET',keys:Object.keys(structural)},
];

function cssFor(keys){
  if(!keys.length) return '';
  const selectors=keys.map(k=>'.gpp-inbox-surface [data-js="gflow-inbox"] '+structural[k]);
  return selectors.join(',\n')+' { direction: ltr !important; }\n';
}

async function waitGrid(page){
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper',{timeout:30000});
  await page.waitForFunction(()=>document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row').length>0,null,{timeout:30000});
  await page.evaluate(async()=>{if(document.fonts?.ready)await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  await page.waitForTimeout(120);
}

async function load(page,url,width=1200,height=900){
  await page.setViewportSize({width,height});
  await page.goto(url,{waitUntil:'networkidle'});
  await waitGrid(page);
}

async function installCandidate(page,keys){
  await page.locator('#gpp-q2-axis-min-style').evaluateAll(nodes=>nodes.forEach(n=>n.remove()));
  if(keys.length){
    await page.addStyleTag({content:cssFor(keys),id:'gpp-q2-axis-min-style'}).catch(async()=>{
      await page.evaluate(css=>{const s=document.createElement('style');s.id='gpp-q2-axis-min-style';s.textContent=css;document.head.appendChild(s);},cssFor(keys));
    });
  }
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.waitForTimeout(120);
}

async function horizontalSelector(page){
  for(const s of [
    '[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport',
    '[data-js="gflow-inbox"] .ag-body-horizontal-scroll .ag-body-horizontal-scroll-viewport'
  ]) if(await page.locator(s).count()) return s;
  return null;
}

async function setScroll(page,selector,target){
  const actual=await page.locator(selector).first().evaluate((el,v)=>{el.scrollLeft=v;el.dispatchEvent(new Event('scroll'));return el.scrollLeft;},target);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.waitForTimeout(100);
  return actual;
}

async function move(page,selector,range,fraction){
  if(!selector||range<=T||fraction===0){
    if(selector) await setScroll(page,selector,0);
    return {attempted:[0],actual:0,target:0};
  }
  const n=Math.max(1,Math.round(range*fraction));
  for(const target of [n,-n]){
    const actual=await setScroll(page,selector,target);
    if(Math.abs(actual)>T) return {attempted:[n,-n],actual,target};
  }
  return {attempted:[n,-n],actual:0,target:null};
}

async function snapshot(page,label,movement){
  const hs=await horizontalSelector(page);
  return page.evaluate(({hs,label,movement,T,structural})=>{
    const q=s=>document.querySelector('[data-js="gflow-inbox"] '+s);
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {left:+r.left.toFixed(2),right:+r.right.toFixed(2),width:+r.width.toFixed(2),top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2)};};
    const d=el=>el?getComputedStyle(el).direction:null;
    const root=q('.ag-root-wrapper');
    const headers=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell[col-id]')];
    const row=document.querySelector('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row');
    const cells=row?[...row.querySelectorAll('.ag-cell[col-id]')]:[];
    const hm=new Map(headers.map(el=>[el.getAttribute('col-id'),el]));
    const cm=new Map(cells.map(el=>[el.getAttribute('col-id'),el]));
    const ids=[...hm.keys()].filter(id=>cm.has(id));
    const alignment=ids.map(id=>{
      const h=rect(hm.get(id)),b=rect(cm.get(id));
      return {col_id:id,left_delta_px:+(h.left-b.left).toFixed(2),right_delta_px:+(h.right-b.right).toFixed(2),width_delta_px:+(h.width-b.width).toFixed(2)};
    });
    const max=k=>alignment.length?Math.max(...alignment.map(x=>Math.abs(x[k]))):null;
    const order=[...headers].map(el=>({id:el.getAttribute('col-id'),left:rect(el)?.left??0,text:(el.innerText||'').trim()})).sort((a,b)=>a.left-b.left).map(x=>x.id);
    const pagerRefs=['btFirst','btPrevious','lbCurrent','lbTotal','btNext','btLast'];
    const pager=pagerRefs.map(ref=>{const el=document.querySelector('[data-js="gflow-inbox"] [ref="'+ref+'"]');return el?{ref,left:rect(el)?.left??0,text:(el.textContent||'').trim(),direction:d(el)}:null;}).filter(Boolean);
    const hEl=hs?document.querySelector(hs):null;
    const participants={};
    for(const [name,s] of Object.entries(structural)){const el=q(s);participants[name]=el?{direction:d(el),scroll_left:el.scrollLeft,scroll_width:el.scrollWidth,client_width:el.clientWidth,transform:getComputedStyle(el).transform,left:getComputedStyle(el).left}:null;}
    return {
      label,movement,
      grid:{classes:root?[...root.classList]:[],ag_ltr:Boolean(root?.classList.contains('ag-ltr')),ag_rtl:Boolean(root?.classList.contains('ag-rtl')),direction:d(root)},
      participants,
      hscroll: hEl?{direction:d(hEl),scroll_left:hEl.scrollLeft,scroll_width:hEl.scrollWidth,client_width:hEl.clientWidth,range:Math.max(0,hEl.scrollWidth-hEl.clientWidth)}:null,
      alignment:{columns:alignment,max_abs_left_delta_px:max('left_delta_px'),max_abs_right_delta_px:max('right_delta_px'),max_abs_width_delta_px:max('width_delta_px')},
      visual_order_left_to_right:order,
      text_directions:{
        headers:[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-header-cell-text')].map(el=>d(el)),
        cells:cells.map(el=>d(el)),
      },
      pager,
      doc_overflow_px:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
      scrollbar_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-body-horizontal-scroll-viewport').length,
      tolerance:T,
    };
  },{hs,label,movement,T,structural});
}

function metrics(states,baselineOrder){
  const origin=states[0],moved=states.slice(1);
  const align=s=>Math.max(s?.alignment?.max_abs_left_delta_px||0,s?.alignment?.max_abs_right_delta_px||0);
  const text=[...(origin?.text_directions?.headers||[]),...(origin?.text_directions?.cells||[])];
  const relevant=['root_wrapper','header_viewport','center_cols_viewport','hscroll_viewport'];
  const dirs=Object.fromEntries(relevant.map(k=>[k,origin?.participants?.[k]?.direction||null]));
  return {
    ag_ltr:Boolean(origin?.grid?.ag_ltr)&&!origin?.grid?.ag_rtl,
    relevant_directions:dirs,
    all_relevant_ltr:relevant.every(k=>dirs[k]==='ltr'),
    nonzero_movement:moved.some(s=>Math.abs(s.movement?.actual||0)>T),
    max_moved_alignment_px:moved.length?Math.max(...moved.map(align)):align(origin),
    origin_alignment_px:align(origin),
    doc_overflow_px:Math.max(...states.map(s=>s.doc_overflow_px||0)),
    scrollbar_count:origin?.scrollbar_count??null,
    text_all_rtl:Boolean(text.length)&&text.every(x=>x==='rtl'),
    visual_order_preserved:JSON.stringify(origin?.visual_order_left_to_right||[])===JSON.stringify(baselineOrder||[]),
    pager_signature:origin?.pager?.map(x=>x.ref+':'+x.text).join('|')||'',
  };
}

function pass(m){
  return m.ag_ltr&&m.all_relevant_ltr&&m.nonzero_movement&&m.max_moved_alignment_px<=T&&m.doc_overflow_px<=T&&m.scrollbar_count===1&&m.text_all_rtl&&m.visual_order_preserved;
}

async function evaluateCandidate(page,url,candidate,width=1200,height=900,baselineOrder=null){
  await load(page,url,width,height);
  await installCandidate(page,candidate.keys);
  const hs=await horizontalSelector(page);
  if(!hs) return {candidate,status:'NOT_PROVEN',reason:'native horizontal scrollbar viewport absent',states:[]};
  const range=await page.locator(hs).first().evaluate(el=>Math.max(0,el.scrollWidth-el.clientWidth));
  const originMove=await move(page,hs,range,0);
  const origin=await snapshot(page,'origin',originMove);
  if(range<=T) return {candidate,status:'NOT_PROVEN',reason:'no real horizontal scroll range',range,states:[origin],metrics:metrics([origin],baselineOrder||origin.visual_order_left_to_right)};
  const midMove=await move(page,hs,range,.5);
  const mid=await snapshot(page,'intermediate',midMove);
  const endMove=await move(page,hs,range,1);
  const end=await snapshot(page,'end',endMove);
  const m=metrics([origin,mid,end],baselineOrder||origin.visual_order_left_to_right);
  return {candidate,range,states:[origin,mid,end],metrics:m,status:pass(m)?'PASS':'FAIL'};
}

async function chooseWidth(page,url){
  for(const width of [1440,1200,1024,900]){
    await load(page,url,width,width===1440?1000:900);
    const hs=await horizontalSelector(page);
    if(!hs) continue;
    const range=await page.locator(hs).first().evaluate(el=>Math.max(0,el.scrollWidth-el.clientWidth));
    if(range>T) return {width,height:width===1440?1000:900,range};
  }
  return null;
}

async function pagerFocusProbe(page,url,keys,width,height){
  await load(page,url,width,height);
  await installCandidate(page,keys);
  const current=page.locator('[data-js="gflow-inbox"] [ref="lbCurrent"]').first();
  const next=page.locator('[data-js="gflow-inbox"] [ref="btNext"]').first();
  const prev=page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').first();
  const before=(await current.innerText()).trim();
  let pageRoundTrip=false;
  if(await next.count()){
    const disabled=(await next.getAttribute('aria-disabled'))==='true'||await next.evaluate(el=>el.classList.contains('ag-disabled'));
    if(!disabled){
      await next.click();
      await page.waitForFunction(()=>document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='2',null,{timeout:12000});
      await prev.click();
      await page.waitForFunction(()=>document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='1',null,{timeout:12000});
      pageRoundTrip=true;
    }
  }
  const cell=page.locator('[data-js="gflow-inbox"] .ag-center-cols-container > .ag-row .ag-cell').first();
  await cell.focus();
  const focus=await page.evaluate(()=>({
    active_tag:document.activeElement?.tagName?.toLowerCase()||null,
    active_classes:document.activeElement?[...document.activeElement.classList]:[],
    inside_grid:Boolean(document.activeElement?.closest?.('[data-js="gflow-inbox"]')),
  }));
  return {page_before:before,page_round_trip:pageRoundTrip,focus,pass:before==='1'&&pageRoundTrip&&focus.inside_grid};
}

const result={
  schema:'gpp.q2_rtl_physical_axis_boundary_minimization.v1',
  repository_sha:SHA,
  authority_basis:'GPP_INBOX_DESIGN_TOOLBOX_V1.1_Q2_RTL_NATIVE_BEHAVIOR',
  evidence_class:'DIAGNOSTIC_RUNTIME_ONLY',
  production_files_changed:[],
  route_urls:{form_scoped:scoped.url,unscoped:fixture.frontend_inbox_url,block:blockUrl},
  candidates:[],
  greedy_minimization:[],
  winner:null,
  winner_route_verification:{},
  disposition:'NOT_PROVEN',
};

let browser=null,fatal=null;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce'});
  await context.addCookies(cookies.map(c=>({...c,url:BASE_URL})));
  const page=await context.newPage();
  const choice=await chooseWidth(page,routes.unscoped);
  if(!choice) throw new Error('Q2_AXIS_MIN_INCOMPLETE: no desktop viewport produced native horizontal scrolling.');
  result.desktop=choice;

  const baseline=await evaluateCandidate(page,routes.unscoped,candidatePlan[0],choice.width,choice.height,null);
  result.candidates.push(baseline);
  const baselineOrder=baseline.states?.[0]?.visual_order_left_to_right||[];

  let seed=null;
  for(const c of candidatePlan.slice(1)){
    const r=await evaluateCandidate(page,routes.unscoped,c,choice.width,choice.height,baselineOrder);
    result.candidates.push(r);
    if(!seed&&r.status==='PASS') seed=c;
  }
  if(!seed) throw new Error('Q2_AXIS_MIN_NOT_PROVEN: no bounded candidate passed desktop native-scroll invariants.');

  let keys=[...seed.keys];
  for(const key of [...keys]){
    const trial=keys.filter(k=>k!==key);
    const c={id:'GREEDY_MINUS_'+key.toUpperCase(),keys:trial};
    const r=await evaluateCandidate(page,routes.unscoped,c,choice.width,choice.height,baselineOrder);
    result.greedy_minimization.push(r);
    if(r.status==='PASS') keys=trial;
  }

  const winner={id:'MINIMIZED_WINNER',keys:[...keys]};
  const winnerDesktop=await evaluateCandidate(page,routes.unscoped,winner,choice.width,choice.height,baselineOrder);
  if(winnerDesktop.status!=='PASS') throw new Error('Q2_AXIS_MIN_INCOMPLETE: minimized winner did not reproduce PASS.');

  await load(page,routes.unscoped,390,844);
  await installCandidate(page,[]);
  const narrowBaseline=await snapshot(page,'origin',{actual:0});
  const narrowOrder=narrowBaseline.visual_order_left_to_right;
  const winnerNarrow=await evaluateCandidate(page,routes.unscoped,winner,390,844,narrowOrder);
  if(winnerNarrow.status!=='PASS') throw new Error('Q2_AXIS_MIN_NOT_PROVEN: minimized winner failed 390px RTL scroll invariants.');

  const routeChecks={};
  for(const [name,url] of Object.entries(routes)){
    if(!url){routeChecks[name]={status:'NOT_APPLICABLE',reason:'route unavailable'};continue;}
    const base=await evaluateCandidate(page,url,candidatePlan[0],choice.width,choice.height,null);
    const order=base.states?.[0]?.visual_order_left_to_right||[];
    const repaired=await evaluateCandidate(page,url,winner,choice.width,choice.height,order);
    routeChecks[name]={baseline_status:base.status,repaired_status:repaired.status,baseline_metrics:base.metrics,repaired_metrics:repaired.metrics,range:repaired.range};
    if(repaired.status!=='PASS') throw new Error('Q2_AXIS_MIN_NOT_PROVEN: winner failed route '+name);
  }

  const interaction=await pagerFocusProbe(page,routes.unscoped,winner.keys,choice.width,choice.height);
  if(!interaction.pass) throw new Error('Q2_AXIS_MIN_NOT_PROVEN: native pager/focus preservation failed.');

  result.winner={...winner,css:cssFor(winner.keys),desktop:winnerDesktop,narrow_390:winnerNarrow,interaction};
  result.winner_route_verification=routeChecks;
  result.disposition='BOUNDARY_MINIMIZED_RUNTIME_PROVEN';
}catch(e){
  fatal=String(e?.stack||e);
  result.fatal=fatal.slice(0,12000);
}finally{
  if(browser) await browser.close().catch(()=>{});
  fs.rmSync(muPath,{force:true});
  try{wpEval('wp_delete_post('+Number(scoped.id)+',true);');}catch(e){result.cleanup_error=String(e);}
  fs.writeFileSync(path.join(A,'q2-rtl-physical-axis-boundary-minimization.json'),JSON.stringify(result,null,2)+'\n');
  console.log('Q2_AXIS_MIN_DISPOSITION='+result.disposition);
  console.log('Q2_AXIS_MIN_DESKTOP='+JSON.stringify(result.desktop||null));
  console.log('Q2_AXIS_MIN_CANDIDATES='+JSON.stringify(result.candidates.map(x=>({id:x.candidate?.id,status:x.status,keys:x.candidate?.keys,metrics:x.metrics||null,range:x.range||null}))));
  console.log('Q2_AXIS_MIN_GREEDY='+JSON.stringify(result.greedy_minimization.map(x=>({id:x.candidate?.id,status:x.status,keys:x.candidate?.keys,metrics:x.metrics||null}))));
  console.log('Q2_AXIS_MIN_WINNER='+JSON.stringify(result.winner?{keys:result.winner.keys,css:result.winner.css,desktop:result.winner.desktop.metrics,narrow_390:result.winner.narrow_390.metrics,interaction:result.winner.interaction}:null));
  console.log('Q2_AXIS_MIN_ROUTES='+JSON.stringify(result.winner_route_verification));
}
if(fatal) throw new Error(fatal);
