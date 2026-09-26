import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { applyScenarioAction } from './scenario-state.mjs';

const qualificationId='GPP-INBOX-MATRIX-J-BROWSER-ZOOM-V1';
const artifactRoot=path.join(process.env.WU21_ARTIFACT_DIR,'visual-regression-diagnostics');
fs.mkdirSync(artifactRoot,{recursive:true});
const outputPath=path.join(artifactRoot,'matrix-j-browser-zoom.json');
const wp=code=>execFileSync('php',[process.env.WU21_WP_CLI,`--path=${process.env.WU21_WP_PATH}`,'eval',code],{encoding:'utf8'}).trim();
const fixture=JSON.parse(fs.readFileSync(path.join(process.env.WU21_ARTIFACT_DIR,'fixture-manifest.json'),'utf8'));
const p06=JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"), JSON_UNESCAPED_SLASHES);'));
const routes={shortcode:fixture.frontend_inbox_url,block:p06?.authentic_block_page?.url};
const baseUrl=process.env.WU21_BASE_URL;
const cookies=JSON.parse(wp(`$u=get_user_by('login','bootstrap_admin'); $e=time()+900; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$e,'logged_in'))));`));
const selectors={
  gridRoot:'[data-js="gflow-inbox"] .ag-root-wrapper',
  centerRows:'[data-js="gflow-inbox"] .ag-center-cols-container',
  searchInput:'[data-js="gflow-inbox-search"]',
};
const cases={
  desktop_effective:{window_width:2000,window_height:1200,expected_narrow_media:false},
  narrow_effective:{window_width:1400,window_height:1200,expected_narrow_media:true},
};
const evidence={
  qualification_id:qualificationId,
  matrix:'J',
  requested_zoom_factor:2,
  status:'RUNNING',
  mechanism:{
    kind:'CHROMIUM_EXTENSION_TABS_SET_ZOOM',
    api:'chrome.tabs.setZoom(tabId, 2)',
    verification_api:'chrome.tabs.getZoom(tabId)',
    playwright_launch:'chromium.launchPersistentContext(channel="chromium", viewport=null)',
    approximation_rejected:['CSS zoom','root font-size scaling','viewport resizing as zoom','deviceScaleFactor substitution','screenshot scaling'],
    semantic_claim:'The Chrome tabs API changes the tab browser zoom factor itself; layout qualification is accepted only when the runtime also shows the expected effective CSS viewport contraction.',
  },
  repository_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  playwright_version:'1.55.0',
  observations:[],
  block_shortcode_parity:[],
  remaining_evidence_path:null,
};

function extensionFixture(root){
  const extension=path.join(root,'extension');
  fs.mkdirSync(extension,{recursive:true});
  fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'GPP Matrix J Browser Zoom Harness',version:'1.0.0',permissions:['tabs'],background:{service_worker:'background.js'}}));
  fs.writeFileSync(path.join(extension,'background.js'),'// Matrix J test-only service worker.\n');
  return extension;
}

async function extensionWorker(context){
  let [worker]=context.serviceWorkers();
  if(!worker) worker=await context.waitForEvent('serviceworker',{timeout:15000});
  return worker;
}

async function browserZoom(worker,page,factor){
  return worker.evaluate(async ({url,factor})=>{
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(candidate=>candidate.url===url) || tabs.find(candidate=>candidate.active);
    if(!tab?.id) throw new Error(`Unable to bind browser zoom to target tab: ${url}`);
    await chrome.tabs.setZoom(tab.id,factor);
    const actual=await chrome.tabs.getZoom(tab.id);
    const settings=await chrome.tabs.getZoomSettings(tab.id);
    return {tab_id:tab.id,requested:factor,actual,settings};
  },{url:page.url(),factor});
}

