import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const adminPassword = process.env.WU10_ADMIN_PASSWORD;
const candidateMode = process.env.WU10_CANDIDATE_MODE || 'production';
const safeProfile = 'srwf.operations.entry-detail.v1';
const tolerance = 1;

if (!artifactDir || !wpPath || !wpCli || !adminPassword) throw new Error('WU10 environment is incomplete.');
if (!['production', 'host-relative-width'].includes(candidateMode)) throw new Error(`Unsupported WU10 candidate mode: ${candidateMode}`);
fs.mkdirSync(artifactDir, { recursive: true });

function exec(command, args) {
  const cp = spawnSync(command, args, { encoding: 'utf8', env: process.env });
  if (cp.status !== 0) throw new Error(`${command} failed: ${cp.stderr || cp.stdout}`);
  return cp.stdout.trim();
}
function wpEval(code) { return exec('php', [wpCli, `--path=${wpPath}`, 'eval', code]); }
function writeJson(name, value) { fs.writeFileSync(path.join(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`); }

const manifest = JSON.parse(wpEval('echo wp_json_encode(get_option("gpp_wu18_fixture_manifest"), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);'));
const entryUrl = item => `${baseUrl}/wp-admin/admin.php?page=gravityflow-inbox&view=entry&id=${item.form_id}&lid=${item.entry_id}`;
const runtime = {
  wordpress: wpEval('echo get_bloginfo("version");'),
  gravity_forms: wpEval('echo class_exists("GFForms") && isset(GFForms::$version) ? GFForms::$version : "missing";'),
  gravity_flow: wpEval('echo function_exists("gravity_flow") ? gravity_flow()->get_version() : (defined("GRAVITY_FLOW_VERSION") ? GRAVITY_FLOW_VERSION : "missing");'),
  php: wpEval('echo PHP_VERSION;'),
  node: process.version,
  playwright: JSON.parse(fs.readFileSync(path.resolve('node_modules/playwright/package.json'), 'utf8')).version,
  gpp_head: exec('git', ['rev-parse', 'HEAD']),
};

const browser = await chromium.launch({ headless: true });
runtime.browser = await browser.version();
const context = await browser.newContext();
const page = await context.newPage();

async function login() {
  await page.goto(`${baseUrl}/wp-login.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', 'bootstrap_admin');
  await page.fill('#user_pass', adminPassword);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
  if (!await page.locator('#wpadminbar').count()) throw new Error(`WU10 login did not establish an authenticated session: ${page.url()}`);
}

async function applyCandidate() {
  if (candidateMode !== 'host-relative-width') return;
  await page.addStyleTag({ content: '.gpp-entry-dossier { width: 100%; max-width: 1060px; } @media (max-width: 600px) { .gpp-entry-dossier { width: calc(100% - 25px); max-width: none; } }' });
}

async function admissionProbe(name) {
  const probe = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    body_classes: document.body?.className || null,
    current_user_bar: Boolean(document.querySelector('#wpadminbar')),
    any_dossier_count: document.querySelectorAll('.gpp-entry-dossier').length,
    ready_dossier_count: document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length,
    dossier_profiles: Array.from(document.querySelectorAll('.gpp-entry-dossier')).map(node => node.dataset.gppProfileId || null),
    post_body_content_count: document.querySelectorAll('#post-body-content').length,
    native_entry_table_count: document.querySelectorAll('.entry-detail-view').length,
    workflow_status_count: document.querySelectorAll('.gravityflow-status-box').length,
    timeline_count: document.querySelectorAll('.gravityflow-timeline').length,
    login_form_present: Boolean(document.querySelector('#loginform')),
  }));
  writeJson(`wu10-${name.toLowerCase()}-admission.json`, probe);
  return probe;
}

async function configureHost(constrained) {
  if (!constrained) return;
  await page.evaluate(() => {
    const host = document.querySelector('#post-body-content');
    if (!host) throw new Error('Authentic #post-body-content host missing.');
    host.dataset.gppWu10HostMode = 'CONSTRAINED_HOST';
    for (const [property, value] of [['box-sizing','border-box'], ['width','48rem'], ['max-width','48rem'], ['min-width','0'], ['float','none']]) {
      host.style.setProperty(property, value, 'important');
    }
  });
}

