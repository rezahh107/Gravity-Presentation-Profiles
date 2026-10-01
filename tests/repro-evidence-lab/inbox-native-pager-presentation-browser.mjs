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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const selectorRoot = '[data-js="gflow-inbox"]';
const pagerSelector = `${selectorRoot} .ag-paging-panel`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function pagerDomSnapshot() {
  return page.locator(pagerSelector).first().evaluate(panel => {
    const rectOf = el => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x * 100) / 100,
        y: Math.round(r.y * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        left: Math.round(r.left * 100) / 100,
        right: Math.round(r.right * 100) / 100,
        top: Math.round(r.top * 100) / 100,
        bottom: Math.round(r.bottom * 100) / 100,
      };
    };
    const describe = el => {
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class_name: typeof el.className === 'string' ? el.className : null,
        ref: el.getAttribute('ref'),
        role: el.getAttribute('role'),
        aria_label: el.getAttribute('aria-label'),
        aria_hidden: el.getAttribute('aria-hidden'),
        aria_disabled: el.getAttribute('aria-disabled'),
        title: el.getAttribute('title'),
        tabindex: el.getAttribute('tabindex'),
        type: el.getAttribute('type'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        disabled_property: 'disabled' in el ? Boolean(el.disabled) : null,
        ag_disabled_class: el.classList.contains('ag-disabled'),
        rect: rectOf(el),
        computed: {
          display: style.display,
          position: style.position,
          visibility: style.visibility,
          direction: style.direction,
          flex_direction: style.flexDirection,
          flex_wrap: style.flexWrap,
          justify_content: style.justifyContent,
          align_items: style.alignItems,
          margin: style.margin,
          padding: style.padding,
          overflow: style.overflow,
          white_space: style.whiteSpace,
          outline: style.outline,
          box_shadow: style.boxShadow,
          opacity: style.opacity,
        },
      };
    };

    const directChildren = [...panel.children].map(describe);
    const refs = [...panel.querySelectorAll('[ref]')].map(describe);
    const rowSummary = panel.querySelector('.ag-paging-row-summary-panel');
    const pageSummary = panel.querySelector('.ag-paging-page-summary-panel');
    const clippingAncestors = [];
    for (let node = panel.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflow)
          || ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX)
          || ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY)) {
        clippingAncestors.push({
          tag: node.tagName.toLowerCase(),
          id: node.id || null,
          class_name: typeof node.className === 'string' ? node.className : null,
          overflow: style.overflow,
          overflow_x: style.overflowX,
          overflow_y: style.overflowY,
          rect: rectOf(node),
        });
      }
    }

    const grid = panel.closest('.ag-root-wrapper');
    return {
      panel: describe(panel),
      direct_children: directChildren,
      refs,
      row_summary: rowSummary ? describe(rowSummary) : null,
      page_summary: pageSummary ? describe(pageSummary) : null,
      page_summary_children: pageSummary ? [...pageSummary.children].map(describe) : [],
      clipping_ancestors: clippingAncestors,
      grid_accessibility: grid ? {
        role: grid.getAttribute('role'),
        aria_rowcount: grid.getAttribute('aria-rowcount'),
        aria_colcount: grid.getAttribute('aria-colcount'),
        direction: getComputedStyle(grid).direction,
        ag_rtl_class: grid.classList.contains('ag-rtl'),
        ag_ltr_class: grid.classList.contains('ag-ltr'),
      } : null,
    };
  });
}

async function controlState(ref) {
  const control = page.locator(`${selectorRoot} [ref="${ref}"]`).first();
  return control.evaluate(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      ref: el.getAttribute('ref'),
      tag: el.tagName.toLowerCase(),
      class_name: el.className,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      title: el.getAttribute('title'),
      aria_label: el.getAttribute('aria-label'),
      aria_disabled: el.getAttribute('aria-disabled'),
      tabindex: el.getAttribute('tabindex'),
      disabled_property: 'disabled' in el ? Boolean(el.disabled) : null,
      ag_disabled_class: el.classList.contains('ag-disabled'),
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
    };
  });
}

async function navState() {
  return Object.fromEntries(await Promise.all(
    ['btFirst', 'btPrevious', 'btNext', 'btLast'].map(async ref => [ref, await controlState(ref)]),
  ));
}

