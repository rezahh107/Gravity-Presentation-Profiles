import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = process.env.WU10_ADMIN_PASSWORD;
const safeProfile = 'srwf.operations.entry-detail.v1';
const tolerance = 1;
if (!artifactDir || !wpPath || !wpCli || !adminPassword) throw new Error('WU10 environment is incomplete.');

function exec(command, args) {
  const cp = spawnSync(command, args, { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${command} failed: ${cp.stderr || cp.stdout}`);
  return cp.stdout.trim();
}
function wpEval(code) { return exec('php', [wpCli, `--path=${wpPath}`, 'eval', code]); }
const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const entryUrl = `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${manifest.alpha.form_id}&lid=${manifest.alpha.entry_id}`;
const runtime = {
  wordpress: wpEval('echo get_bloginfo("version");'),
  gravity_forms: wpEval('echo defined("GF_VERSION") ? GF_VERSION : "missing";'),
  gravity_flow: wpEval('echo defined("GRAVITY_FLOW_VERSION") ? GRAVITY_FLOW_VERSION : (defined("GRAVITYFLOW_VERSION") ? GRAVITYFLOW_VERSION : "missing");'),
  php: wpEval('echo PHP_VERSION;'),
  node: process.version,
  playwright: JSON.parse(fs.readFileSync(path.resolve('node_modules/playwright/package.json'), 'utf8')).version,
  gpp_head: exec('git', ['rev-parse', 'HEAD']),
};

const browser = await chromium.launch({ headless: true });
runtime.browser = await browser.version();
const page = await browser.newPage();
await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'bootstrap_admin');
await page.fill('#user_pass', adminPassword);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

async function measure(name, viewport, constrained = false) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector(`.gpp-entry-dossier[data-gpp-profile-id="${safeProfile}"][data-gpp-entry-detail="ready"]`, { timeout: 30000 });
  if (constrained) {
    await page.evaluate(() => {
      const host = document.querySelector('#post-body-content');
      if (!host) throw new Error('Authentic #post-body-content host missing.');
      host.dataset.gppWu10HostMode = 'CONSTRAINED_HOST';
      for (const [property, value] of [['box-sizing','border-box'],['width','48rem'],['max-width','48rem'],['min-width','0'],['float','none']]) host.style.setProperty(property, value, 'important');
    });
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const state = await page.evaluate(({ safeProfile, tolerance }) => {
    const dossier = document.querySelector(`.gpp-entry-dossier[data-gpp-profile-id="${safeProfile}"][data-gpp-entry-detail="ready"]`);
    const host = document.querySelector('#post-body-content');
    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    const nativeTable = document.querySelector('.entry-detail-view');
    if (!dossier || !host) throw new Error('Required Entry Detail nodes missing.');
    const r = node => { const x=node.getBoundingClientRect(); return {left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}; };
    const hr = r(host), hs = getComputedStyle(host), dr = r(dossier), ds = getComputedStyle(dossier);
    const hc = {
      left: hr.left + parseFloat(hs.borderLeftWidth||0) + parseFloat(hs.paddingLeft||0),
      right: hr.right - parseFloat(hs.borderRightWidth||0) - parseFloat(hs.paddingRight||0),
      top: hr.top + parseFloat(hs.borderTopWidth||0) + parseFloat(hs.paddingTop||0),
      bottom: hr.bottom - parseFloat(hs.borderBottomWidth||0) - parseFloat(hs.paddingBottom||0),
    };
    hc.width = hc.right - hc.left;
    const regions = [['status',status],['timeline',timeline],['print',gppPrint],['task',dossier.querySelector('.gpp-entry-dossier__task')],['facts',dossier.querySelector('.gpp-entry-dossier__facts')],['image',dossier.querySelector('img')]].map(([id,node]) => !node ? {id,present:false} : {id,present:true,rect:r(node),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,clipped:node.scrollWidth>node.clientWidth+tolerance,overflowX:getComputedStyle(node).overflowX});
    const facts = Array.from(dossier.querySelectorAll('dd')).sort((a,b)=>(b.textContent||'').length-(a.textContent||'').length);
    const longest = facts[0] || null;
    const focusables = Array.from(document.querySelectorAll('.gpp-entry-dossier a[href],.gpp-entry-dossier button:not([disabled]),.gpp-entry-print-utility button:not([disabled]),.gravityflow-status-box button:not([disabled]),.gravityflow-status-box textarea:not([disabled]),.gravityflow-timeline a[href]')).map(node => { const q=r(node), s=getComputedStyle(node); return {tag:node.tagName,width:q.width,height:q.height,visible:q.width>0&&q.height>0&&s.display!=='none'&&s.visibility!=='hidden',inside_document:q.left>=-tolerance&&q.right<=document.documentElement.clientWidth+tolerance}; });
    const noteTops = Array.from(document.querySelectorAll('.gravityflow-timeline .gravityflow-note')).map(node=>node.getBoundingClientRect().top);
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link=>link.href);
    return {
      document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,horizontal_overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+tolerance,direction:getComputedStyle(document.documentElement).direction},
      host:{selector:'#post-body-content',mode:host.dataset.gppWu10HostMode||'FULL_WIDTH_HOST',rect:hr,content_box:hc,computed_width:hs.width,max_width:hs.maxWidth,overflowX:hs.overflowX},
      dossier:{count:document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,profile:dossier.dataset.gppProfileId||null,rect:dr,clientWidth:dossier.clientWidth,scrollWidth:dossier.scrollWidth,computed_width:ds.width,max_width:ds.maxWidth,margin_inline_start:ds.marginInlineStart,margin_inline_end:ds.marginInlineEnd,overflowX:ds.overflowX,inside_host_content:dr.left>=hc.left-tolerance&&dr.right<=hc.right+tolerance,internally_clipped:dossier.scrollWidth>dossier.clientWidth+tolerance},
      regions,
      longest_persian_fact: longest ? {text_length:(longest.textContent||'').trim().length,clientWidth:longest.clientWidth,scrollWidth:longest.scrollWidth,clipped:longest.scrollWidth>longest.clientWidth+tolerance,overflowWrap:getComputedStyle(longest).overflowWrap} : null,
      ownership:{status_count:document.querySelectorAll('.gravityflow-status-box').length,status_inside_dossier:Boolean(status?.closest('.gpp-entry-dossier')),status_inside_native_form:Boolean(status?.closest('form[id^="gform_"]')),timeline_count:document.querySelectorAll('.gravityflow-timeline').length,timeline_inside_dossier:Boolean(timeline?.closest('.gpp-entry-dossier')),timeline_parent_id:timeline?.parentElement?.id||null,timeline_ordered:noteTops.every((top,i)=>i===0||top+tolerance>=noteTops[i-1]),native_print_present:Boolean(nativePrint),native_print_display:nativePrint?getComputedStyle(nativePrint).display:null,gpp_print_count:document.querySelectorAll('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]').length,gpp_print_display:gppPrint?getComputedStyle(gppPrint).display:null,native_table_present:Boolean(nativeTable),native_table_display:nativeTable?getComputedStyle(nativeTable).display:null},
      isolation:{full_width_stylesheet_loaded:styles.some(href=>href.includes('srwf-gravity-flow-entry-detail-full-width.css')),post_body_display:getComputedStyle(document.querySelector('#post-body')).display},
      focusables,
    };
  }, { safeProfile, tolerance });

  const failures=[];
  if(!state.dossier.inside_host_content) failures.push('DOSSIER_ESCAPES_HOST_CONTENT_BOX');
  if(state.document.horizontal_overflow) failures.push('DOCUMENT_HORIZONTAL_OVERFLOW');
  if(state.dossier.internally_clipped||state.regions.some(x=>x.present&&x.clipped)) failures.push('MATERIAL_INTERNAL_HORIZONTAL_CLIPPING');
  if(state.dossier.count!==1||state.dossier.profile!==safeProfile) failures.push('DOSSIER_IDENTITY_OR_COUNT_CHANGED');
  if(state.ownership.status_count!==1||state.ownership.status_inside_dossier||!state.ownership.status_inside_native_form) failures.push('NATIVE_WORKFLOW_OWNERSHIP_CHANGED');
  if(state.ownership.timeline_count!==1||state.ownership.timeline_inside_dossier||state.ownership.timeline_parent_id!=='postbox-container-2'||!state.ownership.timeline_ordered) failures.push('TIMELINE_OWNERSHIP_OR_ORDER_CHANGED');
  if(!state.ownership.native_print_present||state.ownership.native_print_display!=='none'||state.ownership.gpp_print_count!==1||state.ownership.gpp_print_display==='none') failures.push('PRINT_UTILITY_CONTRACT_CHANGED');
  if(!state.ownership.native_table_present||state.ownership.native_table_display!=='none') failures.push('NATIVE_DUPLICATE_SUPPRESSION_CHANGED');
  if(state.isolation.full_width_stylesheet_loaded||state.isolation.post_body_display==='grid') failures.push('FULL_WIDTH_VARIANT_LEAK');
  if(!state.focusables.length||state.focusables.some(x=>!x.visible||!x.inside_document)) failures.push('FOCUSABLE_CONTROL_UNREACHABLE');
  if(state.longest_persian_fact?.clipped) failures.push('LONG_PERSIAN_TEXT_CLIPPED');
  await page.screenshot({path:path.join(artifactDir,`wu10-${name.toLowerCase()}.png`),fullPage:true});
  return {name,viewport,host_mode:constrained?'CONSTRAINED_HOST':'FULL_WIDTH_HOST',state,hard_gate_failures:failures,passed:failures.length===0};
}

const matrix=[];
matrix.push(await measure('FULL_WIDTH_HOST_WIDE',{width:1440,height:1000}));
matrix.push(await measure('CONSTRAINED_HOST_WIDE',{width:1440,height:1000},true));
matrix.push(await measure('MEDIUM_TABLET',{width:900,height:1000}));
matrix.push(await measure('MOBILE_390',{width:390,height:844}));
await browser.close();

const constrained=matrix[1];
const nativeHealthy=constrained.state.regions.filter(x=>['status','timeline','print'].includes(x.id)&&x.present).every(x=>!x.clipped);
const attribution=constrained.hard_gate_failures.includes('DOSSIER_ESCAPES_HOST_CONTENT_BOX')?(nativeHealthy?'GPP_INTRODUCED_CONTAINER_DEFECT':'GPP_AMPLIFIES_HOST_OR_NATIVE_DEFECT'):(matrix.every(x=>x.passed)?'NO_REPRODUCIBLE_DEFECT':'NOT_PROVEN');
const output={schema_version:'1.0.0',work_unit:'GPP-RP-WU-10-ENTRY-CONSTRAINED-GEOMETRY',problem:'P-14',surface:'gravity_flow.entry_detail',profile:safeProfile,data_class:'SYNTHETIC_NON_PII',runtime,host_contract:{authentic_host_selector:'#post-body-content',constrained_mode:'48rem browser-local constraint on the authentic host node; no dossier mock/reparent'},rtl_primary:'server-rendered dossier dir=rtl with Persian synthetic values',ltr_smoke:matrix[0].state.document.direction==='ltr'?'EXECUTED_HOST_LTR_SMOKE':'NOT_APPLICABLE',text_200_percent:'NOT_PROVEN_RELIABLY_BY_EXISTING_HARNESS',attribution,matrix};
fs.writeFileSync(path.join(artifactDir,'wu10-entry-constrained-geometry.json'),`${JSON.stringify(output,null,2)}\n`);
console.log(JSON.stringify(output,null,2));
const failures=matrix.flatMap(x=>x.hard_gate_failures.map(f=>`${x.name}:${f}`));
if(failures.length){console.error(`WU10_GEOMETRY_FAIL ${failures.join(',')}`);process.exit(1);}
console.log('WU10_ENTRY_CONSTRAINED_GEOMETRY_PASS');
