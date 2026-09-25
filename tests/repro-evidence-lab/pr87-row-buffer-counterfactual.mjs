import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { applyScenarioAction } from '../visual-regression/scenario-state.mjs';

const BOUND_HEAD = '58176df6d7232e3996a62c5d1261b3172402b8aa';
const BASE = '3471aa4de03321d74a84c46ebef4cc07af5159a4';
const ROW_BUFFER = 20;
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const baseUrl = process.env.WU21_BASE_URL;
if (!artifactDir || !wpPath || !wpCli || !repoRoot || !baseUrl) throw new Error('PR87 row-buffer counterfactual requires the pinned WU21 environment.');

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const p06 = JSON.parse(execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', 'echo wp_json_encode(get_option("gpp_p06_fixture_manifest"));'], { encoding: 'utf8' }).trim());
if (!fixture?.frontend_inbox_url || !Number.isInteger(fixture?.frontend_inbox_page_id) || !p06?.authentic_block_page?.url || !Number.isInteger(p06?.authentic_block_page?.page_id)) {
  throw new Error('Authentic shortcode/block fixture identities are unavailable.');
}

const diffNames = execFileSync('git', ['diff', '--name-only', `${BOUND_HEAD}...HEAD`], { cwd: repoRoot, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const productionMutation = diffNames.some(name => name.startsWith('assets/') || name.startsWith('src/') || name === 'gravity-presentation-profiles.php');
assert.equal(productionMutation, false, `Qualification branch mutated production source: ${diffNames.join(', ')}`);

const sourceProbePath = path.join(artifactDir, 'pr87-row-buffer-source-probe.json');
assert.equal(fs.existsSync(sourceProbePath), true, 'Pinned row-buffer source probe must exist before runtime qualification.');
const sourceProbe = JSON.parse(fs.readFileSync(sourceProbePath, 'utf8'));
const sourceSupportsRowBuffer = Number(sourceProbe?.counts_by_term?.rowBuffer || 0) > 0;
const sourceExposesSharedConfig = Number(sourceProbe?.counts_by_term?.gravityflow_js_config_shared || 0) > 0;
assert.equal(sourceSupportsRowBuffer, true, 'Pinned Gravity Flow/AG Grid source does not expose rowBuffer; counterfactual is not source-backed.');
assert.equal(sourceExposesSharedConfig, true, 'Pinned Gravity Flow source does not expose gravityflow_js_config_shared; counterfactual is not source-backed.');

const runtime = JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'), 'utf8'));
const integratedHost = JSON.parse(fs.readFileSync(path.join(artifactDir, 'integrated-visual-host.json'), 'utf8'));
const wp = code => execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' }).trim();
const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+2400; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));

const muDir = path.join(wpPath, 'wp-content', 'mu-plugins');
const muPath = path.join(muDir, 'gpp-pr87-row-buffer-counterfactual.php');
const targetPageIds = [fixture.frontend_inbox_page_id, p06.authentic_block_page.page_id];
const muSource = `<?php\n/* Qualification-only runtime counterfactual; never shipped. */\nadd_filter( 'gravityflow_js_config_shared', function ( $config ) {\n    if ( ! is_page( ${JSON.stringify(targetPageIds)} ) || empty( $config['grids'] ) || ! is_array( $config['grids'] ) ) {\n        return $config;\n    }\n    foreach ( $config['grids'] as &$grid ) {\n        if ( isset( $grid['grid_options'] ) && is_array( $grid['grid_options'] ) ) {\n            $grid['grid_options']['rowBuffer'] = ${ROW_BUFFER};\n        }\n    }\n    unset( $grid );\n    return $config;\n}, 99, 1 );\n`;

const scope = '.gflow-inbox.gflow-grid.gflow-common';
const selectors = { gridRoot: `${scope} .ag-root-wrapper`, centerRows: `${scope} .ag-center-cols-container`, searchInput: `${scope} [data-js="gflow-inbox-search"]` };
const rowsSelector = `${selectors.centerRows} > .ag-row`;

function wpControl(action) {
  const env = { ...process.env, WU21_CONTROL: action };
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/runtime-control.php')], { env, encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`WP control ${action} failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

async function settle(page, count, timeout = 25000) {
  await page.waitForSelector(selectors.gridRoot, { timeout: 30000 });
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: rowsSelector, count }, { timeout });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(450);
}

