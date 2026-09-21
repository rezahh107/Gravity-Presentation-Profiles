import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const A = process.env.WU21_ARTIFACT_DIR;
const R = process.env.GITHUB_WORKSPACE;
const SHA = process.env.GPP_WU21_REPOSITORY_SHA;
const BASELINE = '8265507e7330a1e444ee10eec0592e816e03fad3';
const T = 3;
if (!A || !R || !SHA) throw new Error('WU21 comparative environment is incomplete.');
const runtime = JSON.parse(fs.readFileSync(path.join(A, 'runtime.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(A, 'inbox-width-rtl-fixture.json'), 'utf8'));
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const browserUser = process.env.GPP_RP_BROWSER_USER;
const browserPassword = process.env.GPP_RP_BROWSER_PASSWORD;

const blob = file => spawnSync('git', ['hash-object', file], { cwd: R, encoding: 'utf8' }).stdout.trim();
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(R, file))).digest('hex');
const controlFiles = {
  'assets/css/srwf-gravity-flow-inbox.css': ['2b0ed958c37471b1f5ffbf2aab22c13798596924'],
  'assets/css/srwf-gravity-flow-inbox-native.css': ['87549fc51b33888cd58c0242b9397cf5e67172d8'],
};
for (const [file, [expected]] of Object.entries(controlFiles)) {
  const actual = blob(file);
  if (actual !== expected) throw new Error(`CONTROL identity mismatch for ${file}: ${actual}`);
  controlFiles[file] = { expected_git_blob_sha: expected, actual_git_blob_sha: actual, sha256: sha256(file) };
}

const HOST_CSS = `.gpp-inbox-surface.gpp-inbox-surface--full-width{box-sizing:border-box!important;inline-size:100%!important;width:100%!important;max-inline-size:none!important;max-width:none!important;margin-inline:0!important;position:static!important;inset:auto!important;left:auto!important;right:auto!important;transform:none!important}`;
const CANDIDATES = Object.freeze([
  { id: 'CONTROL', kind: 'production_control', authority_compatible_candidate: false, css: null, identity: { baseline_sha: BASELINE, files: controlFiles } },
  { id: 'CANDIDATE_HOST_OWNED', kind: 'test_only_prototype', authority_compatible_candidate: true, css: HOST_CSS, identity: { css_sha256: crypto.createHash('sha256').update(HOST_CSS).digest('hex'), description: 'Host owns page width; GPP keeps only the bounded inner Inbox axis.' } },
]);
const GATES = Object.freeze({
  G1: 'NO DOCUMENT HORIZONTAL OVERFLOW', G2: 'NO VISIBLE GRID HORIZONTAL OVERFLOW', G3: 'RTL PHYSICAL GEOMETRY CORRECTNESS',
  G4: 'LTR SMOKE', G5: 'FULL_WIDTH_HOST OWNERSHIP', G6: 'BOUNDED INNER AXIS', G7: 'CONSTRAINED_HOST TRUTHFULNESS',
  G8: 'RESPONSIVE', G9: 'HOST BEHAVIOR UNCHANGED', G10: 'FAIL-CLOSED EVIDENCE',
});
const contexts = ['FULL_WIDTH_HOST', 'CONSTRAINED_HOST'];
const directions = ['rtl', 'ltr'];
const viewports = [{ id: 'desktop_1440', width: 1440, height: 1000 }, { id: 'mobile_390', width: 390, height: 844 }];
const sid = (c, h, d, v, z = 100) => `${c}__${h}__${d}__${v}__text_${z}`;

async function waitInbox(page) {
  await page.waitForSelector('[data-gpp-inbox-surface="gravity_flow.inbox"]', { timeout: 30000 });
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container>.ag-row').length > 1, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.gpp-inbox-card').length > 1, null, { timeout: 30000 });
}
async function prepare(page, c, h, d, v, z = 100) {
  await page.setViewportSize({ width: v.width, height: v.height });
  await page.goto(fixture.contexts[h].url, { waitUntil: 'networkidle' });
  await waitInbox(page);
  if (c.css) await page.addStyleTag({ content: c.css });
  await page.evaluate(dir => {
    document.documentElement.dir = dir; document.body.dir = dir;
    document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]')?.setAttribute('dir', dir);
  }, d);
  await page.addStyleTag({ content: `[data-gpp-inbox-surface="gravity_flow.inbox"]{direction:${d}!important}${z === 100 ? '' : `html{font-size:${z}%!important}`}` });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
}
async function measure(page, meta) {
  return page.evaluate(({ meta, tol }) => {
    const style = e => e ? (() => { const c = getComputedStyle(e); return { display:c.display,visibility:c.visibility,direction:c.direction,width:c.width,maxWidth:c.maxWidth,marginLeft:c.marginLeft,marginRight:c.marginRight,marginInlineStart:c.marginInlineStart,marginInlineEnd:c.marginInlineEnd,position:c.position,left:c.left,right:c.right,insetInlineStart:c.insetInlineStart,insetInlineEnd:c.insetInlineEnd,transform:c.transform,overflowX:c.overflowX,gridTemplateColumns:c.gridTemplateColumns }; })() : null;
    const desc = e => e ? (() => { const r=e.getBoundingClientRect(); return { rect:{left:+r.left.toFixed(2),right:+r.right.toFixed(2),top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2),logicalStart:+(meta.direction==='rtl'?r.right:r.left).toFixed(2),logicalEnd:+(meta.direction==='rtl'?r.left:r.right).toFixed(2)},scroll:{scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollLeft:e.scrollLeft},style:style(e) }; })() : null;
    const q = s => document.querySelector(s);
    const cards=[...document.querySelectorAll('.gpp-inbox-card')], rows=[...document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container>.ag-row')];
    const nodes={
      host:q(`[data-gpp-comparative-host="${meta.context}"]`), surface:q('[data-gpp-inbox-surface="gravity_flow.inbox"]'), inner:q('.gpp-inbox-surface__inner'),
      inbox:q('.gflow-inbox.gflow-grid.gflow-common'), agRoot:q('[data-js="gflow-inbox"] .ag-root-wrapper'), center:q('[data-js="gflow-inbox"] .ag-center-cols-viewport'),
      grid:q('[data-js="gflow-inbox"] .ag-center-cols-container'), first:cards[0], second:cards[1], search:q('[data-js="gflow-inbox-search"]'), scrollbar:q('[data-js="gflow-inbox"] .ag-body-horizontal-scroll'),
    };
    const missing=['host','surface','inner','inbox','agRoot','center','grid','first','second','search'].filter(k=>!nodes[k]);
    const root=document.documentElement, cr=nodes.center?.getBoundingClientRect(), gr=nodes.grid?.getBoundingClientRect(), a=cards[0]?.getBoundingClientRect(), b=cards[1]?.getBoundingClientRect(), sr=nodes.scrollbar?.getBoundingClientRect(), ss=nodes.scrollbar?getComputedStyle(nodes.scrollbar):null;
    return { ...meta, established:missing.length===0, missing_required_measurements:missing, viewport:{innerWidth:innerWidth,innerHeight:innerHeight,clientWidth:root.clientWidth}, document:{scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,rootFontSize:parseFloat(getComputedStyle(root).fontSize)}, elements:Object.fromEntries(Object.entries(nodes).map(([k,e])=>[k,desc(e)])), card_mode:{row_count:rows.length,card_count:cards.length,ready_count:document.querySelectorAll('.gpp-inbox-card__readiness--ready').length,unready_count:document.querySelectorAll('.gpp-inbox-card__readiness--unready').length}, derived:{document_overflow_px:root.scrollWidth-root.clientWidth,center_overflow_px:nodes.center?nodes.center.scrollWidth-nodes.center.clientWidth:null,horizontal_scrollbar_rendered:Boolean(sr&&ss&&ss.display!=='none'&&ss.visibility!=='hidden'&&sr.height>tol),grid_inside_center:Boolean(cr&&gr&&gr.left>=cr.left-tol&&gr.right<=cr.right+tol),two_cards_vertical:Boolean(a&&b&&b.top>=a.bottom-tol),two_cards_same_row:Boolean(a&&b&&Math.abs(a.top-b.top)<=tol)} };
  }, { meta, tol:T });
}
const inside=(outer,inner)=>Boolean(outer?.rect&&inner?.rect&&inner.rect.left>=outer.rect.left-T&&inner.rect.right<=outer.rect.right+T);
const inViewport=m=>Boolean(m.elements.surface?.rect&&m.elements.surface.rect.left>=-T&&m.elements.surface.rect.right<=m.viewport.clientWidth+T);
const noDoc=m=>m.document.scrollWidth<=m.viewport.clientWidth+T;
const noGrid=m=>Boolean(m.elements.center?.style&&!m.derived.horizontal_scrollbar_rendered&&m.derived.grid_inside_center&&!((m.elements.center.scroll.scrollWidth>m.elements.center.scroll.clientWidth+T)&&['auto','scroll'].includes(m.elements.center.style.overflowX)));
const innerBound=m=>{const s=m.elements.surface?.rect,i=m.elements.inner?.rect,f=m.document.rootFontSize;if(!s||!i||!f)return false;return i.width<=s.width+T&&i.width<=70*f+T&&Math.abs((i.left+i.right-s.left-s.right)/2)<=T;};
const staticSurface=m=>{const s=m.elements.surface?.style;return Boolean(s&&s.position==='static'&&s.left==='auto'&&s.right==='auto');};
const hostOwned=m=>Boolean(inside(m.elements.host,m.elements.surface)&&Math.abs(m.elements.host.rect.width-m.elements.surface.rect.width)<=T&&staticSurface(m));
const fullHost=m=>Boolean(m.elements.host?.rect&&m.elements.host.rect.width>=m.viewport.clientWidth-8&&m.elements.host.rect.left>=-8&&m.elements.host.rect.right<=m.viewport.clientWidth+8);
const constrainedHost=m=>Boolean(m.elements.host?.rect&&(m.viewport.clientWidth<=500?m.elements.host.rect.width<=m.viewport.clientWidth+T:m.elements.host.rect.width<m.viewport.clientWidth-100));
const oneCol=m=>Boolean(m.derived.two_cards_vertical&&m.elements.first?.rect&&m.elements.second?.rect&&m.elements.grid?.rect&&m.elements.first.rect.width<=m.elements.grid.rect.width+T&&m.elements.second.rect.width<=m.elements.grid.rect.width+T);

