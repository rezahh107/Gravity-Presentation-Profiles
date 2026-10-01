import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {
  artifactDir,
  inboxUrl,
  assertEnv,
  login,
  waitForGrid,
  pagerState,
  focusInfo,
  focusVisible,
  nativeSearch,
} from './inbox-visual-design-v2-browser-lib.mjs';
import { ensureNativePagerPage } from './inbox-native-pager-state.mjs';

assertEnv();

const ROOT = '[data-js="gflow-inbox"]';
const PAGER = `${ROOT} .ag-paging-panel`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let failed = false;
let out = {
  contract: 'V030_NATIVE_INBOX_PAGER_PRESENTATION_REGRESSION',
  execution_status: 'CAPTURED',
  evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function transparentBackground(color) {
  const normalized = String(color || '').replace(/\s+/g, '').toLowerCase();
  return normalized === 'transparent'
    || /^rgba\([^,]+,[^,]+,[^,]+,0(?:\.0+)?\)$/.test(normalized)
    || /^color\(.+\/0(?:\.0+)?\)$/.test(normalized);
}

function noBoxShadow(shadow) {
  return !shadow || shadow === 'none';
}

function hierarchyFacts(deemphasized, emphasized) {
  const deemphasizedBackgroundTransparent = transparentBackground(deemphasized.background_color);
  const deemphasizedBoxShadowNone = noBoxShadow(deemphasized.box_shadow);
  const emphasizedBackgroundTransparent = transparentBackground(emphasized.background_color);
  const emphasizedBoxShadowNone = noBoxShadow(emphasized.box_shadow);
  return {
    deemphasized_background_transparent: deemphasizedBackgroundTransparent,
    deemphasized_box_shadow_none: deemphasizedBoxShadowNone,
    emphasized_retains_paint: !emphasizedBackgroundTransparent || !emphasizedBoxShadowNone,
    presentation_classes_differ: deemphasized.background_color !== emphasized.background_color
      || deemphasized.box_shadow !== emphasized.box_shadow
      || deemphasized.color !== emphasized.color,
    deemphasized: {
      background_color: deemphasized.background_color,
      box_shadow: deemphasized.box_shadow,
      color: deemphasized.color,
    },
    emphasized: {
      background_color: emphasized.background_color,
      box_shadow: emphasized.box_shadow,
      color: emphasized.color,
    },
  };
}

function assertHierarchy(deemphasized, emphasized, label) {
  const facts = hierarchyFacts(deemphasized, emphasized);
  assert(facts.deemphasized_background_transparent, `${label}: First/Last background is not secondary: ${JSON.stringify(facts)}`);
  assert(facts.deemphasized_box_shadow_none, `${label}: First/Last box shadow is not secondary: ${JSON.stringify(facts)}`);
  assert(facts.emphasized_retains_paint, `${label}: Previous/Next lost emphasized paint: ${JSON.stringify(facts)}`);
  assert(facts.presentation_classes_differ, `${label}: First/Last is paint-equivalent to Previous/Next: ${JSON.stringify(facts)}`);
  return facts;
}

async function nativeFacts() {
  return page.locator(PAGER).first().evaluate(panel => {
    const describe = el => {
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        class_name: typeof el.className === 'string' ? el.className : '',
        ref: el.getAttribute('ref'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        aria_label: el.getAttribute('aria-label'),
        aria_hidden: el.getAttribute('aria-hidden'),
        tabindex: el.getAttribute('tabindex'),
        ag_disabled: el.classList.contains('ag-disabled'),
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        direction: style.direction,
        color: style.color,
        background_color: style.backgroundColor,
        box_shadow: style.boxShadow,
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    };

    const rowSummary = panel.querySelector('.ag-paging-row-summary-panel');
    const pageSummary = panel.querySelector('.ag-paging-page-summary-panel');
    const grid = panel.closest('.ag-root-wrapper');
    const controls = Object.fromEntries(
      ['btFirst', 'btPrevious', 'btNext', 'btLast']
        .map(ref => [ref, describe(panel.querySelector(`[ref="${ref}"]`))]),
    );

    return {
      pager_count: document.querySelectorAll('[data-js="gflow-inbox"] .ag-paging-panel').length,
      custom_pager_count: document.querySelectorAll('[data-gpp-pagination], .gpp-pagination, .gpp-pager').length,
      direct_children: [...panel.children].map(describe),
      row_summary: describe(rowSummary),
      page_summary: describe(pageSummary),
      controls,
      current: (panel.querySelector('[ref="lbCurrent"]')?.textContent || '').trim(),
      total: (panel.querySelector('[ref="lbTotal"]')?.textContent || '').trim(),
      grid: grid ? {
        direction: getComputedStyle(grid).direction,
        ag_ltr: grid.classList.contains('ag-ltr'),
        ag_rtl: grid.classList.contains('ag-rtl'),
      } : null,
      document_horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });
}

function assertNativeOwnership(facts) {
  assert(facts.pager_count === 1, `Expected exactly one native pager, got ${facts.pager_count}.`);
  assert(facts.custom_pager_count === 0, `Unexpected GPP pager/state marker count: ${facts.custom_pager_count}.`);
  assert(facts.direct_children.length === 2, `Expected native row/page summary siblings, got ${facts.direct_children.length}.`);
  assert(facts.direct_children[0].class_name.includes('ag-paging-row-summary-panel'), 'Native row-summary DOM order changed.');
  assert(facts.direct_children[1].class_name.includes('ag-paging-page-summary-panel'), 'Native page-summary DOM order changed.');
  assert(facts.grid?.ag_ltr === true && facts.grid?.ag_rtl === false && facts.grid?.direction === 'ltr', `GPP must not take over AG Grid RTL state: ${JSON.stringify(facts.grid)}`);
}

function assertPresentation(facts) {
  assert(facts.row_summary?.aria_hidden === 'true', `Pinned host row-range accessibility state changed: ${JSON.stringify(facts.row_summary)}`);
  assert(facts.row_summary?.opacity === '0', `Already aria-hidden row-range summary is visually competing with page summary: ${JSON.stringify(facts.row_summary)}`);
  assert(facts.row_summary?.display !== 'none' && facts.row_summary?.visibility !== 'hidden', 'Row-range DOM/allocation must remain native.');
  assert(Boolean(facts.row_summary?.text), 'Native row-range text must remain host-generated in the DOM.');
  assert(facts.page_summary?.opacity !== '0' && facts.page_summary?.display !== 'none' && facts.page_summary?.visibility !== 'hidden', 'Native page summary must remain visible/readable.');
}

function assertControls(facts) {
  for (const [ref, control] of Object.entries(facts.controls)) {
    assert(control?.tag === 'div', `Pinned native ${ref} control tag changed: ${JSON.stringify(control)}.`);
    assert(control.tabindex === '0', `Pinned native ${ref} lost keyboard focusability.`);
    assert(Boolean(control.aria_label), `Pinned native ${ref} lost host aria-label.`);
    assert(control.display !== 'none' && control.visibility !== 'hidden', `Pinned native ${ref} became unavailable.`);
  }
}

async function containment() {
  return page.locator(PAGER).first().evaluate(panel => {
    const p = panel.getBoundingClientRect();
    const children = [...panel.children].map(el => {
      const r = el.getBoundingClientRect();
      return {
        class_name: el.className,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        contained: r.left >= p.left - 0.5 && r.right <= p.right + 0.5 && r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5,
      };
    });
    return {
      children,
      all_children_contained: children.every(item => item.contained),
      document_horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });
}

async function removeRuleContaining(needles) {
  return page.evaluate(required => {
    for (const [sheetIndex, sheet] of [...document.styleSheets].entries()) {
      let rules;
      try {
        rules = [...sheet.cssRules];
      } catch {
        continue;
      }
      const ruleIndex = rules.findIndex(rule => typeof rule.selectorText === 'string'
        && required.every(needle => rule.selectorText.includes(needle)));
      if (ruleIndex === -1) continue;
      const rule = rules[ruleIndex];
      const removed = {
        sheet_index: sheetIndex,
        rule_index: ruleIndex,
        selector: rule.selectorText,
        css_text: rule.cssText,
        href: sheet.href,
      };
      sheet.deleteRule(ruleIndex);
      return removed;
    }
    throw new Error(`Required presentation rule was not found: ${required.join(' + ')}`);
  }, needles);
}

async function restoreRule(removed) {
  await page.evaluate(({ sheetIndex, ruleIndex, cssText }) => {
    const sheet = document.styleSheets[sheetIndex];
    if (!sheet) throw new Error(`Cannot restore stylesheet index ${sheetIndex}.`);
    sheet.insertRule(cssText, Math.min(ruleIndex, sheet.cssRules.length));
  }, { sheetIndex: removed.sheet_index, ruleIndex: removed.rule_index, cssText: removed.css_text });
}

async function proveRowSummaryPredicateDiscriminates() {
  const removed = await removeRuleContaining(['.ag-paging-row-summary-panel[aria-hidden="true"]']);
  let failure = null;
  let mutated;
  try {
    mutated = await nativeFacts();
    try {
      assertPresentation(mutated);
    } catch (error) {
      failure = String(error?.message || error);
    }
    assert(Boolean(failure), `Removing row-summary suppression did not falsify the presentation predicate: ${JSON.stringify(mutated.row_summary)}`);
  } finally {
    await restoreRule(removed);
  }
  const restored = await nativeFacts();
  assertPresentation(restored);
  return {
    method: 'TEMPORARY_BROWSER_CSSOM_RULE_REMOVAL',
    selector: removed.selector,
    predicate_failed_when_rule_removed: true,
    failure_message: failure,
    mutated_row_summary: mutated.row_summary,
    restored_row_summary: restored.row_summary,
  };
}

async function proveHierarchyPredicateDiscriminates() {
  const removed = await removeRuleContaining(['[ref="btFirst"]', '[ref="btLast"]']);
  let failure = null;
  let mutated;
  try {
    mutated = await nativeFacts();
    try {
      assertHierarchy(mutated.controls.btLast, mutated.controls.btNext, 'Negative control Last vs Next');
    } catch (error) {
      failure = String(error?.message || error);
    }
    assert(Boolean(failure), `Removing First/Last hierarchy did not falsify its predicate: ${JSON.stringify(hierarchyFacts(mutated.controls.btLast, mutated.controls.btNext))}`);
  } finally {
    await restoreRule(removed);
  }
  const restored = await nativeFacts();
  const restoredHierarchy = assertHierarchy(restored.controls.btLast, restored.controls.btNext, 'Restored Last vs Next');
  return {
    method: 'TEMPORARY_BROWSER_CSSOM_RULE_REMOVAL',
    selector: removed.selector,
    predicate_failed_when_rule_removed: true,
    failure_message: failure,
    mutated_hierarchy: hierarchyFacts(mutated.controls.btLast, mutated.controls.btNext),
    restored_hierarchy: restoredHierarchy,
  };
}

async function assertViewport(width, height, label) {
  await page.setViewportSize({ width, height });
  await ensureNativePagerPage(page, pagerState, 1);
  const facts = await nativeFacts();
  const fit = await containment();
  assertNativeOwnership(facts);
  assertPresentation(facts);
  assertControls(facts);
  assert(fit.all_children_contained, `${label}: native pager child clipping: ${JSON.stringify(fit)}`);
  assert(fit.document_horizontal_overflow_px === 0, `${label}: document horizontal overflow: ${JSON.stringify(fit)}`);
  return { facts, containment: fit };
}

try {
  await login(page);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);

  await ensureNativePagerPage(page, pagerState, 1);
  const page1 = await nativeFacts();
  assertNativeOwnership(page1);
  assertPresentation(page1);
  assertControls(page1);
  assert(page1.current === '1' && Number(page1.total) >= 2, `Multi-page precondition failed: ${JSON.stringify({ current: page1.current, total: page1.total })}`);
  assert(page1.controls.btFirst.ag_disabled && page1.controls.btPrevious.ag_disabled, 'First/Previous must be host-disabled on Page 1.');
  assert(!page1.controls.btNext.ag_disabled && !page1.controls.btLast.ag_disabled, 'Next/Last must be host-enabled on Page 1.');
  const page1Hierarchy = assertHierarchy(page1.controls.btLast, page1.controls.btNext, 'Page 1 Last vs Next');

  const rowSummaryNegativeControl = await proveRowSummaryPredicateDiscriminates();
  const hierarchyNegativeControl = await proveHierarchyPredicateDiscriminates();

  const last = page.locator(`${ROOT} [ref="btLast"]`);
  const lastFocus = await focusInfo(last);
  assert(focusVisible(lastFocus), `Enabled Last focus indicator is not visible: ${JSON.stringify(lastFocus)}`);

  await page.locator(`${ROOT} [ref="btPrevious"]`).focus();
  await page.keyboard.press('Tab');
  const tabTarget = await page.evaluate(() => document.activeElement?.getAttribute('ref') || null);
  assert(tabTarget === 'btNext', `Tab did not reach native Next from disabled Previous: ${tabTarget}.`);
  const next = page.locator(`${ROOT} [ref="btNext"]`);
  const nextFocus = await focusInfo(next);
  assert(focusVisible(nextFocus), `Native Next focus indicator is not visible: ${JSON.stringify(nextFocus)}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2');

  const lastPage = await nativeFacts();
  assertNativeOwnership(lastPage);
  assertPresentation(lastPage);
  assert(lastPage.controls.btNext.ag_disabled && lastPage.controls.btLast.ag_disabled, 'Next/Last must be host-disabled on the last page.');
  assert(!lastPage.controls.btFirst.ag_disabled && !lastPage.controls.btPrevious.ag_disabled, 'First/Previous must be host-enabled on the last page.');
  const lastPageHierarchy = assertHierarchy(lastPage.controls.btFirst, lastPage.controls.btPrevious, 'Last page First vs Previous');
  const first = page.locator(`${ROOT} [ref="btFirst"]`);
  const firstFocus = await focusInfo(first);
  assert(focusVisible(firstFocus), `Enabled First focus indicator is not visible: ${JSON.stringify(firstFocus)}`);

  const previous = page.locator(`${ROOT} [ref="btPrevious"]`);
  const previousFocus = await focusInfo(previous);
  assert(focusVisible(previousFocus), `Native Previous focus indicator is not visible: ${JSON.stringify(previousFocus)}`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1');
  const roundTrip = await pagerState(page);
  assert(roundTrip.current === '1', `Native Page 1 -> Page 2 -> Page 1 round-trip failed: ${JSON.stringify(roundTrip)}`);

  const mobile390 = await assertViewport(390, 844, '390px');
  const mobile320 = await assertViewport(320, 720, '320px');

  await nativeSearch(page, 'WU21 Alpha Form');
  await page.waitForFunction(() => {
    const count = document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length;
    return count > 0 && count < 20;
  });
  const singlePage = await nativeFacts();
  const singleFit = await containment();
  assertNativeOwnership(singlePage);
  assertPresentation(singlePage);
  assert(singlePage.current === '1' && singlePage.total === '1', `Filtered single-page pager is incoherent: ${JSON.stringify({ current: singlePage.current, total: singlePage.total })}`);
  assert(Object.values(singlePage.controls).every(control => control.ag_disabled), 'All native navigation controls must be disabled in single-page state.');
  assert(singleFit.all_children_contained && singleFit.document_horizontal_overflow_px === 0, `Single-page pager containment failed: ${JSON.stringify(singleFit)}`);

  await nativeSearch(page, '');
  await page.waitForFunction(() => Number(document.querySelector('[data-js="gflow-inbox"] [ref="lbTotal"]')?.textContent?.trim() || 0) >= 2);
  const searchCleared = await nativeFacts();
  assertNativeOwnership(searchCleared);
  assertPresentation(searchCleared);
  assert(Number(searchCleared.total) >= 2, `Clearing Search did not restore multi-page native state: ${JSON.stringify(searchCleared)}`);

  const q4 = JSON.parse(fs.readFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q4.json'), 'utf8'));
  const liveRefresh = {
    status: q4.status,
    page_state_remains_two: q4.flags?.page_state_remains_two,
    one_native_pager: q4.flags?.one_native_pager,
    update_observed: q4.flags?.update_observed,
    add_observed: q4.flags?.add_observed,
    remove_observed: q4.flags?.remove_observed,
    no_document_overflow: q4.flags?.no_document_overflow,
    mobile_native_pager_round_trip: q4.flags?.mobile_native_pager_round_trip,
    native_open_after_poll: q4.flags?.native_open_after_poll,
  };
  assert(liveRefresh.status === 'PASS'
    && liveRefresh.page_state_remains_two === true
    && liveRefresh.one_native_pager === true
    && liveRefresh.update_observed === true
    && liveRefresh.add_observed === true
    && liveRefresh.remove_observed === true
    && liveRefresh.no_document_overflow === true
    && liveRefresh.mobile_native_pager_round_trip === true
    && liveRefresh.native_open_after_poll === true,
  `Existing Q4 Live Refresh/navigation evidence is insufficient: ${JSON.stringify(liveRefresh)}`);

  out = {
    ...out,
    result: 'NATIVE_PAGER_PRESENTATION_REGRESSION_CLOSED',
    desktop_page_1: page1,
    desktop_last_page: lastPage,
    hierarchy: {
      page_1_last_vs_next: page1Hierarchy,
      last_page_first_vs_previous: lastPageHierarchy,
    },
    negative_controls: {
      row_summary: rowSummaryNegativeControl,
      first_last_hierarchy: hierarchyNegativeControl,
    },
    keyboard: {
      tab_target: tabTarget,
      next_focus_visible: focusVisible(nextFocus),
      previous_focus_visible: focusVisible(previousFocus),
      enabled_last_focus_visible: focusVisible(lastFocus),
      enabled_first_focus_visible: focusVisible(firstFocus),
    },
    page_round_trip: { page_1_to_2_via_enter: true, page_2_to_1_via_space: true, final: roundTrip },
    mobile_390: mobile390,
    mobile_320: mobile320,
    single_page_search: { facts: singlePage, containment: singleFit },
    after_search_clear: searchCleared,
    live_refresh_reused: liveRefresh,
  };
} catch (error) {
  failed = true;
  out = {
    ...out,
    execution_status: 'ERROR',
    result: 'NATIVE_PAGER_PRESENTATION_REGRESSION_OPEN',
    error: String(error?.stack || error).slice(0, 12000),
  };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-native-pager-presentation-regression-error.png'), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-native-pager-presentation-regression.json'), JSON.stringify(out, null, 2) + '\n');
  await browser.close();
}

if (failed) process.exit(1);
console.log('NATIVE_PAGER_PRESENTATION_REGRESSION_CLOSED');