async function measure(page, label) {
  return page.evaluate(({ scope, label }) => {
    const inbox = document.querySelector(scope);
    const px = value => { const n = Number.parseFloat(value || ''); return Number.isFinite(n) ? n : null; };
    function matchingSizingCascade(el) {
      const matches = [];
      const visit = rules => {
        for (const rule of [...(rules || [])]) {
          if (rule.cssRules) { visit(rule.cssRules); continue; }
          if (!rule.selectorText || !rule.style) continue;
          let applies = false; try { applies = el.matches(rule.selectorText); } catch {}
          if (!applies) continue;
          for (const prop of ['height', 'min-height']) {
            const value = rule.style.getPropertyValue(prop);
            if (value) matches.push({ selector: rule.selectorText, property: prop, value: value.trim(), priority: rule.style.getPropertyPriority(prop) || null });
          }
        }
      };
      for (const sheet of [...document.styleSheets]) { try { visit(sheet.cssRules); } catch {} }
      return matches;
    }
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return { top:r.top,bottom:r.bottom,width:r.width,height:r.height,inline:el.getAttribute('style'),inlineHeight:el.style.getPropertyValue('height')||null,computedHeight:s.height,computedMinHeight:s.minHeight,display:s.display,position:s.position,overflow:s.overflow,paddingTop:px(s.paddingTop)||0,paddingBottom:px(s.paddingBottom)||0,matchedSizingCascade:matchingSizingCascade(el) };
    };
    const containerEl = inbox?.querySelector('.ag-center-cols-container');
    const clipperEl = inbox?.querySelector('.ag-center-cols-clipper');
    const bodyEl = inbox?.querySelector('.ag-body-viewport');
    const pagerEl = inbox?.querySelector('.ag-paging-panel');
    const container = box(containerEl), clipper = box(clipperEl), body = box(bodyEl), pager = box(pagerEl);
    const rows = [...(inbox?.querySelectorAll('.ag-center-cols-container > .ag-row') || [])];
    const cards = [...(inbox?.querySelectorAll('.gpp-inbox-card') || [])].filter(el => el.getBoundingClientRect().height > 0).map(box);
    const tops = [...new Set(cards.map(c => Math.round(c.top)))];
    const visualBottom = cards.length ? Math.max(...cards.map(c => c.bottom)) : null;
    const visualTop = cards.length ? Math.min(...cards.map(c => c.top)) : null;
    const widthOwner = inbox?.closest('[data-gpp-inbox-surface]') || inbox;
    const nativeAuthority = target => {
      if (!target) return false;
      const inline = px(target.inlineHeight), computed = px(target.computedHeight), min = px(target.computedMinHeight);
      const gppImportant = target.matchedSizingCascade.filter(item => item.priority === 'important' && item.selector.includes('gpp-inbox-card__readiness') && ['height','min-height'].includes(item.property));
      const expected = inline === null ? null : Math.max(inline, min ?? -Infinity);
      return expected !== null && computed !== null && Math.abs(expected-computed) < 1 && gppImportant.length === 0;
    };
    return {
      label,row_count:rows.length,visible_card_count:cards.length,cards_per_visual_row:cards.length?Math.max(...tops.map(y=>cards.filter(c=>Math.abs(c.top-y)<3).length)):0,
      visual_card_flow_height:cards.length?visualBottom-visualTop:0,native_grid_body_height:body?.height??null,last_card_to_pager_gap:cards.length&&pager?pager.top-visualBottom:null,
      horizontal_overflow_surface:widthOwner?Math.max(0,widthOwner.scrollWidth-widthOwner.clientWidth):null,horizontal_overflow_document:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
      inbox_width:inbox?.getBoundingClientRect().width??null,grid_count:document.querySelectorAll(`${scope} .ag-root-wrapper`).length,replacement_grid_count:document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').length,pager_count:inbox?.querySelectorAll('.ag-paging-panel').length??0,
      container,clipper,body,pager,container_native_authority:nativeAuthority(container),clipper_native_authority:nativeAuthority(clipper),
      localized_row_buffer_marker:[...document.scripts].some(script => (script.textContent||'').includes('"rowBuffer":20')),
    };
  }, { scope, label });
}

