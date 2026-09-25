import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { applyScenarioAction } from '../visual-regression/scenario-state.mjs';

const BOUND_HEAD = '58176df6d7232e3996a62c5d1261b3172402b8aa';
const BASE = '3471aa4de03321d74a84c46ebef4cc07af5159a4';
const artifactDir = process.env.WU21_ARTIFACT_DIR;
const wpPath = process.env.WU21_WP_PATH;
const wpCli = process.env.WU21_WP_CLI;
const repoRoot = process.env.GITHUB_WORKSPACE;
const baseUrl = process.env.WU21_BASE_URL;
if (!artifactDir || !wpPath || !wpCli || !repoRoot || !baseUrl) throw new Error('PR87 counterfactual v2 requires the pinned WU21 environment.');

const fixture = JSON.parse(fs.readFileSync(path.join(artifactDir, 'fixture-manifest.json'), 'utf8'));
const wp = code => execFileSync('php', [wpCli, `--path=${wpPath}`, 'eval', code], { encoding: 'utf8' }).trim();
const p06 = JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"));'));
if (!p06?.authentic_block_page?.url || !fixture?.frontend_inbox_url) throw new Error('Authentic shortcode/block fixtures are unavailable.');

const cssPath = path.join(repoRoot, 'assets/css/srwf-gravity-flow-inbox.css');
const productionCss = fs.readFileSync(cssPath, 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function neutralizeNativeHeightOverrides(css) {
  let result = css;
  const changes = [];
  for (const target of ['ag-center-cols-container', 'ag-center-cols-clipper']) {
    let matched = 0;
    const ruleRe = new RegExp(`([^{}]*\\.${target}\\s*)\\{([^{}]*)\\}`, 'g');
    result = result.replace(ruleRe, (whole, selector, body) => {
      if (!selector.includes(':has(.ag-center-cols-container > .ag-row .gpp-inbox-card__readiness--ready)') ||
          !selector.includes(':not(:has(.ag-center-cols-container > .ag-row .gpp-inbox-card__readiness--unready))')) return whole;
      const heightMatches = body.match(/(^|\n)\s*height:\s*auto\s*!important\s*;/g) || [];
      const minMatches = body.match(/(^|\n)\s*min-height:\s*0\s*!important\s*;/g) || [];
      if (heightMatches.length !== 1 || minMatches.length !== 1) return whole;
      matched += 1;
      let next = body.replace(/(^|\n)\s*height:\s*auto\s*!important\s*;/, '$1');
      next = next.replace(/(^|\n)\s*min-height:\s*0\s*!important\s*;/, '$1');
      changes.push({ target, selector: selector.trim(), removed: ['height:auto!important', 'min-height:0!important'] });
      return `${selector}{${next}}`;
    });
    assert.equal(matched, 1, `Expected exactly one admitted Card Mode ${target} height rule, got ${matched}.`);
  }
  assert.equal(changes.length, 2);
  return { css: result, changes };
}

const counterfactual = neutralizeNativeHeightOverrides(productionCss);
assert.notEqual(counterfactual.css, productionCss);
const diffNames = execFileSync('git', ['diff', '--name-only', `${BOUND_HEAD}...HEAD`], { cwd: repoRoot, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const productionMutation = diffNames.some(name => name.startsWith('assets/') || name.startsWith('src/') || name === 'gravity-presentation-profiles.php');
assert.equal(productionMutation, false, `Qualification branch mutated production source: ${diffNames.join(', ')}`);

const runtime = JSON.parse(fs.readFileSync(path.join(artifactDir, 'runtime.json'), 'utf8'));
const integratedHostPath = path.join(artifactDir, 'integrated-visual-host.json');
const integratedHost = fs.existsSync(integratedHostPath) ? JSON.parse(fs.readFileSync(integratedHostPath, 'utf8')) : null;
assert.ok(integratedHost, 'Pinned integrated Hello/Elementor host evidence is required before the counterfactual.');

const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+2400; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const scope = '.gflow-inbox.gflow-grid.gflow-common';
const selectors = { gridRoot: `${scope} .ag-root-wrapper`, centerRows: `${scope} .ag-center-cols-container`, searchInput: `${scope} [data-js="gflow-inbox-search"]` };
const rowsSelector = `${selectors.centerRows} > .ag-row`;

function wpControl(action) {
  const env = { ...process.env, WU21_CONTROL: action };
  const cp = spawnSync('php', [wpCli, `--path=${wpPath}`, 'eval-file', path.join(repoRoot, 'tests/repro-evidence-lab/runtime-control.php')], { env, encoding: 'utf8' });
  if (cp.status !== 0) throw new Error(`WP control ${action} failed: ${cp.stderr}\n${cp.stdout}`);
  return cp.stdout.trim();
}

async function installCounterfactualRoute(page) {
  await page.route('**/srwf-gravity-flow-inbox.css*', route => route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: counterfactual.css }));
}

async function settle(page, count, timeout = 20000) {
  await page.waitForSelector(selectors.gridRoot, { timeout: 30000 });
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector: rowsSelector, count }, { timeout });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(350);
}

