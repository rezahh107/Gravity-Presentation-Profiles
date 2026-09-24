import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cssPixelNumber, physicalHorizontalGap } from './geometry-relations.mjs';
import { assertActionVisualCoverage, evaluateDesignConvergence } from './design-convergence-policy.mjs';
import { primaryFamily } from './font-runtime-contract.mjs';

export const DESIGN_SURFACES = Object.freeze({
  'inbox-desktop': { label: 'A', device: 'desktop' },
  'inbox-mobile': { label: 'B', device: 'mobile' },
});

export const DESIGN_ACTIONS = new Set(['default', 'search-result', 'search-empty', 'pagination-next', 'focus-search']);

export function assertDesignMapping(scenario, policy = null) {
  const surface = DESIGN_SURFACES[scenario.design_authority_surface];
  if (!surface) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: unknown Inbox design-authority surface for ${scenario.id}.`);
  if (!DESIGN_ACTIONS.has(scenario.design_authority_action)) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: unavailable design-authority action for ${scenario.id}.`);
  if ((scenario.id.includes('mobile') || scenario.id.includes('focus')) !== (surface.device === 'mobile')) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: scenario ${scenario.id} is mapped to the wrong reviewed A/B surface.`);
  }
  if (policy) assertActionVisualCoverage(policy, scenario);
  return surface;
}

export async function prepareDesignAuthority(page, scenario, repositoryRoot, stagedSource = null) {
  const surface = assertDesignMapping(scenario);
  const source = stagedSource || path.join(repositoryRoot, 'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html');
  if (!fs.existsSync(source)) throw new Error('VISUAL_TEST_INFRASTRUCTURE_FAILURE: Owner-approved design authority is missing.');
  await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
  await page.locator(`[data-surface="${scenario.design_authority_surface}"]`).click();
  await page.waitForFunction(name => document.querySelector(`[data-surface="${name}"]`)?.getAttribute('aria-pressed') === 'true', scenario.design_authority_surface);
  const search = page.locator('#case-search');
  if (scenario.design_authority_action === 'search-result') await search.fill('علی');
  if (scenario.design_authority_action === 'search-empty') await search.fill('__gpp_no_result__');
  if (scenario.design_authority_action === 'pagination-next') await page.locator('#next-page').click();
  if (scenario.design_authority_action === 'focus-search') await search.focus();
  const state = await page.evaluate(({ expectedSurface, action }) => {
    const visible = element => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().height > 0;
    const cards = [...document.querySelectorAll('#case-grid .case-card')].filter(visible);
    return {
      surface: expectedSurface,
      action,
      inbox_visible: visible(document.querySelector('#inbox-view')),
      visible_cards: cards.length,
      empty_visible: visible(document.querySelector('#empty-state')),
      current_page: document.querySelector('#pagination [aria-current="page"]')?.dataset.page ?? null,
      search_owns_focus: document.activeElement?.id === 'case-search',
    };
  }, { expectedSurface: scenario.design_authority_surface, action: scenario.design_authority_action });
  if (!state.inbox_visible || (scenario.design_authority_action === 'search-result' && state.visible_cards < 1) ||
      (scenario.design_authority_action === 'search-empty' && (state.visible_cards !== 0 || !state.empty_visible)) ||
      (scenario.design_authority_action === 'pagination-next' && state.current_page !== '2') ||
      (scenario.design_authority_action === 'focus-search' && !state.search_owns_focus)) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: design-authority action did not reach its requested state for ${scenario.id}.`);
  }
  return { ...state, surface_label: surface.label };
}