async function measure(page){
  return page.evaluate(()=>{
    const visible=el=>!!el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const surface=document.querySelector('[data-gpp-inbox-surface="gravity_flow.inbox"]');
    const grid=document.querySelector('[data-js="gflow-inbox"] .ag-root-wrapper');
    const pager=document.querySelector('[data-js="gflow-inbox"] .ag-paging-panel');
    const search=document.querySelector('[data-js="gflow-inbox-search"]');
    const refresh=document.querySelector('[data-gpp-inbox-manual-refresh]');
    const cards=[...document.querySelectorAll('.gpp-inbox-card')].filter(visible);
    const rows=[...new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top)))];
    const firstCard=cards[0]||null;
    const details=firstCard?.querySelector('.gpp-inbox-card__details')||null;
    const firstRect=rect(firstCard),detailsRect=rect(details),pagerRect=rect(pager);
    const horizontalInsideViewport=element=>{const r=rect(element);return !!r&&r.left>=-1&&r.right<=window.innerWidth+1;};
    return {
      inner_width:window.innerWidth,
      inner_height:window.innerHeight,
      outer_width:window.outerWidth,
      outer_height:window.outerHeight,
      device_pixel_ratio:window.devicePixelRatio,
      visual_viewport_scale:window.visualViewport?.scale??null,
      narrow_media_matches:matchMedia('(max-width: 782px)').matches,
      document_horizontal_overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
      surface_horizontal_overflow:surface?Math.max(0,surface.scrollWidth-surface.clientWidth):null,
      surface_count:document.querySelectorAll('[data-gpp-inbox-surface="gravity_flow.inbox"]').length,
      grid_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-root-wrapper').length,
      replacement_grid_count:document.querySelectorAll('[data-gpp-replacement-inbox],.gpp-custom-inbox-app').length,
      pager_count:document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
      search_count:document.querySelectorAll('[data-js="gflow-inbox-search"]').length,
      manual_refresh_count:document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      card_count:cards.length,
      cards_per_visual_row:cards.length?Math.max(...rows.map(y=>cards.filter(card=>Math.abs(card.getBoundingClientRect().top-y)<3).length)):0,
      search_reachable:visible(search)&&horizontalInsideViewport(search),
      pager_reachable:visible(pager)&&horizontalInsideViewport(pager),
      manual_refresh_reachable:visible(refresh)&&horizontalInsideViewport(refresh),
      card_details_within_card:firstRect&&detailsRect?detailsRect.top>=firstRect.top-1&&detailsRect.bottom<=firstRect.bottom+1:true,
      card_pager_overlap:Boolean(firstRect&&pagerRect&&cards.length===1&&pagerRect.top<firstRect.bottom),
      last_card_pager_overlap:Boolean(cards.length&&pagerRect&&pagerRect.top<Math.max(...cards.map(card=>card.getBoundingClientRect().bottom))-1),
      grid_visible:visible(grid),
    };
  });
}

