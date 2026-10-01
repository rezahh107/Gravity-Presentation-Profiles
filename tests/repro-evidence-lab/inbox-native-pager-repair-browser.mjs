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
  contract: 'NATIVE_INBOX_PAGER_PRESENTATION_REPAIR',
  execution_status: 'CAPTURED',
  evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function nativeFacts() {
  return page.locator(PAGER).first().evaluate(panel => {
    const describe = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        class_name: el.className,
        ref: el.getAttribute('ref'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        aria_label: el.getAttribute('aria-label'),
        aria_disabled: el.getAttribute('aria-disabled'),
        aria_hidden: el.getAttribute('aria-hidden'),
        tabindex: el.getAttribute('tabindex'),
        ag_disabled: el.classList.contains('ag-disabled'),
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        direction: style.direction,
        font_weight: style.fontWeight,
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
      ['btFirst', 'btPrevious', 'btNext', 'btLast'].map(ref => [ref, describe(panel.querySelector(`[ref="${ref}"]`))]),
    );

    return {
      pager_count: document.querySelectorAll(`${ROOT} .ag-paging-panel`).length,
      custom_pager_count: document.querySelectorAll('[data-gpp-pagination], .gpp-pagination, .gpp-pager').length,
      panel: describe(panel),
      direct_children: [...panel.children].map(describe),
      row_summary: describe(rowSummary),
      page_summary: describe(pageSummary),
      controls,
      current: (panel.querySelector('[ref="lbCurrent"]')?.textContent || '').trim(),
      total: (panel.querySelector('[ref="lbTotal"]')?.textContent || '').trim(),
      grid: grid ? {
        class_name: grid.className,
        direction: getComputedStyle(grid).direction,
        ag_ltr: grid.classList.contains('ag-ltr'),
        ag_rtl: grid.classList.contains('ag-rtl'),
      } : null,
      document_direction: getComputedStyle(document.body).direction,
      document_horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });
}

function assertNativeOwnership(facts) {
  assert(facts.pager_count === 1, `Expected exactly one native pager, got ${facts.pager_count}.`);
  assert(facts.custom_pager_count === 0, `Unexpected GPP pager/controller marker: ${facts.custom_pager_count}.`);
  assert(facts.direct_children.length === 2, `Expected native row/page summary siblings, got ${facts.direct_children.length}.`);
  assert(facts.direct_children[0].class_name.includes('ag-paging-row-summary-panel'), 'Native row summary DOM order changed.');
  assert(facts.direct_children[1].class_name.includes('ag-paging-page-summary-panel'), 'Native page summary DOM order changed.');
  assert(facts.grid?.ag_ltr === true && facts.grid?.ag_rtl === false && facts.grid?.direction === 'ltr', `GPP must not take over AG Grid RTL state: ${JSON.stringify(facts.grid)}`);
}

function assertPresentation(facts) {
  assert(facts.row_summary.opacity === '0', `Row-range summary is not visually suppressed: ${JSON.stringify(facts.row_summary)}`);
  assert(facts.row_summary.display !== 'none' && facts.row_summary.visibility !== 'hidden', 'Row-range node/allocation must remain native.');
  assert(facts.row_summary.aria_hidden === 'true', `Pinned host row-range accessibility state changed: ${JSON.stringify(facts.row_summary)}`);
  assert(facts.row_summary.text.length > 0, 'Native row-range text must remain host-generated in the DOM.');
  assert(facts.page_summary.opacity !== '0' && facts.page_summary.display === 'flex', 'Native page summary must remain visible.');
  assert(Boolean(facts.page_summary.font_weight), 'Native page-summary font ownership became unreadable.');
}

function assertControls(facts) {
  for (const [ref, control] of Object.entries(facts.controls)) {
    assert(control.tag === 'div', `Pinned native ${ref} control tag changed: ${control.tag}.`);
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

try {
  await login(page);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);

  await ensureNativePagerPage(page, pagerState, 1);
  const page1 = await nativeFacts();
  assertNativeOwnership(page1);
  assertPresentation(page1);
  assertControls(page1);
  assert(page1.current === '1' && Number(page1.total) >= 2, `Multiple-page precondition failed: ${JSON.stringify({ current: page1.current, total: page1.total })}`);
  assert(page1.controls.btFirst.ag_disabled && page1.controls.btPrevious.ag_disabled, 'First/Previous must be host-disabled on Page 1.');
  assert(!page1.controls.btNext.ag_disabled && !page1.controls.btLast.ag_disabled, 'Next/Last must be host-enabled on Page 1.');
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-pager-after-desktop-page1.png'), fullPage: true });

  await page.locator(`${ROOT} [ref="btPrevious"]`).focus();
  await page.keyboard.press('Tab');
  const tabTarget = await page.evaluate(() => document.activeElement?.getAttribute('ref') || null);
  assert(tabTarget === 'btNext', `Tab did not reach native Next from disabled Previous: ${tabTarget}.`);
  const next = page.locator(`${ROOT} [ref="btNext"]`);
  const nextFocus = await focusInfo(next);
  assert(focusVisible(nextFocus), `Native Next focus indicator is not visible: ${JSON.stringify(nextFocus)}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2');

  const page2 = await nativeFacts();
  assertNativeOwnership(page2);
  assertPresentation(page2);
  assert(page2.controls.btNext.ag_disabled && page2.controls.btLast.ag_disabled, 'Next/Last must be host-disabled on last page.');
  assert(!page2.controls.btFirst.ag_disabled && !page2.controls.btPrevious.ag_disabled, 'First/Previous must be host-enabled on last page.');
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-pager-after-desktop-page2-last.png'), fullPage: true });

  const previous = page.locator(`${ROOT} [ref="btPrevious"]`);
  const previousFocus = await focusInfo(previous);
  assert(focusVisible(previousFocus), `Native Previous focus indicator is not visible: ${JSON.stringify(previousFocus)}`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1');
  const roundTrip = await pagerState(page);
  assert(roundTrip.current === '1', `Native Page 1 → 2 → 1 round trip failed: ${JSON.stringify(roundTrip)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await ensureNativePagerPage(page, pagerState, 1);
  const mobile = await nativeFacts();
  const mobileContainment = await containment();
  assertNativeOwnership(mobile);
  assertPresentation(mobile);
  assertControls(mobile);
  assert(mobileContainment.all_children_contained, `Native pager clips at 390px: ${JSON.stringify(mobileContainment)}`);
  assert(mobileContainment.document_horizontal_overflow_px === 0, `Document overflows horizontally at 390px: ${JSON.stringify(mobileContainment)}`);
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-pager-after-mobile-390.png'), fullPage: true });

  await nativeSearch(page, 'WU21 Alpha Form');
  await page.waitForFunction(() => {
    const count = document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length;
    return count > 0 && count < 20;
  });
  const singlePage = await nativeFacts();
  const singleContainment = await containment();
  assertNativeOwnership(singlePage);
  assertPresentation(singlePage);
  assert(singlePage.current === '1' && singlePage.total === '1', `Single-page pager is incoherent: ${JSON.stringify({ current: singlePage.current, total: singlePage.total, text: singlePage.page_summary.text })}`);
  assert(Object.values(singlePage.controls).every(control => control.ag_disabled), 'All native navigation controls must be disabled in single-page state.');
  assert(singleContainment.all_children_contained && singleContainment.document_horizontal_overflow_px === 0, `Single-page layout is broken: ${JSON.stringify(singleContainment)}`);
  await nativeSearch(page, '');

  const q4 = JSON.parse(fs.readFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q4.json'), 'utf8'));
  const liveRefresh = {
    status: q4.status,
    page_state_remains_two: q4.flags?.page_state_remains_two,
    one_native_pager: q4.flags?.one_native_pager,
    update_observed: q4.flags?.update_observed,
    add_observed: q4.flags?.add_observed,
    remove_observed: q4.flags?.remove_observed,
    mobile_native_pager_round_trip: q4.flags?.mobile_native_pager_round_trip,
  };
  assert(liveRefresh.status === 'PASS'
    && liveRefresh.page_state_remains_two === true
    && liveRefresh.one_native_pager === true
    && liveRefresh.update_observed === true
    && liveRefresh.add_observed === true
    && liveRefresh.remove_observed === true,
  `Bounded Live Refresh evidence is insufficient: ${JSON.stringify(liveRefresh)}`);

  out = {
    ...out,
    result: 'NATIVE_PAGER_PRESENTATION_QUALIFIED',
    desktop_page_1: page1,
    desktop_page_2_last: page2,
    page_round_trip: { page_1_to_2_via_enter: true, page_2_to_1_via_space: true, final: roundTrip },
    keyboard: { tab_target: tabTarget, next_focus_visible: focusVisible(nextFocus), previous_focus_visible: focusVisible(previousFocus) },
    mobile_390: { facts: mobile, containment: mobileContainment },
    single_page: { facts: singlePage, containment: singleContainment },
    live_refresh_reused: liveRefresh,
  };
} catch (error) {
  failed = true;
  out = { ...out, execution_status: 'ERROR', result: 'NATIVE_PAGER_PRESENTATION_NEEDS_REPAIR', error: String(error?.stack || error).slice(0, 12000) };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-native-pager-repair-error.png'), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-native-pager-repair.json'), JSON.stringify(out, null, 2) + '\n');
  await browser.close();
}

if (failed) process.exit(1);
console.log('NATIVE_PAGER_PRESENTATION_QUALIFIED');