async function readGeometry(expectDossier) {
  return page.evaluate(({ safeProfile, tolerance, expectDossier }) => {
    const rect = node => {
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height };
    };
    const visible = node => {
      if (!node || node.closest('dialog:not([open])')) return false;
      const style = getComputedStyle(node);
      const value = node.getBoundingClientRect();
      return value.width > 0 && value.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const host = document.querySelector('#post-body-content');
    const dossier = document.querySelector(`.gpp-entry-dossier[data-gpp-profile-id="${safeProfile}"][data-gpp-entry-detail="ready"]`);
    const nativeTable = document.querySelector('.entry-detail-view');
    if (!host || (expectDossier && !dossier)) throw new Error('Required Entry Detail geometry nodes missing.');

    const hostRect = rect(host);
    const hostStyle = getComputedStyle(host);
    const hostContent = {
      left: hostRect.left + parseFloat(hostStyle.borderLeftWidth || 0) + parseFloat(hostStyle.paddingLeft || 0),
      right: hostRect.right - parseFloat(hostStyle.borderRightWidth || 0) - parseFloat(hostStyle.paddingRight || 0),
      top: hostRect.top + parseFloat(hostStyle.borderTopWidth || 0) + parseFloat(hostStyle.paddingTop || 0),
      bottom: hostRect.bottom - parseFloat(hostStyle.borderBottomWidth || 0) - parseFloat(hostStyle.paddingBottom || 0),
    };
    hostContent.width = hostContent.right - hostContent.left;

    const status = document.querySelector('.gravityflow-status-box');
    const timeline = document.querySelector('.gravityflow-timeline');
    const nativePrint = document.querySelector('.detail-view-print');
    const gppPrint = document.querySelector('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]');
    const descendants = dossier ? [
      ['task', dossier.querySelector('.gpp-entry-dossier__task')],
      ['facts', dossier.querySelector('.gpp-entry-dossier__facts')],
      ['image', dossier.querySelector('img')],
    ].map(([id,node]) => !node ? {id,present:false} : {
      id, present:true, rect:rect(node), clientWidth:node.clientWidth, scrollWidth:node.scrollWidth,
      clipped:node.scrollWidth > node.clientWidth + tolerance, overflowX:getComputedStyle(node).overflowX,
    }) : [];

    const hostOwned = [
      ['status', status], ['timeline', timeline], ['print', gppPrint],
    ].map(([id,node]) => !node ? {id,present:false} : {
      id, present:true, rect:rect(node), clientWidth:node.clientWidth, scrollWidth:node.scrollWidth,
      clipped:node.scrollWidth > node.clientWidth + tolerance, overflowX:getComputedStyle(node).overflowX,
    });

    const focusCandidates = Array.from(document.querySelectorAll('.gpp-entry-dossier a[href],.gpp-entry-dossier button:not([disabled]),.gpp-entry-print-utility button:not([disabled]),.gravityflow-status-box button:not([disabled]),.gravityflow-status-box textarea:not([disabled]),.gravityflow-timeline a[href]'));
    const focusables = focusCandidates.map(node => {
      const value = rect(node);
      const active = visible(node) && node.tabIndex >= 0;
      return {
        tag:node.tagName, class_name:typeof node.className === 'string' ? node.className : null,
        active, tab_index:node.tabIndex, width:value?.width || 0, height:value?.height || 0,
        inside_document:!active || (value.left >= -tolerance && value.right <= document.documentElement.clientWidth + tolerance),
      };
    });

    const noteTops = Array.from(document.querySelectorAll('.gravityflow-timeline .gravityflow-note')).map(node => node.getBoundingClientRect().top);
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => link.href);
    const longest = dossier ? Array.from(dossier.querySelectorAll('dd')).sort((a,b)=>(b.textContent||'').length-(a.textContent||'').length)[0] || null : null;
    const dossierStyle = dossier ? getComputedStyle(dossier) : null;
    const dossierRect = rect(dossier);
    const tableRect = rect(nativeTable);

    return {
      document:{clientWidth:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth, horizontal_overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance, direction:getComputedStyle(document.documentElement).direction},
      host:{selector:'#post-body-content', mode:host.dataset.gppWu10HostMode || 'FULL_WIDTH_HOST', rect:hostRect, content_box:hostContent, computed_width:hostStyle.width, max_width:hostStyle.maxWidth, overflowX:hostStyle.overflowX},
      dossier:dossier ? {count:document.querySelectorAll('.gpp-entry-dossier[data-gpp-entry-detail="ready"]').length, profile:dossier.dataset.gppProfileId||null, rect:dossierRect, clientWidth:dossier.clientWidth, scrollWidth:dossier.scrollWidth, computed_width:dossierStyle.width, max_width:dossierStyle.maxWidth, margin_inline_start:dossierStyle.marginInlineStart, margin_inline_end:dossierStyle.marginInlineEnd, direction:dossierStyle.direction, overflowX:dossierStyle.overflowX, inside_host_content:dossierRect.left >= hostContent.left-tolerance && dossierRect.right <= hostContent.right+tolerance, internally_clipped:dossier.scrollWidth > dossier.clientWidth+tolerance} : null,
      native_table:nativeTable ? {present:true, display:getComputedStyle(nativeTable).display, rect:tableRect, clientWidth:nativeTable.clientWidth, scrollWidth:nativeTable.scrollWidth, inside_host_content:tableRect.left >= hostContent.left-tolerance && tableRect.right <= hostContent.right+tolerance, clipped:nativeTable.scrollWidth > nativeTable.clientWidth+tolerance} : {present:false},
      descendants, host_owned:hostOwned,
      longest_persian_fact:longest ? {text_length:(longest.textContent||'').trim().length, clientWidth:longest.clientWidth, scrollWidth:longest.scrollWidth, clipped:longest.scrollWidth > longest.clientWidth+tolerance, overflowWrap:getComputedStyle(longest).overflowWrap} : null,
      ownership:{status_count:document.querySelectorAll('.gravityflow-status-box').length, status_inside_dossier:Boolean(status?.closest('.gpp-entry-dossier')), status_inside_native_form:Boolean(status?.closest('form[id^="gform_"]')), timeline_count:document.querySelectorAll('.gravityflow-timeline').length, timeline_inside_dossier:Boolean(timeline?.closest('.gpp-entry-dossier')), timeline_parent_id:timeline?.parentElement?.id||null, timeline_ordered:noteTops.every((top,index)=>index===0||top+tolerance>=noteTops[index-1]), native_print_present:Boolean(nativePrint), native_print_display:nativePrint?getComputedStyle(nativePrint).display:null, gpp_print_count:document.querySelectorAll('.gpp-entry-print-utility[data-gpp-print-utility="dossier"]').length, gpp_print_display:gppPrint?getComputedStyle(gppPrint).display:null},
      isolation:{full_width_stylesheet_loaded:stylesheets.some(href=>href.includes('srwf-gravity-flow-entry-detail-full-width.css')), post_body_display:getComputedStyle(document.querySelector('#post-body')).display},
      focusables,
    };
  }, { safeProfile, tolerance, expectDossier });
}

