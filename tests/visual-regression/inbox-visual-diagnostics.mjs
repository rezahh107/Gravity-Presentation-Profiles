import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { comparePng, writeJson } from './visual-diagnostics-lib.mjs';
import { applyScenarioAction } from './scenario-state.mjs';
import { assertDesignMapping, compareDesignFacts, designFacts, prepareDesignAuthority } from './design-authority-runtime.mjs';
import { assertActionVisualCoverage } from './design-convergence-policy.mjs';
import { primaryFamily, proveVazirFontsLoaded } from './font-runtime-contract.mjs';
import { assertIntegratedHostIdentity } from './host-runtime-contract.mjs';
import { selectComparisonReference } from './reference-selection.mjs';
import { cssPixelNumber, physicalHorizontalGap } from './geometry-relations.mjs';
import { projectScenarioStatus } from './design-convergence-policy.mjs';

const repo = process.env.GITHUB_WORKSPACE || process.cwd();
const out = path.join(process.env.WU21_ARTIFACT_DIR || '/tmp/wu21-artifacts', 'visual-regression-diagnostics');
const contract = JSON.parse(fs.readFileSync(path.join(repo, 'tests/visual-regression/inbox-visual-contract.json')));
const runtime = JSON.parse(fs.readFileSync(path.join(process.env.WU21_ARTIFACT_DIR, 'runtime.json')));
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.WU21_ARTIFACT_DIR, 'fixture-manifest.json')));
const integratedHostPath = path.join(process.env.WU21_ARTIFACT_DIR, 'integrated-visual-host.json');
if (!fs.existsSync(integratedHostPath)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: integrated Hello Elementor host manifest is missing.');
const integratedHost = JSON.parse(fs.readFileSync(integratedHostPath));
assertIntegratedHostIdentity(integratedHost, contract.host_runtime);
if (contract.capture.scope !== 'GPP_INBOX_SURFACE_ONLY' || contract.capture.selector !== '[data-gpp-inbox-surface="gravity_flow.inbox"]') throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: Inbox capture scope contract is invalid.');
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const stagedDesignAuthority = process.env.WU21_DESIGN_AUTHORITY_STAGE;
if (!stagedDesignAuthority || !fs.existsSync(stagedDesignAuthority)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: staged Owner design authority with Vazir aliases is missing.');
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
  rowSummary: '[data-js="gflow-inbox"] .ag-paging-row-summary-panel', pagerPageSummary: '[data-js="gflow-inbox"] .ag-paging-page-summary-panel',
  pagerCurrent: '[data-js="gflow-inbox"] [ref="lbCurrent"]', pagerPrevious: '[data-js="gflow-inbox"] [ref="btPrevious"]', pagerNext: '[data-js="gflow-inbox"] [ref="btNext"]',
  emptyState: '[data-js="gflow-inbox"] .ag-overlay-no-rows-center', manualRefresh: '[data-gpp-inbox-manual-refresh]', photo: '.gpp-inbox-card__photo',
};

async function waitReady(page) {
  await page.waitForSelector(selectors.gridRoot, { timeout: 30000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
  await page.waitForTimeout(150);
}

export async function diagnostics(page) {
  const result = await page.evaluate((map) => {
    const visible = el => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    const details = el => {
      if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return {
        x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,
        display:s.display,overflow:s.overflow,direction:s.direction,gap:s.gap,padding:s.padding,fontSize:s.fontSize,lineHeight:s.lineHeight,fontFamily:s.fontFamily,fontWeight:s.fontWeight,
        color:s.color,backgroundColor:s.backgroundColor,border:s.border,borderColor:s.borderColor,borderRadius:s.borderRadius,boxShadow:s.boxShadow,outline:s.outline,outlineOffset:s.outlineOffset,opacity:s.opacity
      };
    };
    const state=el=>el?(visible(el)?'VISIBLE':'HIDDEN'):'ABSENT';
    const prop=(el,key)=>el?getComputedStyle(el)[key]:'ABSENT';
    const elements=Object.fromEntries(Object.entries(map).map(([name,selector])=>[name,document.querySelector(selector)]));
    const anchors = { document: details(document.documentElement) };
    for (const [name, element] of Object.entries(elements)) anchors[name] = details(element);
    const cards = [...document.querySelectorAll('.gpp-inbox-card')].filter(visible);
    anchors.firstCard = details(cards[0]); anchors.secondCard = details(cards[1]); anchors.lastCard = details(cards.at(-1));
    const first = cards[0]?.getBoundingClientRect(), second = cards[1]?.getBoundingClientRect(), last = cards.at(-1)?.getBoundingClientRect();
    const pager = elements.pagination?.getBoundingClientRect();
    const surfaceElement = elements.surface, surface = surfaceElement?.getBoundingClientRect(), inner = elements.inner?.getBoundingClientRect();
    const rows = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))];
    const visualHeight = cards.length ? Math.max(...cards.map(c => c.getBoundingClientRect().bottom)) - Math.min(...cards.map(c => c.getBoundingClientRect().top)) : 0;
    const nativeHeight = anchors.bodyViewport?.height ?? 0;
    return { anchors, relationships: {
      surface_to_inner_offset: surface && inner ? inner.left-surface.left : null,
      title_to_search_gap: anchors.title && anchors.searchHeader ? anchors.searchHeader.y-anchors.title.bottom : null,
      search_to_grid_gap: anchors.searchHeader && anchors.gridRoot ? anchors.gridRoot.y-anchors.searchHeader.bottom : null,
      first_card_width: first?.width ?? null,
      two_card_horizontal_gap: null,
      last_card_to_pager_gap: last && pager ? pager.top-last.bottom : null,
      visual_card_flow_height: visualHeight,
      native_grid_body_height: nativeHeight,
      visual_vs_native_height_delta: nativeHeight-visualHeight,
      horizontal_overflow: surfaceElement ? Math.max(0, surfaceElement.scrollWidth-surfaceElement.clientWidth) : null,
      cards_per_visual_row: cards.length ? Math.max(...rows.map(y => cards.filter(c => Math.abs(c.getBoundingClientRect().top-y)<3).length)) : 0,
      mobile_pager_overlap: Boolean(last && pager && pager.top < last.bottom),
      title_font_family:anchors.title?.fontFamily??null,
      title_font_weight:anchors.title?.fontWeight??null,
      search_font_family:anchors.searchInput?.fontFamily??null,
      search_font_weight:anchors.searchInput?.fontWeight??null,
      search_query_nonempty:elements.searchInput ? elements.searchInput.value.length>0 : null,
      result_summary_visible:state(elements.rowSummary),
      result_summary_font_size:prop(elements.rowSummary,'fontSize'),
      result_summary_font_weight:prop(elements.rowSummary,'fontWeight'),
      result_summary_color:prop(elements.rowSummary,'color'),
      search_control_border_color:prop(elements.searchInput,'borderColor'),
      search_control_background_color:prop(elements.searchInput,'backgroundColor'),
      empty_state_visible:state(elements.emptyState),
      empty_state_border:prop(elements.emptyState,'border'),
      empty_state_background_color:prop(elements.emptyState,'backgroundColor'),
      empty_state_border_radius:prop(elements.emptyState,'borderRadius'),
      empty_state_padding:prop(elements.emptyState,'padding'),
      empty_title_font_size:prop(elements.emptyState,'fontSize'),
      empty_title_font_weight:prop(elements.emptyState,'fontWeight'),
      empty_body_color:prop(elements.emptyState,'color'),
      pager_current_visible:state(elements.pagerCurrent),
      pager_current_background_color:prop(elements.pagerCurrent,'backgroundColor'),
      pager_current_color:prop(elements.pagerCurrent,'color'),
      pager_current_font_weight:prop(elements.pagerCurrent,'fontWeight'),
      pager_current_border_radius:prop(elements.pagerCurrent,'borderRadius'),
      pager_previous_disabled:elements.pagerPrevious ? Boolean(elements.pagerPrevious.classList.contains('ag-disabled') || elements.pagerPrevious.getAttribute('aria-disabled')==='true') : 'ABSENT',
      pager_next_disabled:elements.pagerNext ? Boolean(elements.pagerNext.classList.contains('ag-disabled') || elements.pagerNext.getAttribute('aria-disabled')==='true') : 'ABSENT',
      pager_previous_opacity:prop(elements.pagerPrevious,'opacity'),
      pager_next_opacity:prop(elements.pagerNext,'opacity'),
      pager_gap:prop(elements.pagerPageSummary,'gap'),
      search_focus_outline:prop(elements.searchInput,'outline'),
      search_focus_outline_offset:prop(elements.searchInput,'outlineOffset'),
      search_focus_border_color:prop(elements.searchInput,'borderColor'),
      search_focus_box_shadow:prop(elements.searchInput,'boxShadow'),
      search_focus_height:anchors.searchInput?.height!=null ? `${anchors.searchInput.height}px` : 'ABSENT',
    }};
  }, selectors);
  result.relationships.two_card_horizontal_gap = physicalHorizontalGap(result.anchors.firstCard, result.anchors.secondCard);
  result.relationships.title_font_size_px = cssPixelNumber(result.anchors.title?.fontSize);
  result.relationships.title_line_height_px = cssPixelNumber(result.anchors.title?.lineHeight);
  result.relationships.first_card_border_radius_px = cssPixelNumber(result.anchors.firstCard?.borderRadius);
  result.relationships.first_card_padding = result.anchors.firstCard?.padding ?? null;
  result.relationships.first_card_box_shadow = result.anchors.firstCard?.boxShadow ?? null;
  result.relationships.title_font_family_primary = primaryFamily(result.relationships.title_font_family);
  result.relationships.search_font_family_primary = primaryFamily(result.relationships.search_font_family);
  delete result.relationships.title_font_family;
  delete result.relationships.search_font_family;
  return result;
}