function geometryVerdict(m, expectedRows, expectedColumns) {
  const overflowOk = m.horizontal_overflow_surface === 0 && m.horizontal_overflow_document === 0;
  if (expectedRows === 0) return { lifecycle_ok:m.row_count===0&&m.grid_count===1&&m.pager_count===1,composition_ok:true,gap_ok:true,overflow_ok:overflowOk,no_clipping:true };
  const gapOk = m.last_card_to_pager_gap !== null && m.last_card_to_pager_gap >= 0 && m.last_card_to_pager_gap <= 64;
  return { lifecycle_ok:m.row_count===expectedRows,composition_ok:m.visible_card_count===expectedRows&&m.cards_per_visual_row===Math.min(expectedRows,expectedColumns),gap_ok:gapOk,overflow_ok:overflowOk,no_clipping:m.last_card_to_pager_gap!==null&&m.last_card_to_pager_gap>=0 };
}

function nativeFallbackComparable(before, after) {
  const keys = [['container','height'],['clipper','height'],['body','height'],['container','width'],['clipper','width'],['body','width']];
  return keys.every(([box,key]) => typeof before?.[box]?.[key] === 'number' && typeof after?.[box]?.[key] === 'number' && Math.abs(before[box][key]-after[box][key]) < 1);
}

async function toggleReadinessFallback(page) {
  const ready = page.locator(`${scope} .gpp-inbox-card__readiness--ready`).first();
  assert.equal(await ready.count(), 1, 'No ready marker available for fallback probe.');
  await ready.evaluate(el => el.classList.replace('gpp-inbox-card__readiness--ready','gpp-inbox-card__readiness--unready'));
  await page.waitForTimeout(600);
  const fallback = await measure(page, 'readiness-fallback');
  const unready = page.locator(`${scope} .gpp-inbox-card__readiness--unready`).first();
  await unready.evaluate(el => el.classList.replace('gpp-inbox-card__readiness--unready','gpp-inbox-card__readiness--ready'));
  await page.waitForTimeout(500);
  return fallback;
}

async function sortingProbe(page) {
  const header = page.locator(`${scope} .ag-header-cell[col-id="gpp_case_card"]`).first();
  assert.equal(await header.count(),1,'Native card-column header unavailable.');
  await header.click({force:true}); await page.waitForTimeout(250); const first=await header.getAttribute('aria-sort');
  await header.click({force:true}); await page.waitForTimeout(250); const second=await header.getAttribute('aria-sort');
  assert.ok(first&&second&&first!==second,`Native sorting did not toggle: ${first} -> ${second}`); return {first,second};
}

async function positiveControl(context, routes) {
  const observations=[];
  for (const [route,url] of Object.entries(routes)) for (const [device,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})) {
    const page=await context.newPage(); await page.setViewportSize(viewport); await page.goto(url,{waitUntil:'networkidle'}); await page.waitForSelector(selectors.gridRoot,{timeout:30000}); await page.waitForTimeout(800);
    const cardMode=await measure(page,`positive/${route}/${device}/card-mode`);
    if(device==='desktop') assert.ok(cardMode.row_count>0&&cardMode.row_count<20,`PR87 positive control did not reproduce desktop under-materialization for ${route}: ${cardMode.row_count}.`);
    const fallback=await toggleReadinessFallback(page);
    assert.equal(fallback.container_native_authority,true,`Native container sizing did not resume in ${route}/${device} positive fallback.`);
    assert.equal(fallback.clipper_native_authority,true,`Native clipper sizing did not resume in ${route}/${device} positive fallback.`);
    observations.push({route,device,card_mode:cardMode,native_fallback:fallback}); await page.close();
  }
  return observations;
}