function dossierFailures(state) {
  const failures=[];
  if (!state.dossier?.inside_host_content) failures.push('DOSSIER_ESCAPES_HOST_CONTENT_BOX');
  if (state.document.horizontal_overflow) failures.push('DOCUMENT_HORIZONTAL_OVERFLOW');
  if (state.dossier?.internally_clipped || state.descendants.some(item=>item.present&&item.clipped)) failures.push('MATERIAL_INTERNAL_HORIZONTAL_CLIPPING');
  if (state.dossier?.count !== 1 || state.dossier?.profile !== safeProfile) failures.push('DOSSIER_IDENTITY_OR_COUNT_CHANGED');
  if (state.ownership.status_count !== 1 || state.ownership.status_inside_dossier || !state.ownership.status_inside_native_form) failures.push('NATIVE_WORKFLOW_OWNERSHIP_CHANGED');
  if (state.ownership.timeline_count !== 1 || state.ownership.timeline_inside_dossier || state.ownership.timeline_parent_id !== 'postbox-container-2' || !state.ownership.timeline_ordered) failures.push('TIMELINE_OWNERSHIP_OR_ORDER_CHANGED');
  if (!state.ownership.native_print_present || state.ownership.native_print_display !== 'none' || state.ownership.gpp_print_count !== 1 || state.ownership.gpp_print_display === 'none') failures.push('PRINT_UTILITY_CONTRACT_CHANGED');
  if (!state.native_table.present || state.native_table.display !== 'none') failures.push('NATIVE_DUPLICATE_SUPPRESSION_CHANGED');
  if (state.isolation.full_width_stylesheet_loaded || state.isolation.post_body_display === 'grid') failures.push('FULL_WIDTH_VARIANT_LEAK');
  const activeFocusables = state.focusables.filter(item=>item.active);
  if (!activeFocusables.length || activeFocusables.some(item=>!item.inside_document)) failures.push('FOCUSABLE_CONTROL_UNREACHABLE');
  if (state.longest_persian_fact?.clipped) failures.push('LONG_PERSIAN_TEXT_CLIPPED');
  if (state.dossier?.direction !== 'rtl') failures.push('RTL_DOSSIER_DIRECTION_CHANGED');
  return failures;
}

async function measureDossier(name, viewport, constrained=false) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl(manifest.alpha), { waitUntil:'networkidle' });
  const probe=await admissionProbe(name);
  if (probe.ready_dossier_count !== 1 || probe.dossier_profiles[0] !== safeProfile) {
    await page.screenshot({path:path.join(artifactDir,`wu10-${name.toLowerCase()}-admission-failure.png`),fullPage:true});
    throw new Error(`Authentic Current / Safe dossier admission unavailable: ${JSON.stringify(probe)}`);
  }
  await applyCandidate();
  await configureHost(constrained);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await readGeometry(true);
  const hard_gate_failures=dossierFailures(state);
  await page.screenshot({path:path.join(artifactDir,`wu10-${name.toLowerCase()}.png`),fullPage:true});
  return {name,viewport,host_mode:constrained?'CONSTRAINED_HOST':'FULL_WIDTH_HOST',candidate_mode:candidateMode,state,hard_gate_failures,passed:hard_gate_failures.length===0};
}

