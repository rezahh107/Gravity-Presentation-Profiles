import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { comparePng, writeJson } from './visual-diagnostics-lib.mjs';
import { applyScenarioAction } from './scenario-state.mjs';
import { assertDesignMapping, compareDesignFacts, designFacts, prepareDesignAuthority } from './design-authority-runtime.mjs';

const repo = process.env.GITHUB_WORKSPACE || process.cwd();
const out = path.join(process.env.WU21_ARTIFACT_DIR || '/tmp/wu21-artifacts', 'visual-regression-diagnostics');
const contract = JSON.parse(fs.readFileSync(path.join(repo, 'tests/visual-regression/inbox-visual-contract.json')));
const runtime = JSON.parse(fs.readFileSync(path.join(process.env.WU21_ARTIFACT_DIR, 'runtime.json')));
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.WU21_ARTIFACT_DIR, 'fixture-manifest.json')));
const integratedHostPath = path.join(process.env.WU21_ARTIFACT_DIR, 'integrated-visual-host.json');
if (!fs.existsSync(integratedHostPath)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: integrated Hello Elementor host manifest is missing.');
const integratedHost = JSON.parse(fs.readFileSync(integratedHostPath));
if (integratedHost.page_template !== 'elementor_canvas' || integratedHost.srwf_host_companion_active !== false) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: invalid integrated visual host identity.');
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const wp = (code) => execFileSync('php', [process.env.WU21_WP_CLI, `--path=${process.env.WU21_WP_PATH}`, 'eval', code], { encoding: 'utf8' }).trim();

// Reuse P06's authentic block fixture rather than creating a parallel surface.
for (const mode of ['shortcode', 'block']) {
  execFileSync('php', [process.env.WU21_WP_CLI, `--path=${process.env.WU21_WP_PATH}`, 'eval-file', path.join(repo, 'tests/repro-evidence-lab/p06-inbox-late-runtime.php')], {
    env: { ...process.env, P06_LATE_SURFACE: mode }, stdio: 'inherit',
  });
}
const p06 = JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"), JSON_UNESCAPED_SLASHES);'));
if (!fixture.frontend_inbox_url || !p06?.authentic_block_page?.url) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: WU21/P06 Inbox fixture URLs are unavailable.');
const hostIdentity = JSON.parse(wp(`$t=wp_get_theme(); $gf=get_file_data(WP_PLUGIN_DIR.'/gravityforms/gravityforms.php',array('v'=>'Version')); $flow=get_file_data(WP_PLUGIN_DIR.'/gravityflow/gravityflow.php',array('v'=>'Version')); global $wpdb; echo wp_json_encode(array('wordpress'=>get_bloginfo('version'),'php'=>PHP_VERSION,'gravity_forms'=>$gf['v'],'gravity_flow'=>$flow['v'],'theme'=>array('template'=>get_option('template'),'stylesheet'=>get_option('stylesheet'),'version'=>$t->get('Version')),'database'=>$wpdb->db_version()));`));
if (hostIdentity.theme.stylesheet !== 'hello-elementor') throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: Hello Elementor is not the active visual host.');

const cookies = JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+900; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: contract.capture.locale, timezoneId: contract.capture.timezone_id, deviceScaleFactor: contract.capture.device_scale_factor, reducedMotion: 'reduce' });
await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
const repositorySha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (contract.mode === 'APPROVED_VISUAL_CONTRACT' && !contract.approved_visual_contract_activated) {
  throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: contract mode cannot run without explicit activation metadata.');
}
const changedFiles = process.env.GPP_CHANGED_FILES ? process.env.GPP_CHANGED_FILES.split('\n').filter(Boolean) : [];
writeJson(path.join(out, 'changed-files.json'), { purpose: 'correlation_only_not_causation', paths: changedFiles });

