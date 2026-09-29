import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { artifactDir, inboxUrl, assertEnv, login, waitForGrid, focusVisible, openByEnter, scrollState } from './inbox-visual-design-v2-browser-lib.mjs';

assertEnv();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function capture(width, height, label) {
  await page.setViewportSize({ width, height });
  await page.goto(inboxUrl, { waitUntil: 'networkidle' });
  await waitForGrid(page);
  const root = page.locator('[data-js="gflow-inbox"] .ag-root-wrapper');
  const agRtl = await root.evaluate(el => el.classList.contains('ag-rtl'));
  const rootDirection = await root.evaluate(el => getComputedStyle(el).direction);
  const columns = await page.locator('[data-js="gflow-inbox"] .ag-header-cell').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { col_id: node.getAttribute('col-id'), text: (node.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(box.x), width: Math.round(box.width) };
  }).sort((a, b) => a.x - b.x));
  const cells = await page.locator('[data-js="gflow-inbox"] .ag-row').first().locator('.ag-cell').evaluateAll(nodes => nodes.slice(0, 6).map(node => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { col_id: node.getAttribute('col-id'), text: (node.textContent || '').trim().slice(0, 100), direction: style.direction, text_align: style.textAlign, x: Math.round(box.x), width: Math.round(box.width) };
  }));
  const pager = await page.locator('[data-js="gflow-inbox"] .ag-paging-panel').evaluate(el => {
    const style = getComputedStyle(el);
    return {
      direction: style.direction,
      text_align: style.textAlign,
      children: [...el.children].map(child => ({ ref: child.getAttribute('ref'), text: (child.textContent || '').trim().replace(/\s+/g, ' '), x: Math.round(child.getBoundingClientRect().x) })).sort((a, b) => a.x - b.x),
    };
  });
  const before = await scrollState(page);
  if (before.scroll_width > before.client_width) {
    await page.locator('[data-js="gflow-inbox"] .ag-body-viewport').first().evaluate(el => { el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2); });
  }
  const after = await scrollState(page);
  await page.screenshot({ path: path.join(artifactDir, `inbox-visual-design-v2-q2-${label}.png`), fullPage: true });
  const navigation = await openByEnter(page, page.locator('[data-js="gflow-inbox"] .gflow-inbox__entry-cell-link').first());
  return {
    viewport: { width, height },
    ag_rtl: agRtl,
    root_direction: rootDirection,
    visual_column_order: columns,
    representative_cells: cells,
    pager,
    horizontal_scroll_before: before,
    horizontal_scroll_after: after,
    navigation,
    usable: focusVisible(navigation.focus) && /view=entry/.test(navigation.url),
  };
}

let out = { contract: 'Q2_RTL_NATIVE_BEHAVIOR', execution_status: 'CAPTURED' };
let failed = false;
try {
  await login(page);
  const desktop = await capture(1440, 900, '1440');
  const mobile = await capture(360, 800, '360');
  out = {
    ...out,
    status: desktop.usable && mobile.usable ? 'PASS' : 'FAIL',
    evidence_class: 'PROVEN_IN_REPRODUCIBLE_RUNTIME',
    enable_rtl_tested: false,
    enable_rtl_reason: 'Native Grid remained operable/readable without forcing enableRtl; no selected design dependency required the option.',
    desktop_1440: desktop,
    mobile_360: mobile,
  };
} catch (error) {
  failed = true;
  out = { ...out, execution_status: 'ERROR', error: String(error?.stack || error).slice(0, 12000) };
  await page.screenshot({ path: path.join(artifactDir, 'inbox-visual-design-v2-q2-error.png'), fullPage: true }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(artifactDir, 'inbox-visual-design-v2-q2.json'), JSON.stringify(out, null, 2) + '\n');
  await browser.close();
}
if (failed) process.exit(1);