export async function designFacts(page) {
  const result = await page.evaluate(() => {
    const visible = element => element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
    const fact = element => {
      if (!element) return null;
      const r=element.getBoundingClientRect(),s=getComputedStyle(element);
      return {
        x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,padding:s.padding,gap:s.gap,direction:s.direction,
        fontSize:s.fontSize,lineHeight:s.lineHeight,fontFamily:s.fontFamily,fontWeight:s.fontWeight,color:s.color,
        backgroundColor:s.backgroundColor,border:s.border,borderColor:s.borderColor,borderRadius:s.borderRadius,boxShadow:s.boxShadow,
        outline:s.outline,outlineOffset:s.outlineOffset,opacity:s.opacity,
      };
    };
    const state=value=>value? (visible(value)?'VISIBLE':'HIDDEN') : 'ABSENT';
    const prop=(value,key)=>value ? getComputedStyle(value)[key] : 'ABSENT';
    const cards=[...document.querySelectorAll('#case-grid .case-card')].filter(visible);
    const surfaceElement=document.querySelector('#inbox-view');
    const titleElement=document.querySelector('#inbox-view h1');
    const searchElement=document.querySelector('#case-search');
    const resultSummary=document.querySelector('#result-count');
    const empty=document.querySelector('#empty-state');
    const emptyTitle=empty?.querySelector('h2') || null;
    const emptyBody=empty?.querySelector('p') || null;
    const pager=document.querySelector('#pagination');
    const pagerCurrent=pager?.querySelector('[aria-current="page"]') || null;
    const pagerPrevious=document.querySelector('#prev-page');
    const pagerNext=document.querySelector('#next-page');
    const surface=fact(surfaceElement), first=fact(cards[0]), second=fact(cards[1]), last=fact(cards.at(-1)), pagerFact=fact(pager), title=fact(titleElement), search=fact(searchElement);
    const rows=[...new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top)))];
    return {
      anchors:{surface,title,helper:fact(document.querySelector('#inbox-view .page-heading p')),search,firstCard:first,secondCard:second,lastCard:last,pagination:pagerFact,photo:fact(document.querySelector('#case-grid .avatar')),resultSummary:fact(resultSummary),emptyState:fact(empty),emptyTitle:fact(emptyTitle),emptyBody:fact(emptyBody),pagerCurrent:fact(pagerCurrent),pagerPrevious:fact(pagerPrevious),pagerNext:fact(pagerNext)},
      relationships:{
        first_card_width:first?.width??null,
        two_card_horizontal_gap:null,
        last_card_to_pager_gap:last&&pagerFact?pagerFact.y-last.bottom:null,
        cards_per_visual_row:cards.length?Math.max(...rows.map(y=>cards.filter(card=>Math.abs(card.getBoundingClientRect().top-y)<3).length)):0,
        horizontal_overflow:surfaceElement?Math.max(0,surfaceElement.scrollWidth-surfaceElement.clientWidth):null,
        title_font_family:title?.fontFamily??null,
        title_font_weight:title?.fontWeight??null,
        search_font_family:search?.fontFamily??null,
        search_font_weight:search?.fontWeight??null,
        search_query_nonempty:searchElement ? searchElement.value.length>0 : null,
        result_summary_visible:state(resultSummary),
        result_summary_font_size:prop(resultSummary,'fontSize'),
        result_summary_font_weight:prop(resultSummary,'fontWeight'),
        result_summary_color:prop(resultSummary,'color'),
        search_control_border_color:prop(searchElement,'borderColor'),
        search_control_background_color:prop(searchElement,'backgroundColor'),
        empty_state_visible:state(empty),
        empty_state_border:prop(empty,'border'),
        empty_state_background_color:prop(empty,'backgroundColor'),
        empty_state_border_radius:prop(empty,'borderRadius'),
        empty_state_padding:prop(empty,'padding'),
        empty_title_font_size:prop(emptyTitle,'fontSize'),
        empty_title_font_weight:prop(emptyTitle,'fontWeight'),
        empty_body_color:prop(emptyBody,'color'),
        pager_current_visible:state(pagerCurrent),
        pager_current_background_color:prop(pagerCurrent,'backgroundColor'),
        pager_current_color:prop(pagerCurrent,'color'),
        pager_current_font_weight:prop(pagerCurrent,'fontWeight'),
        pager_current_border_radius:prop(pagerCurrent,'borderRadius'),
        pager_previous_disabled:pagerPrevious ? Boolean(pagerPrevious.disabled) : 'ABSENT',
        pager_next_disabled:pagerNext ? Boolean(pagerNext.disabled) : 'ABSENT',
        pager_previous_opacity:prop(pagerPrevious,'opacity'),
        pager_next_opacity:prop(pagerNext,'opacity'),
        pager_gap:prop(pager,'gap'),
        search_focus_outline:prop(searchElement,'outline'),
        search_focus_outline_offset:prop(searchElement,'outlineOffset'),
        search_focus_border_color:prop(searchElement,'borderColor'),
        search_focus_box_shadow:prop(searchElement,'boxShadow'),
        search_focus_height:search?.height!=null ? `${search.height}px` : 'ABSENT',
      }
    };
  });
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

export function compareDesignFacts(design, runtime, policy, requiredRelations) {
  const fields=Object.keys(policy?.relations||{});
  const deltas=Object.fromEntries(fields.map(field=>[field,{design:design.relationships[field]??null,runtime:runtime.relationships[field]??null,delta:Number.isFinite(design.relationships[field])&&Number.isFinite(runtime.relationships[field])?runtime.relationships[field]-design.relationships[field]:null}]));
  const evaluation=evaluateDesignConvergence(deltas,policy,requiredRelations);
  return { comparison:'GEOMETRY_STYLE_RELATIONSHIPS_NOT_CONTENT_EQUALITY', policy_version:policy.schema_version, required_relations:[...requiredRelations], deltas, evaluation };
}