async function measure(page, label) {
  return page.evaluate(({ scope, label }) => {
    const inbox = document.querySelector(scope);
    const px = value => { const n = Number.parseFloat(value || ''); return Number.isFinite(n) ? n : null; };
    function matchingCascade(el) {
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
      return {
        top:r.top,bottom:r.bottom,width:r.width,height:r.height,inline:el.getAttribute('style'),
        inlineHeight:el.style.getPropertyValue('height')||null,inlineMinHeight:el.style.getPropertyValue('min-height')||null,
        computedHeight:s.height,computedMinHeight:s.minHeight,display:s.display,overflow:s.overflow,
        paddingTop:px(s.paddingTop)||0,paddingBottom:px(s.paddingBottom)||0,matchedHeightCascade:matchingCascade(el),
      };
    };
    const container = box(inbox?.querySelector('.ag-center-cols-container'));
    const clipper = box(inbox?.querySelector('.ag-center-cols-clipper'));
    const body = box(inbox?.querySelector('.ag-body-viewport'));
    const pager = box(inbox?.querySelector('.ag-paging-panel'));
    const rows = [...(inbox?.querySelectorAll('.ag-center-cols-container > .ag-row') || [])];
    const cards = [...(inbox?.querySelectorAll('.gpp-inbox-card') || [])].filter(el => el.getBoundingClientRect().height > 0).map(box);
    const tops = [...new Set(cards.map(c => Math.round(c.top)))];
    const visualBottom = cards.length ? Math.max(...cards.map(c => c.bottom)) : null;
    const visualTop = cards.length ? Math.min(...cards.map(c => c.top)) : null;
    const widthOwner = inbox?.closest('[data-gpp-inbox-surface]') || inbox;
    const authority = target => {
      if (!target) return { effectiveHostSizing:false, reason:'missing-target' };
      const inline = px(target.inlineHeight), computed = px(target.computedHeight), min = px(target.computedMinHeight), bbox = target.height;
      const gppImportantOverrides = target.matchedHeightCascade.filter(item => item.priority === 'important' && item.selector.includes('gpp-inbox-card__readiness') && ['height','min-height'].includes(item.property));
      const expected = inline === null ? null : Math.max(inline, min ?? -Infinity);
      const effective = expected !== null && computed !== null && Math.abs(computed - expected) < 1 && Math.abs(bbox - computed) < 1 && gppImportantOverrides.length === 0;
      return { effectiveHostSizing:effective, mode: inline !== null && computed !== null && Math.abs(computed-inline)<1 ? 'NATIVE_INLINE_HEIGHT' : (min !== null && computed !== null && Math.abs(computed-min)<1 && inline !== null && min>inline ? 'NATIVE_MINIMUM' : 'UNRESOLVED'), inlineHeightPx:inline, computedHeightPx:computed, computedMinHeightPx:min, boundingHeightPx:bbox, gppImportantOverrides };
    };
    return {
      label,row_count:rows.length,visible_card_count:cards.length,cards_per_visual_row:cards.length?Math.max(...tops.map(y=>cards.filter(c=>Math.abs(c.top-y)<3).length)):0,
      visual_card_flow_height:cards.length?visualBottom-visualTop:0,native_grid_body_height:body?.height??null,last_card_to_pager_gap:cards.length&&pager?pager.top-visualBottom:null,
      horizontal_overflow_surface:widthOwner?Math.max(0,widthOwner.scrollWidth-widthOwner.clientWidth):null,horizontal_overflow_document:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
      inbox_width:inbox?.getBoundingClientRect().width??null,grid_count:document.querySelectorAll(`${scope} .ag-root-wrapper`).length,replacement_grid_count:document.querySelectorAll('[data-gpp-replacement-inbox], .gpp-custom-inbox-app').length,
      pager_count:inbox?.querySelectorAll('.ag-paging-panel').length??0,empty_overlay_visible:!!inbox?.querySelector('.ag-overlay-no-rows-center')?.getBoundingClientRect().height,
      container,clipper,body,pager,container_authority:authority(container),clipper_authority:authority(clipper),
    };
  }, { scope, label });
}