async function measureNativeControl(name, viewport, constrained=false) {
  await page.setViewportSize(viewport);
  await page.goto(entryUrl(manifest.editor), { waitUntil:'networkidle' });
  await page.waitForSelector('.entry-detail-view', { timeout:30000 });
  await configureHost(constrained);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await readGeometry(false);
  const failures=[];
  if (state.dossier) failures.push('GPP_DOSSIER_UNEXPECTED_IN_NATIVE_CONTROL');
  if (state.document.horizontal_overflow) failures.push('NATIVE_DOCUMENT_HORIZONTAL_OVERFLOW');
  if (!state.native_table.present || state.native_table.display === 'none') failures.push('NATIVE_TABLE_NOT_VISIBLE');
  if (state.native_table.present && (!state.native_table.inside_host_content || state.native_table.clipped)) failures.push('NATIVE_TABLE_ESCAPES_OR_CLIPS');
  return {name,viewport,host_mode:constrained?'CONSTRAINED_HOST':'FULL_WIDTH_HOST',state,hard_gate_failures:failures,passed:failures.length===0};
}

await login();
const matrix=[];
let nativeControl=[];
try {
  matrix.push(await measureDossier('FULL_WIDTH_HOST_WIDE',{width:1800,height:1000}));
  matrix.push(await measureDossier('CONSTRAINED_HOST_WIDE',{width:1800,height:1000},true));
  matrix.push(await measureDossier('MEDIUM_TABLET',{width:900,height:1000}));
  matrix.push(await measureDossier('MOBILE_390',{width:390,height:844}));
  nativeControl.push(await measureNativeControl('NATIVE_CONSTRAINED_HOST_WIDE',{width:1800,height:1000},true));
  nativeControl.push(await measureNativeControl('NATIVE_MEDIUM_TABLET',{width:900,height:1000}));
} catch (error) {
  writeJson('wu10-harness-failure.json',{runtime,candidate_mode:candidateMode,completed_matrix:matrix,native_control:nativeControl,error:String(error?.stack||error)});
  await browser.close();
  throw error;
}
await browser.close();

const constrained=matrix.find(item=>item.name==='CONSTRAINED_HOST_WIDE');
const nativeConstrained=nativeControl.find(item=>item.name==='NATIVE_CONSTRAINED_HOST_WIDE');
const nativeHealthy=Boolean(nativeConstrained?.passed) && constrained.state.host_owned.filter(item=>['status','timeline','print'].includes(item.id)&&item.present).every(item=>!item.clipped);
const defectReproduced=constrained.hard_gate_failures.includes('DOSSIER_ESCAPES_HOST_CONTENT_BOX');
const attribution=defectReproduced ? (nativeHealthy?'GPP_INTRODUCED_CONTAINER_DEFECT':'GPP_AMPLIFIES_HOST_OR_NATIVE_DEFECT') : (matrix.every(item=>item.passed)?'NO_REPRODUCIBLE_DEFECT':'NOT_PROVEN');
const output={
  schema_version:'1.1.0',work_unit:'GPP-RP-WU-10-ENTRY-CONSTRAINED-GEOMETRY',problem:'P-14',surface:'gravity_flow.entry_detail',profile:safeProfile,data_class:'SYNTHETIC_NON_PII',runtime,candidate_mode:candidateMode,
  host_contract:{authentic_host_selector:'#post-body-content',full_width_mode:'natural Gravity Flow host at 1800px viewport',constrained_mode:'48rem browser-local constraint on the authentic host node; no dossier mock/reparent'},
  rtl_primary:'computed dossier direction must remain rtl with Persian synthetic values',ltr_smoke:'host document direction recorded on every matrix case',text_200_percent:'NOT_PROVEN_RELIABLY_BY_EXISTING_HARNESS',
  defect_reproduced:defectReproduced,attribution,matrix,native_control:nativeControl,
};
writeJson('wu10-entry-constrained-geometry.json',output);
console.log(JSON.stringify(output,null,2));
const failures=[...matrix.flatMap(item=>item.hard_gate_failures.map(failure=>`${item.name}:${failure}`)),...nativeControl.flatMap(item=>item.hard_gate_failures.map(failure=>`${item.name}:${failure}`))];
if(failures.length){console.error(`WU10_GEOMETRY_FAIL ${failures.join(',')}`);process.exit(1);}
console.log('WU10_ENTRY_CONSTRAINED_GEOMETRY_PASS');