const selectors = {
  surface: '[data-gpp-inbox-surface="gravity_flow.inbox"]', inner: '.gpp-inbox-surface__inner, .entry-content',
  title: 'h1, .wp-block-post-title', helper: '.gpp-inbox-helper', searchHeader: '.gflow-inbox-search',
  searchInput: '[data-js="gflow-inbox-search"]', gridRoot: '[data-js="gflow-inbox"] .ag-root-wrapper',
  bodyViewport: '[data-js="gflow-inbox"] .ag-body-viewport', centerRows: '[data-js="gflow-inbox"] .ag-center-cols-container',
  firstCard: '.gpp-inbox-card', secondCard: '.gpp-inbox-card:nth-of-type(1)', pagination: '[data-js="gflow-inbox"] .ag-paging-panel',
  rowSummary: '[data-js="gflow-inbox"] .ag-paging-row-summary-panel', manualRefresh: '[data-gpp-inbox-manual-refresh]', photo: '.gpp-inbox-card__photo',
};

async function waitReady(page) {
  await page.waitForSelector(selectors.gridRoot, { timeout: 30000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await page.waitForTimeout(150);
}

export async function diagnostics(page) {
  return page.evaluate((map) => {
    const visible = el => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const details = el => {
      if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,display:s.display,overflow:s.overflow,direction:s.direction,gap:s.gap,padding:s.padding };
    };
    const anchors = { document: details(document.documentElement) };
    for (const [name, selector] of Object.entries(map)) anchors[name] = details(document.querySelector(selector));
    const cards = [...document.querySelectorAll('.gpp-inbox-card')].filter(visible);
    anchors.firstCard = details(cards[0]); anchors.secondCard = details(cards[1]); anchors.lastCard = details(cards.at(-1));
    const first = cards[0]?.getBoundingClientRect(), second = cards[1]?.getBoundingClientRect(), last = cards.at(-1)?.getBoundingClientRect();
    const pager = document.querySelector(map.pagination)?.getBoundingClientRect();
    const surface = document.querySelector(map.surface)?.getBoundingClientRect(), inner = document.querySelector(map.inner)?.getBoundingClientRect();
    const rows = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))];
    const visualHeight = cards.length ? Math.max(...cards.map(c => c.getBoundingClientRect().bottom)) - Math.min(...cards.map(c => c.getBoundingClientRect().top)) : 0;
    const nativeHeight = anchors.bodyViewport?.height ?? 0;
    return { anchors, relationships: {
      surface_to_inner_offset: surface && inner ? inner.left-surface.left : null,
      title_to_search_gap: anchors.title && anchors.searchHeader ? anchors.searchHeader.y-anchors.title.bottom : null,
      search_to_grid_gap: anchors.searchHeader && anchors.gridRoot ? anchors.gridRoot.y-anchors.searchHeader.bottom : null,
      first_card_width: first?.width ?? null,
      two_card_horizontal_gap: first && second && Math.abs(first.top-second.top)<3 ? Math.abs(second.left-first.right) : null,
      last_card_to_pager_gap: last && pager ? pager.top-last.bottom : null,
      visual_card_flow_height: visualHeight,
      native_grid_body_height: nativeHeight,
      visual_vs_native_height_delta: nativeHeight-visualHeight,
      document_horizontal_overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth,
      cards_per_visual_row: cards.length ? Math.max(...rows.map(y => cards.filter(c => Math.abs(c.getBoundingClientRect().top-y)<3).length)) : 0,
      mobile_pager_overlap: Boolean(last && pager && pager.top < last.bottom),
    }};
  }, selectors);
}

export async function styles(page) {
  return page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, selector]) => {
    const el=document.querySelector(selector); if(!el)return [name,null]; const s=getComputedStyle(el);
    return [name,{display:s.display,position:s.position,width:s.width,maxWidth:s.maxWidth,height:s.height,minHeight:s.minHeight,gridTemplateColumns:s.gridTemplateColumns,gap:s.gap,margin:s.margin,padding:s.padding,direction:s.direction,textAlign:s.textAlign,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,background:s.background,border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow,overflow:s.overflow,transform:s.transform}];
  })), selectors);
}