function geometryVerdict(m, expectedRows, expectedColumns) {
  const overflowOk = m.horizontal_overflow_surface === 0 && m.horizontal_overflow_document === 0;
  if (expectedRows === 0) return { lifecycle_ok:m.row_count===0&&m.grid_count===1&&m.pager_count===1,composition_ok:true,gap_ok:true,overflow_ok:overflowOk,no_clipping:true };
  const gapOk = m.last_card_to_pager_gap !== null && m.last_card_to_pager_gap >= 0 && m.last_card_to_pager_gap <= 64;
  return { lifecycle_ok:m.row_count===expectedRows,composition_ok:m.visible_card_count===expectedRows&&m.cards_per_visual_row===Math.min(expectedRows,expectedColumns),gap_ok:gapOk,overflow_ok:overflowOk,no_clipping:m.last_card_to_pager_gap!==null&&m.last_card_to_pager_gap>=0 };
}

async function sortingProbe(page) {
  const header = page.locator(`${scope} .ag-header-cell[col-id="gpp_case_card"]`).first();
  assert.equal(await header.count(),1,'Native card-column header unavailable.');
  await header.click({force:true}); await page.waitForTimeout(250); const first=await header.getAttribute('aria-sort');
  await header.click({force:true}); await page.waitForTimeout(250); const second=await header.getAttribute('aria-sort');
  assert.ok(first&&second&&first!==second,`Native sorting did not toggle: ${first} -> ${second}`); return {first,second};
}

async function runPositiveControl(context,routes) {
  const observations=[];
  for (const [route,url] of Object.entries(routes)) for (const [device,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})) {
    const page=await context.newPage(); await page.setViewportSize(viewport); await page.goto(url,{waitUntil:'networkidle'}); await page.waitForSelector(selectors.gridRoot,{timeout:30000}); await page.waitForTimeout(700);
    observations.push({route,device,...await measure(page,`positive/${route}/${device}`)}); await page.close();
  }
  for (const route of Object.keys(routes)) {
    const desktop=observations.find(x=>x.route===route&&x.device==='desktop');
    assert.ok(Number.isInteger(desktop?.row_count)&&desktop.row_count>0&&desktop.row_count<20,`Positive control ${route}/desktop did not reproduce PR87 under-materialization: ${desktop?.row_count}.`);
    assert.equal(desktop.grid_count,1,`Positive control ${route}/desktop lost native grid ownership.`);
    assert.equal(desktop.replacement_grid_count,0,`Positive control ${route}/desktop introduced a replacement grid.`);
  }
  return observations;
}

