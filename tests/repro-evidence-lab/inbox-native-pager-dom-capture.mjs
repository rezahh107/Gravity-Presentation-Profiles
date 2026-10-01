import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, inboxUrl, assertEnv, login, waitForGrid } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function capturePager(page, viewport, screenshotName) {
  await page.setViewportSize(viewport);
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);

  const facts = await page.evaluate(() => {
    const rootSelector = '[data-js="gflow-inbox"]';
    const panel = document.querySelector(`${rootSelector} .ag-paging-panel`);
    if (!panel) return { pager_count: 0 };

    const rect = node => {
      const box = node.getBoundingClientRect();
      return {
        x: Math.round(box.x * 100) / 100,
        y: Math.round(box.y * 100) / 100,
        width: Math.round(box.width * 100) / 100,
        height: Math.round(box.height * 100) / 100,
        right: Math.round(box.right * 100) / 100,
        bottom: Math.round(box.bottom * 100) / 100,
      };
    };
    const describe = (node, domIndex = null) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        dom_index: domIndex,
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        class_name: typeof node.className === 'string' ? node.className : null,
        ref: node.getAttribute('ref'),
        role: node.getAttribute('role'),
        aria_label: node.getAttribute('aria-label'),
        aria_hidden: node.getAttribute('aria-hidden'),
        aria_live: node.getAttribute('aria-live'),
        aria_atomic: node.getAttribute('aria-atomic'),
        title: node.getAttribute('title'),
        text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
        tab_index_attribute: node.getAttribute('tabindex'),
        tab_index_property: node.tabIndex,
        disabled_property: 'disabled' in node ? Boolean(node.disabled) : null,
        ag_disabled: node.classList.contains('ag-disabled'),
        display: style.display,
        visibility: style.visibility,
        direction: style.direction,
        flex_direction: style.flexDirection,
        position: style.position,
        margin: style.margin,
        padding: style.padding,
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        rect: rect(node),
      };
    };

    const rowSummary = panel.querySelector('.ag-paging-row-summary-panel');
    const pageSummary = panel.querySelector('.ag-paging-page-summary-panel');
    const refs = ['btFirst', 'btPrevious', 'lbCurrent', 'lbTotal', 'btNext', 'btLast'];
    const refNodes = Object.fromEntries(refs.map(ref => [ref, describe(panel.querySelector(`[ref="${ref}"]`))]));
    const directChildren = [...panel.children].map((node, index) => describe(node, index));
    const pageSummaryChildren = pageSummary ? [...pageSummary.children].map((node, index) => describe(node, index)) : [];
    const allRefOrder = [...panel.querySelectorAll('[ref]')].map((node, index) => ({ index, ref: node.getAttribute('ref'), tag: node.tagName.toLowerCase(), text: (node.textContent || '').replace(/\s+/g, ' ').trim(), x: rect(node).x }));
    const visualRefOrderLeftToRight = [...allRefOrder].sort((a, b) => a.x - b.x).map(item => item.ref);
    const panelStyle = getComputedStyle(panel);
    const gridRoot = panel.closest('.ag-root-wrapper');

    return {
      pager_count: document.querySelectorAll(`${rootSelector} .ag-paging-panel`).length,
      gpp_custom_pager_count: document.querySelectorAll('[data-gpp-pagination], .gpp-pagination, .gpp-pager').length,
      panel: describe(panel),
      panel_overflow: { client_width: panel.clientWidth, scroll_width: panel.scrollWidth, client_height: panel.clientHeight, scroll_height: panel.scrollHeight },
      row_summary: describe(rowSummary),
      page_summary: describe(pageSummary),
      direct_children: directChildren,
      page_summary_children: pageSummaryChildren,
      refs: refNodes,
      ref_dom_order: allRefOrder.map(item => item.ref),
      ref_visual_order_left_to_right: visualRefOrderLeftToRight,
      document: {
        html_dir_attribute: document.documentElement.getAttribute('dir'),
        body_dir_attribute: document.body.getAttribute('dir'),
        body_direction: getComputedStyle(document.body).direction,
        pager_direction: panelStyle.direction,
        pager_flex_direction: panelStyle.flexDirection,
        grid_root_class: gridRoot?.className || null,
        grid_root_direction: gridRoot ? getComputedStyle(gridRoot).direction : null,
      },
      outer_html: panel.outerHTML,
    };
  });

  assert(facts.pager_count === 1, `Expected exactly one native pager, observed ${facts.pager_count}.`);
  assert(facts.gpp_custom_pager_count === 0, `Unexpected GPP custom pager marker detected: ${facts.gpp_custom_pager_count}.`);
  assert(facts.row_summary?.class_name?.includes('ag-paging-row-summary-panel'), 'Native row-range summary node is missing.');
  assert(facts.page_summary?.class_name?.includes('ag-paging-page-summary-panel'), 'Native page summary node is missing.');
  for (const ref of ['btFirst', 'btPrevious', 'lbCurrent', 'btNext', 'btLast']) {
    assert(Boolean(facts.refs?.[ref]), `Native pager ref ${ref} is missing.`);
  }

  await page.screenshot({ path: path.join(artifactDir, screenshotName), fullPage: true });
  return { viewport, ...facts };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let output;
let failed = false;

try {
  await login(page);
  const desktop = await capturePager(page, { width: 1440, height: 900 }, 'inbox-native-pager-dom-desktop.png');
  const mobile = await capturePager(page, { width: 390, height: 844 }, 'inbox-native-pager-dom-mobile-390.png');
  output = {
    execution_status: 'CAPTURED',
    evidence_class: 'AUTHENTIC_PINNED_RUNTIME_DOM',
    desktop,
    mobile,
  };
} catch (error) {
  failed = true;
  output = {
    execution_status: 'ERROR',
    error: String(error?.stack || error).slice(0, 12000),
  };
} finally {
  await browser.close();
  fs.writeFileSync(path.join(artifactDir, 'inbox-native-pager-dom.json'), JSON.stringify(output, null, 2) + '\n');
}

if (failed) process.exitCode = 1;
else console.log('INBOX_NATIVE_PAGER_DOM_CAPTURE_PASS');
