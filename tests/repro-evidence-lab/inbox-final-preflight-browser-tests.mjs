// QUALIFICATION ONLY — do not merge. Observations are not final acceptance.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const artifactDir = process.env.WU21_ARTIFACT_DIR;
const baseUrl = process.env.WU21_BASE_URL || 'http://127.0.0.1:8080';
const wp = code => execFileSync('php', [process.env.WU21_WP_CLI, `--path=${process.env.WU21_WP_PATH}`, 'eval', code], { encoding: 'utf8', env: process.env });
const manifest = JSON.parse(wp('echo wp_json_encode(get_option("gpp_wu21_fixture_manifest"));'));
const p06 = JSON.parse(wp('echo wp_json_encode(get_option("gpp_p06_fixture_manifest"));'));
if (!manifest?.frontend_inbox_url || !p06?.authentic_block_page?.url) throw new Error('Existing authentic fixtures unavailable.');
const browser = await chromium.launch({ headless: true });
const output = {
  qualification_only: true,
  repository_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  browser: browser.version(),
  final_acceptance: 'AWAITING_WU06',
  true_browser_zoom_200: 'NOT_PROVEN',
  observations: [],
};

async function contextFor(login) {
  const cookies = JSON.parse(wp(`$u=get_user_by('login', '${login}'); if(!$u) throw new RuntimeException('Missing synthetic user'); $expiration=time()+900; echo wp_json_encode(array(array('name'=>AUTH_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$expiration,'auth')),array('name'=>LOGGED_IN_COOKIE,'value'=>wp_generate_auth_cookie($u->ID,$expiration,'logged_in'))));`));
  const context = await browser.newContext();
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseUrl })));
  return context;
}

async function snapshot(page, label) {
  const facts = await page.evaluate(() => {
    const rect = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right,
        clientWidth:el.clientWidth, scrollWidth:el.scrollWidth, clientHeight:el.clientHeight, scrollHeight:el.scrollHeight,
        display:s.display, direction:s.direction, overflowX:s.overflowX, overflowY:s.overflowY, gap:s.gap,
        padding:s.padding, fontSize:s.fontSize, borderRadius:s.borderRadius, inlineStyle:el.getAttribute('style') };
    };
    const q = s => document.querySelector(s);
    const cards = [...document.querySelectorAll('.ag-center-cols-container .gpp-inbox-card')];
    const visibleCards = cards.filter(c => c.getBoundingClientRect().height > 0);
    const pager = q('.ag-paging-panel');
    const bottom = Math.max(0, ...visibleCards.map(c=>c.getBoundingClientRect().bottom));
    const search = q('[data-js="gflow-inbox-search"]');
    return {
      viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
      document:{width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,rootFont:getComputedStyle(document.documentElement).fontSize},
      surface:rect(q('.gpp-inbox-surface')),inner:rect(q('.gpp-inbox-surface__inner')),
      title:rect(q('.gpp-inbox-surface__title')),helper:rect(q('.gpp-inbox-surface__helper')),
      header:rect(q('.gflow-grid__header')),search:rect(search),
      searchLabels:search ? [...(search.labels||[])].map(x=>x.textContent):[],
      searchAriaLabel:search?.getAttribute('aria-label'),
      grid:rect(q('.ag-root-wrapper')),bodyViewport:rect(q('.ag-body-viewport')),center:rect(q('.ag-center-cols-container')),
      cards:visibleCards.map(rect),cardCount:visibleCards.length,
      rows:document.querySelectorAll('.ag-center-cols-container > .ag-row').length,
      pager:rect(pager),summary:rect(q('.ag-paging-row-summary-panel')),summaryText:q('.ag-paging-row-summary-panel')?.textContent,
      gapAfterCards:visibleCards.length && pager ? pager.getBoundingClientRect().y-bottom:null,
      empty:q('.ag-overlay-no-rows-center')?.textContent || null,
      visibleText:document.body.innerText.slice(0,12000),
      manual:rect(q('[data-gpp-inbox-manual-refresh]')),manualCount:document.querySelectorAll('[data-gpp-inbox-manual-refresh]').length,
      controls:[...document.querySelectorAll('.gflow-grid__button,.ag-paging-button')].map(el=>({name:el.getAttribute('aria-label')||el.getAttribute('title'),...rect(el)})),
      photos:[...document.querySelectorAll('.gpp-inbox-card__photo-image')].map(el=>({complete:el.complete,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,...rect(el)})),
      fallbacks:document.querySelectorAll('.gpp-inbox-card__photo-fallback').length,
      overflowElements:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left< -2);}).slice(0,30).map(el=>({tag:el.tagName,class:el.className,...rect(el)})),
    };
  });
  output.observations.push({label,...facts});
  await page.screenshot({ path:path.join(artifactDir,`pr4-preflight-${label}.png`),fullPage:true });
  return facts;
}