export async function styles(page) {
  return page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, selector]) => {
    const el=document.querySelector(selector); if(!el)return [name,null]; const s=getComputedStyle(el);
    return [name,{display:s.display,position:s.position,width:s.width,maxWidth:s.maxWidth,height:s.height,minHeight:s.minHeight,gridTemplateColumns:s.gridTemplateColumns,gap:s.gap,margin:s.margin,padding:s.padding,direction:s.direction,textAlign:s.textAlign,fontSize:s.fontSize,fontFamily:s.fontFamily,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,background:s.background,backgroundColor:s.backgroundColor,border:s.border,borderColor:s.borderColor,borderRadius:s.borderRadius,boxShadow:s.boxShadow,outline:s.outline,outlineOffset:s.outlineOffset,opacity:s.opacity,overflow:s.overflow,transform:s.transform}];
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
    assertDesignMapping(scenario, contract.design_comparison_policy);
    assertActionVisualCoverage(contract.design_comparison_policy, scenario);
    const dir=path.join(out,scenario.id); fs.mkdirSync(dir,{recursive:true});
    const history=[];
    let activeStage='scenario_setup';
    const runStage=async(name,operation)=>{activeStage=name;history.push({stage:name,status:'STARTED'});writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:name,status:'RUNNING',history});try{const value=await operation();history[history.length-1].status='PASS';writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:name,status:'RUNNING',history});return value;}catch(error){history[history.length-1].status='FAIL';history[history.length-1].error={name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)};writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:name,status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',history});throw error;}};
    let page;
    try {
      page=await runStage('page_create',()=>context.newPage()); await runStage('viewport',()=>page.setViewportSize(scenario.viewport));
      const url=scenario.family==='INBOX_AUTHENTIC_BLOCK'?p06.authentic_block_page.url:fixture.frontend_inbox_url;
      await runStage('navigation',()=>page.goto(url,{waitUntil:'networkidle'})); await runStage('inbox_readiness',()=>waitReady(page));
      const hostIntegration=await runStage('host_integration',async()=>{const fixtureIdentity=integratedHost.host_fixture;const evidence=await page.evaluate(({surfaceSelector,containerId,mountId})=>{const surface=document.querySelector(surfaceSelector);const mount=surface?.closest(`.elementor-element-${mountId}.elementor-widget-shortcode`);const host=mount?.closest(`.elementor-element-${containerId}.elementor-element[data-element_type="container"]`);return {elementor_page_marker:document.body.classList.contains('elementor-page'),elementor_container_present:Boolean(host),fixture_mount_present:Boolean(mount),surface_present:Boolean(surface),surface_dom_nested_in_fixture_mount:Boolean(mount&&surface&&mount.contains(surface)),surface_dom_nested_in_elementor_container:Boolean(host&&surface&&host.contains(surface)),fixture_container_element_id:containerId,fixture_mount_element_id:mountId,surface_horizontal_overflow:surface?Math.max(0,surface.scrollWidth-surface.clientWidth):null};},{surfaceSelector:selectors.surface,containerId:fixtureIdentity.container_element_id,mountId:fixtureIdentity.mount_element_id});writeJson(path.join(dir,'host-integration.json'),evidence);if(!evidence.elementor_container_present||!evidence.fixture_mount_present||!evidence.surface_present||!evidence.surface_dom_nested_in_fixture_mount||!evidence.surface_dom_nested_in_elementor_container)throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: ${scenario.id} failed designated versioned Elementor fixture mount integration.`);return evidence;});
      const scenarioState=await runStage('scenario_action',()=>applyScenarioAction(page,scenario.action,selectors));
      const runtimeFontEvidence=await runStage('runtime_vazir_font_proof',()=>proveVazirFontsLoaded(page,contract.host_runtime.vazir_font,{title:selectors.title,search:selectors.searchInput},'runtime'));
      const designPage=await runStage('design_authority_page_create',()=>context.newPage());
      await runStage('design_authority_viewport',()=>designPage.setViewportSize(scenario.viewport));
      const designState=await runStage('design_authority_action',()=>prepareDesignAuthority(designPage,scenario,repo,stagedDesignAuthority));
      await runStage('design_authority_fonts',()=>designPage.evaluate(async()=>{await document.fonts.ready;}));
      const designFontEvidence=await runStage('design_authority_vazir_font_proof',()=>proveVazirFontsLoaded(designPage,contract.host_runtime.vazir_font,{title:'#inbox-view h1',search:'#case-search'},'design_authority'));
      await runStage('design_authority_capture',()=>designPage.locator('#inbox-view').screenshot({path:path.join(dir,'design-authority.png'),animations:'disabled'}));
      const designGeometry=await runStage('design_authority_geometry',()=>designFacts(designPage));
      await designPage.close();
      const reference=path.join(dir,'reference.png'),actual=path.join(dir,'actual.png');
      const referenceSelection=selectComparisonReference(contract,scenario);
      const runtimeSurface=page.locator(contract.capture.selector);
      await runStage('reference_capture',async()=>{if(referenceSelection.path){const source=path.join(repo,referenceSelection.path);if(!fs.existsSync(source))throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: configured reference missing: ${referenceSelection.path}`);fs.copyFileSync(source,reference);}else{await runtimeSurface.screenshot({path:reference,animations:'disabled'});await page.waitForTimeout(100);}});
      await runStage('actual_capture',()=>runtimeSurface.screenshot({path:actual,animations:'disabled'}));
      const geometry=await runStage('geometry_capture',()=>diagnostics(page));
      const designDelta=await runStage('design_convergence_compare',async()=>compareDesignFacts(designGeometry,geometry,contract.design_comparison_policy,scenario.design_relations));
      const computed=await runStage('computed_styles_capture',()=>styles(page));
      const summary=await runStage('dom_summary_capture',()=>dom(page));
      const metrics=await runStage('png_compare',()=>comparePng(reference,actual,path.join(dir,'diff.png'),contract.comparator));
      await runStage('diagnostic_write',async()=>{writeJson(path.join(dir,'metrics.json'),{...metrics,reference_identity:referenceSelection.identity,capture_scope:contract.capture.scope,cross_commit_baseline:'NOT_ACTIVATED',design_authority_pixel_comparison:'NOT_PERFORMED_UNLIKE_DOM_AND_CONTENT'});writeJson(path.join(dir,'scenario-state.json'),scenarioState);writeJson(path.join(dir,'design-authority-state.json'),designState);writeJson(path.join(dir,'design-geometry.json'),designGeometry);writeJson(path.join(dir,'design-vs-runtime.json'),designDelta);writeJson(path.join(dir,'host-integration.json'),hostIntegration);writeJson(path.join(dir,'geometry.json'),geometry);writeJson(path.join(dir,'computed-styles.json'),computed);writeJson(path.join(dir,'dom-summary.json'),summary);writeJson(path.join(dir,'environment.json'),{repository_sha:repositorySha,base_reference_identity:referenceSelection.identity,capture_scope:contract.capture.scope,capture_selector:contract.capture.selector,design_authority:{classification:'OWNER_APPROVED_DESIGN_AUTHORITY',approval_status:'OWNER_APPROVED_DESIGN_NOT_RUNTIME_GOLDEN',surface:scenario.design_authority_surface,action:scenario.design_authority_action,sha256:'666704ac25b019ae59406974a223d10cace3f90e96f9d55312730ae93af09c81'},font_authority:integratedHost.vazir_font,font_load_evidence:{runtime:runtimeFontEvidence,design_authority:designFontEvidence},integrated_visual_host:integratedHost,workflow_run_id:process.env.GITHUB_RUN_ID||null,wordpress_version:hostIdentity.wordpress,php_version:hostIdentity.php,gravity_forms:{version:hostIdentity.gravity_forms,package_sha256:process.env.WU21_GF_SHA256||null},gravity_flow:{version:hostIdentity.gravity_flow,package_sha256:process.env.WU21_FLOW_SHA256||null},database_version:hostIdentity.database,theme:hostIdentity.theme,playwright_version:'1.55.0',chromium_version:browser.version(),viewport:scenario.viewport,device_scale_factor:1,capture_scenario:scenario.id,comparator:{name:'pixelmatch',...contract.comparator}});});
      const status=await runStage('status_projection',async()=>projectScenarioStatus({captureStability:metrics.comparator_result,designComparison:designDelta.evaluation,mode:contract.mode}));
      results.push({id:scenario.id,family:scenario.family,status,matrix:scenario.matrix,reference_identity:referenceSelection.identity,design_authority_surface:scenario.design_authority_surface,design_authority_action:scenario.design_authority_action,design_authority_comparison:'EXECUTED_GEOMETRY_STYLE_RELATIONSHIPS',design_comparison_policy_version:designDelta.policy_version,design_comparison_status:designDelta.evaluation.status,design_warning_count:designDelta.evaluation.warning_count,design_relation_results:designDelta.evaluation.relations,host_integration:'PASS',capture_stability:metrics.comparator_result,screenshot_diff_ratio:metrics.differing_pixel_ratio,scenario_state:scenarioState,summary:{card_count:summary.visible_card_count,cards_per_visual_row:geometry.relationships.cards_per_visual_row,first_card_width:geometry.relationships.first_card_width,pagination_y:geometry.anchors.pagination?.y??null,last_card_to_pager_gap:geometry.relationships.last_card_to_pager_gap,visual_card_flow_height:geometry.relationships.visual_card_flow_height,native_grid_body_height:geometry.relationships.native_grid_body_height,visual_vs_native_height_delta:geometry.relationships.visual_vs_native_height_delta,horizontal_overflow:geometry.relationships.horizontal_overflow,mobile_pager_overlap:geometry.relationships.mobile_pager_overlap,semantic_anchor_counts:{surface:summary.surface_count,grid:summary.grid_count,search:summary.search_input_count,pager:summary.pager_count,manual_refresh:summary.manual_refresh_count}},geometry,dom:summary});
      writeJson(path.join(dir,'capture-state.json'),{scenario:scenario.id,active_stage:'complete',status:'PASS',history});
    } catch(error) {
      const failure={status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',scenario:scenario.id,failed_stage:activeStage,error:{name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)},completed_scenarios:results.map(result=>result.id),artifact_directory:dir};
      writeJson(path.join(dir,'infrastructure-failure.json'),failure);
      writeJson(path.join(out,'manifest.json'),{mode:contract.mode,status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',repository_sha:repositorySha,baseline_identity:'NO_CROSS_COMMIT_RUNTIME_BASELINE_ADMITTED',scenarios:[...results.map(({geometry,dom,...result})=>result),{id:scenario.id,family:scenario.family,status:'VISUAL_TEST_INFRASTRUCTURE_FAILURE',failed_stage:activeStage}],warning_count:results.filter(result=>result.status==='VISUAL_REGRESSION_WARNING').length,failure_count:results.filter(result=>result.status==='VISUAL_CONTRACT_FAIL').length,infrastructure_failure_count:1,first_meaningful_divergence:null,evidence_ceiling:'Partial diagnostic evidence; capture pipeline did not complete.',infrastructure_failure:failure});
      console.error(`INBOX_VISUAL_DIAGNOSTIC_INFRASTRUCTURE_FAILURE=${JSON.stringify(failure)}`);
      throw error;
    } finally { if(page)await page.close().catch(()=>{}); }
  }
} finally { await browser.close(); }
const largest=results.reduce((a,b)=>a.screenshot_diff_ratio>b.screenshot_diff_ratio?a:b,results[0]);
const designWarnings=results.flatMap(result=>Object.entries(result.design_relation_results||{}).filter(([,evidence])=>evidence.classification==='WARNING').map(([relation,evidence])=>({scenario:result.id,relation,...evidence})));
const numericDesignWarnings=designWarnings.filter(item=>Number.isFinite(item.delta)).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
const largestGeometry=numericDesignWarnings[0]||null;
const firstDesignWarning=designWarnings[0]||null;
const warningCount=results.filter(result=>result.status==='VISUAL_REGRESSION_WARNING').length;
const failureCount=results.filter(result=>result.status==='VISUAL_CONTRACT_FAIL').length;
const manifestStatus=failureCount?'VISUAL_CONTRACT_FAIL':warningCount?'VISUAL_REGRESSION_WARNING':'PASS';
const manifest={mode:contract.mode,status:manifestStatus,repository_sha:repositorySha,baseline_identity:'NO_CROSS_COMMIT_RUNTIME_BASELINE_ADMITTED',scenarios:results.map(({geometry,dom,...r})=>r),warning_count:warningCount,design_relation_warning_count:designWarnings.length,failure_count:failureCount,infrastructure_failure_count:0,largest_visual_delta:largest?{scenario:largest.id,ratio:largest.screenshot_diff_ratio}:null,largest_geometry_delta:largestGeometry?{scenario:largestGeometry.scenario,relation:largestGeometry.relation,design:largestGeometry.design,runtime:largestGeometry.runtime,delta:largestGeometry.delta,tolerance:largestGeometry.tolerance}:null,first_meaningful_divergence:firstDesignWarning?{scenario:firstDesignWarning.scenario,relation:firstDesignWarning.relation,design:firstDesignWarning.design,runtime:firstDesignWarning.runtime,delta:firstDesignWarning.delta,tolerance:firstDesignWarning.tolerance,classification:firstDesignWarning.classification}:null,first_divergence_note:firstDesignWarning?'First relation-level divergence outside the versioned design-comparison policy.':'No required relation exceeded the versioned design-comparison policy.',evidence_ceiling:'Deterministic WU21 runtime observation; not production equivalence or Owner visual approval.'};
writeJson(path.join(out,'manifest.json'),manifest);
console.log(`INBOX_VISUAL_DIAGNOSTIC_STATUS=${manifest.status}`);
if (contract.mode==='APPROVED_VISUAL_CONTRACT' && results.some(r=>r.status==='VISUAL_CONTRACT_FAIL')) process.exitCode=1;