async function runCase(context, route, url, device, viewport, nativeFallbackControl) {
  const page=await context.newPage(); await page.setViewportSize(viewport);
  const states=[]; const checks={}; let dynamicAdded=false;
  const columns=device==='desktop'?2:1;
  const push=async(state,expectedRows,geometry=true)=>{const m=await measure(page,`${route}/${device}/${state}`);states.push({state,measurement:m,verdict:geometry?geometryVerdict(m,expectedRows,columns):null});return m;};
  try {
    await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20); const fresh=await push('fresh',20);
    assert.equal(fresh.localized_row_buffer_marker,true,'rowBuffer was not localized through gravityflow_js_config_shared.');
    assert.equal(fresh.grid_count,1); assert.equal(fresh.replacement_grid_count,0); assert.equal(fresh.pager_count,1);
    checks.sorting=await sortingProbe(page);

    await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20); checks.pagination=await applyScenarioAction(page,'pagination',selectors); await settle(page,5); await push('page-2',5);
    await page.locator(`${scope} [ref="btPrevious"]`).click(); await settle(page,20); await push('page-1-return',20,false);

    checks.search_one=await applyScenarioAction(page,'search_result',selectors); await settle(page,1); await push('search-one',1);
    const search=page.locator(selectors.searchInput); await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20); await push('search-cleared',20,false);

    checks.search_empty=await applyScenarioAction(page,'search_empty',selectors); await settle(page,0); await push('empty',0);
    await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20); await push('empty-cleared',20,false);

    const fallback=await toggleReadinessFallback(page); states.push({state:'readiness-fallback',measurement:fallback,verdict:null});
    assert.equal(fallback.visible_card_count,0,'Card presentation did not yield to native fallback.');
    assert.equal(fallback.container_native_authority,true,'Native container sizing did not resume with rowBuffer present.');
    assert.equal(fallback.clipper_native_authority,true,'Native clipper sizing did not resume with rowBuffer present.');
    assert.equal(nativeFallbackComparable(nativeFallbackControl,fallback),true,'rowBuffer changed native fallback visible geometry.');
    await settle(page,20); await push('readiness-restored',20,false);

    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';}); await settle(page,20); await push('root-font-200',20); await page.evaluate(()=>document.documentElement.style.removeProperty('font-size')); await settle(page,20);

    const link=page.locator(`${scope} .ag-cell[col-id="gpp_case_card"] .gflow-inbox__entry-cell-link`).first(); const href=await link.getAttribute('href'); assert.ok(href&&href.includes('view=entry')&&href.includes('lid='),`Unexpected Entry Detail href: ${href}`);
    await Promise.all([page.waitForURL(/view=entry/,{timeout:30000}),link.click()]); checks.entry_detail={href,navigated:true}; await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20);

    const refresh=page.locator('[data-gpp-inbox-manual-refresh]'); assert.equal(await refresh.count(),1); await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),refresh.click()]); await settle(page,20); checks.manual_refresh={rows:20};

    const pollSearch=page.locator(selectors.searchInput); await pollSearch.fill('WU21 Refresh Student'); await pollSearch.dispatchEvent('keyup'); await settle(page,0);
    const dynamicId=Number(wpControl('add')); dynamicAdded=true; await settle(page,1,50000); assert.ok((await page.locator(rowsSelector).first().innerText()).includes('WU21 Refresh Student'),'Native polling did not add dynamic row.');
    wpControl('remove'); dynamicAdded=false; await settle(page,0,50000); checks.polling={dynamic_entry_id:dynamicId,add_observed:true,remove_observed:true}; await pollSearch.fill(''); await pollSearch.dispatchEvent('keyup'); await settle(page,20);

    await page.reload({waitUntil:'networkidle'}); await settle(page,20); await push('final-reload',20,false);

    const expected={fresh:20,'page-2':5,'page-1-return':20,'search-one':1,'search-cleared':20,empty:0,'empty-cleared':20,'readiness-restored':20,'root-font-200':20,'final-reload':20};
    const lifecycleOk=Object.entries(expected).every(([state,count])=>states.find(s=>s.state===state)?.measurement?.row_count===count)&&checks.entry_detail?.navigated&&checks.polling?.add_observed&&checks.polling?.remove_observed&&checks.manual_refresh?.rows===20;
    const geometryStates=states.filter(s=>['fresh','page-2','search-one','root-font-200'].includes(s.state));
    const geometryOk=geometryStates.every(s=>s.verdict?.composition_ok&&s.verdict?.gap_ok&&s.verdict?.overflow_ok&&s.verdict?.no_clipping);
    const fallbackOk=fallback.container_native_authority&&fallback.clipper_native_authority&&fallback.visible_card_count===0&&nativeFallbackComparable(nativeFallbackControl,fallback);
    return {route,device,status:'EXECUTED',lifecycle_ok:!!lifecycleOk,geometry_ok:geometryOk,native_fallback_ok:!!fallbackOk,checks,states};
  } catch(error) {
    if(dynamicAdded){try{wpControl('remove');}catch{}} return {route,device,status:'ERROR',error:String(error.stack||error),checks,states};
  } finally { await page.close(); }
}