async function dom(page) {
  return page.evaluate(() => ({
    surface_count:document.querySelectorAll('[data-gpp-inbox-surface]').length, grid_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-root-wrapper').length,
    search_input_count:document.querySelectorAll('[data-js="gflow-inbox-search"]').length, pager_count:document.querySelectorAll('.ag-paging-panel').length,
    manual_refresh_count:document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length, visible_card_count:[...document.querySelectorAll('.gpp-inbox-card')].filter(e=>e.getBoundingClientRect().height>0).length,
    card_semantic_elements:{headings:document.querySelectorAll('.gpp-inbox-card h1,.gpp-inbox-card h2,.gpp-inbox-card h3').length,links:document.querySelectorAll('.gpp-inbox-card a').length,images:document.querySelectorAll('.gpp-inbox-card img').length},
    headings:[...document.querySelectorAll('h1,h2,h3')].slice(0,10).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,120),id:e.id||null,aria_labelledby:e.getAttribute('aria-labelledby')})),
    stylesheet_counts:{presentation:[...document.styleSheets].filter(s=>s.href?.includes('srwf-gravity-flow-inbox.css')).length,native:[...document.styleSheets].filter(s=>s.href?.includes('srwf-gravity-flow-inbox-native.css')).length},
  }));
}

const results=[];
try {
  for (const scenario of contract.scenarios) {
    assertDesignMapping(scenario);
    const dir=path.join(out,scenario.id); fs.mkdirSync(dir,{recursive:true});
    const history=[];
    let activeStage='scenario_setup';
    const runStage=async(name,operation)=>{activeStage=name;history.push({stage:name,status:'STARTED'});writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:name,status:'RUNNING',history});try{const value=await operation();history[history.length-1].status='PASS';writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:name,status:'RUNNING',history});return value;}catch(error){history[history.length-1].status='FAIL';history[history.length-1].error={name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)};writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:name,status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',history});throw error;}};
    let page;
    try {
      page=await runStage('page_create',()=>context.newPage()); await runStage('viewport',()=>page.setViewportSize(scenario.viewport));
      const url=scenario.family==='INBOX_AUTHENTIC_BLOCK'?p06.authentic_block_page.url:fixture.frontend_inbox_url;
      await runStage('navigation',()=>page.goto(url,{waitUntil:'networkidle'})); await runStage('inbox_readiness',()=>waitReady(page));
      const hostIntegration=await runStage('host_integration',()=>page.evaluate((surfaceSelector)=>{const surface=document.querySelector(surfaceSelector);const body=document.body;const r=surface?.getBoundingClientRect();const br=body.getBoundingClientRect();return {elementor_canvas:body.classList.contains('elementor-template-canvas'),surface_present:Boolean(surface),surface_within_host:Boolean(r&&r.left>=br.left-1&&r.right<=br.right+1),document_horizontal_overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};},selectors.surface));
      if(!hostIntegration.elementor_canvas||!hostIntegration.surface_present||!hostIntegration.surface_within_host||hostIntegration.document_horizontal_overflow>1) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} failed neutral host integration.`);
      const scenarioState=await runStage('scenario_action',()=>applyScenarioAction(page,scenario.action,selectors));
      const designPage=await runStage('design_authority_page_create',()=>context.newPage());
      await runStage('design_authority_viewport',()=>designPage.setViewportSize(scenario.viewport));
      const designState=await runStage('design_authority_action',()=>prepareDesignAuthority(designPage,scenario,repo));
      await runStage('design_authority_fonts',()=>designPage.evaluate(async()=>{await document.fonts.ready;}));
      await runStage('design_authority_capture',()=>designPage.locator('#inbox-view').screenshot({path:path.join(dir,'design-authority.png'),animations:'disabled'}));
      const designGeometry=await runStage('design_authority_geometry',()=>designFacts(designPage));
      await designPage.close();
      const reference=path.join(dir,'reference.png'),actual=path.join(dir,'actual.png');
      let referenceIdentity='SAME_RUN_STABILITY_CONTROL';
      await runStage('reference_capture',async()=>{if(scenario.reference?.path){const source=path.join(repo,scenario.reference.path);if(!fs.existsSync(source))throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: configured reference missing: ${scenario.reference.path}`);if(contract.mode==='APPROVED_VISUAL_CONTRACT'&&scenario.reference.classification!=='OWNER_APPROVED_GOLDEN')throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} is not backed by an Owner-approved Golden.`);fs.copyFileSync(source,reference);referenceIdentity=scenario.reference.classification;}else{if(contract.mode==='APPROVED_VISUAL_CONTRACT')throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} has no approved Golden.`);await page.screenshot({path:reference,fullPage:true,animations:'disabled'});await page.waitForTimeout(100);}});
      await runStage('actual_capture',()=>page.screenshot({path:actual,fullPage:true,animations:'disabled'}));
      const geometry=await runStage('geometry_capture',()=>diagnostics(page));
      const designDelta=await runStage('design_convergence_compare',async()=>compareDesignFacts(designGeometry,geometry));
      const computed=await runStage('computed_styles_capture',()=>styles(page));
      const summary=await runStage('dom_summary_capture',()=>dom(page));
      const metrics=await runStage('png_compare',()=>comparePng(reference,actual,path.join(dir,'diff.png'),contract.comparator));
      await runStage('diagnostic_write',async()=>{writeJson(path.join(dir,'metrics.json'),{...metrics,reference_identity:'SAME_RUN_CAPTURE_STABILITY_CONTROL',cross_commit_baseline:'NOT_ACTIVATED',design_authority_pixel_comparison:'NOT_PERFORMED_UNLIKE_DOM_AND_CONTENT'});writeJson(path.join(dir,'scenario-state.json'),scenarioState);writeJson(path.join(dir,'design-authority-state.json'),designState);writeJson(path.join(dir,'design-geometry.json'),designGeometry);writeJson(path.join(dir,'design-vs-runtime.json'),designDelta);writeJson(path.join(dir,'host-integration.json'),hostIntegration);writeJson(path.join(dir,'geometry.json'),geometry);writeJson(path.join(dir,'computed-styles.json'),computed);writeJson(path.join(dir,'dom-summary.json'),summary);writeJson(path.join(dir,'environment.json'),{repository_sha:repositorySha,base_reference_identity:'SAME_RUN_CAPTURE_STABILITY_CONTROL',design_authority:{classification:'OWNER_APPROVED_DESIGN_AUTHORITY',approval_status:'OWNER_APPROVED_DESIGN_NOT_RUNTIME_GOLDEN',surface:scenario.design_authority_surface,action:scenario.design_authority_action,sha256:'666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81'},integrated_visual_host:integratedHost,workflow_run_id:process.env.GITHUB_RUN_ID||null,wordpress_version:hostIdentity.wordpress,php_version:hostIdentity.php,gravity_forms:{version:hostIdentity.gravity_forms,package_sha256:process.env.WU21_GF_SHA256||null},gravity_flow:{version:hostIdentity.gravity_flow,package_sha256:process.env.WU21_FLOW_SHA256||null},database_version:hostIdentity.database,theme:hostIdentity.theme,playwright_version:'1.55.0',chromium_version:browser.version(),viewport:scenario.viewport,device_scale_factor:1,capture_scenario:scenario.id,comparator:{name:'pixelmatch',...contract.comparator}});});
      const status=metrics.comparator_result==='PASS'?'PASS':contract.mode==='APPROVED_VISUAL_CONTRACT'?'VISUAL_CONTRACT_FAIL':'VISUAL_REGRESSION_WARNING';
      results.push({id:scenario.id,family:scenario.family,status,matrix:scenario.matrix,design_authority_surface:scenario.design_authority_surface,design_authority_action:scenario.design_authority_action,design_authority_comparison:'EXECUTED_GEOMETRY_STYLE_RELATIONSHIPS',host_integration:'PASS',capture_stability:metrics.comparator_result,screenshot_diff_ratio:metrics.differing_pixel_ratio,scenario_state:scenarioState,summary:{card_count:summary.visible_card_count,cards_per_visual_row:geometry.relationships.cards_per_visual_row,first_card_width:geometry.relationships.first_card_width,pagination_y:geometry.anchors.pagination?.y??null,last_card_to_pager_gap:geometry.relationships.last_card_to_pager_gap,visual_card_flow_height:geometry.relationships.visual_card_flow_height,native_grid_body_height:geometry.relationships.native_grid_body_height,visual_vs_native_height_delta:geometry.relationships.visual_vs_native_height_delta,horizontal_overflow:geometry.relationships.document_horizontal_overflow,mobile_pager_overlap:geometry.relationships.mobile_pager_overlap,semantic_anchor_counts:{surface:summary.surface_count,grid:summary.grid_count,search:summary.search_input_count,pager:summary.pager_count,manual_refresh:summary.manual_refresh_count}},geometry,dom:summary});
      writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:'complete',status:'PASS',history});
    } catch(error) {
      const failure={status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',scenario:scenario.id,failed_stage:activeStage,error:{name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)},completed_scenarios:results.map(result=>result.id),artifact_directory:dir};
      writeJson(path.join(dir,'infrastructure-failure.json'),failure);
      writeJson(path.join(out,'manifest.json'),{mode:contract.mode,status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',repository_sha:repositorySha,baseline_identity:'NO_CROSS_COMMIT_RUNTIME_BASELINE_ADMITTED',scenarios:[...results.map(({geometry,dom,...result})=>result),{id:scenario.id,family:scenario.family,status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',failed_stage:activeStage}],warning_count:results.filter(result=>result.status!=='PASS').length,failure_count:0,infrastructure_failure_count:1,first_meaningful_divergence:null,evidence_ceiling:'Partial diagnostic evidence; capture pipeline did not complete.',infrastructure_failure:failure});
      console.error(`INBOX_VISUAL_DIAGNOSTIC_INFRASTRUCTURE_FAILURE=${JSON.stringify(failure)}`);
      throw error;
    } finally { if(page)await page.close().catch(()=>{}); }
  }
} finally { await browser.close(); }
const largest=results.reduce((a,b)=>a.screenshot_diff_ratio>b.screenshot_diff_ratio?a:b,results[0]);
const manifest={mode:contract.mode,status:results.some(r=>r.status!=='PASS')?'VISUAL_REGRESSION_WARNING':'PASS',repository_sha:repositorySha,baseline_identity:'NO_CROSS_COMMIT_RUNTIME_BASELINE_ADMITTED',scenarios:results.map(({geometry,dom,...r})=>r),warning_count:results.filter(r=>r.status!=='PASS').length,failure_count:0,infrastructure_failure_count:0,largest_visual_delta:largest?{scenario:largest.id,ratio:largest.screenshot_diff_ratio}:null,largest_geometry_delta:null,first_meaningful_divergence:null,first_divergence_note:'Available when a reviewed per-scenario runtime baseline is configured; never inferred by comparing unlike viewports.',evidence_ceiling:'Deterministic WU21 runtime observation; not production equivalence or Owner visual approval.'};
writeJson(path.join(out,'manifest.json'),manifest);
console.log(`INBOX_VISUAL_DIAGNOSTIC_STATUS=${manifest.status}`);
if (contract.mode==='APPROVED_VISUAL_CONTRACT' && results.some(r=>r.status==='VISUAL_CONTRACT_FAIL')) process.exitCode=1;