async function runCase(context,route,url,device,viewport,control) {
  const page=await context.newPage(); await page.setViewportSize(viewport); await installCounterfactualRoute(page);
  const states=[]; const checks={}; let dynamicAdded=false;
  const columns=device==='desktop'?2:1;
  const push=async(state,expectedRows,geometry=true)=>{const m=await measure(page,`${route}/${device}/${state}`);states.push({state,measurement:m,verdict:geometry?geometryVerdict(m,expectedRows,columns):null});return m;};
  try {
    await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20); const fresh=await push('fresh',20);
    assert.equal(fresh.container_authority.effectiveHostSizing,true,'Container host sizing is not effective.'); assert.equal(fresh.clipper_authority.effectiveHostSizing,true,'Clipper host sizing is not effective.');
    assert.equal(Math.abs(fresh.inbox_width-control.inbox_width)<1,true,'Counterfactual changed host Inbox width.'); assert.equal(fresh.grid_count,1); assert.equal(fresh.replacement_grid_count,0); assert.equal(fresh.pager_count,1);
    checks.sorting=await sortingProbe(page);

    await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20); checks.pagination=await applyScenarioAction(page,'pagination',selectors); await settle(page,5); await push('page-2',5);
    await page.locator(`${scope} [ref="btPrevious"]`).click(); await settle(page,20); await push('page-1-return',20,false);

    checks.search_one=await applyScenarioAction(page,'search_result',selectors); await settle(page,1); const one=await push('search-one',1);
    assert.equal(one.container_authority.effectiveHostSizing,true,'Container host sizing lost on one-row search.'); assert.equal(one.clipper_authority.effectiveHostSizing,true,'Clipper host sizing lost on one-row search.');
    const search=page.locator(selectors.searchInput); await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20); await push('search-cleared',20,false);

    checks.search_empty=await applyScenarioAction(page,'search_empty',selectors); await settle(page,0); const empty=await push('empty',0);
    assert.equal(empty.grid_count,1); assert.equal(empty.replacement_grid_count,0); assert.equal(empty.pager_count,1);
    assert.equal(empty.container.computedMinHeight,'500px','Native container empty minimum did not resume.'); assert.equal(empty.clipper.computedMinHeight,'500px','Native clipper empty minimum did not resume.');
    assert.equal(empty.container_authority.effectiveHostSizing,true,'Container host sizing lost in empty state.'); assert.equal(empty.clipper_authority.effectiveHostSizing,true,'Clipper host sizing lost in empty state.');
    await search.fill(''); await search.dispatchEvent('keyup'); await settle(page,20); await push('empty-cleared',20,false);

    const beforeFallback=await push('readiness-before',20,false);
    await page.locator(`${scope} .gpp-inbox-card__readiness--ready`).first().evaluate(el=>el.classList.replace('gpp-inbox-card__readiness--ready','gpp-inbox-card__readiness--unready')); await page.waitForTimeout(350);
    const fallback=await push('readiness-fallback',20,false); assert.equal(fallback.container_authority.effectiveHostSizing,true); assert.equal(fallback.clipper_authority.effectiveHostSizing,true); assert.equal(fallback.visible_card_count,0,'Card presentation did not yield to native fallback.');
    await page.locator(`${scope} .gpp-inbox-card__readiness--unready`).first().evaluate(el=>el.classList.replace('gpp-inbox-card__readiness--unready','gpp-inbox-card__readiness--ready')); await settle(page,20); const restored=await push('readiness-restored',20,false);
    assert.equal(restored.container_authority.effectiveHostSizing,true); assert.equal(restored.clipper_authority.effectiveHostSizing,true); checks.readiness={before_rows:beforeFallback.row_count,fallback_rows:fallback.row_count,restored_rows:restored.row_count,native_fallback_cards:fallback.visible_card_count};

    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';}); await settle(page,20); await push('root-font-200',20); await page.evaluate(()=>document.documentElement.style.removeProperty('font-size')); await settle(page,20);

    const link=page.locator(`${scope} .ag-cell[col-id="gpp_case_card"] .gflow-inbox__entry-cell-link`).first(); const href=await link.getAttribute('href'); assert.ok(href&&href.includes('view=entry')&&href.includes('lid='),`Unexpected Entry Detail href: ${href}`);
    await Promise.all([page.waitForURL(/view=entry/,{timeout:30000}),link.click()]); checks.entry_detail={href,navigated:true}; await page.goto(url,{waitUntil:'networkidle'}); await settle(page,20);

    const refresh=page.locator('[data-gpp-inbox-manual-refresh]'); assert.equal(await refresh.count(),1); await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),refresh.click()]); await settle(page,20); checks.manual_refresh={rows:20,control_count:await page.locator('[data-gpp-inbox-manual-refresh]').count()};

    const pollSearch=page.locator(selectors.searchInput); await pollSearch.fill('WU21 Refresh Student'); await pollSearch.dispatchEvent('keyup'); await settle(page,0);
    const dynamicId=Number(wpControl('add')); dynamicAdded=true; await settle(page,1,50000); assert.ok((await page.locator(rowsSelector).first().innerText()).includes('WU21 Refresh Student'),'Native polling did not add dynamic row.');
    wpControl('remove'); dynamicAdded=false; await settle(page,0,50000); checks.polling={dynamic_entry_id:dynamicId,add_observed:true,remove_observed:true}; await pollSearch.fill(''); await pollSearch.dispatchEvent('keyup'); await settle(page,20);

    await page.reload({waitUntil:'networkidle'}); await settle(page,20); const final=await push('final-reload',20,false); assert.equal(final.grid_count,1); assert.equal(final.replacement_grid_count,0); assert.equal(final.container_authority.effectiveHostSizing,true); assert.equal(final.clipper_authority.effectiveHostSizing,true);

    const countStates={fresh:20,'page-2':5,'page-1-return':20,'search-one':1,'search-cleared':20,empty:0,'empty-cleared':20,'readiness-restored':20,'final-reload':20};
    const lifecycleCounts=Object.fromEntries(states.filter(s=>s.state in countStates).map(s=>[s.state,s.measurement.row_count]));
    const lifecycleOk=Object.entries(countStates).every(([state,count])=>lifecycleCounts[state]===count)&&checks.sorting&&checks.pagination&&checks.entry_detail?.navigated&&checks.polling?.add_observed&&checks.polling?.remove_observed&&checks.manual_refresh?.rows===20;
    const geometryStates=states.filter(s=>['fresh','page-2','search-one','root-font-200'].includes(s.state));
    const geometryOk=geometryStates.every(s=>s.verdict?.composition_ok&&s.verdict?.gap_ok&&s.verdict?.overflow_ok&&s.verdict?.no_clipping);
    const authorityOk=states.filter(s=>['fresh','page-2','search-one','empty','readiness-fallback','readiness-restored','final-reload'].includes(s.state)).every(s=>s.measurement.container_authority.effectiveHostSizing&&s.measurement.clipper_authority.effectiveHostSizing);
    return {route,device,status:'EXECUTED',lifecycle_ok:!!lifecycleOk,geometry_ok:geometryOk,native_authority_ok:authorityOk,lifecycle_counts:lifecycleCounts,checks,states};
  } catch(error) {
    if(dynamicAdded){try{wpControl('remove');}catch{}} return {route,device,status:'ERROR',error:String(error.stack||error),checks,states};
  } finally { await page.close(); }
}