async function load(page,url,width=1366,height=1000) {
  await page.setViewportSize({width,height});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForSelector('[data-js="gflow-inbox"] .ag-root-wrapper',{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);
}

try {
  const context=await contextFor('bootstrap_admin'); const page=await context.newPage();
  for(const [name,url] of [['shortcode',manifest.frontend_inbox_url],['block',p06.authentic_block_page.url]]) {
    await load(page,url); await snapshot(page,`${name}-desktop`);
    // Browser-only style differential; never modifies installed files or host state.
    await page.evaluate(()=>{for(const link of document.querySelectorAll('link[rel="stylesheet"]')) if(/\/assets\/css\/srwf-gravity-flow-inbox(?:-native)?\.css/.test(link.href)) link.disabled=true;});
    await snapshot(page,`${name}-desktop-styles-disabled`);
    await load(page,url,390,844); await snapshot(page,`${name}-mobile`);
    const search=page.locator('[data-js="gflow-inbox-search"]');
    await search.fill('PREFLIGHT_NO_MATCH_781339');
    await page.waitForFunction(()=>document.querySelectorAll('.ag-center-cols-container > .ag-row').length===0);
    await snapshot(page,`${name}-no-result-mobile`);
    await search.fill('');
    await page.waitForFunction(()=>document.querySelectorAll('.ag-center-cols-container > .ag-row').length>0);
    await snapshot(page,`${name}-search-cleared-mobile`);
    await load(page,url);
    await search.fill('PREFLIGHT_NO_MATCH_781339');
    await page.waitForFunction(()=>document.querySelectorAll('.ag-center-cols-container > .ag-row').length===0);
    await snapshot(page,`${name}-no-result-desktop`);
    await load(page,url,683,500); await snapshot(page,`${name}-half-viewport-reflow-NOT-browser-zoom`);
    await load(page,url,414,896);
    await page.addStyleTag({content:'html {font-size:200% !important;}'});
    await snapshot(page,`${name}-root-text-200-NOT-browser-zoom`);
  }
  // Authentic no-assignment user; no synthetic empty markup or direct grid mutation.
  wp(`$id=wp_create_user('wu21_preflight_empty',wp_generate_password(32),'wu21-preflight-empty@example.invalid'); if(is_wp_error($id)) { $u=get_user_by('login','wu21_preflight_empty'); if(!$u) throw new RuntimeException('Empty user creation failed'); }`);
  const emptyContext=await contextFor('wu21_preflight_empty'); const emptyPage=await emptyContext.newPage();
  for(const [name,url] of [['shortcode',manifest.frontend_inbox_url],['block',p06.authentic_block_page.url]]) {
    // A genuinely empty host may omit AG Grid entirely. Preserve that output.
    for(const [size,width,height] of [['desktop',1366,1000],['mobile',390,844]]) {
      await emptyPage.setViewportSize({width,height});
      await emptyPage.goto(url,{waitUntil:'networkidle'});
      await snapshot(emptyPage,`${name}-no-tasks-${size}`);
    }
  }
  output.capture_status='COMPLETE';
} catch(error) {
  output.capture_status='BLOCKED'; output.error=String(error.stack||error); throw error;
} finally {
  fs.writeFileSync(path.join(artifactDir,'pr4-final-preflight.json'),JSON.stringify(output,null,2));
  await browser.close();
}