async function capture(page,c,h,d,v,z=100){const id=sid(c.id,h,d,v.id,z);try{await prepare(page,c,h,d,v,z);const m=await measure(page,{id,candidate:c.id,context:h,direction:d,viewport_id:v.id,text_scale_percent:z});if(h==='CONSTRAINED_HOST'&&d==='rtl'&&v.id==='desktop_1440'&&z===100)await page.screenshot({path:path.join(A,`inbox-width-rtl-${c.id.toLowerCase()}-constrained-rtl-1440.png`),fullPage:true});return m;}catch(e){return{id,candidate:c.id,context:h,direction:d,viewport_id:v.id,text_scale_percent:z,established:false,missing_required_measurements:['scenario_execution'],error:String(e?.stack||e)};}}
async function behavior(page,c){const out={candidate:c.id,status:'NOT_PROVEN',checks:{}};try{await prepare(page,c,'FULL_WIDTH_HOST','rtl',viewports[0]);const rows='[data-js="gflow-inbox"] .ag-center-cols-container>.ag-row', initial=await page.locator(rows).count(), first=page.locator(rows).first();out.checks.card_mode=(await page.locator('.gpp-inbox-card__readiness--ready').count())>=initial&&(await page.locator('.gpp-inbox-card__readiness--unready').count())===0;out.checks.row_identity=Boolean(await first.getAttribute('row-id'));out.checks.navigation=Boolean((await first.locator('.gflow-inbox__entry-cell-link').first().getAttribute('href'))?.match(/(?:lid|id)=/));const search=page.locator('[data-js="gflow-inbox-search"]');await search.fill('00:24:00');await page.waitForFunction(s=>document.querySelectorAll(s).length===1,rows,{timeout:15000});out.checks.search=true;await search.fill('');await page.waitForFunction(s=>document.querySelectorAll(s).length===20,rows,{timeout:15000});const h=page.locator('[data-js="gflow-inbox"] .ag-header-cell[col-id="gpp_case_card"]').first();await h.click();const s1=await h.getAttribute('aria-sort');await h.click();const s2=await h.getAttribute('aria-sort');out.checks.sorting=Boolean(s1&&s2&&s1!==s2);const next=page.locator('[data-js="gflow-inbox"] [ref="btNext"]');await next.click();await page.waitForFunction(s=>document.querySelectorAll(s).length===5,rows,{timeout:15000});out.checks.pagination=true;out.status=Object.values(out.checks).every(Boolean)?'PASS':'FAIL';}catch(e){out.error=String(e?.stack||e);}return out;}
const result=(status,evidence,detail={})=>({status,evidence,detail});
function gates(id,ms,b){const standard=ms.filter(m=>m.candidate===id&&m.text_scale_percent===100),all=ms.filter(m=>m.candidate===id),missing=all.filter(m=>!m.established),rtl=standard.filter(m=>m.direction==='rtl'),ltr=standard.filter(m=>m.direction==='ltr'),full=standard.filter(m=>m.context==='FULL_WIDTH_HOST'),con=standard.filter(m=>m.context==='CONSTRAINED_HOST'),mobile=all.filter(m=>m.viewport_id==='mobile_390');const st=(miss,fail)=>miss.length?'NOT_PROVEN':fail.length?'FAIL':'PASS', ids=x=>x.map(m=>m.id);const g1=all.filter(m=>m.established&&!noDoc(m)),g2=all.filter(m=>m.established&&!noGrid(m)),g3=rtl.filter(m=>m.established&&!inViewport(m)),g4=ltr.filter(m=>m.established&&(!noDoc(m)||!noGrid(m)||!inViewport(m))),g5ctx=full.filter(m=>m.established&&!fullHost(m)),g5=full.filter(m=>m.established&&fullHost(m)&&!hostOwned(m)),g6=all.filter(m=>m.established&&!innerBound(m)),g7ctx=con.filter(m=>m.established&&!constrainedHost(m)),g7=con.filter(m=>m.established&&constrainedHost(m)&&!hostOwned(m)),g8=mobile.filter(m=>m.established&&(!noDoc(m)||!inViewport(m)||!oneCol(m)));const ctxMissing=[...standard.filter(m=>m.context==='FULL_WIDTH_HOST'&&m.viewport_id==='desktop_1440'&&m.established&&!fullHost(m)),...standard.filter(m=>m.context==='CONSTRAINED_HOST'&&m.viewport_id==='desktop_1440'&&m.established&&!constrainedHost(m))];return{G1:result(st(missing,g1),ids(all),{failures:ids(g1)}),G2:result(st(missing,g2),ids(all),{failures:ids(g2)}),G3:result(st(rtl.filter(m=>!m.established),g3),ids(rtl),{failures:ids(g3)}),G4:result(st(ltr.filter(m=>!m.established),g4),ids(ltr),{failures:ids(g4)}),G5:result(st([...full.filter(m=>!m.established),...g5ctx],g5),ids(full),{failures:ids(g5),context_not_proven:ids(g5ctx)}),G6:result(st(missing,g6),ids(all),{failures:ids(g6)}),G7:result(st([...con.filter(m=>!m.established),...g7ctx],g7),ids(con),{failures:ids(g7),context_not_proven:ids(g7ctx)}),G8:result(st(mobile.filter(m=>!m.established),g8),ids(mobile),{failures:ids(g8)}),G9:result(b.status,[`behavior:${id}`],b.checks),G10:result(missing.length||ctxMissing.length||b.status==='NOT_PROVEN'?'NOT_PROVEN':'PASS',[...ids(all),`behavior:${id}`],{missing:ids(missing),context_not_proven:ids(ctxMissing),behavior:b.status})};}