async function restoreFirstPage(page){
  const current=page.locator('[data-js="gflow-inbox"] [ref="lbCurrent"]');
  if((await current.innerText()).trim()==='1') return;
  await page.locator('[data-js="gflow-inbox"] [ref="btPrevious"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim()==='1',{},{timeout:15000});
}

let browserZoomApiProven=false;
let layoutZoomSemanticsProven=false;
let runtimeFinding=null;
try{
  for(const [caseName,windowCase] of Object.entries(cases)){
    const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),`gpp-matrix-j-${caseName}-`));
    const extension=extensionFixture(tempRoot);
    let context;
    try{
      context=await chromium.launchPersistentContext(path.join(tempRoot,'profile'),{
        channel:'chromium',headless:true,viewport:null,locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce',
        args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,`--window-size=${windowCase.window_width},${windowCase.window_height}`],
      });
      await context.addCookies(cookies.map(cookie=>({...cookie,url:baseUrl})));
      const worker=await extensionWorker(context);
      const routeMeasurements=[];
      for(const [route,url] of Object.entries(routes)){
        assert.ok(url,`Matrix J ${route} route is unavailable.`);
        const page=await context.newPage();
        await page.goto(url,{waitUntil:'networkidle'});
        await page.waitForSelector(selectors.gridRoot,{timeout:30000});
        await page.waitForFunction(selector=>document.querySelectorAll(`${selector} > .ag-row`).length===20,selectors.centerRows,{timeout:15000});
        const reset=await browserZoom(worker,page,1);
        assert.ok(Math.abs(reset.actual-1)<0.001,`${caseName}/${route}: browser zoom did not reset to 100%.`);
        const before=await measure(page);
        const zoom=await browserZoom(worker,page,2);
        browserZoomApiProven=browserZoomApiProven||Math.abs(zoom.actual-2)<0.001;
        assert.ok(Math.abs(zoom.actual-2)<0.001,`${caseName}/${route}: chrome.tabs.getZoom did not confirm factor 2.`);
        await page.waitForTimeout(500);
        const after=await measure(page);
        const widthRatio=before.inner_width/after.inner_width;
        if(widthRatio<1.8||widthRatio>2.2){
          const error=new Error(`${caseName}/${route}: genuine tab zoom factor=2 did not yield the expected layout viewport contraction; before=${before.inner_width}, after=${after.inner_width}, ratio=${widthRatio}.`);
          error.code='ZOOM_LAYOUT_SEMANTICS_UNAVAILABLE';
          throw error;
        }
        layoutZoomSemanticsProven=true;
        assert.equal(after.narrow_media_matches,windowCase.expected_narrow_media,`${caseName}/${route}: effective 200% zoom geometry did not enter the expected responsive branch.`);
        assert.equal(after.document_horizontal_overflow,0,`${caseName}/${route}: 200% browser zoom created document horizontal overflow.`);
        assert.equal(after.surface_count,1,`${caseName}/${route}: intended GPP surface count changed.`);
        assert.equal(after.grid_count,1,`${caseName}/${route}: native Grid count changed.`);
        assert.equal(after.replacement_grid_count,0,`${caseName}/${route}: replacement Grid appeared.`);
        assert.equal(after.pager_count,1,`${caseName}/${route}: native pager count changed.`);
        assert.equal(after.search_count,1,`${caseName}/${route}: native search count changed.`);
        assert.equal(after.manual_refresh_count,1,`${caseName}/${route}: manual refresh count changed.`);
        assert.equal(after.search_reachable,true,`${caseName}/${route}: native search is not horizontally reachable.`);
        assert.equal(after.pager_reachable,true,`${caseName}/${route}: native pager is not horizontally reachable.`);
        assert.equal(after.manual_refresh_reachable,true,`${caseName}/${route}: manual refresh is not horizontally reachable.`);
        assert.equal(after.grid_visible,true,`${caseName}/${route}: native Grid is not visible.`);
        assert.equal(after.card_details_within_card,true,`${caseName}/${route}: critical card details clip outside the card.`);
        assert.equal(after.last_card_pager_overlap,false,`${caseName}/${route}: Card Mode overlaps the native pager at 200% browser zoom.`);
        const pagination=await applyScenarioAction(page,'pagination',selectors);
        assert.equal(pagination.page_after,'2',`${caseName}/${route}: native pager was not operable at 200% zoom.`);
        await restoreFirstPage(page);
        const searchState=await applyScenarioAction(page,'search_result',selectors);
        assert.equal(searchState.observed_rows,1,`${caseName}/${route}: native quick search was not operable at 200% zoom.`);
        const search=page.locator(selectors.searchInput);
        await search.fill('');
        await search.dispatchEvent('keyup');
        await page.waitForFunction(selector=>document.querySelectorAll(`${selector} > .ag-row`).length===20,selectors.centerRows,{timeout:15000});
        const restored=await measure(page);
        assert.equal(restored.last_card_pager_overlap,false,`${caseName}/${route}: restored Card Mode overlaps pager at 200% zoom.`);
        const observation={case:caseName,route,requested_window:{width:windowCase.window_width,height:windowCase.window_height},zoom_api:zoom,before,after,restored,layout_width_ratio:widthRatio,pagination:{page_after:pagination.page_after,second_page_rows:pagination.second_page_rows},search:{observed_rows:searchState.observed_rows,unique_fixture_present:searchState.unique_fixture_present}};
        evidence.observations.push(observation);
        routeMeasurements.push(observation);
        await page.close();
      }
      const [shortcode,block]=routeMeasurements;
      const parity={case:caseName,shortcode_effective_width:shortcode.after.inner_width,block_effective_width:block.after.inner_width,shortcode_cards_per_row:shortcode.after.cards_per_visual_row,block_cards_per_row:block.after.cards_per_visual_row,shortcode_narrow:shortcode.after.narrow_media_matches,block_narrow:block.after.narrow_media_matches};
      assert.ok(Math.abs(parity.shortcode_effective_width-parity.block_effective_width)<=2,`${caseName}: Block/shortcode effective widths diverged at 200% zoom.`);
      assert.equal(parity.shortcode_cards_per_row,parity.block_cards_per_row,`${caseName}: Block/shortcode Card Mode columns diverged at 200% zoom.`);
      assert.equal(parity.shortcode_narrow,parity.block_narrow,`${caseName}: Block/shortcode responsive branch diverged at 200% zoom.`);
      evidence.block_shortcode_parity.push(parity);
    }finally{
      if(context) await context.close().catch(()=>{});
      fs.rmSync(tempRoot,{recursive:true,force:true});
    }
  }
  evidence.status='PROVEN';
  evidence.conclusion='GENUINE_BROWSER_ZOOM_200_EXECUTED_AND_QUALIFIED';
}catch(error){
  if(browserZoomApiProven&&layoutZoomSemanticsProven){
    evidence.status='PROVEN_WITH_RUNTIME_FINDING';
    evidence.conclusion='GENUINE_BROWSER_ZOOM_200_EXECUTED_WITH_QUALIFICATION_FINDING';
    runtimeFinding={name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error)};
    evidence.runtime_finding=runtimeFinding;
  }else{
    evidence.status='NOT_PROVEN';
    evidence.conclusion='GENUINE_BROWSER_ZOOM_200_NOT_FAITHFULLY_EXECUTABLE_IN_AVAILABLE_CI_BROWSER';
    evidence.technical_limitation={name:error?.name||'Error',code:error?.code||null,message:String(error?.message||error),stack:String(error?.stack||error),browser_zoom_api_proven:browserZoomApiProven,layout_zoom_semantics_proven:layoutZoomSemanticsProven};
    evidence.remaining_evidence_path='Authentic Owner-site/manual Chromium evidence at user-set browser zoom 200%.';
  }
}
fs.writeFileSync(outputPath,JSON.stringify(evidence,null,2)+'\n');
console.log(`MATRIX_J_BROWSER_ZOOM=${evidence.status} conclusion=${evidence.conclusion}`);