async function containment() {
  return page.locator(pagerSelector).first().evaluate(panel => {
    const p = panel.getBoundingClientRect();
    const visibleChildren = [...panel.children].filter(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    });
    const childRects = visibleChildren.map(el => {
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
      panel: { left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.width, height: p.height },
      visible_children: childRects,
      all_visible_children_contained: childRects.every(item => item.contained),
      document_horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });
}

const out = {
  contract: 'NATIVE_INBOX_PAGER_PRESENTATION',
  execution_status: 'CAPTURED',
  evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
};
let failed = false;

try {
  await login(page);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);

  assert(await page.locator(pagerSelector).count() === 1, 'Expected exactly one native AG Grid pager.');
  const preflight = await ensureNativePagerPage(page, pagerState, 1);
  const firstPageDom = await pagerDomSnapshot();
  const firstPageState = await pagerState(page);
  const firstPageNav = await navState();
  await page.screenshot({ path: path.join(artifactDir, 'inbox-native-pager-before-desktop-page1.png'), fullPage: true });

  assert(firstPageState.current === '1', `Expected native Page 1, observed ${firstPageState.current}.`);
  assert(firstPageNav.btFirst.ag_disabled_class && firstPageNav.btPrevious.ag_disabled_class, 'Native First/Previous must be disabled on Page 1.');
  assert(!firstPageNav.btNext.ag_disabled_class && !firstPageNav.btLast.ag_disabled_class, 'Native Next/Last must be enabled on Page 1.');

  const next = page.locator(`${selectorRoot} [ref="btNext"]`).first();
  const nextFocus = await focusInfo(next);
  assert(focusVisible(nextFocus), `Native Next focus indicator is not visible: ${JSON.stringify(nextFocus)}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '2');
  const secondPageState = await pagerState(page);
  const secondPageNav = await navState();
  await page.screenshot({ path: path.join(artifactDir, 'inbox-native-pager-before-desktop-page2.png'), fullPage: true });
  assert(secondPageNav.btNext.ag_disabled_class && secondPageNav.btLast.ag_disabled_class, 'Native Next/Last must be disabled on the last page.');
  assert(!secondPageNav.btFirst.ag_disabled_class && !secondPageNav.btPrevious.ag_disabled_class, 'Native First/Previous must be enabled on the last page.');

  const previous = page.locator(`${selectorRoot} [ref="btPrevious"]`).first();
  const previousFocus = await focusInfo(previous);
  assert(focusVisible(previousFocus), `Native Previous focus indicator is not visible: ${JSON.stringify(previousFocus)}`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('[data-js="gflow-inbox"] [ref="lbCurrent"]')?.textContent?.trim() === '1');
  const roundTrip = await pagerState(page);
  assert(roundTrip.current === '1', `Native keyboard round trip did not return to Page 1: ${JSON.stringify(roundTrip)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await ensureNativePagerPage(page, pagerState, 1);
  const mobileContainment = await containment();
  const mobileState = await pagerState(page);
  await page.screenshot({ path: path.join(artifactDir, 'inbox-native-pager-before-mobile-390.png'), fullPage: true });
  assert(mobileContainment.all_visible_children_contained, `Native pager child clipping at 390px: ${JSON.stringify(mobileContainment)}`);
  assert(mobileContainment.document_horizontal_overflow_px === 0, `Document overflows horizontally at 390px: ${JSON.stringify(mobileContainment)}`);

  await nativeSearch(page, 'WU21 Alpha Form');
  await page.waitForFunction(() => document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length > 0
    && document.querySelectorAll('[data-js="gflow-inbox"] .ag-center-cols-container .ag-row').length < 20);
  const singlePageState = await pagerState(page);
  const singlePageNav = await navState();
  const totalText = (await page.locator(`${selectorRoot} [ref="lbTotal"]`).first().innerText()).trim();
  assert(singlePageState.current === '1' && totalText === '1', `Filtered single-page pager is incoherent: ${JSON.stringify({ singlePageState, totalText })}`);
  assert(Object.values(singlePageNav).every(item => item.ag_disabled_class), `All native navigation controls must be disabled with one page: ${JSON.stringify(singlePageNav)}`);
  await nativeSearch(page, '');

  out.dom = firstPageDom;
  out.desktop = {
    page_1: { state: firstPageState, navigation: firstPageNav },
    page_2_last: { state: secondPageState, navigation: secondPageNav },
    round_trip_final: roundTrip,
    keyboard: {
      next_enter_focus_visible: focusVisible(nextFocus),
      previous_space_focus_visible: focusVisible(previousFocus),
    },
    preflight,
  };
  out.mobile_390 = { state: mobileState, containment: mobileContainment };
  out.single_page = { state: singlePageState, total_pages_text: totalText, navigation: singlePageNav };
} catch (error) {
  failed = true;
  out.execution_status = 'ERROR';
  out.error = String(error?.stack || error).slice(0, 12000);
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-native-pager-presentation.json'), JSON.stringify(out, null, 2) + '\n');
  await browser.close();
}

if (failed) process.exit(1);
console.log('INBOX_NATIVE_PAGER_PRESENTATION_CAPTURE_PASS');
