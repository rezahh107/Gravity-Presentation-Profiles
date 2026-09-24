import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cssPixelNumber, physicalHorizontalGap } from './geometry-relations.mjs';
import { evaluateDesignConvergence } from './design-convergence-policy.mjs';

export const DESIGN_SURFACES = Object.freeze({
  'inbox-desktop': { label: 'A', device: 'desktop' },
  'inbox-mobile': { label: 'B', device: 'mobile' },
});

export const DESIGN_ACTIONS = new Set(['default', 'search-result', 'search-empty', 'pagination-next', 'focus-search']);

export function assertDesignMapping(scenario) {
  const surface = DESIGN_SURFACES[scenario.design_authority_surface];
  if (!surface) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: unknown Inbox design-authority surface for ${scenario.id}.`);
  if (!DESIGN_ACTIONS.has(scenario.design_authority_action)) throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: unavailable design-authority action for ${scenario.id}.`);
  if ((scenario.id.includes('mobile') || scenario.id.includes('focus')) !== (surface.device === 'mobile')) {
    throw new Error(`VISUAL_TEST_INFRASTRUCTURE_FAILURE: scenario ${scenario.id} is mapped to the wrong reviewed A/B surface.`);
  }
  return surface;
}

export async function prepareDesignAuthority(page, scenario, repositoryRoot) {
  const surface = assertDesignMapping(scenario);
  const source = path.join(repositoryRoot, 'tests/fixtures/owner-visual/PersianGravity-Visual-Reference-Final.html');
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
    const visible = element => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().height > 0;
    const fact = element => { if (!element) return null; const r=element.getBoundingClientRect(),s=getComputedStyle(element); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,padding:s.padding,gap:s.gap,direction:s.direction,fontSize:s.fontSize,lineHeight:s.lineHeight,border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow}; };
    const cards=[...document.querySelectorAll('#case-grid .case-card')].filter(visible);
    const surfaceElement=document.querySelector('#inbox-view'), surface=fact(surfaceElement), first=fact(cards[0]), second=fact(cards[1]), last=fact(cards.at(-1)), pager=fact(document.querySelector('#pagination'));
    const rows=[...new Set(cards.map(card=>Math.round(card.getBoundingClientRect().top)))];
    return { anchors:{surface,title:fact(document.querySelector('#inbox-view h1')),helper:fact(document.querySelector('#inbox-view .page-heading p')),search:fact(document.querySelector('#case-search')),firstCard:first,secondCard:second,lastCard:last,pagination:pager,photo:fact(document.querySelector('#case-grid .avatar'))}, relationships:{first_card_width:first?.width??null,two_card_horizontal_gap:null,last_card_to_pager_gap:last&&pager?pager.y-last.bottom:null,cards_per_visual_row:cards.length?Math.max(...rows.map(y=>cards.filter(card=>Math.abs(card.getBoundingClientRect().top-y)<3).length)):0,horizontal_overflow:surfaceElement?Math.max(0,surfaceElement.scrollWidth-surfaceElement.clientWidth):null}};
  });
  result.relationships.two_card_horizontal_gap = physicalHorizontalGap(result.anchors.firstCard, result.anchors.secondCard);
  result.relationships.title_font_size_px = cssPixelNumber(result.anchors.title?.fontSize);
  result.relationships.title_line_height_px = cssPixelNumber(result.anchors.title?.lineHeight);
  result.relationships.first_card_border_radius_px = cssPixelNumber(result.anchors.firstCard?.borderRadius);
  result.relationships.first_card_padding = result.anchors.firstCard?.padding ?? null;
  result.relationships.first_card_box_shadow = result.anchors.firstCard?.boxShadow ?? null;
  return result;
}

export function compareDesignFacts(design, runtime, policy, requiredRelations) {
  const fields=Object.keys(policy?.relations||{});
  const deltas=Object.fromEntries(fields.map(field=>[field,{design:design.relationships[field]??null,runtime:runtime.relationships[field]??null,delta:Number.isFinite(design.relationships[field])&&Number.isFinite(runtime.relationships[field])?runtime.relationships[field]-design.relationships[field]:null}]));
  const evaluation=evaluateDesignConvergence(deltas,policy,requiredRelations);
  return { comparison:'GEOMETRY_STYLE_RELATIONSHIPS_NOT_CONTENT_EQUALITY', policy_version:policy.schema_version, required_relations:[...requiredRelations], deltas, evaluation };
}