const report={schema_version:'1.0.0',repository:'rezahh107/Gravity-Presentation-Profiles',pr:87,bound_production_head:BOUND_HEAD,base:BASE,qualification_head:execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim(),production_source_mutation:productionMutation?'YES':'NO',qualification_diff_names:diffNames,runtime,integrated_host:integratedHost,source_contract:{gravityflow_version:'3.1.0',gravityflow_package_sha256:'ac0573b75831380417a21a455176e25eb746d718bbbd0bb70d6da6f48cba5404',gravityflow_js_config_shared_occurrences:sourceProbe.counts_by_term.gravityflow_js_config_shared,rowBuffer_occurrences:sourceProbe.counts_by_term.rowBuffer,row_buffer_files:sourceProbe.row_buffer_files},mechanism:`Qualification-only MU plugin filters gravityflow_js_config_shared at priority 99 and adds grid_options.rowBuffer=${ROW_BUFFER} only on the two pinned WU21 Inbox pages. PR87 production CSS is served unchanged.`,row_buffer:ROW_BUFFER,target_page_ids:targetPageIds,positive_control:[],matrix:[],result:'RUNNING'};

fs.mkdirSync(muDir,{recursive:true});
if(fs.existsSync(muPath)) fs.rmSync(muPath);
const browser=await chromium.launch({headless:true}); const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce'}); await context.addCookies(cookies.map(cookie=>({...cookie,url:baseUrl})));
try {
  const routes={shortcode:fixture.frontend_inbox_url,block:p06.authentic_block_page.url};
  report.positive_control=await positiveControl(context,routes);
  fs.writeFileSync(muPath,muSource);
  for(const [route,url] of Object.entries(routes)) for(const [device,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})) {
    const nativeFallbackControl=report.positive_control.find(item=>item.route===route&&item.device===device).native_fallback;
    report.matrix.push(await runCase(context,route,url,device,viewport,nativeFallbackControl));
  }
  const allExecuted=report.matrix.every(x=>x.status==='EXECUTED');
  const lifecycleOk=allExecuted&&report.matrix.every(x=>x.lifecycle_ok); const geometryOk=allExecuted&&report.matrix.every(x=>x.geometry_ok); const fallbackOk=allExecuted&&report.matrix.every(x=>x.native_fallback_ok);
  report.summary={all_executed:allExecuted,lifecycle_ok:lifecycleOk,geometry_ok:geometryOk,native_fallback_ok:fallbackOk};
  report.result=allExecuted&&lifecycleOk&&geometryOk&&fallbackOk?'REPAIR_METHOD_CANDIDATE_RUNTIME_PROVEN':'ROW_BUFFER_CANDIDATE_FALSIFIED';
} finally {
  if(fs.existsSync(muPath)) fs.rmSync(muPath);
  fs.writeFileSync(path.join(artifactDir,'pr87-row-buffer-counterfactual.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
console.log(`PR87_ROW_BUFFER_COUNTERFACTUAL=${report.result}`); console.log(JSON.stringify(report.summary||{},null,2));