const report={schema_version:'2.0.0',repository:'rezahh107/Gravity-Presentation-Profiles',pr:87,bound_production_head:BOUND_HEAD,base:BASE,qualification_head:execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim(),production_source_mutation:productionMutation?'YES':'NO',qualification_diff_names:diffNames,runtime,integrated_host:integratedHost,mechanism:'Pinned integrated WU21 host; Playwright intercepts only the GPP Inbox stylesheet and removes exactly Card Mode height:auto!important/min-height:0!important for center container and clipper. No production source, AG Grid API, observer, state, query, pager, search, or polling ownership is changed.',source_css_sha256:sha256(productionCss),counterfactual_css_sha256:sha256(counterfactual.css),neutralized_declarations:counterfactual.changes,positive_control:[],counterfactual_matrix:[],result:'RUNNING'};
const browser=await chromium.launch({headless:true}); const context=await browser.newContext({locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce'}); await context.addCookies(cookies.map(cookie=>({...cookie,url:baseUrl})));
try {
  const routes={shortcode:fixture.frontend_inbox_url,block:p06.authentic_block_page.url}; report.positive_control=await runPositiveControl(context,routes);
  for(const [route,url] of Object.entries(routes)) for(const [device,viewport] of Object.entries({desktop:{width:1440,height:1000},mobile:{width:390,height:844}})) {
    const control=report.positive_control.find(x=>x.route===route&&x.device===device); report.counterfactual_matrix.push(await runCase(context,route,url,device,viewport,control));
  }
  const allExecuted=report.counterfactual_matrix.every(x=>x.status==='EXECUTED'); const lifecycleOk=allExecuted&&report.counterfactual_matrix.every(x=>x.lifecycle_ok); const geometryOk=allExecuted&&report.counterfactual_matrix.every(x=>x.geometry_ok); const authorityOk=allExecuted&&report.counterfactual_matrix.every(x=>x.native_authority_ok);
  report.summary={all_executed:allExecuted,lifecycle_ok:lifecycleOk,geometry_ok:geometryOk,native_authority_ok:authorityOk};
  if(!allExecuted||!authorityOk) report.result='REPAIR_METHOD_NOT_ESTABLISHED'; else if(!lifecycleOk) report.result='NATIVE_HEIGHT_RESTORATION_FALSIFIED'; else if(!geometryOk) report.result='NATIVE_HEIGHT_RESTORATION_INSUFFICIENT'; else report.result='REPAIR_METHOD_ESTABLISHED';
} finally {
  fs.writeFileSync(path.join(artifactDir,'pr87-native-height-restoration-counterfactual-v2.json'),JSON.stringify(report,null,2)+'\n'); await browser.close();
}
console.log(`PR87_NATIVE_HEIGHT_COUNTERFACTUAL_V2=${report.result}`); console.log(JSON.stringify(report.summary||{},null,2));