const out={schema:'gpp.comparative_repair_qualification.v1',repository_sha:SHA,authorized_baseline_sha:BASELINE,runtime:{wordpress:runtime.wordpress,php:runtime.php,database:runtime.database,gravity_forms:runtime.plugins?.gravity_forms,gravity_flow:runtime.plugins?.gravity_flow,node:{version:process.version},playwright:null,chromium:null},theme:{expected:{template:'twentytwentyfive',stylesheet:'twentytwentyfive'},observed:{template:runtime.wordpress?.template,stylesheet:runtime.wordpress?.stylesheet}},fixture,objective:'Bounded comparative qualification of Inbox width / RTL / host geometry without production repair.',non_goals:['Production repair','Owner preference selection','Production equivalence','Generic benchmark framework','Gravity Flow behavior replacement'],contexts,directions,viewports:[...viewports,{id:'mobile_390_text_200',width:390,height:844,direction:'rtl',context:'FULL_WIDTH_HOST',text_scale_percent:200}],candidates:CANDIDATES.map(({css,...c})=>c),hard_gates:GATES,measurements:[],behavior_probes:{},per_candidate_gate_results:{},control_reproduction:{status:'NOT_PROVEN',reproduced:null},surviving_candidates:[],outcome:'NOT_PROVEN',production_equivalence:'NOT_PROVEN'};
let browser;
try{if(out.theme.observed.template!=='twentytwentyfive'||out.theme.observed.stylesheet!=='twentytwentyfive')throw new Error(`Theme identity mismatch: ${JSON.stringify(out.theme.observed)}`);if(!browserUser||!browserPassword)throw new Error('Comparative browser credentials were not provisioned by WU21.');out.runtime.playwright={version:JSON.parse(fs.readFileSync(path.join(R,'node_modules/playwright/package.json'),'utf8')).version};browser=await chromium.launch({headless:true});out.runtime.chromium={version:browser.version()};const page=await browser.newPage();await page.goto(`${baseUrl}/wp-login.php`,{waitUntil:'domcontentloaded'});await page.fill('#user_login',browserUser);await page.fill('#user_pass',browserPassword);await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.click('#wp-submit')]);for(const c of CANDIDATES){for(const h of contexts)for(const d of directions)for(const v of viewports)out.measurements.push(await capture(page,c,h,d,v));out.measurements.push(await capture(page,c,'FULL_WIDTH_HOST','rtl',viewports[1],200));out.behavior_probes[c.id]=await behavior(page,c);}for(const c of CANDIDATES)out.per_candidate_gate_results[c.id]=gates(c.id,out.measurements,out.behavior_probes[c.id]);const m=out.measurements.find(x=>x.id===sid('CONTROL','CONSTRAINED_HOST','rtl','desktop_1440'));if(m?.established){const escaped=!hostOwned(m);out.control_reproduction={status:escaped?'REPRODUCED':'NOT_REPRODUCED',reproduced:escaped,evidence:m.id,observed:{constrained_parent_escaped:escaped,physical_viewport_failure:!inViewport(m),host_rect:m.elements.host?.rect,surface_rect:m.elements.surface?.rect,surface_style:m.elements.surface?.style,document_overflow_px:m.derived?.document_overflow_px}};}const survivors=CANDIDATES.filter(c=>c.authority_compatible_candidate&&Object.values(out.per_candidate_gate_results[c.id]).every(g=>g.status==='PASS')).map(c=>c.id);out.surviving_candidates=survivors;out.outcome=survivors.length===1?'METHOD_CLOSED_IN_REPRODUCIBLE_SIMULATION':survivors.length>1?'OWNER_GATE_REQUIRED':'NOT_PROVEN';}catch(e){out.fatal=String(e?.stack||e);out.outcome='NOT_PROVEN';}finally{if(browser)await browser.close().catch(()=>{});fs.writeFileSync(path.join(A,'inbox-width-rtl-comparative.json'),JSON.stringify(out,null,2)+'\n');console.log(`GPP_RP_WU01_OUTCOME=${out.outcome}`);console.log(`GPP_RP_WU01_CONTROL_REPRODUCTION=${out.control_reproduction.status}`);console.log(`GPP_RP_WU01_SURVIVORS=${out.surviving_candidates.join(',')||'NONE'}`);}if(out.fatal)throw new Error(out.fatal);
